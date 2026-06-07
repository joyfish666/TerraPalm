import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

/**
 * 手部追踪器
 * 使用 MediaPipe Tasks Vision API 进行手部关键点检测
 * 支持同时检测双手，并区分左右手
 */
export class HandTracker {
    /**
     * @param {HTMLVideoElement} videoElement - 视频元素
     * @param {Function} onResults - 检测结果回调，参数为 { leftHand, rightHand, rawResults }
     */
    constructor(videoElement, onResults) {
        this.videoElement = videoElement;
        this.onResults = onResults;
        this.isRunning = false;
        this.stream = null;
        this.handLandmarker = null;
        this.isModelReady = false;

        console.log('[HandTracker] 初始化 MediaPipe Tasks Vision...');
    }

    /**
     * 初始化 MediaPipe HandLandmarker
     * 加载 WASM 运行时和模型文件
     */
    async _initModel() {
        try {
            console.log('[HandTracker] 加载 WASM 运行时...');

            // 加载 WASM 运行时
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
            );

            console.log('[HandTracker] WASM 运行时加载完成');

            // 尝试使用 GPU，如果失败则回退到 CPU
            let delegate = 'GPU';
            try {
                console.log('[HandTracker] 尝试创建 HandLandmarker (GPU)...');
                this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                        delegate: 'GPU'
                    },
                    runningMode: 'VIDEO',
                    numHands: 2,
                    minHandDetectionConfidence: 0.5,
                    minHandPresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                console.log('[HandTracker] GPU 模式创建成功');
            } catch (gpuError) {
                console.warn('[HandTracker] GPU 模式失败，尝试 CPU 模式:', gpuError.message);
                delegate = 'CPU';
                this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                        delegate: 'CPU'
                    },
                    runningMode: 'VIDEO',
                    numHands: 2,
                    minHandDetectionConfidence: 0.5,
                    minHandPresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                console.log('[HandTracker] CPU 模式创建成功');
            }

            this.isModelReady = true;
            console.log(`[HandTracker] 模型已就绪 (${delegate} 模式)`);
        } catch (error) {
            console.error('[HandTracker] 模型初始化失败:', error);
            throw error;
        }
    }

    /**
     * 处理检测结果
     * @param {Object} results - HandLandmarker 检测结果
     */
    _processResults(results) {
        let leftHand = null;
        let rightHand = null;

        if (results.landmarks && results.landmarks.length > 0) {
            // 输出检测到的手部数量和详情
            console.log(`[HandTracker] 检测到 ${results.landmarks.length} 只手`);

            for (let i = 0; i < results.landmarks.length; i++) {
                const landmarks = results.landmarks[i];
                const handedness = results.handednesses[i];

                // 获取手部类别（Left 或 Right）
                const label = handedness[0].categoryName;
                const score = handedness[0].score;

                console.log(`[HandTracker] 手 ${i}: 类别=${label}, 置信度=${score.toFixed(3)}, 手腕位置=(${landmarks[0].x.toFixed(3)}, ${landmarks[0].y.toFixed(3)})`);

                // 摄像头镜像：MediaPipe 标签的 "Left" 实际是用户的右手
                if (label === 'Left') {
                    rightHand = landmarks;
                    console.log(`[HandTracker] → 分配为右手（镜像）`);
                } else {
                    leftHand = landmarks;
                    console.log(`[HandTracker] → 分配为左手（镜像）`);
                }
            }
        } else {
            // 每100帧输出一次未检测日志，避免日志过多
            if (this._noHandCounter === undefined) this._noHandCounter = 0;
            this._noHandCounter++;
            if (this._noHandCounter % 100 === 0) {
                console.log(`[HandTracker] 未检测到手部 (${this._noHandCounter} 帧)`);
            }
        }

        this.onResults({
            leftHand,
            rightHand,
            rawResults: results
        });
    }

    /**
     * 启动摄像头和手部检测
     * @returns {Promise<void>}
     */
    async start() {
        if (this.isRunning) return;

        try {
            // 先初始化模型
            console.log('[HandTracker] 开始初始化模型...');
            await this._initModel();
            console.log('[HandTracker] 模型初始化完成');

            console.log('[HandTracker] 请求摄像头权限...');

            // 获取摄像头流
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });

            console.log('[HandTracker] 摄像头权限已获取');

            // 设置视频源
            this.videoElement.srcObject = this.stream;

            // 等待视频就绪
            await new Promise((resolve, reject) => {
                this.videoElement.onloadedmetadata = () => {
                    console.log('[HandTracker] 视频元数据已加载，尺寸:', this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);
                    resolve();
                };
                this.videoElement.onerror = (e) => {
                    console.error('[HandTracker] 视频加载错误:', e);
                    reject(e);
                };
            });

            // 播放视频
            await this.videoElement.play();
            console.log('[HandTracker] 视频已开始播放');

            this.isRunning = true;

            // 开始处理帧
            this._processFrame();

            console.log('[HandTracker] 摄像头已启动，开始检测手势');
        } catch (error) {
            console.error('[HandTracker] 启动失败:', error);
            throw error;
        }
    }

    /**
     * 处理视频帧
     * 使用 requestAnimationFrame 循环处理每一帧
     */
    _processFrame() {
        if (!this.isRunning || !this.isModelReady) return;

        // 确保视频已经准备好
        if (this.videoElement.readyState < 2) {
            requestAnimationFrame(() => this._processFrame());
            return;
        }

        try {
            // 使用 HandLandmarker 检测当前帧
            const results = this.handLandmarker.detectForVideo(
                this.videoElement,
                performance.now()
            );

            // 处理检测结果
            this._processResults(results);

            // 请求下一帧
            requestAnimationFrame(() => this._processFrame());
        } catch (err) {
            console.error('[HandTracker] 帧处理错误:', err);
            requestAnimationFrame(() => this._processFrame());
        }
    }

    /**
     * 停止摄像头和检测
     */
    stop() {
        this.isRunning = false;

        // 停止摄像头流
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // 清空视频源
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }

        // 关闭 HandLandmarker
        if (this.handLandmarker) {
            this.handLandmarker.close();
            this.handLandmarker = null;
        }

        console.log('[HandTracker] 摄像头已停止');
    }
}

import { Hands } from '@mediapipe/hands';

/**
 * 手部追踪器
 * 封装 MediaPipe Hands，提供摄像头初始化和手部关键点检测
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
        this.isModelReady = false;

        console.log('[HandTracker] 初始化 MediaPipe Hands...');

        // 初始化 MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                const url = `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                return url;
            }
        });

        // 配置检测参数
        this.hands.setOptions({
            maxNumHands: 2,              // 最多检测两只手
            modelComplexity: 1,          // 模型复杂度（0或1）
            minDetectionConfidence: 0.5, // 检测置信度阈值
            minTrackingConfidence: 0.5   // 最低追踪置信度
        });

        // 绑定结果处理回调
        this.hands.onResults(this._processResults.bind(this));

        console.log('[HandTracker] 初始化完成，等待模型加载...');
    }

    /**
     * 处理 MediaPipe 检测结果
     * 注意：摄像头画面是镜像的，MediaPipe 的左右标签需要反转
     * @param {Object} results - MediaPipe 原始结果
     */
    _processResults(results) {
        let leftHand = null;
        let rightHand = null;

        if (!this.isModelReady) {
            this.isModelReady = true;
            console.log('[HandTracker] 模型已就绪，开始检测手势');
        }

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const landmarks = results.multiHandLandmarks[i];
                const handedness = results.multiHandedness[i];

                // 摄像头镜像：MediaPipe 标签的 "Left" 实际是用户的右手
                if (handedness.label === 'Left') {
                    rightHand = landmarks;
                } else {
                    leftHand = landmarks;
                }
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
            console.log('[HandTracker] 请求摄像头权限...');

            // 直接使用 getUserMedia 获取摄像头流
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
            console.error('[HandTracker] 摄像头启动失败:', error);
            throw error;
        }
    }

    /**
     * 处理视频帧
     * 使用 requestAnimationFrame 循环处理每一帧
     */
    _processFrame() {
        if (!this.isRunning) return;

        // 确保视频已经准备好
        if (this.videoElement.readyState < 2) {
            requestAnimationFrame(() => this._processFrame());
            return;
        }

        try {
            // 发送当前帧到 MediaPipe
            this.hands.send({ image: this.videoElement }).then(() => {
                // 请求下一帧
                requestAnimationFrame(() => this._processFrame());
            }).catch(err => {
                console.error('[HandTracker] 帧处理错误:', err);
                // 即使出错也继续下一帧
                requestAnimationFrame(() => this._processFrame());
            });
        } catch (err) {
            console.error('[HandTracker] 帧处理异常:', err);
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

        console.log('[HandTracker] 摄像头已停止');
    }
}

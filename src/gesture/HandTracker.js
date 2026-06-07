import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';

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
        this.camera = null;
        this.isRunning = false;

        // 初始化 MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        // 配置检测参数
        this.hands.setOptions({
            maxNumHands: 2,              // 最多检测两只手
            modelComplexity: 1,          // 模型复杂度（0或1）
            minDetectionConfidence: 0.7, // 最低检测置信度
            minTrackingConfidence: 0.5   // 最低追踪置信度
        });

        // 绑定结果处理回调
        this.hands.onResults(this._processResults.bind(this));
    }

    /**
     * 处理 MediaPipe 检测结果
     * 注意：摄像头画面是镜像的，MediaPipe 的左右标签需要反转
     * @param {Object} results - MediaPipe 原始结果
     */
    _processResults(results) {
        let leftHand = null;
        let rightHand = null;

        if (results.multiHandLandmarks && results.multiHandedness) {
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
            this.camera = new Camera(this.videoElement, {
                onFrame: async () => {
                    await this.hands.send({ image: this.videoElement });
                },
                width: 640,
                height: 480
            });

            await this.camera.start();
            this.isRunning = true;
            console.log('[HandTracker] 摄像头已启动');
        } catch (error) {
            console.error('[HandTracker] 摄像头启动失败:', error);
            throw error;
        }
    }

    /**
     * 停止摄像头和检测
     */
    stop() {
        if (this.camera) {
            this.camera.stop();
            this.isRunning = false;
            console.log('[HandTracker] 摄像头已停止');
        }
    }
}

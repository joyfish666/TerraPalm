import { Smoothing } from '../utils/Smoothing.js';

/**
 * 手势映射器
 * 将 MediaPipe 手部关键点转换为3D场景控制指令
 *
 * 控制模式：速度控制（而非位置增量控制）
 * - 手移动时，画面跟随移动
 * - 手停止/复位时，画面停止（不回退）
 *
 * 控制映射：
 * - 左手张开 + 移动 → 平移（panX, panZ）
 * - 右手张开 + 左右摆动 → 旋转（rotateY）
 * - 右手捏合/张开 → 缩放（zoom）
 * - 握拳 → 暂停对应手的控制
 */
export class GestureMapper {
    constructor() {
        // 位置历史（用于计算速度，保留最近几帧）
        this.leftPosHistory = [];
        this.rightPosHistory = [];
        this.pinchDistHistory = [];
        this.historySize = 5; // 保留最近5帧

        // 累积的控制值
        this.panX = 0;
        this.panZ = 0;
        this.rotateY = 0;
        this.zoom = 0;

        // 平滑器
        this.panSmoother = new Smoothing(0.15);
        this.rotateSmoother = new Smoothing(0.12);
        this.zoomSmoother = new Smoothing(0.10);

        // 灵敏度配置
        this.panSensitivity = 8;
        this.rotateSensitivity = 4;
        this.zoomSensitivity = 10;

        // 速度阈值（低于此值忽略，防止漂移）
        this.velocityThreshold = 0.001;

        // 调试计数器
        this.debugCounter = 0;
    }

    /**
     * 判断手掌是否张开
     * @param {Array} landmarks - 21个手部关键点
     * @returns {boolean}
     */
    _isOpenPalm(landmarks) {
        const tips = [8, 12, 16, 20];
        const mcps = [5, 9, 13, 17];

        let extendedCount = 0;
        for (let i = 0; i < tips.length; i++) {
            if (landmarks[tips[i]].y < landmarks[mcps[i]].y) {
                extendedCount++;
            }
        }

        return extendedCount >= 3;
    }

    /**
     * 计算捏合距离
     * @param {Array} landmarks - 手部关键点
     * @returns {number}
     */
    _getPinchDistance(landmarks) {
        const thumb = landmarks[4];
        const index = landmarks[8];
        const dx = thumb.x - index.x;
        const dy = thumb.y - index.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 获取手掌中心位置
     * @param {Array} landmarks - 手部关键点
     * @returns {{ x: number, y: number }}
     */
    _getPalmCenter(landmarks) {
        return {
            x: (landmarks[0].x + landmarks[9].x) / 2,
            y: (landmarks[0].y + landmarks[9].y) / 2
        };
    }

    /**
     * 更新位置历史
     * @param {Array} history - 历史数组
     * @param {Object} pos - 新位置
     */
    _updateHistory(history, pos) {
        history.push(pos);
        if (history.length > this.historySize) {
            history.shift();
        }
    }

    /**
     * 计算平均速度
     * 使用最近几帧的位置变化计算平均速度
     * @param {Array} history - 位置历史
     * @returns {{ vx: number, vy: number }}
     */
    _calculateVelocity(history) {
        if (history.length < 2) {
            return { vx: 0, vy: 0 };
        }

        let totalDx = 0;
        let totalDy = 0;
        let count = 0;

        // 计算最近几帧的平均速度
        for (let i = 1; i < history.length; i++) {
            totalDx += history[i].x - history[i - 1].x;
            totalDy += history[i].y - history[i - 1].y;
            count++;
        }

        return {
            vx: totalDx / count,
            vy: totalDy / count
        };
    }

    /**
     * 计算距离的平均变化速度
     * @param {Array} history - 距离历史
     * @returns {number}
     */
    _calculateDistVelocity(history) {
        if (history.length < 2) {
            return 0;
        }

        let totalDelta = 0;
        let count = 0;

        for (let i = 1; i < history.length; i++) {
            totalDelta += history[i] - history[i - 1];
            count++;
        }

        return totalDelta / count;
    }

    /**
     * 更新控制状态
     * @param {Array|null} leftHand - 左手关键点
     * @param {Array|null} rightHand - 右手关键点
     * @returns {{ panX: number, panZ: number, rotateY: number, zoom: number }}
     */
    update(leftHand, rightHand) {
        let rawPanX = 0;
        let rawPanZ = 0;
        let rawRotateY = 0;
        let rawZoom = 0;

        this.debugCounter++;

        // === 左手处理：平移控制 ===
        if (leftHand) {
            const isOpen = this._isOpenPalm(leftHand);

            if (isOpen) {
                const pos = this._getPalmCenter(leftHand);
                this._updateHistory(this.leftPosHistory, pos);

                // 计算速度
                const velocity = this._calculateVelocity(this.leftPosHistory);

                // 只有速度超过阈值才响应
                if (Math.abs(velocity.vx) > this.velocityThreshold || Math.abs(velocity.vy) > this.velocityThreshold) {
                    rawPanX = -velocity.vx * this.panSensitivity; // 反向，使拖拽更自然
                    rawPanZ = -velocity.vy * this.panSensitivity;
                }

                // 调试日志
                if (this.debugCounter % 60 === 0) {
                    console.log(`[GestureMapper] 左手: 速度=(${velocity.vx.toFixed(4)}, ${velocity.vy.toFixed(4)})`);
                }
            } else {
                // 手握拳，清空历史
                this.leftPosHistory = [];
            }
        } else {
            // 手部丢失，清空历史
            this.leftPosHistory = [];
        }

        // === 右手处理：旋转和缩放控制 ===
        if (rightHand) {
            const isOpen = this._isOpenPalm(rightHand);

            if (isOpen) {
                const pos = this._getPalmCenter(rightHand);
                this._updateHistory(this.rightPosHistory, pos);

                // 计算旋转速度
                const velocity = this._calculateVelocity(this.rightPosHistory);

                if (Math.abs(velocity.vx) > this.velocityThreshold) {
                    rawRotateY = -velocity.vx * this.rotateSensitivity;
                }

                // 调试日志
                if (this.debugCounter % 60 === 0) {
                    console.log(`[GestureMapper] 右手: 旋转速度=${velocity.vx.toFixed(4)}`);
                }
            } else {
                this.rightPosHistory = [];
            }

            // 缩放控制（捏合手势）
            const pinchDist = this._getPinchDistance(rightHand);
            this._updateHistory(this.pinchDistHistory, pinchDist);

            const pinchVelocity = this._calculateDistVelocity(this.pinchDistHistory);

            if (Math.abs(pinchVelocity) > 0.002) {
                rawZoom = -pinchVelocity * this.zoomSensitivity;
            }

            // 调试日志
            if (this.debugCounter % 60 === 0) {
                console.log(`[GestureMapper] 捏合: 距离=${pinchDist.toFixed(3)}, 速度=${pinchVelocity.toFixed(4)}`);
            }
        } else {
            // 手部丢失，清空历史
            this.rightPosHistory = [];
            this.pinchDistHistory = [];
        }

        // 应用平滑
        this.panX = this.panSmoother.smooth(this.panX, rawPanX);
        this.panZ = this.panSmoother.smooth(this.panZ, rawPanZ);
        this.rotateY = this.rotateSmoother.smooth(this.rotateY, rawRotateY);
        this.zoom = this.zoomSmoother.smooth(this.zoom, rawZoom);

        return {
            panX: this.panX,
            panZ: this.panZ,
            rotateY: this.rotateY,
            zoom: this.zoom
        };
    }

    /**
     * 重置所有控制状态
     */
    reset() {
        this.leftPosHistory = [];
        this.rightPosHistory = [];
        this.pinchDistHistory = [];
        this.panX = 0;
        this.panZ = 0;
        this.rotateY = 0;
        this.zoom = 0;
    }
}

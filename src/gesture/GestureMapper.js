import { Smoothing } from '../utils/Smoothing.js';

/**
 * 手势映射器
 * 将 MediaPipe 手部关键点转换为3D场景控制指令
 *
 * 控制模式：速度控制（而非位置增量控制）
 * - 手移动时，画面跟随移动
 * - 手停止/复位时，画面停止（不回退）
 *
 * 缩放控制：状态机模式
 * - 捏合状态：距离 < 0.06，持续捏合 = 缩小
 * - 死区：距离 0.06-0.12，忽略（防止松手误触）
 * - 张开状态：距离 > 0.12，持续张开 = 放大
 * - 状态切换时忽略（防止松手变放大）
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
        this.historySize = 5;

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
        this.zoomSensitivity = 8;

        // 速度阈值（低于此值忽略，防止漂移）
        this.velocityThreshold = 0.001;

        // ===== 缩放状态机 =====
        this.pinchState = 'NEUTRAL'; // 'NEUTRAL' | 'PINCHING' | 'SPREADING'
        this.prevPinchDist = null;
        this.pinchDistHistory = [];

        // 捏合/张开阈值
        this.pinchThreshold = 0.06;   // 低于此值 = 捏合状态
        this.spreadThreshold = 0.12;  // 高于此值 = 张开状态

        // 状态切换冷却（防止快速切换误触）
        this.lastStateChangeTime = 0;
        this.stateChangeCooldown = 300; // 毫秒

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
     * 更新缩放状态机
     * @param {number} pinchDist - 当前捏合距离
     * @returns {number} 缩放值（正值放大，负值缩小，0无操作）
     */
    _updateZoomState(pinchDist) {
        const now = performance.now();
        let rawZoom = 0;

        // 确定当前距离属于哪个状态
        let newState = this.pinchState;
        if (pinchDist < this.pinchThreshold) {
            newState = 'PINCHING';
        } else if (pinchDist > this.spreadThreshold) {
            newState = 'SPREADING';
        } else {
            newState = 'NEUTRAL';
        }

        // 检查状态是否变化
        if (newState !== this.pinchState) {
            // 状态变化，检查冷却时间
            if (now - this.lastStateChangeTime > this.stateChangeCooldown) {
                this.pinchState = newState;
                this.lastStateChangeTime = now;
                // 状态切换时清空历史，避免旧数据影响
                this.pinchDistHistory = [];

                if (this.debugCounter % 60 === 0) {
                    console.log(`[GestureMapper] 缩放状态切换: → ${newState}`);
                }
            }
        } else {
            // 状态未变化，计算缩放
            this.pinchDistHistory.push(pinchDist);
            if (this.pinchDistHistory.length > this.historySize) {
                this.pinchDistHistory.shift();
            }

            // 计算距离变化速度
            if (this.pinchDistHistory.length >= 2) {
                let totalDelta = 0;
                for (let i = 1; i < this.pinchDistHistory.length; i++) {
                    totalDelta += this.pinchDistHistory[i] - this.pinchDistHistory[i - 1];
                }
                const velocity = totalDelta / (this.pinchDistHistory.length - 1);

                // 根据状态和速度计算缩放
                if (this.pinchState === 'PINCHING') {
                    // 捏合状态：距离减小 = 缩小
                    if (velocity < -0.001) {
                        rawZoom = velocity * this.zoomSensitivity;
                    }
                } else if (this.pinchState === 'SPREADING') {
                    // 张开状态：距离增大 = 放大
                    if (velocity > 0.001) {
                        rawZoom = velocity * this.zoomSensitivity;
                    }
                }
                // NEUTRAL 状态：忽略
            }
        }

        return rawZoom;
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

                const velocity = this._calculateVelocity(this.leftPosHistory);

                if (Math.abs(velocity.vx) > this.velocityThreshold || Math.abs(velocity.vy) > this.velocityThreshold) {
                    rawPanX = -velocity.vx * this.panSensitivity;
                    rawPanZ = -velocity.vy * this.panSensitivity;
                }

                if (this.debugCounter % 60 === 0) {
                    console.log(`[GestureMapper] 左手: 速度=(${velocity.vx.toFixed(4)}, ${velocity.vy.toFixed(4)})`);
                }
            } else {
                this.leftPosHistory = [];
            }
        } else {
            this.leftPosHistory = [];
        }

        // === 右手处理：旋转和缩放控制 ===
        if (rightHand) {
            const isOpen = this._isOpenPalm(rightHand);

            // 旋转控制（只有张开手掌才响应）
            if (isOpen) {
                const pos = this._getPalmCenter(rightHand);
                this._updateHistory(this.rightPosHistory, pos);

                const velocity = this._calculateVelocity(this.rightPosHistory);

                if (Math.abs(velocity.vx) > this.velocityThreshold) {
                    rawRotateY = -velocity.vx * this.rotateSensitivity;
                }

                if (this.debugCounter % 60 === 0) {
                    console.log(`[GestureMapper] 右手: 旋转速度=${velocity.vx.toFixed(4)}`);
                }
            } else {
                this.rightPosHistory = [];
            }

            // 缩放控制（状态机模式）
            const pinchDist = this._getPinchDistance(rightHand);
            rawZoom = this._updateZoomState(pinchDist);

            if (this.debugCounter % 60 === 0) {
                console.log(`[GestureMapper] 捏合: 距离=${pinchDist.toFixed(3)}, 状态=${this.pinchState}`);
            }
        } else {
            // 手部丢失，重置状态
            this.rightPosHistory = [];
            this.pinchDistHistory = [];
            this.pinchState = 'NEUTRAL';
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
        this.pinchState = 'NEUTRAL';
        this.prevPinchDist = null;
        this.panX = 0;
        this.panZ = 0;
        this.rotateY = 0;
        this.zoom = 0;
    }
}

import { Smoothing } from '../utils/Smoothing.js';

/**
 * 手势映射器 v3
 *
 * 控制方案：
 * - 左手张开移动 → 地形平移
 * - 左手握拳 → 放大（优先于平移）
 * - 右手张开左右移动 → 绕中心轴旋转
 * - 右手握拳 → 缩小（优先于旋转）
 *
 * 优先级：缩放 > 平移/旋转
 */
export class GestureMapper {
    constructor() {
        // 位置历史（用于计算速度）
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
        this.zoomSmoother = new Smoothing(0.08);

        // 灵敏度
        this.panSensitivity = 8;
        this.rotateSensitivity = 6;
        this.zoomSensitivity = 0.02;

        // 速度阈值
        this.velocityThreshold = 0.0005;

        // 状态追踪（用于条件日志）
        this.prevLeftOpen = null;
        this.prevRightOpen = null;
        this.prevHasLeft = null;
        this.prevHasRight = null;
        this.prevPanActive = false;
        this.prevRotateActive = false;
        this.prevZoomInActive = false;
        this.prevZoomOutActive = false;
    }

    /**
     * 判断手掌是否张开
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
     * 获取手掌中心位置
     */
    _getPalmCenter(landmarks) {
        return {
            x: (landmarks[0].x + landmarks[9].x) / 2,
            y: (landmarks[0].y + landmarks[9].y) / 2
        };
    }

    /**
     * 更新位置历史
     */
    _updateHistory(history, pos) {
        history.push(pos);
        if (history.length > this.historySize) {
            history.shift();
        }
    }

    /**
     * 计算平均速度
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
     * 更新控制状态
     */
    update(leftHand, rightHand) {
        let rawPanX = 0;
        let rawPanZ = 0;
        let rawRotateY = 0;
        let rawZoom = 0;

        const hasLeftHand = leftHand !== null;
        const hasRightHand = rightHand !== null;

        // === 手部检测状态变化日志 ===
        if (hasLeftHand !== this.prevHasLeft) {
            console.log(`[Hand] 左手${hasLeftHand ? ' 👋 检测到' : ' ❌ 丢失'}`);
            this.prevHasLeft = hasLeftHand;
        }
        if (hasRightHand !== this.prevHasRight) {
            console.log(`[Hand] 右手${hasRightHand ? ' 👋 检测到' : ' ❌ 丢失'}`);
            this.prevHasRight = hasRightHand;
        }

        // ===== 左手处理 =====
        if (hasLeftHand) {
            const isOpen = this._isOpenPalm(leftHand);

            // 手掌状态变化日志
            if (isOpen !== this.prevLeftOpen) {
                console.log(`[Left] 手掌${isOpen ? ' ✋ 张开' : ' ✊ 握拳'}`);
                this.prevLeftOpen = isOpen;
            }

            if (isOpen) {
                // 张开 → 平移控制
                const pos = this._getPalmCenter(leftHand);
                this._updateHistory(this.leftPosHistory, pos);

                const velocity = this._calculateVelocity(this.leftPosHistory);

                if (Math.abs(velocity.vx) > this.velocityThreshold || Math.abs(velocity.vy) > this.velocityThreshold) {
                    rawPanX = -velocity.vx * this.panSensitivity;
                    rawPanZ = -velocity.vy * this.panSensitivity;

                    if (!this.prevPanActive) {
                        console.log(`[Left] ✅ 平移开始`);
                        this.prevPanActive = true;
                    }
                } else {
                    if (this.prevPanActive) {
                        console.log(`[Left] ⏸️ 平移停止`);
                        this.prevPanActive = false;
                    }
                }

                // 重置放大状态
                if (this.prevZoomInActive) {
                    console.log(`[Zoom] 📈 放大结束`);
                    this.prevZoomInActive = false;
                }
            } else {
                // 握拳 → 放大
                this.leftPosHistory = [];
                rawZoom = this.zoomSensitivity;

                if (!this.prevZoomInActive) {
                    console.log(`[Zoom] 📈 放大开始（左手握拳）`);
                    this.prevZoomInActive = true;
                }

                // 重置平移状态
                if (this.prevPanActive) {
                    this.prevPanActive = false;
                }
            }
        } else {
            this.leftPosHistory = [];
            this.prevLeftOpen = null;
            if (this.prevPanActive) {
                this.prevPanActive = false;
            }
            if (this.prevZoomInActive) {
                console.log(`[Zoom] 📈 放大结束（左手丢失）`);
                this.prevZoomInActive = false;
            }
        }

        // ===== 右手处理 =====
        if (hasRightHand) {
            const isOpen = this._isOpenPalm(rightHand);

            // 手掌状态变化日志
            if (isOpen !== this.prevRightOpen) {
                console.log(`[Right] 手掌${isOpen ? ' ✋ 张开' : ' ✊ 握拳'}`);
                this.prevRightOpen = isOpen;
            }

            if (isOpen) {
                // 张开 → 旋转控制
                const pos = this._getPalmCenter(rightHand);
                this._updateHistory(this.rightPosHistory, pos);

                const velocity = this._calculateVelocity(this.rightPosHistory);

                if (Math.abs(velocity.vx) > this.velocityThreshold) {
                    rawRotateY = -velocity.vx * this.rotateSensitivity;

                    if (!this.prevRotateActive) {
                        console.log(`[Right] ✅ 旋转开始`);
                        this.prevRotateActive = true;
                    }
                } else {
                    if (this.prevRotateActive) {
                        console.log(`[Right] ⏸️ 旋转停止`);
                        this.prevRotateActive = false;
                    }
                }

                // 重置缩小状态
                if (this.prevZoomOutActive) {
                    console.log(`[Zoom] 📉 缩小结束`);
                    this.prevZoomOutActive = false;
                }
            } else {
                // 握拳 → 缩小
                this.rightPosHistory = [];
                rawZoom = -this.zoomSensitivity;

                if (!this.prevZoomOutActive) {
                    console.log(`[Zoom] 📉 缩小开始（右手握拳）`);
                    this.prevZoomOutActive = true;
                }

                // 重置旋转状态
                if (this.prevRotateActive) {
                    this.prevRotateActive = false;
                }
            }
        } else {
            this.rightPosHistory = [];
            this.prevRightOpen = null;
            if (this.prevRotateActive) {
                this.prevRotateActive = false;
            }
            if (this.prevZoomOutActive) {
                console.log(`[Zoom] 📉 缩小结束（右手丢失）`);
                this.prevZoomOutActive = false;
            }
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
        this.panX = 0;
        this.panZ = 0;
        this.rotateY = 0;
        this.zoom = 0;

        this.prevLeftOpen = null;
        this.prevRightOpen = null;
        this.prevHasLeft = null;
        this.prevHasRight = null;
        this.prevPanActive = false;
        this.prevRotateActive = false;
        this.prevZoomInActive = false;
        this.prevZoomOutActive = false;

        console.log('[Gesture] 🔄 所有状态已重置');
    }
}

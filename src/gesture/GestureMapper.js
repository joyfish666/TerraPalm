import { Smoothing } from '../utils/Smoothing.js';

/**
 * 手势映射器 v2
 *
 * 控制方案：
 * - 左手张开移动 → 地形平移
 * - 右手张开左右移动 → 绕中心轴旋转
 * - 双手向外推开 → 放大（双手掌心朝摄像头，间距增大）
 * - 双手向内收拢 → 缩小（双手掌心朝面部，间距缩小）
 * - 双手缩放时锁住单手控制
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
        this.zoomSensitivity = 15;

        // 速度阈值
        this.velocityThreshold = 0.0005;

        // ===== 双手缩放状态 =====
        this.twoHandZoomActive = false;
        this.prevHandDistance = null;
        this.handDistanceHistory = [];
        this.zoomLockTimer = null;

        // 调试
        this.debugCounter = 0;

        // 状态变化追踪（用于条件日志）
        this.prevLeftOpen = null;
        this.prevRightOpen = null;
        this.prevHasLeft = null;
        this.prevHasRight = null;
        this.prevPanActive = false;
        this.prevRotateActive = false;
        this.prevZoomActive = false;
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
     * 判断掌心是否朝向摄像头
     */
    _isPalmFacingCamera(landmarks) {
        const indexMcp = landmarks[5];
        const pinkyMcp = landmarks[17];
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];

        const palmWidth = Math.sqrt(
            Math.pow(indexMcp.x - pinkyMcp.x, 2) +
            Math.pow(indexMcp.y - pinkyMcp.y, 2)
        );

        const palmDepth = Math.sqrt(
            Math.pow(wrist.x - middleMcp.x, 2) +
            Math.pow(wrist.y - middleMcp.y, 2)
        );

        const ratio = palmWidth / (palmDepth + 0.001);
        return ratio > 0.5;
    }

    /**
     * 计算两个手掌中心的距离
     */
    _getHandDistance(leftPos, rightPos) {
        const dx = leftPos.x - rightPos.x;
        const dy = leftPos.y - rightPos.y;
        return Math.sqrt(dx * dx + dy * dy);
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
     * 处理双手缩放手势
     * @returns {boolean} 是否正在双手缩放
     */
    _handleTwoHandZoom(leftHand, rightHand) {
        const leftOpen = this._isOpenPalm(leftHand);
        const rightOpen = this._isOpenPalm(rightHand);

        if (!leftOpen || !rightOpen) {
            this._resetTwoHandZoom();
            return false;
        }

        const leftPos = this._getPalmCenter(leftHand);
        const rightPos = this._getPalmCenter(rightHand);
        const currentDistance = this._getHandDistance(leftPos, rightPos);

        this.handDistanceHistory.push(currentDistance);
        if (this.handDistanceHistory.length > this.historySize) {
            this.handDistanceHistory.shift();
        }

        if (this.handDistanceHistory.length >= 2) {
            let totalDelta = 0;
            for (let i = 1; i < this.handDistanceHistory.length; i++) {
                totalDelta += this.handDistanceHistory[i] - this.handDistanceHistory[i - 1];
            }
            const velocity = totalDelta / (this.handDistanceHistory.length - 1);

            if (Math.abs(velocity) > 0.002) {
                const wasActive = this.twoHandZoomActive;
                this.twoHandZoomActive = true;

                if (velocity > 0.002) {
                    this.zoom = this.zoomSmoother.smooth(this.zoom, velocity * this.zoomSensitivity);
                    if (!wasActive) console.log(`[Zoom] 📈 放大开始`);
                } else if (velocity < -0.002) {
                    this.zoom = this.zoomSmoother.smooth(this.zoom, velocity * this.zoomSensitivity);
                    if (!wasActive) console.log(`[Zoom] 📉 缩小开始`);
                }

                if (this.zoomLockTimer) {
                    clearTimeout(this.zoomLockTimer);
                }
                this.zoomLockTimer = setTimeout(() => {
                    this.twoHandZoomActive = false;
                    this.zoomLockTimer = null;
                    console.log(`[Zoom] 🔓 缩放结束`);
                }, 500);

                return true;
            }
        }

        if (this.twoHandZoomActive) {
            return true;
        }

        return false;
    }

    /**
     * 重置双手缩放状态
     */
    _resetTwoHandZoom() {
        this.handDistanceHistory = [];
        this.prevHandDistance = null;

        if (this.zoomLockTimer) {
            clearTimeout(this.zoomLockTimer);
        }
        this.zoomLockTimer = setTimeout(() => {
            this.twoHandZoomActive = false;
            this.zoomLockTimer = null;
        }, 300);
    }

    /**
     * 更新控制状态
     */
    update(leftHand, rightHand) {
        let rawPanX = 0;
        let rawPanZ = 0;
        let rawRotateY = 0;

        this.debugCounter++;

        const hasLeftHand = leftHand !== null;
        const hasRightHand = rightHand !== null;
        const hasBothHands = hasLeftHand && hasRightHand;

        // === 手部检测状态变化日志 ===
        if (hasLeftHand !== this.prevHasLeft) {
            console.log(`[Hand] 左手${hasLeftHand ? ' 👋 检测到' : ' ❌ 丢失'}`);
            this.prevHasLeft = hasLeftHand;
        }
        if (hasRightHand !== this.prevHasRight) {
            console.log(`[Hand] 右手${hasRightHand ? ' 👋 检测到' : ' ❌ 丢失'}`);
            this.prevHasRight = hasRightHand;
        }

        // ===== 双手缩放检测 =====
        if (hasBothHands) {
            const isZooming = this._handleTwoHandZoom(leftHand, rightHand);

            if (isZooming) {
                if (!this.prevZoomActive) {
                    console.log(`[Gesture] 🔒 双手缩放激活，单手控制已锁定`);
                    this.prevZoomActive = true;
                }
                return {
                    panX: this.panX,
                    panZ: this.panZ,
                    rotateY: this.rotateY,
                    zoom: this.zoom
                };
            }
        } else {
            this._resetTwoHandZoom();
        }

        if (this.prevZoomActive && !this.twoHandZoomActive) {
            this.prevZoomActive = false;
        }

        // ===== 单手控制（仅在双手缩放未激活时）=====
        if (!this.twoHandZoomActive) {
            // === 左手：平移控制 ===
            if (hasLeftHand) {
                const isOpen = this._isOpenPalm(leftHand);

                // 手掌状态变化日志
                if (isOpen !== this.prevLeftOpen) {
                    console.log(`[Left] 手掌${isOpen ? ' ✋ 张开' : ' ✊ 握拳'}`);
                    this.prevLeftOpen = isOpen;
                }

                if (isOpen) {
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
                } else {
                    this.leftPosHistory = [];
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
            }

            // === 右手：旋转控制 ===
            if (hasRightHand) {
                const isOpen = this._isOpenPalm(rightHand);

                // 手掌状态变化日志
                if (isOpen !== this.prevRightOpen) {
                    console.log(`[Right] 手掌${isOpen ? ' ✋ 张开' : ' ✊ 握拳'}`);
                    this.prevRightOpen = isOpen;
                }

                if (isOpen) {
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
                } else {
                    this.rightPosHistory = [];
                    this.prevRightOpen = null;
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
            }
        }

        // 应用平滑
        this.panX = this.panSmoother.smooth(this.panX, rawPanX);
        this.panZ = this.panSmoother.smooth(this.panZ, rawPanZ);
        this.rotateY = this.rotateSmoother.smooth(this.rotateY, rawRotateY);

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
        this.handDistanceHistory = [];
        this.prevHandDistance = null;
        this.twoHandZoomActive = false;
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
        this.prevZoomActive = false;

        if (this.zoomLockTimer) {
            clearTimeout(this.zoomLockTimer);
            this.zoomLockTimer = null;
        }

        console.log('[Gesture] 🔄 所有状态已重置');
    }
}

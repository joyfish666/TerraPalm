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
        this.rotateSensitivity = 4;
        this.zoomSensitivity = 15;

        // 速度阈值
        this.velocityThreshold = 0.001;

        // ===== 双手缩放状态 =====
        this.twoHandZoomActive = false;  // 是否正在双手缩放
        this.prevHandDistance = null;     // 上一帧双手距离
        this.handDistanceHistory = [];    // 双手距离历史
        this.zoomLockTimer = null;        // 缩放锁定计时器

        // 调试
        this.debugCounter = 0;
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
     *
     * 原理：当掌心朝向摄像头时，手指指尖在水平方向上展开
     * 当掌心朝向面部（背对摄像头）时，手指指尖会重叠或收拢
     *
     * 使用手腕到中指MCP的向量与手腕到食指MCP的向量叉积来判断
     */
    _isPalmFacingCamera(landmarks) {
        // 手腕 (0) → 中指 MCP (9)
        const wrist = landmarks[0];
        const middleMcp = landmarks[9];
        const indexMcp = landmarks[5];

        // 计算手掌宽度（食指MCP到小指MCP的距离）
        const pinkyMcp = landmarks[17];
        const palmWidth = Math.sqrt(
            Math.pow(indexMcp.x - pinkyMcp.x, 2) +
            Math.pow(indexMcp.y - pinkyMcp.y, 2)
        );

        // 计算手掌"深度"（手腕到中指MCP的距离）
        const palmDepth = Math.sqrt(
            Math.pow(wrist.x - middleMcp.x, 2) +
            Math.pow(wrist.y - middleMcp.y, 2)
        );

        // 当掌心朝向摄像头时，手掌宽度相对较大（手指展开）
        // 当掌心背向摄像头时，手掌宽度较小（手指重叠）
        // 使用宽度/深度比值来判断
        const ratio = palmWidth / (palmDepth + 0.001);

        // 阈值：ratio > 0.5 认为掌心朝向摄像头
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
        // 两只手都必须张开
        const leftOpen = this._isOpenPalm(leftHand);
        const rightOpen = this._isOpenPalm(rightHand);

        if (!leftOpen || !rightOpen) {
            this._resetTwoHandZoom();
            return false;
        }

        // 检测掌心方向
        const leftFacingCamera = this._isPalmFacingCamera(leftHand);
        const rightFacingCamera = this._isPalmFacingCamera(rightHand);

        // 双手掌心都朝向摄像头（推出去放大）
        // 或者双掌心都朝向面部（收回来缩小）
        // 简化：只要双手都张开，就检测距离变化
        // 掌心方向用于后续增强

        const leftPos = this._getPalmCenter(leftHand);
        const rightPos = this._getPalmCenter(rightHand);
        const currentDistance = this._getHandDistance(leftPos, rightPos);

        // 更新距离历史
        this.handDistanceHistory.push(currentDistance);
        if (this.handDistanceHistory.length > this.historySize) {
            this.handDistanceHistory.shift();
        }

        // 计算距离变化速度
        if (this.handDistanceHistory.length >= 2) {
            let totalDelta = 0;
            for (let i = 1; i < this.handDistanceHistory.length; i++) {
                totalDelta += this.handDistanceHistory[i] - this.handDistanceHistory[i - 1];
            }
            const velocity = totalDelta / (this.handDistanceHistory.length - 1);

            // 距离增大 → 放大（双手向外推开）
            // 距离缩小 → 缩小（双手向内收拢）
            if (Math.abs(velocity) > 0.002) {
                this.twoHandZoomActive = true;

                // 判断掌心方向来决定是否响应
                // 双手掌心朝摄像头 + 距离增大 = 放大
                // 双手掌心朝面部 + 距离缩小 = 缩小
                // 简化：只要距离变化明显就响应
                if (velocity > 0.002) {
                    // 双手向外推 → 放大
                    this.zoom = this.zoomSmoother.smooth(this.zoom, velocity * this.zoomSensitivity);
                } else if (velocity < -0.002) {
                    // 双手向内收 → 缩小
                    this.zoom = this.zoomSmoother.smooth(this.zoom, velocity * this.zoomSensitivity);
                }

                // 重置锁定计时器
                if (this.zoomLockTimer) {
                    clearTimeout(this.zoomLockTimer);
                }
                this.zoomLockTimer = setTimeout(() => {
                    this.twoHandZoomActive = false;
                    this.zoomLockTimer = null;
                }, 500);

                if (this.debugCounter % 30 === 0) {
                    console.log(`[GestureMapper] 双手缩放: 距离=${currentDistance.toFixed(3)}, 速度=${velocity.toFixed(4)}, 朝摄像头=[${leftFacingCamera}, ${rightFacingCamera}]`);
                }

                return true;
            }
        }

        // 距离变化不明显，但双手都在，保持锁定一段时间
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

        // 延迟解除锁定，避免快速切换
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

        const hasBothHands = leftHand !== null && rightHand !== null;

        // ===== 双手缩放检测 =====
        if (hasBothHands) {
            const isZooming = this._handleTwoHandZoom(leftHand, rightHand);

            if (isZooming) {
                // 双手缩放激活，锁住单手控制
                // 不处理平移和旋转
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

        // ===== 单手控制（仅在双手缩放未激活时）=====
        if (!this.twoHandZoomActive) {
            // === 左手：平移控制 ===
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
                } else {
                    this.leftPosHistory = [];
                }
            } else {
                this.leftPosHistory = [];
            }

            // === 右手：旋转控制 ===
            if (rightHand) {
                const isOpen = this._isOpenPalm(rightHand);

                if (isOpen) {
                    const pos = this._getPalmCenter(rightHand);
                    this._updateHistory(this.rightPosHistory, pos);

                    const velocity = this._calculateVelocity(this.rightPosHistory);

                    if (Math.abs(velocity.vx) > this.velocityThreshold) {
                        rawRotateY = -velocity.vx * this.rotateSensitivity;
                    }
                } else {
                    this.rightPosHistory = [];
                }
            } else {
                this.rightPosHistory = [];
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

        if (this.zoomLockTimer) {
            clearTimeout(this.zoomLockTimer);
            this.zoomLockTimer = null;
        }
    }
}

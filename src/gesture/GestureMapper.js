import { Smoothing } from '../utils/Smoothing.js';

/**
 * 手势映射器
 * 将 MediaPipe 手部关键点转换为3D场景控制指令
 *
 * 控制映射：
 * - 左手张开 + 移动 → 平移（panX, panZ）
 * - 右手张开 + 左右摆动 → 旋转（rotateY）
 * - 右手捏合/张开 → 缩放（zoom）
 * - 握拳 → 暂停对应手的控制
 */
export class GestureMapper {
    constructor() {
        // 上一帧的手部位置（用于计算增量）
        this.prevLeftPos = null;
        this.prevRightPos = null;
        this.prevPinchDist = null;

        // 上一帧的手部状态
        this.leftWasOpen = false;
        this.rightWasOpen = false;

        // 累积的控制值
        this.panX = 0;
        this.panZ = 0;
        this.rotateY = 0;
        this.zoom = 0;

        // 平滑器（不同控制使用不同平滑系数）
        this.panSmoother = new Smoothing(0.18);
        this.rotateSmoother = new Smoothing(0.15);
        this.zoomSmoother = new Smoothing(0.12);

        // 灵敏度配置
        this.panSensitivity = 12;
        this.rotateSensitivity = 6;
        this.zoomSensitivity = 15;

        // 移动阈值（低于此值忽略，避免漂移）
        this.moveThreshold = 0.002;

        // 调试计数器
        this.debugCounter = 0;
    }

    /**
     * 判断手掌是否张开
     * 通过比较指尖与对应 MCP 关节的位置关系
     * @param {Array} landmarks - 21个手部关键点
     * @returns {boolean}
     */
    _isOpenPalm(landmarks) {
        // 指尖索引：食指(8)、中指(12)、无名指(16)、小指(20)
        const tips = [8, 12, 16, 20];
        // 对应的 MCP 关节索引
        const mcps = [5, 9, 13, 17];

        let extendedCount = 0;
        for (let i = 0; i < tips.length; i++) {
            // 如果指尖的 y 坐标小于 MCP 关节（即手指伸直向上）
            if (landmarks[tips[i]].y < landmarks[mcps[i]].y) {
                extendedCount++;
            }
        }

        // 至少3根手指伸直认为是张开手掌
        return extendedCount >= 3;
    }

    /**
     * 计算拇指尖和食指尖的距离（用于捏合检测）
     * @param {Array} landmarks - 手部关键点
     * @returns {number} 归一化距离
     */
    _getPinchDistance(landmarks) {
        const thumb = landmarks[4];  // 拇指尖
        const index = landmarks[8];  // 食指尖
        const dx = thumb.x - index.x;
        const dy = thumb.y - index.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 获取手掌中心位置
     * 使用手腕和中指 MCP 的中点
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
     * 更新控制状态
     * 每帧调用一次，传入当前检测到的手部数据
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

            // 每 60 帧输出一次调试信息
            if (this.debugCounter % 60 === 0) {
                console.log(`[GestureMapper] 左手: 张开=${isOpen}, 位置=(${leftHand[0].x.toFixed(3)}, ${leftHand[0].y.toFixed(3)})`);
            }

            if (isOpen) {
                const pos = this._getPalmCenter(leftHand);

                if (this.prevLeftPos && this.leftWasOpen) {
                    const dx = pos.x - this.prevLeftPos.x;
                    const dy = pos.y - this.prevLeftPos.y;

                    // 只有移动超过阈值才响应
                    if (Math.abs(dx) > this.moveThreshold || Math.abs(dy) > this.moveThreshold) {
                        rawPanX = -dx * this.panSensitivity; // 反向，使拖拽更自然
                        rawPanZ = -dy * this.panSensitivity;
                    }
                }

                this.prevLeftPos = { x: pos.x, y: pos.y };
            }

            this.leftWasOpen = isOpen;
        } else {
            // 手部丢失，重置状态
            this.prevLeftPos = null;
            this.leftWasOpen = false;
        }

        // === 右手处理：旋转和缩放控制 ===
        if (rightHand) {
            const isOpen = this._isOpenPalm(rightHand);
            const pinchDist = this._getPinchDistance(rightHand);

            // 每 60 帧输出一次调试信息
            if (this.debugCounter % 60 === 0) {
                console.log(`[GestureMapper] 右手: 张开=${isOpen}, 捏合距离=${pinchDist.toFixed(3)}`);
            }

            // 旋转：张开手掌左右移动
            if (isOpen) {
                const pos = this._getPalmCenter(rightHand);

                if (this.prevRightPos && this.rightWasOpen) {
                    const dx = pos.x - this.prevRightPos.x;

                    if (Math.abs(dx) > this.moveThreshold) {
                        rawRotateY = -dx * this.rotateSensitivity;
                    }
                }

                this.prevRightPos = { x: pos.x, y: pos.y };
            }

            // 缩放：拇指和食指的捏合距离变化
            if (this.prevPinchDist !== null) {
                const pinchDelta = pinchDist - this.prevPinchDist;

                if (Math.abs(pinchDelta) > 0.005) {
                    rawZoom = -pinchDelta * this.zoomSensitivity;
                }
            }

            this.prevPinchDist = pinchDist;
            this.rightWasOpen = isOpen;
        } else {
            // 手部丢失，重置状态
            this.prevRightPos = null;
            this.prevPinchDist = null;
            this.rightWasOpen = false;
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
        this.prevLeftPos = null;
        this.prevRightPos = null;
        this.prevPinchDist = null;
        this.leftWasOpen = false;
        this.rightWasOpen = false;
        this.panX = 0;
        this.panZ = 0;
        this.rotateY = 0;
        this.zoom = 0;
    }
}

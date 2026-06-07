/**
 * 输入平滑处理工具
 * 使用指数移动平均（EMA）平滑手势输入，减少抖动
 */
export class Smoothing {
    /**
     * @param {number} factor - 平滑因子 (0-1)，越小越平滑，越大越灵敏
     */
    constructor(factor = 0.15) {
        this.factor = Math.max(0, Math.min(1, factor));
    }

    /**
     * 平滑单个数值
     * @param {number} current - 当前累积值
     * @param {number} target - 目标值（新输入）
     * @returns {number} 平滑后的值
     */
    smooth(current, target) {
        return current + (target - current) * this.factor;
    }

    /**
     * 创建一个带状态的平滑器实例
     * @param {number} factor - 平滑因子
     * @returns {Function} 平滑函数
     */
    static createSmoother(factor = 0.15) {
        let value = 0;
        return function (target) {
            value += (target - value) * factor;
            return value;
        };
    }

    /**
     * 线性插值
     * @param {number} a - 起始值
     * @param {number} b - 结束值
     * @param {number} t - 插值系数 (0-1)
     * @returns {number}
     */
    static lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * 平滑步进函数（用于阈值判断）
     * @param {number} edge0 - 下限
     * @param {number} edge1 - 上限
     * @param {number} x - 输入值
     * @returns {number} 0-1之间的平滑过渡
     */
    static smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }
}

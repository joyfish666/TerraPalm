/**
 * 操作帮助提示浮层
 * 显示手势操作指南，支持显示/隐藏/切换
 * 启动后自动显示，可设置自动隐藏延迟
 */
export class HelpOverlay {
    /**
     * @param {HTMLElement} overlayElement - 浮层 DOM 元素
     */
    constructor(overlayElement) {
        this.element = overlayElement;
        this.isVisible = false;
        this.autoHideTimer = null;
    }

    /**
     * 显示帮助浮层
     * @param {number} [autoHideDelay] - 自动隐藏延迟（毫秒），不传则不自动隐藏
     */
    show(autoHideDelay) {
        this.element.classList.add('visible');
        this.isVisible = true;

        // 清除之前的自动隐藏定时器
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }

        // 设置自动隐藏
        if (autoHideDelay && autoHideDelay > 0) {
            this.autoHideTimer = setTimeout(() => {
                this.hide();
            }, autoHideDelay);
        }
    }

    /**
     * 隐藏帮助浮层
     */
    hide() {
        this.element.classList.remove('visible');
        this.isVisible = false;

        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    /**
     * 切换浮层显示状态
     * @param {number} [autoHideDelay] - 自动隐藏延迟（毫秒）
     */
    toggle(autoHideDelay) {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show(autoHideDelay);
        }
    }
}

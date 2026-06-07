/**
 * 视角复位按钮
 * 点击后触发视角复位回调
 */
export class ResetButton {
    /**
     * @param {HTMLElement} buttonElement - 按钮 DOM 元素
     * @param {Function} onClick - 点击回调函数
     */
    constructor(buttonElement, onClick) {
        this.element = buttonElement;
        this.onClick = onClick;

        this.element.addEventListener('click', this._handleClick.bind(this));
    }

    /**
     * 处理按钮点击
     */
    _handleClick() {
        if (this.onClick) {
            this.onClick();
        }
    }

    /**
     * 启用按钮
     */
    enable() {
        this.element.disabled = false;
        this.element.style.opacity = '1';
        this.element.style.cursor = 'pointer';
    }

    /**
     * 禁用按钮
     */
    disable() {
        this.element.disabled = true;
        this.element.style.opacity = '0.5';
        this.element.style.cursor = 'not-allowed';
    }
}

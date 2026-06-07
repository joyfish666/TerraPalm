import { SceneManager } from './scene/SceneManager.js';
import { Terrain } from './scene/Terrain.js';
import { HandTracker } from './gesture/HandTracker.js';
import { GestureMapper } from './gesture/GestureMapper.js';
import { HelpOverlay } from './ui/HelpOverlay.js';
import { ResetButton } from './ui/ResetButton.js';

/**
 * TerraPalm 主入口
 * 初始化所有模块并启动应用
 */

// ========== DOM 元素 ==========
const sceneContainer = document.getElementById('scene-container');
const videoElement = document.getElementById('webcam');
const helpOverlayEl = document.getElementById('help-overlay');
const resetBtnEl = document.getElementById('reset-btn');
const helpBtnEl = document.getElementById('help-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// ========== 状态管理 ==========
let isHandDetected = false;
let handLostTimer = null;
let frameCount = 0;

/**
 * 更新状态指示器
 * @param {string} state - 状态类型：'waiting' | 'ready' | 'detecting'
 * @param {string} text - 状态文本
 */
function updateStatus(state, text) {
    statusDot.className = 'status-dot';
    if (state === 'ready') {
        statusDot.classList.add('active');
    } else if (state === 'detecting') {
        statusDot.classList.add('detecting');
    }
    statusText.textContent = text;
}

// ========== 初始化场景 ==========
const sceneManager = new SceneManager(sceneContainer);
sceneManager.init();

// 创建地形并添加到场景的地形组
const terrain = new Terrain(sceneManager.scene, {
    size: 10,
    resolution: 128,
    heightScale: 3,
    noiseScale: 0.25,
    octaves: 6
});
terrain.create();

// ========== 初始化手势系统 ==========
const gestureMapper = new GestureMapper();

const handTracker = new HandTracker(videoElement, ({ leftHand, rightHand }) => {
    frameCount++;

    // 每 100 帧输出一次日志
    if (frameCount % 100 === 0) {
        console.log(`[TerraPalm] 已处理 ${frameCount} 帧`);
    }

    // 更新状态指示
    const hasAnyHand = leftHand !== null || rightHand !== null;

    if (hasAnyHand) {
        if (!isHandDetected) {
            isHandDetected = true;
            console.log('[TerraPalm] 检测到手势！');
        }

        // 清除手部丢失定时器
        if (handLostTimer) {
            clearTimeout(handLostTimer);
            handLostTimer = null;
        }

        // 标记为活跃状态
        updateStatus('ready', '手势控制中');
    } else {
        // 手部丢失，延迟切换状态（避免频繁闪烁）
        if (isHandDetected && !handLostTimer) {
            handLostTimer = setTimeout(() => {
                isHandDetected = false;
                updateStatus('waiting', '未检测到手势');
                handLostTimer = null;
            }, 1500);
        }
    }

    // 将手势数据映射为控制指令
    const controls = gestureMapper.update(leftHand, rightHand);

    // 应用控制到场景
    sceneManager.applyControls(controls);
});

// ========== 初始化 UI 组件 ==========
const helpOverlay = new HelpOverlay(helpOverlayEl);
const resetButton = new ResetButton(resetBtnEl, () => {
    sceneManager.resetView();
    gestureMapper.reset();
});

// 帮助按钮点击事件
helpBtnEl.addEventListener('click', () => {
    helpOverlay.toggle(5000);
});

// ========== 启动应用 ==========
async function startApp() {
    updateStatus('waiting', '正在启动摄像头...');
    console.log('[TerraPalm] 正在启动应用...');

    try {
        await handTracker.start();
        updateStatus('waiting', '等待手势...');
        console.log('[TerraPalm] 摄像头已启动，等待手势输入');

        // 启动后自动显示帮助提示 3 秒
        helpOverlay.show(3000);
    } catch (error) {
        updateStatus('waiting', '启动失败: ' + error.message);
        console.error('[TerraPalm] 启动失败:', error);

        // 显示错误提示
        helpOverlay.show();
        const helpContent = helpOverlayEl.querySelector('.help-content h2');
        if (helpContent) {
            helpContent.textContent = '⚠️ 启动失败';
            helpContent.style.color = '#f44336';
        }

        // 显示详细错误信息
        const helpText = helpOverlayEl.querySelector('.help-content');
        if (helpText) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'margin-top: 20px; padding: 15px; background: #ffebee; border-radius: 8px; color: #c62828; text-align: left; font-size: 14px;';
            errorDiv.textContent = error.message || '未知错误';
            helpText.appendChild(errorDiv);
        }
    }
}

// ========== 渲染循环 ==========
function animate() {
    requestAnimationFrame(animate);
    sceneManager.render();
}

// 启动
animate();
startApp();

// 导出供调试使用
window.TerraPalm = {
    sceneManager,
    terrain,
    handTracker,
    gestureMapper,
    helpOverlay,
    resetButton,
    // 调试方法
    getStatus: () => ({
        frameCount,
        isHandDetected,
        isRunning: handTracker.isRunning,
        isModelReady: handTracker.isModelReady
    })
};

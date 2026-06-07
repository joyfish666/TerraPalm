# TerraPalm - Gesture-Controlled 3D Sandbox

# TerraPalm - 手势控制3D沙盘

[English](#english) | [中文](#中文)

---

## English

### Introduction

TerraPalm is a gesture-controlled 3D terrain sandbox that allows users to interact with a 3D landscape using hand gestures captured by a webcam. Built with Three.js for 3D rendering and MediaPipe for hand tracking, it provides an intuitive and immersive way to explore terrain data.

### Features

- **Real-time Hand Tracking**: Uses MediaPipe Tasks Vision API for accurate hand landmark detection
- **Left Hand Controls**:
  - Open palm left/right → Pan terrain horizontally
  - Open palm up/down → Adjust camera height
  - Fist → Zoom in
- **Right Hand Controls**:
  - Open palm left/right → Rotate terrain around center axis
  - Fist → Zoom out
- **Priority System**: Zoom (fist) takes priority over pan/rotate (open palm)
- **Smooth Animations**: Exponential smoothing for fluid gesture responses
- **Procedural Terrain**: Generates realistic terrain using fractal Brownian motion (fBm) noise
- **Height-based Coloring**: Terrain colors from green valleys to white snow peaks
- **Reset View**: One-click return to default camera position

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| 3D Rendering | Three.js (r160+) | WebGL-based 3D scene |
| Hand Tracking | MediaPipe Tasks Vision | 21-point hand landmark detection |
| Camera | WebRTC | Real-time webcam access |
| Build Tool | Vite | Fast development and bundling |
| Language | Vanilla JavaScript | No framework dependencies |

### Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

Open `http://localhost:3000` in Chrome or Edge browser. Allow camera permissions when prompted.

### Project Structure

```
TerraPalm/
├── index.html                  # Entry HTML page with styles
├── package.json                # Dependencies and scripts
├── vite.config.js              # Vite build configuration
├── .gitignore                  # Git ignore rules
├── ARCHITECTURE.md             # Detailed architecture documentation
├── README.md                   # This file
└── src/
    ├── main.js                 # Application entry point
    ├── gesture/                # Gesture recognition module
    │   ├── HandTracker.js      # MediaPipe Hands wrapper
    │   └── GestureMapper.js    # Gesture → control mapping
    ├── scene/                  # 3D scene module
    │   ├── SceneManager.js     # Three.js scene manager
    │   └── Terrain.js          # Procedural terrain generator
    ├── ui/                     # UI components
    │   ├── HelpOverlay.js      # Help tips overlay
    │   └── ResetButton.js      # View reset button
    └── utils/                  # Utility functions
        └── Smoothing.js        # Input smoothing (EMA)
```

### Gesture Controls

| Gesture | Action | Priority |
|---------|--------|----------|
| 👈👉 Left hand open, move left/right | Pan terrain | Low |
| 👆👇 Left hand open, move up/down | Adjust camera height | Low |
| ✊ Left hand fist | Zoom in | High |
| 👈👉 Right hand open, move left/right | Rotate terrain | Low |
| ✊ Right hand fist | Zoom out | High |

### Development

For detailed architecture and implementation notes, see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Browser Requirements

- Chrome 90+ or Edge 90+
- Webcam access required
- WebGL 2.0 support

### License

MIT

---

## 中文

### 简介

TerraPalm 是一个手势控制的3D地形沙盘，用户可以通过摄像头捕捉的手势与3D地形进行交互。使用 Three.js 进行3D渲染，MediaPipe 进行手部追踪，提供直观沉浸式的地形探索体验。

### 功能特性

- **实时手部追踪**：使用 MediaPipe Tasks Vision API 进行精准的手部关键点检测
- **左手控制**：
  - 张开手掌左右移动 → 平移地形
  - 张开手掌上下移动 → 调整视角高度
  - 握拳 → 放大
- **右手控制**：
  - 张开手掌左右移动 → 绕中心轴旋转地形
  - 握拳 → 缩小
- **优先级系统**：缩放（握拳）优先于平移/旋转（张开手掌）
- **平滑动画**：指数移动平均（EMA）实现流畅的手势响应
- **程序化地形**：使用分形布朗运动（fBm）噪声生成逼真地形
- **基于高度的着色**：地形颜色从绿色谷地到白色雪峰渐变
- **视角复位**：一键恢复默认相机位置

### 技术栈

| 层级 | 技术 | 用途 |
|------|------|------|
| 3D渲染 | Three.js (r160+) | WebGL 3D场景 |
| 手部追踪 | MediaPipe Tasks Vision | 21点手部关键点检测 |
| 摄像头 | WebRTC | 实时摄像头访问 |
| 构建工具 | Vite | 快速开发和打包 |
| 语言 | 原生 JavaScript | 无框架依赖 |

### 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

在 Chrome 或 Edge 浏览器中打开 `http://localhost:3000`，按提示允许摄像头权限。

### 项目结构

```
TerraPalm/
├── index.html                  # 入口 HTML 页面（含样式）
├── package.json                # 依赖和脚本配置
├── vite.config.js              # Vite 构建配置
├── .gitignore                  # Git 忽略规则
├── ARCHITECTURE.md             # 详细架构文档
├── README.md                   # 本文件
└── src/
    ├── main.js                 # 应用入口文件
    ├── gesture/                # 手势识别模块
    │   ├── HandTracker.js      # MediaPipe Hands 封装
    │   └── GestureMapper.js    # 手势→控制指令映射
    ├── scene/                  # 3D场景模块
    │   ├── SceneManager.js     # Three.js 场景管理器
    │   └── Terrain.js          # 程序化地形生成器
    ├── ui/                     # UI组件
    │   ├── HelpOverlay.js      # 帮助提示浮层
    │   └── ResetButton.js      # 视角复位按钮
    └── utils/                  # 工具函数
        └── Smoothing.js        # 输入平滑处理（EMA）
```

### 手势控制

| 手势 | 操作 | 优先级 |
|------|------|--------|
| 👈👉 左手张开，左右移动 | 平移地形 | 低 |
| 👆👇 左手张开，上下移动 | 调整视角高度 | 低 |
| ✊ 左手握拳 | 放大 | 高 |
| 👈👉 右手张开，左右移动 | 旋转地形 | 低 |
| ✊ 右手握拳 | 缩小 | 高 |

### 开发文档

详细的架构和实现说明请参阅 [ARCHITECTURE.md](./ARCHITECTURE.md)。

### 浏览器要求

- Chrome 90+ 或 Edge 90+
- 需要摄像头权限
- 支持 WebGL 2.0

### 许可证

MIT

---

## Acknowledgments / 致谢

- [Three.js](https://threejs.org/) - 3D rendering library
- [MediaPipe](https://mediapipe.dev/) - Hand tracking solution
- [Vite](https://vitejs.dev/) - Build tool

---

**Note / 注意**: This project requires a webcam and works best in well-lit environments.

此项目需要摄像头，在光线良好的环境下效果最佳。

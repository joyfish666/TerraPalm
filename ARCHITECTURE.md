# TerraPalm 项目架构文档

## 项目概述

**TerraPalm** 是一个基于手势控制的 3D 沙盘应用。用户通过摄像头实时手势操作，控制 3D 地形图的平移、旋转和缩放。项目完全在浏览器端运行，无需后端服务。

- **项目名称**：TerraPalm（手势控制 3D 沙盘）
- **技术栈**：Three.js + MediaPipe Hands + Vite + 原生 HTML/CSS/JS
- **运行环境**：现代浏览器（Chrome/Edge），需摄像头权限

---

## 目录结构

```
TerraPalm/
├── index.html                  # 入口 HTML 页面
├── package.json                # 项目配置和依赖
├── vite.config.js              # Vite 构建配置
├── .gitignore                  # Git 忽略规则
├── ARCHITECTURE.md             # 本文件 - 项目架构文档
├── README.md                   # 项目规划文档
└── src/
    ├── main.js                 # 应用入口，连接所有模块
    ├── gesture/                # 手势识别模块
    │   ├── HandTracker.js      # MediaPipe Hands 封装
    │   └── GestureMapper.js    # 手势 → 控制指令映射
    ├── scene/                  # 3D 场景模块
    │   ├── SceneManager.js     # Three.js 场景管理器
    │   └── Terrain.js          # 程序化地形生成器
    ├── ui/                     # UI 组件模块
    │   ├── HelpOverlay.js      # 操作帮助提示浮层
    │   └── ResetButton.js      # 视角复位按钮
    └── utils/                  # 工具函数
        └── Smoothing.js        # 输入平滑处理
```

---

## 模块详细说明

### 1. `src/main.js` — 应用入口

**职责**：初始化所有模块，建立模块间通信，启动渲染循环。

**主要流程**：
```
获取 DOM 元素
  → 初始化 SceneManager（创建场景、相机、光照）
  → 创建 Terrain（生成地形网格）
  → 初始化 HandTracker（摄像头 + MediaPipe）
  → 初始化 GestureMapper（手势映射）
  → 初始化 UI 组件（帮助浮层、复位按钮）
  → 启动摄像头
  → 启动渲染循环
```

**数据流**：
```
摄像头画面 → HandTracker 检测手部关键点
  → GestureMapper 转换为控制指令
  → SceneManager 应用到地形组
  → 渲染循环更新画面
```

**全局调试对象**：`window.TerraPalm` 可在浏览器控制台访问所有模块实例。

---

### 2. `src/gesture/HandTracker.js` — 手部追踪器

**职责**：封装 MediaPipe Hands，管理摄像头初始化和手部关键点检测。

**依赖**：`@mediapipe/hands`、`@mediapipe/camera_utils`

**关键逻辑**：
- 摄像头画面是镜像的，MediaPipe 返回的 "Left" 实际是用户的右手，需要反转
- 同时检测两只手，分别标记为 `leftHand` 和 `rightHand`
- 检测参数：最多 2 只手，检测置信度 0.7，追踪置信度 0.5

**公开接口**：
| 方法 | 说明 |
|------|------|
| `constructor(videoElement, onResults)` | 创建追踪器，`onResults` 回调接收 `{ leftHand, rightHand }` |
| `start()` | 启动摄像头和检测（返回 Promise） |
| `stop()` | 停止摄像头和检测 |

**回调数据格式**：
```js
{
  leftHand: Array<Landmark> | null,   // 左手 21 个关键点，null 表示未检测到
  rightHand: Array<Landmark> | null,  // 右手 21 个关键点
  rawResults: Object                  // MediaPipe 原始结果
}
```

**手部关键点索引**（MediaPipe Hands 21 点模型）：
```
        8   12  16  20      ← 指尖
        |   |   |   |
    4   7   11  15  19
    |   |   |   |   |
    3   6   10  14  18
    |   |   |   |   |
    2   5   9   13  17      ← MCP 关节
     \  |   |   |   /
      1─────────────
          0                ← 手腕
```

---

### 3. `src/gesture/GestureMapper.js` — 手势映射器

**职责**：将 MediaPipe 手部关键点转换为 3D 场景控制指令。

**控制模式**：速度控制（而非位置增量控制）
- 手移动时，画面跟随移动
- 手停止/复位时，画面停止（不回退）

**控制映射规则**：

| 手势 | 手部 | 动作 | 控制输出 | 识别方式 | 优先级 |
|------|------|------|----------|----------|--------|
| 握拳 | 左手 | 放大 | `zoom` | 左手握拳 | 高 |
| 握拳 | 右手 | 缩小 | `zoom` | 右手握拳 | 高 |
| 张开手掌移动 | 左手 | 地形平移 | `panX`, `panZ` | 左手张开 + 移动 | 低 |
| 张开手掌左右移动 | 右手 | 绕中心轴旋转 | `rotateY` | 右手张开 + 左右摆动 | 低 |

**优先级机制**：
- 缩放（握拳）优先于平移/旋转（张开手掌）
- 当手握拳时，不响应该手的平移/旋转
- 当手张开时，不响应该手的缩放

**平滑处理**：
- 平移使用 0.15 平滑系数
- 旋转使用 0.12 平滑系数
- 缩放使用 0.08 平滑系数

**公开接口**：
| 方法 | 说明 |
|------|------|
| `update(leftHand, rightHand)` | 更新并返回控制指令 `{ panX, panZ, rotateY, zoom }` |
| `reset()` | 重置所有累积状态 |

---

### 4. `src/scene/SceneManager.js` — 场景管理器

**职责**：管理 Three.js 场景生命周期，提供相机控制和渲染接口。

**场景配置**：
- **背景色**：深蓝 `#1a1a2e`
- **雾效**：线性雾，起始 18，结束 35
- **相机**：透视相机，55° 视角，默认位置 `(0, 8, 12)` 俯视 45°
- **渲染器**：开启抗锯齿、阴影、ACES 色调映射

**光照方案**（4 盏灯）：

| 光源 | 类型 | 作用 |
|------|------|------|
| 环境光 | AmbientLight | 基础照明 |
| 半球光 | HemisphereLight | 模拟天光和地面反射 |
| 主平行光 | DirectionalLight | 模拟太阳，投射阴影 |
| 补光 | DirectionalLight | 减少阴影过暗 |

**地形组机制**：
- 所有地形对象放在 `terrainGroup`（THREE.Group）中
- 手势控制作用于 `terrainGroup` 的 position 和 rotation
- 缩放通过移动相机位置实现（而非缩放地形）

**复位动画**：
- 使用 `performance.now()` 驱动的缓动动画
- 缓出三次方曲线 `1 - (1-t)³`
- 动画时长 800ms
- 同时插值地形组位置、旋转和相机位置

**公开接口**：
| 方法 | 说明 |
|------|------|
| `init()` | 初始化场景、相机、渲染器、光照 |
| `applyControls(controls)` | 应用手势控制指令 |
| `resetView()` | 复位视角（带动画） |
| `getTerrainGroup()` | 获取地形组对象 |
| `render()` | 渲染一帧 |

---

### 5. `src/scene/Terrain.js` — 地形生成器

**职责**：使用程序化噪声生成 3D 地形网格。

**地形生成算法**：
1. 创建 `PlaneGeometry` 并旋转到 XZ 平面
2. 使用 **分形布朗运动（fBm）** 生成高度图：
   - 6 层噪声叠加（octaves）
   - 每层振幅减半（amplitude *= 0.5）
   - 每层频率翻倍（frequency *= 2）
3. 根据高度设置顶点颜色（从深绿到白色的 8 级渐变）
4. 计算法线用于光照

**噪声实现**：
- **哈希函数**：整数坐标 → 伪随机浮点数
- **值噪声**：双线性插值 + smoothstep 曲线
- **fBm**：多层噪声叠加，归一化输出

**颜色梯度**：

| 海拔范围 | 颜色 | 地形特征 |
|----------|------|----------|
| 0.00 - 0.15 | 深绿 `#1a472a` | 谷底 |
| 0.15 - 0.30 | 绿色 `#2d5a27` | 山坡 |
| 0.30 - 0.45 | 浅绿 `#4a7c3f` | 丘陵 |
| 0.45 - 0.60 | 草绿 `#7cba3d` | 平原 |
| 0.60 - 0.75 | 棕色 `#8b7355` | 山脚 |
| 0.75 - 0.90 | 灰色 `#808080` | 山腰 |
| 0.90 - 1.00 | 白色 `#f0f0f0` | 雪峰 |

**配置参数**：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `size` | 10 | 地形平面边长 |
| `resolution` | 128 | 网格分辨率（顶点数） |
| `heightScale` | 3 | 高度缩放系数 |
| `noiseScale` | 0.25 | 噪声采样缩放 |
| `octaves` | 6 | 噪声层数 |

**公开接口**：
| 方法 | 说明 |
|------|------|
| `create()` | 创建地形网格并添加到场景 |
| `getMesh()` | 获取地形 Mesh 对象 |

---

### 6. `src/ui/HelpOverlay.js` — 帮助提示浮层

**职责**：管理操作帮助提示的显示和隐藏。

**公开接口**：
| 方法 | 说明 |
|------|------|
| `show(autoHideDelay?)` | 显示浮层，可选自动隐藏延迟（毫秒） |
| `hide()` | 隐藏浮层 |
| `toggle(autoHideDelay?)` | 切换显示状态 |

---

### 7. `src/ui/ResetButton.js` — 复位按钮

**职责**：绑定复位按钮点击事件。

**公开接口**：
| 方法 | 说明 |
|------|------|
| `constructor(buttonElement, onClick)` | 创建按钮，绑定点击回调 |
| `enable()` | 启用按钮 |
| `disable()` | 禁用按钮 |

---

### 8. `src/utils/Smoothing.js` — 平滑工具

**职责**：提供输入平滑处理函数，减少手势输入的抖动。

**算法**：指数移动平均（EMA）
```
value = value + (target - value) * factor
```

**公开接口**：
| 方法 | 说明 |
|------|------|
| `smooth(current, target)` | 平滑单个数值 |
| `static createSmoother(factor)` | 创建带状态的平滑器函数 |
| `static lerp(a, b, t)` | 线性插值 |
| `static smoothstep(edge0, edge1, x)` | 平滑步进函数 |

---

## 数据流图

```
┌─────────────────────────────────────────────────────────────────┐
│                         浏览器页面                               │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐          │
│  │  摄像头   │───→│  HandTracker │───→│ GestureMapper │          │
│  │ (WebRTC)  │    │ (MediaPipe)  │    │               │          │
│  └──────────┘    └──────────────┘    └───────┬───────┘          │
│                                              │                  │
│                                              ↓                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐          │
│  │  渲染画面 │←───│ SceneManager │←───│   控制指令     │          │
│  │ (Canvas)  │    │  (Three.js)  │    │ pan/rotate/zoom│          │
│  └──────────┘    └──────────────┘    └───────────────┘          │
│                        ↑                                         │
│                        │                                         │
│                ┌───────┴───────┐                                 │
│                │    Terrain    │                                 │
│                │  (噪声地形)    │                                 │
│                └───────────────┘                                 │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │ HelpOverlay  │  │ ResetButton  │                             │
│  │  (帮助浮层)   │  │  (复位按钮)   │                             │
│  └──────────────┘  └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术要点

### 1. 摄像头镜像处理
MediaPipe 返回的手部标签是从摄像头视角判断的，需要反转：
- MediaPipe "Left" → 用户的右手
- MediaPipe "Right" → 用户的左手

### 2. 手势状态机
每只手独立跟踪状态：
- **上一帧位置**：用于计算移动增量
- **上一帧手型**：避免手型切换时产生跳变
- **手部丢失**：延迟 1.5 秒重置状态，避免频繁闪烁

### 3. 缩放实现
缩放不改变地形大小，而是移动相机的 Y 和 Z 坐标：
- Y 范围限制：3 - 20
- Z 范围限制：5 - 25
- 相机始终看向地形中心

### 4. 复位动画
使用 `requestAnimationFrame` + 缓出三次方曲线实现平滑过渡：
```js
eased = 1 - Math.pow(1 - t, 3)  // 缓出三次方
```

---

## 开发命令

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

---

## 已实现功能清单

| 编号 | 功能 | 状态 | 实现位置 |
|------|------|------|----------|
| F1 | 手势识别 | ✅ | `src/gesture/HandTracker.js` |
| F2 | 左手控制（平移） | ✅ | `src/gesture/GestureMapper.js` |
| F3 | 右手控制（缩放与旋转） | ✅ | `src/gesture/GestureMapper.js` |
| F4 | 3D 地形显示 | ✅ | `src/scene/Terrain.js` + `SceneManager.js` |
| F5 | 视角快速复位 | ✅ | `src/scene/SceneManager.js` + `src/ui/ResetButton.js` |
| F6 | 操作帮助提示 | ✅ | `src/ui/HelpOverlay.js` |

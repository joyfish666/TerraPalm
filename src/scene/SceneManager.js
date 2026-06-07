import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Color,
    Fog,
    AmbientLight,
    DirectionalLight,
    HemisphereLight,
    Group,
    Vector3
} from 'three';

/**
 * Three.js 场景管理器
 * 负责场景初始化、相机控制、光照设置、渲染循环
 * 提供手势控制接口，将控制指令应用到地形组
 */
export class SceneManager {
    /**
     * @param {HTMLElement} container - 场景容器 DOM 元素
     */
    constructor(container) {
        this.container = container;

        // Three.js 核心对象
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // 地形变换组（手势控制作用于此对象）
        this.terrainGroup = null;

        // 默认视角参数
        this.defaultCameraPos = new Vector3(0, 8, 12);
        this.defaultLookAt = new Vector3(0, 0, 0);
        this.defaultGroupPos = new Vector3(0, 0, 0);
        this.defaultGroupRotY = 0;

        // 状态标志
        this.isResetting = false;
        this.isInitialized = false;
    }

    /**
     * 初始化场景
     * 创建场景、相机、渲染器、光照、地形组
     */
    init() {
        // 场景
        this.scene = new Scene();
        this.scene.background = new Color(0x1a1a2e);
        this.scene.fog = new Fog(0x1a1a2e, 18, 35);

        // 透视相机
        this.camera = new PerspectiveCamera(
            55,
            window.innerWidth / window.innerHeight,
            0.1,
            100
        );
        this.camera.position.copy(this.defaultCameraPos);
        this.camera.lookAt(this.defaultLookAt);

        // WebGL 渲染器
        this.renderer = new WebGLRenderer({
            antialias: true,
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = 2; // PCFSoftShadowMap
        this.renderer.toneMapping = 1;    // ACESFilmicToneMapping
        this.renderer.toneMappingExposure = 1.2;

        this.container.appendChild(this.renderer.domElement);

        // 设置光照
        this._setupLights();

        // 创建地形变换组
        this.terrainGroup = new Group();
        this.scene.add(this.terrainGroup);

        // 窗口大小变化监听
        window.addEventListener('resize', this._onResize.bind(this));

        this.isInitialized = true;
        console.log('[SceneManager] 场景初始化完成');
    }

    /**
     * 设置场景光照
     * 使用环境光 + 半球光 + 平行光的组合
     */
    _setupLights() {
        // 环境光（基础照明）
        const ambientLight = new AmbientLight(0x404060, 0.5);
        this.scene.add(ambientLight);

        // 半球光（模拟天空和地面的环境光）
        const hemisphereLight = new HemisphereLight(0x87ceeb, 0x362e1a, 0.6);
        this.scene.add(hemisphereLight);

        // 主平行光（模拟太阳，带阴影）
        const mainLight = new DirectionalLight(0xfff4e6, 1.2);
        mainLight.position.set(8, 15, 8);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.camera.left = -15;
        mainLight.shadow.camera.right = 15;
        mainLight.shadow.camera.top = 15;
        mainLight.shadow.camera.bottom = -15;
        mainLight.shadow.bias = -0.0005;
        this.scene.add(mainLight);

        // 补光（减少阴影过暗）
        const fillLight = new DirectionalLight(0x8ec8f0, 0.3);
        fillLight.position.set(-5, 8, -5);
        this.scene.add(fillLight);
    }

    /**
     * 窗口大小变化处理
     */
    _onResize() {
        if (!this.isInitialized) return;

        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /**
     * 将手势控制指令应用到地形组
     * @param {{ panX: number, panZ: number, rotateY: number, zoom: number }} controls
     */
    applyControls(controls) {
        if (this.isResetting || !this.isInitialized) return;

        // 平移：在 XZ 平面移动地形组
        this.terrainGroup.position.x += controls.panX;
        this.terrainGroup.position.z += controls.panZ;

        // 旋转：绕 Y 轴旋转地形组
        this.terrainGroup.rotation.y += controls.rotateY;

        // 缩放：通过移动相机实现远近效果
        const zoomDelta = controls.zoom * 0.8;
        this.camera.position.y = Math.max(3, Math.min(20, this.camera.position.y + zoomDelta));
        this.camera.position.z = Math.max(5, Math.min(25, this.camera.position.z + zoomDelta * 0.7));

        // 相机始终看向地形中心
        this.camera.lookAt(this.terrainGroup.position);
    }

    /**
     * 复位视角到默认状态
     * 使用缓动动画平滑过渡
     */
    resetView() {
        if (this.isResetting) return;
        this.isResetting = true;

        const duration = 800; // 动画时长（毫秒）
        const startTime = performance.now();

        // 记录起始状态
        const startPos = this.terrainGroup.position.clone();
        const startRotY = this.terrainGroup.rotation.y;
        const startCamPos = this.camera.position.clone();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const t = Math.min(elapsed / duration, 1);

            // 缓出三次方曲线
            const eased = 1 - Math.pow(1 - t, 3);

            // 插值地形组位置
            this.terrainGroup.position.lerpVectors(startPos, this.defaultGroupPos, eased);

            // 插值地形组旋转
            this.terrainGroup.rotation.y = startRotY + (this.defaultGroupRotY - startRotY) * eased;

            // 插值相机位置
            this.camera.position.lerpVectors(startCamPos, this.defaultCameraPos, eased);
            this.camera.lookAt(this.terrainGroup.position);

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isResetting = false;
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * 获取地形组对象（用于添加地形网格）
     * @returns {THREE.Group}
     */
    getTerrainGroup() {
        return this.terrainGroup;
    }

    /**
     * 渲染一帧
     */
    render() {
        if (!this.isInitialized) return;
        this.renderer.render(this.scene, this.camera);
    }
}

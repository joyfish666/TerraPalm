import {
    PlaneGeometry,
    MeshStandardMaterial,
    Mesh,
    Color,
    DoubleSide,
    Float32BufferAttribute
} from 'three';

/**
 * 程序化地形生成器
 * 使用分形噪声（fBm）生成自然地形，包含山川、谷地等地形特征
 * 支持基于海拔的顶点着色（低海拔绿色 → 中海拔棕色 → 高海拔白色）
 */
export class Terrain {
    /**
     * @param {THREE.Scene} scene - Three.js 场景对象
     * @param {Object} options - 配置选项
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.mesh = null;

        // 地形参数
        this.size = options.size || 10;           // 地形平面尺寸
        this.resolution = options.resolution || 128; // 网格分辨率
        this.heightScale = options.heightScale || 3; // 高度缩放系数
        this.noiseScale = options.noiseScale || 0.25; // 噪声采样缩放
        this.octaves = options.octaves || 6;      // 噪声层数（细节层次）
    }

    /**
     * 创建地形网格并添加到场景
     */
    create() {
        // 创建平面几何体（XZ 平面）
        const geometry = new PlaneGeometry(
            this.size,
            this.size,
            this.resolution,
            this.resolution
        );

        // 旋转到 XZ 平面（Y 轴朝上）
        geometry.rotateX(-Math.PI / 2);

        const positions = geometry.attributes.position;
        const vertexCount = positions.count;
        const colors = new Float32Array(vertexCount * 3);

        // 遍历每个顶点，计算高度和颜色
        for (let i = 0; i < vertexCount; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);

            // 使用分形噪声生成高度
            const height = this._generateHeight(x, z);
            positions.setY(i, height * this.heightScale);

            // 根据高度计算顶点颜色
            const color = this._getHeightColor(height);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        // 设置顶点颜色属性
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));

        // 重新计算法线（用于光照）
        geometry.computeVertexNormals();

        // 创建材质（使用顶点着色）
        const material = new MeshStandardMaterial({
            vertexColors: true,
            side: DoubleSide,
            flatShading: false,
            roughness: 0.85,
            metalness: 0.1
        });

        // 创建网格
        this.mesh = new Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;

        this.scene.add(this.mesh);
        return this.mesh;
    }

    /**
     * 生成指定坐标的地形高度
     * 使用多层噪声叠加（分形布朗运动 fBm）
     * @param {number} x - X 坐标
     * @param {number} z - Z 坐标
     * @returns {number} 归一化高度值 (0-1)
     */
    _generateHeight(x, z) {
        let value = 0;
        let amplitude = 1;
        let frequency = this.noiseScale;
        let maxValue = 0;

        for (let i = 0; i < this.octaves; i++) {
            value += amplitude * this._noise(x * frequency, z * frequency);
            maxValue += amplitude;
            amplitude *= 0.5;    // 每层振幅减半
            frequency *= 2;      // 每层频率翻倍
        }

        return value / maxValue; // 归一化到 0-1
    }

    /**
     * 2D 值噪声函数
     * 使用哈希和双线性插值生成平滑噪声
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @returns {number} 噪声值 (0-1)
     */
    _noise(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        // 平滑插值曲线（smoothstep）
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);

        // 四个角的哈希值
        const n00 = this._hash(ix, iy);
        const n10 = this._hash(ix + 1, iy);
        const n01 = this._hash(ix, iy + 1);
        const n11 = this._hash(ix + 1, iy + 1);

        // 双线性插值
        const nx0 = n00 + sx * (n10 - n00);
        const nx1 = n01 + sx * (n11 - n01);

        return nx0 + sy * (nx1 - nx0);
    }

    /**
     * 2D 哈希函数
     * 将整数坐标映射为伪随机浮点数
     * @param {number} x - 整数 X
     * @param {number} y - 整数 Y
     * @returns {number} 伪随机值 (0-1)
     */
    _hash(x, y) {
        let n = x * 374761393 + y * 668265263;
        n = ((n >> 13) ^ n) * 1274126177;
        n = (n >> 16) ^ n;
        return (n & 0x7fffffff) / 0x7fffffff;
    }

    /**
     * 根据海拔高度返回对应颜色
     * 实现从深绿（谷地）到白色（雪峰）的渐变
     * @param {number} height - 归一化高度 (0-1)
     * @returns {Color} Three.js 颜色对象
     */
    _getHeightColor(height) {
        // 颜色梯度定义
        const gradient = [
            { h: 0.00, color: new Color(0x1a472a) },  // 深绿（谷底）
            { h: 0.15, color: new Color(0x2d5a27) },  // 绿色
            { h: 0.30, color: new Color(0x4a7c3f) },  // 浅绿
            { h: 0.45, color: new Color(0x7cba3d) },  // 草绿（平原）
            { h: 0.60, color: new Color(0x8b7355) },  // 棕色（山脚）
            { h: 0.75, color: new Color(0x808080) },  // 灰色（山腰）
            { h: 0.90, color: new Color(0xa0a0a0) },  // 浅灰（山顶）
            { h: 1.00, color: new Color(0xf0f0f0) }   // 白色（雪峰）
        ];

        // 找到高度所在的区间
        let lower = gradient[0];
        let upper = gradient[gradient.length - 1];

        for (let i = 0; i < gradient.length - 1; i++) {
            if (height >= gradient[i].h && height <= gradient[i + 1].h) {
                lower = gradient[i];
                upper = gradient[i + 1];
                break;
            }
        }

        // 在区间内线性插值
        const t = (upper.h - lower.h) > 0
            ? (height - lower.h) / (upper.h - lower.h)
            : 0;

        return new Color().lerpColors(lower.color, upper.color, t);
    }

    /**
     * 获取地形网格对象
     * @returns {THREE.Mesh|null}
     */
    getMesh() {
        return this.mesh;
    }
}

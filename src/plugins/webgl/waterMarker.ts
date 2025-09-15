// 指定轮廓的水体渲染，
// 输入参数：高度，轮廓（三维坐标组成的数组）
// 先创建一个半透明的水蓝色，上下底面为多边形的棱柱，侧面为透明的
// 上顶面的材质替换为水体材质，水体材质为透明，反射为水体颜色，折射为水体颜色

import { THREE } from "../basePlugin";
import { Water } from "../../utils/three-imports"

interface UpdateParams {
    deltaTime: number;
    elapsedTime: number;
    frameTime: number;
    fps:number;
}

// 水体配置接口
interface WaterMarkerOptions {
    height: number; // 水体高度
    contour: THREE.Vector3[]; // 轮廓坐标数组（描述底面轮廓，x,z定义水平形状，y为底面高度）
    position?: THREE.Vector3 | null; // 水体位置
    waterColor?: number; // 水体颜色
    transparency?: number; // 透明度 (0-1)
    reflectivity?: number; // 反射强度 (0-1)
    refractionRatio?: number; // 折射比率
    flowSpeed?: number; // 水流速度
    waveScale?: number; // 波纹缩放
    distortionScale?: number; // 扭曲强度
    enableAnimation?: boolean; // 是否启用动画
    waterNormalsTexture?: string; // 水面法线贴图路径
}

export class WaterMarker {
    private options: WaterMarkerOptions;
    private group: THREE.Group;
    private waterMesh: THREE.Mesh | null = null;
    private waterMaterial: THREE.ShaderMaterial | null = null;
    private sideMaterial: THREE.MeshPhongMaterial | null = null;
    private animationTime: number = 0;
    private scene: THREE.Scene | null = null;

    constructor(options: WaterMarkerOptions) {
        // 设置默认值
        this.options = {
            position: null,
            waterColor: 0x4a90e2,
            transparency: 0.7,
            reflectivity: 0.8,
            refractionRatio: 1.33,
            flowSpeed: 0.5,
            waveScale: 1.0,
            distortionScale: 3.7,
            enableAnimation: true,
            ...options,
        };

        this.group = new THREE.Group();
        this.visible = false // 默认不显示

        this.validateOptions();
        this.init(this.options);
    }

    get visible() {
        return this.group.visible
    }

    set visible(value){
        this.group.visible = value 
    }

    /**
     * 验证输入参数
     */
    private validateOptions(): void {
        if (!this.options.contour || this.options.contour.length < 3) {
            throw new Error("WaterMarker: 轮廓至少需要3个点");
        }

        if (this.options.height <= 0) {
            throw new Error("WaterMarker: 高度必须大于0");
        }

        console.log(`🌊 WaterMarker 初始化: 轮廓点数=${this.options.contour.length}, 高度=${this.options.height}`);
    }

    /**
     * 初始化水体
     */
    public init(options: WaterMarkerOptions): void {
        this.options = options;
        const materials = this.createMaterials();
        this.waterMesh = new THREE.Mesh(this.createGeometry(), materials);
        this.group.add(this.waterMesh);
    }

    /**
     * 创建材质
     */
    private createMaterials(): THREE.Material[] {
        // 创建水面材质（用于顶面）
        const waterMaterial = this.createWaterMaterial();
        
        // 创建侧面和底面的简单半透明材质
        const sideMaterial = new THREE.MeshPhongMaterial({
            color: this.options.waterColor,
            transparent: true,
            opacity: this.options.transparency,
            side: THREE.DoubleSide,
        });
        sideMaterial.alphaToCoverage = true
        sideMaterial.alphaTest = 0.2
        
        // 保存材质引用
        this.waterMaterial = waterMaterial;
        this.sideMaterial = sideMaterial;
        
        // ExtrudeGeometry的材质顺序：[侧面材质, 顶面材质, 底面材质]
        return [waterMaterial, sideMaterial, sideMaterial, sideMaterial];
    }

    /**
     * 创建水面材质（仅用于顶面）
     */
    private createWaterMaterial(): THREE.ShaderMaterial {
        let waterConfig = {
            textureWidth: 512,
            textureHeight: 512,
            alpha: 1.0,
            time: 0,
            waterColor: 0x4a90e2,
            distortionScale: 2.0,
            waterNormalsUrl: "./textures/waternormals.jpg",
            animationSpeed: 0.3,
            waveScale: 0.5
        };
        const finalWaterColor = waterConfig.waterColor

        // 处理其他可选属性的默认值
        const finalTextureWidth = waterConfig.textureWidth || 512
        const finalTextureHeight = waterConfig.textureHeight || 512
        const finalAlpha = waterConfig.alpha !== undefined ? waterConfig.alpha : 0
        const finalDistortionScale = waterConfig.distortionScale !== undefined ? waterConfig.distortionScale : 3.7
        
        
        // 创建水面几何体
        const waterGeometry = new THREE.PlaneGeometry(100, 100)

        // 创建水面
        const water = new Water(waterGeometry, {
            textureWidth: finalTextureWidth,
            textureHeight: finalTextureHeight,
            waterNormals: new THREE.TextureLoader().load(
                waterConfig.waterNormalsUrl || "./textures/waternormals.jpg",
                function (texture) {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
                },
            ),
            sunDirection: new THREE.Vector3(),
            waterColor: finalWaterColor,
            distortionScale: finalDistortionScale,
        })

        return water.material
    }

    /**
     * 创建几何体、以ExtrudeGeometry创建
     */
    private createGeometry(): THREE.ExtrudeGeometry {
        // 修复：使用轮廓中心点作为参考，而不是最小Y值
        const contourYValues = this.options.contour.map(p => p.y);
        const avgY = contourYValues.reduce((sum, y) => sum + y, 0) / contourYValues.length;
        
        // 计算轮廓的中心点（用于相对坐标转换）
        const centerX = this.options.contour.reduce((sum, p) => sum + p.x, 0) / this.options.contour.length;
        const centerZ = this.options.contour.reduce((sum, p) => sum + p.z, 0) / this.options.contour.length;
        
        const shape = new THREE.Shape();
        
        // 修复：转换为相对于中心点的本地坐标
        const firstPoint = this.options.contour[0];
        shape.moveTo(firstPoint.x - centerX, firstPoint.z - centerZ);
        
        // 添加其他轮廓点（相对坐标）
        for (let i = 1; i < this.options.contour.length; i++) {
            const point = this.options.contour[i];
            shape.lineTo(point.x - centerX, point.z - centerZ);
        }
        
        // 闭合路径
        shape.closePath();
        
        // 拉伸设置 - 沿Z轴拉伸
        const extrudeSettings = {
            depth: this.options.height,
            bevelEnabled: false,
            bevelSize: 0,
            bevelThickness: 0,
            bevelSegments: 0,
            steps: 1,
            curveSegments: 12
        };
        
        // 使用ExtrudeGeometry创建几何体
        const extrudeGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        extrudeGeometry.rotateX(-Math.PI / 2);
        extrudeGeometry.translate(centerX, avgY, centerZ);
        
        console.log(`🔧 水体几何体创建完成: 轮廓点数=${this.options.contour.length}, 高度=${this.options.height}`);
        console.log(`📍 中心点: (${centerX.toFixed(2)}, ${avgY.toFixed(2)}, ${centerZ.toFixed(2)})`);
        
        return extrudeGeometry;
    }

    /**
     * 颜色变暗工具函数
     */
    private darkenColor(color: number, factor: number): number {
        const c = new THREE.Color(color);
        c.r *= 1 - factor;
        c.g *= 1 - factor;
        c.b *= 1 - factor;
        return c.getHex();
    }

    /**
     * 更新动画
     */
    public update({ deltaTime, elapsedTime, frameTime, fps }: UpdateParams): void {
        if (!this.options.enableAnimation) return;

        this.animationTime += deltaTime * this.options.flowSpeed!;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.time.value = this.animationTime;
        }
    }

    /**
     * 从场景移除
     */
    public removeFromScene(): void {
        if (this.scene) {
            this.scene.remove(this.group);
            this.scene = null;
            console.log("🗑️ WaterMarker 已从场景移除");
        }
    }

    /**
     * 设置位置
     */
    public setPosition(position: THREE.Vector3): void {
        this.group.position.copy(position);
        this.options.position = position.clone();
        this.group.updateMatrixWorld()
    }

    /**
     * 获取位置
     */
    public getPosition(): THREE.Vector3 {
        return this.group.position.clone();
    }

    /**
     * 设置水体颜色
     */
    public setWaterColor(color: number): void {
        this.options.waterColor = color;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.waterColor.value = new THREE.Color(color);
        }
        if (this.sideMaterial) {
            this.sideMaterial.color.setHex(color);
        }
    }

    /**
     * 设置透明度
     */
    public setTransparency(transparency: number): void {
        transparency = Math.max(0, Math.min(1, transparency));
        this.options.transparency = transparency;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.transparency.value = transparency;
        }
        if (this.sideMaterial) {
            this.sideMaterial.opacity = transparency * 0.4;
        }
    }

    /**
     * 设置波浪参数
     */
    public setWaveParameters(waveScale: number, distortionScale: number): void {
        this.options.waveScale = waveScale;
        this.options.distortionScale = distortionScale;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.waveScale.value = waveScale;
            this.waterMaterial.uniforms.distortionScale.value = distortionScale;
        }
    }

    /**
     * 启用/禁用动画
     */
    public setAnimationEnabled(enabled: boolean): void {
        this.options.enableAnimation = enabled;
    }

    /**
     * 更新轮廓（重新生成几何体）
     */
    public updateContour(newContour: THREE.Vector3[]): void {
        if (newContour.length < 3) {
            console.warn("⚠️ 轮廓至少需要3个点");
            return;
        }

        this.options.contour = newContour;

        // 重新创建几何体（会自动处理坐标系统和旋转）
        const extrudeGeometry = this.createGeometry();
        
        if (this.waterMesh) {
            // 清理旧的几何体
            this.waterMesh.geometry.dispose();
            // 更新几何体
            this.waterMesh.geometry = extrudeGeometry;
        } else {
            // 如果没有现有的mesh，创建新的
            const materials = this.createMaterials();
            this.waterMesh = new THREE.Mesh(extrudeGeometry, materials);
            this.group.add(this.waterMesh);
        }
        
        // 计算新轮廓的中心点信息（与createGeometry保持一致）
        const contourYValues = newContour.map(p => p.y);
        const avgY = contourYValues.reduce((sum, y) => sum + y, 0) / contourYValues.length;
        const centerX = newContour.reduce((sum, p) => sum + p.x, 0) / newContour.length;
        const centerZ = newContour.reduce((sum, p) => sum + p.z, 0) / newContour.length;
        
        console.log(`🔄 轮廓已更新: ${newContour.length} 个点`);
        console.log(`📍 新中心点: (${centerX.toFixed(2)}, ${avgY.toFixed(2)}, ${centerZ.toFixed(2)})`);
    }

    /**
     * 清除几何体
     */
    private clearGeometry(): void {
        // 移除现有网格
        if (this.waterMesh) {
            this.group.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh = null;
        }
    }

    /**
     * 获取配置信息
     */
    public getOptions(): WaterMarkerOptions {
        return { ...this.options };
    }

    /**
     * 获取群组对象
     */
    public getGroup(): THREE.Group {
        return this.group;
    }

    /**
     * 销毁资源
     */
    public dispose(): void {
        this.removeFromScene();
        this.clearGeometry();

        // 清理材质
        if (this.waterMaterial) {
            this.waterMaterial.dispose();
        }
        if (this.sideMaterial) {
            this.sideMaterial.dispose();
        }

        console.log("🗑️ WaterMarker 资源已释放");
    }
}

import { THREE, BasePlugin } from "../basePlugin"
import fireMaterial from "../../glsl/fire"

// 火焰配置参数接口
interface FireMarkerConfig {
    // 基础属性
    position: THREE.Vector3 | [number, number, number] // 火焰位置
    size: number // 火焰大小
    billboard: boolean // 是否启用Billboard效果
    visible: boolean // 是否可见

    // 视觉效果
    intensity: number // 火焰强度 (0-1)
    animationSpeed: number // 动画速度倍率
    baseColor: THREE.Color | number // 基础火焰颜色
    tipColor: THREE.Color | number // 火焰顶部颜色

    // 渲染属性
    opacity: number // 整体透明度
    renderOrder: number // 渲染顺序
    depthWrite: boolean // 是否写入深度缓冲
    depthTest: boolean // 是否进行深度测试

    // 动画属性
    flickerIntensity: number // 闪烁强度
    waveAmplitude: number // 波动幅度

    debugMode?: boolean // 是否启用调试模式

    // 回调函数
    onUpdate?: (deltaTime: number) => void // 更新回调
    onVisibilityChange?: (visible: boolean) => void // 可见性变化回调
}

// 默认配置
const DEFAULT_CONFIG: FireMarkerConfig = {
    position: [0, 0, 0],
    size: 1.0,
    billboard: true,
    visible: true,
    intensity: 1.0,
    animationSpeed: 1.0,
    baseColor: 0xff4400,
    tipColor: 0xffff00,
    opacity: 1.0,
    renderOrder: 100,
    depthWrite: false,
    depthTest: true,
    flickerIntensity: 0.1,
    waveAmplitude: 0.1,
    debugMode: false,
}

// 3D火焰对象类
export class FireMarker {
    private config: FireMarkerConfig
    private geometry: THREE.PlaneGeometry
    private material: THREE.ShaderMaterial
    private mesh: THREE.Mesh
    private scene: THREE.Scene | null = null
    private camera: THREE.Camera | null = null

    // 动画相关
    private startTime: number
    private lastUpdateTime: number
    private isAnimating: boolean = true

    // Billboard相关
    private billboardEnabled: boolean = true

    constructor(config: Partial<FireMarkerConfig> = {}) {
        // 合并默认配置
        this.config = { ...DEFAULT_CONFIG, ...config }

        // 记录开始时间
        this.startTime = performance.now()
        this.lastUpdateTime = this.startTime

        // 初始化几何体
        this.geometry = this.createGeometry()

        // 🔧 创建材质的独立副本
        this.material = this.createMaterial()

        // 创建网格
        this.mesh = this.createMesh()
        this.mesh.renderOrder = 10
        // 应用初始配置
        this.applyConfig()

        if (this.config.debugMode) {
            console.log("🔥 FireMarker created with config:", this.config)
            console.log("🔥 Geometry:", this.geometry)
            console.log("🔥 Material:", this.material)
            console.log("🔥 Mesh:", this.mesh)
        } else {
            console.log("🔥 FireMarker created at position:", this.config.position)
        }
    }

    /**
     * 创建材质的独立副本
     */
    private createMaterial(): THREE.ShaderMaterial {
        // 克隆共享材质以创建独立实例
        const material = fireMaterial.clone()
        
        // 确保 uniforms 也被正确克隆
        material.uniforms = THREE.UniformsUtils.clone(fireMaterial.uniforms)
        
        // 设置材质属性
        material.transparent = true
        material.blending = THREE.AdditiveBlending
        material.depthWrite = this.config.depthWrite
        material.depthTest = false
        material.side = THREE.DoubleSide
        
        if (this.config.debugMode) {
            console.log("🔥 Material uniforms:", Object.keys(material.uniforms))
        }
        
        return material
    }

    /**
     * 创建平面几何体
     */
    private createGeometry(): THREE.PlaneGeometry {
        // 创建合适尺寸的平面几何体
        const geometry = new THREE.PlaneGeometry(
            this.config.size,
            this.config.size,
            6, // 增加width segments以获得更好的变形效果
            12, // 增加height segments以获得更好的变形效果
        )

        // 优化几何体
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()

        return geometry
    }

    /**
     * 创建网格对象
     */
    private createMesh(): THREE.Mesh {
        const mesh = new THREE.Mesh(this.geometry, this.material)

        // 设置渲染顺序
        mesh.renderOrder = 2

        // 设置名称和标识
        mesh.name = "FireMarker"
        mesh.userData.isFireMarker = true

        return mesh
    }

    /**
     * 应用配置
     */
    private applyConfig(): void {
        // 设置位置
        const position = Array.isArray(this.config.position)
            ? new THREE.Vector3(...this.config.position)
            : this.config.position
        this.mesh.position.copy(position)

        // 设置可见性
        this.mesh.visible = this.config.visible

        // 设置Billboard
        this.billboardEnabled = this.config.billboard

        // 更新材质uniforms
        this.updateMaterialUniforms()
    }

    /**
     * 更新材质uniforms
     */
    private updateMaterialUniforms(): void {
        if (!this.material.uniforms) {
            console.warn("🔥 Material uniforms not found")
            return
        }

        // 安全地设置每个 uniform，检查是否存在
        const uniforms = this.material.uniforms

        if (uniforms.intensity) {
            uniforms.intensity.value = this.config.intensity
        }

        if (uniforms.baseColor) {
            const baseColor = typeof this.config.baseColor === "number" 
                ? new THREE.Color(this.config.baseColor) 
                : this.config.baseColor
            uniforms.baseColor.value.copy(baseColor)
        }

        if (uniforms.tipColor) {
            const tipColor = typeof this.config.tipColor === "number" 
                ? new THREE.Color(this.config.tipColor) 
                : this.config.tipColor
            uniforms.tipColor.value.copy(tipColor)
        }

        if (uniforms.opacity) {
            uniforms.opacity.value = this.config.opacity
        }

        if (uniforms.flickerIntensity) {
            uniforms.flickerIntensity.value = this.config.flickerIntensity
        }

        if (uniforms.waveAmplitude) {
            uniforms.waveAmplitude.value = this.config.waveAmplitude
        }

        // 设置时间相关 uniforms
        if (uniforms.iTime) {
            uniforms.iTime.value = 0
        }

        if (uniforms.time) {
            uniforms.time.value = 0
        }

        // 设置分辨率
        if (uniforms.iResolution) {
            uniforms.iResolution.value.set(window.innerWidth, window.innerHeight)
        }

        if (this.config.debugMode) {
            console.log("🔥 Updated material uniforms:", {
                intensity: uniforms.intensity?.value,
                baseColor: uniforms.baseColor?.value,
                tipColor: uniforms.tipColor?.value,
                opacity: uniforms.opacity?.value,
                flickerIntensity: uniforms.flickerIntensity?.value,
                waveAmplitude: uniforms.waveAmplitude?.value
            })
        }
    }

    /**
     * 添加到场景
     */
    public addToScene(scene: THREE.Scene, camera?: THREE.Camera): void {
        this.scene = scene
        if (camera) {
            this.camera = camera
        }

        scene.add(this.mesh)
        console.log("🔥 FireMarker added to scene")
    }

    /**
     * 从场景移除
     */
    public removeFromScene(): void {
        if (this.scene && this.mesh) {
            this.scene.remove(this.mesh)
            this.scene = null
            console.log("🔥 FireMarker removed from scene")
        }
    }

    /**
     * 更新动画（需要在渲染循环中调用）
     */
    public update(deltaTime?: number): void {
        if (!this.isAnimating) return

        const currentTime = performance.now()
        const dt = deltaTime || (currentTime - this.lastUpdateTime) / 1000
        this.lastUpdateTime = currentTime

        // 更新时间uniform
        const elapsedTime = ((currentTime - this.startTime) / 1000) * this.config.animationSpeed
        if (this.material.uniforms) {
            if (this.material.uniforms.time) {
                this.material.uniforms.time.value = elapsedTime
            }
            if (this.material.uniforms.iTime) {
                this.material.uniforms.iTime.value = elapsedTime
            }
        }

        // Billboard效果
        if (this.billboardEnabled && this.camera) {
            this.mesh.lookAt(this.camera.position)
        }

        // 调用用户更新回调
        if (this.config.onUpdate) {
            this.config.onUpdate(dt)
        }
    }

    /**
     * 设置位置
     */
    public setPosition(position: THREE.Vector3 | [number, number, number]): void {
        const pos = Array.isArray(position) ? new THREE.Vector3(...position) : position
        this.mesh.position.copy(pos)
        this.config.position = pos
    }

    /**
     * 获取位置
     */
    public getPosition(): THREE.Vector3 {
        return this.mesh.position.clone()
    }

    /**
     * 设置可见性
     */
    public setVisible(visible: boolean): void {
        this.mesh.visible = visible
        this.config.visible = visible

        if (this.config.onVisibilityChange) {
            this.config.onVisibilityChange(visible)
        }
    }

    /**
     * 获取可见性
     */
    public getVisible(): boolean {
        return this.mesh.visible
    }

    /**
     * 设置大小
     */
    public setSize(size: number): void {
        this.config.size = size
        this.mesh.scale.setScalar(size)
    }

    /**
     * 设置强度
     */
    public setIntensity(intensity: number): void {
        this.config.intensity = Math.max(0, Math.min(1, intensity))
        if (this.material.uniforms && this.material.uniforms.intensity) {
            this.material.uniforms.intensity.value = this.config.intensity
        }
    }

    /**
     * 设置Billboard
     */
    public setBillboard(enabled: boolean): void {
        this.billboardEnabled = enabled
        this.config.billboard = enabled
    }

    /**
     * 启动动画
     */
    public startAnimation(): void {
        this.isAnimating = true
        this.startTime = performance.now()
    }

    /**
     * 停止动画
     */
    public stopAnimation(): void {
        this.isAnimating = false
    }

    /**
     * 获取网格对象
     */
    public getMesh(): THREE.Mesh {
        return this.mesh
    }

    /**
     * 获取配置
     */
    public getConfig(): FireMarkerConfig {
        return { ...this.config }
    }

    /**
     * 更新配置
     */
    public updateConfig(newConfig: Partial<FireMarkerConfig>): void {
        this.config = { ...this.config, ...newConfig }
        this.applyConfig()
    }

    /**
     * 销毁火焰对象
     */
    public dispose(): void {
        if (this.scene) {
            this.removeFromScene()
        }
        
        if (this.geometry) {
            this.geometry.dispose()
        }
        
        if (this.material) {
            this.material.dispose()
        }
        
        console.log("🔥 FireMarker disposed")
    }
}

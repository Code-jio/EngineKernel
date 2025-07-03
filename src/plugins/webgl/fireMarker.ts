import THREE from "utils/three-imports"
import fire from "../../glsl/fire"

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
    opacity: 0.8,
    renderOrder: 1000,
    depthWrite: false,
    depthTest: true,
    flickerIntensity: 0.1,
    waveAmplitude: 0.1,
}

// 3D火焰对象类
export default class FireMarker {
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

        // 初始化材质
        this.material = this.createMaterial()

        // 创建网格
        this.mesh = this.createMesh()

        // 应用初始配置
        this.applyConfig()

        console.log("🔥 FireMarker created:", this.config)
    }

    /**
     * 创建平面几何体
     */
    private createGeometry(): THREE.PlaneGeometry {
        // 创建合适尺寸的平面几何体
        const geometry = new THREE.PlaneGeometry(
            this.config.size,
            this.config.size * 1.5, // 火焰通常更高
            4, // width segments
            8, // height segments - 更多段数以获得更好的变形效果
        )

        // 优化几何体
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()

        return geometry
    }

    /**
     * 创建火焰Shader材质
     */
    private createMaterial(): THREE.ShaderMaterial {
        // 准备uniforms
        const uniforms = {
            time: { value: 0.0 },
            intensity: { value: this.config.intensity },
            baseColor: { value: new THREE.Color(this.config.baseColor) },
            tipColor: { value: new THREE.Color(this.config.tipColor) },
            opacity: { value: this.config.opacity },
            flickerIntensity: { value: this.config.flickerIntensity },
            waveAmplitude: { value: this.config.waveAmplitude },
        }

        // 创建Shader材质
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: this.getEnhancedVertexShader(),
            fragmentShader: this.getEnhancedFragmentShader(),
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide,
            depthWrite: this.config.depthWrite,
            depthTest: this.config.depthTest,
            blending: THREE.AdditiveBlending, // 火焰使用加法混合效果更佳
        })

        return material
    }

    /**
     * 获取增强的顶点着色器
     */
    private getEnhancedVertexShader(): string {
        return `
            uniform float time;
            uniform float intensity;
            uniform float flickerIntensity;
            uniform float waveAmplitude;
            
            varying vec2 vUv;
            varying float vFlicker;
            
            void main() {
                vUv = uv;
                
                vec3 pos = position;
                
                // 基础火焰向上膨胀效果
                float heightFactor = uv.y * uv.y; // 越往上变形越明显
                pos.y += heightFactor * 0.2 * sin(time * 2.0 + uv.x * 8.0) * intensity;
                
                // 横向扰动
                pos.x += waveAmplitude * sin(time * 3.0 + uv.y * 6.0) * heightFactor * intensity;
                pos.z += waveAmplitude * cos(time * 2.5 + uv.y * 5.0) * heightFactor * intensity * 0.5;
                
                // 闪烁效果
                vFlicker = 1.0 + flickerIntensity * sin(time * 8.0 + uv.x * 20.0 + uv.y * 15.0);
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `
    }

    /**
     * 获取增强的片元着色器
     */
    private getEnhancedFragmentShader(): string {
        return `
            uniform float time;
            uniform float intensity;
            uniform float opacity;
            uniform vec3 baseColor;
            uniform vec3 tipColor;
            
            varying vec2 vUv;
            varying float vFlicker;
            
            void main() {
                // 基于高度的颜色渐变
                float heightGradient = smoothstep(0.0, 1.0, vUv.y);
                vec3 flameColor = mix(baseColor, tipColor, heightGradient);
                
                // 噪声效果
                float noise1 = fract(sin(time * 2.0 + vUv.x * 100.0) * 10000.0);
                float noise2 = fract(sin(time * 3.0 + vUv.y * 80.0) * 8000.0);
                float combinedNoise = mix(noise1, noise2, 0.5);
                combinedNoise = smoothstep(0.2, 0.8, combinedNoise);
                
                // 火焰形状 - 底部宽，顶部窄
                float flameShape = 1.0 - vUv.y * vUv.y;
                float horizontalFade = 1.0 - abs(vUv.x - 0.5) * 2.0;
                float coreShape = flameShape * horizontalFade;
                
                // 透明度计算
                float alpha = coreShape * combinedNoise * intensity * opacity * vFlicker;
                alpha = smoothstep(0.1, 0.9, alpha);
                
                // 边缘发光效果
                float glow = pow(coreShape, 0.5) * 0.3;
                flameColor += glow;
                
                gl_FragColor = vec4(flameColor, alpha);
            }
        `
    }

    /**
     * 创建网格对象
     */
    private createMesh(): THREE.Mesh {
        const mesh = new THREE.Mesh(this.geometry, this.material)

        // 设置渲染顺序
        mesh.renderOrder = this.config.renderOrder

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
        if (this.material.uniforms) {
            this.material.uniforms.intensity.value = this.config.intensity
            this.material.uniforms.baseColor.value.setHex(
                typeof this.config.baseColor === "number" ? this.config.baseColor : this.config.baseColor.getHex(),
            )
            this.material.uniforms.tipColor.value.setHex(
                typeof this.config.tipColor === "number" ? this.config.tipColor : this.config.tipColor.getHex(),
            )
            this.material.uniforms.opacity.value = this.config.opacity
            this.material.uniforms.flickerIntensity.value = this.config.flickerIntensity
            this.material.uniforms.waveAmplitude.value = this.config.waveAmplitude
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
        if (this.material.uniforms && this.material.uniforms.time) {
            this.material.uniforms.time.value = elapsedTime
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
     * 启用/禁用Billboard效果
     */
    public setBillboard(enabled: boolean): void {
        this.billboardEnabled = enabled
        this.config.billboard = enabled
    }

    /**
     * 开始动画
     */
    public startAnimation(): void {
        this.isAnimating = true
        this.startTime = performance.now()
        this.lastUpdateTime = this.startTime
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
     * 销毁资源
     */
    public dispose(): void {
        // 从场景移除
        this.removeFromScene()

        // 释放几何体
        if (this.geometry) {
            this.geometry.dispose()
        }

        // 释放材质
        if (this.material) {
            this.material.dispose()
        }

        // 清空引用
        this.scene = null
        this.camera = null

        console.log("🔥 FireMarker disposed")
    }
}

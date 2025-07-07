import { THREE, BasePlugin } from "../basePlugin"
import { fire } from "../../glsl/fire"

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

    // 新增优化属性
    turbulenceScale: number // 湍流强度
    windDirection: [number, number] // 风向
    windStrength: number // 风力强度
    fireHeight: number // 火焰高度比例
    coreIntensity: number // 核心亮度
    edgeSoftness: number // 边缘柔和度
    temperatureVariation: number // 温度变化
    sparkleIntensity: number // 火星效果强度

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
    // 新增默认值
    turbulenceScale: 1.0,
    windDirection: [0.1, 0.0],
    windStrength: 0.2,
    fireHeight: 1.5,
    coreIntensity: 1.2,
    edgeSoftness: 0.8,
    temperatureVariation: 0.3,
    sparkleIntensity: 0.2,
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

        // 初始化材质
        this.material = this.createMaterial()

        // 创建网格
        this.mesh = this.createMesh()

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
     * 创建平面几何体
     */
    private createGeometry(): THREE.PlaneGeometry {
        // 创建合适尺寸的平面几何体
        const geometry = new THREE.PlaneGeometry(
            this.config.size,
            this.config.size * this.config.fireHeight,
            6, // 增加width segments以获得更好的变形效果
            12, // 增加height segments以获得更好的变形效果
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
            // 新增uniforms
            turbulenceScale: { value: this.config.turbulenceScale },
            windDirection: { value: new THREE.Vector2(this.config.windDirection[0], this.config.windDirection[1]) },
            windStrength: { value: this.config.windStrength },
            coreIntensity: { value: this.config.coreIntensity },
            edgeSoftness: { value: this.config.edgeSoftness },
            temperatureVariation: { value: this.config.temperatureVariation },
            sparkleIntensity: { value: this.config.sparkleIntensity },
        }

        // 创建Shader材质
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: this.getOptimizedVertexShader(),
            fragmentShader: this.getOptimizedFragmentShader(),
            transparent: true,
            alphaTest: 0.01,
            side: THREE.DoubleSide,
            depthWrite: this.config.depthWrite,
            depthTest: this.config.depthTest,
            blending: THREE.AdditiveBlending, // 使用加法混合模式获得更好的发光效果
        })

        return material
    }

    /**
     * 获取优化的顶点着色器
     */
    private getOptimizedVertexShader(): string {
        return `
            uniform float time;
            uniform float intensity;
            uniform float flickerIntensity;
            uniform float waveAmplitude;
            uniform float turbulenceScale;
            uniform vec2 windDirection;
            uniform float windStrength;
            
            varying vec2 vUv;
            varying float vFlicker;
            varying float vNoise;
            varying float vHeight;
            
            // 改进的噪声函数
            float noise(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            float smoothNoise(vec2 p) {
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                
                float a = noise(floor(p));
                float b = noise(floor(p) + vec2(1.0, 0.0));
                float c = noise(floor(p) + vec2(0.0, 1.0));
                float d = noise(floor(p) + vec2(1.0, 1.0));
                
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }
            
            float turbulence(vec2 p, float scale) {
                float value = 0.0;
                float amplitude = 1.0;
                
                for (int i = 0; i < 4; i++) {
                    value += amplitude * smoothNoise(p * scale);
                    p *= 2.0;
                    amplitude *= 0.5;
                    scale *= 0.5;
                }
                
                return value;
            }
            
            void main() {
                vUv = uv;
                vHeight = uv.y;
                
                vec3 pos = position;
                
                // 多层次噪声扰动
                vec2 noiseCoord = uv * 3.0 + time * 0.1;
                float turbulenceValue = turbulence(noiseCoord, turbulenceScale * 4.0);
                vNoise = turbulenceValue;
                
                // 基于高度的火焰形状控制
                float heightFactor = pow(uv.y, 1.5);
                float baseWidth = 1.0 - heightFactor * 0.6;
                
                // 主要火焰扰动
                float mainWave = sin(time * 2.0 + uv.x * 8.0 + turbulenceValue * 3.0) * heightFactor;
                float secondaryWave = sin(time * 3.5 + uv.y * 12.0 + turbulenceValue * 2.0) * heightFactor * 0.5;
                
                // 火焰向上膨胀
                pos.y += (mainWave + secondaryWave) * waveAmplitude * intensity * baseWidth;
                
                // 横向扰动（受风向影响）
                vec2 windEffect = windDirection * windStrength * heightFactor;
                pos.x += (windEffect.x + mainWave * 0.3) * intensity * baseWidth;
                pos.z += (windEffect.y + secondaryWave * 0.2) * intensity * baseWidth;
                
                // 火焰顶部收缩效果
                float tipShrink = smoothstep(0.7, 1.0, uv.y);
                pos.x *= (1.0 - tipShrink * 0.3);
                pos.z *= (1.0 - tipShrink * 0.3);
                
                // 闪烁效果
                float flicker1 = sin(time * 8.0 + uv.x * 20.0 + turbulenceValue * 10.0);
                float flicker2 = sin(time * 12.0 + uv.y * 15.0 + turbulenceValue * 8.0);
                vFlicker = 1.0 + flickerIntensity * (flicker1 + flicker2 * 0.5);
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
            }
        `
    }

    /**
     * 获取优化的片元着色器
     */
    private getOptimizedFragmentShader(): string {
        return `
            uniform float time;
            uniform float intensity;
            uniform float opacity;
            uniform vec3 baseColor;
            uniform vec3 tipColor;
            uniform float coreIntensity;
            uniform float edgeSoftness;
            uniform float temperatureVariation;
            uniform float sparkleIntensity;
            
            varying vec2 vUv;
            varying float vFlicker;
            varying float vNoise;
            varying float vHeight;
            
            // 改进的噪声函数
            float hash(float n) {
                return fract(sin(n) * 43758.5453);
            }
            
            float noise(vec2 p) {
                vec2 f = fract(p);
                vec2 u = f * f * (3.0 - 2.0 * f);
                
                float a = hash(dot(floor(p), vec2(1.0, 57.0)));
                float b = hash(dot(floor(p) + vec2(1.0, 0.0), vec2(1.0, 57.0)));
                float c = hash(dot(floor(p) + vec2(0.0, 1.0), vec2(1.0, 57.0)));
                float d = hash(dot(floor(p) + vec2(1.0, 1.0), vec2(1.0, 57.0)));
                
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }
            
            void main() {
                // 火焰形状控制
                float centerDist = abs(vUv.x - 0.5) * 2.0;
                float heightGradient = vHeight;
                
                // 基础火焰形状 - 底部宽，顶部窄
                float flameShape = (1.0 - centerDist) * (1.0 - pow(heightGradient, 1.2));
                flameShape = smoothstep(0.0, edgeSoftness, flameShape);
                
                // 多层次噪声
                vec2 noiseCoord1 = vUv * 8.0 + time * 0.3;
                vec2 noiseCoord2 = vUv * 16.0 + time * 0.5;
                vec2 noiseCoord3 = vUv * 32.0 + time * 0.8;
                
                float noise1 = noise(noiseCoord1);
                float noise2 = noise(noiseCoord2) * 0.5;
                float noise3 = noise(noiseCoord3) * 0.25;
                
                float combinedNoise = noise1 + noise2 + noise3;
                combinedNoise = smoothstep(0.2, 0.8, combinedNoise);
                
                // 火焰核心
                float coreSize = smoothstep(0.6, 0.2, centerDist) * smoothstep(0.8, 0.0, heightGradient);
                float coreGlow = coreSize * coreIntensity;
                
                // 温度变化效果
                float temperature = mix(0.6, 1.4, heightGradient + temperatureVariation * vNoise);
                
                // 颜色计算
                vec3 hotColor = mix(baseColor, tipColor, heightGradient);
                vec3 coolColor = baseColor * 0.8;
                vec3 flameColor = mix(coolColor, hotColor, temperature);
                
                // 火星效果
                float sparkle = 0.0;
                if (sparkleIntensity > 0.0) {
                    float sparkleNoise = noise(vUv * 50.0 + time * 2.0);
                    sparkle = step(0.98, sparkleNoise) * sparkleIntensity;
                    flameColor += sparkle * vec3(1.0, 0.8, 0.4);
                }
                
                // 边缘发光
                float edgeGlow = pow(flameShape, 0.8) * 0.4;
                flameColor += edgeGlow * tipColor;
                
                // 核心高亮
                flameColor += coreGlow * vec3(1.0, 0.9, 0.6);
                
                // 最终透明度计算
                float alpha = flameShape * combinedNoise * intensity * opacity * vFlicker;
                alpha = smoothstep(0.05, 0.95, alpha);
                
                // 边缘柔化
                alpha *= smoothstep(0.0, 0.1, flameShape);
                
                // 防止过度曝光
                flameColor = clamp(flameColor, 0.0, 2.0);
                
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
            // 更新新增的uniforms
            this.material.uniforms.turbulenceScale.value = this.config.turbulenceScale
            this.material.uniforms.windDirection.value.set(this.config.windDirection[0], this.config.windDirection[1])
            this.material.uniforms.windStrength.value = this.config.windStrength
            this.material.uniforms.coreIntensity.value = this.config.coreIntensity
            this.material.uniforms.edgeSoftness.value = this.config.edgeSoftness
            this.material.uniforms.temperatureVariation.value = this.config.temperatureVariation
            this.material.uniforms.sparkleIntensity.value = this.config.sparkleIntensity
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
        if (this.material.uniforms) {
            this.material.uniforms.intensity.value = this.config.intensity
        }
    }

    /**
     * 设置风向和风力
     */
    public setWind(direction: [number, number], strength: number): void {
        this.config.windDirection = direction
        this.config.windStrength = strength
        if (this.material.uniforms) {
            this.material.uniforms.windDirection.value.set(direction[0], direction[1])
            this.material.uniforms.windStrength.value = strength
        }
    }

    /**
     * 设置火焰核心强度
     */
    public setCoreIntensity(intensity: number): void {
        this.config.coreIntensity = intensity
        if (this.material.uniforms) {
            this.material.uniforms.coreIntensity.value = intensity
        }
    }

    /**
     * 设置湍流强度
     */
    public setTurbulence(scale: number): void {
        this.config.turbulenceScale = scale
        if (this.material.uniforms) {
            this.material.uniforms.turbulenceScale.value = scale
        }
    }

    /**
     * 设置火星效果
     */
    public setSparkle(intensity: number): void {
        this.config.sparkleIntensity = intensity
        if (this.material.uniforms) {
            this.material.uniforms.sparkleIntensity.value = intensity
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

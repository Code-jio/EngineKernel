import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"

/**
 * 粒子类型枚举
 */
export enum ParticleType {
    FIRE = "fire",           // 火焰粒子
    SMOKE = "smoke",         // 烟雾粒子
    SPARK = "spark",         // 火花粒子
    MAGIC = "magic",         // 魔法粒子
    WATER = "water",         // 水滴粒子
    DUST = "dust",           // 尘埃粒子
    CUSTOM = "custom"        // 自定义粒子
}

/**
 * 粒子发射器配置接口
 */
export interface ParticleConfig {
    // 基础属性
    position: THREE.Vector3 | [number, number, number]  // 发射器位置
    maxParticles: number                                  // 最大粒子数量
    emissionRate: number                                  // 发射速率 (粒子/秒)
    particleLifetime: number                             // 粒子生命周期 (秒)
    
    // 视觉效果
    particleType: ParticleType                           // 粒子类型
    startColor: THREE.Color | number                     // 起始颜色
    endColor: THREE.Color | number                       // 结束颜色
    startSize: number                                    // 起始大小
    endSize: number                                      // 结束大小
    opacity: number                                      // 整体透明度
    
    // 物理属性
    velocity: THREE.Vector3                              // 初始速度
    acceleration: THREE.Vector3                          // 加速度 (重力等)
    velocityRandomness: number                           // 速度随机性
    angularVelocity: number                             // 角速度
    
    // 发射形状
    emissionShape: 'point' | 'sphere' | 'box' | 'cone'  // 发射形状
    emissionRadius: number                               // 发射半径
    emissionAngle: number                                // 发射角度 (圆锥)
    
    // 性能优化
    enableFrustumCulling: boolean                        // 视锥剔除
    enableLOD: boolean                                   // 距离细节层次
    updateFrequency: number                              // 更新频率 (0-1)
    maxDistance: number                                  // 最大渲染距离
    
    // 渲染属性
    billboardMode: boolean                               // Billboard效果
    renderOrder: number                                  // 渲染顺序
    depthWrite: boolean                                  // 深度写入
    blendMode: THREE.Blending                           // 混合模式
    
    // 纹理
    texture?: THREE.Texture                              // 粒子纹理
    
    // 回调函数
    onParticleSpawn?: (particle: Particle) => void      // 粒子生成回调
    onParticleUpdate?: (particle: Particle, deltaTime: number) => void  // 粒子更新回调
    onParticleDeath?: (particle: Particle) => void      // 粒子消亡回调
    
    // 调试
    debugMode?: boolean                                  // 调试模式
}

/**
 * 单个粒子数据
 */
export class Particle {
    position: THREE.Vector3 = new THREE.Vector3()
    velocity: THREE.Vector3 = new THREE.Vector3()
    acceleration: THREE.Vector3 = new THREE.Vector3()
    
    life: number = 0          // 当前生命值 (0-1)
    maxLife: number = 1       // 最大生命值
    age: number = 0           // 年龄 (秒)
    
    size: number = 1          // 当前大小
    rotation: number = 0      // 当前旋转
    angularVelocity: number = 0  // 角速度
    
    color: THREE.Color = new THREE.Color()
    opacity: number = 1
    
    isActive: boolean = false  // 是否激活
    
    /**
     * 重置粒子状态（对象池复用）
     */
    reset(): void {
        this.position.set(0, 0, 0)
        this.velocity.set(0, 0, 0)
        this.acceleration.set(0, 0, 0)
        this.life = 1
        this.maxLife = 1
        this.age = 0
        this.size = 1
        this.rotation = 0
        this.angularVelocity = 0
        this.color.setHex(0xffffff)
        this.opacity = 1
        this.isActive = false
    }
    
    /**
     * 更新粒子状态
     */
    update(deltaTime: number): void {
        if (!this.isActive) return
        
        // 更新年龄和生命值
        this.age += deltaTime
        this.life = Math.max(0, 1 - this.age / this.maxLife)
        
        // 如果生命结束，标记为非激活
        if (this.life <= 0) {
            this.isActive = false
            return
        }
        
        // 更新物理状态
        this.velocity.add(this.acceleration.clone().multiplyScalar(deltaTime))
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime))
        this.rotation += this.angularVelocity * deltaTime
    }
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ParticleConfig = {
    position: [0, 0, 0],
    maxParticles: 1000,
    emissionRate: 100,
    particleLifetime: 3.0,
    
    particleType: ParticleType.FIRE,
    startColor: 0xff4400,
    endColor: 0x440000,
    startSize: 1.0,
    endSize: 0.1,
    opacity: 1.0,
    
    velocity: new THREE.Vector3(0, 5, 0),
    acceleration: new THREE.Vector3(0, -2, 0),
    velocityRandomness: 0.5,
    angularVelocity: 0,
    
    emissionShape: 'point',
    emissionRadius: 1.0,
    emissionAngle: Math.PI / 4,
    
    enableFrustumCulling: true,
    enableLOD: true,
    updateFrequency: 1.0,
    maxDistance: 100,
    
    billboardMode: true,
    renderOrder: 200,
    depthWrite: false,
    blendMode: THREE.AdditiveBlending,
    
    debugMode: false
}

/**
 * 粒子发射器主类
 */
export class ParticleEmitter extends BasePlugin {
    private config: ParticleConfig
    private scene: THREE.Scene | null = null
    private camera: THREE.Camera | null = null
    private renderer: THREE.WebGLRenderer | null = null
    
    // 粒子系统组件
    private particleSystem: THREE.Points | null = null
    private geometry: THREE.BufferGeometry | null = null
    private material: THREE.ShaderMaterial | null = null
    
    // 粒子管理
    private particles: Particle[] = []
    private particlePool: Particle[] = []
    private activeParticleCount: number = 0
    
    // 缓冲区属性
    private positionArray: Float32Array = new Float32Array(0)
    private colorArray: Float32Array = new Float32Array(0)
    private sizeArray: Float32Array = new Float32Array(0)
    private opacityArray: Float32Array = new Float32Array(0)
    private rotationArray: Float32Array = new Float32Array(0)
    
    // 时间和发射控制
    private lastEmissionTime: number = 0
    private emissionAccumulator: number = 0
    private isEmitting: boolean = true
    private startTime: number = 0
    
    // 性能监控
    private lastUpdateTime: number = 0
    private frameSkipCounter: number = 0
    private lodLevel: number = 1.0
    
    // 更新事件处理器引用
    private updateHandler: (() => void) | null = null
    
    constructor(meta: any = {}) {
        super(meta)
        
        // 合并配置
        this.config = { ...DEFAULT_CONFIG, ...meta.userData?.config }
        
        // 获取引擎组件引用
        this.scene = meta.userData?.scene || null
        this.camera = meta.userData?.camera || null
        this.renderer = meta.userData?.renderer || null
        
        // 验证配置
        this.validateConfig()
        
        // 初始化时间
        this.startTime = performance.now()
        this.lastUpdateTime = this.startTime
        
        // 初始化缓冲区
        this.initializeBuffers()
        
        // 创建粒子系统
        this.createParticleSystem()
        
        if (this.config.debugMode) {
            console.log("🎆 ParticleEmitter 创建完成:", {
                maxParticles: this.config.maxParticles,
                emissionRate: this.config.emissionRate,
                type: this.config.particleType
            })
        }
    }
    
    /**
     * 插件初始化
     */
    async init(coreInterface?: any): Promise<void> {
        if (!this.scene) {
            throw new Error("ParticleEmitter: 缺少scene引用")
        }
        
        // 添加到场景
        if (this.particleSystem) {
            this.scene.add(this.particleSystem)
        }
        
        // 注册到渲染循环
        this.updateHandler = this.update.bind(this)
        eventBus.on('update', this.updateHandler)
        
        if (this.config.debugMode) {
            console.log("✅ ParticleEmitter 初始化完成")
        }
    }
    
    /**
     * 验证配置参数
     */
    private validateConfig(): void {
        if (this.config.maxParticles > 10000) {
            console.warn('⚠️ 粒子数量过多，可能影响性能，已限制到10000')
            this.config.maxParticles = 10000
        }
        
        if (this.config.emissionRate > 1000) {
            console.warn('⚠️ 发射速率过高，已限制到1000/秒')
            this.config.emissionRate = 1000
        }
        
        if (!this.scene) {
            console.warn('⚠️ ParticleEmitter: 缺少scene引用，某些功能可能不可用')
        }
        
        // 确保颜色为Color对象
        if (typeof this.config.startColor === 'number') {
            this.config.startColor = new THREE.Color(this.config.startColor)
        }
        if (typeof this.config.endColor === 'number') {
            this.config.endColor = new THREE.Color(this.config.endColor)
        }
        
        // 确保位置为Vector3对象
        if (Array.isArray(this.config.position)) {
            this.config.position = new THREE.Vector3(...this.config.position)
        }
    }
    
    /**
     * 初始化缓冲区
     */
    private initializeBuffers(): void {
        const maxParticles = this.config.maxParticles
        
        this.positionArray = new Float32Array(maxParticles * 3)
        this.colorArray = new Float32Array(maxParticles * 3)
        this.sizeArray = new Float32Array(maxParticles)
        this.opacityArray = new Float32Array(maxParticles)
        this.rotationArray = new Float32Array(maxParticles)
        
        // 初始化粒子对象池
        this.particles = []
        this.particlePool = []
        
        for (let i = 0; i < maxParticles; i++) {
            const particle = new Particle()
            this.particles.push(particle)
            this.particlePool.push(particle)
        }
    }
    
    /**
     * 创建粒子系统
     */
    private createParticleSystem(): void {
        // 创建几何体
        this.geometry = new THREE.BufferGeometry()
        
        // 设置属性
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3))
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3))
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizeArray, 1))
        this.geometry.setAttribute('opacity', new THREE.BufferAttribute(this.opacityArray, 1))
        this.geometry.setAttribute('rotation', new THREE.BufferAttribute(this.rotationArray, 1))
        
        // 创建材质
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                texture: { value: this.config.texture || null },
                billboardMode: { value: this.config.billboardMode ? 1.0 : 0.0 }
            },
            vertexShader: this.getVertexShader(),
            fragmentShader: this.getFragmentShader(),
            transparent: true,
            depthWrite: this.config.depthWrite,
            blending: this.config.blendMode,
            vertexColors: true
        })
        
        // 创建Points对象
        this.particleSystem = new THREE.Points(this.geometry, this.material)
        this.particleSystem.renderOrder = this.config.renderOrder
        this.particleSystem.frustumCulled = this.config.enableFrustumCulling
        
        // 设置位置
        if (this.config.position instanceof THREE.Vector3) {
            this.particleSystem.position.copy(this.config.position)
        }
    }
    
    /**
     * 获取顶点着色器
     */
    private getVertexShader(): string {
        return `
        attribute float size;
        attribute float opacity;
        attribute float rotation;
        
        uniform float time;
        uniform float billboardMode;
        
        varying vec3 vColor;
        varying float vOpacity;
        varying float vRotation;
        
        void main() {
            vColor = color;
            vOpacity = opacity;
            vRotation = rotation;
            
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            
            // Billboard效果
            if (billboardMode > 0.5) {
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = size * (300.0 / -mvPosition.z);
            } else {
                gl_Position = projectionMatrix * mvPosition;
                gl_PointSize = size;
            }
        }
        `
    }
    
    /**
     * 获取片元着色器
     */
    private getFragmentShader(): string {
        return `
        uniform sampler2D texture;
        
        varying vec3 vColor;
        varying float vOpacity;
        varying float vRotation;
        
        void main() {
            vec2 coords = gl_PointCoord;
            
            // 应用旋转
            if (abs(vRotation) > 0.001) {
                float cosR = cos(vRotation);
                float sinR = sin(vRotation);
                coords = coords - 0.5;
                coords = vec2(
                    coords.x * cosR - coords.y * sinR,
                    coords.x * sinR + coords.y * cosR
                ) + 0.5;
            }
            
            // 圆形遮罩
            float dist = distance(coords, vec2(0.5));
            if (dist > 0.5) discard;
            
            // 软化边缘
            float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
            
            vec4 texColor = vec4(1.0);
            #ifdef USE_MAP
                texColor = texture2D(texture, coords);
            #endif
            
            gl_FragColor = vec4(vColor, alpha * vOpacity) * texColor;
        }
        `
    }
    
    /**
     * 主更新函数
     */
    private update(): void {
        if (!this.particleSystem || !this.isEmitting) return
        
        const currentTime = performance.now()
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000
        this.lastUpdateTime = currentTime
        
        // 性能控制：跳帧机制
        this.frameSkipCounter++
        const shouldUpdate = this.frameSkipCounter >= Math.floor(1 / this.config.updateFrequency)
        if (shouldUpdate) {
            this.frameSkipCounter = 0
        }
        
        // LOD距离检测
        if (this.config.enableLOD && this.camera) {
            this.updateLOD()
        }
        
        // 视锥剔除
        if (this.config.enableFrustumCulling && this.camera) {
            if (!this.isInFrustum()) {
                return
            }
        }
        
        if (shouldUpdate) {
            // 发射新粒子
            this.emitParticles(deltaTime)
            
            // 更新现有粒子
            this.updateParticles(deltaTime)
            
            // 更新缓冲区
            this.updateBuffers()
        }
        
        // 更新时间uniform
        if (this.material) {
            this.material.uniforms.time.value = (currentTime - this.startTime) / 1000
        }
    }
    
    /**
     * 更新LOD级别
     */
    private updateLOD(): void {
        if (!this.camera || !this.particleSystem) return
        
        const distance = this.camera.position.distanceTo(this.particleSystem.position)
        
        if (distance > this.config.maxDistance) {
            this.particleSystem.visible = false
            return
        } else {
            this.particleSystem.visible = true
        }
        
        // 根据距离调整粒子数量和质量
        if (distance > 50) {
            this.lodLevel = 0.3
        } else if (distance > 25) {
            this.lodLevel = 0.7
        } else {
            this.lodLevel = 1.0
        }
    }
    
    /**
     * 检查是否在视锥内
     */
    private isInFrustum(): boolean {
        if (!this.camera || !this.particleSystem) return true
        
        const frustum = new THREE.Frustum()
        const cameraMatrix = new THREE.Matrix4()
        
        cameraMatrix.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        )
        frustum.setFromProjectionMatrix(cameraMatrix)
        
        return frustum.containsPoint(this.particleSystem.position)
    }
    
    /**
     * 发射新粒子
     */
    private emitParticles(deltaTime: number): void {
        const effectiveEmissionRate = this.config.emissionRate * this.lodLevel
        this.emissionAccumulator += effectiveEmissionRate * deltaTime
        
        const particlesToEmit = Math.floor(this.emissionAccumulator)
        this.emissionAccumulator -= particlesToEmit
        
        for (let i = 0; i < particlesToEmit && this.activeParticleCount < this.config.maxParticles; i++) {
            this.emitSingleParticle()
        }
    }
    
    /**
     * 发射单个粒子
     */
    private emitSingleParticle(): void {
        const particle = this.getParticleFromPool()
        if (!particle) return
        
        // 设置初始位置
        this.setEmissionPosition(particle)
        
        // 设置初始速度
        this.setEmissionVelocity(particle)
        
        // 设置生命周期
        particle.maxLife = this.config.particleLifetime * (0.8 + Math.random() * 0.4)
        particle.life = 1.0
        particle.age = 0
        particle.isActive = true
        
        // 设置大小和旋转
        particle.size = this.config.startSize
        particle.rotation = Math.random() * Math.PI * 2
        particle.angularVelocity = this.config.angularVelocity * (0.5 + Math.random())
        
        // 设置颜色
        particle.color.copy(this.config.startColor as THREE.Color)
        particle.opacity = this.config.opacity
        
        this.activeParticleCount++
        
        // 回调
        if (this.config.onParticleSpawn) {
            this.config.onParticleSpawn(particle)
        }
    }
    
    /**
     * 设置发射位置
     */
    private setEmissionPosition(particle: Particle): void {
        const basePos = this.config.position as THREE.Vector3
        
        switch (this.config.emissionShape) {
            case 'point':
                particle.position.copy(basePos)
                break
                
            case 'sphere':
                const sphereRadius = this.config.emissionRadius * Math.random()
                const theta = Math.random() * Math.PI * 2
                const phi = Math.acos(2 * Math.random() - 1)
                
                particle.position.set(
                    basePos.x + sphereRadius * Math.sin(phi) * Math.cos(theta),
                    basePos.y + sphereRadius * Math.sin(phi) * Math.sin(theta),
                    basePos.z + sphereRadius * Math.cos(phi)
                )
                break
                
            case 'box':
                particle.position.set(
                    basePos.x + (Math.random() - 0.5) * this.config.emissionRadius * 2,
                    basePos.y + (Math.random() - 0.5) * this.config.emissionRadius * 2,
                    basePos.z + (Math.random() - 0.5) * this.config.emissionRadius * 2
                )
                break
                
            case 'cone':
                const coneRadius = Math.random() * this.config.emissionRadius
                const coneAngle = Math.random() * this.config.emissionAngle
                const coneRotation = Math.random() * Math.PI * 2
                
                particle.position.set(
                    basePos.x + coneRadius * Math.cos(coneRotation) * Math.sin(coneAngle),
                    basePos.y,
                    basePos.z + coneRadius * Math.sin(coneRotation) * Math.sin(coneAngle)
                )
                break
        }
    }
    
    /**
     * 设置发射速度
     */
    private setEmissionVelocity(particle: Particle): void {
        const baseVel = this.config.velocity
        const randomness = this.config.velocityRandomness
        
        particle.velocity.set(
            baseVel.x + (Math.random() - 0.5) * randomness,
            baseVel.y + (Math.random() - 0.5) * randomness,
            baseVel.z + (Math.random() - 0.5) * randomness
        )
        
        particle.acceleration.copy(this.config.acceleration)
    }
    
    /**
     * 更新所有粒子
     */
    private updateParticles(deltaTime: number): void {
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i]
            
            if (!particle.isActive) continue
            
            // 更新粒子物理状态
            particle.update(deltaTime)
            
            // 检查生命周期
            if (particle.life <= 0) {
                this.killParticle(particle)
                continue
            }
            
            // 更新颜色和大小（插值）
            this.updateParticleAppearance(particle)
            
            // 用户回调
            if (this.config.onParticleUpdate) {
                this.config.onParticleUpdate(particle, deltaTime)
            }
        }
    }
    
    /**
     * 更新粒子外观
     */
    private updateParticleAppearance(particle: Particle): void {
        const life = particle.life
        
        // 颜色插值
        particle.color.lerpColors(
            this.config.endColor as THREE.Color,
            this.config.startColor as THREE.Color,
            life
        )
        
        // 大小插值
        particle.size = THREE.MathUtils.lerp(this.config.endSize, this.config.startSize, life)
        
        // 透明度衰减
        particle.opacity = this.config.opacity * life
    }
    
    /**
     * 终止粒子
     */
    private killParticle(particle: Particle): void {
        particle.isActive = false
        this.activeParticleCount--
        
        // 回调
        if (this.config.onParticleDeath) {
            this.config.onParticleDeath(particle)
        }
        
        // 返回对象池
        this.returnParticleToPool(particle)
    }
    
    /**
     * 从对象池获取粒子
     */
    private getParticleFromPool(): Particle | null {
        for (let i = 0; i < this.particles.length; i++) {
            if (!this.particles[i].isActive) {
                this.particles[i].reset()
                return this.particles[i]
            }
        }
        return null
    }
    
    /**
     * 将粒子返回对象池
     */
    private returnParticleToPool(particle: Particle): void {
        particle.reset()
    }
    
    /**
     * 更新渲染缓冲区
     */
    private updateBuffers(): void {
        let activeIndex = 0
        
        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i]
            
            if (!particle.isActive) continue
            
            // 位置
            this.positionArray[activeIndex * 3] = particle.position.x
            this.positionArray[activeIndex * 3 + 1] = particle.position.y
            this.positionArray[activeIndex * 3 + 2] = particle.position.z
            
            // 颜色
            this.colorArray[activeIndex * 3] = particle.color.r
            this.colorArray[activeIndex * 3 + 1] = particle.color.g
            this.colorArray[activeIndex * 3 + 2] = particle.color.b
            
            // 大小
            this.sizeArray[activeIndex] = particle.size
            
            // 透明度
            this.opacityArray[activeIndex] = particle.opacity
            
            // 旋转
            this.rotationArray[activeIndex] = particle.rotation
            
            activeIndex++
        }
        
        // 更新几何体
        if (this.geometry) {
            const positionAttribute = this.geometry.getAttribute('position')
            const colorAttribute = this.geometry.getAttribute('color')
            const sizeAttribute = this.geometry.getAttribute('size')
            const opacityAttribute = this.geometry.getAttribute('opacity')
            const rotationAttribute = this.geometry.getAttribute('rotation')
            
            positionAttribute.needsUpdate = true
            colorAttribute.needsUpdate = true
            sizeAttribute.needsUpdate = true
            opacityAttribute.needsUpdate = true
            rotationAttribute.needsUpdate = true
            
            // 设置绘制范围
            this.geometry.setDrawRange(0, activeIndex)
        }
    }
    
    /**
     * 公共API方法
     */
    
    /**
     * 开始发射
     */
    public startEmission(): void {
        this.isEmitting = true
        if (this.config.debugMode) {
            console.log("🎆 粒子发射器开始发射")
        }
    }
    
    /**
     * 停止发射
     */
    public stopEmission(): void {
        this.isEmitting = false
        if (this.config.debugMode) {
            console.log("⏹️ 粒子发射器停止发射")
        }
    }
    
    /**
     * 设置发射器位置
     */
    public setPosition(position: THREE.Vector3 | [number, number, number]): void {
        if (Array.isArray(position)) {
            this.config.position = new THREE.Vector3(...position)
        } else {
            this.config.position = position.clone()
        }
        
        if (this.particleSystem) {
            this.particleSystem.position.copy(this.config.position as THREE.Vector3)
        }
    }
    
    /**
     * 获取发射器位置
     */
    public getPosition(): THREE.Vector3 {
        return (this.config.position as THREE.Vector3).clone()
    }
    
    /**
     * 设置发射速率
     */
    public setEmissionRate(rate: number): void {
        this.config.emissionRate = Math.max(0, Math.min(1000, rate))
    }
    
    /**
     * 设置最大粒子数
     */
    public setMaxParticles(max: number): void {
        if (max !== this.config.maxParticles) {
            console.warn("⚠️ 更改最大粒子数需要重新创建发射器")
        }
    }
    
    /**
     * 获取活跃粒子数量
     */
    public getActiveParticleCount(): number {
        return this.activeParticleCount
    }
    
    /**
     * 获取性能统计
     */
    public getPerformanceStats() {
        return {
            activeParticles: this.activeParticleCount,
            maxParticles: this.config.maxParticles,
            lodLevel: this.lodLevel,
            isEmitting: this.isEmitting,
            particleUtilization: this.activeParticleCount / this.config.maxParticles
        }
    }
    
    /**
     * 启用调试模式
     */
    public enableDebugMode(): void {
        this.config.debugMode = true
        console.log('🔍 粒子发射器调试信息:', this.getPerformanceStats())
    }
    
    /**
     * 清空所有粒子
     */
    public clearAllParticles(): void {
        for (const particle of this.particles) {
            if (particle.isActive) {
                this.killParticle(particle)
            }
        }
        if (this.config.debugMode) {
            console.log("🧹 所有粒子已清空")
        }
    }
    
    /**
     * 销毁粒子发射器
     */
    public dispose(): void {
        // 停止发射
        this.stopEmission()
        
        // 清空粒子
        this.clearAllParticles()
        
        // 移除事件监听
        if (this.updateHandler) {
            eventBus.off('update', this.updateHandler)
            this.updateHandler = null
        }
        
        // 从场景移除
        if (this.scene && this.particleSystem) {
            this.scene.remove(this.particleSystem)
        }
        
        // 清理资源
        this.geometry?.dispose()
        this.material?.dispose()
        
        // 清空引用
        this.particles = []
        this.particlePool = []
        this.particleSystem = null
        this.geometry = null
        this.material = null
        
        if (this.config.debugMode) {
            console.log("🗑️ 粒子发射器已销毁")
        }
    }
    
    /**
     * 静态工厂方法
     */
    
    /**
     * 创建火焰粒子发射器
     */
    static createFireEmitter(config: Partial<ParticleConfig> = {}): ParticleConfig {
        return {
            ...DEFAULT_CONFIG,
            particleType: ParticleType.FIRE,
            startColor: new THREE.Color(0xff4400),
            endColor: new THREE.Color(0x440000),
            velocity: new THREE.Vector3(0, 5, 0),
            acceleration: new THREE.Vector3(0, -1, 0),
            emissionShape: 'cone',
            emissionAngle: Math.PI / 6,
            renderOrder: 150,
            ...config
        }
    }
    
    /**
     * 创建烟雾粒子发射器
     */
    static createSmokeEmitter(config: Partial<ParticleConfig> = {}): ParticleConfig {
        return {
            ...DEFAULT_CONFIG,
            particleType: ParticleType.SMOKE,
            startColor: new THREE.Color(0x666666),
            endColor: new THREE.Color(0x000000),
            startSize: 0.5,
            endSize: 3.0,
            velocity: new THREE.Vector3(0, 2, 0),
            acceleration: new THREE.Vector3(0, 0.5, 0),
            emissionRate: 50,
            blendMode: THREE.NormalBlending,
            renderOrder: 160,
            ...config
        }
    }
    
    /**
     * 创建魔法粒子发射器
     */
    static createMagicEmitter(config: Partial<ParticleConfig> = {}): ParticleConfig {
        return {
            ...DEFAULT_CONFIG,
            particleType: ParticleType.MAGIC,
            startColor: new THREE.Color(0x8844ff),
            endColor: new THREE.Color(0xff44ff),
            velocity: new THREE.Vector3(0, 0, 0),
            acceleration: new THREE.Vector3(0, 0, 0),
            emissionShape: 'sphere',
            angularVelocity: 2.0,
            renderOrder: 180,
            ...config
        }
    }
}
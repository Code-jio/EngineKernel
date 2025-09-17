import * as THREE from 'three'
import { BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"

export class DataRainEffect extends BasePlugin {
    scene: THREE.Scene | null
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    
    // 数据雨参数
    private rainParams = {
        particleCount: 1000,     // 粒子数量 (增加默认粒子数以获得更密集的效果)
        columnCount: 80,         // 列数
        speed: { min: 0.5, max: 3.0 }, // 速度范围
        fontSize: 18,            // 字体大小
        charSet: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$', // 字符集 (添加$符号)
        color: '#00ff41',        // 基础颜色 (更亮的绿色)
        fadeIntensity: 0.95,     // 淡出强度
        swayAmplitude: 0.8,      // 摆动幅度
        flickerChance: 0.05,     // 闪烁概率
        headCharBrightness: 1.5  // 首字符亮度增强
    }
    
    // Three.js 对象
    private particles: THREE.Points | null = null
    private particleMaterial: THREE.PointsMaterial | null = null
    private particleGeometry: THREE.BufferGeometry | null = null
    private textures: THREE.Texture[] = []
    private animationId: number | null = null
    
    // 粒子数据
    private particleData: {
        positions: Float32Array
        velocities: Float32Array
        charIndices: Float32Array
        alphas: Float32Array
        columnIndices: Float32Array
        flickerTimes: Float32Array
    } | null = null
    
    private charAtlasCache: Map<string, THREE.Texture> = new Map()
    private scaleListener: (() => void) | null = null

    constructor(meta: any) {
        super(meta)
        this.scene = meta.userData.scene
        this.camera = meta.userData.camera
        this.renderer = meta.userData.renderer
        
        // 添加缩放监听
        this.addScaleListener()
    }
    
    // 添加场景缩放监听
    private addScaleListener() {
        if (!this.scene) return
        
        // 创建一个监听函数
        this.scaleListener = () => {
            // 当场景缩放变化时，重新计算粒子位置
            this.handleSceneScaleChange()
        }
        
        // 监听场景的scale变化
        // 注意：Three.js的场景对象没有直接的scale变化事件，这里提供一个示例实现
        // 在实际应用中，可能需要通过其他方式触发此函数
    }
    
    // 处理场景缩放变化
    private handleSceneScaleChange() {
        if (!this.particleData || !this.particleGeometry) return
        
        // 重新计算粒子位置以适应新的缩放
        const particleCount = this.rainParams.particleCount
        const positions = this.particleData.positions
        
        for (let i = 0; i < particleCount; i++) {
            const idx = i * 3
            // 可以在这里添加缩放相关的计算
            // 例如，根据场景缩放调整粒子分布范围
        }
        
        // 更新几何体
        this.particleGeometry.attributes.position.needsUpdate = true
    }

    // 初始化
    async init() {
        await this.createDataRain()
        this.startAnimation()
    }

    // 创建多字符纹理图集
    private createCharAtlas(): THREE.Texture {
        // 生成缓存键
        const cacheKey = `${this.rainParams.charSet}-${this.rainParams.fontSize}-${this.rainParams.color}`
        
        // 检查缓存
        if (this.charAtlasCache.has(cacheKey)) {
            return this.charAtlasCache.get(cacheKey)!
        }
        
        const chars = this.rainParams.charSet.split('')
        const fontSize = this.rainParams.fontSize
        const padding = 2
        const color = this.rainParams.color
        
        // 计算纹理图集大小
        const charsPerRow = Math.ceil(Math.sqrt(chars.length))
        const atlasSize = charsPerRow * (fontSize + padding * 2)
        
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        canvas.width = atlasSize
        canvas.height = atlasSize
        
        // 缓存常用属性
        const font = `bold ${fontSize}px monospace`
        const shadowColor = color
        const halfFontSize = fontSize / 2
        const padding2 = padding * 2
        const charSize = fontSize + padding2
        
        // 绘制每个字符
        chars.forEach((char, index) => {
            const row = Math.floor(index / charsPerRow)
            const col = index % charsPerRow
            const x = col * charSize + padding
            const y = row * charSize + padding
            
            // 绘制字符背景（透明）
            context.fillStyle = 'transparent'
            context.fillRect(x, y, charSize, charSize)
            
            // 绘制字符（增强发光效果）
            context.fillStyle = color
            context.font = font
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            
            // 添加发光效果
            context.shadowColor = shadowColor
            context.shadowBlur = 3
            context.fillText(char, x + halfFontSize, y + halfFontSize)
            
            // 清除阴影以避免影响其他字符
            context.shadowBlur = 0
        })
        
        const texture = new THREE.Texture(canvas)
        texture.needsUpdate = true
        texture.generateMipmaps = false
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        
        // 缓存纹理
        this.charAtlasCache.set(cacheKey, texture)
        
        return texture
    }

    // 创建自定义着色器材质
    private createShaderMaterial(): THREE.ShaderMaterial {
        const charTexture = this.createCharAtlas()
        
        return new THREE.ShaderMaterial({
            uniforms: {
                charTexture: { value: charTexture },
                charCount: { value: this.rainParams.charSet.length },
                time: { value: 0.0 },
                opacity: { value: 1.0 },
                color: { value: new THREE.Color(this.rainParams.color) },
                pointSize: { value: this.rainParams.fontSize }
            },
            vertexShader: `
                attribute float charIndex;
                attribute float alpha;
                attribute float columnIndex;
                
                uniform float time;
                uniform float pointSize;
                
                varying float vCharIndex;
                varying float vAlpha;
                varying float vColumnIndex;
                varying vec2 vUv;
                
                void main() {
                    vCharIndex = charIndex;
                    vAlpha = alpha;
                    vColumnIndex = columnIndex;
                    vUv = uv;
                    
                    // 添加轻微的位置扰动，增强随机性
                    vec3 pos = position;
                    pos.x += sin(time * 0.5 + columnIndex * 0.1) * 0.2;
                    pos.z += cos(time * 0.3 + columnIndex * 0.2) * 0.1;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // 根据距离调整点的大小，并添加轻微的大小变化
                    float size = pointSize * (300.0 / -mvPosition.z);
                    size *= (1.0 + sin(time * 2.0 + columnIndex) * 0.1);
                    gl_PointSize = size;
                }
            `,
            fragmentShader: `
                uniform sampler2D charTexture;
                uniform float charCount;
                uniform float time;
                uniform float opacity;
                uniform vec3 color;
                
                varying float vCharIndex;
                varying float vAlpha;
                varying float vColumnIndex;
                varying vec2 vUv;
                
                void main() {
                    // 计算字符在图集中的位置
                    float charsPerRow = ceil(sqrt(charCount));
                    float charRow = floor(vCharIndex / charsPerRow);
                    float charCol = mod(vCharIndex, charsPerRow);
                    
                    // 计算 UV 坐标
                    vec2 charSize = 1.0 / charsPerRow;
                    vec2 charUv = (vec2(charCol, charRow) + gl_PointCoord) * charSize;
                    
                    // 采样字符纹理
                    vec4 charColor = texture2D(charTexture, charUv);
                    
                    if (charColor.a < 0.1) discard;
                    
                    // 应用颜色和透明度
                    vec3 finalColor = color * charColor.rgb;
                    float finalAlpha = charColor.a * vAlpha * opacity;
                    
                    // 添加动态发光效果
                    float glow = 1.0 + sin(time * 5.0 + vColumnIndex) * 0.3;
                    // 首字符增强亮度效果
                    float headCharEffect = 1.0 + (1.0 - vAlpha) * 0.5;
                    finalColor *= glow * headCharEffect;
                    
                    // 添加外发光效果
                    float distanceToEdge = distance(gl_PointCoord, vec2(0.5));
                    float glowEffect = 1.0 - smoothstep(0.3, 0.5, distanceToEdge);
                    finalColor += color * glowEffect * 0.3;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })
    }

    // 创建数据雨
    private async createDataRain() {
        // 创建几何体
        this.particleGeometry = new THREE.BufferGeometry()
        
        // 初始化粒子数据
        const particleCount = this.rainParams.particleCount
        this.particleData = {
            positions: new Float32Array(particleCount * 3),
            velocities: new Float32Array(particleCount),
            charIndices: new Float32Array(particleCount),
            alphas: new Float32Array(particleCount),
            columnIndices: new Float32Array(particleCount),
            flickerTimes: new Float32Array(particleCount)
        }
        
        // 初始化粒子属性
        // 使用局部变量缓存参数，减少属性访问
        const columnCount = this.rainParams.columnCount
        const charSetLength = this.rainParams.charSet.length
        const speedMin = this.rainParams.speed.min
        const speedMax = this.rainParams.speed.max
        const speedRange = speedMax - speedMin
        const columnCountInv = 1.0 / columnCount
        const halfColumnCount = columnCount * 0.5
        const twenty = 20.0
        const ten = 10.0
        const five = 5.0
        const two = 2.0
        const zeroFive = 0.5
        const fifty = 50.0
        const sixty = 60.0
        const zeroOne = 0.1
        const zeroZeroFive = 0.05
        const hundred = 100.0
        const zeroPointOne = 0.1
        const zeroPointZeroFive = 0.05
        const tenPlus = 10.0
        
        for (let i = 0; i < particleCount; i++) {
            const columnIndex = i % columnCount
            // 优化计算：使用预计算的倒数和一半值
            const columnX = (columnIndex * columnCountInv - zeroFive) * twenty
            
            // 预生成随机数，减少Math.random()调用次数
            const rand1 = Math.random()
            const rand2 = Math.random()
            const rand3 = Math.random()
            
            // 位置 - 随机分布在垂直空间中，形成"雨"的效果
            this.particleData.positions[i * 3] = columnX + (rand1 - zeroFive) * two
            // Y坐标在较大范围内随机分布，形成连续的雨效果
            this.particleData.positions[i * 3 + 1] = rand2 * fifty - ten
            this.particleData.positions[i * 3 + 2] = (rand3 - zeroFive) * five
            
            // 速度 - 使用二次方分布，使速度差异更明显
            const speedFactor = rand1 * rand1
            this.particleData.velocities[i] = speedFactor * speedRange + speedMin
            
            // 字符索引
            this.particleData.charIndices[i] = Math.floor(rand1 * charSetLength)
            
            // 根据Y坐标设置，顶部较亮，底部较暗，并添加淡出效果
            const heightRatio = Math.max(0, (this.particleData.positions[i * 3 + 1] + tenPlus) / sixty)
            // 添加闪烁效果
            const flicker = Math.sin(rand2 * hundred * zeroPointOne) * zeroOne
            // 添加基于列的亮度变化，增强立体感
            const columnEffect = Math.sin(columnIndex * zeroPointZeroFive) * zeroZeroFive
            this.particleData.alphas[i] = Math.max(zeroOne, heightRatio + flicker + columnEffect)
            
            // 列索引
            this.particleData.columnIndices[i] = columnIndex
            
            // 闪烁时间 - 使用不同的随机种子
            this.particleData.flickerTimes[i] = rand2 * hundred
        }
        
        // 设置几何体属性
        this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particleData.positions, 3))
        this.particleGeometry.setAttribute('charIndex', new THREE.BufferAttribute(this.particleData.charIndices, 1))
        this.particleGeometry.setAttribute('alpha', new THREE.BufferAttribute(this.particleData.alphas, 1))
        this.particleGeometry.setAttribute('columnIndex', new THREE.BufferAttribute(this.particleData.columnIndices, 1))
        
        // 创建自定义着色器材质
        this.particleMaterial = this.createShaderMaterial() as unknown as THREE.PointsMaterial
        
        // 创建粒子系统
        this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial)
        this.scene?.add(this.particles)
    }

    // 更新粒子动画
    private updateParticles() {
        if (!this.particleData || !this.particles) return
        
        const time = Date.now() * 0.001
        const positions = this.particleData.positions
        const charIndices = this.particleData.charIndices
        const alphas = this.particleData.alphas
        const columnIndices = this.particleData.columnIndices
        const flickerTimes = this.particleData.flickerTimes
        const velocities = this.particleData.velocities
        
        // 更新着色器时间
        if (this.particleMaterial instanceof THREE.ShaderMaterial) {
            this.particleMaterial.uniforms.time.value = time
        }
        
        // 使用局部变量缓存参数，减少属性访问
        const particleCount = this.rainParams.particleCount
        const speedMin = this.rainParams.speed.min
        const speedMax = this.rainParams.speed.max
        const swayAmplitude = this.rainParams.swayAmplitude
        const flickerChance = this.rainParams.flickerChance
        const fadeIntensity = this.rainParams.fadeIntensity
        const columnCount = this.rainParams.columnCount
        const charSetLength = this.rainParams.charSet.length
        
        // 预计算常量，减少重复计算
        const time2 = time * 2.0
        const time1_5 = time * 1.5
        const swayAmplitude0_03 = swayAmplitude * 0.03
        const swayAmplitude0_02 = swayAmplitude * 0.02
        const flickerChance2_5 = flickerChance * 2.5
        const fadeThreshold = 0.05
        const fadeRandomRange = 0.5
        const fadeMinAlpha = 0.5
        const resetYMin = 10
        const resetYRange = 20
        const resetXRange = 2
        // 预计算倒数和倍数，减少除法和乘法运算
        const columnCountInv = 1.0 / columnCount
        const halfColumnCount = columnCount * 0.5
        const twenty = 20.0
        const ten = 10.0
        const five = 5.0
        const zeroFive = 0.5
        const zeroZeroOneSix = 0.016
        const zeroOne = 0.1
        const zeroZeroEight = 0.08
        const zeroTwo = 0.2
        const zeroOneFive = 0.15
        const hundred = 100.0
        
        // 向量化更新，减少重复计算
        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3
            const i31 = i3 + 1
            const i32 = i3 + 2
            
            // 更新 Y 位置（向下移动）
            positions[i31] -= velocities[i] * zeroZeroOneSix
            
            // 如果粒子掉出视野，重置到顶部
            if (positions[i31] < -ten) {
                positions[i31] = Math.random() * resetYRange + resetYMin
                // 优化计算：使用预计算的倒数和一半值
                positions[i3] = (columnIndices[i] * columnCountInv - zeroFive) * twenty + 
                    (Math.random() - zeroFive) * resetXRange
                // 重置透明度，创建新的"头部"效果
                alphas[i] = 1.0
            }
            
            // 添加左右和前后摆动，形成波浪效果
            const swayX = Math.sin(time2 + flickerTimes[i] * zeroOne + columnIndices[i] * zeroTwo) * swayAmplitude0_03
            const swayZ = Math.cos(time1_5 + flickerTimes[i] * zeroZeroEight + columnIndices[i] * zeroOneFive) * swayAmplitude0_02
            positions[i3] += swayX
            positions[i32] += swayZ
            
            // 随机改变字符（闪烁效果），增加频率
            if (Math.random() < flickerChance2_5) {
                charIndices[i] = Math.floor(Math.random() * charSetLength)
            }
            
            // 更新透明度（渐变效果）
            alphas[i] *= fadeIntensity
            // 当透明度过低时，重置为高透明度，模拟新字符出现
            if (alphas[i] < fadeThreshold) {
                alphas[i] = Math.random() * fadeRandomRange + fadeMinAlpha
                // 重置闪烁时间
                flickerTimes[i] = Math.random() * hundred
            }
        }
        
        // 批量更新几何体属性，减少GPU同步次数
        if (this.particleGeometry) {
            const attributes = this.particleGeometry.attributes
            if (attributes.position) attributes.position.needsUpdate = true
            if (attributes.charIndex) attributes.charIndex.needsUpdate = true
            if (attributes.alpha) attributes.alpha.needsUpdate = true
        }
    }

    // 开始动画
    private startAnimation() {
        const animate = () => {
            this.updateParticles()
            this.animationId = requestAnimationFrame(animate)
        }
        animate()
    }

    // 停止动画
    public stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId)
            this.animationId = null
        }
    }

    // 重新开始动画
    public restartAnimation() {
        this.stopAnimation()
        this.startAnimation()
    }
    
    // 动态调整特效密度
    public setDensity(density: number) {
        // density范围: 0.1-2.0, 1.0为默认密度
        const clampedDensity = Math.max(0.1, Math.min(2.0, density))
        
        // 更新粒子数量
        const newParticleCount = Math.floor(this.rainParams.particleCount * clampedDensity)
        this.rainParams.particleCount = newParticleCount
        
        // 重新创建粒子系统
        if (this.particles) {
            this.dispose()
            this.createDataRain()
        }
    }

    // 更新参数
    public updateParams(params: Partial<typeof this.rainParams>) {
        Object.assign(this.rainParams, params)
        
        // 如果粒子系统已存在，重新创建
        if (this.particles) {
            this.dispose()
            this.createDataRain()
        }
    }

    // 清理资源
    public dispose() {
        this.stopAnimation()
        
        if (this.particles) {
            this.scene?.remove(this.particles)
            this.particles = null
        }
        
        if (this.particleGeometry) {
            this.particleGeometry.dispose()
            this.particleGeometry = null
        }
        
        if (this.particleMaterial) {
            this.particleMaterial.dispose()
            this.particleMaterial = null
        }
        
        // 清理纹理
        this.textures.forEach(texture => texture.dispose())
        this.textures = []
        
        // 清理字符图集缓存
        this.charAtlasCache.forEach(texture => {
            texture.dispose()
        })
        this.charAtlasCache.clear()
        
        // 移除缩放监听
        if (this.scaleListener) {
            // 在实际应用中，需要移除监听器
            this.scaleListener = null
        }
        
        this.particleData = null
        this.scene = null
    }
}

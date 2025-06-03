import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { PipelineManager } from "../../core/pipelineManager"

// 性能监控接口
interface PerformanceStats {
    fps: number
    frameTime: number
    avgFrameTime: number
    frameCount: number
    // 场景统计
    objects: number
    vertices: number
    faces: number
    // 渲染统计
    drawCalls: number
    triangles: number
    points: number
    lines: number
    // 内存统计
    textures: number
    geometries: number
    programs: number
}

// 默认配置预设
const DEFAULT_CONFIGS = {
    // 高性能配置（适用于移动端和低端设备）
    highPerformance: {
        cameraConfig: {
            type: "perspective",
            fov: 45,
            near: 0.1,
            far: 10000,
            position: [200, 200, 200],
            lookAt: [0, 0, 0]
        },
        rendererConfig: {
            antialias: false,
            alpha: false,
            precision: "mediump",
            powerPreference: "high-performance",
            physicallyCorrectLights: true,
            shadowMapEnabled: false,
            toneMapping: THREE.LinearToneMapping,
            toneMappingExposure: 1.0,
            pixelRatio: 1
        },
        performanceConfig: {
            enabled: true
        },
        debugConfig: {
            enabled: false,
            gridHelper: false,
            axesHelper: false,
            gridSize: 10000, 
            gridDivisions: 100, 
            axesSize: 1000
        }
    },
    
    // 平衡配置（默认推荐）
    balanced: {
        cameraConfig: {
            type: "perspective",
            fov: 45,
            near: 0.01,
            far: 50000,
            position: [300, 300, 300],
            lookAt: [0, 0, 0]
        },
        rendererConfig: {
            antialias: true,
            alpha: false,
            precision: "highp",
            powerPreference: "high-performance",
            physicallyCorrectLights: true,
            shadowMapEnabled: false, // 默认关闭阴影提升性能
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0,
            outputColorSpace: 'srgb'
        },
        performanceConfig: {
            enabled: true
        },
        debugConfig: {
            enabled: false,
            gridHelper: true,
            axesHelper: true,
            gridSize: 10000, 
            gridDivisions: 100, 
            axesSize: 1000
        }
    },
    
    // 高质量配置（适用于桌面端和高端设备）
    highQuality: {
        cameraConfig: {
            type: "perspective",
            fov: 45,
            near: 0.001,
            far: 100000,
            position: [500, 500, 500],
            lookAt: [0, 0, 0]
        },
        rendererConfig: {
            antialias: true,
            alpha: false,
            precision: "highp",
            powerPreference: "high-performance",
            physicallyCorrectLights: true,
            shadowMapEnabled: true,
            shadowMapType: THREE.PCFSoftShadowMap,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
            outputColorSpace: 'srgb'
        },
        performanceConfig: {
            enabled: true
        },
        debugConfig: {
            enabled: false,
            gridHelper: true,
            axesHelper: true,
            gridSize: 10000, 
            gridDivisions: 100, 
            axesSize: 1000
        }
    },
    
    // 开发调试配置
    development: {
        cameraConfig: {
            type: "perspective",
            fov: 60,
            near: 0.01,
            far: 100000,
            position: [100, 100, 100],
            lookAt: [0, 0, 0]
        },
        rendererConfig: {
            antialias: true,
            alpha: true,
            precision: "highp",
            powerPreference: "high-performance",
            physicallyCorrectLights: true,
            shadowMapEnabled: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.0
        },
        performanceConfig: {
            enabled: true
        },
        debugConfig: {
            enabled: true,
            gridHelper: true,
            axesHelper: true,
            gridSize: 10000, 
            gridDivisions: 100, 
            axesSize: 1000
        }
    }
}

export class BaseScene extends BasePlugin {
    private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // 默认透视相机
    private aspectRatio = window.innerWidth / window.innerHeight
    private scene: THREE.Scene
    private ambientLight: THREE.AmbientLight
    private renderer: THREE.WebGLRenderer
    private pipelineManager: PipelineManager
    private directionalLight: THREE.DirectionalLight
    
    // 性能监控相关
    private performanceMonitor: {
        enabled: boolean
        stats: PerformanceStats
        lastTime: number
        frameTimeHistory: number[]
        updateInterval: number
        lastUpdateTime: number
    }
    
    // 渲染器高级配置
    private rendererAdvancedConfig: {
        container: HTMLElement | null
        physicallyCorrectLights: boolean
        outputColorSpace: string
        toneMapping: THREE.ToneMapping
        toneMappingExposure: number
        shadowMapEnabled: boolean
        shadowMapType: THREE.ShadowMapType
        pixelRatio: number
    }
    
    // Debug模式相关
    private debugConfig: {
        enabled: boolean
        gridHelper: boolean
        axesHelper: boolean
        gridSize: number
        gridDivisions: number
        axesSize: number
    }
    
    // Debug辅助器实例
    private debugHelpers: {
        gridHelper: THREE.GridHelper | null
        axesHelper: THREE.AxesHelper | null
    }
    
    constructor(meta: any) {
        super(meta)
        try {
            // 防护：确保meta和userData存在
            if (!meta) {
                meta = { userData: {} }
            }
            if (!meta.userData) {
                meta.userData = {}
            }
            
            // 获取配置预设
            const preset = meta.userData.preset || 'balanced'
            const defaultConfig = DEFAULT_CONFIGS[preset as keyof typeof DEFAULT_CONFIGS] || DEFAULT_CONFIGS.balanced
            
            // 合并用户配置与默认配置
            const finalConfig = this.mergeConfigs(defaultConfig, meta.userData)
        
        // 初始化性能监控
        this.performanceMonitor = {
            enabled: finalConfig.performanceConfig?.enabled !== false,
            stats: {
                fps: 0,
                frameTime: 0,
                avgFrameTime: 0,
                frameCount: 0,
                objects: 0,
                vertices: 0,
                faces: 0,
                drawCalls: 0,
                triangles: 0,
                points: 0,
                lines: 0,
                textures: 0,
                geometries: 0,
                programs: 0
            },
            lastTime: performance.now(),
            frameTimeHistory: [],
            updateInterval: 1000, // 1秒更新一次统计
            lastUpdateTime: 0
        }
        
        // 初始化渲染器高级配置（简化版）
        this.rendererAdvancedConfig = {
            container: document.body, // 直接使用body作为容器
            physicallyCorrectLights: finalConfig.rendererConfig.physicallyCorrectLights,
            outputColorSpace: finalConfig.rendererConfig.outputColorSpace || 'srgb',
            toneMapping: finalConfig.rendererConfig.toneMapping,
            toneMappingExposure: finalConfig.rendererConfig.toneMappingExposure,
            shadowMapEnabled: finalConfig.rendererConfig.shadowMapEnabled,
            shadowMapType: finalConfig.rendererConfig.shadowMapType || THREE.PCFSoftShadowMap,
            pixelRatio: Math.min(finalConfig.rendererConfig.pixelRatio || window.devicePixelRatio, 2)
        }

        // 初始化Debug配置
        this.debugConfig = {
            enabled: finalConfig.debugConfig?.enabled || false,
            gridHelper: finalConfig.debugConfig?.gridHelper || false,
            axesHelper: finalConfig.debugConfig?.axesHelper || false,
            gridSize: finalConfig.debugConfig?.gridSize || 100000,  // 网格总大小：每格10单位×10000格=100000单位
            gridDivisions: finalConfig.debugConfig?.gridDivisions || 10000,  // 网格分割数：10000格
            axesSize: finalConfig.debugConfig?.axesSize || 100
        }

        // 初始化Debug辅助器
        this.debugHelpers = {
            gridHelper: null,
            axesHelper: null
        }

        const cameraOption = finalConfig.cameraConfig
        const rendererOption = {
            ...finalConfig.rendererConfig
        }
        
        if (cameraOption.type == "perspective") {
            this.camera = new THREE.PerspectiveCamera(cameraOption.fov, this.aspectRatio, cameraOption.near, cameraOption.far)
            this.camera.position.set(...(cameraOption.position as [number, number, number]))
            this.camera.lookAt(...(cameraOption.lookAt as [number, number, number]))
        } else {
            this.camera = new THREE.OrthographicCamera(
                window.innerWidth / -2, 
                window.innerWidth / 2, 
                window.innerHeight / 2, 
                window.innerHeight / -2, 
                1, 
                1000
            )
            this.camera.updateProjectionMatrix()
        }

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0xffffff)

        // 适应Three.js r155+物理正确光照系统的光照强度
        // 环境光强度需要降低，因为新的光照系统更加真实
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4) // 从0.7降低到0.4
        
        // 平行光强度也需要调整
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8) // 从1降低到0.8
        this.directionalLight.position.set(1000, 1000, 1000) // 设置平行光位置
        
        // 根据配置决定是否启用阴影
        this.directionalLight.castShadow = this.rendererAdvancedConfig.shadowMapEnabled

        this.scene.add(this.directionalLight)
        this.scene.add(this.ambientLight)
        
        this.renderer = new THREE.WebGLRenderer({
            antialias: rendererOption.antialias, // 抗锯齿
            alpha: rendererOption.alpha || false, // 透明
            precision: rendererOption.precision, // 精度
            powerPreference: rendererOption.powerPreference, // 性能
        })

        // 直接将Three.js生成的canvas添加到body
        this.renderer.domElement.style.position = 'fixed'
        this.renderer.domElement.style.top = '0'
        this.renderer.domElement.style.left = '0'
        this.renderer.domElement.style.width = '100%'
        this.renderer.domElement.style.height = '100%'
        // this.renderer.domElement.style.zIndex = '1' // 设置合适的层级
        this.renderer.domElement.style.pointerEvents = 'auto' // 确保能接收事件
        
        document.body.appendChild(this.renderer.domElement)

        // 应用渲染器高级配置
        this.applyRendererAdvancedConfig()

        // 将renderer实例存入meta供其他插件使用
        meta.userData.renderer = this.renderer

        this.pipelineManager = new PipelineManager()

        this.initialize()
        
        // 显示初始化信息
        const usedPreset = meta.userData.preset || 'balanced'
        console.log(`✅ BaseScene初始化完成 - 使用预设: ${usedPreset}`, {
            相机类型: cameraOption.type,
            光照系统: 'Three.js r155+ 物理正确光照',
            阴影系统: this.rendererAdvancedConfig.shadowMapEnabled ? '启用' : '禁用',
            性能监控: this.performanceMonitor.enabled ? '启用' : '禁用',
            Debug模式: this.debugConfig.enabled ? '启用' : '禁用',
            色调映射: this.getToneMappingName(this.rendererAdvancedConfig.toneMapping),
            像素比率: this.rendererAdvancedConfig.pixelRatio
        })

        // 如果启用了debug模式，则添加辅助器
        if (this.debugConfig.enabled) {
            this.addDebugHelpers()
        }
            
        } catch (error: any) {
            console.error('❌ BaseScene初始化失败:', error)
            
            // 提供回退处理
            this.performanceMonitor = {
                enabled: false,
                stats: {
                    fps: 0, frameTime: 0, avgFrameTime: 0, frameCount: 0,
                    objects: 0, vertices: 0, faces: 0,
                    drawCalls: 0, triangles: 0, points: 0, lines: 0,
                    textures: 0, geometries: 0, programs: 0
                },
                lastTime: performance.now(),
                frameTimeHistory: [],
                updateInterval: 1000,
                lastUpdateTime: 0
            }
            
            this.rendererAdvancedConfig = {
                container: document.body,
                physicallyCorrectLights: false,
                outputColorSpace: 'srgb',
                toneMapping: THREE.LinearToneMapping,
                toneMappingExposure: 1.0,
                shadowMapEnabled: false,
                shadowMapType: THREE.PCFShadowMap,
                pixelRatio: 1
            }
            
            // 重新抛出错误，让调用者知道初始化失败
            const errorMessage = error instanceof Error ? error.message : String(error)
            throw new Error(`BaseScene构造失败: ${errorMessage}`)
        }
    }

    /**
     * 验证是否为有效的HTMLCanvasElement
     */
    private isValidCanvas(element: any): boolean {
        if (!element) return false
        
        // 检查是否是HTMLCanvasElement
        if (typeof HTMLCanvasElement !== 'undefined' && element instanceof HTMLCanvasElement) {
            return true
        }
        
        // 检查是否具有canvas的基本方法（用于兼容性检查）
        return !!(
            element &&
            typeof element === 'object' &&
            typeof element.addEventListener === 'function' &&
            typeof element.getContext === 'function' &&
            element.tagName === 'CANVAS'
        )
    }

    /**
     * 深度合并配置对象（防止循环引用）
     */
    private mergeConfigs(defaultConfig: any, userConfig: any): any {
        // 使用更安全的深拷贝方法
        const result = this.safeDeepClone(defaultConfig)
        
        const merge = (target: any, source: any, visited = new WeakSet()): any => {
            // 防止循环引用
            if (visited.has(source)) {
                console.warn('⚠️ 检测到循环引用，跳过此配置项')
                return target
            }
            
            if (source && typeof source === 'object') {
                visited.add(source)
            }
            
            for (const key in source) {
                if (source.hasOwnProperty && source.hasOwnProperty(key)) {
                    const sourceValue = source[key]
                    
                    if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                        target[key] = target[key] || {}
                        merge(target[key], sourceValue, visited)
                    } else if (sourceValue !== undefined) {
                        target[key] = sourceValue
                    }
                }
            }
            
            if (source && typeof source === 'object') {
                visited.delete(source)
            }
            
            return target
        }
        
        return merge(result, userConfig)
    }

    /**
     * 安全的深拷贝方法（防止循环引用）
     */
    private safeDeepClone(obj: any, visited = new WeakMap()): any {
        // 处理基本类型
        if (obj === null || typeof obj !== 'object') {
            return obj
        }
        
        // 检查循环引用
        if (visited.has(obj)) {
            return visited.get(obj)
        }
        
        // 处理日期
        if (obj instanceof Date) {
            return new Date(obj.getTime())
        }
        
        // 处理数组
        if (Array.isArray(obj)) {
            const arrCopy: any[] = []
            visited.set(obj, arrCopy)
            for (let i = 0; i < obj.length; i++) {
                arrCopy[i] = this.safeDeepClone(obj[i], visited)
            }
            return arrCopy
        }
        
        // 处理对象
        const objCopy: any = {}
        visited.set(obj, objCopy)
        for (const key in obj) {
            if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
                objCopy[key] = this.safeDeepClone(obj[key], visited)
            }
        }
        
        return objCopy
    }

    /**
     * 应用渲染器高级配置
     */
    private applyRendererAdvancedConfig(): void {
        const config = this.rendererAdvancedConfig
        
        // Three.js r155+ 移除了 useLegacyLights 属性
        // 新版本默认使用物理正确的光照，无需手动设置
        console.log('🔧 使用Three.js r155+物理正确光照系统')
        
        // 输出颜色空间
        this.renderer.outputColorSpace = config.outputColorSpace as any
        
        // 色调映射
        this.renderer.toneMapping = config.toneMapping
        this.renderer.toneMappingExposure = config.toneMappingExposure
        
        // 阴影配置（默认关闭）
        this.renderer.shadowMap.enabled = config.shadowMapEnabled
        if (config.shadowMapEnabled) {
            this.renderer.shadowMap.type = config.shadowMapType
            console.log('✅ 阴影系统已启用')
        } else {
            console.log('🚫 阴影系统已关闭（性能优化）')
        }
        
        // 像素比率
        this.renderer.setPixelRatio(config.pixelRatio)
        
        console.log('🔧 渲染器高级配置已应用:', {
            physicallyCorrectLights: config.physicallyCorrectLights,
            outputColorSpace: config.outputColorSpace,
            toneMapping: this.getToneMappingName(config.toneMapping),
            shadowMapEnabled: config.shadowMapEnabled,
            pixelRatio: config.pixelRatio
        })
    }

    /**
     * 获取色调映射名称
     */
    private getToneMappingName(toneMapping: THREE.ToneMapping): string {
        const names: { [key: number]: string } = {
            [THREE.NoToneMapping]: 'NoToneMapping',
            [THREE.LinearToneMapping]: 'LinearToneMapping',
            [THREE.ReinhardToneMapping]: 'ReinhardToneMapping',
            [THREE.CineonToneMapping]: 'CineonToneMapping',
            [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping'
        }
        return names[toneMapping] || 'Unknown'
    }

    /**
     * 更新性能统计
     */
    private updatePerformanceStats(): void {
        if (!this.performanceMonitor.enabled) return

        const now = performance.now()
        const frameTime = now - this.performanceMonitor.lastTime
        this.performanceMonitor.lastTime = now

        // 记录帧时间历史
        this.performanceMonitor.frameTimeHistory.push(frameTime)
        if (this.performanceMonitor.frameTimeHistory.length > 60) {
            this.performanceMonitor.frameTimeHistory.shift()
        }

        // 更新统计数据
        this.performanceMonitor.stats.frameTime = frameTime
        this.performanceMonitor.stats.frameCount++

        // 每秒更新一次统计
        if (now - this.performanceMonitor.lastUpdateTime >= this.performanceMonitor.updateInterval) {
            this.calculatePerformanceStats()
            this.performanceMonitor.lastUpdateTime = now
        }
    }

    /**
     * 计算性能统计
     */
    private calculatePerformanceStats(): void {
        const stats = this.performanceMonitor.stats
        const history = this.performanceMonitor.frameTimeHistory

        // 计算平均帧时间和FPS
        if (history.length > 0) {
            stats.avgFrameTime = history.reduce((sum, time) => sum + time, 0) / history.length
            stats.fps = Math.round(1000 / stats.avgFrameTime)
        }

        // 场景统计
        this.calculateSceneStats()

        // 渲染统计
        const renderInfo = this.renderer.info
        stats.drawCalls = renderInfo.render.calls
        stats.triangles = renderInfo.render.triangles
        stats.points = renderInfo.render.points
        stats.lines = renderInfo.render.lines

        // 内存统计
        stats.textures = renderInfo.memory.textures
        stats.geometries = renderInfo.memory.geometries
        stats.programs = renderInfo.programs?.length || 0

        // 发送性能统计事件
        eventBus.emit('performance:stats', { ...stats })
    }

    /**
     * 计算场景统计（点线面信息）
     */
    private calculateSceneStats(): void {
        let objects = 0
        let vertices = 0
        let faces = 0

        this.scene.traverse((object) => {
            objects++
            
            if (object instanceof THREE.Mesh && object.geometry) {
                const geometry = object.geometry
                
                // 顶点数
                if (geometry.attributes.position) {
                    vertices += geometry.attributes.position.count
                }
                
                // 面数
                if (geometry.index) {
                    faces += geometry.index.count / 3
                } else if (geometry.attributes.position) {
                    faces += geometry.attributes.position.count / 3
                }
            }
        })

        this.performanceMonitor.stats.objects = objects
        this.performanceMonitor.stats.vertices = vertices
        this.performanceMonitor.stats.faces = Math.floor(faces)
    }

    // 初始化设置
    initialize() {
        this.camera.updateProjectionMatrix()
        
        // 根据容器尺寸设置渲染器大小
        this.updateRendererSize()
        
        window.addEventListener("resize", this.handleResize.bind(this))

        eventBus.emit("scene-ready", { 
            scene: this.scene, 
            camera: this.camera,
            renderer: this.renderer
        })
        
        eventBus.on("update", () => {
            // 性能监控
            if (this.performanceMonitor.enabled) {
                this.updatePerformanceStats()
            }
            
            // 渲染场景
            this.renderer.render(this.scene, this.camera)
        })
    }

    /**
     * 更新渲染器尺寸
     */
    private updateRendererSize(): void {
        const width = window.innerWidth
        const height = window.innerHeight
        
        // 更新相机纵横比
        if (this.camera instanceof THREE.PerspectiveCamera) {
            this.camera.aspect = width / height
            this.camera.updateProjectionMatrix()
        }
        
        // 设置渲染器尺寸
        this.renderer.setSize(width, height)
    }

    handleResize() {
        this.updateRendererSize()
    }

    /**
     * 启用/禁用性能监控
     */
    public setPerformanceMonitorEnabled(enabled: boolean): void {
        this.performanceMonitor.enabled = enabled
        console.log(`📊 性能监控${enabled ? '已启用' : '已禁用'}`)
        eventBus.emit('performance:monitor-toggled', { enabled })
    }

    /**
     * 获取当前性能统计
     */
    public getPerformanceStats(): PerformanceStats {
        return { ...this.performanceMonitor.stats }
    }

    /**
     * 重置性能统计
     */
    public resetPerformanceStats(): void {
        this.performanceMonitor.stats = {
            fps: 0,
            frameTime: 0,
            avgFrameTime: 0,
            frameCount: 0,
            objects: 0,
            vertices: 0,
            faces: 0,
            drawCalls: 0,
            triangles: 0,
            points: 0,
            lines: 0,
            textures: 0,
            geometries: 0,
            programs: 0
        }
        this.performanceMonitor.frameTimeHistory = []
        console.log('🔄 性能统计已重置')
    }

    /**
     * 获取渲染器配置信息
     */
    public getRendererConfig(): any {
        return {
            ...this.rendererAdvancedConfig,
            size: {
                width: this.renderer.domElement.width,
                height: this.renderer.domElement.height
            },
            capabilities: this.renderer.capabilities
        }
    }

    /**
     * 更新阴影设置
     */
    public setShadowEnabled(enabled: boolean): void {
        this.rendererAdvancedConfig.shadowMapEnabled = enabled
        this.renderer.shadowMap.enabled = enabled
        this.directionalLight.castShadow = enabled
        
        if (enabled) {
            this.renderer.shadowMap.type = this.rendererAdvancedConfig.shadowMapType
        }
        
        console.log(`🌒 阴影${enabled ? '已启用' : '已禁用'}`)
        eventBus.emit('renderer:shadow-toggled', { enabled })
    }

    /**
     * 更新色调映射
     */
    public setToneMapping(toneMapping: THREE.ToneMapping, exposure?: number): void {
        this.renderer.toneMapping = toneMapping
        this.rendererAdvancedConfig.toneMapping = toneMapping
        
        if (exposure !== undefined) {
            this.renderer.toneMappingExposure = exposure
            this.rendererAdvancedConfig.toneMappingExposure = exposure
        }
        
        console.log(`🎨 色调映射已更新: ${this.getToneMappingName(toneMapping)}`)
    }

    /**
     * 获取场景信息
     */
    public getSceneInfo(): any {
        return {
            children: this.scene.children.length,
            lights: this.scene.children.filter(child => child instanceof THREE.Light).length,
            meshes: this.scene.children.filter(child => child instanceof THREE.Mesh).length,
            cameras: this.scene.children.filter(child => child instanceof THREE.Camera).length,
            background: this.scene.background,
            fog: this.scene.fog !== null
        }
    }

    /**
     * 访问器方法
     */
    get sceneInstance(): THREE.Scene { return this.scene }
    get cameraInstance(): THREE.Camera { return this.camera }
    get rendererInstance(): THREE.WebGLRenderer { return this.renderer }
    get isPerformanceMonitorEnabled(): boolean { return this.performanceMonitor.enabled }

    /**
     * 静态工厂方法 - 创建高性能场景
     */
    static createHighPerformance(customConfig: any = {}): BaseScene {
        return new BaseScene({
            userData: {
                preset: 'highPerformance',
                ...customConfig
            }
        })
    }

    /**
     * 静态工厂方法 - 创建平衡配置场景（推荐）
     */
    static createBalanced(customConfig: any = {}): BaseScene {
        return new BaseScene({
            userData: {
                preset: 'balanced',
                ...customConfig
            }
        })
    }

    /**
     * 静态工厂方法 - 创建高质量场景
     */
    static createHighQuality(customConfig: any = {}): BaseScene {
        return new BaseScene({
            userData: {
                preset: 'highQuality',
                ...customConfig
            }
        })
    }

    /**
     * 静态工厂方法 - 创建开发调试场景
     */
    static createDevelopment(customConfig: any = {}): BaseScene {
        return new BaseScene({
            userData: {
                preset: 'development',
                ...customConfig
            }
        })
    }

    /**
     * 静态工厂方法 - 创建最简场景（最少配置）
     */
    static createMinimal(): BaseScene {
        return new BaseScene({
            userData: {
                preset: 'balanced'
            }
        })
    }

    /**
     * 静态工厂方法 - 创建带Debug模式的场景
     */
    static createWithDebug(preset: string = 'development', customConfig: any = {}): BaseScene {
        return new BaseScene({
            userData: {
                preset,
                debugConfig: {
                    enabled: true,
                    gridHelper: true,
                    axesHelper: true,
                    ...customConfig.debugConfig
                },
                ...customConfig
            }
        })
    }

    /**
     * 获取所有可用的配置预设
     */
    static getAvailablePresets(): string[] {
        return Object.keys(DEFAULT_CONFIGS)
    }

    /**
     * 获取指定预设的详细配置
     */
    static getPresetConfig(preset: string): any {
        return DEFAULT_CONFIGS[preset as keyof typeof DEFAULT_CONFIGS] || null
    }

    destroy() {
        // 清理Debug辅助器
        this.removeDebugHelpers()
        
        window.removeEventListener("resize", this.handleResize)
        this.renderer.dispose()
        this.scene.clear()
        this.ambientLight.dispose()
        this.directionalLight.dispose()
        this.pipelineManager.destroy()
        
        console.log('🧹 BaseScene已销毁')
    }

    update(){ 
        // 预留给子类的更新方法
    }

    // 添加Debug辅助器
    private addDebugHelpers(): void {
        const config = this.debugConfig
        
        if (config.gridHelper) {
            this.debugHelpers.gridHelper = new THREE.GridHelper(config.gridSize, config.gridDivisions)
            this.scene.add(this.debugHelpers.gridHelper)
        }
        
        if (config.axesHelper) {
            this.debugHelpers.axesHelper = new THREE.AxesHelper(config.axesSize)
            this.scene.add(this.debugHelpers.axesHelper)
        }
        
        console.log('🔧 Debug辅助器已添加:', {
            gridHelper: !!this.debugHelpers.gridHelper,
            axesHelper: !!this.debugHelpers.axesHelper
        })
    }

    /**
     * 移除Debug辅助器
     */
    private removeDebugHelpers(): void {
        if (this.debugHelpers.gridHelper) {
            this.scene.remove(this.debugHelpers.gridHelper)
            this.debugHelpers.gridHelper.dispose()
            this.debugHelpers.gridHelper = null
        }
        
        if (this.debugHelpers.axesHelper) {
            this.scene.remove(this.debugHelpers.axesHelper)
            this.debugHelpers.axesHelper.dispose()
            this.debugHelpers.axesHelper = null
        }
        
        console.log('🗑️ Debug辅助器已移除')
    }

    /**
     * 切换Debug模式
     */
    public setDebugMode(enabled: boolean): void {
        this.debugConfig.enabled = enabled
        
        if (enabled) {
            this.addDebugHelpers()
            console.log('🐛 Debug模式已启用')
        } else {
            this.removeDebugHelpers()
            console.log('🚫 Debug模式已禁用')
        }
        
        eventBus.emit('debug:mode-toggled', { enabled })
    }

    /**
     * 切换网格辅助器
     */
    public toggleGridHelper(enabled?: boolean): void {
        const shouldEnable = enabled !== undefined ? enabled : !this.debugHelpers.gridHelper
        
        if (shouldEnable && !this.debugHelpers.gridHelper) {
            this.debugHelpers.gridHelper = new THREE.GridHelper(this.debugConfig.gridSize, this.debugConfig.gridDivisions)
            this.scene.add(this.debugHelpers.gridHelper)
            this.debugConfig.gridHelper = true
            console.log('✅ 网格辅助器已添加')
        } else if (!shouldEnable && this.debugHelpers.gridHelper) {
            this.scene.remove(this.debugHelpers.gridHelper)
            this.debugHelpers.gridHelper.dispose()
            this.debugHelpers.gridHelper = null
            this.debugConfig.gridHelper = false
            console.log('🗑️ 网格辅助器已移除')
        }
        
        eventBus.emit('debug:grid-toggled', { enabled: shouldEnable })
    }

    /**
     * 切换坐标轴辅助器
     */
    public toggleAxesHelper(enabled?: boolean): void {
        const shouldEnable = enabled !== undefined ? enabled : !this.debugHelpers.axesHelper
        
        if (shouldEnable && !this.debugHelpers.axesHelper) {
            this.debugHelpers.axesHelper = new THREE.AxesHelper(this.debugConfig.axesSize)
            this.scene.add(this.debugHelpers.axesHelper)
            this.debugConfig.axesHelper = true
            console.log('✅ 坐标轴辅助器已添加')
        } else if (!shouldEnable && this.debugHelpers.axesHelper) {
            this.scene.remove(this.debugHelpers.axesHelper)
            this.debugHelpers.axesHelper.dispose()
            this.debugHelpers.axesHelper = null
            this.debugConfig.axesHelper = false
            console.log('🗑️ 坐标轴辅助器已移除')
        }
        
        eventBus.emit('debug:axes-toggled', { enabled: shouldEnable })
    }

    /**
     * 更新网格辅助器配置
     */
    public updateGridConfig(size?: number, divisions?: number): void {
        if (size !== undefined) {
            this.debugConfig.gridSize = size
        }
        if (divisions !== undefined) {
            this.debugConfig.gridDivisions = divisions
        }
        
        // 如果网格辅助器已存在，重新创建
        if (this.debugHelpers.gridHelper) {
            this.scene.remove(this.debugHelpers.gridHelper)
            this.debugHelpers.gridHelper.dispose()
            this.debugHelpers.gridHelper = new THREE.GridHelper(this.debugConfig.gridSize, this.debugConfig.gridDivisions)
            this.scene.add(this.debugHelpers.gridHelper)
            console.log(`🔧 网格辅助器已更新: 大小=${this.debugConfig.gridSize}, 分割=${this.debugConfig.gridDivisions}`)
        }
    }

    /**
     * 更新坐标轴辅助器配置
     */
    public updateAxesConfig(size?: number): void {
        if (size !== undefined) {
            this.debugConfig.axesSize = size
        }
        
        // 如果坐标轴辅助器已存在，重新创建
        if (this.debugHelpers.axesHelper) {
            this.scene.remove(this.debugHelpers.axesHelper)
            this.debugHelpers.axesHelper.dispose()
            this.debugHelpers.axesHelper = new THREE.AxesHelper(this.debugConfig.axesSize)
            this.scene.add(this.debugHelpers.axesHelper)
            console.log(`🔧 坐标轴辅助器已更新: 大小=${this.debugConfig.axesSize}`)
        }
    }

    /**
     * 获取Debug状态
     */
    public getDebugStatus(): any {
        return {
            enabled: this.debugConfig.enabled,
            gridHelper: {
                enabled: !!this.debugHelpers.gridHelper,
                size: this.debugConfig.gridSize,
                divisions: this.debugConfig.gridDivisions
            },
            axesHelper: {
                enabled: !!this.debugHelpers.axesHelper,
                size: this.debugConfig.axesSize
            }
        }
    }
}

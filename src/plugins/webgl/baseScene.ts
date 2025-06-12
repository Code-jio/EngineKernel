import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { PipelineManager } from "../../core/pipelineManager"
import { FloorConfig, FloorManager } from "./floorManager"
import { BaseControls, OrbitControlOptions } from "./baseControl"
import * as TWEEN from '@tweenjs/tween.js'
console.log(TWEEN)

const tween_group = new TWEEN.Group();


/**
 * BaseScene - 基础场景插件（增强版）
 * 
 * 🏢 地板功能使用示例：
 * 
 * // 1. 创建带水面地板的场景
 * const scene = BaseScene.createWithFloor('water', 20000)
 * 
 * // 2. 动态切换地板类型
 * scene.setFloorType('grid')  // 切换到网格地板
 * scene.setWaterFloor(30000)  // 设置水面地板
 * scene.setStaticFloor(10000, { color: 0x654321 })  // 设置静态地板
 * 
 * // 3. 使用贴图的地板
 * scene.setStaticFloorWithTexture(15000, './textures/floor.jpg')  // 单贴图地板
 * scene.setStaticFloorWithPBR(20000, {  // PBR地板
 *     diffuse: './textures/floor_diffuse.jpg',
 *     normal: './textures/floor_normal.jpg',
 *     roughness: './textures/floor_roughness.jpg',
 *     metallic: './textures/floor_metallic.jpg'
 * })
 * scene.setWaterFloorWithTexture(25000, './textures/water_normals.jpg')  // 水面法线贴图
 * 
 * // 4. 配置地板参数
 * scene.updateFloorConfig({
 *     waterConfig: { 
 *         color: 0x004466, 
 *         distortionScale: 5.0 
 *     }
 * })
 * 
 * // 5. 切换地板显示
 * scene.toggleFloor(false)  // 隐藏地板
 * scene.toggleFloor(true)   // 显示地板
 * 
 * // 6. 获取地板信息
 * const floorInfo = scene.getFloorInfo()
 * console.log('地板信息:', floorInfo)
 * 
 * 🎥 相机切换功能使用示例：
 * 
 * // 1. 2D/3D相机切换
 * scene.switchTo2D()        // 切换到2D俯视模式
 * scene.switchTo3D()        // 切换到3D透视模式
 * scene.toggleCameraMode()  // 自动切换模式
 * 
 * // 2. 相机状态查询
 * const mode = scene.getCameraMode()         // 获取当前模式 '2D' 或 '3D'
 * const camera = scene.getCurrentCamera()    // 获取当前激活的相机
 * 
 * // 3. 2D相机缩放控制
 * const zoom = scene.get2DCameraZoom()       // 获取2D相机缩放
 * scene.set2DCameraZoom(2.0)                 // 设置2D相机缩放
 * scene.apply2DCameraZoomDelta(0.5)          // 增加缩放增量
 * 
 * 支持的地板类型：
 * - water: 水面地板（参照three.js webgl_shaders_ocean）
 * - static: 静态贴图地板（支持PBR材质）
 * - reflection: 实时反射地板
 * - grid: 网格地板（程序生成）
 * - glow: 发光地板（带脉冲动画）
 * - infinite: 无限地板（跟随相机）
 */

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
            far: 500000,
            position: [200, 200, 200],
            lookAt: [0, 0, 0]
        },
        rendererConfig: {
            antialias: false,
            alpha: false,
            precision: "highp",
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
        },
        floorConfig: {
            enabled: true,
            type: 'static' as const,
            size: 10000,
            position: [0, -1, 0] as [number, number, number],
            staticConfig: {
                color: 0x808080, // 基础颜色
                opacity: 1.0, // 不透明度
                roughness: 0.9, // 粗糙度
                metalness: 0.1, // 金属度
                tiling: [50, 50] as [number, number], // 贴图平铺
                texture: './textures/floor.png',
            }
        }
    },
    
    // 平衡配置（默认推荐）
    balanced: {
        cameraConfig: {
            type: "perspective",
            fov: 45,
            near: 0.01,
            far: 500000,
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
        },
        floorConfig: {
            enabled: true,
            type: 'water' as const,
            size: 20000,
            position: [0, -1, 0] as [number, number, number],
            waterConfig: {
                color: 0x001e0f,
                sunColor: 0xffffff,
                distortionScale: 3.7,
                textureWidth: 512,
                textureHeight: 512,
                alpha: 1.0,
                time: 0
            }
        }
    },
    
    // 高质量配置（适用于桌面端和高端设备）
    highQuality: {
        cameraConfig: {
            type: "perspective",
            fov: 45,
            near: 0.001,
            far: 500000,
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
        },
        floorConfig: {
            enabled: true,
            type: 'reflection' as const,
            size: 30000,
            position: [0, -0.1, 0] as [number, number, number],
            reflectionConfig: {
                reflectivity: 0.8,
                color: 0x404040,
                roughness: 0.1,
                metalness: 0.9,
                mixStrength: 0.7
            }
        }
    },
    
    // 开发调试配置
    development: {
        cameraConfig: {
            type: "perspective",
            fov: 60,
            near: 0.01,
            far: 500000,
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
        },
        floorConfig: {
            enabled: true,
            type: 'grid' as const,
            size: 10000,
            position: [0, -0.1, 0] as [number, number, number],
            gridConfig: {
                gridSize: 100,
                lineWidth: 0.1,
                primaryColor: 0x444444,
                secondaryColor: 0x888888,
                opacity: 0.8,
                divisions: 10
            }
        }
    }
}

interface CameraFlyToOptions {
    position: THREE.Vector3;          // Target position for the camera
    lookAt?: THREE.Vector3;          // Target point for the camera to look at. If undefined, looks at options.position.
    duration?: number;               // Duration of the animation in milliseconds
    easing?: (amount: number) => number; // TWEEN.js easing function
    onUpdate?: () => void; // Callback on each animation frame
    onComplete?: () => void;         // Callback when animation finishes
}

export class BaseScene extends BasePlugin {
    private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // 默认透视相机
    private aspectRatio = window.innerWidth / window.innerHeight
    private scene: THREE.Scene
    private ambientLight: THREE.AmbientLight
    private renderer: THREE.WebGLRenderer
    private pipelineManager: PipelineManager
    private directionalLight: THREE.DirectionalLight
    private controls: BaseControls | null = null
    
    // 相机管理相关
    private cameraConfig!: {
        perspectiveCamera: THREE.PerspectiveCamera
        orthographicCamera: THREE.OrthographicCamera
        currentMode: '2D' | '3D'
        switchAnimationDuration: number
    }
    
    // 地板管理器
    private floorManager: FloorManager
    private floorConfig: FloorConfig
    
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
    
    private _flyTween: any = null;
    
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
        
        // 初始化双相机系统
        this.initializeDualCameraSystem(cameraOption)
        
        // 设置主相机（根据配置类型）
        if (cameraOption.type == "perspective") {
            this.camera = this.cameraConfig.perspectiveCamera
            this.cameraConfig.currentMode = '3D'
        } else {
            this.camera = this.cameraConfig.orthographicCamera
            this.cameraConfig.currentMode = '2D'
        }

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0xffffff)

        // 初始化地板管理器和配置
        this.floorManager = new FloorManager(this.scene)
        this.floorConfig = finalConfig.floorConfig || {
            enabled: false,
            type: 'none',
            size: 1000,
            position: [0, -1, 0]
        }

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

        // 初始化控制器
        this.initializeControls()

        this.initialize()
        
        // 显示初始化信息
        const usedPreset = meta.userData.preset || 'balanced'
        console.log(`✅ BaseScene初始化完成 - 使用预设: ${usedPreset}`, {
            相机类型: cameraOption.type,
            光照系统: 'Three.js r155+ 物理正确光照',
            阴影系统: this.rendererAdvancedConfig.shadowMapEnabled ? '启用' : '禁用',
            性能监控: this.performanceMonitor.enabled ? '启用' : '禁用',
            Debug模式: this.debugConfig.enabled ? '启用' : '禁用',
            地板系统: this.floorConfig.enabled ? `启用(${this.floorConfig.type})` : '禁用',
            色调映射: this.getToneMappingName(this.rendererAdvancedConfig.toneMapping),
            像素比率: this.rendererAdvancedConfig.pixelRatio
        })

        // 如果启用了debug模式，则添加辅助器
        if (this.debugConfig.enabled) {
            this.addDebugHelpers()
        }

        // 创建地板
        if (this.floorConfig.enabled) {
            this.floorManager.createFloor(this.floorConfig, this.renderer)
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
     * 初始化控制器系统
     */
    private initializeControls(): void {
        try {
            // 创建控制器实例
            this.controls = new BaseControls(this.camera, this.renderer.domElement)
            
            // 配置控制器
            this.controls.configure({
                minDistance: 1,
                maxDistance: 50000,
                boundaryRadius: 100000
            })
            
            console.log('🎮 控制器系统已初始化')
        } catch (error) {
            console.error('❌ 控制器初始化失败:', error)
            this.controls = null
        }
    }

    /**
     * 初始化双相机系统
     */
    private initializeDualCameraSystem(cameraOption: any): void {
        // 创建透视相机（3D）
        const perspectiveCamera = new THREE.PerspectiveCamera(
            cameraOption.fov || 45, 
            this.aspectRatio, 
            cameraOption.near || 0.1, 
            cameraOption.far || 100000
        )
        perspectiveCamera.position.set(...(cameraOption.position as [number, number, number]))
        perspectiveCamera.lookAt(...(cameraOption.lookAt as [number, number, number]))

        // 创建正交相机（2D）- 专用于俯视视角
        const frustumSize = 1000 // 适中的视锥体大小，便于观察和缩放
        const orthographicCamera = new THREE.OrthographicCamera(
            frustumSize * this.aspectRatio / -2,
            frustumSize * this.aspectRatio / 2,
            frustumSize / 2,
            frustumSize / -2,
            cameraOption.near || 0.1,
            cameraOption.far || 100000
        )
        
        // 设置正交相机的俯视位置（从上往下看）
        orthographicCamera.position.set(0, 1000, 0) // 足够的高度，确保俯视效果
        orthographicCamera.lookAt(0, 0, 0) // 向下看向原点
        orthographicCamera.up.set(0, 0, -1) // 设置相机的上方向，使Z轴向上
        
        // 初始化zoom属性（OrbitControls需要）
        orthographicCamera.zoom = 1.0
        orthographicCamera.updateProjectionMatrix()
        
        // 标记这是一个俯视相机，用于后续的控制限制
        ;(orthographicCamera as any).isTopDownCamera = true

        // 初始化相机配置对象
        this.cameraConfig = {
            perspectiveCamera,
            orthographicCamera,
            currentMode: cameraOption.type === "perspective" ? '3D' : '2D',
            switchAnimationDuration: 1000 // 切换动画时长（毫秒）
        }

        console.log('🎥 双相机系统已初始化', {
            透视相机: '3D视图',
            正交相机: '2D视图',
            当前模式: this.cameraConfig.currentMode,
        })
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
            const deltaTime = performance.now()
            
            // 更新TWEEN动画（相机切换动画）
            tween_group.update(deltaTime)
            
            // 性能监控
            if (this.performanceMonitor.enabled) {
                this.updatePerformanceStats()
            }
            
            // 更新地板动画
            this.floorManager.updateFloor(deltaTime, this.camera)
            
            // 更新反射（如果是反射地板或水面地板）
            if (this.floorConfig.type === 'reflection' || this.floorConfig.type === 'water') {
                this.floorManager.updateReflection(this.camera, this.renderer)
            }

            // 添加控制器更新（关键修复）
            if (this.controls) {
                const control = this.controls.getControl();
                if (control && typeof control.update === 'function') {
                    control.update();
                }
            }
            
            // 渲染场景（使用当前激活的相机）
            this.renderer.render(this.scene, this.camera)
        })
    }

    /**
     * 更新渲染器尺寸
     */
    private updateRendererSize(): void {
        const width = window.innerWidth
        const height = window.innerHeight
        
        
        // 设置渲染器尺寸
        this.renderer.setSize(width, height)
    }

    handleResize() {
        this.updateRendererSize()
        
        // 更新两个相机的宽高比和投影矩阵
        const newAspectRatio = window.innerWidth / window.innerHeight
        this.aspectRatio = newAspectRatio
        
        // 更新透视相机
        this.cameraConfig.perspectiveCamera.aspect = newAspectRatio
        this.cameraConfig.perspectiveCamera.updateProjectionMatrix()
        
        // 更新正交相机的宽高比
        const orthoCam = this.cameraConfig.orthographicCamera
        const frustumSize = 1000  // 基础视锥体大小
        orthoCam.left = frustumSize * newAspectRatio / -2
        orthoCam.right = frustumSize * newAspectRatio / 2
        orthoCam.top = frustumSize / 2
        orthoCam.bottom = frustumSize / -2
        orthoCam.updateProjectionMatrix()
        
        console.log('📐 相机投影矩阵已更新，新宽高比:', newAspectRatio)
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
    get controlsInstance(): BaseControls | null { return this.controls }
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
     * 静态工厂方法 - 创建带自定义地板的场景
     */
    static createWithFloor(floorType: FloorConfig['type'], floorSize: number = 10000, customConfig: any = {}): BaseScene {
        const floorConfig: Partial<FloorConfig> = {
            enabled: true,
            type: floorType,
            size: floorSize,
            position: [0, 0, 0]
        }

        // 根据地板类型设置默认配置
        switch (floorType) {
            case 'water':
                floorConfig.waterConfig = {
                    color: 0x001e0f,
                    sunColor: 0xffffff,
                    distortionScale: 3.7,
                    textureWidth: 512,
                    textureHeight: 512,
                    alpha: 1.0,
                    time: 0,
                    ...customConfig.waterConfig
                }
                break
            case 'static':
                floorConfig.staticConfig = {
                    color: 0x808080,
                    opacity: 1.0,
                    roughness: 0.8,
                    metalness: 0.2,
                    tiling: [20, 20],
                    ...customConfig.staticConfig
                }
                break
            case 'grid':
                floorConfig.gridConfig = {
                    gridSize: 100,
                    lineWidth: 0.1,
                    primaryColor: 0x444444,
                    secondaryColor: 0x888888,
                    opacity: 0.8,
                    divisions: 10,
                    ...customConfig.gridConfig
                }
                break
        }

        return new BaseScene({
            userData: {
                preset: 'balanced',
                floorConfig,
                ...customConfig
            }
        })
    }

    /**
     * 静态工厂方法 - 创建带贴图地板的场景
     * @param floorType 地板类型
     * @param textureUrl 贴图地址
     * @param floorSize 地板大小
     * @param customConfig 自定义配置
     */
    static createWithTexturedFloor(
        floorType: 'static' | 'water', 
        textureUrl: string, 
        floorSize: number = 10000, 
        customConfig: any = {}
    ): BaseScene {
        const scene = new BaseScene({
            userData: {
                preset: 'balanced',
                floorConfig: {
                    enabled: false, // 先禁用，后面通过方法设置
                    type: 'none',
                    size: 1000,
                    position: [0, 0, 0]
                },
                ...customConfig
            }
        })

        // 创建后立即设置带贴图的地板
        if (floorType === 'static') {
            scene.setStaticFloorWithTexture(floorSize, textureUrl, customConfig.staticConfig)
        } else if (floorType === 'water') {
            scene.setWaterFloorWithTexture(floorSize, textureUrl, customConfig.waterConfig)
        }

        return scene
    }

    /**
     * 静态工厂方法 - 创建带PBR贴图地板的场景
     * @param textures PBR贴图集合
     * @param floorSize 地板大小
     * @param customConfig 自定义配置
     */
    static createWithPBRFloor(
        textures: {
            diffuse?: string
            normal?: string
            roughness?: string
            metallic?: string
        },
        floorSize: number = 10000,
        customConfig: any = {}
    ): BaseScene {
        const scene = new BaseScene({
            userData: {
                preset: 'balanced',
                floorConfig: {
                    enabled: false,
                    type: 'none',
                    size: 1000,
                    position: [0, 0, 0]
                },
                ...customConfig
            }
        })

        // 创建后立即设置PBR地板
        scene.setStaticFloorWithPBR(floorSize, textures, customConfig.staticConfig)

        return scene
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
        // 清理控制器
        if (this.controls) {
            this.controls.destroy()
            this.controls = null
        }
        
        // 清理Debug辅助器
        this.removeDebugHelpers()
        
        // 清理地板
        this.floorManager.destroy()
        
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

    // ================================
    // 地板管理相关方法
    // ================================

    /**
     * 设置地板类型
     * @param type 地板类型
     * @param config 可选的配置参数
     */
    public setFloorType(type: FloorConfig['type'], config?: Partial<FloorConfig>): void {
        this.floorConfig.type = type
        if (config) {
            Object.assign(this.floorConfig, config)
        }
        this.floorManager.createFloor(this.floorConfig, this.renderer)
        console.log(`🏢 地板已切换为: ${type}`)
    }

    /**
     * 更新地板配置
     * @param config 新的配置参数
     */
    public updateFloorConfig(config: Partial<FloorConfig>): void {
        Object.assign(this.floorConfig, config)
        if (this.floorConfig.enabled) {
            this.floorManager.createFloor(this.floorConfig, this.renderer)
        }
    }

    /**
     * 切换地板显示状态
     * @param enabled 是否启用地板
     */
    public toggleFloor(enabled: boolean): void {
        this.floorConfig.enabled = enabled
        if (enabled) {
            this.floorManager.createFloor(this.floorConfig, this.renderer)
        } else {
            this.floorManager.removeFloor()
        }
        console.log(`🏢 地板${enabled ? '已启用' : '已禁用'}`)
    }

    /**
     * 获取地板信息
     */
    public getFloorInfo(): any {
        return {
            config: this.floorConfig,
            floorInfo: this.floorManager.getFloorInfo()
        }
    }

    /**
     * 获取当前地板配置
     */
    public getFloorConfig(): FloorConfig {
        return { ...this.floorConfig }
    }

    /**
     * 预设地板配置 - 水面地板
     */
    public setWaterFloor(size: number = 20000, config?: Partial<FloorConfig['waterConfig']>): void {
        this.setFloorType('water', {
            size,
            position: [0, -0.1, 0],
            waterConfig: {
                color: 0x001e0f,
                sunColor: 0xffffff,
                distortionScale: 3.7,
                textureWidth: 512,
                textureHeight: 512,
                alpha: 1.0,
                time: 0,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 水面地板（带贴图）
     * @param size 地板大小
     * @param waterNormalsUrl 水面法线贴图地址
     * @param config 其他配置参数
     */
    public setWaterFloorWithTexture(
        size: number = 20000, 
        waterNormalsUrl: string, 
        config?: Partial<FloorConfig['waterConfig']>
    ): void {
        this.setFloorType('water', {
            size,
            position: [0, -0.1, 0],
            waterConfig: {
                color: 0x001e0f,
                sunColor: 0xffffff,
                distortionScale: 3.7,
                textureWidth: 512,
                textureHeight: 512,
                alpha: 1.0,
                time: 0,
                waterNormalsUrl,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 静态地板
     */
    public setStaticFloor(size: number = 10000, config?: Partial<FloorConfig['staticConfig']>): void {
        this.setFloorType('static', {
            size,
            position: [0, -1, 0],
            staticConfig: {
                color: 0x808080,
                opacity: 1.0,
                roughness: 0.8,
                metalness: 0.2,
                tiling: [20, 20],
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 静态地板（带贴图）
     * @param size 地板大小
     * @param textureUrl 主贴图地址
     * @param config 其他配置参数
     */
    public setStaticFloorWithTexture(
        size: number = 10000, 
        textureUrl: string, 
        config?: Partial<FloorConfig['staticConfig']>
    ): void {
        this.setFloorType('static', {
            size,
            position: [0, -1, 0],
            staticConfig: {
                color: 0xffffff, // 使用白色以显示贴图原色
                opacity: 1.0,
                roughness: 0.8,
                metalness: 0.2,
                tiling: [20, 20],
                texture: textureUrl,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - PBR静态地板（完整贴图）
     * @param size 地板大小
     * @param textures 贴图集合
     * @param config 其他配置参数
     */
    public setStaticFloorWithPBR(
        size: number = 10000,
        textures: {
            diffuse?: string      // 漫反射贴图
            normal?: string       // 法线贴图
            roughness?: string    // 粗糙度贴图
            metallic?: string     // 金属度贴图
        },
        config?: Partial<FloorConfig['staticConfig']>
    ): void {
        this.setFloorType('static', {
            size,
            position: [0, -1, 0],
            staticConfig: {
                color: 0xffffff,
                opacity: 1.0,
                roughness: 0.8,
                metalness: 0.2,
                tiling: [10, 10],
                texture: textures.diffuse,
                normalMap: textures.normal,
                roughnessMap: textures.roughness,
                metallicMap: textures.metallic,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 网格地板
     */
    public setGridFloor(size: number = 10000, config?: Partial<FloorConfig['gridConfig']>): void {
        this.setFloorType('grid', {
            size,
            position: [0, -0.1, 0],
            gridConfig: {
                gridSize: 100,
                lineWidth: 0.1,
                primaryColor: 0x444444,
                secondaryColor: 0x888888,
                opacity: 0.8,
                divisions: 10,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 反射地板
     */
    public setReflectionFloor(size: number = 30000, config?: Partial<FloorConfig['reflectionConfig']>): void {
        this.setFloorType('reflection', {
            size,
            position: [0, -0.1, 0],
            reflectionConfig: {
                reflectivity: 0.8,
                color: 0x404040,
                roughness: 0.1,
                metalness: 0.9,
                mixStrength: 0.7,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 发光地板
     */
    public setGlowFloor(size: number = 10000, config?: Partial<FloorConfig['glowConfig']>): void {
        this.setFloorType('glow', {
            size,
            position: [0, -150, 0],
            glowConfig: {
                color: 0x0088ff,
                intensity: 1.0,
                emissiveColor: 0x0044aa,
                emissiveIntensity: 2.0,
                pulseSpeed: 1.0,
                ...config
            }
        })
    }

    /**
     * 预设地板配置 - 无限地板
     */
    public setInfiniteFloor(size: number = 10000, config?: Partial<FloorConfig['infiniteConfig']>): void {
        this.setFloorType('infinite', {
            size,
            infiniteConfig: {
                followCamera: true,
                updateDistance: 100,
                gridSize: 10,
                fadeDistance: size * 0.4,
                ...config
            }
        })
    }

    /**
     * 视角飞入
     * 平滑动画地将相机移动到目标位置并朝向目标点
     * @param options 相机飞行配置参数
     */
    public cameraFlyTo(options: CameraFlyToOptions): void {
        // 默认参数设置
        const defaultOptions = {
            duration: 2000, // 动画时长（毫秒）
            easing: TWEEN.Easing.Quadratic.InOut, // 默认缓动函数
            lookAt: options.position, // 默认朝向目标点为目标位置
        };
        // 合并用户参数和默认参数
        const finalOptions = { ...defaultOptions, ...options };

        // 检查相机是否初始化
        if (!this.camera) {
            console.error("cameraFlyTo: Camera is not initialized.");
            return;
        }
        // 检查目标位置类型
        if (!(finalOptions.position instanceof THREE.Vector3)) {
            console.error('cameraFlyTo: options.position 必须是 THREE.Vector3');
            return;
        }
        // 检查目标朝向类型
        if (!(finalOptions.lookAt instanceof THREE.Vector3)) {
            finalOptions.lookAt = finalOptions.position.clone();
        }

        const camera = this.camera as THREE.PerspectiveCamera;
        const startPosition = camera.position.clone(); // 起始相机位置
        const endPosition = finalOptions.position;     // 目标相机位置
        let startLookAt: THREE.Vector3;
        let control = this.controls?.getControl();

        // 获取当前相机朝向点（优先使用controls.target）
        if (control && control.target instanceof THREE.Vector3) {
            startLookAt = control.target.clone();
        } else {
            // 若无controls，取相机前方一点作为朝向
            startLookAt = new THREE.Vector3(0, 0, -1);
            startLookAt.applyQuaternion(camera.quaternion);
            startLookAt.add(camera.position);
            console.warn("cameraFlyTo: OrbitControls or similar not found or target not set. Using calculated startLookAt.");
        }

        const endLookAt = finalOptions.lookAt.clone(); // 目标朝向点

        // 用于tween插值的临时对象
        const tweenCoords = {
            camX: startPosition.x,
            camY: startPosition.y,
            camZ: startPosition.z,
            lookX: startLookAt.x,
            lookY: startLookAt.y,
            lookZ: startLookAt.z,
        };

        // 动画互斥：如有上一个飞行动画，先停止
        if (this._flyTween) {
            this._flyTween.stop();
        }

        // 创建tween动画
        this._flyTween = new TWEEN.Tween(tweenCoords)
            .to({
                camX: endPosition.x,
                camY: endPosition.y,
                camZ: endPosition.z,
                lookX: endLookAt.x,
                lookY: endLookAt.y,
                lookZ: endLookAt.z,
            }, finalOptions.duration)
            .easing(finalOptions.easing)
            .onUpdate(() => {
                // 每帧更新相机位置和朝向
                camera.position.set(tweenCoords.camX, tweenCoords.camY, tweenCoords.camZ);
                const currentLookAt = new THREE.Vector3(tweenCoords.lookX, tweenCoords.lookY, tweenCoords.lookZ);
                // 若有controls，更新controls.target
                if ((this as any).controls && (this as any).controls.target instanceof THREE.Vector3) {
                    (this as any).controls.target.copy(currentLookAt);
                }
                camera.lookAt(currentLookAt);
                // 用户自定义更新回调
                finalOptions.onUpdate?.()
            })
            .onComplete(() => {
                // 动画结束，确保相机和controls到达最终状态
                camera.position.copy(endPosition);
                const finalLookAtTarget = endLookAt.clone();
                if ((this as any).controls && (this as any).controls.target instanceof THREE.Vector3) {
                    (this as any).controls.target.copy(finalLookAtTarget);
                }
                camera.lookAt(finalLookAtTarget);
                if ((this as any).controls && typeof (this as any).controls.update === 'function') {
                    (this as any).controls.update();
                }
                // 用户自定义完成回调
                if (finalOptions.onComplete) {
                    finalOptions.onComplete();
                }
                this._flyTween = null;
                console.log("Camera flight complete.");
            })
            .start();
        tween_group.add(this._flyTween);
    }

    /**
     * 判断是否应该跳过该对象（天空盒等）
     * @param object 要检查的三维对象
     * @returns 是否应该跳过
     */
    private isSkipObject(object: THREE.Object3D): boolean {
        // 跳过天空盒相关对象
        if (object.name && (
            object.name.toLowerCase().includes('sky') ||
            object.name.toLowerCase().includes('skybox') ||
            object.name.toLowerCase().includes('background')
        )) {
            return true;
        }

        // 跳过辅助对象
        if (
            // object instanceof THREE.Helper ||
            object instanceof THREE.Light ||
            object instanceof THREE.Camera) {
            return true;
        }

        // 跳过使用天空盒着色器材质的对象
        if (object instanceof THREE.Mesh && object.material) {
            const material = Array.isArray(object.material) ? object.material[0] : object.material;
            if (material instanceof THREE.ShaderMaterial) {
                // 检查是否是天空盒着色器（通常包含 'sky' 或类似关键词）
                const vertexShader = material.vertexShader?.toLowerCase() || '';
                const fragmentShader = material.fragmentShader?.toLowerCase() || '';
                if (vertexShader.includes('sky') || fragmentShader.includes('sky') ||
                    vertexShader.includes('atmosphere') || fragmentShader.includes('atmosphere')) {
                    return true;
                }
            }
        }

        // 跳过标记为天空盒的用户数据
        if (object.userData && (
            object.userData.isSkybox ||
            object.userData.isBackground ||
            object.userData.skipBounds
        )) {
            return true;
        }

        return false;
    }

    /**
     * 计算对象的包围盒或包围球
     * @param object 要计算边界的对象
     * @returns 包围盒信息，如果无法计算则返回null
     */
    private calculateObjectBounds(object: THREE.Object3D): THREE.Box3 | null {
        if (!(object instanceof THREE.Mesh) || !object.geometry) {
            return null;
        }

        // 首先尝试获取几何体的包围盒
        let boundingBox = object.geometry.boundingBox;
        
        // 如果包围盒不存在，尝试计算它
        if (!boundingBox) {
            try {
                object.geometry.computeBoundingBox();
                boundingBox = object.geometry.boundingBox;
            } catch (error) {
                console.warn('无法计算几何体包围盒:', error);
            }
        }

        // 如果仍然没有包围盒，尝试使用包围球
        if (!boundingBox) {
            let boundingSphere = object.geometry.boundingSphere;
            if (!boundingSphere) {
                try {
                    object.geometry.computeBoundingSphere();
                    boundingSphere = object.geometry.boundingSphere;
                } catch (error) {
                    console.warn('无法计算几何体包围球:', error);
                    return null;
                }
            }

            if (boundingSphere) {
                // 将包围球转换为包围盒
                const radius = boundingSphere.radius;
                const center = boundingSphere.center;
                boundingBox = new THREE.Box3(
                    new THREE.Vector3(center.x - radius, center.y - radius, center.z - radius),
                    new THREE.Vector3(center.x + radius, center.y + radius, center.z + radius)
                );
            }
        }

        if (!boundingBox) {
            return null;
        }

        // 应用对象的世界矩阵变换
        const worldBoundingBox = boundingBox.clone();
        object.updateMatrixWorld(true);
        worldBoundingBox.applyMatrix4(object.matrixWorld);

        return worldBoundingBox;
    }

    /**
     * 递归遍历场景，收集所有有效的包围盒
     * @param object 要遍历的对象
     * @param boundingBoxes 收集包围盒的数组
     */
    private traverseSceneForBounds(object: THREE.Object3D, boundingBoxes: THREE.Box3[]): void {
        // 跳过不需要的对象
        if (this.isSkipObject(object)) {
            return;
        }

        // 尝试计算当前对象的包围盒
        const bounds = this.calculateObjectBounds(object);
        if (bounds) {
            boundingBoxes.push(bounds);
        }

        // 递归处理子对象
        for (const child of object.children) {
            this.traverseSceneForBounds(child, boundingBoxes);
        }
    }

    /**
     * 初始化视角
     * 自动计算场景中所有物体的包围盒，避开天空盒等特殊对象
     * 递归查找几何体，优先使用包围盒，备选包围球
     * 计算总包围盒和场景中心点，中心点高度设为0
     */
    public initializeView(): {
        center: THREE.Vector3;
        boundingBox: THREE.Box3 | null;
        objectCount: number;
        hasValidBounds: boolean;
    } {
        const boundingBoxes: THREE.Box3[] = [];

        // 递归遍历场景收集所有有效的包围盒
        this.traverseSceneForBounds(this.scene, boundingBoxes);

        console.log(`🔍 场景包围盒计算: 找到 ${boundingBoxes.length} 个有效对象`);

        // 如果没有找到任何包围盒
        if (boundingBoxes.length === 0) {
            console.warn('⚠️ 场景中没有找到任何有效的几何体对象');
            return {
                center: new THREE.Vector3(0, 0, 0),
                boundingBox: null,
                objectCount: 0,
                hasValidBounds: false
            };
        }

        // 计算总的包围盒
        const totalBoundingBox = new THREE.Box3();
        boundingBoxes.forEach(box => {
            totalBoundingBox.union(box);
        });

        // 计算中心点
        const center = new THREE.Vector3();
        totalBoundingBox.getCenter(center);
        
        // 将中心点的高度设置为0
        center.y = 0;

        // 计算包围盒尺寸用于调试信息
        const size = new THREE.Vector3();
        totalBoundingBox.getSize(size);

        console.log(`📐 场景边界计算完成:`);
        console.log(`   🎯 中心点: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
        console.log(`   📏 尺寸: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`);
        console.log(`   📦 对象数量: ${boundingBoxes.length}`);

        return {
            center,
            boundingBox: totalBoundingBox,
            objectCount: boundingBoxes.length,
            hasValidBounds: true
        };
    }

    /**
     * 自动计算最佳相机位置并飞行过去
     * 使用等轴测视角，确保场景完整可见，注视场景中心点
     */
    public autoFitScene(): void {
        // 1. 计算场景包围盒和中心点
        const viewInfo = this.initializeView();
        
        if (!viewInfo.hasValidBounds) {
            console.warn('⚠️ 无法获取有效的场景边界，无法自动适应场景');
            return;
        }
        
        const { boundingBox, center } = viewInfo;
        
        // 2. 计算包围盒尺寸
        const size = new THREE.Vector3();
        boundingBox!.getSize(size);
        
        // 3. 计算场景的最大尺寸
        const maxDimension = Math.max(size.x, size.y, size.z);
        
        // 4. 获取当前相机FOV并计算合适的距离
        const currentCamera = this.camera as THREE.PerspectiveCamera;
        const fov = currentCamera.fov || 45;
        const fovRad = (fov * Math.PI) / 180;
        
        // 计算距离，包含1.5倍边距确保场景完整可见
        const distance = (maxDimension * 1.5) / (2 * Math.tan(fovRad / 2));
        
        // 5. 计算等轴测相机位置（45度角，从右上前方观察）
        const cameraPosition = new THREE.Vector3(
            center.x + distance * 0.7071, // cos(45°) ≈ 0.7071
            center.y + distance * 0.7071,
            center.z + distance * 0.7071
        );
        
        console.log(`📷 自动适应场景:`);
        console.log(`   🎯 场景中心: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
        console.log(`   📍 相机位置: (${cameraPosition.x.toFixed(2)}, ${cameraPosition.y.toFixed(2)}, ${cameraPosition.z.toFixed(2)})`);
        console.log(`   📏 场景尺寸: ${maxDimension.toFixed(2)}`);
        console.log(`   🚀 开始飞行...`);
        
        // 6. 飞行到目标位置，注视场景中心点
        this.cameraFlyTo({
            position: cameraPosition,
            lookAt: center,
            duration: 2000,
            onComplete: () => {
                console.log('✅ 场景适应完成');
            }
        });
    }

    public getCameraState() {
        // 返回当前相机状态
        const control = this.controls?.getControl();
        
        let state: any = {
            position: this.camera.position.clone(),
            lookAt: control?.target.clone(),
            mode: this.controls?.getCurrentMode(),
            distance: this.controls?.getDistanceFromCenter(),
            target: control?.target.clone(),
            up: this.camera.up.clone(),
            quaternion: this.camera.quaternion.clone(),
            rotation: this.camera.rotation.clone(),
        }

        // 根据相机类型添加特定属性
        if (this.camera instanceof THREE.PerspectiveCamera) {
            state.fov = this.camera.fov;
            state.aspect = this.camera.aspect;
            state.near = this.camera.near;
            state.far = this.camera.far;
        } else if (this.camera instanceof THREE.OrthographicCamera) {
            state.zoom = this.camera.zoom;
            state.left = this.camera.left;
            state.right = this.camera.right;
            state.top = this.camera.top;
            state.bottom = this.camera.bottom;
            state.near = this.camera.near;
            state.far = this.camera.far;
        }

        // 添加控制器特定状态
        if (control) {
            state.controlsEnabled = control.enabled;
            state.enableZoom = control.enableZoom;
            state.enableRotate = control.enableRotate;
            state.enablePan = control.enablePan;
            state.minDistance = control.minDistance;
            state.maxDistance = control.maxDistance;
            state.minPolarAngle = control.minPolarAngle;
            state.maxPolarAngle = control.maxPolarAngle;
            state.minAzimuthAngle = control.minAzimuthAngle;
            state.maxAzimuthAngle = control.maxAzimuthAngle;
        }
        
        return state;
    }

    public setCameraState(state: any) {
        if (!state) return;

        // 恢复相机位置和方向
        if (state.position) {
            this.camera.position.copy(state.position);
        }
        if (state.up) {
            this.camera.up.copy(state.up);
        }
        if (state.quaternion) {
            this.camera.quaternion.copy(state.quaternion);
        }
        if (state.rotation) {
            this.camera.rotation.copy(state.rotation);
        }

        // 恢复相机特定属性
        if (this.camera instanceof THREE.PerspectiveCamera) {
            if (state.fov !== undefined) this.camera.fov = state.fov;
            if (state.aspect !== undefined) this.camera.aspect = state.aspect;
            if (state.near !== undefined) this.camera.near = state.near;
            if (state.far !== undefined) this.camera.far = state.far;
        } else if (this.camera instanceof THREE.OrthographicCamera) {
            if (state.zoom !== undefined) this.camera.zoom = state.zoom;
            if (state.left !== undefined) this.camera.left = state.left;
            if (state.right !== undefined) this.camera.right = state.right;
            if (state.top !== undefined) this.camera.top = state.top;
            if (state.bottom !== undefined) this.camera.bottom = state.bottom;
            if (state.near !== undefined) this.camera.near = state.near;
            if (state.far !== undefined) this.camera.far = state.far;
        }

        // 更新相机投影矩阵
        this.camera.updateProjectionMatrix();

        // 恢复控制器状态
        const control = this.controls?.getControl();
        if (control) {
            if (state.target) {
                control.target.copy(state.target);
            }
            if (state.lookAt) {
                control.target.copy(state.lookAt);
            }
            if (state.controlsEnabled !== undefined) control.enabled = state.controlsEnabled;
            if (state.enableZoom !== undefined) control.enableZoom = state.enableZoom;
            if (state.enableRotate !== undefined) control.enableRotate = state.enableRotate;
            if (state.enablePan !== undefined) control.enablePan = state.enablePan;
            if (state.minDistance !== undefined) control.minDistance = state.minDistance;
            if (state.maxDistance !== undefined) control.maxDistance = state.maxDistance;
            if (state.minPolarAngle !== undefined) control.minPolarAngle = state.minPolarAngle;
            if (state.maxPolarAngle !== undefined) control.maxPolarAngle = state.maxPolarAngle;
            if (state.minAzimuthAngle !== undefined) control.minAzimuthAngle = state.minAzimuthAngle;
            if (state.maxAzimuthAngle !== undefined) control.maxAzimuthAngle = state.maxAzimuthAngle;
            
            // 更新控制器
            control.update();
        }

        console.log('📷 相机状态已恢复');
    }
}

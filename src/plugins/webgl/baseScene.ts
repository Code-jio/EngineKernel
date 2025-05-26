import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { PipelineManager } from "../../core/pipelineManager"

// 相机配置接口
interface CameraConfig {
    type: 'perspective' | 'orthographic'
    fov?: number
    near?: number
    far?: number
    position?: [number, number, number]
    lookAt?: [number, number, number]
    zoom?: number
}

// 渲染器配置接口
interface RendererConfig {
    container?: HTMLCanvasElement | null
    antialias?: boolean
    alpha?: boolean
    precision?: 'highp' | 'mediump' | 'lowp'
    powerPreference?: 'default' | 'high-performance' | 'low-power'
    clearColor?: number
    outputColorSpace?: string
}

// 灯光配置接口
interface LightConfig {
    ambientLight?: {
        color?: number
        intensity?: number
    }
    directionalLight?: {
        color?: number
        intensity?: number
        position?: [number, number, number]
        castShadow?: boolean
    }
}

// 场景配置接口
interface SceneConfig {
    backgroundColor?: number
    fog?: {
        color: number
        near: number
        far: number
    }
}

export class BaseScene extends BasePlugin {
    private camera!: THREE.PerspectiveCamera | THREE.OrthographicCamera
    private scene!: THREE.Scene
    private ambientLight!: THREE.AmbientLight
    private renderer!: THREE.WebGLRenderer
    private pipelineManager!: PipelineManager
    private directionalLight!: THREE.DirectionalLight
    
    // 默认配置
    private readonly defaultCameraConfig: Required<CameraConfig> = {
        type: 'perspective',
        fov: 45,
        near: 0.1,
        far: 100000,
        position: [0, 5, 10],
        lookAt: [0, 0, 0],
        zoom: 1
    }

    private readonly defaultRendererConfig: Required<RendererConfig> = {
        container: null,
        antialias: true,
        alpha: false,
        precision: 'highp',
        powerPreference: 'high-performance',
        clearColor: 0x444444,
        outputColorSpace: 'srgb'
    }

    private readonly defaultLightConfig: Required<LightConfig> = {
        ambientLight: {
            color: 0xffffff,
            intensity: 0.6
        },
        directionalLight: {
            color: 0xffffff,
            intensity: 1.0,
            position: [10, 10, 10],
            castShadow: true
        }
    }

    private readonly defaultSceneConfig: Required<SceneConfig> = {
        backgroundColor: 0x444444,
        fog: {
            color: 0x444444,
            near: 50,
            far: 200
        }
    }
    
    constructor(meta: any) {
        super(meta)
        
        try {
            // 合并用户配置和默认配置
            const cameraConfig = this.mergeCameraConfig(meta.userData?.cameraConfig)
            const rendererConfig = this.mergeRendererConfig(meta.userData?.rendererConfig)
            const lightConfig = this.mergeLightConfig(meta.userData?.lightConfig)
            const sceneConfig = this.mergeSceneConfig(meta.userData?.sceneConfig)
            
            // 验证配置参数
            this.validateConfigs(cameraConfig, rendererConfig, lightConfig, sceneConfig)
            
            // 初始化组件
            this.initializeRenderer(rendererConfig)
            this.initializeCamera(cameraConfig)
            this.initializeScene(sceneConfig)
            this.initializeLights(lightConfig)
            
            // 存储渲染器实例供其他插件使用
            meta.userData.renderer = this.renderer
            
            this.pipelineManager = new PipelineManager()
            this.setupSceneReady()
            
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误'
            console.error('BaseScene 初始化失败:', error)
            throw new Error(`场景插件初始化错误: ${errorMessage}`)
        }
    }

    /**
     * 合并相机配置
     */
    private mergeCameraConfig(userConfig?: Partial<CameraConfig>): Required<CameraConfig> {
        return {
            ...this.defaultCameraConfig,
            ...userConfig
        }
    }

    /**
     * 合并渲染器配置
     */
    private mergeRendererConfig(userConfig?: Partial<RendererConfig>): Required<RendererConfig> {
        return {
            ...this.defaultRendererConfig,
            ...userConfig
        }
    }

    /**
     * 合并灯光配置
     */
    private mergeLightConfig(userConfig?: Partial<LightConfig>): Required<LightConfig> {
        const merged = { ...this.defaultLightConfig }
        
        if (userConfig?.ambientLight) {
            merged.ambientLight = { ...merged.ambientLight, ...userConfig.ambientLight }
        }
        
        if (userConfig?.directionalLight) {
            merged.directionalLight = { ...merged.directionalLight, ...userConfig.directionalLight }
        }
        
        return merged
    }

    /**
     * 合并场景配置
     */
    private mergeSceneConfig(userConfig?: Partial<SceneConfig>): Required<SceneConfig> {
        const merged = { ...this.defaultSceneConfig }
        
        if (userConfig?.fog) {
            merged.fog = { ...merged.fog, ...userConfig.fog }
        }
        
        return { ...merged, ...userConfig }
    }

    /**
     * 验证配置参数
     */
    private validateConfigs(
        cameraConfig: Required<CameraConfig>,
        rendererConfig: Required<RendererConfig>,
        lightConfig: Required<LightConfig>,
        sceneConfig: Required<SceneConfig>
    ): void {
        // 验证相机参数
        if (cameraConfig.fov <= 0 || cameraConfig.fov >= 180) {
            throw new Error('相机视野角度必须在 0-180 度之间')
        }
        
        if (cameraConfig.near <= 0 || cameraConfig.far <= cameraConfig.near) {
            throw new Error('相机近裁剪面必须大于0，远裁剪面必须大于近裁剪面')
        }
        
        // 验证灯光参数
        const ambientIntensity = lightConfig.ambientLight?.intensity ?? 0
        if (ambientIntensity < 0 || ambientIntensity > 10) {
            throw new Error('环境光强度应该在 0-10 之间')
        }
        
        const directionalIntensity = lightConfig.directionalLight?.intensity ?? 0
        if (directionalIntensity < 0 || directionalIntensity > 10) {
            throw new Error('平行光强度应该在 0-10 之间')
        }
    }

    /**
     * 初始化渲染器
     */
    private initializeRenderer(rendererConfig: Required<RendererConfig>): void {
        // 处理容器元素
        const containerElement = this.getOrCreateContainer(rendererConfig.container)
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: containerElement,
            antialias: rendererConfig.antialias,
            alpha: rendererConfig.alpha,
            precision: rendererConfig.precision,
            powerPreference: rendererConfig.powerPreference,
        })

        // 设置渲染器属性
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // 限制最大像素比，提升性能
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.setClearColor(rendererConfig.clearColor, rendererConfig.alpha ? 0 : 1)
        this.renderer.outputColorSpace = rendererConfig.outputColorSpace as any
        
        // 启用阴影
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }

    /**
     * 获取或创建容器元素
     */
    private getOrCreateContainer(container: HTMLCanvasElement | null): HTMLCanvasElement {
        if (container) {
            return container
        }

        // 寻找现有容器
        const existingContainer = document.querySelector('#container') as HTMLCanvasElement
        if (existingContainer) {
            return existingContainer
        }

        // 创建新容器
        const newCanvas = document.createElement('canvas')
        newCanvas.id = 'container'
        this.setupCanvasStyles(newCanvas)
        document.body.appendChild(newCanvas)
        
        return newCanvas
    }

    /**
     * 设置画布样式
     */
    private setupCanvasStyles(canvas: HTMLCanvasElement): void {
        const canvasStyles = {
            width: '100%',
            height: '100%',
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '-1',
            display: 'block'
        }
        
        Object.assign(canvas.style, canvasStyles)
    }

    /**
     * 初始化相机
     */
    private initializeCamera(cameraConfig: Required<CameraConfig>): void {
        const aspectRatio = window.innerWidth / window.innerHeight
        
        if (cameraConfig.type === 'perspective') {
            this.camera = new THREE.PerspectiveCamera(
                cameraConfig.fov,
                aspectRatio,
                cameraConfig.near,
                cameraConfig.far
            )
        } else {
            const frustumSize = 10
            this.camera = new THREE.OrthographicCamera(
                frustumSize * aspectRatio / -2,
                frustumSize * aspectRatio / 2,
                frustumSize / 2,
                frustumSize / -2,
                cameraConfig.near,
                cameraConfig.far
            )
        }

        // 设置相机位置和朝向
        this.camera.position.set(...cameraConfig.position)
        this.camera.lookAt(...cameraConfig.lookAt)
        this.camera.updateProjectionMatrix()
    }

    /**
     * 初始化场景
     */
    private initializeScene(sceneConfig: Required<SceneConfig>): void {
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(sceneConfig.backgroundColor)
        
        // 添加雾效（可选）
        if (sceneConfig.fog) {
            this.scene.fog = new THREE.Fog(
                sceneConfig.fog.color,
                sceneConfig.fog.near,
                sceneConfig.fog.far
            )
        }
    }

    /**
     * 初始化灯光
     */
    private initializeLights(lightConfig: Required<LightConfig>): void {
        // 环境光
        this.ambientLight = new THREE.AmbientLight(
            lightConfig.ambientLight.color,
            lightConfig.ambientLight.intensity
        )
        this.scene.add(this.ambientLight)

        // 平行光
        this.directionalLight = new THREE.DirectionalLight(
            lightConfig.directionalLight.color,
            lightConfig.directionalLight.intensity
        )
        
        const position = lightConfig.directionalLight.position || [10, 10, 10] as [number, number, number]
        const [x, y, z] = position
        this.directionalLight.position.set(x, y, z)
        this.directionalLight.castShadow = lightConfig.directionalLight.castShadow ?? false
        
        // 设置阴影参数
        if (lightConfig.directionalLight.castShadow) {
            this.setupShadowSettings()
        }
        
        this.scene.add(this.directionalLight)
    }

    /**
     * 设置阴影参数
     */
    private setupShadowSettings(): void {
        const shadowMapSize = 2048
        this.directionalLight.shadow.mapSize.width = shadowMapSize
        this.directionalLight.shadow.mapSize.height = shadowMapSize
        this.directionalLight.shadow.camera.near = 0.5
        this.directionalLight.shadow.camera.far = 500
        this.directionalLight.shadow.camera.left = -50
        this.directionalLight.shadow.camera.right = 50
        this.directionalLight.shadow.camera.top = 50
        this.directionalLight.shadow.camera.bottom = -50
    }

    /**
     * 设置场景就绪事件
     */
    private setupSceneReady(): void {
        // 添加窗口大小变化监听
        window.addEventListener("resize", this.handleWindowResize.bind(this))
        
        // 发送场景就绪事件
        eventBus.emit("scene-ready", { 
            scene: this.scene, 
            camera: this.camera,
            renderer: this.renderer 
        })
        
        // 监听更新事件
        eventBus.on("update", this.handleUpdate.bind(this))
    }

    /**
     * 处理窗口大小变化
     */
    private handleWindowResize(): void {
        const newWidth = window.innerWidth
        const newHeight = window.innerHeight
        const newAspectRatio = newWidth / newHeight
        
        if (this.camera instanceof THREE.PerspectiveCamera) {
            this.camera.aspect = newAspectRatio
        } else if (this.camera instanceof THREE.OrthographicCamera) {
            const frustumSize = 10
            this.camera.left = frustumSize * newAspectRatio / -2
            this.camera.right = frustumSize * newAspectRatio / 2
            this.camera.top = frustumSize / 2
            this.camera.bottom = frustumSize / -2
        }
        
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(newWidth, newHeight)
    }

    /**
     * 处理更新事件
     */
    private handleUpdate(): void {
        this.renderer.render(this.scene, this.camera)
    }

    destroy() {
        window.removeEventListener("resize", this.handleWindowResize)
        eventBus.off("update", this.handleUpdate)
        this.renderer.dispose()
        this.scene.clear()
        this.ambientLight.dispose()
        this.pipelineManager.destroy()
        // super.destroy()
    }

    update(){ }
}

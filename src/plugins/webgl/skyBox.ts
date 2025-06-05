import { THREE, BasePlugin } from "../basePlugin"
import { RGBELoader, EXRLoader } from "../../utils/three-imports"
import eventBus from '../../eventBus/eventBus'
import { Sky } from "../../glsl/sky"

// 天空盒类型枚举
enum SkyBoxType {
    CUBE_TEXTURE = 'cubeTexture',           // 立方体贴图
    PROCEDURAL_SKY = 'proceduralSky',       // 程序化天空
    ENVIRONMENT_MAP = 'environmentMap',     // 环境贴图
    HDR_ENVIRONMENT = 'hdrEnvironment',     // HDR环境贴图
    // 未来可扩展：
    // SKY_DOME = 'skyDome',                // 天空穹顶
    // LAYERED_SKY = 'layeredSky'           // 分层天空
}

interface SkyBoxConfig {
    type: SkyBoxType
    size?: number
    
    // 立方体贴图配置
    texturePaths?: string[]
    
    // 环境贴图配置
    envMapPath?: string
    
    // HDR环境贴图配置
    hdrMapPath?: string
    hdrIntensity?: number
    
    // EXR环境贴图配置
    exrMapPath?: string
    exrIntensity?: number
    exrDataType?: 'HalfFloat' | 'Float'  // EXR数据类型
    
    // 程序化天空配置
    skyConfig?: {
        turbidity?: number          // 大气浑浊度
        rayleigh?: number          // 瑞利散射系数
        mieCoefficient?: number    // 米氏散射系数
        mieDirectionalG?: number   // 米氏散射方向性
        sunPosition?: { x: number, y: number, z: number }
        elevation?: number         // 太阳高度角
        azimuth?: number          // 太阳方位角
        exposure?: number         // 曝光度
    }
}

export class SkyBox extends BasePlugin {
    private cubeTextureLoader: THREE.CubeTextureLoader
    private textureLoader: THREE.TextureLoader
    private rgbeLoader: RGBELoader
    private exrLoader: EXRLoader
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private mesh: THREE.Mesh | null = null
    private config: SkyBoxConfig
    private boundHandleResize: () => void = this.handleResize.bind(this)
    private skyMaterial: Sky | null = null
    private sun: THREE.Vector3 = new THREE.Vector3()

    constructor(meta: any) {
        super(meta)
        
        // 验证必需参数
        if (!meta.userData?.scene) throw new Error("SkyBox插件缺少scene参数")
        if (!meta.userData?.camera) throw new Error("SkyBox插件缺少camera参数")
        if (!meta.userData?.renderer) throw new Error("SkyBox插件缺少renderer参数")
        
        // 初始化加载器
        this.cubeTextureLoader = new THREE.CubeTextureLoader()
        this.textureLoader = new THREE.TextureLoader()
        this.rgbeLoader = new RGBELoader()
        this.exrLoader = new EXRLoader()
        
        // 保存引用
        this.scene = meta.userData.scene
        this.camera = meta.userData.camera
        this.renderer = meta.userData.renderer
        
        // 解析配置
        this.config = this.parseConfig(meta.userData)
        
        this.initialize()
    }

    private parseConfig(userData: any): SkyBoxConfig {
        const config: SkyBoxConfig = {
            type: userData.skyBoxType || SkyBoxType.PROCEDURAL_SKY,
            size: userData.size || 1000
        }

        // 立方体贴图配置
        if (config.type === SkyBoxType.CUBE_TEXTURE && userData.texturePaths) {
            config.texturePaths = userData.texturePaths
        }

        // 环境贴图配置
        if (config.type === SkyBoxType.ENVIRONMENT_MAP && userData.envMapPath) {
            config.envMapPath = userData.envMapPath
        }

        // HDR环境贴图配置
        if (config.type === SkyBoxType.HDR_ENVIRONMENT && userData.hdrMapPath) {
            config.hdrMapPath = userData.hdrMapPath
            config.hdrIntensity = userData.hdrIntensity || 1.0
        }

        // EXR环境贴图配置
        if (config.type === SkyBoxType.HDR_ENVIRONMENT && userData.exrMapPath) {
            config.exrMapPath = userData.exrMapPath
            config.exrIntensity = userData.exrIntensity || 1.0
            config.exrDataType = userData.exrDataType || 'HalfFloat'
        }

        // 支持通用环境贴图路径用于HDR_ENVIRONMENT（自动检测格式）
        if (config.type === SkyBoxType.HDR_ENVIRONMENT && !config.hdrMapPath && !config.exrMapPath && userData.envMapPath) {
            config.envMapPath = userData.envMapPath
            // 根据文件扩展名设置默认强度
            const fileExt = userData.envMapPath.toLowerCase().split('.').pop()
            if (fileExt === 'exr') {
                config.exrIntensity = userData.intensity || userData.exrIntensity || 1.0
                config.exrDataType = userData.exrDataType || 'HalfFloat'
            } else {
                config.hdrIntensity = userData.intensity || userData.hdrIntensity || 1.0
            }
        }

        // 程序化天空配置
        if (config.type === SkyBoxType.PROCEDURAL_SKY) {
            config.skyConfig = {
                turbidity: userData.turbidity || 10,
                rayleigh: userData.rayleigh || 3,
                mieCoefficient: userData.mieCoefficient || 0.005,
                mieDirectionalG: userData.mieDirectionalG || 0.7,
                sunPosition: userData.sunPosition || { x: 1, y: 1, z: 1 },
                elevation: userData.elevation || 2,
                azimuth: userData.azimuth || 180,
                exposure: userData.exposure || this.renderer.toneMappingExposure
            }
            
            // 计算太阳位置
            const phi = THREE.MathUtils.degToRad(90 - config.skyConfig.elevation!)
            const theta = THREE.MathUtils.degToRad(config.skyConfig.azimuth!)
            this.sun.setFromSphericalCoords(1, phi, theta)
            this.skyMaterial?.material.uniforms["sunPosition"].value.copy(this.sun)
            
            // 设置渲染器
            this.renderer.toneMappingExposure = config.skyConfig.exposure!
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        }

        return config
    }

    initialize() {
        // 监听场景就绪事件
        this.sceneReadyHandler = this.sceneReadyHandler.bind(this)
        eventBus.on("scene-ready", this.sceneReadyHandler)

        // 根据类型创建天空盒
        this.createSkyBox()

        // 监听窗口大小变化
        window.addEventListener("resize", this.boundHandleResize)

        console.log(`SkyBox插件初始化完成，类型: ${this.config.type}`)
    }

    private createSkyBox() {
        switch (this.config.type) {
            case SkyBoxType.CUBE_TEXTURE:
                this.createCubeTextureSkyBox()
                break
            case SkyBoxType.ENVIRONMENT_MAP:
                this.createEnvironmentMapSkyBox()
                break
            case SkyBoxType.HDR_ENVIRONMENT:
                this.createHDREnvironmentSkyBox()
                break
            case SkyBoxType.PROCEDURAL_SKY:
                this.createProceduralSkyBox()
                break
            default:
                console.warn("未知的天空盒类型，使用默认程序化天空")
                this.createProceduralSkyBox()
        }
    }

    private createCubeTextureSkyBox() {
        if (!this.config.texturePaths) {
            console.error("立方体贴图天空盒缺少贴图路径")
            return
        }

        this.cubeTextureLoader.load(
            this.config.texturePaths,
            texture => {
                const geometry = new THREE.BoxGeometry(
                    this.config.size!,
                    this.config.size!,
                    this.config.size!
                )
                const material = new THREE.MeshBasicMaterial({
                    envMap: texture,
                    side: THREE.BackSide,
                })
                this.mesh = new THREE.Mesh(geometry, material)
                this.mesh.scale.setScalar(100000)
                
                eventBus.emit("skybox-ready", { type: SkyBoxType.CUBE_TEXTURE })
                
                // 自动添加到场景
                this.addToScene()
            },
            undefined,
            err => {
                console.error("立方体贴图天空盒加载失败:", err)
                eventBus.emit("skybox-error", err)
            }
        )
    }

    // 
    private createEnvironmentMapSkyBox() {
        if (!this.config.envMapPath) {
            console.error("环境贴图天空盒缺少贴图路径")
            return
        }

        this.textureLoader.load(
            this.config.envMapPath,
            texture => {
                const geometry = new THREE.SphereGeometry(this.config.size! / 2, 64, 32)
                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.BackSide,
                })
                this.mesh = new THREE.Mesh(geometry, material)
                
                eventBus.emit("skybox-ready", { type: SkyBoxType.ENVIRONMENT_MAP })
                
                // 自动添加到场景
                this.addToScene()
            },
            undefined,
            err => {
                console.error("环境贴图天空盒加载失败:", err)
                eventBus.emit("skybox-error", err)
            }
        )
    }

    // HDR/EXR环境贴图天空盒
    private createHDREnvironmentSkyBox() {
        // 检查配置 - 支持多种配置方式
        const filePath = this.config.hdrMapPath || this.config.exrMapPath || this.config.envMapPath
        if (!filePath) {
            console.error("HDR环境贴图天空盒缺少文件路径")
            return
        }

        // 根据文件扩展名自动选择加载器
        const fileExtension = filePath.toLowerCase().split('.').pop()
        const isEXR = fileExtension === 'exr'
        const isHDR = fileExtension === 'hdr' || fileExtension === 'pic'

        if (!isEXR && !isHDR) {
            console.error("不支持的HDR文件格式，仅支持 .hdr、.pic 和 .exr 格式")
            return
        }

        if (isEXR) {
            this.loadEXREnvironment(filePath)
        } else {
            this.loadHDREnvironment(filePath)
        }
    }

    // 加载HDR格式环境贴图
    private loadHDREnvironment(filePath: string) {
        console.log("开始加载HDR环境贴图:", filePath)
        
        this.rgbeLoader.load(
            filePath,
            texture => {
                this.setupEnvironmentTexture(texture, 'HDR', this.config.hdrIntensity || 1.0)
            },
            progress => {
                console.log("HDR文件加载进度:", (progress.loaded / progress.total * 100).toFixed(2) + '%')
            },
            err => {
                console.error("HDR环境贴图加载失败:", err)
                eventBus.emit("skybox-error", err)
            }
        )
    }

    // 加载EXR格式环境贴图
    private loadEXREnvironment(filePath: string) {
        console.log("开始加载EXR环境贴图:", filePath)
        
        // 设置EXR数据类型
        if (this.config.exrDataType === 'Float') {
            this.exrLoader.setDataType(THREE.FloatType)
        } else {
            this.exrLoader.setDataType(THREE.HalfFloatType) // 默认使用HalfFloat以节省内存
        }
        
        this.exrLoader.load(
            filePath,
            texture => {
                this.setupEnvironmentTexture(texture, 'EXR', this.config.exrIntensity || 1.0)
            },
            progress => {
                console.log("EXR文件加载进度:", (progress.loaded / progress.total * 100).toFixed(2) + '%')
            },
            err => {
                console.error("EXR环境贴图加载失败:", err)
                eventBus.emit("skybox-error", err)
            }
        )
    }

    // 设置环境纹理（HDR和EXR通用）
    private setupEnvironmentTexture(texture: THREE.DataTexture, format: string, intensity: number) {
        // 设置纹理参数
        texture.mapping = THREE.EquirectangularReflectionMapping
        
        // 设置为场景背景
        this.scene.background = texture
        this.scene.environment = texture
        
        // 设置曝光度和色调映射
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping
        this.renderer.toneMappingExposure = intensity
        
        // 创建天空盒网格（可选，用于调试）
        const geometry = new THREE.SphereGeometry(this.config.size! / 2, 64, 32)
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.BackSide,
        })
        this.mesh = new THREE.Mesh(geometry, material)
        this.mesh.renderOrder = -1000  // 确保在最后渲染
        
        eventBus.emit("skybox-ready", { 
            type: SkyBoxType.HDR_ENVIRONMENT,
            texture: texture,
            format: format,
            intensity: intensity
        })
        
        console.log(`${format}环境天空盒加载成功，强度: ${intensity}`)
        
        // 自动添加到场景
        this.addToScene()
    }

    // 程序化天空盒
    private createProceduralSkyBox() {
        try {
            
            // 创建Sky实例
            this.skyMaterial = new Sky()
            this.mesh = this.skyMaterial.getMesh()  // 使用组合模式的mesh
            
            // 应用配置参数
            if (this.config.skyConfig) {
                const config = this.config.skyConfig
                
                if (config.turbidity !== undefined) {
                    this.skyMaterial.turbidity.value = config.turbidity
                }
                if (config.rayleigh !== undefined) {
                    this.skyMaterial.rayleigh.value = config.rayleigh
                }
                if (config.mieCoefficient !== undefined) {
                    this.skyMaterial.mieCoefficient.value = config.mieCoefficient
                }
                if (config.mieDirectionalG !== undefined) {
                    this.skyMaterial.mieDirectionalG.value = config.mieDirectionalG
                }

                this.skyMaterial.material.uniforms["sunPosition"].value.copy(this.sun)
            }

            // 设置天空盒大小
            this.mesh.scale.setScalar(100000)
            
            eventBus.emit("skybox-ready", { type: SkyBoxType.PROCEDURAL_SKY })
            
            // 自动添加到场景
            this.addToScene()
            
        } catch (err) {
            console.error("程序化天空盒创建失败:", err)
            eventBus.emit("skybox-error", err)
        }
    }

    private addToScene() {
        if (this.mesh) {
            this.scene.add(this.mesh)
        }
    }

    // ===========================================
    // 公开API方法
    // ===========================================

    /**
     * 更新天空参数（仅对程序化天空有效）
     */
    updateSkyConfig(newConfig: Partial<SkyBoxConfig['skyConfig']>) {
        if (this.config.type !== SkyBoxType.PROCEDURAL_SKY || !this.skyMaterial || !newConfig) {
            console.warn("只有程序化天空支持参数更新")
            return
        }

        if (newConfig.turbidity !== undefined) {
            this.skyMaterial.turbidity.value = newConfig.turbidity
        }
        if (newConfig.rayleigh !== undefined) {
            this.skyMaterial.rayleigh.value = newConfig.rayleigh
        }
        if (newConfig.mieCoefficient !== undefined) {
            this.skyMaterial.mieCoefficient.value = newConfig.mieCoefficient
        }
        if (newConfig.mieDirectionalG !== undefined) {
            this.skyMaterial.mieDirectionalG.value = newConfig.mieDirectionalG
        }
        if (newConfig.sunPosition) {
            this.skyMaterial.setSunPosition(
                newConfig.sunPosition.x,
                newConfig.sunPosition.y,
                newConfig.sunPosition.z
            )
        }
    }

    /**
     * 切换天空盒类型
     */
    switchSkyBoxType(newType: SkyBoxType, newConfig?: Partial<SkyBoxConfig>) {
        // 清理当前天空盒
        this.cleanupCurrentSkyBox()
        
        // 更新配置
        this.config.type = newType
        if (newConfig) {
            Object.assign(this.config, newConfig)
        }
        
        // 重新创建
        this.createSkyBox()
    }

    /**
     * 获取当前天空盒信息
     */
    getSkyBoxInfo() {
        return {
            type: this.config.type,
            isLoaded: this.mesh !== null,
            config: this.config
        }
    }

    /**
     * 设置天空盒可见性
     */
    setVisible(visible: boolean) {
        if (this.mesh) {
            this.mesh.visible = visible
        }
    }

    // ===========================================
    // 内部方法
    // ===========================================

    private cleanupCurrentSkyBox() {
        if (this.mesh) {
            this.scene.remove(this.mesh)
            this.mesh.geometry?.dispose()
            
            if (Array.isArray(this.mesh.material)) {
                this.mesh.material.forEach(material => material.dispose())
            } else if (this.mesh.material) {
                this.mesh.material.dispose()
            }
            
            this.mesh = null
        }
        
        // 清理Sky材质
        if (this.skyMaterial) {
            this.skyMaterial.dispose()
            this.skyMaterial = null
        }
    }

    private handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    private sceneReadyHandler() {
        // 场景就绪后的处理
        console.log("场景已就绪，天空盒可以正常使用")
    }

    destroy() {
        // 移除事件监听
        eventBus.off("scene-ready", this.sceneReadyHandler)
        window.removeEventListener("resize", this.boundHandleResize)

        // 清理资源
        this.cleanupCurrentSkyBox()
        
        console.log("SkyBox插件已销毁")
    }
}

// 导出类型枚举供外部使用
export { SkyBoxType }
export type { SkyBoxConfig }

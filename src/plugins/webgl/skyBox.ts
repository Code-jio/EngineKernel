import { THREE, BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
import { Sky } from "../../glsl/sky"

// 天空盒类型枚举
enum SkyBoxType {
    CUBE_TEXTURE = 'cubeTexture',           // 立方体贴图
    PROCEDURAL_SKY = 'proceduralSky',       // 程序化天空
    ENVIRONMENT_MAP = 'environmentMap',     // 环境贴图
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

        // 程序化天空配置
        if (config.type === SkyBoxType.PROCEDURAL_SKY) {
            config.skyConfig = {
                turbidity: userData.turbidity || 10,
                rayleigh: userData.rayleigh || 2,
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
                this.mesh.scale.setScalar(45000)
                
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
                
                // 设置太阳位置
                if (config.sunPosition) {
                    this.skyMaterial.setSunPosition(
                        config.sunPosition.x,
                        config.sunPosition.y,
                        config.sunPosition.z
                    )
                } else {
                    // 使用计算的太阳位置
                    this.skyMaterial.setSunPosition(this.sun.x, this.sun.y, this.sun.z)
                }
            }

            // 设置天空盒大小
            this.mesh.scale.setScalar(45000)
            
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

import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { CoreType } from "../../types/core"
import { PluginMeta } from "../../types/Plugin"
import eventBus from "../../eventBus/eventBus"

interface SkyConfig {
    turbidity?: number;      // 浑浊度
    rayleigh?: number;       // 瑞利散射
    mieCoefficient?: number; // 米氏散射系数
    mieDirectionalG?: number;// 米氏方向性系数
    elevation?: number;      // 太阳高度角
    azimuth?: number;       // 太阳方位角
    exposure?: number;       // 曝光度
}

export class SkyBox extends BasePlugin {
    public version = "1.0.0"
    public pluginClass = "SkyBox"

    private sky: Sky | null = null
    private scene!: THREE.Scene
    private renderer!: THREE.WebGLRenderer
    private sunPosition: THREE.Vector3
    private config: SkyConfig
    private isInitialized = false

    constructor(meta: PluginMeta) {
        super(meta)
        
        // 初始化默认配置
        this.config = {
            turbidity: 10,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.8,
            elevation: 2,
            azimuth: 180,
            exposure: 0.5
        }

        this.sunPosition = new THREE.Vector3()

        // 等待场景就绪
        eventBus.on('scene-ready', this.handleSceneReady.bind(this))
    }

    private handleSceneReady = async ({ scene, camera }: { scene: THREE.Scene, camera: THREE.Camera }) => {
        if (this.isInitialized) return
        
        this.scene = scene
        this.renderer = (scene as any).userData.renderer

        if (!this.scene || !this.renderer) {
            console.error('SkyBox: Scene or Renderer not available')
            return
        }

        this.isInitialized = true
        await this.start()
    }

    public async start(): Promise<void> {
        if (!this.isInitialized) {
            return Promise.resolve()
        }

        try {
            await this.createSky()
            this.updateSun()
            
            // 监听配置更新事件
            eventBus.on('SKY_CONFIG_UPDATE', this.handleConfigUpdate.bind(this))
            
            // 集成到渲染循环
            eventBus.on('update', this.update.bind(this))
            
            return Promise.resolve()
        } catch (error) {
            console.error('Failed to start SkyBox plugin:', error)
            return Promise.reject(error)
        }
    }

    public async stop(): Promise<void> {
        try {
            // 清理事件监听
            eventBus.off('SKY_CONFIG_UPDATE', this.handleConfigUpdate.bind(this))
            eventBus.off('update', this.update.bind(this))
            eventBus.off('scene-ready', this.handleSceneReady)
            
            // 清理资源
            if (this.sky) {
                this.scene.remove(this.sky)
                this.sky.material.dispose()
                this.sky = null
            }
            
            this.isInitialized = false
            return Promise.resolve()
        } catch (error) {
            console.error('Failed to stop SkyBox plugin:', error)
            return Promise.reject(error)
        }
    }

    private update(): void {
        if (this.sky && this.isInitialized) {
            // 在这里可以添加动态更新逻辑，比如随时间变化的太阳位置
            this.updateSun()
        }
    }

    private async createSky(): Promise<void> {
        try {
            // 创建天空对象
            this.sky = new Sky()
            this.sky.scale.setScalar(450000)
            
            // 设置天空材质的uniforms
            const uniforms = this.sky.material.uniforms
            uniforms['turbidity'].value = this.config.turbidity
            uniforms['rayleigh'].value = this.config.rayleigh
            uniforms['mieCoefficient'].value = this.config.mieCoefficient
            uniforms['mieDirectionalG'].value = this.config.mieDirectionalG
            console.log(this.sky,"sky")
            // 添加到场景
            this.scene.add(this.sky)

            // 设置渲染器的色调映射和曝光
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping
            this.renderer.toneMappingExposure = this.config.exposure || 0.5

        } catch (error) {
            console.error('Failed to create sky:', error)
            throw error
        }
    }

    private updateSun(): void {
        const phi = THREE.MathUtils.degToRad(90 - (this.config.elevation || 2))
        const theta = THREE.MathUtils.degToRad(this.config.azimuth || 180)

        this.sunPosition.setFromSphericalCoords(1, phi, theta)

        if (this.sky) {
            const uniforms = this.sky.material.uniforms
            uniforms['sunPosition'].value.copy(this.sunPosition)
        }
    }

    private handleConfigUpdate(newConfig: Partial<SkyConfig>): void {
        try {
            // 更新配置
            this.config = { ...this.config, ...newConfig }

            // 更新天空材质
            if (this.sky) {
                const uniforms = this.sky.material.uniforms
                if (newConfig.turbidity !== undefined) uniforms['turbidity'].value = newConfig.turbidity
                if (newConfig.rayleigh !== undefined) uniforms['rayleigh'].value = newConfig.rayleigh
                if (newConfig.mieCoefficient !== undefined) uniforms['mieCoefficient'].value = newConfig.mieCoefficient
                if (newConfig.mieDirectionalG !== undefined) uniforms['mieDirectionalG'].value = newConfig.mieDirectionalG
            }

            // 如果太阳位置相关参数改变，更新太阳位置
            if (newConfig.elevation !== undefined || newConfig.azimuth !== undefined) {
                this.updateSun()
            }

            // 更新渲染器曝光
            if (newConfig.exposure !== undefined) {
                this.renderer.toneMappingExposure = newConfig.exposure
            }

        } catch (error) {
            console.error('Failed to update sky configuration:', error)
            throw error
        }
    }

    // 公共方法：获取当前配置
    public getConfig(): SkyConfig {
        return { ...this.config }
    }

    // 公共方法：获取太阳位置
    public getSunPosition(): THREE.Vector3 {
        return this.sunPosition.clone()
    }
}

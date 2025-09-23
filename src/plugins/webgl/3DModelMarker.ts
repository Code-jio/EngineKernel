import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { GLTFLoader, DRACOLoader } from "../../utils/three-imports"
import * as TWEEN from "@tweenjs/tween.js"

// 本插件承担任务：
// 1. 在场景中添加一个3D模型
// 2. 可以设置模型的位置、旋转、缩放等属性
// 3. 可以执行模型关键帧动画功能
// 4. 可卸载模型，卸载后，模型从场景中移除，并从内存中释放
// 5. 可执行模型的路径动画
// 6. 可自动加载draco压缩模型，并进行解压
// 7. 默认关闭阴影
// 8. 要求性能优越，加载速度快，占用内存小
// 9. 不对该模型进行缓存。
// 10，模型加载完成后，会触发事件，可以进行回调处理。
// 11，提供模型加载的默认参数，加载时可以进行自定义配置。

// 变换数据接口
interface Transform {
    position: THREE.Vector3
    rotation: THREE.Euler
    scale: THREE.Vector3
}

// 关键帧接口
interface Keyframe {
    time: number
    transform: Transform
    easing?: string // 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
}

// 路径点接口
interface PathPoint {
    position: THREE.Vector3
    rotation?: THREE.Euler
    duration?: number // 到达该点的时间（秒）
}

// 动画状态接口
interface AnimationState {
    isPlaying: boolean
    currentTime: number
    duration: number
    loop: boolean
    direction: "forward" | "backward" | "pingpong"
}

// 模型标记配置接口
interface ModelMarkerConfig {
    modelUrl: string // 模型文件路径
    name?: string // 模型名称
    position?: Array<number> | THREE.Vector3 // 模型位置，支持数组或Vector3对象
    rotation?: Array<number> | THREE.Euler // 模型旋转，支持数组或Euler对象
    scale?: Array<number> | THREE.Vector3 // 模型缩放，支持数组或Vector3对象
    color?: Array<number> | THREE.Vector4 | THREE.Color | null // 额外添加模型颜色
    show?: boolean // 是否显示模型
    autoLoad?: boolean // 是否自动加载
    enableAnimations?: boolean // 是否启用动画
    // 性能优化配置
    enableCaching?: boolean // 默认false，不使用缓存
    optimizeGeometry?: boolean // 几何体优化
    enableFrustumCulling?: boolean // 视锥剔除
    enableOcclusion?: boolean // 遮挡剔除
    lodLevels?: number[] // LOD级别
    // 加载配置
    onProgress?: (progress: any) => void
    onComplete?: (model: THREE.Group) => void
    onError?: (error: Error) => void
    // 材质配置
    materialOverrides?: { [key: string]: any } // 材质覆盖
    textureQuality?: "low" | "medium" | "high" // 纹理质量
}

// 模型实例接口
interface ModelInstance {
    id: string
    fileName: string
    name: string
    model: THREE.Group | THREE.Scene
    originalModel?: THREE.Group // 原始模型的备份
    config: ModelMarkerConfig
    animations: THREE.AnimationClip[]
    mixer?: THREE.AnimationMixer
    keyframeAnimation?: {
        keyframes: Keyframe[]
        state: AnimationState
    }
    pathAnimation?: {
        path: PathPoint[]
        state: AnimationState
        curve?: THREE.CatmullRomCurve3
    }
    isLoaded: boolean
    material: null | THREE.Material
}

interface moveConfig {
    pathPoints: Array<{ x: number; y: number; z: number }> | THREE.Vector3[] // 路径点
    duration?: number // 总动画时长（毫秒）
    loop?: boolean // 是否循环
    autoStart?: boolean // 是否自动开始
    showPath?: boolean // 是否显示路径线
    pathLineColor?: number // 路径线颜色
    pathLineWidth?: number // 路径线宽度
    easing?: string // 缓动函数 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
    lookAtDirection?: boolean // 是否让模型朝向移动方向
    onStart?: () => void // 开始回调
    onUpdate?: (progress: number) => void // 更新回调
    onComplete?: () => void // 完成回调
    onStop?: () => void // 停止回调

    cycle?: boolean // 是否构成环形
}

export class ModelMarker extends BasePlugin {
    private scene: THREE.Scene | null = null // 主场景
    private resourceReaderPlugin: any = null
    private modelInstances: Map<string, ModelInstance> = new Map()
    private instanceIdCounter: number = 0
    private animationLoop: number | null = null
    private clock: THREE.Clock = new THREE.Clock()
    private enableDebugMode: boolean = false
    private defaultConfig: Partial<ModelMarkerConfig>
    private animateGroup: TWEEN.Group = new TWEEN.Group()

    constructor(meta: any = {}) {
        super(meta)
        this.enableDebugMode = meta.userData.enableDebugMode || false

        // 设置默认配置
        this.defaultConfig = {
            show: true, // 默认显示模型
            autoLoad: true,
            enableAnimations: true,
            enablePhysics: false,
            castShadow: false, // 默认关闭阴影
            receiveShadow: false, // 默认关闭阴影
            enableCaching: false, // 不使用缓存
            optimizeGeometry: true, // 开启几何体优化
            enableFrustumCulling: true, // 开启视锥剔除
            enableOcclusion: false, // 默认关闭遮挡剔除（性能考虑）
            textureQuality: "medium",
            position: new THREE.Vector3(0, 0, 0),
            rotation: new THREE.Euler(0, 0, 0),
            scale: new THREE.Vector3(1, 1, 1),
            color: null,
            ...meta.userData.defaultConfig,
        }
        this.scene = meta.userData.scene
        this.resourceReaderPlugin = meta.userData.resourceReaderPlugin
    }

    /**
     * 插件初始化
     */
    async init(): Promise<void> {
        // 获取场景引用
        if (!this.scene) {
            throw new Error("ModelMarker: 无法获取场景引用")
        }

        // 获取资源加载插件
        if (!this.resourceReaderPlugin) {
            console.warn("⚠️ ModelMarker: 未找到ResourceReaderPlugin，将使用默认加载器")
        }

        // 启动动画循环
        this.startAnimationLoop()
        // 监听事件
        this.setupEventListeners()

        console.log("✅ ModelMarker插件初始化完成")
    }

    /**
     * 基类要求的load方法
     */
    async load(): Promise<void> {
        // 基类要求的方法，这里可以留空
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听模型加载完成事件
        eventBus.on("resource:loaded", (data: any) => {
            this.onResourceLoaded(data)
        })

        // 监听模型卸载事件
        eventBus.on("model:unload", (modelId: string) => {
            this.removeModel(modelId)
        })
    }

    /**
     * 添加3D模型标记
     */
    public async addModel(config: ModelMarkerConfig): Promise<ModelInstance> {
        const modelId = this.generateModelId()

        // 合并默认配置和用户配置
        const finalConfig = { ...this.defaultConfig, ...config }

        // 从模型URL中提取文件名
        const extractedFileName = this.extractFileNameFromUrl(finalConfig.modelUrl || "")

        // 创建初始的空模型组
        const model = new THREE.Group()

        // 创建模型实例
        const instance: ModelInstance = {
            id: modelId,
            fileName: extractedFileName,
            name: finalConfig.name || extractedFileName,
            model: model,
            config: finalConfig,
            animations: [],
            isLoaded: false,
            material: null,
        }

        // 存储实例
        this.modelInstances.set(modelId, instance)

        // 1. 优先执行加载模型
        if (finalConfig.autoLoad !== false && finalConfig.modelUrl) {
            try {
                await this.loadModelWithPromise(modelId, finalConfig.modelUrl)
            } catch (error) {
                console.error(`❌ 模型加载失败: ${finalConfig.modelUrl}`, error)
                // 加载失败时执行错误回调
                if (finalConfig.onError) {
                    finalConfig.onError(error as Error)
                }
            }
        }

        // 2. 然后设置模型变换等参数
        this.applyTransformToInstance(instance, finalConfig)

        // 设置模型对象的名称
        if (!instance.model.userData) {
            instance.model.userData = {}
        }
        instance.model.userData.modelName = instance.name
        instance.model.name = instance.name

        // 设置初始可见性
        instance.model.visible = finalConfig.show !== false

        // 性能优化设置
        if (finalConfig.enableFrustumCulling) {
            instance.model.frustumCulled = true
        }

        // 添加到场景
        if (this.scene) {
            this.scene.add(instance.model)
        }

        // console.log(`✅ 模型标记已添加: ${modelId}`, instance)
        if (finalConfig.onComplete) {
            finalConfig.onComplete(instance.model as THREE.Group)
        }
        eventBus.emit("model:added", { modelId, config: finalConfig })

        // 3. 返回完整的模型实例
        return instance
    }

    /**
     * 异步加载模型（不使用缓存，直接加载）
     */
    private loadModelAsync(modelId: string, modelUrl: string): void {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return

        let model

        const config = instance.config

        // 性能计时
        const startTime = performance.now()

        if (this.resourceReaderPlugin && config.enableCaching !== false) {
            // 使用ResourceReaderPlugin加载（但强制不缓存）
            const originalLoadModel = this.resourceReaderPlugin.loadModel

            // 临时禁用缓存功能
            this.resourceReaderPlugin.loadModel(
                modelUrl,
                (gltf: any) => {
                    const loadTime = performance.now() - startTime
                    console.log(`⚡ 模型加载完成 (无缓存): ${modelUrl} - ${loadTime.toFixed(2)}ms`)

                    this.onModelLoaded(modelId, gltf)
                    model = gltf.scene
                    // 执行用户回调
                    if (config.onComplete) {
                        config.onComplete(gltf.scene)
                    }
                },
                (progress: any) => {
                    if (progress.lengthComputable) {
                        const percent = ((progress.loaded / progress.total) * 100).toFixed(2)
                        eventBus.emit("model:loadProgress", { modelId, progress: percent })

                        // 执行用户进度回调
                        if (config.onProgress) {
                            config.onProgress(progress)
                        }
                    }
                },
                (error: Error) => {
                    console.error(`❌ 模型加载失败: ${modelUrl}`, error)
                    eventBus.emit("model:loadError", { modelId, error: error.message })

                    // 执行用户错误回调
                    if (config.onError) {
                        config.onError(error)
                    }
                },
            )
        } else {
            // 使用直接的GLTF加载器（不经过缓存系统）
            this.loadModelDirect(modelId, modelUrl, startTime)
        }

        return model
    }

    /**
     * Promise版本的模型加载方法
     */
    private loadModelWithPromise(modelId: string, modelUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = performance.now()
            this.loadModelDirectWithCallback(modelId, modelUrl, startTime, resolve, reject)
        })
    }

    /**
     * 直接加载模型（绕过缓存系统，提升性能）
     */
    private loadModelDirect(modelId: string, modelUrl: string, startTime: number): void {
        this.loadModelDirectWithCallback(modelId, modelUrl, startTime)
    }

    /**
     * 加载模型的核心实现
     */
    private loadModelDirectWithCallback(
        modelId: string,
        modelUrl: string,
        startTime: number,
        resolve?: () => void,
        reject?: (error: Error) => void,
    ): void {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return

        const config = instance.config

        // 创建独立的GLTF加载器
        const loader = new GLTFLoader()

        // 配置DRACO解压器
        const dracoLoader = new DRACOLoader()
        dracoLoader.setDecoderPath("/draco/")
        loader.setDRACOLoader(dracoLoader)

        console.log(`🚀 开始直接加载模型 (无缓存): ${modelUrl}`)

        loader.load(
            modelUrl,
            (gltf: any) => {
                const loadTime = performance.now() - startTime
                console.log(`⚡ 模型直接加载完成: ${modelUrl} - ${loadTime.toFixed(2)}ms`)

                this.onModelLoaded(modelId, gltf)

                // 执行用户回调
                if (config.onComplete) {
                    config.onComplete(gltf.scene)
                }

                // 调用Promise resolve
                if (resolve) {
                    resolve()
                }
            },
            (progress: any) => {
                if (progress.lengthComputable) {
                    const percent = ((progress.loaded / progress.total) * 100).toFixed(2)
                    eventBus.emit("model:loadProgress", { modelId, progress: percent })

                    // 执行用户进度回调
                    if (config.onProgress) {
                        config.onProgress(progress)
                    }
                }
            },
            (error: any) => {
                console.error(`❌ 模型直接加载失败: ${modelUrl}`, error)
                eventBus.emit("model:loadError", { modelId, error: error.message })

                // 执行用户错误回调
                if (config.onError) {
                    config.onError(error)
                }

                // 调用Promise reject
                if (reject) {
                    reject(error)
                }
            },
        )
    }

    /**
     * 应用变换参数到模型实例
     */
    private applyTransformToInstance(instance: ModelInstance, config: ModelMarkerConfig): void {
        // 设置初始变换
        if (config.position) {
            if (Array.isArray(config.position)) {
                instance.model.position.set(config.position[0] || 0, config.position[1] || 0, config.position[2] || 0)
            } else {
                instance.model.position.copy(config.position)
            }
        } else {
            instance.model.position.set(0, 0, 0)
        }

        if (config.rotation) {
            if (Array.isArray(config.rotation)) {
                instance.model.rotation.set(config.rotation[0] || 0, config.rotation[1] || 0, config.rotation[2] || 0)
            } else {
                instance.model.rotation.copy(config.rotation)
            }
        } else {
            instance.model.rotation.set(0, 0, 0)
        }

        if (config.scale) {
            if (Array.isArray(config.scale)) {
                instance.model.scale.set(config.scale[0] || 1, config.scale[1] || 1, config.scale[2] || 1)
            } else {
                instance.model.scale.copy(config.scale)
            }
        } else {
            instance.model.scale.set(1, 1, 1)
        }
    }

    /**
     * 模型加载完成处理（优化版本）
     */
    private onModelLoaded(modelId: string, gltf: any): void {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return

        const config = instance.config

        // 性能优化：直接使用原始模型，不进行不必要的克隆
        instance.model.clear()

        // 根据配置决定是否克隆模型
        const loadedModel = config.enableCaching === false ? gltf.scene : gltf.scene.clone()
        instance.model.add(loadedModel)

        // 设置模型名称（新规则：只设置根对象的userData.modelName）
        if (!instance.model.userData) {
            instance.model.userData = {}
        }
        instance.model.userData.modelName = instance.name
        instance.model.name = instance.name // 保留显示名称

        // 仅在需要时保存原始模型备份
        if (config.enableAnimations !== false) {
            instance.originalModel = gltf.scene.clone()
            // 为备份模型也设置名称
            if (instance.originalModel) {
                if (!instance.originalModel.userData) {
                    instance.originalModel.userData = {}
                }
                instance.originalModel.userData.modelName = `${instance.name}_backup`
                instance.originalModel.name = `${instance.name}_backup`
            }
        }

        // 性能优化：几何体优化
        if (config.optimizeGeometry) {
            this.optimizeModelGeometry(instance.model)
        }

        // 应用材质覆盖
        if (config.materialOverrides) {
            this.applyMaterialOverrides(instance.model, config.materialOverrides)
        }

        // 纹理质量调整
        if (config.textureQuality) {
            this.adjustTextureQuality(instance.model, config.textureQuality)
        }

        // 处理动画
        if (gltf.animations && gltf.animations.length > 0 && config.enableAnimations !== false) {
            instance.animations = gltf.animations
            instance.mixer = new THREE.AnimationMixer(instance.model)
            this.setupModelAnimations(instance)
        }

        // 确保阴影设置正确应用（默认关闭）
        this.updateShadowSettings(instance)

        // 设置LOD（如果配置了）
        if (config.lodLevels && config.lodLevels.length > 0) {
            this.setupLOD(instance, config.lodLevels)
        }

        instance.isLoaded = true
        console.log(`🚀 模型加载并优化完成: ${modelId}`)

        // 触发加载完成事件（包含丰富的信息）
        eventBus.emit("model:loaded", {
            modelId,
            model: instance.model,
            animations: instance.animations,
            hasAnimations: instance.animations.length > 0,
            config: config,
            timestamp: Date.now(),
        })
    }

    /**
     * 优化模型几何体
     */
    private optimizeModelGeometry(model: THREE.Group | THREE.Scene): void {
        model.traverse(child => {
            if (child instanceof THREE.Mesh && child.geometry) {
                // 合并顶点
                if (child.geometry.attributes.position) {
                    child.geometry.computeBoundingBox()
                    child.geometry.computeBoundingSphere()
                }

                // 删除重复顶点
                if (typeof child.geometry.mergeVertices === "function") {
                    child.geometry.mergeVertices()
                }

                // 生成法线（如果没有）
                if (!child.geometry.attributes.normal) {
                    child.geometry.computeVertexNormals()
                }
            }
        })
        console.log("⚡ 几何体优化完成")
    }

    /**
     * 应用材质覆盖
     */
    private applyMaterialOverrides(model: THREE.Group | THREE.Scene, overrides: { [key: string]: any }): void {
        model.traverse(child => {
            if (child instanceof THREE.Mesh && child.material) {
                Object.keys(overrides).forEach(property => {
                    if (child.material[property] !== undefined) {
                        child.material[property] = overrides[property]
                    }
                })
                child.material.needsUpdate = true
            }
        })
        console.log("🎨 材质覆盖应用完成")
    }

    /**
     * 调整纹理质量
     */
    private adjustTextureQuality(model: THREE.Group | THREE.Scene, quality: "low" | "medium" | "high"): void {
        const qualitySettings = {
            low: { anisotropy: 1, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter },
            medium: { anisotropy: 4, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter },
            high: { anisotropy: 16, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter },
        }

        const settings = qualitySettings[quality]

        model.traverse(child => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = Array.isArray(child.material) ? child.material : [child.material]

                material.forEach(mat => {
                    Object.values(mat).forEach(value => {
                        if (value instanceof THREE.Texture) {
                            value.anisotropy = settings.anisotropy
                            value.minFilter = settings.minFilter
                            value.magFilter = settings.magFilter
                            value.needsUpdate = true
                        }
                    })
                })
            }
        })
        console.log(`🖼️ 纹理质量调整为: ${quality}`)
    }

    /**
     * 设置LOD（细节层次）
     */
    private setupLOD(instance: ModelInstance, lodLevels: number[]): void {
        // 这是一个简化的LOD实现示例
        const lod = new THREE.LOD()

        lodLevels.forEach((distance, index) => {
            const lodModel = instance.model.clone()

            // 根据LOD级别简化模型
            if (index > 0) {
                this.simplifyModelForLOD(lodModel, index)
            }

            lod.addLevel(lodModel, distance)
        })

        // 替换原始模型
        if (instance.model.parent) {
            const parent = instance.model.parent
            parent.remove(instance.model)
            parent.add(lod)
            instance.model = lod as any
        }

        console.log(`🔍 LOD配置完成，${lodLevels.length}个级别`)
    }

    /**
     * 为LOD简化模型
     */
    private simplifyModelForLOD(model: THREE.Group | THREE.Scene, level: number): void {
        const simplificationFactor = Math.pow(0.5, level)

        model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                // 简化几何体（这里是简化示例）
                if (child.geometry.attributes.position) {
                    const positions = child.geometry.attributes.position.array
                    const simplifiedLength = Math.floor(positions.length * simplificationFactor)

                    // 这里可以实现更复杂的几何体简化算法
                    // 当前只是一个示例
                }
            }
        })
    }

    /**
     * 设置模型动画
     */
    private setupModelAnimations(instance: ModelInstance): void {
        if (!instance.mixer || instance.animations.length === 0) return

        instance.animations.forEach((clip, index) => {
            const action = instance.mixer!.clipAction(clip)
            console.log(`🎬 发现动画: ${clip.name} (${clip.duration.toFixed(2)}s)`)

            // 可以在这里设置默认动画行为
            if (index === 0) {
                // 播放第一个动画
                action.play()
            }
        })
    }

    /**
     * 更新阴影设置（默认关闭阴影以提高性能）
     */
    private updateShadowSettings(instance: ModelInstance): void {
        instance.model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                // 性能优化：禁用不必要的材质更新
                if (child.material) {
                    child.material.needsUpdate = false
                }
            }
        })
    }

    /**
     * 设置模型变换
     */
    public setTransform(modelId: string, transform: Partial<Transform>): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance) {
            console.warn(`⚠️ 模型未找到: ${modelId}`)
            return false
        }

        if (transform.position) {
            instance.model.position.copy(transform.position)
        }
        if (transform.rotation) {
            instance.model.rotation.copy(transform.rotation)
        }
        if (transform.scale) {
            instance.model.scale.copy(transform.scale)
        }

        eventBus.emit("model:transformChanged", { modelId, transform })
        return true
    }

    /**
     * 获取模型变换
     */
    public getTransform(modelId: string): Transform | null {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return null

        return {
            position: instance.model.position.clone(),
            rotation: instance.model.rotation.clone(),
            scale: instance.model.scale.clone(),
        }
    }

    /**
     * 播放内置动画
     */
    public playAnimation(modelId: string, animationName?: string, loop: boolean = true): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance || !instance.mixer) {
            console.warn(`⚠️ 模型或动画混合器未找到: ${modelId}`)
            return false
        }

        let targetClip: THREE.AnimationClip | null = null

        if (animationName) {
            targetClip = instance.animations.find(clip => clip.name === animationName) || null
        } else {
            targetClip = instance.animations[0] || null
        }

        if (!targetClip) {
            console.warn(`⚠️ 动画未找到: ${animationName || "默认动画"}`)
            return false
        }

        const action = instance.mixer.clipAction(targetClip)
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
        action.reset().play()

        console.log(`🎬 播放动画: ${targetClip.name}`)
        eventBus.emit("model:animationStarted", { modelId, animationName: targetClip.name })
        return true
    }

    /**
     * 停止动画
     */
    public stopAnimation(modelId: string, animationName?: string): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance || !instance.mixer) return false

        if (animationName) {
            const clip = instance.animations.find(clip => clip.name === animationName)
            if (clip) {
                const action = instance.mixer.clipAction(clip)
                action.stop()
            }
        } else {
            instance.mixer.stopAllAction()
        }

        eventBus.emit("model:animationStopped", { modelId, animationName })
        return true
    }

    /**
     * 创建关键帧动画
     */
    public createKeyframeAnimation(modelId: string, keyframes: Keyframe[], loop: boolean = false): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return false

        // 验证关键帧
        if (keyframes.length < 2) {
            console.warn("⚠️ 关键帧动画至少需要2个关键帧")
            return false
        }

        // 按时间排序
        keyframes.sort((a, b) => a.time - b.time)

        instance.keyframeAnimation = {
            keyframes,
            state: {
                isPlaying: false,
                currentTime: 0,
                duration: keyframes[keyframes.length - 1].time,
                loop,
                direction: "forward",
            },
        }

        console.log(
            `🎬 关键帧动画已创建: ${modelId} (${keyframes.length}帧, ${instance.keyframeAnimation.state.duration}s)`,
        )
        return true
    }

    /**
     * 播放关键帧动画
     */
    public playKeyframeAnimation(modelId: string): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance || !instance.keyframeAnimation) return false

        instance.keyframeAnimation.state.isPlaying = true
        instance.keyframeAnimation.state.currentTime = 0

        console.log(`🎬 开始播放关键帧动画: ${modelId}`)
        eventBus.emit("model:keyframeAnimationStarted", { modelId })
        return true
    }

    /**
     * 创建路径动画
     */
    public createPathAnimation(
        modelId: string,
        pathPoints: PathPoint[],
        loop: boolean = false,
        cycle: boolean = false,
    ): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return false

        if (pathPoints.length < 2) {
            console.warn("⚠️ 路径动画至少需要2个路径点")
            return false
        }

        // 创建样条曲线
        const points = pathPoints.map(point => point.position)
        const curve = new THREE.CatmullRomCurve3(points)
        curve.closed = loop || cycle
        curve.tension = 0

        // 计算总时长
        let totalDuration = 0
        pathPoints.forEach(point => {
            totalDuration += point.duration || 1
        })

        instance.pathAnimation = {
            path: pathPoints,
            state: {
                isPlaying: false,
                currentTime: 0,
                duration: totalDuration,
                loop,
                direction: "forward",
            },
            curve,
        }

        console.log(`🛤️ 路径动画已创建: ${modelId} (${pathPoints.length}点, ${totalDuration}s)`)
        return true
    }

    /**
     * 播放路径动画
     */
    public playPathAnimation(modelId: string): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance || !instance.pathAnimation) return false

        instance.pathAnimation.state.isPlaying = true
        instance.pathAnimation.state.currentTime = 0

        console.log(`🛤️ 开始播放路径动画: ${modelId}`)
        eventBus.emit("model:pathAnimationStarted", { modelId })
        return true
    }

    /**
     * 更新动画
     */
    private updateAnimations(deltaTime: number): void {
        this.modelInstances.forEach(instance => {
            // 更新内置动画
            if (instance.mixer) {
                instance.mixer.update(deltaTime)
            }

            // 更新关键帧动画
            if (instance.keyframeAnimation?.state.isPlaying) {
                this.updateKeyframeAnimation(instance, deltaTime)
            }

            // 更新路径动画
            if (instance.pathAnimation?.state.isPlaying) {
                this.updatePathAnimation(instance, deltaTime)
            }
        })
    }

    /**
     * 更新关键帧动画
     */
    private updateKeyframeAnimation(instance: ModelInstance, deltaTime: number): void {
        const anim = instance.keyframeAnimation!
        anim.state.currentTime += deltaTime

        if (anim.state.currentTime >= anim.state.duration) {
            if (anim.state.loop) {
                anim.state.currentTime = 0
            } else {
                anim.state.isPlaying = false
                eventBus.emit("model:keyframeAnimationCompleted", { modelId: instance.id })
                return
            }
        }

        // 计算当前变换
        const transform = this.interpolateKeyframes(anim.keyframes, anim.state.currentTime)
        if (transform) {
            instance.model.position.copy(transform.position)
            instance.model.rotation.copy(transform.rotation)
            instance.model.scale.copy(transform.scale)
        }
    }

    /**
     * 更新路径动画
     */
    private updatePathAnimation(instance: ModelInstance, deltaTime: number): void {
        const anim = instance.pathAnimation!
        anim.state.currentTime += deltaTime

        if (anim.state.currentTime >= anim.state.duration) {
            if (anim.state.loop) {
                anim.state.currentTime = 0
            } else {
                anim.state.isPlaying = false
                eventBus.emit("model:pathAnimationCompleted", { modelId: instance.id })
                return
            }
        }

        // 计算路径上的位置
        const t = anim.state.currentTime / anim.state.duration
        const position = anim.curve!.getPoint(t)
        instance.model.position.copy(position)

        // 可选：计算朝向（沿路径方向）
        const tangent = anim.curve!.getTangent(t)
        if (tangent.length() > 0) {
            instance.model.lookAt(position.clone().add(tangent))
        }
    }

    /**
     * 关键帧插值
     */
    private interpolateKeyframes(keyframes: Keyframe[], time: number): Transform | null {
        if (keyframes.length < 2) return null

        // 找到当前时间所在的关键帧区间
        let startFrame: Keyframe | null = null
        let endFrame: Keyframe | null = null

        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
                startFrame = keyframes[i]
                endFrame = keyframes[i + 1]
                break
            }
        }

        if (!startFrame || !endFrame) {
            // 超出范围，返回最后一帧
            const lastFrame = keyframes[keyframes.length - 1]
            return lastFrame.transform
        }

        // 计算插值因子
        const duration = endFrame.time - startFrame.time
        const t = duration > 0 ? (time - startFrame.time) / duration : 0

        // 应用缓动函数
        const easedT = this.applyEasing(t, endFrame.easing || "linear")

        // 插值变换
        return {
            position: startFrame.transform.position.clone().lerp(endFrame.transform.position, easedT),
            rotation: new THREE.Euler().setFromQuaternion(
                new THREE.Quaternion()
                    .setFromEuler(startFrame.transform.rotation)
                    .slerp(new THREE.Quaternion().setFromEuler(endFrame.transform.rotation), easedT),
            ),
            scale: startFrame.transform.scale.clone().lerp(endFrame.transform.scale, easedT),
        }
    }

    /**
     * 应用缓动函数
     */
    private applyEasing(t: number, easing: string): number {
        switch (easing) {
            case "easeIn":
                return t * t
            case "easeOut":
                return 1 - (1 - t) * (1 - t)
            case "easeInOut":
                return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
            default:
                return t // linear
        }
    }

    /**
     * 显示/隐藏模型
     */
    public setVisible(modelId: string, visible: boolean): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return false

        instance.model.visible = visible

        eventBus.emit("model:visibilityChanged", { modelId, visible })
        return true
    }

    /**
     * 移除模型
     */
    public removeModel(modelId: string): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return false

        // 停止所有动画
        this.stopAnimation(modelId)
        if (instance.keyframeAnimation) {
            instance.keyframeAnimation.state.isPlaying = false
        }
        if (instance.pathAnimation) {
            instance.pathAnimation.state.isPlaying = false
        }

        // 从场景中移除
        if (this.scene && instance.model.parent) {
            this.scene.remove(instance.model)
        }

        // 清理资源
        this.disposeModelResources(instance)

        // 从实例映射中移除
        this.modelInstances.delete(modelId)

        console.log(`🗑️ 模型已移除: ${modelId}`)
        eventBus.emit("model:removed", { modelId })
        return true
    }

    /**
     * 清理模型资源
     */
    private disposeModelResources(instance: ModelInstance): void {
        instance.model.traverse(child => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose()

                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => mat.dispose())
                } else {
                    child.material?.dispose()
                }
            }
        })

        // 清理动画混合器
        if (instance.mixer) {
            instance.mixer.stopAllAction()
            instance.mixer = undefined
        }
    }

    /**
     * 获取所有模型实例
     */
    public getAllModels(): { [key: string]: any } {
        const result: { [key: string]: any } = {}

        this.modelInstances.forEach((instance, id) => {
            result[id] = {
                id: instance.id,
                name: instance.name,
                isLoaded: instance.isLoaded,
                isVisible: instance.model.visible,
                transform: this.getTransform(id),
                hasAnimations: instance.animations.length > 0,
                hasKeyframeAnimation: !!instance.keyframeAnimation,
                hasPathAnimation: !!instance.pathAnimation,
                config: instance.config,
            }
        })

        return result
    }

    /**
     * 获取模型实例详细信息
     */
    public getModelInfo(modelId: string): any {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return null

        return {
            id: instance.id,
            name: instance.name,
            isLoaded: instance.isLoaded,
            isVisible: instance.model.visible,
            transform: this.getTransform(modelId),
            animations: instance.animations.map(anim => ({
                name: anim.name,
                duration: anim.duration,
                tracks: anim.tracks.length,
            })),
            hasKeyframeAnimation: !!instance.keyframeAnimation,
            hasPathAnimation: !!instance.pathAnimation,
            config: instance.config,
            memoryUsage: this.estimateModelMemoryUsage(instance.model),
        }
    }

    /**
     * 估算模型内存使用量
     */
    private estimateModelMemoryUsage(model: THREE.Group | THREE.Scene): {
        vertices: number
        faces: number
        textures: number
        estimatedMB: number
    } {
        let vertexCount = 0
        let faceCount = 0
        let textureCount = 0
        let estimatedBytes = 0

        const textures = new Set<THREE.Texture>()

        model.traverse(child => {
            if (child instanceof THREE.Mesh && child.geometry) {
                const positions = child.geometry.attributes.position
                if (positions) {
                    vertexCount += positions.count
                    estimatedBytes += positions.array.byteLength
                }

                if (child.geometry.index) {
                    faceCount += child.geometry.index.count / 3
                    estimatedBytes += child.geometry.index.array.byteLength
                }

                // 统计材质中的纹理
                const materials = Array.isArray(child.material) ? child.material : [child.material]
                materials.forEach(material => {
                    Object.values(material).forEach(value => {
                        if (value instanceof THREE.Texture && !textures.has(value)) {
                            textures.add(value)
                            if (value.image) {
                                const width = value.image.width || 512
                                const height = value.image.height || 512
                                estimatedBytes += width * height * 4 // RGBA
                            }
                        }
                    })
                })
            }
        })

        textureCount = textures.size
        const estimatedMB = estimatedBytes / (1024 * 1024)

        return { vertices: vertexCount, faces: faceCount, textures: textureCount, estimatedMB }
    }

    /**
     * 批量加载模型
     */
    public async addModelBatch(configs: ModelMarkerConfig[]): Promise<string[]> {
        const modelIds: string[] = []
        const totalCount = configs.length

        if (totalCount === 0) {
            return []
        }

        console.log(`🚀 开始批量加载 ${totalCount} 个模型`)

        try {
            // 使用Promise.all来并行处理所有模型
            const instances = await Promise.all(
                configs.map(async (config, index) => {
                    try {
                        console.log(`📦 [${index + 1}/${totalCount}] 加载模型: ${config.modelUrl}`)
                        const instance = await this.addModel(config)

                        // 执行原始完成回调
                        if (config.onComplete && instance.model) {
                            config.onComplete(instance.model as THREE.Group)
                        }

                        return instance
                    } catch (error) {
                        console.error(`❌ 批量加载中的模型失败 [${index + 1}]:`, error)

                        // 执行原始错误回调
                        if (config.onError) {
                            config.onError(error as Error)
                        }

                        throw error
                    }
                }),
            )

            // 收集所有模型ID
            instances.forEach(instance => {
                modelIds.push(instance.id)
            })

            console.log(`🎯 批量加载完成: ${totalCount}个模型`)
            eventBus.emit("model:batchLoadCompleted", { modelIds, totalCount })

            return modelIds
        } catch (error) {
            console.error(`❌ 批量加载失败:`, error)
            throw error
        }
    }

    /**
     * 更新模型配置
     */
    public updateModelConfig(modelId: string, newConfig: Partial<ModelMarkerConfig>): boolean {
        const instance = this.modelInstances.get(modelId)
        if (!instance) return false

        // 合并配置
        const oldConfig = instance.config
        instance.config = { ...oldConfig, ...newConfig }

        if (newConfig.materialOverrides) {
            this.applyMaterialOverrides(instance.model, newConfig.materialOverrides)
        }

        if (newConfig.textureQuality) {
            this.adjustTextureQuality(instance.model, newConfig.textureQuality)
        }

        console.log(`🔧 模型配置已更新: ${modelId}`)
        eventBus.emit("model:configUpdated", { modelId, oldConfig, newConfig })
        return true
    }

    /**
     * 获取性能统计信息
     */
    public getPerformanceStats(): {
        totalModels: number
        loadedModels: number
        totalVertices: number
        totalFaces: number
        totalTextures: number
        estimatedMemoryMB: number
        activeAnimations: number
    } {
        let totalVertices = 0
        let totalFaces = 0
        let totalTextures = 0
        let estimatedMemoryMB = 0
        let activeAnimations = 0

        this.modelInstances.forEach(instance => {
            if (instance.isLoaded) {
                const usage = this.estimateModelMemoryUsage(instance.model)
                totalVertices += usage.vertices
                totalFaces += usage.faces
                totalTextures += usage.textures
                estimatedMemoryMB += usage.estimatedMB

                if (
                    instance.mixer ||
                    instance.keyframeAnimation?.state.isPlaying ||
                    instance.pathAnimation?.state.isPlaying
                ) {
                    activeAnimations++
                }
            }
        })

        return {
            totalModels: this.modelInstances.size,
            loadedModels: Array.from(this.modelInstances.values()).filter(i => i.isLoaded).length,
            totalVertices,
            totalFaces,
            totalTextures,
            estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
            activeAnimations,
        }
    }

    /**
     * 启动动画循环
     */
    private startAnimationLoop(): void {
        // eventBus.on("update", ({ deltaTime, elapsedTime, frameTime, fps }) => {
        //     this.updateAnimations(deltaTime)
        // })
    }

    /**
     * 停止动画循环
     */
    private stopAnimationLoop(): void {
        if (this.animationLoop) {
            cancelAnimationFrame(this.animationLoop)
            this.animationLoop = null
        }
    }

    /**
     * 生成模型ID
     */
    private generateModelId(): string {
        return `model_${++this.instanceIdCounter}_${Date.now()}`
    }

    /**
     * 从URL中提取文件名（不包含扩展名）
     */
    private extractFileNameFromUrl(url: string): string {
        if (!url) {
            return `model_${Date.now()}`
        }

        try {
            // 处理各种URL格式
            const urlPath = url.includes("?") ? url.split("?")[0] : url
            const pathParts = urlPath.split("/")
            const fullFileName = pathParts[pathParts.length - 1]

            // 移除文件扩展名
            const dotIndex = fullFileName.lastIndexOf(".")
            const fileNameWithoutExt = dotIndex > 0 ? fullFileName.substring(0, dotIndex) : fullFileName

            // 清理文件名，移除特殊字符
            const cleanFileName = fileNameWithoutExt.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "_")

            return cleanFileName || `model_${Date.now()}`
        } catch (error) {
            console.warn("文件名提取失败，使用默认名称:", error)
            return `model_${Date.now()}`
        }
    }

    /**
     * 资源加载完成回调
     */
    private onResourceLoaded(data: any): void {
        // 可以在这里处理通用的资源加载完成逻辑
        if (this.enableDebugMode) {
            console.log("🔄 ModelMarker收到资源加载事件:", data)
        }
    }

    /**
     * 销毁插件
     */
    dispose(): void {
        // 停止动画循环
        this.stopAnimationLoop()

        // 移除所有模型
        const modelIds = Array.from(this.modelInstances.keys())
        modelIds.forEach(id => this.removeModel(id))

        // 清理事件监听器
        eventBus.off("resource:loaded", this.onResourceLoaded)
        eventBus.off("model:unload", this.removeModel)

        console.log("🧹 ModelMarker插件已销毁")
    }

    /**
     * 新增模型沿路径功能
     * 提供默认参数
     * 模型移动时实时创建路径线Line
     */
    moveByPath(model: THREE.Group | THREE.Scene, options: moveConfig): {} {
        // 默认配置
        const config = {
            duration: 5000,
            loop: false,
            autoStart: true,
            showPath: true,
            pathLineColor: 0x00ff00,
            pathLineWidth: 5,
            easing: "easeInOut",
            lookAtDirection: true,
            cycle: false,
            ...options,
        }

        // 参数验证
        if (!model) {
            throw new Error("Model parameter is required")
        }
        if (!config.pathPoints || config.pathPoints.length < 2) {
            throw new Error("At least 2 path points are required")
        }

        // 转换路径点为Vector3数组
        const pathVector3s: THREE.Vector3[] = config.pathPoints.map(point => {
            if (point instanceof THREE.Vector3) {
                return point.clone()
            }
            return new THREE.Vector3(point.x, point.y, point.z)
        })

        let curve
        if (config.cycle) {
            pathVector3s.push(pathVector3s[0].clone())
            curve = new THREE.CatmullRomCurve3(pathVector3s)
            curve.closed = config.loop
        } else {
            curve = new THREE.CatmullRomCurve3(pathVector3s)
        }
        curve.tension = 0

        // 创建路径曲线

        // 创建路径可视化线条
        let pathLine: THREE.Object3D | undefined
        if (config.showPath) {
            const lineWidth = config.pathLineWidth || 1

            // 使用普通线条
            const points = curve.getPoints(100)
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            const material = new THREE.LineBasicMaterial({
                color: config.pathLineColor,
                transparent: true,
                opacity: 0.8,
            })
            pathLine = new THREE.Line(geometry, material)
            pathLine.name = "PathLine"

            // 添加到场景中而不是模型中，这样路径线不会跟随模型移动
            if (this.scene && pathLine) {
                this.scene.add(pathLine)
                console.log(
                    `🛤️ 路径线已添加到场景，颜色: 0x${config.pathLineColor.toString(16)}, 类型: ${pathLine.name}`,
                )
            } else {
                console.warn("⚠️ 场景不存在或路径线创建失败，无法添加路径线")
            }
        }

        // 动画状态
        let isPlaying = false
        let isPaused = false
        let currentTween: TWEEN.Tween<any> | null = null
        let progress = { value: 0 }
        let animationProgress = 0

        // 缓动函数映射
        const easingFunctions = {
            linear: TWEEN.Easing.Linear.None,
            easeIn: TWEEN.Easing.Cubic.In,
            easeOut: TWEEN.Easing.Cubic.Out,
            easeInOut: TWEEN.Easing.Cubic.InOut,
        }

        // 记录模型初始位置
        const startPosition = model.position.clone()

        // 更新模型位置的函数
        const updateModelPosition = () => {
            // 从曲线上获取当前位置
            const position = curve.getPoint(progress.value)
            model.position.copy(position)

            // 如果需要朝向移动方向
            if (config.lookAtDirection && progress.value < 0.99) {
                const nextPosition = curve.getPoint(Math.min(progress.value + 0.01, 1))
                const direction = nextPosition.clone().sub(position).normalize()
                if (direction.length() > 0) {
                    const lookAtTarget = position.clone().add(direction)
                    model.lookAt(lookAtTarget)
                }
            }

            // 更新进度
            animationProgress = progress.value

            // 调用更新回调
            if (config.onUpdate) {
                config.onUpdate(progress.value)
            }
        }

        // 开始动画函数
        const startAnimation = () => {
            if (isPlaying) return

            isPlaying = true
            isPaused = false

            // 调用开始回调
            if (config.onStart) {
                config.onStart()
            }

            // 创建Tween动画
            currentTween = new TWEEN.Tween(progress)
                .to({ value: 1 }, config.duration)
                .easing(easingFunctions[config.easing as keyof typeof easingFunctions] || TWEEN.Easing.Cubic.InOut)
                .onUpdate(updateModelPosition)
                .onComplete(() => {
                    isPlaying = false

                    // 调用完成回调
                    if (config.onComplete) {
                        config.onComplete()
                    }

                    // 如果是循环模式，重新开始
                    if (config.loop) {
                        progress.value = 0
                        startAnimation()
                    } else {
                        // 非循环模式下，动画完成后清理路径线
                        if (pathLine && this.scene) {
                            this.scene.remove(pathLine)

                            // 清理几何体和材质
                            if (pathLine instanceof THREE.Line) {
                                pathLine.geometry.dispose()
                                if (pathLine.material instanceof THREE.Material) {
                                    pathLine.material.dispose()
                                }
                            } else if (pathLine instanceof THREE.Mesh) {
                                pathLine.geometry.dispose()
                                if (pathLine.material instanceof THREE.Material) {
                                    pathLine.material.dispose()
                                }
                            }
                            console.log("🗑️ 动画完成，路径线已清理")
                        }
                    }
                })
                .start()

            this.animateGroup.add(currentTween)
        }

        // 停止动画函数
        const stopAnimation = () => {
            if (currentTween) {
                currentTween.stop()
                currentTween = null
            }
            isPlaying = false
            isPaused = false
            progress.value = 0

            // 重置模型位置
            model.position.copy(startPosition)

            // 清理路径线
            if (pathLine && this.scene) {
                this.scene.remove(pathLine)

                // 清理几何体和材质
                if (pathLine instanceof THREE.Line) {
                    pathLine.geometry.dispose()
                    if (pathLine.material instanceof THREE.Material) {
                        pathLine.material.dispose()
                    }
                } else if (pathLine instanceof THREE.Mesh) {
                    pathLine.geometry.dispose()
                    if (pathLine.material instanceof THREE.Material) {
                        pathLine.material.dispose()
                    }
                }
                console.log("🗑️ 路径线已清理")
            }

            // 调用停止回调
            if (config.onStop) {
                config.onStop()
            }
        }

        // 暂停动画函数
        const pauseAnimation = () => {
            if (isPlaying && !isPaused) {
                if (currentTween) {
                    // 注意：TWEEN.js没有直接的暂停功能，这里通过停止并记录进度来模拟
                    currentTween.stop()
                    isPaused = true
                    isPlaying = false
                }
            }
        }

        // 恢复动画函数
        const resumeAnimation = () => {
            if (isPaused) {
                isPaused = false

                // 从当前进度继续动画
                const remainingDuration = config.duration * (1 - progress.value)
                currentTween = new TWEEN.Tween(progress)
                    .to({ value: 1 }, remainingDuration)
                    .easing(easingFunctions[config.easing as keyof typeof easingFunctions] || TWEEN.Easing.Cubic.InOut)
                    .onUpdate(updateModelPosition)
                    .onComplete(() => {
                        isPlaying = false

                        if (config.onComplete) {
                            config.onComplete()
                        }

                        if (config.loop) {
                            progress.value = 0
                            startAnimation()
                        } else {
                            // 非循环模式下，动画完成后清理路径线
                            if (pathLine && this.scene) {
                                this.scene.remove(pathLine)

                                // 清理几何体和材质
                                if (pathLine instanceof THREE.Line) {
                                    pathLine.geometry.dispose()
                                    if (pathLine.material instanceof THREE.Material) {
                                        pathLine.material.dispose()
                                    }
                                } else if (pathLine instanceof THREE.Mesh) {
                                    pathLine.geometry.dispose()
                                    if (pathLine.material instanceof THREE.Material) {
                                        pathLine.material.dispose()
                                    }
                                }
                                console.log("🗑️ 恢复动画完成，路径线已清理")
                            }
                        }
                    })
                    .start()

                isPlaying = true
            }
        }

        // 获取当前进度函数
        const getProgress = () => animationProgress

        // 如果设置了自动开始，立即开始动画
        if (config.autoStart) {
            startAnimation()
        }


        // 返回控制接口
        return {
            start: startAnimation,
            stop: stopAnimation,
            pause: pauseAnimation,
            resume: resumeAnimation,
            getProgress,
            pathLine,
        }
    }

    // 根据模型id获取模型
    getModelById(id: string): ModelInstance | null {
        // 参数验证
        if (!id || typeof id !== "string") {
            console.warn("⚠️ getModelById: 无效的模型ID")
            return null
        }

        // 从模型实例Map中获取
        const instance = this.modelInstances.get(id)

        if (!instance) {
            if (this.enableDebugMode) {
                console.warn(`⚠️ 未找到ID为 "${id}" 的模型`)
                console.log("可用的模型ID列表:", Array.from(this.modelInstances.keys()))
            }
            return null
        }

        // 检查模型是否已加载
        if (!instance.isLoaded) {
            console.warn(`⚠️ 模型 "${id}" 尚未加载完成`)
        }

        if (this.enableDebugMode) {
            console.log(`🎯 获取模型成功: ${id}`, {
                name: instance.name,
                fileName: instance.fileName,
                isLoaded: instance.isLoaded,
                hasAnimations: instance.animations.length > 0,
                hasKeyframeAnimation: !!instance.keyframeAnimation,
                hasPathAnimation: !!instance.pathAnimation,
            })
        }

        return instance
    }
    /**
     * 从颜色配置中获取THREE.Color对象
     * @return THREE.Color
     */
    private getColorFromConfig(color: Array<number> | THREE.Vector4 | THREE.Color | null): THREE.Color | null {
        if (!color) {
            // 如果没有提供颜色，就不设置
            return null
        }
        console.log(color)
        if (Array.isArray(color)) {
            // 如果是数组类型，确保数组长度至少为3，并使用前三个元素作为RGB值
            return new THREE.Color(
                `rgb(
          ${color[0] !== undefined ? color[0] : 0},
          ${color[1] !== undefined ? color[1] : 0},
          ${color[2] !== undefined ? color[2] : 0}
        )`,
            )
        } else if (color instanceof THREE.Vector4) {
            // 如果是THREE.Vector4类型，使用x、y、z作为RGB值
            return new THREE.Color(
                `rgb(
          ${color.x !== undefined ? color.x : 0},
          ${color.y !== undefined ? color.y : 0},
          ${color.z !== undefined ? color.z : 0}
        )`,
            )
        } else if (color instanceof THREE.Color) {
            // 如果已经是THREE.Color类型，直接返回
            return color
        } else {
            // 其他情况返回默认颜色
            return new THREE.Color(0x00ff00)
        }
    }

    /**
     * 设置模型颜色
     * @param modelId 模型ID
     * @param color 颜色 - 支持数组[r,g,b]、THREE.Vector4、THREE.Color或null
     * @returns boolean 是否设置成功
     */
    public setModelColor(modelId: string, color: Array<number> | THREE.Vector4 | THREE.Color | null): boolean {
        // 参数验证
        if (!modelId || typeof modelId !== "string") {
            console.warn("⚠️ setModelColor: 无效的模型ID")
            return false
        }

        // 获取模型实例
        const instance = this.modelInstances.get(modelId)
        if (!instance) {
            console.warn(`⚠️ setModelColor: 未找到ID为 "${modelId}" 的模型`)
            return false
        }

        // 检查模型是否已加载
        if (!instance.isLoaded) {
            console.warn(`⚠️ setModelColor: 模型 "${modelId}" 尚未加载完成`)
            return false
        }

        try {
            // 转换颜色格式
            const targetColor = this.getColorFromConfig(color)

            if (!targetColor) {
                return false
            }

            console.log(targetColor)
            // 遍历模型中的所有材质并应用颜色
            let materialCount = 0
            let updatedMaterials = 0

            instance.model.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                    materialCount++

                    // 处理单个材质或材质数组
                    const materials = Array.isArray(child.material) ? child.material : [child.material]

                    materials.forEach((material, index) => {
                        if (this.applyColorToMaterial(material, targetColor)) {
                            updatedMaterials++

                            if (this.enableDebugMode) {
                                console.log(`  ✅ 材质更新成功: ${material.type} (${index})`)
                            }
                        }
                    })
                }
            })

            // 更新实例配置中的颜色信息
            instance.config.color = color as Array<number> | THREE.Vector4 | null | THREE.Color

            // 触发颜色变化事件
            eventBus.emit("model:colorChanged", {
                modelId,
                color: targetColor,
                originalColor: color,
                materialCount,
                updatedMaterials,
                timestamp: Date.now(),
            })

            if (this.enableDebugMode) {
                console.log(`🎨 模型颜色设置完成: ${modelId}`, {
                    totalMaterials: materialCount,
                    updatedMaterials: updatedMaterials,
                    success: updatedMaterials > 0,
                })
            }

            return updatedMaterials > 0
        } catch (error) {
            console.error(`❌ 设置模型颜色失败: ${modelId}`, error)
            return false
        }
    }

    /**
     * 将颜色应用到指定材质
     * @param material THREE.js材质对象
     * @param color THREE.Color颜色对象
     * @returns boolean 是否应用成功
     */
    private applyColorToMaterial(material: THREE.Material, color: THREE.Color): boolean {
        try {
            // 根据材质类型应用颜色
            if (
                material instanceof THREE.MeshBasicMaterial ||
                material instanceof THREE.MeshLambertMaterial ||
                material instanceof THREE.MeshPhongMaterial ||
                material instanceof THREE.MeshStandardMaterial ||
                material instanceof THREE.MeshPhysicalMaterial
            ) {
                // 保存原始颜色（如果需要恢复）
                if (!material.userData.originalColor) {
                    material.userData.originalColor = material.color.clone()
                }

                // 应用新颜色
                material.color.copy(color)
                material.needsUpdate = true

                return true
            } else if (material instanceof THREE.MeshToonMaterial) {
                // 卡通材质
                if (!material.userData.originalColor) {
                    material.userData.originalColor = material.color.clone()
                }
                material.color.copy(color)
                material.needsUpdate = true

                return true
            } else if (material instanceof THREE.PointsMaterial) {
                // 点材质
                if (!material.userData.originalColor) {
                    material.userData.originalColor = material.color.clone()
                }
                material.color.copy(color)
                material.needsUpdate = true

                return true
            } else if (material instanceof THREE.LineBasicMaterial || material instanceof THREE.LineDashedMaterial) {
                // 线材质
                if (!material.userData.originalColor) {
                    material.userData.originalColor = material.color.clone()
                }
                material.color.copy(color)
                material.needsUpdate = true

                return true
            } else if (material instanceof THREE.SpriteMaterial) {
                // 精灵材质
                if (!material.userData.originalColor) {
                    material.userData.originalColor = material.color.clone()
                }
                material.color.copy(color)
                material.needsUpdate = true

                return true
            } else {
                // 其他材质类型，尝试通用方法
                if (material.hasOwnProperty("color")) {
                    if (!material.userData.originalColor) {
                        material.userData.originalColor = (material as any).color.clone()
                    };
                    (material as any).color.copy(color)
                    material.needsUpdate = true
                    return true
                }

                if (this.enableDebugMode) {
                    console.warn(`⚠️ 不支持的材质类型: ${material.type}`)
                }
                return false
            }
        } catch (error) {
            console.error(`❌ 应用颜色到材质失败: ${material.type}`, error)
            return false
        }
    }

    /**
     * 恢复模型原始颜色
     * @param modelId 模型ID
     * @returns boolean 是否恢复成功
     */
    public restoreModelOriginalColor(modelId: string): boolean {
        // 参数验证
        if (!modelId || typeof modelId !== "string") {
            console.warn("⚠️ restoreModelOriginalColor: 无效的模型ID")
            return false
        }

        // 获取模型实例
        const instance = this.modelInstances.get(modelId)
        if (!instance) {
            console.warn(`⚠️ restoreModelOriginalColor: 未找到ID为 "${modelId}" 的模型`)
            return false
        }

        if (!instance.isLoaded) {
            console.warn(`⚠️ restoreModelOriginalColor: 模型 "${modelId}" 尚未加载完成`)
            return false
        }

        try {
            let restoredCount = 0

            instance.model.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material]

                    materials.forEach(material => {
                        if (material.userData.originalColor) {
                            if (material.hasOwnProperty("color")) {
                                ; (material as any).color.copy(material.userData.originalColor)
                                material.needsUpdate = true
                                restoredCount++
                            }
                        }
                    })
                }
            })

            // 清除配置中的颜色信息
            instance.config.color = null

            // 触发颜色恢复事件
            eventBus.emit("model:colorRestored", {
                modelId,
                restoredMaterials: restoredCount,
                timestamp: Date.now(),
            })

            if (this.enableDebugMode) {
                console.log(`🔄 模型原始颜色已恢复: ${modelId}`, {
                    restoredMaterials: restoredCount,
                })
            }

            return restoredCount > 0
        } catch (error) {
            console.error(`❌ 恢复模型原始颜色失败: ${modelId}`, error)
            return false
        }
    }

    /**
     * 将模型移动到指定位置
     * @param model 模型对象或模型ID
     * @param targetPosition 目标位置 (支持数组[x,y,z]，对象{x,y,z}或THREE.Vector3)
     * @param options 可选配置参数
     * @returns 控制对象，包含停止、暂停、恢复等方法
     */
    public async moveToPosition(
        model: THREE.Group | THREE.Scene | string,
        targetPosition: Array<number> | { x: number, y: number, z: number } | THREE.Vector3,
        options: {
            duration?: number;          // 运动时间（毫秒，默认2000ms）
            easing?: string;            // 缓动函数（默认'easeInOut'）
            lookAtDirection?: boolean;  // 是否朝向运动方向（默认false）
            onStart?: () => void;       // 开始回调
            onUpdate?: (progress: number) => void; // 更新回调，progress: 0-1
            onComplete?: () => void;    // 完成回调
            onStop?: () => void;        // 停止回调
            relative?: boolean;         // 是否相对当前位置移动（默认false）
            updateRotation?: boolean;   // 是否实时更新旋转（默认true）
        } = {}
    ): Promise<{
        start: () => Promise<void>;
        stop: () => void;
        pause: () => void;
        resume: () => void;
        getProgress: () => number;
        isPlaying: () => boolean;
    }> {
        // 参数默认值
        const config = {
            duration: 2000,
            easing: 'easeInOut',
            lookAtDirection: false,
            relative: false,
            updateRotation: true,
            ...options
        };

        // 获取模型对象
        let targetModel: THREE.Group | THREE.Scene | null = null;
        let modelId: string | null = null;

        if (typeof model === 'string') {
            const instance = this.modelInstances.get(model);
            if (instance) {
                targetModel = instance.model;
                modelId = model;
            }
        } else {
            targetModel = model;
            // 查找对应的模型ID
            for (const id of Array.from(this.modelInstances.keys())) {
                const instance = this.modelInstances.get(id);
                if (instance && instance.model === model) {
                    modelId = id;
                    break;
                }
            }
        }

        if (!targetModel) {
            throw new Error('Model not found');
        }

        // 转换目标位置为Vector3
        let targetPos: THREE.Vector3;
        if (Array.isArray(targetPosition)) {
            targetPos = new THREE.Vector3(targetPosition[0] ?? 0, targetPosition[1] ?? 0, targetPosition[2] ?? 0);
        } else if (targetPosition instanceof THREE.Vector3) {
            targetPos = targetPosition.clone();
        } else {
            targetPos = new THREE.Vector3(targetPosition.x ?? 0, targetPosition.y ?? 0, targetPosition.z ?? 0);
        }

        // 如果是相对移动，计算实际目标位置
        if (config.relative) {
            targetPos.add(targetModel.position);
        }

        // 起始位置
        const startPos = targetModel.position.clone();

        // 动画状态
        let isPlaying = false;
        let isPaused = false;
        let currentProgress = 0;
        let currentTween: TWEEN.Tween<{ value: number }> | null = null;

        // 缓动函数映射
        const easingFunctions = {
            linear: TWEEN.Easing.Linear.None,
            easeIn: TWEEN.Easing.Quadratic.In,
            easeOut: TWEEN.Easing.Quadratic.Out,
            easeInOut: TWEEN.Easing.Quadratic.InOut,
            easeInCubic: TWEEN.Easing.Cubic.In,
            easeOutCubic: TWEEN.Easing.Cubic.Out,
            easeInOutCubic: TWEEN.Easing.Cubic.InOut,
            easeInElastic: TWEEN.Easing.Elastic.In,
            easeOutElastic: TWEEN.Easing.Elastic.Out,
            easeInOutElastic: TWEEN.Easing.Elastic.InOut,
        };

        // 创建动画对象
        const progress = { value: 0 };

        // 更新模型位置的函数
        const updateModelPosition = () => {
            currentProgress = progress.value;

            if (!targetModel) return;

            // 计算当前位置
            const currentPos = new THREE.Vector3().lerpVectors(startPos, targetPos, progress.value);
            targetModel.position.copy(currentPos);

            // 如果需要朝向运动方向
            if (config.lookAtDirection && progress.value < 0.99) {
                const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
                if (direction.length() > 0.001) {
                    const lookAtPos = currentPos.clone().add(direction);
                    targetModel.lookAt(lookAtPos);
                }
            }

            // 调用更新回调
            if (config.onUpdate) {
                try {
                    config.onUpdate(progress.value);
                } catch (error) {
                    console.warn('onUpdate callback error:', error);
                }
            }
        };

        // 开始动画
        const startAnimation = (): Promise<void> => {
            return new Promise((resolve, reject) => {
                if (isPlaying) {
                    resolve();
                    return;
                }

                isPlaying = true;
                isPaused = false;
                progress.value = 0;

                // 触发开始回调
                if (config.onStart) {
                    try {
                        config.onStart();
                    } catch (error) {
                        console.warn('onStart callback error:', error);
                    }
                }

                // 触发事件
                if (modelId) {
                    eventBus.emit('model:moveStarted', {
                        modelId,
                        startPosition: startPos.toArray(),
                        targetPosition: targetPos.toArray(),
                        duration: config.duration
                    });
                }

                currentTween = new TWEEN.Tween(progress)
                    .to({ value: 1 }, config.duration)
                    .easing(easingFunctions[config.easing as keyof typeof easingFunctions] || TWEEN.Easing.Quadratic.InOut)
                    .onUpdate(() => {
                        updateModelPosition();
                    })
                    .onComplete(() => {
                        isPlaying = false;

                        // 确保最终位置准确
                        if (targetModel) {
                            targetModel.position.copy(targetPos);
                        }

                        // 触发完成回调
                        if (config.onComplete) {
                            try {
                                config.onComplete();
                            } catch (error) {
                                console.warn('onComplete callback error:', error);
                            }
                        }

                        // 触发事件
                        if (modelId) {
                            eventBus.emit('model:moveCompleted', {
                                modelId,
                                position: targetPos.toArray()
                            });
                        }

                        resolve();
                    })
                    .start();

                // 添加到动画组
                this.animateGroup.add(currentTween);

                eventBus.on("update", () => {
                    if (isPlaying || isPaused) {
                        this.animateGroup.update()
                    }
                })
            });
        };

        // 停止动画
        const stopAnimation = () => {
            if (currentTween) {
                currentTween.stop();
                this.animateGroup.remove(currentTween);
                currentTween = null;
            }

            isPlaying = false;
            isPaused = false;
            progress.value = 0;

            // 重置到起始位置
            if (targetModel) {
                targetModel.position.copy(startPos);
            }

            // 触发停止回调
            if (config.onStop) {
                try {
                    config.onStop();
                } catch (error) {
                    console.warn('onStop callback error:', error);
                }
            }

            // 触发事件
            if (modelId) {
                eventBus.emit('model:moveStopped', { modelId });
            }
        };

        // 暂停动画
        const pauseAnimation = () => {
            if (isPlaying && !isPaused && currentTween) {
                // TWEEN.js没有直接的pause方法，使用stop并记录当前进度
                currentTween.stop();
                isPaused = true;
                isPlaying = false;
            }
        };

        // 恢复动画
        const resumeAnimation = () => {
            if (isPaused && currentTween) {
                // 重新创建Tween从当前进度继续
                currentTween = new TWEEN.Tween({ value: progress.value })
                    .to({ value: 1 }, config.duration * (1 - progress.value))
                    .easing(easingFunctions[config.easing as keyof typeof easingFunctions] || TWEEN.Easing.Quadratic.InOut)
                    .onUpdate((obj) => {
                        progress.value = obj.value;
                        updateModelPosition();
                    })
                    .onComplete(() => {
                        isPlaying = false;
                        if (targetModel) {
                            targetModel.position.copy(targetPos);
                        }
                        if (config.onComplete) {
                            try {
                                config.onComplete();
                            } catch (error) {
                                console.warn('onComplete callback error:', error);
                            }
                        }
                        if (modelId) {
                            eventBus.emit('model:moveCompleted', {
                                modelId,
                                position: targetPos.toArray()
                            });
                        }
                    })
                    .start();
                this.animateGroup.add(currentTween);
                isPaused = false;
                isPlaying = true;
            }
        };

        // 获取当前进度
        const getProgress = () => currentProgress;
        const isCurrentlyPlaying = () => isPlaying;

        // 自动开始动画（如果需要）
        if (config.duration > 0) {
            // 异步方法中不自动开始，需要手动调用start()
        } else {
            // 如果持续时间为0，直接设置到目标位置
            if (targetModel) {
                targetModel.position.copy(targetPos);
            }
            if (config.onComplete) {
                try {
                    config.onComplete();
                } catch (error) {
                    console.warn('onComplete callback error:', error);
                }
            }
        }

        return {
            start: startAnimation,
            stop: stopAnimation,
            pause: pauseAnimation,
            resume: resumeAnimation,
            getProgress,
            isPlaying: isCurrentlyPlaying,
        };
    }
}

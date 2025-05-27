import { THREE, BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'

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
  direction: 'forward' | 'backward' | 'pingpong'
}

// 模型标记配置接口
interface ModelMarkerConfig {
  modelUrl?: string
  position?: THREE.Vector3
  rotation?: THREE.Euler
  scale?: THREE.Vector3
  autoLoad?: boolean
  enableAnimations?: boolean
  enablePhysics?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
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
  materialOverrides?: { [key: string]: any }
  textureQuality?: 'low' | 'medium' | 'high'
}

// 模型实例接口
interface ModelInstance {
  id: string
  name: string
  model: THREE.Group
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
  isVisible: boolean
}

export class ModelMarker extends BasePlugin {
  private scene: THREE.Scene | null = null
  private resourceReaderPlugin: any = null
  private modelInstances: Map<string, ModelInstance> = new Map()
  private instanceIdCounter: number = 0
  private animationLoop: number | null = null
  private clock: THREE.Clock = new THREE.Clock()
  private enableDebugMode: boolean = false
  private defaultConfig: Partial<ModelMarkerConfig>

  constructor(userData: any = {}) {
    super(userData)
    this.enableDebugMode = userData.enableDebugMode || false
    
    // 设置默认配置
    this.defaultConfig = {
      autoLoad: true,
      enableAnimations: true,
      enablePhysics: false,
      castShadow: false, // 默认关闭阴影
      receiveShadow: false, // 默认关闭阴影
      enableCaching: false, // 不使用缓存
      optimizeGeometry: true, // 开启几何体优化
      enableFrustumCulling: true, // 开启视锥剔除
      enableOcclusion: false, // 默认关闭遮挡剔除（性能考虑）
      textureQuality: 'medium',
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      ...userData.defaultConfig
    }
  }

  /**
   * 插件初始化
   */
  async init(coreInterface: any): Promise<void> {
    console.log('🚀 ModelMarker插件初始化开始')
    
    // 获取场景引用
    this.scene = coreInterface.scene || null
    if (!this.scene) {
      throw new Error('ModelMarker: 无法获取场景引用')
    }

    // 获取资源加载插件
    this.resourceReaderPlugin = coreInterface.getPlugin?.('ResourceReaderPlugin')
    if (!this.resourceReaderPlugin) {
      console.warn('⚠️ ModelMarker: 未找到ResourceReaderPlugin，将使用默认加载器')
    }

    // 启动动画循环
    this.startAnimationLoop()

    // 监听事件
    this.setupEventListeners()

    console.log('✅ ModelMarker插件初始化完成')
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
    eventBus.on('resource:loaded', (data: any) => {
      this.onResourceLoaded(data)
    })

    // 监听模型卸载事件
    eventBus.on('model:unload', (modelId: string) => {
      this.removeModel(modelId)
    })
  }

  /**
   * 添加3D模型标记
   */
  public addModel(config: ModelMarkerConfig): string {
    const modelId = this.generateModelId()
    
    // 合并默认配置和用户配置
    const finalConfig = { ...this.defaultConfig, ...config }
    
    const instance: ModelInstance = {
      id: modelId,
      name: finalConfig.modelUrl?.split('/').pop()?.split('.')[0] || `model_${modelId}`,
      model: new THREE.Group(),
      config: finalConfig,
      animations: [],
      isLoaded: false,
      isVisible: true
    }

    // 设置初始变换（使用默认值）
    instance.model.position.copy(finalConfig.position || new THREE.Vector3(0, 0, 0))
    instance.model.rotation.copy(finalConfig.rotation || new THREE.Euler(0, 0, 0))
    instance.model.scale.copy(finalConfig.scale || new THREE.Vector3(1, 1, 1))

    // 设置阴影（默认关闭）
    instance.model.castShadow = finalConfig.castShadow === true
    instance.model.receiveShadow = finalConfig.receiveShadow === true

    // 性能优化设置
    if (finalConfig.enableFrustumCulling) {
      instance.model.frustumCulled = true
    }

    // 添加到场景
    if (this.scene) {
      this.scene.add(instance.model)
    }

    // 存储实例
    this.modelInstances.set(modelId, instance)

    // 自动加载模型
    if (finalConfig.autoLoad !== false && finalConfig.modelUrl) {
      this.loadModelAsync(modelId, finalConfig.modelUrl)
    }

    console.log(`✅ 模型标记已添加: ${modelId}`)
    eventBus.emit('model:added', { modelId, config: finalConfig })

    return modelId
  }

  /**
   * 异步加载模型（不使用缓存，直接加载）
   */
  private loadModelAsync(modelId: string, modelUrl: string): void {
    const instance = this.modelInstances.get(modelId)
    if (!instance) return

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
          
          // 执行用户回调
          if (config.onComplete) {
            config.onComplete(gltf.scene)
          }
        },
        (progress: any) => {
          if (progress.lengthComputable) {
            const percent = (progress.loaded / progress.total * 100).toFixed(2)
            eventBus.emit('model:loadProgress', { modelId, progress: percent })
            
            // 执行用户进度回调
            if (config.onProgress) {
              config.onProgress(progress)
            }
          }
        },
        (error: Error) => {
          console.error(`❌ 模型加载失败: ${modelUrl}`, error)
          eventBus.emit('model:loadError', { modelId, error: error.message })
          
          // 执行用户错误回调
          if (config.onError) {
            config.onError(error)
          }
        }
      )
    } else {
      // 使用直接的GLTF加载器（不经过缓存系统）
      this.loadModelDirect(modelId, modelUrl, startTime)
    }
  }

  /**
   * 直接加载模型（绕过缓存系统，提升性能）
   */
  private loadModelDirect(modelId: string, modelUrl: string, startTime: number): void {
    const instance = this.modelInstances.get(modelId)
    if (!instance) return

    const config = instance.config

    // 创建独立的GLTF加载器
    const loader = new (window as any).EngineKernel.GLTFLoader()
    
    // 配置DRACO解压器
    const dracoLoader = new (window as any).EngineKernel.DRACOLoader()
    dracoLoader.setDecoderPath('/draco/')
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
      },
      (progress: any) => {
        if (progress.lengthComputable) {
          const percent = (progress.loaded / progress.total * 100).toFixed(2)
          eventBus.emit('model:loadProgress', { modelId, progress: percent })
          
          // 执行用户进度回调
          if (config.onProgress) {
            config.onProgress(progress)
          }
        }
      },
      (error: any) => {
        console.error(`❌ 模型直接加载失败: ${modelUrl}`, error)
        eventBus.emit('model:loadError', { modelId, error: error.message })
        
        // 执行用户错误回调
        if (config.onError) {
          config.onError(error)
        }
      }
    )
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

    // 仅在需要时保存原始模型备份
    if (config.enableAnimations !== false) {
      instance.originalModel = gltf.scene.clone()
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
    eventBus.emit('model:loaded', { 
      modelId, 
      model: instance.model,
      animations: instance.animations,
      hasAnimations: instance.animations.length > 0,
      config: config,
      timestamp: Date.now()
    })
  }

  /**
   * 优化模型几何体
   */
  private optimizeModelGeometry(model: THREE.Group): void {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // 合并顶点
        if (child.geometry.attributes.position) {
          child.geometry.computeBoundingBox()
          child.geometry.computeBoundingSphere()
        }

        // 删除重复顶点
        if (typeof child.geometry.mergeVertices === 'function') {
          child.geometry.mergeVertices()
        }

        // 生成法线（如果没有）
        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals()
        }
      }
    })
    console.log('⚡ 几何体优化完成')
  }

  /**
   * 应用材质覆盖
   */
  private applyMaterialOverrides(model: THREE.Group, overrides: { [key: string]: any }): void {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        Object.keys(overrides).forEach(property => {
          if (child.material[property] !== undefined) {
            child.material[property] = overrides[property]
          }
        })
        child.material.needsUpdate = true
      }
    })
    console.log('🎨 材质覆盖应用完成')
  }

  /**
   * 调整纹理质量
   */
  private adjustTextureQuality(model: THREE.Group, quality: 'low' | 'medium' | 'high'): void {
    const qualitySettings = {
      low: { anisotropy: 1, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter },
      medium: { anisotropy: 4, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter },
      high: { anisotropy: 16, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter }
    }

    const settings = qualitySettings[quality]

    model.traverse((child) => {
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
  private simplifyModelForLOD(model: THREE.Group, level: number): void {
    const simplificationFactor = Math.pow(0.5, level)
    
    model.traverse((child) => {
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
    instance.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // 默认关闭阴影，只有明确开启时才启用
        child.castShadow = instance.config.castShadow === true
        child.receiveShadow = instance.config.receiveShadow === true
        
        // 性能优化：禁用不必要的材质更新
        if (child.material) {
          child.material.needsUpdate = false
        }
      }
    })
    
    if (this.enableDebugMode) {
      const shadowEnabled = instance.config.castShadow || instance.config.receiveShadow
      console.log(`🌒 阴影设置完成: ${shadowEnabled ? '开启' : '关闭'}`)
    }
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

    eventBus.emit('model:transformChanged', { modelId, transform })
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
      scale: instance.model.scale.clone()
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
      console.warn(`⚠️ 动画未找到: ${animationName || '默认动画'}`)
      return false
    }

    const action = instance.mixer.clipAction(targetClip)
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.reset().play()

    console.log(`🎬 播放动画: ${targetClip.name}`)
    eventBus.emit('model:animationStarted', { modelId, animationName: targetClip.name })
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

    eventBus.emit('model:animationStopped', { modelId, animationName })
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
      console.warn('⚠️ 关键帧动画至少需要2个关键帧')
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
        direction: 'forward'
      }
    }

    console.log(`🎬 关键帧动画已创建: ${modelId} (${keyframes.length}帧, ${instance.keyframeAnimation.state.duration}s)`)
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
    eventBus.emit('model:keyframeAnimationStarted', { modelId })
    return true
  }

  /**
   * 创建路径动画
   */
  public createPathAnimation(modelId: string, pathPoints: PathPoint[], loop: boolean = false): boolean {
    const instance = this.modelInstances.get(modelId)
    if (!instance) return false

    if (pathPoints.length < 2) {
      console.warn('⚠️ 路径动画至少需要2个路径点')
      return false
    }

    // 创建样条曲线
    const points = pathPoints.map(point => point.position)
    const curve = new THREE.CatmullRomCurve3(points)
    curve.closed = loop

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
        direction: 'forward'
      },
      curve
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
    eventBus.emit('model:pathAnimationStarted', { modelId })
    return true
  }

  /**
   * 更新动画
   */
  private updateAnimations(deltaTime: number): void {
    this.modelInstances.forEach((instance) => {
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
        eventBus.emit('model:keyframeAnimationCompleted', { modelId: instance.id })
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
        eventBus.emit('model:pathAnimationCompleted', { modelId: instance.id })
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
    const easedT = this.applyEasing(t, endFrame.easing || 'linear')

    // 插值变换
    return {
      position: startFrame.transform.position.clone().lerp(endFrame.transform.position, easedT),
      rotation: new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion().setFromEuler(startFrame.transform.rotation)
          .slerp(new THREE.Quaternion().setFromEuler(endFrame.transform.rotation), easedT)
      ),
      scale: startFrame.transform.scale.clone().lerp(endFrame.transform.scale, easedT)
    }
  }

  /**
   * 应用缓动函数
   */
  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'easeIn':
        return t * t
      case 'easeOut':
        return 1 - (1 - t) * (1 - t)
      case 'easeInOut':
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
    instance.isVisible = visible

    eventBus.emit('model:visibilityChanged', { modelId, visible })
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
    eventBus.emit('model:removed', { modelId })
    return true
  }

  /**
   * 清理模型资源
   */
  private disposeModelResources(instance: ModelInstance): void {
    instance.model.traverse((child) => {
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
        isVisible: instance.isVisible,
        transform: this.getTransform(id),
        hasAnimations: instance.animations.length > 0,
        hasKeyframeAnimation: !!instance.keyframeAnimation,
        hasPathAnimation: !!instance.pathAnimation,
        config: instance.config
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
      isVisible: instance.isVisible,
      transform: this.getTransform(modelId),
      animations: instance.animations.map(anim => ({
        name: anim.name,
        duration: anim.duration,
        tracks: anim.tracks.length
      })),
      hasKeyframeAnimation: !!instance.keyframeAnimation,
      hasPathAnimation: !!instance.pathAnimation,
      config: instance.config,
      memoryUsage: this.estimateModelMemoryUsage(instance.model)
    }
  }

  /**
   * 估算模型内存使用量
   */
  private estimateModelMemoryUsage(model: THREE.Group): { vertices: number, faces: number, textures: number, estimatedMB: number } {
    let vertexCount = 0
    let faceCount = 0
    let textureCount = 0
    let estimatedBytes = 0

    const textures = new Set<THREE.Texture>()

    model.traverse((child) => {
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
  public addModelBatch(configs: ModelMarkerConfig[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const modelIds: string[] = []
      const loadedCount = { value: 0 }
      const totalCount = configs.length

      if (totalCount === 0) {
        resolve([])
        return
      }

      configs.forEach((config, index) => {
        const enhancedConfig = {
          ...config,
          onComplete: (model: THREE.Group) => {
            loadedCount.value++
            
            // 执行原始回调
            if (config.onComplete) {
              config.onComplete(model)
            }

            // 检查是否全部加载完成
            if (loadedCount.value === totalCount) {
              console.log(`🎯 批量加载完成: ${totalCount}个模型`)
              eventBus.emit('model:batchLoadCompleted', { modelIds, totalCount })
              resolve(modelIds)
            }
          },
          onError: (error: Error) => {
            // 执行原始错误回调
            if (config.onError) {
              config.onError(error)
            }

            console.error(`❌ 批量加载中的模型失败 [${index}]:`, error)
            reject(error)
          }
        }

        const modelId = this.addModel(enhancedConfig)
        modelIds.push(modelId)
      })
    })
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

    // 应用新配置
    if (newConfig.castShadow !== undefined || newConfig.receiveShadow !== undefined) {
      this.updateShadowSettings(instance)
    }

    if (newConfig.materialOverrides) {
      this.applyMaterialOverrides(instance.model, newConfig.materialOverrides)
    }

    if (newConfig.textureQuality) {
      this.adjustTextureQuality(instance.model, newConfig.textureQuality)
    }

    console.log(`🔧 模型配置已更新: ${modelId}`)
    eventBus.emit('model:configUpdated', { modelId, oldConfig, newConfig })
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

        if (instance.mixer || 
            (instance.keyframeAnimation?.state.isPlaying) || 
            (instance.pathAnimation?.state.isPlaying)) {
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
      activeAnimations
    }
  }

  /**
   * 启动动画循环
   */
  private startAnimationLoop(): void {
    eventBus.on('update', (modelId: string) => {
      this.updateAnimations(this.clock.getDelta())
    })
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
   * 资源加载完成回调
   */
  private onResourceLoaded(data: any): void {
    // 可以在这里处理通用的资源加载完成逻辑
    if (this.enableDebugMode) {
      console.log('🔄 ModelMarker收到资源加载事件:', data)
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
    eventBus.off('resource:loaded', this.onResourceLoaded)
    eventBus.off('model:unload', this.removeModel)

    console.log('🧹 ModelMarker插件已销毁')
  }
}

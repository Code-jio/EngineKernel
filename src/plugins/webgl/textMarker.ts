import { THREE, BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'

// 图片文本标记插件
// 主要功能：
// 1. 在3D场景中添加图片文本和标记（将图片和文本转化canvas纹理，然后再渲染成sprite，应用 Sprite and SpriteMaterial）
// 2. 支持图片文本标记的移动、缩放、旋转等操作
// 3. 支持图片文本标记的文字、字体、颜色、大小等样式设置
// 4. 支持图片文本标记的背景、边框等样式设置
// 5. 支持图片文本标记的点击等交互事件
// 6. 支持默认参数与自定义参数设置

// 主要目的:在模型上创作标签(Labels)和徽标(Badges),并让它们在3D场景中显示

// 文本样式接口
interface TextStyle {
  fontSize: number
  fontFamily: string
  fontWeight: 'normal' | 'bold' | 'lighter' | 'bolder'
  color: string
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number
  maxWidth?: number
  textShadow?: {
    color: string
    blur: number
    offsetX: number
    offsetY: number
  }
}

// 背景样式接口
interface BackgroundStyle {
  color: string
  opacity: number
  borderRadius: number
  padding: {
    top: number
    right: number
    bottom: number
    left: number
  }
  border?: {
    width: number
    color: string
    style: 'solid' | 'dashed' | 'dotted'
  }
  gradient?: {
    type: 'linear' | 'radial'
    colors: string[]
    stops?: number[]
  }
}

// 图片配置接口
interface ImageConfig {
  url: string
  width?: number
  height?: number
  position: 'left' | 'right' | 'top' | 'bottom' | 'background'
  margin?: number
  opacity?: number
}

// 标记配置接口
interface TextMarkerConfig {
  text: string
  position: Array<number> | THREE.Vector3
  textStyle?: Partial<TextStyle>
  backgroundStyle?: Partial<BackgroundStyle>
  image?: ImageConfig
  scale?: number
  rotation?: number
  show?: boolean
  autoSize?: boolean
  minSize?: number
  maxSize?: number
  billboard?: boolean // 是否始终面向相机
  clickable?: boolean
  onClick?: (markerId: string) => void
  onHover?: (markerId: string, isHovered: boolean) => void
  name?: string
  userData?: any
}

// 标记实例接口
interface MarkerInstance {
  id: string
  name: string
  sprite: THREE.Sprite
  material: THREE.SpriteMaterial
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  config: TextMarkerConfig
  isVisible: boolean
  isHovered: boolean
  isDirty: boolean // 是否需要重新渲染
  boundingBox: {
    min: THREE.Vector2
    max: THREE.Vector2
  }
}

export class TextMarkerPlugin extends BasePlugin {
  private scene: THREE.Scene | null = null
  private camera: THREE.Camera | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private markerInstances: Map<string, MarkerInstance> = new Map()
  private instanceIdCounter: number = 0
  private raycaster: THREE.Raycaster = new THREE.Raycaster()
  private mouse: THREE.Vector2 = new THREE.Vector2()
  private enableDebugMode: boolean = false
  private defaultTextStyle: TextStyle
  private defaultBackgroundStyle: BackgroundStyle
  private imageCache: Map<string, HTMLImageElement> = new Map()

  constructor(meta: any = {}) {
    super(meta)
    this.enableDebugMode = meta.userData?.enableDebugMode || false
    
    // 设置默认文本样式
    this.defaultTextStyle = {
      fontSize: 16,
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'normal',
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.2,
      ...meta.userData?.defaultTextStyle
    }

    // 设置默认背景样式
    this.defaultBackgroundStyle = {
      color: '#000000',
      opacity: 0.8,
      borderRadius: 8,
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
      ...meta.userData?.defaultBackgroundStyle
    }

    this.scene = meta.userData?.scene || null
    this.camera = meta.userData?.camera || null
    this.renderer = meta.userData?.renderer || null
  }

  /**
   * 插件初始化
   */
  async init(coreInterface: any): Promise<void> {
    console.log('🚀 TextMarker插件初始化开始')
    
    // 获取核心组件引用
    this.scene = coreInterface.scene || null
    this.camera = coreInterface.camera || null
    this.renderer = coreInterface.renderer || null

    if (!this.scene) {
      throw new Error('TextMarker: 无法获取场景引用')
    }

    // 设置事件监听器
    this.setupEventListeners()

    console.log('✅ TextMarker插件初始化完成')
  }

  /**
   * 基类要求的load方法
   */
  async load(): Promise<void> {
    // 基类要求的方法，预加载常用资源
    await this.preloadCommonResources()
  }

  /**
   * 预加载常用资源
   */
  private async preloadCommonResources(): Promise<void> {
    // 可以在这里预加载一些常用的图标或背景图片
    if (this.enableDebugMode) {
      console.log('📦 TextMarker预加载资源完成')
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听鼠标事件
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this))
      this.renderer.domElement.addEventListener('mousemove', this.onMouseMove.bind(this))
    }

    // 监听渲染循环
    eventBus.on('render', this.onRender.bind(this))
  }

  /**
   * 添加文本标记
   */
  public addMarker(config: TextMarkerConfig): string {
    const markerId = this.generateMarkerId()
    
    // 创建Canvas和Context
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    
    // 创建Sprite和Material
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.001
    })
    
    const sprite = new THREE.Sprite(material)
    
    // 设置位置
    if (Array.isArray(config.position)) {
      sprite.position.set(config.position[0], config.position[1], config.position[2])
    } else {
      sprite.position.copy(config.position)
    }
    
    // 设置缩放
    if (config.scale) {
      sprite.scale.multiplyScalar(config.scale)
    }
    
    // 设置旋转
    if (config.rotation) {
      material.rotation = config.rotation
    }
    
    // 设置可见性
    sprite.visible = config.show !== false

    // 创建标记实例
    const instance: MarkerInstance = {
      id: markerId,
      name: config.name || `marker_${markerId}`,
      sprite,
      material,
      canvas,
      context,
      config,
      isVisible: sprite.visible,
      isHovered: false,
      isDirty: true,
      boundingBox: {
        min: new THREE.Vector2(),
        max: new THREE.Vector2()
      }
    }

    // 添加到场景
    if (this.scene) {
      this.scene.add(sprite)
    }

    // 存储实例
    this.markerInstances.set(markerId, instance)

    // 异步渲染标记
    this.renderMarker(markerId)

    console.log(`✅ 文本标记已添加: ${markerId}`)
    eventBus.emit('textMarker:added', { markerId, config })

    return markerId
  }

  /**
   * 渲染标记到Canvas
   */
  private async renderMarker(markerId: string): Promise<void> {
    const instance = this.markerInstances.get(markerId)
    if (!instance || !instance.isDirty) return

    const { canvas, context, config } = instance
    const textStyle = { ...this.defaultTextStyle, ...config.textStyle }
    const backgroundStyle = { ...this.defaultBackgroundStyle, ...config.backgroundStyle }

    // 预处理文本
    const lines = this.wrapText(config.text, textStyle, textStyle.maxWidth)
    
    // 计算文本尺寸
    const textMetrics = this.calculateTextSize(lines, textStyle)
    
    // 加载图片（如果有）
    let image: HTMLImageElement | null = null
    if (config.image) {
      image = await this.loadImage(config.image.url)
    }
    
    // 计算总尺寸
    const totalSize = this.calculateTotalSize(textMetrics, image, config.image, backgroundStyle)
    
    // 设置Canvas尺寸
    canvas.width = totalSize.width
    canvas.height = totalSize.height
    
    // 清除Canvas
    context.clearRect(0, 0, canvas.width, canvas.height)
    
    // 绘制背景
    this.drawBackground(context, totalSize, backgroundStyle)
    
    // 绘制图片
    if (image && config.image) {
      this.drawImage(context, image, config.image, totalSize)
    }
    
    // 绘制文本
    this.drawText(context, lines, textStyle, totalSize, config.image)
    
    // 更新纹理
    instance.material.map!.needsUpdate = true
    
    // 更新Sprite尺寸
    this.updateSpriteSize(instance, totalSize)
    
    // 更新边界框
    this.updateBoundingBox(instance)
    
    instance.isDirty = false
    
    if (this.enableDebugMode) {
      console.log(`🎨 标记渲染完成: ${markerId}`)
    }
  }

  /**
   * 文本换行处理
   */
  private wrapText(text: string, textStyle: TextStyle, maxWidth?: number): string[] {
    if (!maxWidth) {
      return text.split('\n')
    }

    const words = text.split(' ')
    const lines: string[] = []
    let currentLine = ''

    // 临时设置字体以测量文本宽度
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.font = `${textStyle.fontWeight} ${textStyle.fontSize}px ${textStyle.fontFamily}`

    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word
      const testWidth = tempCtx.measureText(testLine).width
      
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    
    if (currentLine) {
      lines.push(currentLine)
    }

    return lines
  }

  /**
   * 计算文本尺寸
   */
  private calculateTextSize(lines: string[], textStyle: TextStyle): { width: number, height: number } {
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')!
    tempCtx.font = `${textStyle.fontWeight} ${textStyle.fontSize}px ${textStyle.fontFamily}`

    let maxWidth = 0
    for (const line of lines) {
      const width = tempCtx.measureText(line).width
      maxWidth = Math.max(maxWidth, width)
    }

    const height = lines.length * textStyle.fontSize * textStyle.lineHeight

    return { width: maxWidth, height }
  }

  /**
   * 计算总尺寸
   */
  private calculateTotalSize(
    textSize: { width: number, height: number },
    image: HTMLImageElement | null,
    imageConfig?: ImageConfig,
    backgroundStyle?: BackgroundStyle
  ): { width: number, height: number } {
    let width = textSize.width
    let height = textSize.height

    // 添加背景内边距
    if (backgroundStyle) {
      width += backgroundStyle.padding.left + backgroundStyle.padding.right
      height += backgroundStyle.padding.top + backgroundStyle.padding.bottom
    }

    // 添加图片尺寸
    if (image && imageConfig) {
      const imgWidth = imageConfig.width || image.width
      const imgHeight = imageConfig.height || image.height
      const margin = imageConfig.margin || 0

      switch (imageConfig.position) {
        case 'left':
        case 'right':
          width += imgWidth + margin
          height = Math.max(height, imgHeight)
          break
        case 'top':
        case 'bottom':
          width = Math.max(width, imgWidth)
          height += imgHeight + margin
          break
        case 'background':
          width = Math.max(width, imgWidth)
          height = Math.max(height, imgHeight)
          break
      }
    }

    return { width, height }
  }

  /**
   * 绘制背景
   */
  private drawBackground(
    context: CanvasRenderingContext2D,
    size: { width: number, height: number },
    backgroundStyle: BackgroundStyle
  ): void {
    context.save()
    
    // 设置透明度
    context.globalAlpha = backgroundStyle.opacity
    
    // 绘制背景
    if (backgroundStyle.gradient) {
      // 渐变背景
      const gradient = backgroundStyle.gradient.type === 'linear'
        ? context.createLinearGradient(0, 0, size.width, size.height)
        : context.createRadialGradient(size.width/2, size.height/2, 0, size.width/2, size.height/2, Math.max(size.width, size.height)/2)
      
      backgroundStyle.gradient.colors.forEach((color, index) => {
        const stop = backgroundStyle.gradient!.stops?.[index] ?? index / (backgroundStyle.gradient!.colors.length - 1)
        gradient.addColorStop(stop, color)
      })
      
      context.fillStyle = gradient
    } else {
      context.fillStyle = backgroundStyle.color
    }
    
    // 绘制圆角矩形
    this.drawRoundedRect(context, 0, 0, size.width, size.height, backgroundStyle.borderRadius)
    context.fill()
    
    // 绘制边框
    if (backgroundStyle.border) {
      context.strokeStyle = backgroundStyle.border.color
      context.lineWidth = backgroundStyle.border.width
      
      if (backgroundStyle.border.style === 'dashed') {
        context.setLineDash([5, 5])
      } else if (backgroundStyle.border.style === 'dotted') {
        context.setLineDash([2, 2])
      }
      
      this.drawRoundedRect(context, 0, 0, size.width, size.height, backgroundStyle.borderRadius)
      context.stroke()
    }
    
    context.restore()
  }

  /**
   * 绘制圆角矩形
   */
  private drawRoundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    context.beginPath()
    context.moveTo(x + radius, y)
    context.lineTo(x + width - radius, y)
    context.quadraticCurveTo(x + width, y, x + width, y + radius)
    context.lineTo(x + width, y + height - radius)
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    context.lineTo(x + radius, y + height)
    context.quadraticCurveTo(x, y + height, x, y + height - radius)
    context.lineTo(x, y + radius)
    context.quadraticCurveTo(x, y, x + radius, y)
    context.closePath()
  }

  /**
   * 绘制图片
   */
  private drawImage(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    imageConfig: ImageConfig,
    totalSize: { width: number, height: number }
  ): void {
    const imgWidth = imageConfig.width || image.width
    const imgHeight = imageConfig.height || image.height
    const margin = imageConfig.margin || 0
    
    let x = 0, y = 0
    
    switch (imageConfig.position) {
      case 'left':
        x = margin
        y = (totalSize.height - imgHeight) / 2
        break
      case 'right':
        x = totalSize.width - imgWidth - margin
        y = (totalSize.height - imgHeight) / 2
        break
      case 'top':
        x = (totalSize.width - imgWidth) / 2
        y = margin
        break
      case 'bottom':
        x = (totalSize.width - imgWidth) / 2
        y = totalSize.height - imgHeight - margin
        break
      case 'background':
        x = (totalSize.width - imgWidth) / 2
        y = (totalSize.height - imgHeight) / 2
        break
    }
    
    context.save()
    if (imageConfig.opacity !== undefined) {
      context.globalAlpha = imageConfig.opacity
    }
    
    context.drawImage(image, x, y, imgWidth, imgHeight)
    context.restore()
  }

  /**
   * 绘制文本
   */
  private drawText(
    context: CanvasRenderingContext2D,
    lines: string[],
    textStyle: TextStyle,
    totalSize: { width: number, height: number },
    imageConfig?: ImageConfig
  ): void {
    context.save()
    
    // 设置字体
    context.font = `${textStyle.fontWeight} ${textStyle.fontSize}px ${textStyle.fontFamily}`
    context.fillStyle = textStyle.color
    context.textAlign = textStyle.textAlign
    context.textBaseline = 'middle'
    
    // 绘制文本阴影
    if (textStyle.textShadow) {
      context.shadowColor = textStyle.textShadow.color
      context.shadowBlur = textStyle.textShadow.blur
      context.shadowOffsetX = textStyle.textShadow.offsetX
      context.shadowOffsetY = textStyle.textShadow.offsetY
    }
    
    // 计算文本起始位置
    let textX = totalSize.width / 2
    let textY = totalSize.height / 2
    
    // 根据图片位置调整文本位置
    if (imageConfig) {
      const imgWidth = imageConfig.width || 0
      const imgHeight = imageConfig.height || 0
      const margin = imageConfig.margin || 0
      
      switch (imageConfig.position) {
        case 'left':
          textX = (totalSize.width + imgWidth + margin) / 2
          break
        case 'right':
          textX = (totalSize.width - imgWidth - margin) / 2
          break
        case 'top':
          textY = (totalSize.height + imgHeight + margin) / 2
          break
        case 'bottom':
          textY = (totalSize.height - imgHeight - margin) / 2
          break
      }
    }
    
    // 绘制每一行文本
    const lineHeight = textStyle.fontSize * textStyle.lineHeight
    const startY = textY - ((lines.length - 1) * lineHeight) / 2
    
    lines.forEach((line, index) => {
      const y = startY + index * lineHeight
      context.fillText(line, textX, y)
    })
    
    context.restore()
  }

  /**
   * 加载图片
   */
  private async loadImage(url: string): Promise<HTMLImageElement> {
    // 检查缓存
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        this.imageCache.set(url, img)
        resolve(img)
      }
      
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`))
      }
      
      img.src = url
    })
  }

  /**
   * 更新Sprite尺寸
   */
  private updateSpriteSize(instance: MarkerInstance, size: { width: number, height: number }): void {
    const scale = 0.01 // 调整比例以适应3D场景
    instance.sprite.scale.set(size.width * scale, size.height * scale, 1)
  }

  /**
   * 更新边界框
   */
  private updateBoundingBox(instance: MarkerInstance): void {
    const sprite = instance.sprite
    const halfWidth = sprite.scale.x / 2
    const halfHeight = sprite.scale.y / 2
    
    instance.boundingBox.min.set(-halfWidth, -halfHeight)
    instance.boundingBox.max.set(halfWidth, halfHeight)
  }

  /**
   * 鼠标点击事件
   */
  private onMouseClick(event: MouseEvent): void {
    if (!this.camera || !this.renderer) return

    this.updateMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const intersects = this.raycaster.intersectObjects(
      Array.from(this.markerInstances.values()).map(instance => instance.sprite)
    )

    if (intersects.length > 0) {
      const sprite = intersects[0].object as THREE.Sprite
      const instance = Array.from(this.markerInstances.values()).find(inst => inst.sprite === sprite)
      
      if (instance && instance.config.clickable && instance.config.onClick) {
        instance.config.onClick(instance.id)
        eventBus.emit('textMarker:clicked', { markerId: instance.id, instance })
      }
    }
  }

  /**
   * 鼠标移动事件
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.camera || !this.renderer) return

    this.updateMousePosition(event)
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const intersects = this.raycaster.intersectObjects(
      Array.from(this.markerInstances.values()).map(instance => instance.sprite)
    )

    // 重置所有悬停状态
    this.markerInstances.forEach(instance => {
      if (instance.isHovered) {
        instance.isHovered = false
        if (instance.config.onHover) {
          instance.config.onHover(instance.id, false)
        }
      }
    })

    // 设置当前悬停的标记
    if (intersects.length > 0) {
      const sprite = intersects[0].object as THREE.Sprite
      const instance = Array.from(this.markerInstances.values()).find(inst => inst.sprite === sprite)
      
      if (instance && !instance.isHovered) {
        instance.isHovered = true
        if (instance.config.onHover) {
          instance.config.onHover(instance.id, true)
        }
        eventBus.emit('textMarker:hovered', { markerId: instance.id, instance })
      }
    }
  }

  /**
   * 更新鼠标位置
   */
  private updateMousePosition(event: MouseEvent): void {
    if (!this.renderer) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  /**
   * 渲染事件处理
   */
  private onRender(): void {
    // 处理广告牌效果
    if (this.camera) {
      this.markerInstances.forEach(instance => {
        if (instance.config.billboard !== false) {
          instance.sprite.lookAt(this.camera!.position)
        }
      })
    }

    // 处理自动缩放
    this.handleAutoScaling()
  }

  /**
   * 处理自动缩放
   */
  private handleAutoScaling(): void {
    if (!this.camera) return

    this.markerInstances.forEach(instance => {
      if (instance.config.autoSize) {
        const distance = instance.sprite.position.distanceTo(this.camera!.position)
        let scale = 1 / distance
        
        if (instance.config.minSize) {
          scale = Math.max(scale, instance.config.minSize)
        }
        if (instance.config.maxSize) {
          scale = Math.min(scale, instance.config.maxSize)
        }
        
        instance.sprite.scale.multiplyScalar(scale)
      }
    })
  }

  /**
   * 更新标记配置
   */
  public updateMarker(markerId: string, config: Partial<TextMarkerConfig>): boolean {
    const instance = this.markerInstances.get(markerId)
    if (!instance) return false

    // 更新配置
    instance.config = { ...instance.config, ...config }
    
    // 更新位置
    if (config.position) {
      if (Array.isArray(config.position)) {
        instance.sprite.position.set(config.position[0], config.position[1], config.position[2])
      } else {
        instance.sprite.position.copy(config.position)
      }
    }
    
    // 更新可见性
    if (config.show !== undefined) {
      instance.sprite.visible = config.show
      instance.isVisible = config.show
    }
    
    // 标记需要重新渲染
    instance.isDirty = true
    this.renderMarker(markerId)
    
    eventBus.emit('textMarker:updated', { markerId, config })
    return true
  }

  /**
   * 移除标记
   */
  public removeMarker(markerId: string): boolean {
    const instance = this.markerInstances.get(markerId)
    if (!instance) return false

    // 从场景中移除
    if (this.scene) {
      this.scene.remove(instance.sprite)
    }

    // 清理资源
    instance.material.dispose()
    instance.material.map?.dispose()

    // 从实例映射中移除
    this.markerInstances.delete(markerId)

    console.log(`🗑️ 文本标记已移除: ${markerId}`)
    eventBus.emit('textMarker:removed', { markerId })
    return true
  }

  /**
   * 设置标记可见性
   */
  public setVisible(markerId: string, visible: boolean): boolean {
    const instance = this.markerInstances.get(markerId)
    if (!instance) return false

    instance.sprite.visible = visible
    instance.isVisible = visible
    
    eventBus.emit('textMarker:visibilityChanged', { markerId, visible })
    return true
  }

  /**
   * 获取所有标记
   */
  public getAllMarkers(): { [key: string]: any } {
    const result: { [key: string]: any } = {}
    
    this.markerInstances.forEach((instance, id) => {
      result[id] = {
        id: instance.id,
        name: instance.name,
        isVisible: instance.isVisible,
        position: instance.sprite.position.toArray(),
        config: instance.config
      }
    })

    return result
  }

  /**
   * 获取标记信息
   */
  public getMarkerInfo(markerId: string): any {
    const instance = this.markerInstances.get(markerId)
    if (!instance) return null

    return {
      id: instance.id,
      name: instance.name,
      isVisible: instance.isVisible,
      isHovered: instance.isHovered,
      position: instance.sprite.position.toArray(),
      scale: instance.sprite.scale.toArray(),
      config: instance.config,
      boundingBox: {
        min: instance.boundingBox.min.toArray(),
        max: instance.boundingBox.max.toArray()
      }
    }
  }

  /**
   * 批量添加标记
   */
  public addMarkerBatch(configs: TextMarkerConfig[]): Promise<string[]> {
    return new Promise((resolve) => {
      const markerIds = configs.map(config => this.addMarker(config))
      
      // 等待所有标记渲染完成
      Promise.all(
        markerIds.map(id => this.renderMarker(id))
      ).then(() => {
        console.log(`🎯 批量添加标记完成: ${markerIds.length}个标记`)
        eventBus.emit('textMarker:batchAdded', { markerIds, totalCount: markerIds.length })
        resolve(markerIds)
      })
    })
  }

  /**
   * 清除所有标记
   */
  public clearAllMarkers(): void {
    const markerIds = Array.from(this.markerInstances.keys())
    markerIds.forEach(id => this.removeMarker(id))
    
    console.log(`🧹 已清除所有标记: ${markerIds.length}个`)
    eventBus.emit('textMarker:allCleared', { count: markerIds.length })
  }

  /**
   * 生成标记ID
   */
  private generateMarkerId(): string {
    return `textMarker_${++this.instanceIdCounter}_${Date.now()}`
  }

  /**
   * 销毁插件
   */
  dispose(): void {
    // 清除所有标记
    this.clearAllMarkers()

    // 清除图片缓存
    this.imageCache.clear()

    // 移除事件监听器
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.removeEventListener('click', this.onMouseClick)
      this.renderer.domElement.removeEventListener('mousemove', this.onMouseMove)
    }

    eventBus.off('render', this.onRender)

    console.log('🧹 TextMarker插件已销毁')
  }
}



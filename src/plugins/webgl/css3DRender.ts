import { THREE, BasePlugin } from "../basePlugin"
import { CSS3DRenderer, CSS3DObject } from "../../utils/three-imports"
import eventBus from '../../eventBus/eventBus'
import * as TWEEN from "@tweenjs/tween.js"

interface CSS3DConfig {
    // 基础配置
    element: HTMLElement | string
    position?: [number, number, number]
    rotation?: [number, number, number] 
    scale?: number | [number, number, number]  // 支持非等比缩放
    
    // 显示配置
    display?: boolean // css属性控制。
    opacity?: number
    zIndex?: number
    
    // 标识配置
    id?: string
    name?: string
    userData?: any
    
    draggable?: boolean

    
    // 生命周期回调
    complete?: () => void
    onUpdate?: () => void
    onDestroy?: () => void
}

interface CSS3DItem {
    id: string
    object: CSS3DObject
    element: HTMLElement
}

// CSS3D渲染插件 - 将HTML元素转为3D对象
export class CSS3DRenderPlugin extends BasePlugin {
    private css3Drenderer: CSS3DRenderer | null = null
    private items: Map<string, CSS3DItem> = new Map()
    private nextId: number = 1
    private mainScene: THREE.Scene | null = null
    private camera: THREE.Camera | null = null
    private domElement: HTMLElement | null = null
    private needsRender: boolean = false
    private resizeHandler: (() => void) | null = null
    // 添加渲染模式配置
    private renderMode: 'continuous' | 'onDemand' = 'continuous' // 连续渲染或按需渲染
    // private lastRenderTime: number = 0
    // 存储update事件处理器引用，便于清理
    private updateHandler: (() => void) | null = null

    // 动画组
    private animations: TWEEN.Group = new TWEEN.Group()

    constructor(meta: any) {
        super(meta)
        this.mainScene = meta.userData.scene || null // 获取主场景
        this.camera = meta.userData.camera || null // 获取相机
        this.css3Drenderer = new CSS3DRenderer()
        this.domElement = this.css3Drenderer.domElement

        this.domElement.className = 'css3d-renderer-layer'
        this.domElement.style.position = 'fixed'
        this.domElement.style.top = '0'
        this.domElement.style.left = '0'
        this.domElement.style.width = '100%'
        this.domElement.style.height = '100%'
        this.domElement.style.zIndex = '1000'
        
        // 设置渲染器尺寸并添加到DOM
        this.css3Drenderer.setSize(window.innerWidth, window.innerHeight)
        document.body.appendChild(this.css3Drenderer.domElement)
        this.setupResizeListener()

        // 初始标记需要渲染
        this.markNeedsRender()

        this.initialize()
    }

    /**
     * 创建CSS3D对象
     * @param options 参数配置
     * @param options.element 元素
     * @param options.position 位置
     * @param options.rotation 旋转
     * @param options.scale 缩放
     * @param options.complete 完成回调
     * @param options.onUpdate 更新回调
     * @param options.onDestroy 销毁回调
     * @returns CSS3DObject
     * @description 创建CSS3D对象，并添加到CSS3D渲染器中
     */
    createCSS3DObject(options: CSS3DConfig): string {
        // 提供默认参数
        const defaultOptions: CSS3DConfig = {
            element: document.createElement('div') || null,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: 0.05,
            display: true, // 默认可见
            opacity: 1,
            zIndex: 1,
            complete: () => {},
            onUpdate: () => {},
            onDestroy: () => {},
        }

        // 合并默认参数和传入参数
        const mergedOptions = { ...defaultOptions, ...options }

        try {
            // 处理element参数，确保是HTMLElement
            let element: HTMLElement
            if (typeof mergedOptions.element === 'string') {
                const foundElement = document.querySelector(mergedOptions.element)
                if (foundElement instanceof HTMLElement) {
                    element = foundElement
                } else {
                    throw new Error(`找不到选择器对应的元素: ${mergedOptions.element}`)
                }
            } else {
                element = mergedOptions.element
            }

            // 设置基础样式
            element.style.opacity = mergedOptions.opacity?.toString() || '1'
            element.style.zIndex = mergedOptions.zIndex?.toString() || '1'
            element.style.display = mergedOptions.display ? "block" : "none"

            // 创建CSS3D对象
            const object = new CSS3DObject(element)

            // 设置位置
            const position = mergedOptions.position || [0, 0, 0]
            object.position.set(position[0], position[1], position[2])

            // 设置旋转
            if (mergedOptions.rotation) {
                object.rotation.set(mergedOptions.rotation[0], mergedOptions.rotation[1], mergedOptions.rotation[2])
            }

            // 设置缩放（支持等比和非等比缩放）
            if (mergedOptions.scale) {
                if (typeof mergedOptions.scale === 'number') {
                    object.scale.setScalar(mergedOptions.scale)
                } else {
                    object.scale.set(mergedOptions.scale[0], mergedOptions.scale[1], mergedOptions.scale[2])
                }
            }

            // 设置用户数据
            if (mergedOptions.userData) {
                object.userData = mergedOptions.userData
            }

            // 添加到场景并获取ID
            const objectId = this.addObject(object, mergedOptions.id)
            
            // 标记需要重新渲染
            this.markNeedsRender()

            // 调用完成回调
            if (mergedOptions.complete) {
                mergedOptions.complete()
            }

            return objectId
            
        } catch (error) {
            console.error('创建CSS3D对象失败:', error)
            throw error
        }
    }
    /**
     * 标记需要重新渲染
     */
    private markNeedsRender(): void {
        this.needsRender = true
    }

    /**
     * 初始化插件
     * @description 插件初始化方法，集成到渲染循环
     */
    private initialize () {
        this.startRenderLoop()

        console.log("✅ CSS3D插件已通过eventBus集成到渲染循环")
        console.log(`🎬 当前渲染模式: ${this.renderMode}`)
    }

    /**
     * 设置窗口大小变化监听
     * @description 设置窗口大小变化监听
     */
    private setupResizeListener(): void {
        const handleResize = () => {
            if (this.css3Drenderer) {
                this.css3Drenderer.setSize(window.innerWidth, window.innerHeight)
                this.markNeedsRender()
            }
        }
        
        window.addEventListener('resize', handleResize)
        this.resizeHandler = handleResize
    }


    /**
     * 添加CSS3D对象到场景
     * @param object CSS3D对象
     * @param id 对象ID
     */
    addObject(object: CSS3DObject, id?: string): string {
        const objectId = id || `css3d_${this.nextId++}`
        
        // 添加到主场景
        if (this.mainScene) {
            this.mainScene.add(object)
        }
        
        // 记录对象信息
        this.items.set(objectId, {
            id: objectId,
            object: object,
            element: object.element
        })
        
        return objectId
    }

    /**
     * 移除CSS3D对象
     * @param id 对象ID
     */
    removeObject(id: string): boolean {
        const item = this.items.get(id)
        if (!item) return false
        
        try {
            // 从场景中移除
            if (this.mainScene) {
                this.mainScene.remove(item.object)
            }
            
            // 从DOM中移除
            if (item.element && item.element.parentNode) {
                item.element.parentNode.removeChild(item.element)
            }
            
            // 从记录中删除
            this.items.delete(id)
            
            // 标记需要重新渲染
            this.markNeedsRender()
            
            return true
        } catch (error) {
            console.error(`移除CSS3D对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 清理所有对象
     */
    clearAll(): void {
        try {
            this.items.forEach((item) => {
                if (this.mainScene) {
                    this.mainScene.remove(item.object)
                }
                if (item.element && item.element.parentNode) {
                    item.element.parentNode.removeChild(item.element)
                }
            })
            this.items.clear()
            this.markNeedsRender()
        } catch (error) {
            console.error('清理CSS3D对象失败:', error)
        }
    }

    /**
     * 优化的更新方法 - 支持连续渲染和按需渲染
     */
    update(): void {
        if (!this.css3Drenderer || !this.mainScene || !this.camera) {
            return
        }

        // 根据渲染模式决定是否渲染
        const shouldRender = this.renderMode === 'continuous' || 
                            (this.renderMode === 'onDemand' && this.needsRender)

        if (!shouldRender) {
            return
        }
        
        try {
            // 更新动画
            this.animations.update()
            
            this.css3Drenderer.render(this.mainScene, this.camera)
            this.needsRender = false
            // this.lastRenderTime = now
            
        } catch (error) {
            console.error('CSS3D渲染失败:', error)
        }
    }

    /**
     * 设置渲染模式
     * @param mode 'continuous' | 'onDemand'
     */
    setRenderMode(mode: 'continuous' | 'onDemand'): void {
        this.renderMode = mode
        console.log(`🎬 CSS3D渲染模式已设置为: ${mode}`)
        
        if (mode === 'continuous') {
            this.markNeedsRender()
        }
    }

    /**
     * 启动渲染循环监听
     * @description 手动启动eventBus渲染循环监听
     */
    startRenderLoop(): void {
        if (this.updateHandler) {
            console.log("⚠️ CSS3D渲染循环已经在运行")
            return
        }

        this.updateHandler = () => {
            this.update()
        }
        
        eventBus.on("update", this.updateHandler)
        console.log("🎬 CSS3D渲染循环已启动")
    }

    /**
     * 停止渲染循环监听
     * @description 手动停止eventBus渲染循环监听
     */
    stopRenderLoop(): void {
        if (this.updateHandler) {
            eventBus.off("update", this.updateHandler)
            this.updateHandler = null
            console.log("⏹️ CSS3D渲染循环已停止")
        } else {
            console.log("⚠️ CSS3D渲染循环未在运行")
        }
    }

    /**
     * 销毁插件
     * @description 销毁整个插件，清理所有资源
     */     
    destroyPlugin(): void {
        try {
            // 清理所有CSS3D对象
            this.clearAll()
            
            // 移除事件监听器
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler)
                this.resizeHandler = null
            }
            
            // 移除eventBus监听器
            if (this.updateHandler) {
                eventBus.off("update", this.updateHandler)
                this.updateHandler = null
            }
            
            // 移除渲染器DOM元素
            if (this.domElement && this.domElement.parentNode) {
                this.domElement.parentNode.removeChild(this.domElement)
            }
            
            // 清空引用
            this.css3Drenderer = null
            this.mainScene = null
            this.camera = null
            this.domElement = null
            
            console.log("🗑️ CSS3D插件已完全销毁")
            
        } catch (error) {
            console.error('销毁CSS3D插件失败:', error)
        }
    }
    /**
     * 获取CSS3D渲染器
     * @description 获取CSS3D渲染器
     * @returns CSS3DRenderer
     */
    getCSS3DRenderer(): CSS3DRenderer | null {
        return this.css3Drenderer
    }

    /**
     * 创建CSS3D对象 - 兼容旧API
     * @param options 配置选项
     * @returns 对象ID
     */
    createObject(options: CSS3DConfig): string {
        return this.createCSS3DObject(options)
    }

    /**
     * 移动对象到指定位置
     * @param id 对象ID
     * @param x X坐标
     * @param y Y坐标
     * @param z Z坐标
     * @returns 是否成功
     */
    moveObject(id: string, x: number, y: number, z: number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            item.object.position.set(x, y, z)
            this.markNeedsRender()
            return true
        } catch (error) {
            console.error(`移动对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 缩放对象
     * @param id 对象ID
     * @param scale 缩放比例
     * @returns 是否成功
     */
    scaleObject(id: string, scale: number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            item.object.scale.setScalar(scale)
            this.markNeedsRender()
            return true
        } catch (error) {
            console.error(`缩放对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 旋转对象
     * @param id 对象ID
     * @param x X轴旋转角度
     * @param y Y轴旋转角度
     * @param z Z轴旋转角度
     * @returns 是否成功
     */
    rotateObject(id: string, x: number, y: number, z: number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            item.object.rotation.set(x, y, z)
            this.markNeedsRender()
            return true
        } catch (error) {
            console.error(`旋转对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 动画移动对象到目标位置
     * @param id 对象ID
     * @param targetPosition 目标位置 [x, y, z]
     * @param duration 动画时长（毫秒）
     * @returns 是否成功启动动画
     */
    animateMove(id: string, targetPosition: [number, number, number], duration: number = 1000): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            const startPosition = item.object.position.clone()
            const endPosition = new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2])
            
            // 简单的动画实现
            const startTime = Date.now()
            
            const animate = () => {
                const elapsed = Date.now() - startTime
                const progress = Math.min(elapsed / duration, 1)
                
                // 线性插值
                const currentPosition = startPosition.clone().lerp(endPosition, progress)
                item.object.position.copy(currentPosition)
                this.markNeedsRender()
                
                if (progress < 1) {
                    requestAnimationFrame(animate)
                }
            }
            
            animate()
            return true
        } catch (error) {
            console.error(`动画移动对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 渲染场景 - 兼容旧API
     * @param camera 相机
     */
    render(camera: THREE.Camera): void {
        if (this.css3Drenderer && this.mainScene) {
            this.css3Drenderer.render(this.mainScene, camera)
        }
    }

    /**
     * 初始化插件 - 重写基类方法
     * @param coreInterface 核心接口
     */
    async init(coreInterface?: any): Promise<void> {
        // // 调用基类的init方法
        // await super.init(coreInterface)
        
        // // 如果提供了核心接口，更新场景和相机引用
        // if (coreInterface) {
        //     this.mainScene = coreInterface.scene || this.mainScene
        //     this.camera = coreInterface.camera || this.camera
        // }
        
        // console.log('🎨 CSS3D渲染插件初始化完成')
    }
    
        /**
     * 渐入效果
     * @param object CSS3D对象
     * @param duration 动画时长（毫秒）
     */
    fadeIn(object: CSS3DObject, duration: number = 1000): void {
        if (!object || !object.element) return;
        
        // 设置初始状态
        object.element.style.display = 'block';
        object.element.style.opacity = '0';
        object.visible = true;
        
        // 创建渐入动画
        const startValues = { opacity: 0 };
        const endValues = { opacity: 1 };
        
        new TWEEN.Tween(startValues, this.animations)
            .to(endValues, duration)
            .easing(TWEEN.Easing.Cubic.Out)
            .onUpdate(() => {
                if (object.element) {
                    object.element.style.opacity = startValues.opacity.toString();
                }
            })
            .onComplete(() => {
                if (object.element) {
                    object.element.style.opacity = '1';
                }
            })
            .start();
            
        this.markNeedsRender();
    }

    /**
     * 渐出效果
     * @param object CSS3D对象
     * @param duration 动画时长（毫秒）
     * @param onComplete 完成回调
     */
    fadeOut(object: CSS3DObject, duration: number = 1000, onComplete?: () => void): void {
        if (!object || !object.element) return;
        
        // 获取当前透明度
        const currentOpacity = parseFloat(object.element.style.opacity || '1');
        
        // 创建渐出动画
        const startValues = { opacity: currentOpacity };
        const endValues = { opacity: 0 };
        
        new TWEEN.Tween(startValues, this.animations)
            .to(endValues, duration)
            .easing(TWEEN.Easing.Cubic.Out)
            .onUpdate(() => {
                if (object.element) {
                    object.element.style.opacity = startValues.opacity.toString();
                }
            })
            .onComplete(() => {
                if (object.element) {
                    object.element.style.opacity = '0';
                    object.element.style.display = 'none';
                }
                object.visible = false;
                
                if (onComplete) {
                    onComplete();
                }
            })
            .start();
            
        this.markNeedsRender();
    }
}

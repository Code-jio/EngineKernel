import { THREE, BasePlugin } from "../basePlugin"
import { CSS3DRenderer, CSS3DObject } from "../../utils/three-imports"
import eventBus from "../../eventBus/eventBus"
import * as TWEEN from "@tweenjs/tween.js"

interface CSS3DConfig {
    // 基础配置
    element: HTMLElement | string
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: number | [number, number, number] // 支持非等比缩放
    offset?: number
    
    // 增强的偏移控制
    offsetConfig?: {
        distance: number
        direction: 'up' | 'down' | 'left' | 'right' | 'front' | 'back' | 'diagonal'
    }
    
    // 显示配置
    display?: boolean // css属性控制。
    opacity?: number
    zIndex?: number

    // 标识配置
    id?: string
    name?: string
    userData?: any

    draggable?: boolean

    // 性能优化配置
    animatedToggle?: boolean // 是否使用动画显隐切换
    gpuAcceleration?: boolean // 是否强制启用GPU加速
    pointerEventsControl?: "auto" | "none" | "smart" // 鼠标事件控制策略
    useTransitions?: boolean // 是否使用CSS过渡动画
    billboarding?: boolean // 是否启用billboarding效果（永远朝向镜头）

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
    private renderMode: "continuous" | "onDemand" = "continuous" // 连续渲染或按需渲染
    private enableBillboarding: boolean = true // 是否启用billboarding效果（永远朝向镜头）
    // private lastRenderTime: number = 0
    // 存储update事件处理器引用，便于清理
    private updateHandler: (() => void) | null = null

    // 动画组
    private animations: TWEEN.Group = new TWEEN.Group()
    
    // 缓存对象，用于优化billboarding计算
    private _cameraPosition?: THREE.Vector3
    private _objectPosition?: THREE.Vector3
    private _lookAtQuaternion?: THREE.Quaternion
    private _tempMatrix?: THREE.Matrix4
    private _tempUp?: THREE.Vector3

    constructor(meta: any) {
        super(meta)
        this.mainScene = meta.userData.scene || null // 获取主场景
        this.camera = meta.userData.camera || null // 获取相机
        this.css3Drenderer = new CSS3DRenderer()
        this.domElement = this.css3Drenderer.domElement

        this.domElement.className = "css3d-renderer-layer"
        this.domElement.style.position = "absolute"
        this.domElement.style.top = "0"
        this.domElement.style.left = "0"
        this.domElement.style.width = "100%"
        this.domElement.style.height = "100%"
        this.domElement.style.zIndex = "1000"

        // 设置渲染器尺寸并添加到DOM
        this.css3Drenderer.setSize(window.innerWidth, window.innerHeight)
        document.body.appendChild(this.css3Drenderer.domElement)
        this.setupResizeListener()

        // 初始标记需要渲染
        this.markNeedsRender()

        this.initialize()
    }

    /**
     * 初始化插件
     * @description 插件初始化方法，集成到渲染循环
     */
    private initialize() {
        this.startRenderLoop()
        // this.addTransitionStyles() //

        console.log("✅ CSS3D插件已通过eventBus集成到渲染循环")
        console.log(`🎬 当前渲染模式: ${this.renderMode}`)
    }

    // 添加过渡动画样式到文档头
    private addTransitionStyles(): void {
        if (!document.getElementById("css3d-transition-styles")) {
            const style = document.createElement("style")
            style.id = "css3d-transition-styles"
            style.textContent = `
            .css3d-transition {
                transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s ease !important;
                transform-origin: center center;
            }
            .css3d-visible {
            }
            .css3d-hidden {
            }
        `
            document.head.appendChild(style)
        }
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
    createCSS3DObject(options: CSS3DConfig): CSS3DObject | CSS3DConfig {
        // 提供默认参数
        const defaultOptions: CSS3DConfig = {
            element: "<div>空对象</div>",
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            offset: 0,
            offsetConfig: { distance: 0, direction: 'up' },
            scale: 0.05,
            display: true, // 默认可见
            opacity: 1,
            zIndex: 1,
            animatedToggle: false, // 默认不使用动画切换
            gpuAcceleration: true, // 默认启用GPU加速
            pointerEventsControl: "smart", // 智能鼠标事件控制
            useTransitions: true, // 默认使用CSS过渡
            billboarding: true, // 默认启用billboarding效果
            complete: () => {},
            onUpdate: () => {},
            onDestroy: () => {},
        }

        // 合并默认参数和传入参数
        const mergedOptions = { ...defaultOptions, ...options }

        try {
            // 处理element参数，确保是HTMLElement
            let element: HTMLElement
            if (typeof mergedOptions.element === "string") {
                const wrapper = document.createElement("div")
                wrapper.innerHTML = mergedOptions.element
                const firstChild = wrapper.firstElementChild as HTMLElement
                if (!firstChild) {
                    throw new Error("创建DOM元素失败：字符串解析后无子元素")
                }
                element = firstChild
            } else {
                element = mergedOptions.element
            }

            // 计算鼠标事件属性
            let pointerEvents = "auto"
            if (mergedOptions.pointerEventsControl === "none") {
                pointerEvents = "none"
            } else if (mergedOptions.pointerEventsControl === "smart") {
                pointerEvents = mergedOptions.display ? "auto" : "none"
            }

            // GPU加速样式
            const baseTransform = "translate3d(0,0,0)"

            // 构建完整样式
            const cssText = [
                `opacity: ${mergedOptions.display ? mergedOptions.opacity : 0}`,
                `z-index: ${mergedOptions.zIndex}`,
                `visibility: ${mergedOptions.display ? "visible" : "hidden"}`,
                `pointer-events: ${pointerEvents}`,
                mergedOptions.gpuAcceleration ? "will-change: transform, opacity" : "",
            ]
                .filter(Boolean)
                .join("; ")

            // 一次性设置样式
            element.style.cssText += ";" + cssText

            // 添加过渡动画类
            if (mergedOptions.useTransitions) {
                element.classList.add("css3d-transition")
            }

            // 添加可见性控制类
            if (mergedOptions.animatedToggle) {
                element.classList.add(mergedOptions.display ? "css3d-visible" : "css3d-hidden")
            } else {
                element.style.display = mergedOptions.display ? "block" : "none"
            }

            // 创建CSS3D对象
            const object = new CSS3DObject(element)

            // 设置可见性
            object.visible = mergedOptions.display || false

            // 计算最终位置（支持传统offset和新offsetConfig）
            let finalPosition = [...mergedOptions.position] as [number, number, number]
            
            // 优先使用offsetConfig
            if (mergedOptions.offsetConfig && mergedOptions.offsetConfig.distance > 0) {
                const { distance, direction } = mergedOptions.offsetConfig
                switch (direction) {
                    case 'up':
                        finalPosition[1] += distance
                        break
                    case 'down':
                        finalPosition[1] -= distance
                        break
                    case 'left':
                        finalPosition[0] -= distance
                        break
                    case 'right':
                        finalPosition[0] += distance
                        break
                    case 'front':
                        finalPosition[2] += distance
                        break
                    case 'back':
                        finalPosition[2] -= distance
                        break
                    case 'diagonal':
                        finalPosition[0] += distance * 0.707
                        finalPosition[1] += distance * 0.707
                        finalPosition[2] += distance * 0.707
                        break
                }
            } else {
                // 兼容旧的offset参数
                finalPosition[1] += mergedOptions.offset || 0
            }

            object.position.set(finalPosition[0], finalPosition[1], finalPosition[2])

            // 设置旋转
            if (mergedOptions.rotation) {
                object.rotation.set(mergedOptions.rotation[0], mergedOptions.rotation[1], mergedOptions.rotation[2])
            }

            // 设置缩放
            if (mergedOptions.scale) {
                if (typeof mergedOptions.scale === "number") {
                    object.scale.setScalar(mergedOptions.scale)
                } else {
                    object.scale.set(mergedOptions.scale[0], mergedOptions.scale[1], mergedOptions.scale[2])
                }
            }

            // 设置用户数据，存储完整的初始化参数
            object.userData = {
                ...(mergedOptions.userData || {}),
                _css3dConfig: { ...mergedOptions }, // 存储完整的初始化配置
                billboarding: mergedOptions.billboarding
            }

            // 添加到场景
            const objectId = this.addObject(object, mergedOptions.id)

            // 请求渲染
            this.markNeedsRender()

            // 完成回调
            if (mergedOptions.complete) {
                mergedOptions.complete()
            }

            // 设置更新回调
            object.userData.onUpdate = mergedOptions.onUpdate

            return object
        } catch (error) {
            console.error("创建CSS3D对象失败:", error)
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

        window.addEventListener("resize", handleResize)
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
            element: object.element,
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
            this.items.forEach(item => {
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
            console.error("清理CSS3D对象失败:", error)
        }
    }

    /**
     * 优化的更新方法 - 支持连续渲染和按需渲染
     */
    update(): void {
        if (!this.css3Drenderer || !this.mainScene || !this.camera) {
            return
        }
        // 更新动画
        this.animations.update()

        // 让所有CSS3D对象永远朝向镜头
        this.makeAllObjectsFaceCamera()

        // 根据渲染模式决定是否渲染
        const shouldRender = this.renderMode === "continuous" || (this.renderMode === "onDemand" && this.needsRender)

        if (!shouldRender) {
            return
        }

        try {
            this.css3Drenderer.render(this.mainScene, this.camera)
            this.needsRender = false
        } catch (error) {
            console.error("CSS3D渲染失败:", error)
        }
    }

    /**
     * 让所有CSS3D对象永远朝向镜头
     * @description 通过设置对象的rotation使其始终面向相机，优化性能减少延迟
     */
    private makeAllObjectsFaceCamera(): void {
        if (!this.camera || !this.enableBillboarding) return

        // 初始化缓存对象
        if (!this._cameraPosition) {
            this._cameraPosition = new THREE.Vector3()
            this._objectPosition = new THREE.Vector3()
            this._lookAtQuaternion = new THREE.Quaternion()
            this._tempMatrix = new THREE.Matrix4()
            this._tempUp = new THREE.Vector3(0, 1, 0)
        }

        // 获取相机的世界坐标
        this.camera.getWorldPosition(this._cameraPosition)

        // 遍历所有CSS3D对象
        this.items.forEach(item => {
            const object = item.object
            
            // 检查该对象是否启用了billboarding
            if (object.userData.billboarding === false) return
            
           if (this.camera) {
               object.lookAt(this.camera.position)
               object.updateMatrixWorld()
           }
            
        })
        
        // 确保在按需渲染模式下标记需要渲染
        if (this.renderMode === "onDemand") {
            this.markNeedsRender()
        }
    }

    /**
     * 设置billboarding效果开关
     * @param enabled 是否启用billboarding效果
     */
    setBillboardingEnabled(enabled: boolean): void {
        this.enableBillboarding = enabled
        console.log(`🎯 CSS3D对象billboarding效果已${enabled ? '启用' : '禁用'}`)
        
        // 如果禁用，重置所有对象的旋转
        if (!enabled) {
            this.items.forEach(item => {
                item.object.quaternion.set(0, 0, 0, 1)
            })
            this.markNeedsRender()
        }
    }

    /**
     * 获取billboarding效果状态
     * @returns 是否启用billboarding效果
     */
    isBillboardingEnabled(): boolean {
        return this.enableBillboarding
    }

    /**
     * 获取CSS3D对象的原始配置数据
     * @param id 对象ID
     * @returns 原始配置数据，如果对象不存在则返回null
     */
    getObjectConfig(id: string): CSS3DConfig | null {
        const item = this.items.get(id)
        if (!item) return null
        
        return item.object.userData._css3dConfig || null
    }

    /**
     * 设置渲染模式
     * @param mode 'continuous' | 'onDemand'
     */
    setRenderMode(mode: "continuous" | "onDemand"): void {
        this.renderMode = mode
        console.log(`🎬 CSS3D渲染模式已设置为: ${mode}`)

        if (mode === "continuous") {
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
                window.removeEventListener("resize", this.resizeHandler)
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
            console.error("销毁CSS3D插件失败:", error)
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
    createObject(options: CSS3DConfig): CSS3DObject {
        return this.createCSS3DObject(options) as CSS3DObject
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
            this.forceUpdateMatrix3D(item.object)

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
     * 渐入效果 - 优化版本，使用CSS过渡动画
     * @param object CSS3D对象
     * @param duration 动画时长（毫秒）
     */
    fadeIn(object: CSS3DObject, duration: number = 1000): void {
        if (!object || !object.element) {
            console.warn("fadeIn: 无效的CSS3D对象")
            return
        }

        const element = object.element

        // 保留现有变换（包括中心对齐和matrix3d）
        const preserveTransform = () => {
            const currentTransform = element.style.transform
            const matrix3dMatch = currentTransform.match(/matrix3d\([^)]+\)/)
            const translateMatch = currentTransform.match(/translate\([^)]+\)/)

            const transforms = []

            // 保留中心对齐
            if (translateMatch && translateMatch[0].includes("-50%")) {
                transforms.push(translateMatch[0])
            } else {
                transforms.push("translate(-50%, -50%)")
            }

            // 保留matrix3d
            if (matrix3dMatch) {
                transforms.push(matrix3dMatch[0])
            }

            // 添加GPU加速
            transforms.push("translate3d(0,0,0)")

            return transforms.join(" ")
        }

        const preservedTransform = preserveTransform()

        // 设置初始状态 - 批量设置样式避免多次重绘
        const initialStyles = [
            "visibility: visible",
            "opacity: 0",
            "pointer-events: none", // 动画开始时禁用鼠标事件
            `transform: ${preservedTransform}`, // 保留所有变换
            `transition: opacity ${duration}ms ease, transform ${duration}ms ease`,
        ].join("; ")

        element.style.cssText += "; " + initialStyles
        object.visible = true

        // 强制重绘以确保初始状态生效
        void element.offsetHeight

        // 设置最终状态，触发CSS过渡动画
        const finalStyles = [
            "opacity: 1",
            "pointer-events: auto", // 动画完成后恢复鼠标事件
            `transform: ${preservedTransform}`,
        ].join("; ")

        element.style.cssText += "; " + finalStyles

        // 清理过渡属性
        setTimeout(() => {
            if (object.visible && element.style.opacity === "1") {
                element.style.transition = ""
            }
        }, duration + 50)

        this.markNeedsRender()
    }

    /**
     * 渐出效果 - 优化版本，使用CSS过渡动画
     * @param object CSS3D对象
     * @param duration 动画时长（毫秒）
     * @param onComplete 完成回调
     */
    fadeOut(object: CSS3DObject, duration: number = 1000, onComplete?: () => void): void {
        if (!object || !object.element) {
            console.warn("fadeOut: 无效的CSS3D对象")
            return
        }

        const element = object.element

        // 保留现有变换（包括中心对齐和matrix3d）
        const preserveTransform = () => {
            const currentTransform = element.style.transform
            const matrix3dMatch = currentTransform.match(/matrix3d\([^)]+\)/)
            const translateMatch = currentTransform.match(/translate\([^)]+\)/)

            const transforms = []

            // 保留中心对齐
            if (translateMatch && translateMatch[0].includes("-50%")) {
                transforms.push(translateMatch[0])
            } else {
                transforms.push("translate(-50%, -50%)")
            }

            // 保留matrix3d
            if (matrix3dMatch) {
                transforms.push(matrix3dMatch[0])
            }

            // 添加GPU加速
            transforms.push("translate3d(0,0,0)")

            return transforms.join(" ")
        }

        const preservedTransform = preserveTransform()

        // 立即禁用鼠标事件，防止动画过程中的交互
        element.style.pointerEvents = "none"
        element.style.transition = `opacity ${duration}ms ease, transform ${duration}ms ease`

        // 设置渐出状态
        const fadeOutStyles = ["opacity: 0", `transform: ${preservedTransform}`].join("; ")

        element.style.cssText += "; " + fadeOutStyles

        // 动画完成后的处理
        setTimeout(() => {
            if (element.style.opacity === "0") {
                const hideStyles = ["visibility: hidden", `transform: ${preservedTransform}`, 'transition: ""'].join(
                    "; ",
                )
                element.style.cssText += "; " + hideStyles
                object.visible = false

                if (onComplete) {
                    onComplete()
                }
            }
        }, duration + 50)

        this.markNeedsRender()
    }

    /**
     * 强制更新CSS3D对象的matrix3d变换
     * @param object CSS3D对象
     */
    private forceUpdateMatrix3D(object: CSS3DObject): void {
        if (!this.css3Drenderer || !this.mainScene || !this.camera) {
            return
        }

        try {
            const originalVisible = object.visible
            object.visible = true

            if (object.parent) {
                object.parent.updateMatrixWorld(true)
            }
            // 临时触发一次渲染来更新matrix3d
            // 这会让CSS3DRenderer重新计算并设置matrix3d属性
            this.css3Drenderer.render(this.mainScene, this.camera)

            // 标记对象需要更新
            object.matrixWorldNeedsUpdate = true

            object.visible = originalVisible
        } catch (error) {
            console.warn("强制更新matrix3d失败:", error)
        }
    }

    /**
     * 智能显隐控制 - 优化版本，保持matrix3d同步
     * @param object CSS3D对象
     * @param visible 是否可见
     * @param useAnimation 是否使用动画过渡
     */
    setVisible(object: CSS3DObject, visible: boolean, useAnimation: boolean = false): void {
        if (!object) return
        const element = object.element as HTMLElement

        const wasVisible = object.visible

        if (visible == true) {
            console.log("set visible true")
        }

        // 保留现有的所有变换，包括中心对齐和matrix3d
        const preserveMatrixTransform = () => {
            const currentTransform = element.style.transform

            // 提取所有重要的变换函数
            const matrix3dMatch = currentTransform.match(/matrix3d\([^)]+\)/)
            const translateMatch = currentTransform.match(/translate\([^)]+\)/)
            const translate3dMatch = currentTransform.match(/translate3d\([^)]+\)/)

            const transforms = []

            // 保留 translate(-50%, -50%) 中心对齐
            if (translateMatch && translateMatch[0].includes("-50%")) {
                transforms.push(translateMatch[0])
            } else {
                // 如果没有中心对齐，添加默认的
                transforms.push("translate(-50%, -50%)")
            }

            // 保留 matrix3d 3D变换
            if (matrix3dMatch) {
                transforms.push(matrix3dMatch[0])
            }

            // 添加GPU加速（如果还没有）
            if (!translate3dMatch || !translate3dMatch[0].includes("translate3d(0,0,0)")) {
                transforms.push("translate3d(0,0,0)")
            }

            return transforms.join(" ")
        }

        if (useAnimation && element.classList.contains("css3d-transition")) {
            // 使用CSS过渡动画
            element.classList.remove("css3d-visible", "css3d-hidden")

            if (visible) {
                // 显示状态 - 只修改显示属性，不覆盖transform
                element.style.opacity = "1"
                element.style.visibility = "visible"
                element.style.pointerEvents =
                    this.getPointerEventsControl(object) === "smart" ? "auto" : element.style.pointerEvents
                element.classList.add("css3d-visible")

                // 保留matrix3d
                element.style.transform = preserveMatrixTransform()
            } else {
                // 隐藏状态
                element.style.opacity = "0"
                element.style.pointerEvents = "none"
                element.classList.add("css3d-hidden")

                // 保留matrix3d
                element.style.transform = preserveMatrixTransform()

                // 动画完成后彻底隐藏
                setTimeout(() => {
                    if (element.style.opacity === "0") {
                        element.style.visibility = "hidden"
                    }
                }, 300) // 与transition时间一致
            }
        } else {
            // 直接设置，不使用动画
            if (visible) {
                element.style.display = "block"
                element.style.visibility = "visible"
                element.style.opacity = "1"
                element.style.pointerEvents =
                    this.getPointerEventsControl(object) === "smart" ? "auto" : element.style.pointerEvents

                // 保留matrix3d
                element.style.transform = preserveMatrixTransform()
            } else {
                element.style.opacity = "0"
                element.style.visibility = "hidden"
                element.style.pointerEvents = "none"

                // 保留matrix3d
                element.style.transform = preserveMatrixTransform()
            }
        }

        object.visible = visible

        if (visible && !wasVisible) {
            // 显示时确保变换正确并强制更新matrix3d
            this.ensureCorrectTransform(element)
            this.forceUpdateMatrix3D(object)
        }

        this.markNeedsRender()
    }

    /**
     * 批量更新对象样式 - 性能优化方法
     * @param updates 批量更新配置数组
     */
    batchUpdateStyles(
        updates: Array<{
            id: string
            styles: Partial<{
                opacity: number
                visibility: "visible" | "hidden"
                transform: string
                pointerEvents: "auto" | "none"
            }>
        }>,
    ): void {
        const updatedObjects: CSS3DObject[] = []

        updates.forEach(update => {
            const item = this.items.get(update.id)
            if (!item) return

            const cssStyles: string[] = []

            if (update.styles.opacity !== undefined) {
                cssStyles.push(`opacity: ${update.styles.opacity}`)
            }
            if (update.styles.visibility !== undefined) {
                cssStyles.push(`visibility: ${update.styles.visibility}`)
            }
            if (update.styles.transform !== undefined) {
                cssStyles.push(`transform: ${update.styles.transform}`)
            }
            if (update.styles.pointerEvents !== undefined) {
                cssStyles.push(`pointer-events: ${update.styles.pointerEvents}`)
            }

            if (cssStyles.length > 0) {
                item.element.style.cssText += "; " + cssStyles.join("; ")
                updatedObjects.push(item.object)
            }
        })

        if (updatedObjects.length > 0) {
            this.markNeedsRender()
            console.log(`🚀 批量更新了 ${updatedObjects.length} 个CSS3D对象的样式`)
        }
    }

    /**
     * 启用/禁用GPU加速
     * @param objectId 对象ID，如果为空则应用到所有对象
     * @param enable 是否启用
     */
    setGPUAcceleration(objectId?: string, enable: boolean = true): void {
        const processObject = (item: CSS3DItem) => {
            const element = item.element
            if (enable) {
                // 只设置will-change，不覆盖transform（transform由setVisible等方法统一管理）
                element.style.willChange = "transform, opacity"
            } else {
                element.style.willChange = "auto"
                element.style.backfaceVisibility = "visible"
            }
        }

        if (objectId) {
            const item = this.items.get(objectId)
            if (item) {
                processObject(item)
            }
        } else {
            this.items.forEach(processObject)
        }

        this.markNeedsRender()
        console.log(`🎨 ${enable ? "启用" : "禁用"}GPU加速 ${objectId ? `(对象: ${objectId})` : "(所有对象)"}`)
    }

    /**
     * 性能监控 - 获取渲染统计信息
     * @returns 性能统计数据
     */
    getPerformanceStats(): {
        totalObjects: number
        visibleObjects: number
        hiddenObjects: number
        gpuAcceleratedObjects: number
        renderMode: string
    } {
        let visibleCount = 0
        let gpuAcceleratedCount = 0

        this.items.forEach(item => {
            if (item.object.visible) {
                visibleCount++
            }

            // 检查是否启用了GPU加速
            if (
                item.element.style.willChange.includes("transform") ||
                item.element.style.transform.includes("translate3d")
            ) {
                gpuAcceleratedCount++
            }
        })

        return {
            totalObjects: this.items.size,
            visibleObjects: visibleCount,
            hiddenObjects: this.items.size - visibleCount,
            gpuAcceleratedObjects: gpuAcceleratedCount,
            renderMode: this.renderMode,
        }
    }

    /**
     * 优化CSS3D对象的DOM结构
     * @param objectId 对象ID
     */
    optimizeDOMStructure(objectId: string): boolean {
        const item = this.items.get(objectId)
        if (!item) return false

        const element = item.element

        try {
            // 移除不必要的样式
            const unnecessaryProps = ["margin", "padding", "border", "outline"]
            unnecessaryProps.forEach(prop => {
                element.style.removeProperty(prop)
            })

            // 确保高性能的渲染属性
            const optimizedStyles = ["contain: layout style paint", "isolation: isolate"].join("; ")

            element.style.cssText += "; " + optimizedStyles

            console.log(`✨ 优化了CSS3D对象DOM结构 (ID: ${objectId})`)
            return true
        } catch (error) {
            console.error(`优化DOM结构失败 (ID: ${objectId}):`, error)
            return false
        }
    }

    /**
     * 获取指针事件控制
     * @param id 对象ID
     * @returns 指针事件控制策略
     */
    getPointerEventsControl(object: CSS3DObject): "auto" | "none" | "smart" {
        let control
        if (!object) {
            control = "auto"
        } else {
            control = object.userData.pointerEventsControl || "auto"
        }

        // 更新用户数据
        object.userData.pointerEventsControl = control

        // 实时更新样式
        const element = object.element as HTMLElement
        if (control === "smart") {
            element.style.pointerEvents = object.visible ? "auto" : "none"
        } else {
            element.style.pointerEvents = control
        }

        return control
    }

    /**
     * 确保CSS3D对象具有正确的变换
     * @param element HTML元素
     */
    private ensureCorrectTransform(element: HTMLElement): void {
        const transform = element.style.transform

        // 检查是否包含必要的变换
        const hasCenterAlign = transform.includes("translate(-50%, -50%)")
        const hasGPUAccel = transform.includes("translate3d(0,0,0)")

        if (!hasCenterAlign || !hasGPUAccel) {
            console.log("🔧 修复CSS3D对象变换:", { hasCenterAlign, hasGPUAccel })

            // 重新构建正确的变换
            const matrix3dMatch = transform.match(/matrix3d\([^)]+\)/)
            const transforms = ["translate(-50%, -50%)"]

            if (matrix3dMatch) {
                transforms.push(matrix3dMatch[0])
            }

            transforms.push("translate3d(0,0,0)")
            element.style.transform = transforms.join(" ")
        }
    }

    /**
     * 手动同步所有CSS3D对象的matrix3d变换
     * @description 当Three.js对象位置发生变化后，调用此方法确保CSS3D对象同步
     */
    syncAllMatrix3D(): void {
        if (!this.css3Drenderer || !this.mainScene || !this.camera) {
            console.warn("CSS3DRenderer、场景或相机未初始化，无法同步matrix3d")
            return
        }

        try {
            // 更新所有对象的世界矩阵
            this.mainScene.updateMatrixWorld(true)

            // 在渲染前确保所有对象的变换正确
            this.items.forEach(item => {
                this.ensureCorrectTransform(item.element)
            })

            // 触发CSS3DRenderer渲染，更新所有matrix3d
            this.css3Drenderer.render(this.mainScene, this.camera)

            console.log(`🔄 已同步 ${this.items.size} 个CSS3D对象的matrix3d变换`)
        } catch (error) {
            console.error("同步matrix3d失败:", error)
        }
    }
}

/**
 * 使用示例：
 * 
 * // 1. 基础使用（传统offset方式）
 * const css3d1 = css3DRender.createCSS3DObject({
 *     element: '<div>测试1</div>',
 *     position: [0, 0, 0],
 *     offset: 5  // 向上偏移5个单位
 * })
 * 
 * // 2. 使用新的offsetConfig（推荐）
 * const css3d2 = css3DRender.createCSS3DObject({
 *     element: '<div>测试2</div>',
 *     position: [0, 0, 0],
 *     offsetConfig: {
 *         distance: 8,
 *         direction: 'up'
 *     }
 * })
 * 
 * // 3. 使用工具函数创建配置
 * const css3d3 = css3DRender.createCSS3DObject({
 *     element: '<div>测试3</div>',
 *     position: [0, 0, 0],
 *     offsetConfig: css3DRender.getOffsetConfig(10, 'right')
 * })
 * 
 * // 4. 不同方向示例
 * const directions = [
 *     { dir: 'up', desc: '向上偏移' },
 *     { dir: 'down', desc: '向下偏移' },
 *     { dir: 'left', desc: '向左偏移' },
 *     { dir: 'right', desc: '向右偏移' },
 *     { dir: 'front', desc: '向前偏移' },
 *     { dir: 'back', desc: '向后偏移' },
 *     { dir: 'diagonal', desc: '对角线偏移' }
 * ]
 * 
 * directions.forEach(({ dir, desc }) => {
 *     const css3d = css3DRender.createCSS3DObject({
 *         element: `<div>${desc}</div>`,
 *         position: [0, 0, 0],
 *         offsetConfig: css3DRender.getOffsetConfig(6, dir as any)
 *     })
 * })
 * 
 * // 5. 动态更新偏移
 * css3DRender.updateObjectConfig('object-id', {
 *     offsetConfig: css3DRender.getOffsetConfig(12, 'front')
 * })
 */

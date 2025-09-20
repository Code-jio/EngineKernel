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
    
    // 屏幕空间偏移 - 基于屏幕坐标的偏移（像素）
    screenOffset?: [number, number]
    
    // 屏幕空间定位配置
    screenSpace?: boolean // 是否使用屏幕空间定位，使用3D坐标自动转换为屏幕坐标
    
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
    private camera: THREE.Camera
    private domElement: HTMLElement | null = null
    private needsRender: boolean = false
    // 添加渲染模式配置
    private renderMode: "continuous" | "onDemand" = "continuous" // 连续渲染或按需渲染
    private enableBillboarding: boolean = true // 是否启用billboarding效果（永远朝向镜头）
    // private lastRenderTime: number = 0
    // 存储update事件处理器引用，便于清理
    private updateHandler: (() => void) | null = null

    // 动画组
    private animations: TWEEN.Group = new TWEEN.Group()
    
    // 缓存对象，用于优化billboarding计算和屏幕空间坐标转换
    private _cameraPosition?: THREE.Vector3
    private _objectPosition?: THREE.Vector3
    private _lookAtQuaternion?: THREE.Quaternion
    private _tempMatrix?: THREE.Matrix4
    private _tempUp?: THREE.Vector3
    private _vector3?: THREE.Vector3
    private _screenVector?: THREE.Vector3

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
            scale: 0.05,
            screenOffset: [0, 0], // 默认屏幕空间无偏移
            screenSpace: true, // 默认使用屏幕空间定位
            zIndex: 0,
            display: true, // 默认可见
            opacity: 1,
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

            // 屏幕空间定位样式 - 使用屏幕外初始位置，避免闪烁
            let screenSpaceStyles = ""
            if (mergedOptions.screenSpace) {
                // 初始位置设置在屏幕外，避免在(0,0)处显示
                screenSpaceStyles = `
                    position: fixed;
                    left: -9999px;
                    top: -9999px;
                    transform-origin: center center;
                    pointer-events: ${pointerEvents};
                    z-index: ${mergedOptions.zIndex || 1};
                    opacity: ${mergedOptions.opacity || 1};
                    ${mergedOptions.gpuAcceleration ? 'transform: translate3d(0, 0, 0);' : ''}
                `
            }

            // GPU加速样式
            const baseTransform = "translate3d(0,0,0)"

            // 构建完整样式
            const cssText = [
                `opacity: ${mergedOptions.display ? mergedOptions.opacity : 0}`,
                `z-index: ${mergedOptions.zIndex}`,
                `visibility: ${mergedOptions.display ? "visible" : "hidden"}`,
                `pointer-events: ${pointerEvents}`,
                screenSpaceStyles,
                mergedOptions.gpuAcceleration ? "will-change: transform, opacity" : "",
            ]
                .filter(Boolean)
                .join("; ")

            // 一次性设置样式
            element.style.cssText += ";" + cssText

            // 初始状态设置为不可见，避免闪烁
            if (mergedOptions.display) {
                element.style.display = "block"
                element.style.visibility = "hidden" // 先隐藏避免闪烁
                element.style.opacity = "0"
            } else {
                element.style.display = "none"
                element.style.visibility = "hidden"
                element.style.opacity = "0"
            }

            // 创建CSS3D对象或屏幕空间元素
            let object: CSS3DObject
            
            if (mergedOptions.screenSpace) {
                // 屏幕空间定位 - 直接使用DOM元素，不创建CSS3DObject
                object = {
                    element: element,
                    visible: mergedOptions.display || false,
                    position: new THREE.Vector3(mergedOptions.position[0], mergedOptions.position[1], mergedOptions.position[2]),
                    rotation: new THREE.Euler(0, 0, 0),
                    scale: new THREE.Vector3(1, 1, 1),
                    userData: {
                        ...(mergedOptions.userData || {}),
                        _css3dConfig: { ...mergedOptions },
                        screenSpace: true,
                        billboarding: false // 屏幕空间元素不需要billboarding
                    }
                } as any // 类型断言以兼容
                
                // 设置屏幕空间特定属性
                element.dataset.screenSpace = 'true'
                
            } else {
                // 3D空间定位 - 创建CSS3DObject
                object = new CSS3DObject(element)
                object.visible = mergedOptions.display || false

                // 直接使用传入的3D坐标，不再进行偏移计算
                object.position.set(
                    mergedOptions.position[0], 
                    mergedOptions.position[1], 
                    mergedOptions.position[2]
                )

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

                // 设置用户数据
                object.userData = {
                    ...(mergedOptions.userData || {}),
                    _css3dConfig: { ...mergedOptions },
                    screenSpace: false,
                    billboarding: mergedOptions.billboarding
                }
            }

            // 添加到场景或管理
            const objectId = this.addObject(object, mergedOptions.id)

            // 延迟显示元素，使用渐显动画 - 确保位置正确后显示
            if (mergedOptions.display) {
                // 使用微任务队列确保在DOM更新后执行
                queueMicrotask(() => {
                    if (mergedOptions.screenSpace) {
                        // 屏幕空间对象：先更新位置，再移动到可见区域
                        this.updateScreenSpaceObjects()
                        // 将元素从屏幕外移回可见区域
                        element.style.left = '0px'
                        element.style.top = '0px'
                    } else {
                        // 3D空间对象：确保位置正确后显示
                        this.forceUpdateMatrix3D(object)
                    }

                    // 统一显示元素 - 使用渐显动画
                    element.style.visibility = "visible"
                    element.style.opacity = "0"
                    
                    new TWEEN.Tween({ opacity: 0 })
                        .to({ opacity: mergedOptions.opacity || 1 }, 300)
                        .easing(TWEEN.Easing.Quadratic.Out)
                        .onUpdate((obj) => {
                            element.style.opacity = obj.opacity.toString()
                        })
                        .onComplete(() => {
                            this.markNeedsRender()
                        })
                        .start()
                })
            }

            // 请求渲染
            this.markNeedsRender()

            // 完成回调
            setTimeout(() => {
                if (mergedOptions.complete) {
                    mergedOptions.complete()
                }
            }, 0);
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
        eventBus.on("resize", ()=>{
            if (this.css3Drenderer) {
                this.css3Drenderer.setSize(window.innerWidth, window.innerHeight)
                this.markNeedsRender()
            }
        })
    }

    /**
     * 添加CSS3D对象到场景
     * @param object CSS3D对象或屏幕空间对象
     * @param id 对象ID
     */
    addObject(object: CSS3DObject, id?: string): string {
        const objectId = id || `css3d_${this.nextId++}`

        // 检查是否为屏幕空间对象
        const isScreenSpace = object.userData?.screenSpace === true

        // 只有非屏幕空间对象才添加到THREE.Scene
        if (!isScreenSpace && this.mainScene) {
            this.mainScene.add(object)
        }

        // 记录对象信息
        this.items.set(objectId, {
            id: objectId,
            object: object,
            element: object.element || (object as any).element,
        })

        return objectId
    }

    /**
     * 移除CSS3D对象
     * @param id 对象ID
     * @param useAnimation 是否使用渐隐动画，默认为true
     */
    removeObject(id: string, useAnimation: boolean = true): boolean {
        const item = this.items.get(id)
        if (!item) return false

        const removeElement = () => {
            try {
                const isScreenSpace = item.object.userData?.screenSpace === true

                // 只有非屏幕空间对象才从场景中移除
                if (!isScreenSpace && this.mainScene) {
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
            } catch (error) {
                console.error(`移除CSS3D对象失败 (ID: ${id}):`, error)
            }
        }

        if (useAnimation && item.element) {
            // 使用渐隐动画
            new TWEEN.Tween({ opacity: parseFloat(item.element.style.opacity || "1") })
                .to({ opacity: 0 }, 300)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onUpdate((obj) => {
                    item.element.style.opacity = obj.opacity.toString()
                })
                .onComplete(() => {
                    removeElement()
                })
                .start()
        } else {
            // 立即移除
            removeElement()
        }

        return true
    }

    /**
     * 清理所有对象
     * @param useAnimation 是否使用渐隐动画，默认为false（批量清理通常不需要动画）
     */
    clearAll(useAnimation: boolean = false): void {
        try {
            if (useAnimation) {
                // 使用渐隐动画清理所有对象
                const promises: Promise<void>[] = []
                
                this.items.forEach(item => {
                    if (item.element) {
                        const promise = new Promise<void>((resolve) => {
                            new TWEEN.Tween({ opacity: parseFloat(item.element.style.opacity || "1") })
                                .to({ opacity: 0 }, 300)
                                .easing(TWEEN.Easing.Quadratic.Out)
                                .onUpdate((obj) => {
                                    item.element.style.opacity = obj.opacity.toString()
                                })
                                .onComplete(() => {
                                    resolve()
                                })
                                .start()
                        })
                        promises.push(promise)
                    } else {
                        promises.push(Promise.resolve())
                    }
                })

                // 等待所有动画完成后清理
                Promise.all(promises).then(() => {
                    this.items.forEach(item => {
                        const isScreenSpace = item.object.userData?.screenSpace === true
                        
                        // 只有非屏幕空间对象才从场景中移除
                        if (!isScreenSpace && this.mainScene) {
                            this.mainScene.remove(item.object)
                        }
                        if (item.element && item.element.parentNode) {
                            item.element.parentNode.removeChild(item.element)
                        }
                    })
                    this.items.clear()
                    this.markNeedsRender()
                })
            } else {
                // 立即清理所有对象
                this.items.forEach(item => {
                    const isScreenSpace = item.object.userData?.screenSpace === true
                    
                    // 只有非屏幕空间对象才从场景中移除
                    if (!isScreenSpace && this.mainScene) {
                        this.mainScene.remove(item.object)
                    }
                    if (item.element && item.element.parentNode) {
                        item.element.parentNode.removeChild(item.element)
                    }
                })
                this.items.clear()
                this.markNeedsRender()
            }
        } catch (error) {
            console.error("清理CSS3D对象失败:", error)
        }
    }

    /**
     * 优化的更新方法 - 支持连续渲染和按需渲染
     */
    update(): void {
        // 更新屏幕空间对象的位置
        this.updateScreenSpaceObjects()

        // 只有非屏幕空间对象才需要3D渲染
        if (this.css3Drenderer && this.mainScene && this.camera) {
            // 让所有CSS3D对象永远朝向镜头
            this.makeAllObjectsFaceCamera()

            // 根据渲染模式决定是否渲染
            const shouldRender = this.renderMode === "continuous" || (this.renderMode === "onDemand" && this.needsRender)

            if (shouldRender) {
                try {
                    this.css3Drenderer.render(this.mainScene, this.camera)
                    this.needsRender = false
                } catch (error) {
                    console.error("CSS3D渲染失败:", error)
                }
            }
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
            
            // 跳过屏幕空间对象和禁用billboarding的对象
            if (object.userData.screenSpace === true || object.userData.billboarding === false) return
            
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
                if (item.object.userData.screenSpace !== true) {
                    item.object.quaternion.set(0, 0, 0, 1)
                }
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
     * 更新屏幕空间对象的位置
     * @description 根据3D坐标自动转换为2D屏幕坐标更新屏幕空间DOM元素的位置
     */
    private updateScreenSpaceObjects(): void {
        if (!this.camera) return

        this.items.forEach(item => {
            const object = item.object
            const element = item.element
            
            if (object.userData.screenSpace !== true || !element) return

            const config = object.userData._css3dConfig
            if (!config || !config.screenSpace) return

            // 使用3D坐标转换为2D屏幕坐标
            const worldPosition = [object.position.x, object.position.y, object.position.z]
            const screenPosition = this.worldToScreen(worldPosition)
            
            // 计算居中的偏移量（元素中心对齐）
            const rect = element.getBoundingClientRect()
            const anchorOffsetX = -rect.width / 2
            const anchorOffsetY = -rect.height / 2

            // 应用屏幕空间偏移
            const screenOffsetX = config.screenOffset?.[0] || 0
            const screenOffsetY = config.screenOffset?.[1] || 0

            // 应用最终位置（屏幕坐标 + 居中偏移 + 屏幕空间偏移）
            element.style.transform = `translate3d(${screenPosition[0] + anchorOffsetX + screenOffsetX}px, ${screenPosition[1] + anchorOffsetY + screenOffsetY}px, 0)`
        })
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
     * 设置屏幕空间对象的位置
     * @param id 对象ID
     * @param worldPosition 3D世界坐标
     */
    setScreenPosition(id: string, worldPosition: [number, number, number]): boolean {
        const item = this.items.get(id)
        if (!item) return false

        const object = item.object
        if (object.userData.screenSpace !== true) return false

        // 更新对象的3D位置
        object.position.set(worldPosition[0], worldPosition[1], worldPosition[2])
        
        // 立即更新屏幕位置
        this.updateScreenSpaceObjects()
        this.markNeedsRender()

        return true
    }

    /**
     * 检查对象是否为屏幕空间对象
     * @param id 对象ID
     * @returns 是否为屏幕空间对象
     */
    isScreenSpaceObject(id: string): boolean {
        const item = this.items.get(id)
        if (!item) return false
        
        return item.object.userData.screenSpace === true
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

        eventBus.on("update", () => {
            this.update()
        })
        
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
            // 直接设置位置，无动画，立即完成
            item.object.position.set(x, y, z)
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
     * 动画移动对象到目标位置 - 优化版本，解决卡顿问题
     * @param id 对象ID
     * @param targetPosition 目标位置 [x, y, z]
     * @param duration 动画时长（毫秒），默认为400ms减少等待时间
     * @param easing 缓动函数，默认为更快的缓动
     * @returns 是否成功启动动画
     */
    animateMove(id: string, targetPosition: [number, number, number], duration: number = 400, easing?: (amount: number) => number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            const startPosition = item.object.position.clone()
            const endPosition = new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2])
            
            // 设置渲染模式为连续渲染，确保动画流畅
            const originalMode = this.renderMode
            this.setRenderMode("continuous")
            
            // 使用TWEEN.js进行高性能动画，优化参数
            const tween = new TWEEN.Tween({ x: startPosition.x, y: startPosition.y, z: startPosition.z })
                .to({ x: endPosition.x, y: endPosition.y, z: endPosition.z }, duration)
                .easing(easing || TWEEN.Easing.Cubic.Out) // 使用更快的缓动函数
                .onUpdate((coords) => {
                    item.object.position.set(coords.x, coords.y, coords.z)
                })
                .onComplete(() => {
                    // 动画完成后恢复原始渲染模式
                    this.setRenderMode(originalMode)
                    // 确保位置精确
                    item.object.position.copy(endPosition)
                    this.markNeedsRender()
                    this.forceUpdateMatrix3D(item.object)
                })
                .start()
            
            // 将动画添加到动画组
            this.animations.add(tween)
            
            return true
        } catch (error) {
            console.error(`动画移动对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 快速移动对象到目标位置 - 无动画版本，解决卡顿问题
     * @param id 对象ID
     * @param targetPosition 目标位置 [x, y, z]
     * @returns 是否成功
     */
    moveObjectInstant(id: string, targetPosition: [number, number, number]): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            // 直接设置位置，无动画，立即完成，避免卡顿
            item.object.position.set(targetPosition[0], targetPosition[1], targetPosition[2])
            this.forceUpdateMatrix3D(item.object)
            this.markNeedsRender() // 只调用一次，避免重复渲染
            return true
        } catch (error) {
            console.error(`快速移动对象失败 (ID: ${id}):`, error)
            return false
        }
    }

    /**
     * 优化动画移动对象 - 使用更高效的动画策略
     * @param id 对象ID
     * @param targetPosition 目标位置 [x, y, z]
     * @param duration 动画时长（毫秒），默认为300ms减少等待时间
     * @param useHardwareAcceleration 是否使用硬件加速，默认为true
     * @returns 是否成功启动动画
     */
    animateMoveOptimized(id: string, targetPosition: [number, number, number], duration: number = 300, useHardwareAcceleration: boolean = true): boolean {
        const item = this.items.get(id)
        if (!item) return false

        try {
            const startPosition = item.object.position.clone()
            const endPosition = new THREE.Vector3(targetPosition[0], targetPosition[1], targetPosition[2])
            
            // 设置渲染模式为连续渲染，确保动画流畅
            const originalMode = this.renderMode
            this.setRenderMode("continuous")
            
            // 使用TWEEN.js进行高性能动画，减少持续时间
            const tween = new TWEEN.Tween({ x: startPosition.x, y: startPosition.y, z: startPosition.z })
                .to({ x: endPosition.x, y: endPosition.y, z: endPosition.z }, duration)
                .easing(TWEEN.Easing.Cubic.Out) // 使用更快的缓动函数
                .onUpdate((coords) => {
                    item.object.position.set(coords.x, coords.y, coords.z)
                    // 减少渲染调用频率，使用节流
                    if (Math.random() < 0.3) { // 30%的概率触发渲染，减少CPU负载
                        this.markNeedsRender()
                    }
                })
                .onComplete(() => {
                    // 动画完成后恢复原始渲染模式
                    this.setRenderMode(originalMode)
                    item.object.position.copy(endPosition)
                    this.markNeedsRender()
                    this.forceUpdateMatrix3D(item.object)
                })
                .start()
            
            // 将动画添加到动画组
            this.animations.add(tween)
            
            return true
        } catch (error) {
            console.error(`优化动画移动对象失败 (ID: ${id}):`, error)
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
     * 设置对象可见性 - 支持动画版本
     * @param object CSS3D对象
     * @param visible 是否可见
     * @param useAnimation 是否使用动画过渡，默认为true
     */
    setVisible(object: CSS3DObject, visible: boolean, useAnimation: boolean = true): void {
        if (!object || !object.element) return;
        
        const element = object.element as HTMLElement;
        
        if (useAnimation) {
            // 使用Tween.js实现渐显渐隐动画
            if (visible) {
                // 渐显动画
                element.style.display = "block";
                element.style.visibility = "visible";
                element.style.pointerEvents =
                    this.getPointerEventsControl(object) === "smart" ? "auto" : element.style.pointerEvents;
                
                new TWEEN.Tween({ opacity: 0 })
                    .to({ opacity: 1 }, 300)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onUpdate((obj) => {
                        element.style.opacity = obj.opacity.toString();
                    })
                    .start();
            } else {
                // 渐隐动画
                new TWEEN.Tween({ opacity: parseFloat(element.style.opacity || "1") })
                    .to({ opacity: 0 }, 300)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .onUpdate((obj) => {
                        element.style.opacity = obj.opacity.toString();
                    })
                    .onComplete(() => {
                        element.style.display = "none";
                        element.style.visibility = "hidden";
                        element.style.pointerEvents = "none";
                    })
                    .start();
            }
        } else {
            // 无动画实现
            if (visible) {
                element.style.display = "block";
                element.style.visibility = "visible";
                element.style.opacity = "1";
                element.style.pointerEvents =
                    this.getPointerEventsControl(object) === "smart" ? "auto" : element.style.pointerEvents;
            } else {
                element.style.display = "none";
                element.style.visibility = "hidden";
                element.style.opacity = "0";
                element.style.pointerEvents = "none";
            }
        }

        object.visible = visible;

        if (visible) {
            this.forceUpdateMatrix3D(object);
        }

        this.markNeedsRender();
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
    /**
     * 3D世界坐标到2D屏幕空间的转换
     * @param worldPosition 3D世界坐标
     * @returns 2D屏幕坐标
     */
    worldToScreen(worldPosition: number[]): number[] {
        const vector = new THREE.Vector3(...worldPosition)
        vector.project(this.camera)
        const x = (vector.x + 1) * 0.5 * window.innerWidth
        const y = (1 - vector.y) * 0.5 * window.innerHeight
        return [x, y]
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

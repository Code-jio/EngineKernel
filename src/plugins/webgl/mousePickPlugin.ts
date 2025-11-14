import { BasePlugin, THREE } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"

/**
 * 拾取结果管理
详细拾取信息：物体ID、世界坐标、局部坐标、UV坐标、法向量
拾取历史记录：支持撤销/重做操作
选中状态管理：高亮显示、边框效果、颜色变化
⚡ 性能优化
空间分割：使用八叉树、BSP树等加速结构
视锥裁剪：只检测可见区域内的物体
LOD支持：根据距离使用不同精度的碰撞体
异步拾取：大场景下分帧处理，避免卡顿
🎮 交互体验
拾取预览：鼠标悬停时的即时反馈
拾取滤镜：按图层、标签、类型过滤可拾取物体
拾取热键：支持键盘组合键改变拾取行为
触摸设备支持：移动端的触摸拾取
🔧 调试和可视化
debug模式：显示射线、包围盒、碰撞网格
性能监控：拾取耗时、检测物体数量统计
可视化工具：拾取区域高亮、射线可视化
🛠 配置和扩展
回调系统：拾取开始、进行中、完成、失败等事件
插件化架构：支持自定义拾取算法
配置选项：拾取精度、性能等级、效果开关
💡 高级功能
语义拾取：支持拾取物体的子组件（如模型的某个部件）
区域拾取：矩形选框、圆形选框、自由绘制选框
智能拾取：根据场景复杂度自动调整算法
批量操作：对拾取结果进行批量变换、删除等
 */

// 拾取模式枚举
enum PickMode {
    SINGLE = "single", // 单选
    BOX_SELECT = "box", // 框选
    LINE = "Line", // 拾取点集
}

// 拾取结果接口
interface PickResult {
    object: THREE.Object3D // 被拾取的物体
    point: THREE.Vector3 // 世界坐标交点
    localPoint: THREE.Vector3 // 局部坐标交点
    distance: number // 距离摄像机的距离
    face?: THREE.Face // 相交的面（如果有）
    faceIndex?: number // 面索引
    uv?: THREE.Vector2 // UV坐标
    normal?: THREE.Vector3 // 法向量
    instanceId?: number // 实例ID（如果是InstancedMesh）
    objectType: string // 物体类型（Mesh、Line、Points等）
    materialName?: string // 材质名称
    geometryType?: string // 几何体类型
    worldMatrix: THREE.Matrix4 // 世界变换矩阵
    boundingBox?: THREE.Box3 // 包围盒
    objectList?: THREE.Object3D[] // 拾取到的对象列表
}

// 拾取配置接口
interface PickConfig {
    mode: PickMode // 拾取模式
    tolerance: number // 拾取容差（像素）
    maxDistance: number // 最大拾取距离
    sortByDistance: boolean // 是否按距离排序
    recursive: boolean // 是否递归检测子物体
    enableDebug: boolean // 是否开启调试模式
    showHighlight: boolean // 是否显示高亮
}

// 框选区域接口
interface BoxSelectArea {
    startX: number
    startY: number
    endX: number
    endY: number
}

/**
 * 鼠标拾取插件
 * 支持射线投射拾取、多种拾取模式、精度控制和深度排序
 */
export class MousePickPlugin extends BasePlugin {
    // 核心组件
    private raycaster: THREE.Raycaster
    private mouse: THREE.Vector2
    private camera: THREE.Camera | null = null
    private scene: THREE.Scene | null = null
    private renderer: THREE.WebGLRenderer | null = null
    // private controlLayer: HTMLElement | null = null;
    private controller: any = null

    public highLight:boolean = true

    // 拾取配置
    private config: PickConfig = {
        mode: PickMode.SINGLE, // 拾取模式
        tolerance: 0.001, // 拾取容差（像素）
        maxDistance: Infinity, // 最大拾取距离
        sortByDistance: true, // 是否按距离排序
        recursive: false, // 是否递归检测子物体
        enableDebug: false, // 是否开启调试模式
        showHighlight: true, // 是否显示高亮
    }

    // 选中状态管理
    private selectedObjects: Set<THREE.Object3D> = new Set()
    private hoveredObject: THREE.Object3D | null = null

    // 框选相关
    private isBoxSelecting = false
    private boxSelectArea: BoxSelectArea | null = null
    private boxSelectElement: HTMLDivElement | null = null

    // 事件绑定
    private boundMouseDown: (e: MouseEvent) => void
    private boundMouseMove: (e: MouseEvent) => void
    private boundMouseUp: (e: MouseEvent) => void
    private boundKeyDown: (e: KeyboardEvent) => void
    private boundKeyUp: (e: KeyboardEvent) => void

    // 调试可视化
    private debugRayLine: THREE.Line | null = null
    public debugEnabled = false

    // 按键状态
    private isCtrlPressed = false
    private isShiftPressed = false

    // 控制器状态管理
    private controllerOriginalState: {
        enabled?: boolean
        enableRotate?: boolean
        enableZoom?: boolean
        enablePan?: boolean
        enableDamping?: boolean
        autoRotate?: boolean
    } = {}

    // 边框高亮状态管理
    private highlightedObject: THREE.Object3D | null = null
    private highlightOutline: THREE.LineSegments | null = null
    private outlineMaterial: THREE.LineBasicMaterial

    // 建筑控制状态管理
    private openedBuilding: THREE.Object3D | null = null
    private facades: THREE.Object3D[] = []
    private buildingMode: boolean = false

    // 双击检测状态
    private lastClickTime: number = 0
    private lastClickedObject: THREE.Object3D | null = null
    private doubleClickDelay: number = 300 // 双击间隔时间（毫秒）

    private linePoints: THREE.Vector3[] = [] // 拾取的点集

    public enable: Boolean = true

    constructor(meta: any) {
        super(meta)

        // 初始化射线投射器
        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2()

        // 验证必要参数
        if (!meta.userData?.camera) {
            throw new Error("MousePickPlugin 需要在 meta.userData.camera 中提供摄像机实例")
        }
        if (!meta.userData?.scene) {
            throw new Error("MousePickPlugin 需要在 meta.userData.scene 中提供场景实例")
        }
        if (!meta.userData?.renderer) {
            throw new Error("MousePickPlugin 需要在 meta.userData.renderer 中提供渲染器实例")
        }

        this.camera = meta.userData.camera
        this.scene = meta.userData.scene
        this.renderer = meta.userData.renderer
        this.controller = meta.userData.controller
        this.debugEnabled = meta.userData.debugEnabled

        // 绑定事件处理函数
        this.boundMouseDown = this.handleMouseDown.bind(this)
        this.boundMouseMove = this.handleMouseMove.bind(this)
        this.boundMouseUp = this.handleMouseUp.bind(this)
        this.boundKeyDown = this.handleKeyDown.bind(this)
        this.boundKeyUp = this.handleKeyUp.bind(this)

        this.initializeEventListeners()
        this.createBoxSelectElement()

        // 初始化边框高亮材质
        this.outlineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff, // 亮蓝色
            linewidth: 2,
            transparent: true,
            opacity: 0.8,
        })

        eventBus.on("Highlight-Delete",()=>{
            this.clearHighlight()
        })
    }

    /**
     * 初始化事件监听器
     */
    private initializeEventListeners(): void {
        const controlLayer = this.controller?.getControlLayer ? this.controller.getControlLayer() : null

        if (!controlLayer) {
            console.error("❌ controlLayer元素不存在，无法绑定事件监听器")
            console.warn("请确保传入的controller实例具有getControlLayer()方法")
            return
        }

        // 确保controlLayer可以接收事件
        if (!controlLayer.style.pointerEvents || controlLayer.style.pointerEvents === "none") {
            controlLayer.style.pointerEvents = "auto"
            console.log("🔧 controlLayer pointerEvents 已设置为 auto")
        }

        // 使用capture模式确保拾取事件优先于控制器事件处理
        const captureOptions = { capture: true, passive: false }

        controlLayer.addEventListener("mousedown", this.boundMouseDown, captureOptions)
        controlLayer.addEventListener("mousemove", this.boundMouseMove, captureOptions)
        controlLayer.addEventListener("mouseup", this.boundMouseUp, captureOptions)

        // 键盘事件仍然绑定到window
        window.addEventListener("keydown", this.boundKeyDown)
        window.addEventListener("keyup", this.boundKeyUp)

        console.log("✅ 事件监听器绑定完成 (capture模式):", {
            mousedown: true,
            mousemove: true,
            mouseup: true,
            keydown: true,
            keyup: true,
        })

        console.log("🧪 测试点击监听器已添加，点击controlLayer查看是否触发")
    }

    /**
     * 创建框选元素
     */
    private createBoxSelectElement(): void {
        this.boxSelectElement = document.createElement("div")
        this.boxSelectElement.style.position = "absolute"
        this.boxSelectElement.style.border = "1px dashed #fff"
        this.boxSelectElement.style.backgroundColor = "rgba(255, 255, 255, 0.1)"
        this.boxSelectElement.style.pointerEvents = "none"
        this.boxSelectElement.style.display = "none"
        this.boxSelectElement.style.zIndex = "9999"
        document.body.appendChild(this.boxSelectElement)
    }

    /**
     * 鼠标按下事件处理
     */
    private handleMouseDown(event: MouseEvent): void {
        if (!this.enable) {
            return
        }

        if (event.button !== 0) {
            return // 只处理左键
        }

        // 如果Ctrl键按下，阻止事件传播到控制器
        if (this.isCtrlPressed) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
        }

        this.updateMousePosition(event)

        // 只有在Ctrl键按下时才进行框选，否则进行普通拾取
        if (this.isCtrlPressed) {
            this.startBoxSelection(event)
        } else {
            this.performRaycastPick(event)
        }
    }

    /**
     * 鼠标移动事件处理
     */
    private handleMouseMove(event: MouseEvent): void {
        // 如果Ctrl键按下，阻止事件传播到控制器
        if (this.isCtrlPressed) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
        }

        this.updateMousePosition(event)

        if (this.isBoxSelecting) {
            this.updateBoxSelection(event)
        } else if (!this.isCtrlPressed) {
            // 只有在非Ctrl模式下才进行悬停检测
            // this.performHoverDetection(event)
        }

        // 更新调试射线
        if (this.debugEnabled && !this.isCtrlPressed) {
            this.updateDebugRay()
        }
    }

    /**
     * 鼠标抬起事件处理
     */
    private handleMouseUp(event: MouseEvent): void {
        // 如果Ctrl键按下，阻止事件传播到控制器
        if (this.isCtrlPressed) {
            event.preventDefault()
            event.stopPropagation()
            event.stopImmediatePropagation()
        }

        if (this.isBoxSelecting) {
            this.finishBoxSelection(event)
        }
    }

    /**
     * 键盘按下事件处理
     */
    private handleKeyDown(event: KeyboardEvent): void {
        if (event.code === "ControlLeft" || event.code === "ControlRight") {
            if (!this.isCtrlPressed) {
                this.isCtrlPressed = true
                // 进入框选准备模式，彻底禁用控制器
                this.disableController()
                // 发送框选模式开启事件
                this.emitPickEvent("box-select-mode-enabled", {
                    timestamp: Date.now(),
                })
            }
        }
        if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
            this.isShiftPressed = true
        }
        if (event.code === "Escape" && this.isBoxSelecting) {
            this.cancelBoxSelection()
        }
    }

    /**
     * 键盘抬起事件处理
     */
    private handleKeyUp(event: KeyboardEvent): void {
        if (event.code === "ControlLeft" || event.code === "ControlRight") {
            if (this.isCtrlPressed) {
                this.isCtrlPressed = false

                // 如果正在框选，先完成框选
                if (this.isBoxSelecting && this.boxSelectArea) {
                    // 创建一个模拟的mouseup事件来完成框选
                    const mockEvent = new MouseEvent("mouseup", {
                        clientX: this.boxSelectArea.endX,
                        clientY: this.boxSelectArea.endY,
                        button: 0,
                    })
                    this.finishBoxSelection(mockEvent)
                }

                // 退出框选模式，恢复控制器
                this.enableController()
                // 发送框选模式关闭事件
                this.emitPickEvent("box-select-mode-disabled", {
                    timestamp: Date.now(),
                })
            }
        }
        if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
            this.isShiftPressed = false
        }
    }

    /**
     * 更新鼠标标准化坐标
     */
    private updateMousePosition(event: MouseEvent): void {
        const controlLayer = this.renderer?.domElement
        if (!controlLayer) return

        const rect = controlLayer.getBoundingClientRect()
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    /**
     * 执行射线投射拾取
     */
    private performRaycastPick(event: MouseEvent): void {
        if (!this.camera || !this.scene) return

        // 设置射线
        this.raycaster.setFromCamera(this.mouse, this.camera)

        // 设置射线参数
        if (this.config.maxDistance !== Infinity) {
            this.raycaster.far = this.config.maxDistance
        }

        // 获取拾取目标
        const targets = this.getPickableObjects()
        const intersects = this.raycaster.intersectObjects(targets, this.config.recursive)

        if (intersects.length>0) {
            // 过滤结果
            const filteredResults = this.filterIntersections(intersects)

            if (filteredResults.length > 0 && this.debugEnabled) {
                // 发送拾取事件 - 只包含3D场景信息
                this.emitPickEvent("object-picked", {
                    results: filteredResults.map(result => ({
                        objectId: result.object.id,
                        objectName: this.getModelName(result.object),
                        objectType: result.objectType,
                        object: result.object,
                        worldPosition: result.point,
                        localPosition: result.localPoint,
                        distance: result.distance,
                        normal: result.normal,
                        uv: result.uv ? [result.uv.x, result.uv.y] : undefined,
                        materialName: result.materialName,
                        geometryType: result.geometryType,
                        faceIndex: result.faceIndex,
                        instanceId: result.instanceId,
                        worldMatrix: result.worldMatrix,
                        boundingBox: result.boundingBox
                            ? {
                                min: result.boundingBox.min,
                                max: result.boundingBox.max,
                            }
                            : undefined,
                        objectList:
                            result.objectList?.map(obj => ({
                                id: obj.id,
                                name: this.getModelName(obj),
                                type: obj.type,
                            })) || [], // 添加对象列表信息
                    })),
                    selectedObjectId: filteredResults[0].object.id,
                    selectedObjectName: this.getModelName(filteredResults[0].object),
                    pickMode: this.isCtrlPressed ? "box-select-mode" : this.config.mode,
                    timestamp: Date.now(),
                    objectList: filteredResults.map(result => ({
                        id: result.object.id,
                        name: this.getModelName(result.object),
                        type: result.object.type,
                    })), // 在事件根级别添加对象列表
                    // 点击到的三维场景实际位置：三维场景坐标系
                    mousePosition: {
                        x: filteredResults[0].point.x,
                        y: filteredResults[0].point.y,
                        z: filteredResults[0].point.z,
                    },
                    screenPosition: {
                        x: event.clientX,
                        y: event.clientY,
                    },
                })
                // 处理选择和高亮
                this.handlePickResults(filteredResults, event)
            } else {
                if (this.debugEnabled) {
                    console.log("🎯 点击了空白区域")
                } else {
                    console.log(filteredResults)
                }
                // 在非Ctrl状态下清空选择和高亮
                if (!this.isCtrlPressed) {
                    this.clearSelection()
                    eventBus.emit("Highlight-Delete")
                }
            }

            // 如果是点集模式，记录当前拾取点
            if (this.getPickMode() == PickMode.LINE) {
                if (filteredResults.length > 0) {
                    const currentPoint = filteredResults[0].point
                    this.linePoints.push(currentPoint)

                    // 发送点集更新事件
                    this.emitPickEvent("line-points-updated", {
                        point: currentPoint,
                        linePoints: this.linePoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
                        timestamp: Date.now(),
                    })
                    console.log({
                        point: currentPoint,
                        linePoints: this.linePoints.map(p => ({ x: p.x, y: p.y, z: p.z })),
                    })
                }
            }
        }
    }

    /**
     * 检查物体及其整个父级链是否可见
     * @param object 要检查的物体
     * @returns 如果物体及其所有父级都可见则返回true
     */
    private isObjectFullyVisible(object: THREE.Object3D): boolean {
        let current = object
        while (current) {
            if (!current.visible) {
                return false
            }
            current = current.parent!
        }
        return true
    }

    /**
     * 获取可拾取的物体列表
     */
    private getPickableObjects(): THREE.Object3D[] {
        if (!this.scene) return []
        const objects: THREE.Object3D[] = []

        this.scene.traverse(child => {
            // 跳过不可见物体（检查整个父级链）
            if (!this.isObjectFullyVisible(child)) return

            // 判断是否是可拾取类型
            if (
                child instanceof THREE.Mesh ||
                child instanceof THREE.Line ||
                child instanceof THREE.Points ||
                child instanceof THREE.Sprite
            ) {
                objects.push(child)
            }
        })

        return objects
    }

    /**
     * 过滤交点结果
     */
    private filterIntersections(intersects: THREE.Intersection[]): PickResult[] {
        let results: PickResult[] = intersects.map(intersect => {
            const obj = intersect.object
            const isMesh = obj.type === "Mesh" || obj.type === "SkinnedMesh"
            const isInstancedMesh = obj.type === "InstancedMesh"
            const mesh = isMesh ? (obj as THREE.Mesh) : null
            const instancedMesh = isInstancedMesh ? (obj as THREE.InstancedMesh) : null

            // 计算包围盒
            let boundingBox: THREE.Box3 | undefined
            if (mesh?.geometry) {
                if (!mesh.geometry.boundingBox) {
                    mesh.geometry.computeBoundingBox()
                }
                boundingBox = mesh.geometry.boundingBox || undefined
            }

            // 获取材质名称
            let materialName: string | undefined
            if (mesh?.material) {
                if (Array.isArray(mesh.material)) {
                    materialName = mesh.material[0]?.name
                } else {
                    materialName = mesh.material.name
                }
            }

            return {
                object: obj,
                point: intersect.point,
                localPoint: intersect.point.clone(),
                distance: intersect.distance,
                face: intersect.face || undefined,
                faceIndex: intersect.faceIndex,
                uv: intersect.uv,
                normal: intersect.face?.normal,
                instanceId: intersect.instanceId, // 使用intersect提供的instanceId
                objectType: obj.type,
                materialName: materialName,
                geometryType: mesh?.geometry?.type || (obj as any).geometry?.type,
                worldMatrix: obj.matrixWorld.clone(),
                boundingBox: boundingBox,
                objectList: intersects.map(intersect => intersect.object), // 添加所有拾取到的对象列表
            }
        })

        // 距离过滤
        if (this.config.maxDistance !== Infinity) {
            results = results.filter(result => result.distance <= this.config.maxDistance)
        }

        // 可见性过滤（检查整个父级链）
        for (let i = 0; i < results.length; i++) {
            if (!this.isObjectFullyVisible(results[i].object)) {
                results.splice(i, 1)
                i--
            }
        }

        // 排序
        if (this.config.sortByDistance) {
            results.sort((a, b) => a.distance - b.distance)
        }
        if (this.debugEnabled) {
            return [results[0]]
        }

        return results
    }

    /**
     * 处理拾取结果
     */
    private handlePickResults(results: PickResult[], event: MouseEvent): void {
        // 可见性过滤（检查整个父级链）
        for (let i = 0; i < results.length; i++) {
            if (!this.isObjectFullyVisible(results[i].object)) {
                results.splice(i, 1)
                i--
            }
        }

        const closestResult = results[0]

        // 只在非Ctrl键状态下处理拾取，Ctrl键用于框选模式
        if (!this.isCtrlPressed) {
            // 检测双击
            const currentTime = Date.now()
            const isDoubleClick =
                this.lastClickedObject === closestResult.object &&
                currentTime - this.lastClickTime < this.doubleClickDelay

            if (isDoubleClick) {
                // 双击事件：尝试打开建筑
                if (this.isBuildingObject(closestResult.object)) {
                    this.toggleBuilding(closestResult.object)

                    // 发送双击建筑事件
                    this.emitPickEvent("building-double-clicked", {
                        object: {
                            id: closestResult.object.id,
                            name: closestResult.object.name,
                            type: closestResult.object.type,
                        },
                        buildingMode: this.buildingMode,
                        timestamp: currentTime,
                    })
                }

                // 重置双击状态
                this.lastClickTime = 0
                this.lastClickedObject = null
            } else {
                // 没有拾取到物体，检查是否是空白区域
                if (this.isPickEmptyArea(results)) {
                    // 发送空白区域点击事件
                    this.emitPickEvent("emptyClick", {
                        mousePosition: {
                            x: this.mouse.x,
                            y: this.mouse.y,
                        },
                        screenPosition: {
                            x: event.clientX,
                            y: event.clientY,
                        },
                        timestamp: Date.now(),
                    })
                    this.clearSelection()
                    eventBus.emit("Highlight-Delete")
                } else {

                    if (this.isPickedDevice(results)&&this.highLight) {
                        // 单击事件：正常选中和高亮
                        this.highlightObjectWithOutline(closestResult.object)
                    }
                    this.selectSingleObject(closestResult.object)
                }

                // 更新双击检测状态
                this.lastClickTime = currentTime
                this.lastClickedObject = closestResult.object
            }
        }
        // 如果Ctrl键按下，这里不处理选择，因为Ctrl键用于框选模式

        // console.log("🎯 拾取成功!", {
        //     objectName: this.getModelName(closestResult.object),
        //     objectType: closestResult.objectType,
        //     worldPosition: closestResult.point,
        //     distance: closestResult.distance.toFixed(2),
        //     results: results.map(result => ({
        //         objectId: result.object.id,
        //         objectName: this.getModelName(result.object),
        //         objectType: result.objectType,
        //         object: result.object,
        //         worldPosition: result.point,
        //         localPosition: result.localPoint,
        //         distance: result.distance,
        //         normal: result.normal,
        //         uv: result.uv ? [result.uv.x, result.uv.y] : undefined,
        //         materialName: result.materialName,
        //         geometryType: result.geometryType,
        //         faceIndex: result.faceIndex,
        //         instanceId: result.instanceId,
        //         worldMatrix: result.worldMatrix,
        //         boundingBox: result.boundingBox
        //             ? {
        //                 min: result.boundingBox.min,
        //                 max: result.boundingBox.max,
        //             }
        //             : undefined,
        //     })),
        //     selectedObjectId: closestResult.object.id,
        //     selectedObjectName: this.getModelName(closestResult.object),
        //     pickMode: this.config.mode,
        //     timestamp: Date.now(),
        // })

        // this.emitPickEvent("object-selected", {
        //     objectName: this.getModelName(closestResult.object),
        //     objectType: closestResult.objectType,
        //     worldPosition: closestResult.point,
        //     distance: closestResult.distance.toFixed(2),
        //     results: results.map(result => ({
        //         objectId: result.object.id,
        //         objectName: this.getModelName(result.object),
        //         objectType: result.objectType,
        //         object: result.object,
        //         worldPosition: result.point,
        //         localPosition: result.localPoint,
        //         distance: result.distance,
        //         normal: result.normal,
        //         uv: result.uv ? [result.uv.x, result.uv.y] : undefined,
        //         materialName: result.materialName,
        //         geometryType: result.geometryType,
        //         faceIndex: result.faceIndex,
        //         instanceId: result.instanceId,
        //         worldMatrix: result.worldMatrix,
        //         boundingBox: result.boundingBox
        //             ? {
        //                   min: result.boundingBox.min,
        //                   max: result.boundingBox.max,
        //               }
        //             : undefined,
        //     })),
        //     selectedObjectId: closestResult.object.id,
        //     selectedObjectName: this.getModelName(closestResult.object),
        //     pickMode: this.config.mode,
        //     timestamp: Date.now(),
        // })
    }

    /**
     * 开始框选
     */
    private startBoxSelection(event: MouseEvent): void {
        this.isBoxSelecting = true

        // 控制器已经在Ctrl键按下时被禁用，这里不需要重复处理
        console.log("📦 开始框选操作")

        const rect = this.renderer?.domElement.getBoundingClientRect()
        if (!rect) return

        this.boxSelectArea = {
            startX: event.clientX - rect.left,
            startY: event.clientY - rect.top,
            endX: event.clientX - rect.left,
            endY: event.clientY - rect.top,
        }

        if (this.boxSelectElement) {
            this.boxSelectElement.style.display = "block"
            this.updateBoxSelectDisplay()
        }
    }

    /**
     * 更新框选
     */
    private updateBoxSelection(event: MouseEvent): void {
        if (!this.boxSelectArea) return

        const rect = this.renderer?.domElement.getBoundingClientRect()
        if (!rect) return

        this.boxSelectArea.endX = event.clientX - rect.left
        this.boxSelectArea.endY = event.clientY - rect.top

        this.updateBoxSelectDisplay()
    }

    /**
     * 更新框选显示
     */
    private updateBoxSelectDisplay(): void {
        if (!this.boxSelectElement || !this.boxSelectArea) return

        const left = Math.min(this.boxSelectArea.startX, this.boxSelectArea.endX)
        const top = Math.min(this.boxSelectArea.startY, this.boxSelectArea.endY)
        const width = Math.abs(this.boxSelectArea.endX - this.boxSelectArea.startX)
        const height = Math.abs(this.boxSelectArea.endY - this.boxSelectArea.startY)

        const rect = this.renderer?.domElement.getBoundingClientRect()
        if (!rect) return

        this.boxSelectElement.style.left = `${rect.left + left}px`
        this.boxSelectElement.style.top = `${rect.top + top}px`
        this.boxSelectElement.style.width = `${width}px`
        this.boxSelectElement.style.height = `${height}px`
    }

    /**
     * 完成框选
     */
    private finishBoxSelection(event: MouseEvent): void {
        if (!this.boxSelectArea) return

        // 计算框选区域内的物体
        const objectsInBox = this.getObjectsInBox(this.boxSelectArea)

        // 处理选择（不再考虑Ctrl键状态，因为Ctrl键控制框选模式本身）
        this.clearSelection()
        objectsInBox.forEach(obj => this.addToSelection(obj))

        // 隐藏框选元素
        if (this.boxSelectElement) {
            this.boxSelectElement.style.display = "none"
        }

        this.isBoxSelecting = false
        this.boxSelectArea = null

        // 控制器将在Ctrl键抬起时恢复，这里不需要处理

        // 发送框选事件
        this.emitPickEvent("box-select-finished", {
            selectedObjects: Array.from(this.selectedObjects).map(obj => ({
                id: obj.id,
                name: this.getModelName(obj),
                type: obj.type,
                position: obj.position,
                rotation: obj.rotation,
                scale: obj.scale,
            })),
            selectedCount: this.selectedObjects.size,
            timestamp: Date.now(),
        })

        if (this.selectedObjects.size > 0) {
            console.log(
                "选中的物体详情:",
                Array.from(this.selectedObjects).map(obj => ({
                    id: obj.id,
                    name: this.getModelName(obj),
                    type: obj.type,
                    position: obj.position,
                    rotation: obj.rotation,
                    scale: obj.scale,
                })),
            )
        }
    }

    /**
     * 获取框选区域内的物体
     */
    private getObjectsInBox(box: BoxSelectArea): THREE.Object3D[] {
        if (!this.camera || !this.scene) return []

        const objects: THREE.Object3D[] = []
        const targets = this.getPickableObjects()

        // 将框选区域转换为标准化坐标
        const rect = this.renderer?.domElement.getBoundingClientRect()
        if (!rect) return []

        const left = (Math.min(box.startX, box.endX) / rect.width) * 2 - 1
        const right = (Math.max(box.startX, box.endX) / rect.width) * 2 - 1
        const top = -((Math.min(box.startY, box.endY) / rect.height) * 2 - 1)
        const bottom = -((Math.max(box.startY, box.endY) / rect.height) * 2 - 1)

        targets.forEach(obj => {
            // 获取物体的屏幕投影位置
            const worldPos = new THREE.Vector3()
            obj.getWorldPosition(worldPos)

            const screenPos = worldPos.project(this.camera!)

            // 检查是否在框选区域内
            if (screenPos.x >= left && screenPos.x <= right && screenPos.y >= bottom && screenPos.y <= top) {
                objects.push(obj)
            }
        })

        return objects
    }

    /**
     * 悬停检测
     */
    private performHoverDetection(event: MouseEvent): void {
        if (!this.camera || !this.scene) return

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const targets = this.getPickableObjects()
        const intersects = this.raycaster.intersectObjects(targets, this.config.recursive)

        const newHoveredObject = intersects.length > 0 ? intersects[0].object : null

        if (newHoveredObject !== this.hoveredObject) {
            // 发送悬停变化事件 - 只包含3D场景信息
            this.emitPickEvent("hover-changed", {
                previousObject: this.hoveredObject
                    ? {
                          id: this.hoveredObject.id,
                          name: this.hoveredObject.name,
                          type: this.hoveredObject.type,
                      }
                    : null,
                currentObject: newHoveredObject
                    ? {
                          id: newHoveredObject.id,
                          name: newHoveredObject.name,
                          type: newHoveredObject.type,
                          position: intersects[0].point,
                          distance: intersects[0].distance,
                      }
                    : null,
                timestamp: Date.now(),
            })

            this.hoveredObject = newHoveredObject
        }
    }

    /**
     * 选中单个物体
     */
    private selectSingleObject(object: THREE.Object3D): void {
        this.clearSelection()
        this.addToSelection(object)
    }

    /**
     * 添加到选中列表
     */
    public addToSelection(object: THREE.Object3D): void {
        this.selectedObjects.add(object)
        this.emitPickEvent("object-selected", { object })
    }

    /**
     * 从选中列表移除
     */
    public removeFromSelection(object: THREE.Object3D): void {
        this.selectedObjects.delete(object)
        this.emitPickEvent("object-deselected", { object })
    }

    /**
     * 清空选择
     */
    public clearSelection(): void {
        const previousSelected = Array.from(this.selectedObjects)
        this.selectedObjects.clear()

        if (previousSelected.length > 0) {
            this.emitPickEvent("selection-cleared", { previousSelected })
        }
    }

    /**
     * 更新调试射线
     */
    private updateDebugRay(): void {
        if (!this.debugRayLine || !this.camera) return

        const rayOrigin = this.raycaster.ray.origin
        const rayDirection = this.raycaster.ray.direction
        const rayEnd = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(100))

        const points = [rayOrigin, rayEnd]
        this.debugRayLine.geometry.setFromPoints(points)
    }

    /**
     * 判断对象是否应该排除高亮（天空盒、地板等）
     */
    private isExcludedFromHighlight(object: THREE.Object3D): boolean {
        const name = object.name.toLowerCase()

        // 排除天空盒
        if (name.includes("sky") || name.includes("skybox") || name.includes("dome")) {
            return true
        }

        // 排除地板
        if (name.includes("floor") || name.includes("ground") || name.includes("plane")) {
            return true
        }

        // 只对网格对象进行高亮
        if (object.type !== "Mesh" && object.type !== "SkinnedMesh") {
            return true
        }

        // 排除未显示物体
        if (object.visible === false) {
            return true
        }

        return false
    }

    /**
     * 为对象创建边框高亮
     */
    private createOutlineForObject(object: THREE.Object3D): THREE.LineSegments | null {
        if (!(object as any).geometry) {
            return null
        }

        try {
            // 创建边缘几何体
            const edgesGeometry = new THREE.EdgesGeometry((object as any).geometry)

            // 创建线段对象
            const outline = new THREE.LineSegments(edgesGeometry, this.outlineMaterial.clone())

            // 复制对象的变换
            outline.matrix.copy(object.matrixWorld)
            outline.matrixAutoUpdate = false

            return outline
        } catch (error) {
            console.warn("创建边框高亮失败:", error)
            return null
        }
    }

    /**
     * 高亮指定对象（边框泛光效果）
     */
    private highlightObjectWithOutline(object: THREE.Object3D): void {
        // 如果高亮开关关闭或物体不完全可见，直接返回
        if (!this.config.showHighlight || !this.isObjectFullyVisible(object)) {
            return
        }

        // 如果对象应该被排除，直接返回
        if (this.isExcludedFromHighlight(object)) {
            console.log("🚫 对象被排除高亮:", object.name, object.type)
            return
        }

        // 清除之前的高亮
        eventBus.emit("Highlight-Delete")

        // 创建新的边框高亮
        const outline = this.createOutlineForObject(object)
        if (!outline || !this.scene) {
            console.warn("❌ 无法为对象创建边框高亮:", object.name)
            return
        }

        // 添加到场景
        this.scene.add(outline)

        // 保存状态
        this.highlightedObject = object
        this.highlightOutline = outline

        console.log("✨ 对象高亮成功:", {
            name: this.getModelName(object),
            type: object.type,
            id: object.id,
        })
    }

    /**
     * 清除边框高亮
     */
    public clearOutlineHighlight(): void {
        if (this.highlightOutline && this.scene) {
            // 从场景移除
            this.scene.remove(this.highlightOutline)

            // 释放几何体和材质
            this.highlightOutline.geometry.dispose()
            if (this.highlightOutline.material instanceof THREE.Material) {
                this.highlightOutline.material.dispose()
            }

            this.highlightOutline = null
        }

        this.highlightedObject = null
    }

    /**
     * 发送拾取事件
     */
    public emitPickEvent(eventName: string, data: any): void {
        eventBus.emit(`mouse-pick:${eventName}`, data)
    }

    // ==================== 公共API ====================

    /**
     * 设置拾取配置
     */
    public setConfig(config: Partial<PickConfig>): void {
        this.config = { ...this.config, ...config }

        // 如果调试模式发生变化，更新调试可视化
        if (config.enableDebug !== undefined) {
            this.enableDebug(config.enableDebug)
        }
    }

    /**
     * 获取当前配置
     */
    public getConfig(): PickConfig {
        return { ...this.config }
    }

    /**
     * 设置拾取模式
     */
    public setPickMode(mode: PickMode): void {
        this.config.mode = mode
    }

    /**
     * 获取拾取模式
     */
    public getPickMode(): string {
        return this.config.mode
    }

    /**
     * 设置拾取容差
     */
    public setTolerance(tolerance: number): void {
        this.config.tolerance = Math.max(0, tolerance)
    }

    /**
     * 获取当前选中的物体
     */
    public getSelectedObjects(): THREE.Object3D[] {
        return Array.from(this.selectedObjects)
    }

    /**
     * 获取当前悬停的物体
     */
    public getHoveredObject(): THREE.Object3D | null {
        return this.hoveredObject
    }

    /**
     * 获取当前高亮的物体
     */
    public getHighlightedObject(): THREE.Object3D | null {
        return this.highlightedObject
    }

    /**
     * 手动清除高亮效果
     */
    public clearHighlight(): void {
        this.clearOutlineHighlight()
    }

    /**
     * 设置是否显示轮廓高亮
     */
    public setShowHighlight(enable: boolean): void {
        this.config.showHighlight = enable

        // 如果关闭高亮，清除当前的高亮效果
        if (!enable) {
            eventBus.emit("Highlight-Delete")
        }

        console.log(`🔆 轮廓高亮已${enable ? "启用" : "禁用"}`)
    }

    /**
     * 获取轮廓高亮开关状态
     */
    public getShowHighlight(): boolean {
        return this.config.showHighlight
    }

    /**
     * 启用/禁用调试模式
     */
    public enableDebug(enable: boolean): void {
        this.debugEnabled = enable

        if (enable && !this.debugRayLine && this.scene) {
            // 创建调试射线
            const geometry = new THREE.BufferGeometry()
            const material = new THREE.LineBasicMaterial({ color: 0xff0000 })
            this.debugRayLine = new THREE.Line(geometry, material)
            this.scene.add(this.debugRayLine)
        } else if (!enable && this.debugRayLine && this.scene) {
            // 移除调试射线
            this.scene.remove(this.debugRayLine)
            this.debugRayLine.geometry.dispose()
            ;(this.debugRayLine.material as THREE.Material).dispose()
            this.debugRayLine = null
        }
    }

    /**
     * 手动执行拾取（用于编程式拾取）
     */
    public pickAtPosition(x: number, y: number): PickResult[] {
        // 转换为标准化坐标
        const rect = this.renderer?.domElement.getBoundingClientRect()
        if (!rect) return []

        this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1
        this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1

        if (!this.camera || !this.scene) return []

        this.raycaster.setFromCamera(this.mouse, this.camera)
        const targets = this.getPickableObjects()
        const intersects = this.raycaster.intersectObjects(targets, this.config.recursive)

        return this.filterIntersections(intersects)
    }

    /**
     * 销毁插件
     */
    public destroy(): void {
        // 移除事件监听器
        const controlLayer = this.controller?.getControlLayer ? this.controller.getControlLayer() : null
        if (controlLayer) {
            const captureOptions = { capture: true }
            controlLayer.removeEventListener("mousedown", this.boundMouseDown, captureOptions)
            controlLayer.removeEventListener("mousemove", this.boundMouseMove, captureOptions)
            controlLayer.removeEventListener("mouseup", this.boundMouseUp, captureOptions)
        }

        window.removeEventListener("keydown", this.boundKeyDown)
        window.removeEventListener("keyup", this.boundKeyUp)

        // 确保控制器被正确恢复
        this.enableController()

        // 清理框选元素
        if (this.boxSelectElement) {
            document.body.removeChild(this.boxSelectElement)
            this.boxSelectElement = null
        }

        // 清理调试射线
        this.enableDebug(false)

        // 清理高亮状态
        eventBus.emit("Highlight-Delete")

        // 清理建筑状态
        if (this.buildingMode) {
            this.closeBuilding()
        }

        // 清空状态
        this.clearSelection()
        this.selectedObjects.clear()
        this.hoveredObject = null

        // 清空引用
        this.camera = null
        this.scene = null
        this.renderer = null
        this.controller = null

        console.log("🧹 MousePickPlugin 已销毁")
    }

    /**
     * 取消框选（ESC键或其他情况）
     */
    public cancelBoxSelection(): void {
        if (!this.isBoxSelecting) return

        // 隐藏框选元素
        if (this.boxSelectElement) {
            this.boxSelectElement.style.display = "none"
        }

        this.isBoxSelecting = false
        this.boxSelectArea = null

        // 恢复场景控制器
        this.enableController()
        console.log("🔓 框选取消，已恢复场景控制器")

        // 发送取消事件
        this.emitPickEvent("box-select-cancelled", {
            timestamp: Date.now(),
        })
    }

    /**
     * 彻底禁用控制器
     */
    private disableController(): void {
        if (!this.controller) return

        try {
            // 保存控制器的原始状态
            this.controllerOriginalState = {
                enabled: this.controller.enabled,
                enableRotate: this.controller.control?.enableRotate,
                enableZoom: this.controller.control?.enableZoom,
                enablePan: this.controller.control?.enablePan,
                enableDamping: this.controller.control?.enableDamping,
                autoRotate: this.controller.control?.autoRotate,
            }

            // 彻底禁用所有控制功能
            if (this.controller.enabled !== undefined) {
                this.controller.enabled = false
            }

            if (this.controller.control) {
                this.controller.control.enabled = false
                this.controller.control.enableRotate = false
                this.controller.control.enableZoom = false
                this.controller.control.enablePan = false
                this.controller.control.enableDamping = false
                this.controller.control.autoRotate = false
            }

            console.log("🔒 控制器已彻底禁用", this.controllerOriginalState)
        } catch (error) {
            console.warn("⚠️ 禁用控制器时发生错误:", error)
        }
    }

    /**
     * 启用控制器
     */
    private enableController(): void {
        if (!this.controller) return

        try {
            // 恢复控制器的原始状态
            if (this.controllerOriginalState.enabled !== undefined) {
                this.controller.enabled = this.controllerOriginalState.enabled
            }

            if (this.controller.control) {
                this.controller.control.enabled = true

                if (this.controllerOriginalState.enableRotate !== undefined) {
                    this.controller.control.enableRotate = this.controllerOriginalState.enableRotate
                }
                if (this.controllerOriginalState.enableZoom !== undefined) {
                    this.controller.control.enableZoom = this.controllerOriginalState.enableZoom
                }
                if (this.controllerOriginalState.enablePan !== undefined) {
                    this.controller.control.enablePan = this.controllerOriginalState.enablePan
                }
                if (this.controllerOriginalState.enableDamping !== undefined) {
                    this.controller.control.enableDamping = this.controllerOriginalState.enableDamping
                }
                if (this.controllerOriginalState.autoRotate !== undefined) {
                    this.controller.control.autoRotate = this.controllerOriginalState.autoRotate
                }
            }

            // 清空保存的状态
            this.controllerOriginalState = {}
        } catch (error) {
            console.warn("⚠️ 恢复控制器时发生错误:", error)
        }
    }

    /**
     * 调试控制器状态
     */
    public debugControllerState(): void {
        console.log("🔍 控制器状态调试信息:")
        console.log("- Ctrl键状态:", this.isCtrlPressed ? "按下" : "未按下")
        console.log("- 框选状态:", this.isBoxSelecting ? "进行中" : "未进行")

        if (this.controller) {
            console.log("- 控制器存在:", true)
            console.log("- 控制器enabled:", this.controller.enabled)

            if (this.controller.control) {
                console.log("- OrbitControls存在:", true)
                console.log("- OrbitControls.enabled:", this.controller.control.enabled)
                console.log("- OrbitControls.enableRotate:", this.controller.control.enableRotate)
                console.log("- OrbitControls.enableZoom:", this.controller.control.enableZoom)
                console.log("- OrbitControls.enablePan:", this.controller.control.enablePan)
            } else {
                console.log("- OrbitControls存在:", false)
            }

            const controlLayer = this.controller?.getControlLayer ? this.controller.getControlLayer() : null
            if (controlLayer) {
                console.log("- controlLayer存在:", true)
                console.log("- controlLayer.style.pointerEvents:", controlLayer.style.pointerEvents)
            } else {
                console.log("- controlLayer存在:", false)
            }
        } else {
            console.log("- 控制器存在:", false)
        }

        console.log("- 保存的原始状态:", this.controllerOriginalState)
    }

    /**
     * 检测对象是否属于建筑
     */
    private isBuildingObject(object: THREE.Object3D): boolean {
        // 定义建筑相关关键词
        const buildingKeywords = [
            "building",
            "buildings",
            "建筑",
            "构筑物",
            "楼",
            "大楼",
            "楼房",
            "house",
            "office",
            "tower",
            "mall",
            "center",
            "complex",
            "办公楼",
            "住宅楼",
            "商场",
            "中心",
            "综合体",
            "写字楼",
        ]

        // 1. 检查对象的userData是否标记为建筑模型（ResourceReaderPlugin设置的）
        let current = object
        while (current && current.type !== "Scene") {
            if (current.userData?.isBuildingModel === true) {
                return true
            }
            current = current.parent!
        }

        // 2. 检查对象名称（优先使用userData.modelName）
        const name = this.getModelName(object).toLowerCase()
        if (buildingKeywords.some(keyword => name.includes(keyword))) {
            return true
        }

        // 3. 向上遍历父对象查找建筑根节点
        let parent = object.parent
        while (parent && parent.type !== "Scene") {
            const parentName = this.getModelName(parent).toLowerCase()
            if (buildingKeywords.some(keyword => parentName.includes(keyword))) {
                return true
            }
            parent = parent.parent
        }

        return false
    }

    /**
     * 查找建筑的根对象
     */
    private findBuildingRoot(object: THREE.Object3D): THREE.Object3D | null {
        const buildingKeywords = [
            "building",
            "buildings",
            "建筑",
            "构筑物",
            "楼",
            "大楼",
            "楼房",
            "house",
            "office",
            "tower",
            "mall",
            "center",
            "complex",
            "办公楼",
            "住宅楼",
            "商场",
            "中心",
            "综合体",
            "写字楼",
        ]

        let current = object
        let buildingRoot = null

        // 向上遍历查找建筑根节点
        while (current && current.type !== "Scene") {
            // 1. 优先检查是否有建筑模型标记（ResourceReaderPlugin设置的）
            if (current.userData?.isBuildingModel === true) {
                buildingRoot = current
            }

            // 2. 检查名称关键词（优先使用userData.modelName）
            const name = this.getModelName(current).toLowerCase()
            if (buildingKeywords.some(keyword => name.includes(keyword))) {
                buildingRoot = current
            }

            current = current.parent!
        }

        return buildingRoot
    }

    /**
     * 查找建筑的外立面对象
     */
    private findBuildingFacades(buildingRoot: THREE.Object3D): THREE.Object3D[] {
        const facades: THREE.Object3D[] = []

        // 外立面关键词（包含ResourceReaderPlugin中使用的MASK关键字）
        const facadeKeywords = [
            "mask",
            "masks", // ResourceReaderPlugin中使用的外立面标识
            "facade",
            "facades",
            "外立面",
            "立面",
            "exterior",
            "wall",
            "walls",
            "curtain",
            "幕墙",
            "外墙",
            "cladding",
            "skin",
            "envelope",
            "外包围",
            "建筑表皮",
            "outer",
            "outside",
            "external",
            "facadegroup",
            "facade_group", // 可能的组名称
        ]

        buildingRoot.traverse(child => {
            const name = this.getModelName(child).toLowerCase()

            // 1. 查找外立面组（可能是由ResourceReaderPlugin创建的）
            if (child.type === "Group" && facadeKeywords.some(keyword => name.includes(keyword))) {
                facades.push(child)
                console.log(`🎯 找到外立面组: ${this.getModelName(child)} (${child.type})`)
                return // 找到外立面组，不需要继续遍历其子节点
            }

            // 2. 查找单独的外立面网格对象
            if (
                (child.type === "Mesh" || child.type === "SkinnedMesh") &&
                facadeKeywords.some(keyword => name.includes(keyword))
            ) {
                facades.push(child)
                console.log(`🎯 找到外立面网格: ${this.getModelName(child)} (${child.type})`)
            }
        })

        console.log(`🔍 外立面查找完成，共找到 ${facades.length} 个外立面对象`)
        return facades
    }

    /**
     * 隐藏建筑外立面
     */
    private hideBuildingFacades(facades: THREE.Object3D[]): void {
        facades.forEach(facade => {
            facade.visible = false
            this.facades.push(facade)
        })
    }

    /**
     * 显示建筑外立面
     */
    private showBuildingFacades(): void {
        this.facades.forEach(facade => {
            facade.visible = true
        })
        this.facades = []
    }

    /**
     * 打开建筑，进入建筑控制模式
     */
    public openBuilding(targetObject?: THREE.Object3D): void {
        let objectToCheck = targetObject

        // 如果没有指定对象，使用当前选中的第一个对象
        if (!objectToCheck && this.selectedObjects.size > 0) {
            objectToCheck = Array.from(this.selectedObjects)[0]
        }

        // 如果还是没有对象，使用当前高亮的对象
        if (!objectToCheck && this.highlightedObject) {
            objectToCheck = this.highlightedObject
        }

        if (!objectToCheck) {
            console.warn("⚠️ 没有可操作的对象来打开建筑")
            return
        }

        // 检查对象是否属于建筑
        if (!this.isBuildingObject(objectToCheck)) {
            console.log("🚫 选中的对象不属于建筑:", objectToCheck.name)
            return
        }

        // 查找建筑根对象
        const buildingRoot = this.findBuildingRoot(objectToCheck)
        if (!buildingRoot) {
            console.warn("❌ 无法找到建筑根对象")
            return
        }

        // 如果已经有打开的建筑，先关闭它
        if (this.openedBuilding) {
            this.closeBuilding()
        }

        // 查找并隐藏外立面
        const facades = this.findBuildingFacades(buildingRoot)
        if (facades.length === 0) {
            console.warn("⚠️ 未找到建筑外立面对象")
            console.log("🔍 调试信息 - 建筑根对象结构:")
            console.log("建筑根对象名称:", buildingRoot.name)
            console.log("建筑根对象userData:", buildingRoot.userData)

            // 打印所有子对象的名称用于调试
            const childNames: string[] = []
            buildingRoot.traverse(child => {
                if (child !== buildingRoot) {
                    childNames.push(`${child.name} (${child.type})`)
                }
            })
            console.log("所有子对象:", childNames)
            return
        }

        // 隐藏外立面
        this.hideBuildingFacades(facades)

        // 更新状态
        this.openedBuilding = buildingRoot
        this.buildingMode = true

        // 发送建筑打开事件
        this.emitPickEvent("building-opened", {
            building: {
                id: buildingRoot.id,
                name: this.getModelName(buildingRoot),
                type: buildingRoot.type,
            },
            facades: facades.map(facade => ({
                id: facade.id,
                name: this.getModelName(facade),
                type: facade.type,
            })),
            timestamp: Date.now(),
        })

        console.log("🏢 建筑已打开:", {
            building: this.getModelName(buildingRoot),
            facades: facades.length,
        })
    }

    /**
     * 关闭建筑，退出建筑控制模式
     */
    public closeBuilding(): void {
        if (!this.buildingMode || !this.openedBuilding) {
            console.log("📋 当前没有打开的建筑")
            return
        }

        // 显示之前隐藏的外立面
        this.showBuildingFacades()

        // 发送建筑关闭事件
        this.emitPickEvent("building-closed", {
            building: {
                id: this.openedBuilding.id,
                name: this.getModelName(this.openedBuilding),
                type: this.openedBuilding.type,
            },
            timestamp: Date.now(),
        })

        console.log("🏢 建筑已关闭:", this.getModelName(this.openedBuilding))

        // 重置状态
        this.openedBuilding = null
        this.buildingMode = false
    }

    /**
     * 获取当前打开的建筑
     */
    public getOpenedBuilding(): THREE.Object3D | null {
        return this.openedBuilding
    }

    /**
     * 检查是否处于建筑模式
     */
    public isBuildingMode(): boolean {
        return this.buildingMode
    }

    /**
     * 切换建筑模式（打开/关闭）
     */
    public toggleBuilding(targetObject?: THREE.Object3D): void {
        if (this.buildingMode) {
            this.closeBuilding()
        } else {
            this.openBuilding(targetObject)
        }
    }

    /**
     * 获取对象的模型名称（优先从userData.modelName读取）
     */
    private getModelName(object: THREE.Object3D): string {
        if (!object) return "未命名模型"

        // 优先使用userData.modelName
        if (object.userData && object.userData.modelName) {
            return object.userData.modelName
        }

        // 向后兼容：如果userData.modelName不存在，使用object.name
        return object.name || "未命名模型"
    }

    // 检测是不是拾取到空白区域
    private isPickEmptyArea(results: PickResult[]): boolean {
        // 如果拾取结果里面只包含天空盒和地板则认定为拾取到空白区域
        for (const result of results) {
            if (result.object.name !== "skyBox" && result.object.name !== "ground") {
                return false
            }
        }
        return true
    }

    // isPickedDevice
    private isPickedDevice(results: PickResult[]): boolean {
        // 检查对象名称是否符合 "MAIN_BUILDING_nF_K505_设备名" 的命名方式
        // 其中 n 为数字，K（或其它大写字母）后面接三位数字，最后为设备名
        const devicePattern = /^MAIN_BUILDING_\d+F_[A-Z]\d{3}_.+$/;
        for (const result of results) {
            if (devicePattern.test(result.object.name)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取当前的点集
     */
    public getLinePoints(): THREE.Vector3[] {
        return this.linePoints
    }

    /**
     * 清空点集
     */
    public clearLinePoints(): void {
        this.linePoints = []
    }
}

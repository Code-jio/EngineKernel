// 轨道控制器插件
import { THREE, BasePlugin } from "../basePlugin"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import eventBus from '../../eventBus/eventBus'

export type OrbitControlPluginOptions = {
    damping?: boolean
    dampingFactor?: number
    minDistance?: number
    maxDistance?: number
    minPolarAngle?: number
    maxPolarAngle?: number
    minAzimuthAngle?: number
    maxAzimuthAngle?: number
    maxZoom?: number
    minZoom?: number
    boundaryRadius?: number // 移动边界半径
    enableMouseDirectedZoom?: boolean // 启用鼠标指向缩放，默认为true
    mouseZoomSensitivity?: number // 鼠标缩放敏感度，默认为1.0
}

export class BaseControls extends BasePlugin {
    private control: OrbitControls
    private camera: THREE.PerspectiveCamera
    private boundaryRadius: number = 20000 // 默认边界半径
    private controlLayer: HTMLElement
    private scene: THREE.Scene | null = null
    
    // 鼠标指向缩放相关 - 默认启用
    private mouseDirectedZoomEnabled: boolean = true
    private mousePosition: THREE.Vector2 = new THREE.Vector2()
    private raycaster: THREE.Raycaster = new THREE.Raycaster()
    private mouseZoomSensitivity: number = 1.0
    private isZooming: boolean = false
    
    /**
     * 获取默认配置选项
     */
    static getDefaultOptions(): OrbitControlPluginOptions {
        return {
            minDistance: 1,
            maxDistance: 16000, // 80% of default boundaryRadius (20000)
            minPolarAngle: 0.1,
            maxPolarAngle: Math.PI - 0.1,
            boundaryRadius: 20000,
            enableMouseDirectedZoom: true, // 默认启用鼠标指向缩放
            mouseZoomSensitivity: 1.0,
            damping: false,
            dampingFactor: 0.05
        }
    }
    
    constructor(meta:any) {
        super(meta)
        
        // 获取相机和场景
        this.camera = meta.userData.camera as THREE.PerspectiveCamera
        this.scene = meta.userData.scene as THREE.Scene || null
        
        if (!this.camera) {
            throw new Error("轨道控制器需要相机实例")
        }

        // 解析用户配置，设置默认值
        const userOptions = meta.userData.orbitControlOptions || {}
        
        // 设置鼠标指向缩放的默认值和用户配置
        this.mouseDirectedZoomEnabled = userOptions.enableMouseDirectedZoom !== false // 默认为true，只有明确设置为false才禁用
        this.mouseZoomSensitivity = userOptions.mouseZoomSensitivity || 1.0
        this.boundaryRadius = userOptions.boundaryRadius || 20000

        // 创建控制器专用层
        let element = document.createElement('div');
        element.className = 'base-control-layer'
        element.style.position = 'fixed';
        element.style.top = '0';
        element.style.left = '0';
        element.style.width = window.innerWidth + 'px';
        element.style.height = window.innerHeight + 'px';
        element.style.pointerEvents = 'auto';
        // element.style.zIndex = '0'; // 在CSS3D层下面
        element.style.background = 'transparent';

        // 将控制层添加到DOM
        if (meta.userData.domElement) {
            this.controlLayer = meta.userData.domElement
        }else{
            this.controlLayer = element
            document.body.appendChild(this.controlLayer);
        }

        this.control = new OrbitControls(this.camera, this.controlLayer)
        
        // 设置默认限制（此时已经知道是否启用鼠标指向缩放）
        this.setupDefaultLimits()
        
        // 保存初始相机位置（在OrbitControls可能修改之前）
        const initialCameraPosition = this.camera.position.clone()
        const initialTargetPosition = new THREE.Vector3()
        if (meta.userData.cameraConfig?.lookAt) {
            const lookAt = meta.userData.cameraConfig.lookAt as [number, number, number]
            initialTargetPosition.set(lookAt[0], lookAt[1], lookAt[2])
        }
        
        // 监听相机变化，限制移动范围
        this.control.addEventListener("change", () => {
            this.enforceMovementBounds()
            eventBus.emit("camera-moved")
        })
        
        // 设置鼠标指向缩放（如果启用）
        if (this.mouseDirectedZoomEnabled) {
            this.setupMouseDirectedZoom()
        }
        
        // 应用其他用户配置
        if (userOptions && Object.keys(userOptions).length > 0) {
            this.configure(userOptions)
        }
        
        // 恢复初始相机位置（确保用户设置的位置生效）
        this.camera.position.copy(initialCameraPosition)
        this.control.target.copy(initialTargetPosition)
        this.control.update()
        
        console.log('🎮 轨道控制器初始化完成', {
            鼠标指向缩放: this.mouseDirectedZoomEnabled ? '✅ 启用' : '❌ 禁用',
            缩放敏感度: this.mouseZoomSensitivity,
            边界半径: this.boundaryRadius,
            默认缩放: this.control.enableZoom ? '启用' : '禁用'
        })
    }
    
    /**
     * 设置鼠标指向缩放功能
     */
    private setupMouseDirectedZoom(): void {
        if (!this.mouseDirectedZoomEnabled) return
        
        // 监听鼠标移动，记录鼠标位置
        this.controlLayer.addEventListener('mousemove', (event: MouseEvent) => {
            // 将鼠标坐标转换为标准化设备坐标 (-1 到 +1)
            const rect = this.controlLayer.getBoundingClientRect()
            this.mousePosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
            this.mousePosition.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
        })
        
        // 监听滚轮事件，实现鼠标指向缩放
        this.controlLayer.addEventListener('wheel', (event: WheelEvent) => {
            if (!this.mouseDirectedZoomEnabled) return
            
            event.preventDefault()
            event.stopPropagation()
            
            this.performMouseDirectedZoom(event.deltaY)
        }, { passive: false })
        
        // 禁用OrbitControls的默认缩放，我们自己处理
        this.control.enableZoom = false
    }
    
    /**
     * 执行鼠标指向缩放
     */
    private performMouseDirectedZoom(deltaY: number): void {
        if (!this.scene) {
            console.warn('⚠️ 场景未设置，无法执行鼠标指向缩放')
            return
        }
        
        // 设置射线
        this.raycaster.setFromCamera(this.mousePosition, this.camera)
        
        // 检测与场景中物体的交点
        const intersects = this.raycaster.intersectObjects(this.scene.children, true)
        
        let targetPoint: THREE.Vector3
        
        if (intersects.length > 0) {
            // 如果鼠标指向某个物体，使用交点作为目标点
            targetPoint = intersects[0].point.clone()
        } else {
            // 如果没有交点，计算射线与xOz平面（y=0）的交点
            targetPoint = this.getXOZPlaneIntersection()
        }
        
        // 计算缩放方向和距离
        const cameraPosition = this.camera.position.clone()
        const directionToTarget = new THREE.Vector3().subVectors(targetPoint, cameraPosition)
        const currentDistance = directionToTarget.length()
        
        // 计算缩放因子
        const zoomDirection = deltaY > 0 ? 1 : -1 // 正值为缩小，负值为放大
        const scaleFactor = 0.1 * this.mouseZoomSensitivity
        const distanceChange = currentDistance * scaleFactor * zoomDirection
        
        // 计算新的距离，并应用限制
        const newDistance = Math.max(
            this.control.minDistance, 
            Math.min(this.control.maxDistance, currentDistance - distanceChange)
        )
        
        // 只有距离发生实际变化时才移动相机
        if (Math.abs(newDistance - currentDistance) > 0.01) {
            // 计算新的相机位置（沿着当前视线方向移动）
            const direction = directionToTarget.normalize()
            const newCameraPosition = new THREE.Vector3().subVectors(targetPoint, direction.multiplyScalar(newDistance))
            
            // 检查边界限制
            if (newCameraPosition.length() <= this.boundaryRadius) {
                // 只移动相机位置，不修改target以避免旋转
                this.camera.position.copy(newCameraPosition)
                
                // 更新控制器，但不触发额外的target变化
                this.control.update()
                
                // 触发相机移动事件
                eventBus.emit("camera-moved")
            }
        }
    }
    
    /**
     * 计算射线与xOz平面的交点
     */
    private getXOZPlaneIntersection(): THREE.Vector3 {
        // 创建xOz平面（y=0平面）
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        
        // 计算射线与平面的交点
        const intersectionPoint = new THREE.Vector3()
        const intersection = this.raycaster.ray.intersectPlane(plane, intersectionPoint)
        
        if (intersection) {
            return intersection
        } else {
            // 如果射线与平面平行，返回一个默认点
            // 在相机前方一定距离的xOz平面上
            const distance = this.camera.position.distanceTo(this.control.target)
            const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion)
            const point = this.camera.position.clone().add(direction.multiplyScalar(distance))
            point.y = 0 // 确保在xOz平面上
            return point
        }
    }
    
    /**
     * 获取鼠标在3D空间中的投射点
     */
    private getMouseWorldPosition(distance: number = 100): THREE.Vector3 {
        this.raycaster.setFromCamera(this.mousePosition, this.camera)
        return this.raycaster.ray.at(distance, new THREE.Vector3())
    }
    
    private setupDefaultLimits() {
        // 距离限制
        this.control.minDistance = 1
        this.control.maxDistance = this.boundaryRadius * 0.8 // 80%的边界半径
        
        // 极角限制（垂直旋转）- 防止翻转
        this.control.minPolarAngle = 0.1 // 接近但不到顶部
        this.control.maxPolarAngle = Math.PI - 0.1 // 接近但不到底部
        
        // // 启用阻尼
        // this.control.enableDamping = false
        // this.control.dampingFactor = 0.05
        
        // 启用平移但限制范围
        this.control.enablePan = true
        this.control.panSpeed = 1.0
        this.control.keyPanSpeed = 7.0
        
        // 根据鼠标指向缩放设置决定OrbitControls的缩放行为
        // 如果启用了鼠标指向缩放，则禁用OrbitControls的默认缩放
        this.control.enableZoom = !this.mouseDirectedZoomEnabled
        this.control.zoomSpeed = 1.0
        
        console.log('🔧 控制器默认限制已设置', {
            距离范围: `${this.control.minDistance} - ${this.control.maxDistance}`,
            极角范围: `${this.control.minPolarAngle.toFixed(2)} - ${this.control.maxPolarAngle.toFixed(2)}`,
            启用平移: this.control.enablePan,
            OrbitControls缩放: this.control.enableZoom ? '启用' : '禁用（使用鼠标指向缩放）'
        })
    }
    
    private enforceMovementBounds() {
        const position = this.camera.position
        const distanceFromCenter = position.length()
        
        // 如果相机距离中心超过边界半径，强制拉回
        if (distanceFromCenter > this.boundaryRadius) {
            position.normalize().multiplyScalar(this.boundaryRadius)
            this.camera.position.copy(position)
            
            // 更新控制器状态
            this.control.target.copy(new THREE.Vector3(0, 0, 0))
            this.control.update()
            
            console.warn(`相机位置被限制在边界内，距离: ${distanceFromCenter.toFixed(2)}`)
        }
        
        // 限制target也在合理范围内
        const targetDistance = this.control.target.length()
        const maxTargetDistance = this.boundaryRadius * 0.3
        if (targetDistance > maxTargetDistance) {
            this.control.target.normalize().multiplyScalar(maxTargetDistance)
        }
    }

    public update() {
        if (!this.control) return
        eventBus.on("update", () => {
            this.control.update()
        })
    }
    
    /**
     * 初始化事件监听器
     */
    public initializeEventListeners() {
        // 监听场景就绪事件
        eventBus.on("scene-ready", (data: any) => {
            // 更新场景引用以支持鼠标指向缩放
            if (data.scene && !this.scene) {
                this.scene = data.scene
                console.log('🎯 场景引用已更新，鼠标指向缩放功能就绪')
            }
        })
        
        // 监听窗口大小变化
        window.addEventListener("resize", () => {
            // 窗口大小变化时可能需要更新控制器
            this.control.update()
            this.controlLayer.style.width = window.innerWidth + 'px';
            this.controlLayer.style.height = window.innerHeight + 'px';
        })
        
        // console.log("✅ OrbitControls事件监听器已初始化")
    }
    
    /**
     * 启用/禁用鼠标指向缩放
     */
    public setMouseDirectedZoom(enabled: boolean): void {
        const wasEnabled = this.mouseDirectedZoomEnabled
        this.mouseDirectedZoomEnabled = enabled
        
        // 切换OrbitControls的默认缩放
        this.control.enableZoom = !enabled
        
        if (enabled && !wasEnabled) {
            // 从禁用状态切换到启用状态
            this.setupMouseDirectedZoom()
            console.log('🎯 鼠标指向缩放: ✅ 启用 (事件监听器已添加)')
        } else if (!enabled && wasEnabled) {
            // 从启用状态切换到禁用状态
            this.removeMouseDirectedZoomListeners()
            console.log('🎯 鼠标指向缩放: ❌ 禁用 (事件监听器已移除)')
        } else {
            console.log(`🎯 鼠标指向缩放: ${enabled ? '✅ 启用' : '❌ 禁用'} (状态未改变)`)
        }
        
        console.log(`🔧 OrbitControls默认缩放: ${this.control.enableZoom ? '启用' : '禁用'}`)
    }
    
    /**
     * 移除鼠标指向缩放的事件监听器
     */
    private removeMouseDirectedZoomListeners(): void {
        // 注意：这里需要保存监听器引用才能正确移除
        // 暂时重新创建控制层来清理所有事件
        const newLayer = this.controlLayer.cloneNode(false) as HTMLElement
        this.controlLayer.parentNode?.replaceChild(newLayer, this.controlLayer)
        this.controlLayer = newLayer
        
        // 重新设置OrbitControls的DOM元素
        this.control.domElement = this.controlLayer
    }
    
    /**
     * 设置鼠标缩放敏感度
     */
    public setMouseZoomSensitivity(sensitivity: number): void {
        this.mouseZoomSensitivity = Math.max(0.1, Math.min(5.0, sensitivity))
        console.log(`🎚️ 鼠标缩放敏感度设置为: ${this.mouseZoomSensitivity}`)
    }
    
    /**
     * 获取Three.js OrbitControls实例
     */
    public getControl(): OrbitControls | null {
        if (!this.control) {
            console.warn("⚠️ OrbitControls实例不存在")
            return null
        }
        return this.control
    }
    
    /**
     * 检查控制器是否已初始化且可用
     */
    public isControlReady(): boolean {
        return !!(this.control && this.camera && this.controlLayer)
    }
    
    /**
     * 获取控制器详细状态信息
     */
    public getControlStatus(): any {
        if (!this.control) {
            return {
                ready: false,
                error: "OrbitControls实例不存在"
            }
        }
        
        return {
            ready: true,
            enabled: this.control.enabled,
            enableZoom: this.control.enableZoom,
            enableRotate: this.control.enableRotate,
            enablePan: this.control.enablePan,
            enableDamping: this.control.enableDamping,
            dampingFactor: this.control.dampingFactor,
            minDistance: this.control.minDistance,
            maxDistance: this.control.maxDistance,
            mouseDirectedZoom: {
                enabled: this.mouseDirectedZoomEnabled,
                sensitivity: this.mouseZoomSensitivity,
                pickingMode: "xOz平面优先", // 说明拾取模式
                fallbackPlane: "xOz平面 (y=0)"
            },
            domElement: this.control.domElement && 'tagName' in this.control.domElement ? this.control.domElement.tagName : null,
            camera: {
                position: {
                    x: this.camera.position.x,
                    y: this.camera.position.y,
                    z: this.camera.position.z
                },
                target: {
                    x: this.control.target.x,
                    y: this.control.target.y,
                    z: this.control.target.z
                },
                distanceFromCenter: this.getDistanceFromCenter(),
                distanceToTarget: this.camera.position.distanceTo(this.control.target)
            },
            boundary: {
                radius: this.boundaryRadius,
                withinBounds: this.camera.position.length() <= this.boundaryRadius
            },
            mouse: {
                position: {
                    x: this.mousePosition.x,
                    y: this.mousePosition.y
                },
                normalized: true
            },
            scene: {
                available: !!this.scene,
                childrenCount: this.scene ? this.scene.children.length : 0
            }
        }
    }
    
    // 设置边界半径
    public setBoundaryRadius(radius: number) {
        this.boundaryRadius = radius
        this.control.maxDistance = radius * 0.8
        console.log(`相机移动边界设置为: ${radius}`)
    }
    
    // 获取当前相机到中心的距离
    public getDistanceFromCenter(): number {
        return this.camera.position.length()
    }
    
    // 重置相机到安全位置
    public resetToSafePosition() {
        const safeDistance = this.boundaryRadius * 0.3
        this.camera.position.set(safeDistance, safeDistance, safeDistance)
        this.control.target.set(0, 0, 0)
        this.control.update()
    }
    
    // 强制设置相机位置
    public setCameraPosition(x: number, y: number, z: number, targetX: number = 0, targetY: number = 0, targetZ: number = 0) {
        this.camera.position.set(x, y, z)
        this.control.target.set(targetX, targetY, targetZ)
        this.control.update()
    }

    public configure(options: OrbitControlPluginOptions) {
        // if (options.damping !== undefined) {
        //     this.control.enableDamping = options.damping
        // }
        // if (options.dampingFactor !== undefined) {
        //     this.control.dampingFactor = options.dampingFactor
        // }
        if (options.minDistance !== undefined) {
            this.control.minDistance = options.minDistance
        }
        if (options.maxDistance !== undefined) {
            this.control.maxDistance = options.maxDistance
        }
        if (options.minPolarAngle !== undefined) {
            this.control.minPolarAngle = options.minPolarAngle
        }
        if (options.maxPolarAngle !== undefined) {
            this.control.maxPolarAngle = options.maxPolarAngle
        }
        if (options.minAzimuthAngle !== undefined) {
            this.control.minAzimuthAngle = options.minAzimuthAngle
        }
        if (options.maxAzimuthAngle !== undefined) {
            this.control.maxAzimuthAngle = options.maxAzimuthAngle
        }
        if (options.boundaryRadius !== undefined) {
            this.boundaryRadius = options.boundaryRadius
            // 更新最大距离以匹配新的边界
            this.control.maxDistance = this.boundaryRadius * 0.8
        }
        if (options.enableMouseDirectedZoom !== undefined) {
            this.setMouseDirectedZoom(options.enableMouseDirectedZoom)
        }
        if (options.mouseZoomSensitivity !== undefined) {
            this.setMouseZoomSensitivity(options.mouseZoomSensitivity)
        }
    }

    public addEventListener(event: "change", callback: () => void) {
        this.control.addEventListener(event, callback)
    }

    public destroy() {
        // 先禁用鼠标指向缩放以清理相关事件监听器
        if (this.mouseDirectedZoomEnabled) {
            this.setMouseDirectedZoom(false)
        }
        
        // 销毁OrbitControls
        this.control.dispose()
        
        // 清理控制层
        if (this.controlLayer && this.controlLayer.parentNode) {
            this.controlLayer.parentNode.removeChild(this.controlLayer)
        }
        
        // 清理raycaster引用
        this.raycaster = null as any
        this.mousePosition = null as any
        this.scene = null
        
        console.log('🧹 轨道控制器已销毁，所有资源已清理')
    }

    /**
     * 测试鼠标位置的xOz平面拾取
     */
    public testXOZPicking(mouseX: number = 0, mouseY: number = 0): any {
        // 设置测试鼠标位置
        this.mousePosition.set(mouseX, mouseY)
        this.raycaster.setFromCamera(this.mousePosition, this.camera)
        
        // 测试物体拾取
        const objectIntersects = this.scene ? this.raycaster.intersectObjects(this.scene.children, true) : []
        
        // 测试xOz平面拾取
        const xozIntersection = this.getXOZPlaneIntersection()
        
        const result = {
            mousePosition: { x: mouseX, y: mouseY },
            ray: {
                origin: this.raycaster.ray.origin.clone(),
                direction: this.raycaster.ray.direction.clone()
            },
            objectHits: objectIntersects.length,
            firstObjectHit: objectIntersects.length > 0 ? {
                point: objectIntersects[0].point.clone(),
                distance: objectIntersects[0].distance,
                object: objectIntersects[0].object.name || objectIntersects[0].object.type
            } : null,
            xozPlaneHit: {
                point: xozIntersection.clone(),
                distance: this.camera.position.distanceTo(xozIntersection)
            },
            finalTargetPoint: objectIntersects.length > 0 ? objectIntersects[0].point : xozIntersection
        }
        
        console.log('🎯 xOz平面拾取测试结果:', result)
        return result
    }
    
    /**
     * 手动测试缩放功能
     */
    public testZoom(direction: 'in' | 'out', mouseX: number = 0, mouseY: number = 0): void {
        console.log(`🔍 手动测试缩放: ${direction}, 鼠标位置: (${mouseX}, ${mouseY})`)
        
        // 设置鼠标位置
        this.mousePosition.set(mouseX, mouseY)
        
        // 模拟滚轮事件
        const deltaY = direction === 'in' ? -100 : 100
        this.performMouseDirectedZoom(deltaY)
        
        console.log('✅ 缩放测试完成')
    }
}

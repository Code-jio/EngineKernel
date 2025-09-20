// 轨道控制器类
import { THREE } from "../basePlugin"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import eventBus from '../../eventBus/eventBus'

export type OrbitControlOptions = {
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
}

interface CameraFlyToOptions {
    position: THREE.Vector3,
    lookAt?: THREE.Vector3,
    duration?: number,
    delay?: number,
    autoLookAt?: boolean,
    easing?: (amount: number) => number,
    onUpdate?: () => void,
    onComplete?: () => void
}

export class BaseControls {
    public control: OrbitControls
    public camera: THREE.PerspectiveCamera | THREE.OrthographicCamera
    public boundaryRadius: number = 20000 // 默认边界半径
    public controlLayer: HTMLElement
    public currentMode: '2D' | '3D' = '3D' // 当前相机模式
    public saved3DLimits: any = null // 保存3D模式的限制

    constructor(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, domElement?: HTMLElement, options?: OrbitControlOptions) {

        // 获取相机
        this.camera = camera
        if (!this.camera) {
            throw new Error("轨道控制器需要相机实例")
        }

        // 创建控制器专用层
        if (domElement) {
            this.controlLayer = domElement
        } else {
            let element = document.createElement('div');
            element.className = 'base-control-layer'
            element.style.position = 'fixed';
            element.style.top = '0';
            element.style.left = '0';
            element.style.width = window.innerWidth + 'px';
            element.style.height = window.innerHeight + 'px';
            element.style.pointerEvents = 'auto';
            element.style.zIndex = '1001'; // 在CSS3D层上面
            element.style.background = 'transparent';

            this.controlLayer = element
            document.body.appendChild(this.controlLayer);
        }

        this.control = new OrbitControls(this.camera, this.controlLayer)
        this.control.autoRotateSpeed = 1

        // 设置默认限制
        this.setupDefaultLimits()

        // 保存初始相机位置（在OrbitControls可能修改之前）
        const initialCameraPosition = this.camera.position.clone()
        const initialTargetPosition = new THREE.Vector3(0, 0, 0)

        // 监听相机变化，限制移动范围
        this.control.addEventListener("change", () => {
            this.enforceMovementBounds()
            eventBus.emit("camera-moved")
        })

        // 应用用户配置
        if (options) {
            this.configure(options)
        }

        // 恢复初始相机位置（确保用户设置的位置生效）
        this.camera.position.copy(initialCameraPosition)
        this.control.target.copy(initialTargetPosition)
        this.control.update()
    }

    private setupDefaultLimits() {
        // 距离限制
        this.control.minDistance = 1
        this.control.maxDistance = this.boundaryRadius * 0.8 // 80%的边界半径

        // 极角限制（垂直旋转）- 限制俯仰角在15-90度
        this.control.minPolarAngle = 0 // 允许垂直向下（90度俯仰角）
        this.control.maxPolarAngle = Math.PI / 2 - Math.PI * 5 / 180 // 限制最小俯仰角为15度

        // // 启用阻尼
        // this.control.enableDamping = false
        // this.control.dampingFactor = 0.05

        // 启用平移但限制范围
        this.control.enablePan = true
        this.control.panSpeed = 1.0
        this.control.keyPanSpeed = 7.0

        // 缩放设置
        this.control.enableZoom = true
        this.control.zoomSpeed = 1.0

        // 保存3D模式的限制
        this.saved3DLimits = {
            minPolarAngle: this.control.minPolarAngle,
            maxPolarAngle: this.control.maxPolarAngle,
            minAzimuthAngle: this.control.minAzimuthAngle,
            maxAzimuthAngle: this.control.maxAzimuthAngle,
            enableRotate: this.control.enableRotate
        }
    }

    /**
     * 恢复3D模式的控制限制
     */
    private apply3DLimits(): void {
        if (this.saved3DLimits) {
            this.control.minPolarAngle = this.saved3DLimits.minPolarAngle
            this.control.maxPolarAngle = this.saved3DLimits.maxPolarAngle
            this.control.minAzimuthAngle = this.saved3DLimits.minAzimuthAngle
            this.control.maxAzimuthAngle = this.saved3DLimits.maxAzimuthAngle
            this.control.enableRotate = this.saved3DLimits.enableRotate
        }

        // 启用所有控制
        this.control.enableZoom = true
        this.control.enablePan = true
        this.control.enableRotate = true

        console.log('🎥 已恢复3D控制限制（透视模式）')
    }

    /**
     * 获取控制器图层元素
     */
    public getControlLayer(): HTMLElement {
        return this.controlLayer
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

        if (position.y < 0.5) {
            position.y = 0.5
            this.camera.position.copy(position)
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
            // console.log("OrbitControls: 场景就绪事件接收")
        })

        // 监听窗口大小变化
        eventBus.on("resize", () => {
            // 窗口大小变化时可能需要更新控制器
            this.control.update()
            this.controlLayer.style.width = window.innerWidth + 'px';
            this.controlLayer.style.height = window.innerHeight + 'px';
        })

        // console.log("✅ OrbitControls事件监听器已初始化")
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
            domElement: this.control.domElement && 'tagName' in this.control.domElement ? this.control.domElement.tagName : null,
            cameraPosition: {
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
            boundaryRadius: this.boundaryRadius
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

    public configure(options: OrbitControlOptions) {
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
    }

    public addEventListener(event: "change", callback: () => void) {
        this.control.addEventListener(event, callback)
    }

    public destroy() {
        this.control.dispose()
    }
}
// 轨道控制器插件
import { THREE, BasePlugin } from "../basePlugin"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import eventBus from "../../eventBus/eventBus"

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
}

export class orbitControls extends BasePlugin {
    private control: OrbitControls
    private camera: THREE.PerspectiveCamera
    private dom: HTMLElement
    private boundaryRadius: number = 20000 // 默认边界半径

    constructor(meta: any) {
        super(meta)
        if (!meta?.userData?.domElement) {
            throw new Error("缺少domElement")
        }
        this.dom = meta.userData.domElement
        this.camera = meta.userData.camera as THREE.PerspectiveCamera
        this.control = new OrbitControls(this.camera, this.dom)

        // 设置默认限制
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

        // 应用用户配置
        if (meta.userData.orbitControlOptions) {
            this.configure(meta.userData.orbitControlOptions)
        }

        // 恢复初始相机位置（确保用户设置的位置生效）
        this.camera.position.copy(initialCameraPosition)
        this.control.target.copy(initialTargetPosition)
        this.control.update()

        console.log(
            `相机初始位置设置为: [${initialCameraPosition.x}, ${initialCameraPosition.y}, ${initialCameraPosition.z}]`,
        )
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

        // 缩放设置
        this.control.enableZoom = true
        this.control.zoomSpeed = 1.0
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
    public setCameraPosition(
        x: number,
        y: number,
        z: number,
        targetX: number = 0,
        targetY: number = 0,
        targetZ: number = 0,
    ) {
        this.camera.position.set(x, y, z)
        this.control.target.set(targetX, targetY, targetZ)
        this.control.update()
        console.log(`相机位置强制设置为: [${x}, ${y}, ${z}], 目标: [${targetX}, ${targetY}, ${targetZ}]`)
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
    }

    public addEventListener(event: "change", callback: () => void) {
        this.control.addEventListener(event, callback)
    }

    public destroy() {
        this.control.dispose()
    }
}

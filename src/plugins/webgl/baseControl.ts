// 轨道控制器插件
import { THREE, BasePlugin } from "../basePlugin"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import eventBus from '../../eventBus/eventBus'
import * as TWEEN from "@tweenjs/tween.js"

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

export class BaseControls extends BasePlugin {
    private control: OrbitControls
    private camera: THREE.PerspectiveCamera
    private boundaryRadius: number = 20000 // 默认边界半径
    private controlLayer: HTMLElement
    
    constructor(meta:any) {
        super(meta)
        
        // 获取相机
        this.camera = meta.userData.camera as THREE.PerspectiveCamera
        if (!this.camera) {
            throw new Error("轨道控制器需要相机实例")
        }

        // 创建控制器专用层
        let element = document.createElement('div');
        element.className = 'base-control-layer'
        element.style.position = 'fixed';
        element.style.top = '0';
        element.style.left = '0';
        element.style.width = window.innerWidth + 'px';
        element.style.height = window.innerHeight + 'px';
        element.style.pointerEvents = 'auto';
        // element.style.zIndex = '1'; // 在CSS3D层下面
        element.style.background = 'transparent';

        // 将控制层添加到DOM
        
        if (meta.userData.domElement) {
            this.controlLayer = meta.userData.domElement
        }else{
            this.controlLayer = element
            document.body.appendChild(this.controlLayer);
        }

        this.control = new OrbitControls(this.camera, this.controlLayer)
        
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
    
    /**
     * 初始化事件监听器
     */
    public initializeEventListeners() {
        // 监听场景就绪事件
        eventBus.on("scene-ready", (data: any) => {
            // console.log("OrbitControls: 场景就绪事件接收")
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

    /**
     * 相机平滑飞行到目标位置
     * @param options CameraFlyToOptions
     */
    public cameraFlyTo(options: CameraFlyToOptions): void {
        // 默认参数配置
        const defaultOptions: CameraFlyToOptions = {
            position: new THREE.Vector3(0, 0, 0), // 必须由用户传入，默认值仅作兜底
            lookAt: undefined,                    // 默认朝向目标点
            duration: 1000,                       // 默认1秒
            delay: 0,                             // 默认无延迟
            autoLookAt: true,                     // 默认自动lookAt
            easing: (t: number) => t,             // 默认线性
            onUpdate: undefined,                  // 默认无回调
            onComplete: undefined                 // 默认无回调
        };

        // 合并用户参数和默认参数
        const finalOptions = { ...defaultOptions, ...options };

        // 参数校验
        if (!finalOptions.position || !(finalOptions.position instanceof THREE.Vector3)) {
            console.error("cameraFlyTo: 需要传入目标位置（THREE.Vector3）");
            return;
        }

        const duration = finalOptions.duration!;
        const delay = finalOptions.delay!;
        const easing = finalOptions.easing!;
        const lookAtTarget = finalOptions.lookAt ? finalOptions.lookAt.clone() : finalOptions.position.clone();
        const autoLookAt = finalOptions.autoLookAt!;

        // 记录起始位置和朝向
        const startPosition = this.camera.position.clone();
        const startTarget = this.control.target.clone();

        // 用于tween插值的对象
        const tweenObj = {
            camX: startPosition.x,
            camY: startPosition.y,
            camZ: startPosition.z,
            targetX: startTarget.x,
            targetY: startTarget.y,
            targetZ: startTarget.z
        };

        // 动画互斥：如有上一个飞行动画，先停止
        if ((this as any)._flyTween && typeof (this as any)._flyTween.stop === 'function') {
            (this as any)._flyTween.stop();
        }

        // 创建TWEEN动画
        (this as any)._flyTween = new TWEEN.Tween(tweenObj)
            .to({
                camX: finalOptions.position.x,
                camY: finalOptions.position.y,
                camZ: finalOptions.position.z,
                targetX: lookAtTarget.x,
                targetY: lookAtTarget.y,
                targetZ: lookAtTarget.z
            }, duration)
            .delay(delay)
            .easing(easing)
            .onUpdate(() => {
                // 每帧更新相机和target
                this.camera.position.set(tweenObj.camX, tweenObj.camY, tweenObj.camZ);
                this.control.target.set(tweenObj.targetX, tweenObj.targetY, tweenObj.targetZ);
                this.control.update();
                // 自动lookAt（如需禁用则跳过）
                if (autoLookAt) {
                    this.camera.lookAt(this.control.target);
                }
                finalOptions.onUpdate?.();
            })
            .onComplete(() => {
                // 动画结束，确保到达最终状态
                this.camera.position.copy(finalOptions.position);
                this.control.target.copy(lookAtTarget);
                this.control.update();
                if (autoLookAt) {
                    this.camera.lookAt(this.control.target);
                }
                finalOptions.onComplete?.();
                (this as any)._flyTween = null;
            })
            .start();
    }
}
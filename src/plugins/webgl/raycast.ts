import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import eventBus from '../../eventBus/eventBus'

// 该插件主要承担射线拾取的工作，需要维护射线拾取的检测队列
export class Raycast extends BasePlugin {
    private raycaster: THREE.Raycaster | null
    private mouse: THREE.Vector2 | null
    private camera: THREE.Camera | null
    private scene: THREE.Scene | null
    private boundHandler: (e: MouseEvent) => void | unknown
    private hoverEnabled = false
    private debugLine: THREE.Line | null = null

    constructor(meta: any) {
        super(meta)

        if (!meta.userData?.camera || !(meta.userData.camera instanceof THREE.Camera)) {
            throw new Error("Raycast plugin requires THREE.Camera instance in meta.userData.camera")
        }
        if (!meta.userData?.scene || !(meta.userData.scene instanceof THREE.Scene)) {
            throw new Error("Raycast plugin requires THREE.Scene instance in meta.userData.scene")
        }

        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2()
        this.camera = meta.userData.camera
        this.scene = meta.userData.scene
        this.boundHandler = this.getSomeThingByRay.bind(this)

        window.addEventListener("click", this.boundHandler)
    }

    getSomeThingByRay(event: MouseEvent) {

        (this.mouse as THREE.Vector2).x = (event.clientX / window.innerWidth) * 2 - 1;
        (this.mouse as THREE.Vector2).y = -(event.clientY / window.innerHeight) * 2 + 1;

        (this.raycaster as THREE.Raycaster).setFromCamera(this.mouse as THREE.Vector2, this.camera as THREE.PerspectiveCamera)

        const intersects = (this.raycaster as THREE.Raycaster).intersectObjects((this.scene as THREE.Scene).children, true)

        if (intersects.length === 0) return
        eventBus.emit("raycast-hit", {
            intersects,
            mouse: (this.mouse as THREE.Vector2).clone(),
            camera: this.camera,
        })

        // 自动更新调试射线
        if (this.debugLine) {
            this.updateDebugLine(intersects[0]?.point)
        }
    }

    // 新增hover检测
    enableHoverDetection(enable: boolean = true) {
        if (enable && !this.hoverEnabled) {
            window.addEventListener("mousemove", this.boundHandler)
            this.hoverEnabled = true
        } else if (!enable && this.hoverEnabled) {
            window.removeEventListener("mousemove", this.boundHandler)
            this.hoverEnabled = false
        }
    }

    // 射线可视化
    enableDebugLine(enable: boolean = true) {
        if (enable && !this.debugLine) {
            this.debugLine = new THREE.Line(
                new THREE.BufferGeometry(),
                new THREE.LineBasicMaterial({ color: 0xff0000 }),
            );
            (this.scene as THREE.Scene).add(this.debugLine);
        } else if (!enable && this.debugLine) {
            (this.scene as THREE.Scene).remove(this.debugLine)
            this.debugLine.geometry.dispose()
            if (Array.isArray(this.debugLine.material)) {
                this.debugLine.material.forEach(item => {
                    item.dispose()
                })
            } else {
                this.debugLine.material.dispose()
            }
            this.debugLine = null
        }
    }

    private updateDebugLine(endPoint?: THREE.Vector3) {
        const start = (this.camera as THREE.PerspectiveCamera).position
        const direction = new THREE.Vector3((this.mouse as THREE.Vector2).x, (this.mouse as THREE.Vector2).y, 0.5)
            .unproject(this.camera as THREE.PerspectiveCamera)
            .sub(start)
            .normalize()

        const points = [start, endPoint || start.clone().add(direction.multiplyScalar(100))]
        if (this.debugLine) {
            this.debugLine.geometry.setFromPoints(points)
        }
    }

    destroy() {
        if (this.boundHandler) {
            window.removeEventListener("click", this.boundHandler)
            window.removeEventListener("mousemove", this.boundHandler)
        }
        this.raycaster = null
        this.mouse = null
        this.camera = null
        this.scene = null
        // this.boundHandler = null
    }
}

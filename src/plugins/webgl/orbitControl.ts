// 轨道控制器插件
import { THREE, BasePlugin } from "../basePlugin"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import eventBus from '../../eventBus/eventBus'
import type { WebGLRenderer } from "three"

export type OrbitControlPluginOptions = {
    damping?: number
}

export class orbitControls extends BasePlugin {
    private control: OrbitControls
    private camera: THREE.PerspectiveCamera
    private dom: HTMLElement
    
    constructor(meta:any) {
        super(meta)
        if (!meta?.userData?.domElement) {
            throw new Error("缺少domElement")
        }
        this.dom = meta.userData.domElement
        this.camera = meta.userData.camera as THREE.PerspectiveCamera
        this.control = new OrbitControls(this.camera, this.dom)
        this.control.enableDamping = true
        this.control.addEventListener("change", () => eventBus.emit("camera-moved"))
    }

    public update() {
        if (!this.control) return
        eventBus.once("update", () => {
            this.control.update()
        })
    }

    public configure(options: OrbitControlPluginOptions) {
        if (options.damping !== undefined) {
            this.control.dampingFactor = options.damping
        }
    }

    public addEventListener(event: "change", callback: () => void) {
        this.control.addEventListener(event, callback)
    }

    public destroy() {
        this.control.dispose()
    }
}

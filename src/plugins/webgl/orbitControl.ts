// 轨道控制器插件
import * as THREE from 'three'
import { BasePlugin } from "../basePlugin"
import { OrbitControls } from "../../utils/threeModules"
import eventBus from '../../eventBus/eventBus'
import { PluginMeta } from "../../types/Plugin"

export type OrbitControlPluginOptions = {
    damping?: number
}

export class orbitControls extends BasePlugin {
    private control: any  // 使用 any 类型避免类型错误
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
        this.control.enableDamping = false
        this.control.addEventListener("change", () => eventBus.emit("camera-moved"))
        // this.update()
    }

    public update() {
        if (!this.control) return
        eventBus.on("update", () => {
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

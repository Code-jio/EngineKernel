import { PerspectiveCamera, Scene, OrthographicCamera } from "three"
import BasePlugin from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import * as THREE from "three"
import { PipelineManager } from "../../core/pipelineManager"

export class BaseScene extends BasePlugin {
    private camera: PerspectiveCamera // 默认透视相机
    private aspectRatio = window.innerWidth / window.innerHeight
    private cameraType: "perspective" | "orthographic" = "perspective"
    private scene: Scene
    private ambientLight: THREE.AmbientLight
    private renderer: THREE.WebGLRenderer
    private pipelineManager: PipelineManager

    constructor(meta: any) {
        console.log("meta", meta)
        super(meta)
        const cameraOption = meta.userData.cameraConfig || {
            type: "perspective",
            fov: 45,
            near: 0.01,
            far: 100000,
            lookAt: [0, 0, 0],
            position: [0, 0, 5],
        }

        this.camera = new PerspectiveCamera(cameraOption.fov, this.aspectRatio, cameraOption.near, cameraOption.far)
        this.camera.position.set(...(cameraOption.position as [number, number, number]))
        this.camera.lookAt(...(cameraOption.lookAt as [number, number, number]))

        this.scene = new Scene()
        this.scene.background = new THREE.Color(meta.userData.backgroundColor || 0xffffff)

        this.ambientLight = new THREE.AmbientLight(0x404040)
        this.renderer = new THREE.WebGLRenderer({
            canvas: meta.userData.canvasDom,
            antialias: true,
            // alpha: true,
            precision: "highp",
            powerPreference: "high-performance",
        })

        // 将renderer实例存入meta供其他插件使用
        meta.userData.renderer = this.renderer

        this.pipelineManager = new PipelineManager()

        this.initialize()
    }

    // 初始化设置
    initialize() {
        // this.camera.position.set(...meta.position)
        // this.camera.lookAt
        //

        this.camera.updateProjectionMatrix()

        this.renderer.setPixelRatio(window.devicePixelRatio) // 设置设备像素比 作用：防止高分屏下模糊
        this.renderer.setSize(window.innerWidth, window.innerHeight) // 设置渲染器尺寸
        window.addEventListener("resize", this.handleResize)
        eventBus.emit("scene-ready", { scene: this.scene, camera: this.camera })
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    destroy() {
        window.removeEventListener("resize", this.handleResize)
        this.renderer.dispose()
        this.scene.clear()
        this.ambientLight.dispose()
        this.pipelineManager.destroy()
        // super.destroy()
    }
}

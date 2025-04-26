import { PerspectiveCamera, Scene, OrthographicCamera } from "three"
import BasePlugin from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
import * as THREE from "three"
import { PipelineManager } from '../../core/pipelineManager'

export class BaseScene extends BasePlugin {
    private camera: PerspectiveCamera // 默认透视相机
    private aspectRatio = window.innerWidth / window.innerHeight
    private cameraType: "perspective" | "orthographic" = "perspective"
    private scene: Scene
    private ambientLight: THREE.AmbientLight
    private renderer: THREE.WebGLRenderer
    private pipelineManager: PipelineManager

    constructor(meta: any) {
        super({
            ...meta,
        })

        this.camera = new PerspectiveCamera(meta.viewAngle, this.aspectRatio, meta.userData.near, meta.userData.far)

        this.scene = new Scene()
        this.scene.background = new THREE.Color(meta.userData.backgroundColor || 0xffffff)

        this.ambientLight = new THREE.AmbientLight(0x404040)
        this.renderer = new THREE.WebGLRenderer({
            canvas: meta.userData.canvasDom,
            antialias: true,
            // alpha: true, // 背景透明
            precision: 'lowp', // 根据硬件情况酌情选择
            powerPreference: 'lowp-performance',
        })

        this.pipelineManager = new PipelineManager()
    
        this.initialize()
    }

    // 初始化设置
    initialize(){
        // this.camera.position.set(...meta.position)
        // this.camera.lookAt
        // 

        this.camera.updateProjectionMatrix()

        this.renderer.setPixelRatio(window.devicePixelRatio); // 设置设备像素比 作用：防止高分屏下模糊
        this.renderer.setSize(window.innerWidth, window.innerHeight); // 设置渲染器尺寸
        window.addEventListener('resize', this.handleResize)
        eventBus.emit('scene-ready', { scene: this.scene, camera: this.camera })
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    destroy() {
        window.removeEventListener('resize', this.handleResize)
        this.renderer.dispose()
        this.scene.clear()
        this.ambientLight.dispose()
        this.pipelineManager.destroy()
        // super.destroy()
    }
}

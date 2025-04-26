import * as THREE from "three"
import BasePlugin from '../basePlugin'
import eventBus from '../../eventBus/eventBus'

export default class SkyBox extends BasePlugin {
    private cubeTextureLoader: THREE.CubeTextureLoader
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private renderer: THREE.WebGLRenderer
    private mesh: THREE.Mesh | null = null
    private texturePaths: string[]
    private boundHandleResize: () => void = this.handleResize.bind(this)

    constructor(meta: any) {
        super(meta)
        if (!meta.userData?.scene) throw new Error("缺少scene参数")
        if (!meta.userData?.camera) throw new Error("缺少camera参数")
        this.cubeTextureLoader = new THREE.CubeTextureLoader()
        this.scene = meta.userData.scene
        this.camera = meta.userData.camera
        this.renderer = meta.userData.renderer
        this.texturePaths = meta.userData.texturePaths
    }

    initialize() {
        // 初始化事件监听
        this.sceneReadyHandler = this.sceneReadyHandler.bind(this)
        eventBus.on("scene-ready", this.sceneReadyHandler)

        // 加载立方体贴图
        const texturePaths = this.texturePaths
        this.cubeTextureLoader.load(
            texturePaths,
            texture => {
                const geometry = new THREE.BoxGeometry(1000, 1000, 1000)
                const material = new THREE.MeshBasicMaterial({
                    envMap: texture,
                    side: THREE.BackSide,
                })
                this.mesh = new THREE.Mesh(geometry, material)

                // 确保在材质加载完成后才添加场景监听
                eventBus.emit("skybox-ready")
            },
            undefined,
            err => {
                console.error("天空盒加载失败:", err)
                eventBus.emit("load-error", err)
            },
        )

        // 监听窗口大小变化事件并更新相机和渲染器尺寸
        window.addEventListener("resize", this.boundHandleResize)
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(window.innerWidth, window.innerHeight)
    }

    sceneReadyHandler() {
        this.scene.add(this.mesh!)
    }

    destroy() {
        // 移除事件监听
        eventBus.off("scene-ready", this.sceneReadyHandler)
        window.removeEventListener("resize", this.boundHandleResize)

        // 安全清理资源
        if (this.mesh) {
            this.mesh.geometry?.dispose()
            
            if (Array.isArray(this.mesh.material)) {
                this.mesh.material.forEach(material => material.dispose())
            } else if (this.mesh.material) {
                this.mesh.material.dispose()
            }

            this.scene.remove(this.mesh)
            this.mesh = null
        }
    }
}

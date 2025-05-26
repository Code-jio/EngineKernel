import { THREE, BasePlugin } from "../basePlugin"
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer"
import eventBus from '../../eventBus/eventBus'

interface CSS3DPluginConfig {
    component: HTMLElement | string // Vue/React组件实例或CSS选择器
    position?: THREE.Vector3
    rotation?: THREE.Euler
    scale?: number
}

export class CSS3DRenderPlugin extends BasePlugin {
    private renderer: CSS3DRenderer
    private object?: CSS3DObject
    private camera: THREE.Camera
    private scene: THREE.Scene
    
    public shakeIntensity: number = 0
    public position: THREE.Vector3 = new THREE.Vector3()

    public lookAtCamera: boolean = true

    constructor(meta: any) {
        super(meta)
        this.renderer = new CSS3DRenderer()
        this.camera = meta.userData.camera
        this.scene = meta.userData.scene

        this.setupRenderer()
        this.injectToScene()
    }

    // 初始化渲染器配置
    private setupRenderer() {
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.domElement.style.position = "fixed"
        this.renderer.domElement.style.top = "0"
        document.body.appendChild(this.renderer.domElement)
    }

    // 创建3D对象
    createObject(config: CSS3DPluginConfig): CSS3DObject {
        const element = this.resolveComponent(config.component)
        this.object = new CSS3DObject(element)

        this.object.position.copy(config.position || new THREE.Vector3())
        this.object.rotation.copy(config.rotation || new THREE.Euler())
        this.object.scale.set(config.scale || 1, config.scale || 1, 1)

 


        this.position.copy(this.object.position)
        return this.object
    }

    // 解析Vue/React组件
    private resolveComponent(component: HTMLElement | string): HTMLElement {
        if (typeof component === "string") {
            const el = document.querySelector(component)
            if (!el) throw new Error(`CSS selector ${component} not found`)
            return el as HTMLElement
        }
        return component
    }

    // 晃动动画方法
    Shake(options: { intensity: number; duration: number; direction?: "x" | "y" | "both" }) {
        this.shakeIntensity = options.intensity
        let elapsedTime = 0

        const animate = () => {
            if (elapsedTime > options.duration) {
                this.object!.position.copy(this.position)
                return
            }

            const offset = Math.sin(elapsedTime * 20) * this.shakeIntensity

            switch (options.direction || "both") {
                case "x":
                    this.object!.position.x = this.position.x + offset
                    break
                case "y":
                    this.object!.position.y = this.position.y + offset
                    break
                default:
                    this.object!.position.x = this.position.x + offset
                    this.object!.position.y = this.position.y + offset
            }

            elapsedTime += 0.016 // 后续更换clock
        }

        eventBus.on("update", animate)
    }

    // 集成到场景渲染循环
    private injectToScene() {
        eventBus.on("afterRender", () => {
            if (this.object && this.camera) {
                this.renderer.render(this.scene, this.camera)
            }
        })
    }

    // 清理资源 dispose方法
    async dispose() {
        super.unload()
        if (this.object) {
            this.object.removeFromParent()
            // 删除无效的geometry/material清理
            if (this.object.element instanceof HTMLElement) {
                this.object.element.remove() // 移除关联的DOM元素
            }
        }
        this.renderer.domElement.remove()
        eventBus.off("afterRender")
        eventBus.off("update")
    }
}

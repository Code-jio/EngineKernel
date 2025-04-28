import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import { PipelineManager } from "../../core/pipelineManager"

export class BaseScene extends BasePlugin {
    private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera // 默认透视相机
    private aspectRatio = window.innerWidth / window.innerHeight
    private scene: THREE.Scene
    private ambientLight: THREE.AmbientLight
    private renderer: THREE.WebGLRenderer
    private pipelineManager: PipelineManager
    private directionalLight: THREE.DirectionalLight
    
    constructor(meta: any) {
        super(meta)
        const cameraOption = meta.userData.cameraConfig || {
            type: "perspective",
            fov: 45,
            near: 0.01,
            far: 100000,
            lookAt: [0, 0, 0],
            position: [0, 0, 5],
        }

        const rendererOption = meta.userData.rendererConfig || {
            container: document.querySelector("#container") as HTMLCanvasElement || null,
            antialias: true,
            alpha: false,
            precision: "highp",
            powerPreference: "high-performance",
        }


        if (!rendererOption.container) {
            const canvas = document.createElement('canvas');
            canvas.id = 'container';
            document.body.appendChild(canvas);
            rendererOption.container = canvas;

            // 全屏显示
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.position = 'fixed';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.zIndex = '-1';
        }

        if (cameraOption.type == "perspective") {
            this.camera = new THREE.PerspectiveCamera(cameraOption.fov, this.aspectRatio, cameraOption.near, cameraOption.far)
            this.camera.position.set(...(cameraOption.position as [number, number, number]))
            this.camera.lookAt(...(cameraOption.lookAt as [number, number, number]))
        } else {
            this.camera = new THREE.OrthographicCamera(
                window.innerWidth / -2, 
                window.innerWidth / 2, 
                window.innerHeight / 2, 
                window.innerHeight / -2, 
                1, 
                1000
            )
            this.camera.updateProjectionMatrix()
        }

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0xffffff)


        
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7) // 环境光(颜色, 强度) 不影响阴影(自发光)
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 1) // 平行光(颜色, 强度) 影响阴影(自发光)
        this.directionalLight.position.set(1000, 1000, 1000) // 设置平行光位置

        this.scene.add(this.directionalLight)
        this.scene.add(this.ambientLight)
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: rendererOption.container, // 渲染器的容器
            antialias: rendererOption.antialias, // 抗锯齿
            alpha: rendererOption.alpha || false, // 透明
            precision: rendererOption.precision, // 精度
            powerPreference: rendererOption.powerPreference, // 性能
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
        window.addEventListener("resize", this.handleResize.bind(this))

        eventBus.emit("scene-ready", { scene: this.scene, camera: this.camera })
        eventBus.on("update", () => {
            this.renderer.render(this.scene, this.camera) // 渲染场景
        })
    }

    handleResize() {
        if (this.camera instanceof THREE.PerspectiveCamera) {
            this.camera.aspect = window.innerWidth / window.innerHeight
            this.camera.updateProjectionMatrix()
            this.renderer.setSize(window.innerWidth, window.innerHeight)
        }  
    }

    destroy() {
        window.removeEventListener("resize", this.handleResize)
        this.renderer.dispose()
        this.scene.clear()
        this.ambientLight.dispose()
        this.pipelineManager.destroy()
        // super.destroy()
    }

    update(){ }
}

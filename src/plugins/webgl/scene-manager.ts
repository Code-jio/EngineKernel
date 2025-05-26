import * as THREE from 'three'
import { BasePlugin } from "../basePlugin"
import eventBus from '../../eventBus/eventBus'
// 使用 any 类型替代 GLTF，避免外部依赖

// 该插件承担多场景同屏显示，主次场景切换等任务，并作为首要插件加载，管理场景事务
export class SceneManager extends BasePlugin {
    private sceneGraph = new Map<string, THREE.Object3D>()
    private activeScene?: THREE.Scene

    constructor(meta: any) {
        super(meta)
        this.activeScene = meta.userData.scene as THREE.Scene // 初始化时设置当前场景
        this.sceneGraph.set("default", this.activeScene) // 默认场景
    }

    loadScene(config: { name: string; setup: (scene: THREE.Scene) => void; teardown?: () => void }) {
        const newScene = new THREE.Scene()
        this.sceneGraph.set(config.name, newScene)

        if (!this.activeScene) {
            this.activeScene = newScene
            config.setup(newScene)
        }
    }

    switchScene(name: string) {
        const scene = this.sceneGraph.get(name)
        if (scene instanceof THREE.Scene) {
            this.activeScene?.traverse((obj: THREE.Object3D) => obj.removeFromParent())
            this.activeScene = scene
        }
    }

    // 添加模型到当前场景
    async addModelToScene() {
        // 响应GLTF_READY事件 加载模型到当前场景
        eventBus.on("GLTF_READY", ({ type, payload, resoucePath }) => {
            let gltf = payload as any  // 使用 any 类型避免类型错误
            if (gltf.scene) {
                this.activeScene?.add(gltf.scene) // 将模型添加到当前场景
                eventBus.emit("MODEL_READY", { scene: this.activeScene, model: gltf.scene }) // 触发MODEL_READY事件，通知模型加载完成
            }
            // 加载完成后，触发SCENE_READY事件，通知场景加载完成
            eventBus.emit("SCENE_READY", { scene: this.activeScene })
        })
    }
}

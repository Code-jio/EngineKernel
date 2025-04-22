import * as THREE from "three"
import BasePlugin from "plugins/basePlugin"
import eventBus from "eventBus/eventBus"
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader" // 导入GLTF类型，用于类型

export default class SceneManager extends BasePlugin {
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
            this.activeScene?.traverse(obj => obj.removeFromParent())
            this.activeScene = scene
        }
    }

    // 添加模型到当前场景
    async addModelToScene() {
        // 响应GLTF_READY事件 加载模型到当前场景
        eventBus.on("GLTF_READY", ({ type, payload, resoucePath }) => {
            let gltf = payload as GLTF
            if (gltf.scene) {
                this.activeScene?.add(gltf.scene) // 将模型添加到当前场景
                eventBus.emit("MODEL_READY", { scene: this.activeScene, model: gltf.scene }) // 触发MODEL_READY事件，通知模型加载完成
            }
            // 加载完成后，触发SCENE_READY事件，通知场景加载完成
            eventBus.emit("SCENE_READY", { scene: this.activeScene })
        })
    }
}

import { THREE, BasePlugin } from "../basePlugin";
import eventBus from "../../eventBus/eventBus";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader"; // 导入GLTF类型，用于类型

// 该插件承担多场景同屏显示，主次场景切换等任务，并作为首要插件加载，管理场景事务
export class SceneManager extends BasePlugin {
    private sceneGraph = new Map<string, THREE.Object3D>();
    private activeScene?: THREE.Scene;

    constructor(meta: any) {
        super(meta);
        this.activeScene = meta.userData.scene as THREE.Scene; // 初始化时设置当前场景
        this.sceneGraph.set("default", this.activeScene); // 默认场景
    }

    loadScene(config: { name: string; setup: (scene: THREE.Scene) => void; teardown?: () => void }) {
        const newScene = new THREE.Scene();
        this.sceneGraph.set(config.name, newScene);

        if (!this.activeScene) {
            this.activeScene = newScene;
            config.setup(newScene);
        }
    }

    switchScene(name: string) {
        const scene = this.sceneGraph.get(name);
        if (scene instanceof THREE.Scene) {
            this.activeScene?.traverse(obj => obj.removeFromParent());
            this.activeScene = scene;
        }
    }

    // 添加模型到当前场景
    async addModelToScene() {
        // 响应GLTF_READY事件 加载模型到当前场景
        eventBus.on("GLTF_READY", ({ type, payload, resoucePath }) => {
            let gltf = payload as GLTF;
            if (gltf.scene) {
                this.activeScene?.add(gltf.scene); // 将模型添加到当前场景
                eventBus.emit("MODEL_READY", { scene: this.activeScene, model: gltf.scene }); // 触发MODEL_READY事件，通知模型加载完成
            }
            // 加载完成后，触发SCENE_READY事件，通知场景加载完成
            eventBus.emit("SCENE_READY", { scene: this.activeScene });
        });
    }

    // 初始化插件
    async init(): Promise<void> {
        await this.addModelToScene();
        console.log("🎬 SceneManager 插件初始化完成");
    }

    // 启动插件
    async start(): Promise<void> {
        console.log("🚀 SceneManager 插件启动");
    }

    // 停止插件
    async stop(): Promise<void> {
        // 清理事件监听
        eventBus.off("GLTF_READY");
        console.log("⏹️ SceneManager 插件停止");
    }

    // 卸载插件
    async unload(): Promise<void> {
        await this.stop();
        // 清理场景图
        this.sceneGraph.clear();
        this.activeScene = undefined;
        console.log("🧹 SceneManager 插件卸载完成");
    }

    // 获取当前活动场景
    getActiveScene(): THREE.Scene | undefined {
        return this.activeScene;
    }

    // 获取场景图
    getSceneGraph(): Map<string, THREE.Object3D> {
        return this.sceneGraph;
    }

    // 获取场景名称列表
    getSceneNames(): string[] {
        return Array.from(this.sceneGraph.keys());
    }

    // 检查场景是否存在
    hasScene(name: string): boolean {
        return this.sceneGraph.has(name);
    }

    // 从场景图中移除场景
    removeScene(name: string): boolean {
        if (name === "default") {
            console.warn("⚠️ 不能移除默认场景");
            return false;
        }

        const scene = this.sceneGraph.get(name);
        if (scene) {
            // 如果移除的是当前活动场景，切换到默认场景
            if (scene === this.activeScene) {
                this.switchScene("default");
            }
            
            // 清理场景中的对象
            scene.traverse(obj => {
                if (obj.parent) {
                    obj.removeFromParent();
                }
            });
            
            this.sceneGraph.delete(name);
            console.log(`🗑️ 场景 "${name}" 已移除`);
            return true;
        }
        return false;
    }

    // 清空所有场景（保留默认场景）
    clearAllScenes(): void {
        const namesToRemove = Array.from(this.sceneGraph.keys()).filter(name => name !== "default");
        namesToRemove.forEach(name => this.removeScene(name));
        
        // 清理默认场景
        const defaultScene = this.sceneGraph.get("default");
        if (defaultScene) {
            defaultScene.traverse(obj => {
                if (obj.parent) {
                    obj.removeFromParent();
                }
            });
        }
        
        this.activeScene = defaultScene instanceof THREE.Scene ? defaultScene : undefined;
        console.log("🧹 所有场景已清空");
    }
}

import * as THREE from "three"
import BasePlugin from "plugins/basePlugin"
import eventBus from "eventBus/eventBus"
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader" // 导入GLTF类型，用于类型

export default class SceneManager extends BasePlugin {
    private sceneGraph = new Map<string, THREE.Object3D>();
    private activeScene?: THREE.Scene;

    constructor(meta: any) {
        super(meta)
        this.activeScene = meta.userData.scene as THREE.Scene; // 初始化时设置当前场景
        this.sceneGraph.set("default", this.activeScene); // 默认场景 
    }

    loadScene(config: {
        name: string;
        setup: (scene: THREE.Scene) => void;
        teardown?: () => void;
    }) {
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
}
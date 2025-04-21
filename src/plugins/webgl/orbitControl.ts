// 轨道控制器插件
import * as THREE from "three"
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import BasePlugin from "plugins/basePlugin";
import eventBus from "eventBus/eventBus";

export default class orbitControls extends BasePlugin {
    private control: OrbitControls
    private camera: THREE.PerspectiveCamera
    private dom : HTMLElement
    constructor(meta: any){
        super(meta)
        this.dom = meta.userData.renderer.domElement
        this.camera = meta.userData.camera as THREE.PerspectiveCamera
        this.control = new OrbitControls(
            this.camera,
            this.dom
        )
    }

    public update(){
        eventBus.on("update", () => {
            this.control.update()
        })
    }
}
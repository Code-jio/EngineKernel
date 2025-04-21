// 轨道控制器插件
import * as THREE from "three"
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import BasePlugin from "plugins/basePlugin";

export default class orbitControls extends BasePlugin {
    private control: OrbitControls
    constructor(meta: any){
        super(meta)
        this.control = new OrbitControls(
            meta.userData.camera, 
            meta.userData.renderer.domElement
        )
    }

    
}
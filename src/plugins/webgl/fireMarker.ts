import { THREE, BasePlugin } from "../basePlugin"
import fireMaterial from "../../glsl/fire"

// 火焰配置参数接口
interface FireMarkerConfig {
  
}

// 默认配置
const DEFAULT_CONFIG: FireMarkerConfig = {
    position: [0, 0, 0],
    size: 1.0,
    billboard: true,
    visible: true,
    intensity: 1.0,
    animationSpeed: 1.0,
    baseColor: 0xff4400,
    tipColor: 0xffff00,
    opacity: 1.0,
    renderOrder: 100,
    depthWrite: false,
    depthTest: true,
    flickerIntensity: 0.1,
    waveAmplitude: 0.1,
    debugMode: false,
}

// 3D火焰对象类
export class FireMarker extends BasePlugin {
    public scene
    public camera
    public render

    constructor(meta: any) {
       super(meta)
       this.scene = meta.userData.scene;
       this.camera = meta.userData.camera;
       this.render = meta.userData.render;
    }
}

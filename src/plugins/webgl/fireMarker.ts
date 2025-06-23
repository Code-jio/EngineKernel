import THREE from "utils/three-imports";
import fire from "../../glsl/fire"

// 初始化参数
interface initParams {

}

// 火焰
export default class FireMarker {
    private readonly option: initParams // 只读
    private material: THREE.Material

    constructor(option: initParams) {
        this.option = option
        this.material = this.createMaterial()
        this.init(option)
    }

    init(option: initParams) {

    }

    // 创建火焰shader材质
    createMaterial(): THREE.Material {
        let meterial = new THREE.ShaderMaterial()
        this.material = meterial
        return meterial
    }

    
}
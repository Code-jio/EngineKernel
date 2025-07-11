import { THREE, BasePlugin } from "../basePlugin"
import { WaterMarker } from "./waterMarker";

export class WaterMarkerPlugin extends BasePlugin{
    private scenePlugin: any
    private waterMarker: WaterMarker | null = null
    
    constructor(meta: any){
        super(meta)
        this.scenePlugin = meta.userData.scenePlugin
    }

    public createWaterMarker(options: any){
        this.waterMarker = new WaterMarker(options)
        let waterMaterial = this.scenePlugin.floorManager.floor.material

        // 安全地访问和设置材质
        const mesh = this.waterMarker.getGroup().children[0] as THREE.Mesh
        if (mesh && Array.isArray(mesh.material)) {
            mesh.material[0] = waterMaterial
        }

        // 加入场景
        this.scenePlugin.scene.add(this.waterMarker.getGroup())
        return this.waterMarker
    }
}
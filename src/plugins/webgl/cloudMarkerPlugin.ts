// 体积云标注插件
import { THREE, BasePlugin } from "../basePlugin"
import { CloudMarker } from "./cloudMarker.js";

export class CloudMarkerPlugin extends BasePlugin {
    private scenePlugin: any
    private cloudMarker: CloudMarker | null = null
    
    constructor(meta: any) {
        super(meta)
        this.scenePlugin = meta.userData.scenePlugin
    }

    /**
     * 创建体积云标注
     * @param options 云配置参数
     */
    public createCloudMarker(options: {
        height: number
        contour: THREE.Vector3[]
        density?: number
        color?: number
        animationSpeed?: number
    }): CloudMarker {
        this.cloudMarker = new CloudMarker({
            ...options,
            color: options.color || 0xffffff,
            density: options.density || 0.7,
            animationSpeed: options.animationSpeed || 0.3
        })

        // 将云加入场景
        this.scenePlugin.scene.add(this.cloudMarker.getGroup())
        return this.cloudMarker
    }

    /**
     * 更新云动画
     * @param deltaTime 时间增量
     */
    public update(deltaTime: number): void {
        if (this.cloudMarker) {
            this.cloudMarker.update(deltaTime)
        }
    }
}
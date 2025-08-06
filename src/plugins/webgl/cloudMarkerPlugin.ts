// 体积云标注插件（优化版）
import { THREE, BasePlugin } from "../basePlugin"
import { CloudMarker } from "./cloudMarker"
import eventBus from "../../eventBus/eventBus"
export class CloudMarkerPlugin extends BasePlugin {
    private scenePlugin: any
    private cloudMarkers: CloudMarker[] = []

    constructor(meta: any) {
        super(meta)
        this.scenePlugin = meta.userData.scenePlugin
    }

    /**
     * 创建体积云标注
     * @param options 云配置参数（支持光照控制、时间同步、着色器参数）
     * @param options.height 云层高度
     * @param options.contour 云标注轮廓点集（定义云的水平形状）
     * @param options.color 云颜色
     * @param options.opacity 云透明度
     * @param options.time 时间参数（用于动画）
     * @param options.density 云密度
     * @param options.marchSteps 渲染步数
     *
     * @example
     * // 通过点集创建自定义形状的云标注
     * const points = [
     *   new THREE.Vector3(-10, 0, -10),
     *   new THREE.Vector3(10, 0, -10),
     *   new THREE.Vector3(15, 0, 0),
     *   new THREE.Vector3(10, 0, 10),
     *   new THREE.Vector3(-10, 0, 10),
     *   new THREE.Vector3(-15, 0, 0)
     * ];
     * const cloud = cloudMarkerPlugin.createCloudMarker({
     *   height: 20,
     *   contour: points,
     *   color: 0x87CEEB,
     *   opacity: 0.7
     * });
     */
    public createCloudMarker(options: {
        height: number
        contour: THREE.Vector3[]
        color?: number
        opacity?: number
        time?: number
        density?: number
        marchSteps?: number
    }): CloudMarker {
        console.log(options, "options")
        const marker = new CloudMarker({
            ...options,
            color: options.color || 0xffffff,
            position: new THREE.Vector3(0, options.height, 0), // 添加 position 属性，默认在高度位置上，x 和 z 坐标为 0
            opacity: options.opacity ?? 0.8,
            time: options.time ?? 0.0,
            density: options.density ?? 0.5,
            marchSteps: options.marchSteps ?? 32,
        })
        
        this.scenePlugin.scene.add(marker.getGroup())
        this.cloudMarkers.push(marker)

        eventBus.on("update", () => {
            // marker.updateMaterial()
            this.update(this.scenePlugin.camera)
        })
        return marker
    }
    /**
     * 更新所有云动画
     * @param deltaTime 时间增量
     */
    public update(camera: THREE.PerspectiveCamera): void {
        this.cloudMarkers.forEach(marker => marker.updateMaterial(camera))
    }

    /**
     * 移除云标注
     */
    public removeCloudMarker(marker: CloudMarker): void {
        const index = this.cloudMarkers.indexOf(marker)
        if (index > -1) {
            this.scenePlugin.scene.remove(marker.getGroup())
            marker.dispose()
            this.cloudMarkers.splice(index, 1)
        }
    }

    /**
     * 清空所有云标注
     */
    public clearAllCloudMarkers(): void {
        this.cloudMarkers.forEach(marker => {
            this.scenePlugin.scene.remove(marker.getGroup())
            marker.dispose()
        })
        this.cloudMarkers = []
    }

    /**
     * 获取所有云标注
     */
    public getCloudMarkers(): CloudMarker[] {
        return [...this.cloudMarkers]
    }
}

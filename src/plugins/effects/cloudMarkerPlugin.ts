// 体积云标注插件（动画优化版）
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
     * @param options 云配置参数（支持光照控制、时间同步、着色器参数、动画控制）
     * @param options.height 云层高度
     * @param options.contour 云标注轮廓点集（定义云的水平形状）
     * @param options.color 云颜色
     * @param options.opacity 云透明度（支持动画）
     * @param options.steps 渲染步数（支持动画）
     * @param options.threshold 密度阈值（支持动画）
     * @param options.range 云范围（支持动画）
     */
    public createCloudMarker(options: {
        height: number
        contour: THREE.Vector3[] | number[]
        color?: number
        opacity?: number
        threshold?: number
        range?: number
        steps?: number
    }): CloudMarker {
        console.log(options, "options")
        
        // 确保contour是THREE.Vector3数组
        let contour: THREE.Vector3[]
        if (Array.isArray(options.contour) && options.contour.length > 0) {
            if (options.contour[0] instanceof THREE.Vector3) {
                contour = options.contour as THREE.Vector3[]
            } else {
                // 如果是数字数组，转换为Vector3数组（每3个数字为一个点）
                const numbers = options.contour as number[]
                contour = []
                for (let i = 0; i < numbers.length; i += 3) {
                    contour.push(new THREE.Vector3(
                        numbers[i] || 0,
                        numbers[i + 1] || 0,
                        numbers[i + 2] || 0
                    ))
                }
            }
        } else {
            contour = [new THREE.Vector3(0, 0, 0)] // 默认值
        }
        
        const marker = new CloudMarker({
            ...options,
            contour,
            color: options.color || 0xffffff,
            position: new THREE.Vector3(0, options.height, 0),
        })
        
        this.scenePlugin.scene.add(marker.getGroup())
        this.cloudMarkers.push(marker)

        // 优化事件监听：只在有云层时监听更新事件
        if (this.cloudMarkers.length === 1) {
            eventBus.on("update", this.handleUpdate.bind(this))
        }
        return marker
    }
    /**
     * 更新所有云动画
     * @param camera 相机对象
     */
    private handleUpdate(): void {
        this.update(this.scenePlugin.camera)
    }

    /**
     * 更新所有云动画
     * @param camera 相机对象
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
            marker.stopAnimation() // 停止动画
            marker.dispose()
            this.cloudMarkers.splice(index, 1)
            
            // 清理事件监听
            if (this.cloudMarkers.length === 0) {
                eventBus.off("update", this.handleUpdate.bind(this))
            }
        }
    }

    /**
     * 清空所有云标注
     */
    public clearAllCloudMarkers(): void {
        this.cloudMarkers.forEach(marker => {
            this.scenePlugin.scene.remove(marker.getGroup())
            marker.stopAnimation() // 停止所有动画
            marker.dispose()
        })
        this.cloudMarkers = []
        eventBus.off("update", this.handleUpdate.bind(this))
    }

    /**
     * 获取所有云标注
     */
    public getCloudMarkers(): CloudMarker[] {
        return [...this.cloudMarkers]
    }

    /**
     * 批量动画控制：同时对所有云执行动画
     * @param params 目标参数对象
     * @param duration 动画持续时间（毫秒）
     * @param easing 缓动函数
     */
    public animateAllTo(params: {
        opacity?: number
        threshold?: number
        range?: number
        steps?: number
    }, duration: number = 1000, easing?: (k: number) => number): Promise<void[]> {
        const promises = this.cloudMarkers.map(marker => 
            marker.animateTo(params, duration, easing)
        )
        return Promise.all(promises)
    }

    /**
     * 批量动画控制：对所有云执行关键帧动画序列
     * @param keyframes 关键帧数组
     */
    public animateAllSequence(keyframes: Array<{
        params: {
            opacity?: number
            threshold?: number
            range?: number
            steps?: number
        }
        duration: number
        easing?: (k: number) => number
    }>): Promise<void[]> {
        const promises = this.cloudMarkers.map(marker => 
            marker.animateSequence(keyframes)
        )
        return Promise.all(promises)
    }

    /**
     * 停止所有云动画
     */
    public stopAllAnimations(): void {
        this.cloudMarkers.forEach(marker => marker.stopAnimation())
    }

    /**
     * 获取所有云的当前参数
     */
    public getAllCurrentParams(): Array<{
        opacity: number
        threshold: number
        range: number
        steps: number
    }> {
        return this.cloudMarkers.map(marker => marker.getCurrentParams())
    }

    /**
     * 根据条件查找云标注
     * @param predicate 条件函数
     */
    public findCloudMarkers(predicate: (marker: CloudMarker) => boolean): CloudMarker[] {
        return this.cloudMarkers.filter(predicate)
    }

    /**
     * 对符合条件的云执行动画
     * @param predicate 条件函数
     * @param params 目标参数对象
     * @param duration 动画持续时间
     * @param easing 缓动函数
     */
    public animateCloudsIf(
        predicate: (marker: CloudMarker) => boolean,
        params: {
            opacity?: number
            threshold?: number
            range?: number
            steps?: number
        },
        duration: number = 1000,
        easing?: (k: number) => number
    ): Promise<void[]> {
        const targets = this.cloudMarkers.filter(predicate)
        const promises = targets.map(marker => 
            marker.animateTo(params, duration, easing)
        )
        return Promise.all(promises)
    }
}

import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import { Stats } from "../../utils/threeModules"
import eventBus from '../../eventBus/eventBus'

export class Performance extends BasePlugin {
    private dom: HTMLDivElement
    private stats: any  // 使用 any 类型避免类型错误
    private fps: number = 0
    private ms: number = 0
    private mb: number = 0
    private frameCount: number = 0
    private lastFPSUpdate: number = performance.now()
    private lastFrameTime: number = 0

    private thresholds: { [key: string]: number } = { fps: 30 } // 默认阈值，可根据需要调整

    constructor(meta: any) {
        super({
            userData: {
                position: "top-right",
                metrics: ["fps", "ms", "mb"],
                ...meta?.userData,
            },
            ...meta,
            strategy: "async",
        })

        // 初始化DOM容器
        this.dom = document.createElement("div")
        this.dom.style.position = "fixed"
        this.dom.style.top = "10px"
        this.dom.style.right = "10px"
        this.dom.style.zIndex = "10000"
        document.body.appendChild(this.dom)

        // 初始化统计面板
        this.stats = new Stats()
        this.stats.showPanel(3)
        this.dom.appendChild(this.stats.dom)

        // 注册渲染后更新事件
        eventBus.on("afterRender", this.update.bind(this))
    }

    initialize() {
        // 初始化面板显示
        this.stats.showPanel(0) // FPS
        this.stats.showPanel(1) // MS
        this.stats.showPanel(2) // MB
    }

    getRealTimeStats() {
        const now = performance.now()

        // 计算帧率（FPS）
        if (now > this.lastFPSUpdate + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFPSUpdate))
            this.frameCount = 0
            this.lastFPSUpdate = now
        }
        this.frameCount++

        // 计算单帧耗时（MS）
        const frameTime = now - this.lastFrameTime
        this.ms = frameTime
        this.lastFrameTime = now

        // 计算内存占用（MB）
        if ((performance as any).memory) {
            this.mb = Math.round((performance as any).memory.jsHeapSizeUsed / 1024 / 1024)
        }

        // 更新统计面板
        this.stats.begin()
        this.stats.end()
    }

    // 统计主场景顶点、面片数

    update() {
        this.stats.update()

        // 性能阈值警告
        if (this.fps < this.thresholds.fps) {
            eventBus.emit("performanceWarning", {
                type: "fps",
                value: this.fps,
            })
        }
    }

    destroy() {
        // super.destroy()
        document.body.removeChild(this.dom)
        eventBus.off("afterRender", this.update)
    }
}

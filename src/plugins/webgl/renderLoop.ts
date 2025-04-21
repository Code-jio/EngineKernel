import BasePlugin from "plugins/basePlugin"
import { Clock } from "three"
import * as THREE from "three"
import eventBus from "eventBus/eventBus"

export default class RenderLoop extends BasePlugin {
    private clock: THREE.Clock
    private taskList: (() => void)[] = []
    constructor(meta: any) {
        super(meta)
        this.taskList = []
        this.clock = new THREE.Clock()
    }

    initialize() {
        const render = () => {
            eventBus.emit("update") // 触发更新事件
            // 执行任务
            this.taskList.forEach((task) => { 
                task()
            })
            requestAnimationFrame(render); // 需要持续循环
        };
        requestAnimationFrame(render);
    }

    addTask(callback: () => void) {
        this.taskList.push(callback);
    }
}

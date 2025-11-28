import { BasePlugin } from "../basePlugin";
import eventBus from "../../eventBus/eventBus";
import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three"

interface RenderTask {
    id: string;
    priority: number; // 优先级，数字越小优先级越高
    enabled: boolean;
    callback: () => void;
}
export class RenderLoop extends BasePlugin {
    private clock: THREE.Clock;
    private taskList: Map<string, RenderTask> = new Map();
    private animationID: number;
    private isRunning: boolean = false;
    
    // 帧率控制
    private targetFPS: number = 60;
    
    // 按需渲染
    private onDemandMode: boolean = false;
    private needsRender: boolean = true;
    
    // 错误处理
    private errorCount: number = 0;
    private maxErrors: number = 5;

    constructor(meta: any) {
        super(meta);
        this.clock = new THREE.Clock();
        this.animationID = 0;
    }

    private initialize() {
        this.isRunning = true;
        const render = () => {
            if (!this.isRunning) return;
            try {
                // 按需渲染检查
                if (this.onDemandMode && !this.needsRender) {
                    this.animationID = requestAnimationFrame(render);
                    return;
                }
                
                // 执行任务列表
                this.executeTasks();
                // 发出更新事件
                eventBus.emit("update", {
                    deltaTime: this?.clock?.getDelta() || 0,
                    elapsedTime: this?.clock?.getElapsedTime() || 0,
                });
                
                // 更新 TWEEN 动画
                TWEEN.update();
                
                this.needsRender = false;
            
                this.animationID = requestAnimationFrame(render);
            } catch (error) {
                this.handleRenderError(error);
            }
        };
        
        this.animationID = requestAnimationFrame(render);
    }

    private executeTasks(): void {
        if (this.taskList.size === 0) return;
        
        // 按优先级排序并执行任务
        const sortedTasks = Array.from(this.taskList.values())
            .filter(task => task.enabled)
            .sort((a, b) => a.priority - b.priority);
        
        for (const task of sortedTasks) {
            try {
                task.callback();
            } catch (error) {
                console.error(`任务执行错误 (ID: ${task.id}):`, error);
                this.handleTaskError(task.id, error);
            }
        }
    }

    private handleRenderError(error: any): void {
        console.error("渲染循环错误:", error);
        this.errorCount++;
        
        if (this.errorCount >= this.maxErrors) {
            console.error("渲染错误过多，停止渲染循环");
            this.pause();
            eventBus.emit("render-loop:critical-error", { error, errorCount: this.errorCount });
        } else {
            eventBus.emit("render-loop:error", { error, errorCount: this.errorCount });
            // 继续渲染
            this.animationID = requestAnimationFrame((time) => this.initialize());
        }
    }

    private handleTaskError(taskId: string, error: any): void {
        const task = this.taskList.get(taskId);
        if (task) {
            task.enabled = false; // 暂时禁用有错误的任务
            console.warn(`任务 ${taskId} 已被暂时禁用`);
        }
    }

    // 任务管理方法
    addTask(id: string, callback: () => void, priority: number = 0): void {
        this.taskList.set(id, {
            id,
            callback,
            priority,
            enabled: true
        });
        this.requestRender();
    }

    removeTask(id: string): boolean {
        const removed = this.taskList.delete(id);
        if (removed) {
            console.log(`任务 ${id} 已移除`);
        }
        return removed;
    }

    enableTask(id: string): boolean {
        const task = this.taskList.get(id);
        if (task) {
            task.enabled = true;
            this.requestRender();
            return true;
        }
        return false;
    }

    disableTask(id: string): boolean {
        const task = this.taskList.get(id);
        if (task) {
            task.enabled = false;
            return true;
        }
        return false;
    }

    getTargetFPS(): number {
        return this.targetFPS;
    }

    // 按需渲染方法
    setOnDemandMode(enabled: boolean): void {
        this.onDemandMode = enabled;
        console.log(`按需渲染模式: ${enabled ? '已启用' : '已禁用'}`);
        if (enabled) {
            this.needsRender = true; // 启用时渲染一次
        }
    }

    requestRender(): void {
        this.needsRender = true;
    }

    // 控制方法
    pause(): void {
        this.isRunning = false;
        if (this.animationID) {
            cancelAnimationFrame(this.animationID);
        }
        console.log("⏸️ 渲染循环已暂停");
        eventBus.emit("render-loop:paused");
    }

    resume(): void {
        if (!this.isRunning) {
            this.initialize();
            console.log("▶️ 渲染循环已恢复");
            eventBus.emit("render-loop:resumed");
        }
    }

    stop(): void {
        this.isRunning = false;
        if (this.animationID) {
            cancelAnimationFrame(this.animationID);
        }
        this.taskList.clear();
        console.log("⏹️ 渲染循环已停止");
        eventBus.emit("render-loop:stopped");
    }

    // 状态查询方法
    isActive(): boolean {
        return this.isRunning;
    }

    getTaskCount(): number {
        return this.taskList.size;
    }

    getEnabledTaskCount(): number {
        return Array.from(this.taskList.values()).filter(task => task.enabled).length;
    }

    getTaskList(): RenderTask[] {
        return Array.from(this.taskList.values()).map(task => ({ ...task }));
    }

    // 调试方法
    getDebugInfo(): any {
        return {
            isRunning: this.isRunning,
            targetFPS: this.targetFPS,
            onDemandMode: this.onDemandMode,
            taskCount: this.taskList.size,
            enabledTaskCount: this.getEnabledTaskCount(),
            errorCount: this.errorCount,
            tasks: this.getTaskList()
        };
    }
}

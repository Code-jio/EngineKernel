// 这个插件的功能主要有：
// 1. 拆分可互动楼层，并提供拆分动画（主要表现为：各个楼层在垂直方向上一层一层的展开）
// 2. 恢复楼层原有状态（将已拆分的楼层恢复到原有状态），并恢复建筑外立面的显示
// 3. 切换至指定楼层，并提供切换动画，切换完成时，其他楼层设置为半透明
// 

import { THREE, BasePlugin } from "../basePlugin"
import * as TWEEN from '@tweenjs/tween.js'

/**
 * 楼层状态枚举
 */
export enum FloorState {
    NORMAL = 'NORMAL',      // 正常显示状态
    EXPANDED = 'EXPANDED',  // 展开状态
    FOCUSED = 'FOCUSED'     // 聚焦状态（单层显示）
}

/**
 * 楼层项接口
 */
export interface FloorItem {
    group: THREE.Group          // 楼层组对象
    floorNumber: number         // 楼层号
    originalPosition: THREE.Vector3  // 原始位置
    targetPosition: THREE.Vector3    // 目标位置
    isVisible: boolean          // 是否可见
    opacity: number             // 透明度
    nodeCount: number           // 节点数量
}

/**
 * 楼层控制配置接口
 */
export interface FloorControlConfig {
    expandDistance: number        // 展开间距（每层之间的距离）
    animationDuration: number     // 动画持续时间（毫秒）
    focusOpacity: number         // 聚焦楼层透明度
    unfocusOpacity: number       // 非聚焦楼层透明度
    easingFunction: string       // 缓动函数
    showFacade: boolean          // 是否显示外立面
    autoHideFacade: boolean      // 展开时是否自动隐藏外立面
}

/**
 * 楼层控制事件类型
 */
export interface FloorControlEvents {
    onExpandStart?: () => void
    onExpandComplete?: () => void
    onCollapseStart?: () => void
    onCollapseComplete?: () => void
    onFloorFocus?: (floorNumber: number) => void
    onFloorUnfocus?: () => void
}

/**
 * 楼层控制插件
 * 
 * 功能：
 * 1. 拆分可互动楼层，并提供拆分动画（主要表现为：各个楼层在垂直方向上一层一层的展开）
 * 2. 恢复楼层原有状态（将已拆分的楼层恢复到原有状态），并恢复建筑外立面的显示
 * 3. 切换至指定楼层，并提供切换动画，切换完成时，其他楼层设置为半透明
 */
export class FloorControlPlugin extends BasePlugin {
    public name = "FloorControlPlugin"
    public version = "1.0.0"
    
    private currentState: FloorState = FloorState.NORMAL
    private floors: Map<number, FloorItem> = new Map()
    private facadeGroup: THREE.Group | null = null
    private floorsGroup: THREE.Group | null = null
    private currentBuildingModel: THREE.Group | null = null
    private activeTweens: TWEEN.Group = new TWEEN.Group()
    private focusedFloor: number | null = null
    
    // 默认配置
    private config: FloorControlConfig = {
        expandDistance: 50,
        animationDuration: 1000,
        focusOpacity: 1.0,
        unfocusOpacity: 0.3,
        easingFunction: 'Quadratic.InOut',
        showFacade: true,
        autoHideFacade: true
    }
    
    private events: FloorControlEvents = {}
    
    constructor(params: any = {}) {
        super(params)
        this.updateConfig(params.floorControlConfig || {})
        this.events = params.events || {}
    }
    
    public async init(coreInterface: any): Promise<void> {
        console.log(`🏗️ ${this.name} v${this.version} 已初始化`)
    }
    
    /**
     * 更新配置
     */
    public updateConfig(newConfig: Partial<FloorControlConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }
    
    /**
     * 设置建筑模型
     */
    public setBuildingModel(model: THREE.Group): boolean {
        if (!model.userData.isBuildingModel) {
            console.warn('⚠️ 传入的模型不是建筑模型')
            return false
        }
        
        this.currentBuildingModel = model
        this.floors.clear()
        this.facadeGroup = null
        this.floorsGroup = null
        
        // 查找外立面组和楼层组
        model.children.forEach(child => {
            if (child.name.includes('_facadeGroup')) {
                this.facadeGroup = child as THREE.Group
            } else if (child.name.includes('_floorsGroup')) {
                this.floorsGroup = child as THREE.Group
            }
        })
        
        if (!this.floorsGroup) {
            console.warn('⚠️ 未找到楼层组')
            return false
        }
        
        // 初始化楼层数据
        this.initializeFloors()
        
        console.log(`🏗️ 建筑模型已设置，包含 ${this.floors.size} 个楼层`)
        return true
    }
    
    /**
     * 初始化楼层数据
     */
    private initializeFloors(): void {
        if (!this.floorsGroup) return
        
        this.floorsGroup.children.forEach(child => {
            const floorGroup = child as THREE.Group
            if (floorGroup.userData.isFloorGroup) {
                const floorNumber = floorGroup.userData.floorNumber
                const originalPosition = floorGroup.position.clone()
                
                const floorItem: FloorItem = {
                    group: floorGroup,
                    floorNumber: floorNumber,
                    originalPosition: originalPosition,
                    targetPosition: originalPosition.clone(),
                    isVisible: true,
                    opacity: 1.0,
                    nodeCount: this.countFloorNodes(floorGroup)
                }
                
                this.floors.set(floorNumber, floorItem)
            }
        })
        
        console.log(`🏗️ 已初始化 ${this.floors.size} 个楼层:`, Array.from(this.floors.keys()).sort((a, b) => a - b))
    }
    
    /**
     * 计算楼层节点数量
     */
    private countFloorNodes(group: THREE.Group): number {
        let count = 0
        group.traverse(() => count++)
        return count - 1 // 减去group自身
    }
    
    /**
     * 展开所有楼层
     */
    public expandFloors(): Promise<void> {
        if (this.currentState === FloorState.EXPANDED) {
            console.log('🏗️ 楼层已经是展开状态')
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = FloorState.EXPANDED
            this.events.onExpandStart?.()
            
            // 自动隐藏外立面
            if (this.config.autoHideFacade && this.facadeGroup) {
                this.setFacadeVisibility(false)
            }
            
            const floorNumbers = Array.from(this.floors.keys()).sort((a, b) => a - b)
            const animations: Promise<void>[] = []
            
            floorNumbers.forEach((floorNumber, index) => {
                const floor = this.floors.get(floorNumber)!
                const targetY = floor.originalPosition.y + (index * this.config.expandDistance)
                floor.targetPosition.set(
                    floor.originalPosition.x,
                    targetY,
                    floor.originalPosition.z
                )
                
                animations.push(this.animateFloorPosition(floor))
            })
            
            Promise.all(animations).then(() => {
                this.events.onExpandComplete?.()
                resolve()
            })
        })
    }
    
    /**
     * 收回楼层到原位置
     */
    public collapseFloors(): Promise<void> {
        if (this.currentState === FloorState.NORMAL) {
            console.log('🏗️ 楼层已经是正常状态')
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = FloorState.NORMAL
            this.focusedFloor = null
            this.events.onCollapseStart?.()
            
            // 恢复外立面显示
            if (this.facadeGroup) {
                this.setFacadeVisibility(this.config.showFacade)
            }
            
            const animations: Promise<void>[] = []
            
            this.floors.forEach(floor => {
                floor.targetPosition.copy(floor.originalPosition)
                floor.opacity = 1.0
                animations.push(this.animateFloorPosition(floor))
                animations.push(this.animateFloorOpacity(floor, 1.0))
            })
            
            Promise.all(animations).then(() => {
                this.events.onCollapseComplete?.()
                resolve()
            })
        })
    }
    
    /**
     * 聚焦到指定楼层
     */
    public focusOnFloor(floorNumber: number): Promise<void> {
        const targetFloor = this.floors.get(floorNumber)
        if (!targetFloor) {
            console.warn(`⚠️ 未找到 ${floorNumber} 楼`)
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = FloorState.FOCUSED
            this.focusedFloor = floorNumber
            this.events.onFloorFocus?.(floorNumber)
            
            // 隐藏外立面
            if (this.facadeGroup) {
                this.setFacadeVisibility(false)
            }
            
            const animations: Promise<void>[] = []
            
            this.floors.forEach(floor => {
                if (floor.floorNumber === floorNumber) {
                    // 聚焦楼层：完全不透明
                    floor.opacity = this.config.focusOpacity
                    animations.push(this.animateFloorOpacity(floor, this.config.focusOpacity))
                } else {
                    // 其他楼层：半透明
                    floor.opacity = this.config.unfocusOpacity
                    animations.push(this.animateFloorOpacity(floor, this.config.unfocusOpacity))
                }
            })
            
            Promise.all(animations).then(() => {
                resolve()
            })
        })
    }
    
    /**
     * 显示所有楼层（取消聚焦）
     */
    public showAllFloors(): Promise<void> {
        if (this.currentState !== FloorState.FOCUSED) {
            return Promise.resolve()
        }
        
        return new Promise((resolve) => {
            this.currentState = this.currentState === FloorState.FOCUSED ? FloorState.EXPANDED : FloorState.NORMAL
            this.focusedFloor = null
            this.events.onFloorUnfocus?.()
            
            const animations: Promise<void>[] = []
            
            this.floors.forEach(floor => {
                floor.opacity = 1.0
                animations.push(this.animateFloorOpacity(floor, 1.0))
            })
            
            Promise.all(animations).then(() => {
                resolve()
            })
        })
    }
    
    /**
     * 设置楼层透明度
     */
    public setFloorOpacity(floorNumber: number, opacity: number): void {
        const floor = this.floors.get(floorNumber)
        if (!floor) return
        
        floor.opacity = opacity
        this.applyFloorOpacity(floor, opacity)
    }
    
    /**
     * 设置外立面可见性
     */
    public setFacadeVisibility(visible: boolean): void {
        if (this.facadeGroup) {
            this.facadeGroup.visible = visible
        }
    }
    
    /**
     * 动画化楼层位置
     */
    private animateFloorPosition(floor: FloorItem): Promise<void> {
        return new Promise((resolve) => {
            const currentPos = floor.group.position.clone()
            const targetPos = floor.targetPosition.clone()
            
            const tween = new TWEEN.Tween(currentPos, this.activeTweens)
                .to(targetPos, this.config.animationDuration)
                .easing(this.getEasingFunction())
                .onUpdate(() => {
                    floor.group.position.copy(currentPos)
                })
                .onComplete(() => {
                    this.removeTween(tween)
                    resolve()
                })
                .start()
        })
    }
    
    /**
     * 动画化楼层透明度
     */
    private animateFloorOpacity(floor: FloorItem, targetOpacity: number): Promise<void> {
        return new Promise((resolve) => {
            const current = { opacity: floor.opacity }
            
            const tween = new TWEEN.Tween(current, this.activeTweens)
                .to({ opacity: targetOpacity }, this.config.animationDuration)
                .easing(this.getEasingFunction())
                .onUpdate(() => {
                    this.applyFloorOpacity(floor, current.opacity)
                })
                .onComplete(() => {
                    this.removeTween(tween)
                    resolve()
                })
                .start()
        })
    }
    
    /**
     * 应用楼层透明度
     */
    private applyFloorOpacity(floor: FloorItem, opacity: number): void {
        floor.group.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = Array.isArray(child.material) ? child.material : [child.material]
                material.forEach(mat => {
                    if (mat instanceof THREE.Material) {
                        mat.transparent = opacity < 1.0
                        mat.opacity = opacity
                        mat.needsUpdate = true
                    }
                })
            }
        })
    }
    
    /**
     * 获取缓动函数
     */
    private getEasingFunction(): (k: number) => number {
        const easingMap: { [key: string]: (k: number) => number } = {
            'Linear.None': TWEEN.Easing.Linear.None,
            'Quadratic.In': TWEEN.Easing.Quadratic.In,
            'Quadratic.Out': TWEEN.Easing.Quadratic.Out,
            'Quadratic.InOut': TWEEN.Easing.Quadratic.InOut,
            'Cubic.In': TWEEN.Easing.Cubic.In,
            'Cubic.Out': TWEEN.Easing.Cubic.Out,
            'Cubic.InOut': TWEEN.Easing.Cubic.InOut,
        }
        
        return easingMap[this.config.easingFunction] || TWEEN.Easing.Quadratic.InOut
    }
    
    /**
     * 移除动画补间
     */
    private removeTween(tween: TWEEN.Tween<any>): void {
        this.activeTweens.remove(tween)
    }
    
    /**
     * 停止所有动画
     */
    public stopAllAnimations(): void {
        this.activeTweens.removeAll()
    }
    
    /**
     * 获取当前状态
     */
    public getCurrentState(): FloorState {
        return this.currentState
    }
    
    /**
     * 获取楼层信息
     */
    public getFloorInfo(): { 
        totalFloors: number
        floorNumbers: number[]
        currentState: FloorState
        focusedFloor: number | null
        floors: { [key: number]: { floorNumber: number, isVisible: boolean, opacity: number, nodeCount: number } }
    } {
        const floors: { [key: number]: { floorNumber: number, isVisible: boolean, opacity: number, nodeCount: number } } = {}
        
        this.floors.forEach((floor, floorNumber) => {
            floors[floorNumber] = {
                floorNumber: floor.floorNumber,
                isVisible: floor.isVisible,
                opacity: floor.opacity,
                nodeCount: floor.nodeCount
            }
        })
        
        return {
            totalFloors: this.floors.size,
            floorNumbers: Array.from(this.floors.keys()).sort((a, b) => a - b),
            currentState: this.currentState,
            focusedFloor: this.focusedFloor,
            floors: floors
        }
    }
    
    /**
     * 更新动画（在渲染循环中调用）
     */
    public update(): void {
        this.activeTweens.update()
    }
    
    /**
     * 销毁插件
     */
    public destroy(): void {
        this.stopAllAnimations()
        this.floors.clear()
        this.currentBuildingModel = null
        this.facadeGroup = null
        this.floorsGroup = null
        console.log(`🏗️ ${this.name} 已销毁`)
    }
} 
/**
 * 楼层控件插件使用示例
 * 
 * 本文件展示了如何使用FloorControlPlugin来控制建筑楼层
 */

import { BaseScene } from '../src/plugins/webgl/baseScene'
import { FloorControlPlugin, FloorState } from '../src/plugins/webgl/floorControlPlugin'
import { THREE } from '../src/plugins/basePlugin'

export class FloorControlExample {
    private scene: BaseScene
    private floorControl: FloorControlPlugin
    private buildingModel: THREE.Group | null = null
    
    constructor() {
        // 创建基础场景
        this.scene = BaseScene.createBalanced()
        
        // 创建楼层控件插件
        this.floorControl = new FloorControlPlugin({
            floorControlConfig: {
                expandDistance: 80,        // 展开间距80单位
                animationDuration: 1500,   // 动画时长1.5秒
                focusOpacity: 1.0,         // 聚焦楼层完全不透明
                unfocusOpacity: 0.2,       // 非聚焦楼层透明度20%
                easingFunction: 'Cubic.InOut',
                showFacade: true,
                autoHideFacade: true
            },
            events: {
                onExpandStart: () => console.log('🏗️ 开始展开楼层'),
                onExpandComplete: () => console.log('✅ 楼层展开完成'),
                onCollapseStart: () => console.log('🏗️ 开始收回楼层'),
                onCollapseComplete: () => console.log('✅ 楼层收回完成'),
                onFloorFocus: (floorNumber: number) => console.log(`🎯 聚焦到 ${floorNumber} 楼`),
                onFloorUnfocus: () => console.log('👁️ 取消楼层聚焦')
            }
        })
        
        // 初始化插件
        this.floorControl.init({})
        
        this.setupUI()
        this.setupAnimationLoop()
    }
    
    /**
     * 设置建筑模型
     */
    public setBuildingModel(model: THREE.Group): void {
        this.buildingModel = model
        const success = this.floorControl.setBuildingModel(model)
        
        if (success) {
            console.log('🏗️ 建筑模型设置成功')
            this.updateFloorInfo()
            this.updateUI()
        } else {
            console.error('❌ 建筑模型设置失败')
        }
    }
    
    /**
     * 设置UI控制界面
     */
    private setupUI(): void {
        const controlPanel = document.createElement('div')
        controlPanel.id = 'floorControlPanel'
        controlPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 20px;
            border-radius: 12px;
            font-family: 'Segoe UI', sans-serif;
            z-index: 1000;
            min-width: 280px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `
        
        controlPanel.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #4CAF50;">🏗️ 楼层控制面板</h3>
            
            <div style="margin-bottom: 15px;">
                <button id="expandFloors" class="control-btn">📤 展开楼层</button>
                <button id="collapseFloors" class="control-btn">📥 收回楼层</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">选择楼层：</label>
                <select id="floorSelect" class="control-select">
                    <option value="">请先加载建筑模型</option>
                </select>
                <button id="focusFloor" class="control-btn">🎯 聚焦楼层</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <button id="showAllFloors" class="control-btn">👁️ 显示所有楼层</button>
                <button id="toggleFacade" class="control-btn">🏢 切换外立面</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">动画速度：</label>
                <input type="range" id="animationSpeed" min="500" max="3000" value="1500" step="100" style="width: 100%;">
                <span id="speedValue">1.5s</span>
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">展开间距：</label>
                <input type="range" id="expandDistance" min="20" max="150" value="80" step="10" style="width: 100%;">
                <span id="distanceValue">80</span>
            </div>
            
            <div id="floorInfo" style="font-size: 12px; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 6px;">
                <strong>状态信息：</strong><br>
                <span id="statusText">等待建筑模型加载...</span>
            </div>
            
            <style>
                .control-btn {
                    background: #4CAF50;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    margin: 2px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.3s;
                }
                .control-btn:hover {
                    background: #45a049;
                }
                .control-btn:disabled {
                    background: #666;
                    cursor: not-allowed;
                }
                .control-select {
                    width: 100%;
                    padding: 6px;
                    margin: 2px 0;
                    background: #333;
                    color: white;
                    border: 1px solid #666;
                    border-radius: 4px;
                }
            </style>
        `
        
        document.body.appendChild(controlPanel)
        this.bindEvents()
    }
    
    /**
     * 绑定UI事件
     */
    private bindEvents(): void {
        // 展开楼层
        document.getElementById('expandFloors')?.addEventListener('click', async () => {
            await this.floorControl.expandFloors()
            this.updateFloorInfo()
        })
        
        // 收回楼层
        document.getElementById('collapseFloors')?.addEventListener('click', async () => {
            await this.floorControl.collapseFloors()
            this.updateFloorInfo()
        })
        
        // 聚焦楼层
        document.getElementById('focusFloor')?.addEventListener('click', async () => {
            const select = document.getElementById('floorSelect') as HTMLSelectElement
            const floorNumber = parseInt(select.value)
            if (!isNaN(floorNumber)) {
                await this.floorControl.focusOnFloor(floorNumber)
                this.updateFloorInfo()
            }
        })
        
        // 显示所有楼层
        document.getElementById('showAllFloors')?.addEventListener('click', async () => {
            await this.floorControl.showAllFloors()
            this.updateFloorInfo()
        })
        
        // 切换外立面
        document.getElementById('toggleFacade')?.addEventListener('click', () => {
            const info = this.floorControl.getFloorInfo()
            // 简单切换逻辑
            this.floorControl.setFacadeVisibility(info.currentState === FloorState.NORMAL)
        })
        
        // 动画速度调节
        document.getElementById('animationSpeed')?.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value)
            this.floorControl.updateConfig({ animationDuration: value })
            const speedValue = document.getElementById('speedValue')
            if (speedValue) speedValue.textContent = `${(value / 1000).toFixed(1)}s`
        })
        
        // 展开间距调节
        document.getElementById('expandDistance')?.addEventListener('input', (e) => {
            const value = parseInt((e.target as HTMLInputElement).value)
            this.floorControl.updateConfig({ expandDistance: value })
            const distanceValue = document.getElementById('distanceValue')
            if (distanceValue) distanceValue.textContent = value.toString()
        })
    }
    
    /**
     * 更新UI状态
     */
    private updateUI(): void {
        const info = this.floorControl.getFloorInfo()
        const floorSelect = document.getElementById('floorSelect') as HTMLSelectElement
        
        if (floorSelect && info.totalFloors > 0) {
            floorSelect.innerHTML = '<option value="">选择楼层</option>'
            info.floorNumbers.forEach(floorNumber => {
                const option = document.createElement('option')
                option.value = floorNumber.toString()
                option.textContent = `${floorNumber} 楼`
                floorSelect.appendChild(option)
            })
        }
    }
    
    /**
     * 更新楼层信息显示
     */
    private updateFloorInfo(): void {
        const info = this.floorControl.getFloorInfo()
        const statusText = document.getElementById('statusText')
        
        if (statusText) {
            let stateText = ''
            switch (info.currentState) {
                case FloorState.NORMAL:
                    stateText = '正常状态'
                    break
                case FloorState.EXPANDED:
                    stateText = '展开状态'
                    break
                case FloorState.FOCUSED:
                    stateText = `聚焦状态 (${info.focusedFloor}楼)`
                    break
            }
            
            statusText.innerHTML = `
                当前状态: ${stateText}<br>
                楼层总数: ${info.totalFloors} 层<br>
                楼层编号: ${info.floorNumbers.join(', ')}<br>
                ${info.focusedFloor ? `聚焦楼层: ${info.focusedFloor}楼<br>` : ''}
            `
        }
    }
    
    /**
     * 设置动画循环
     */
    private setupAnimationLoop(): void {
        const animate = () => {
            this.floorControl.update()
            requestAnimationFrame(animate)
        }
        animate()
    }
    
    /**
     * 演示楼层控制功能
     */
    public async demonstrateFloorControl(): Promise<void> {
        if (!this.buildingModel) {
            console.warn('⚠️ 请先设置建筑模型')
            return
        }
        
        console.log('🎬 开始演示楼层控制功能...')
        
        // 等待2秒
        await this.delay(2000)
        
        // 1. 展开楼层
        console.log('1. 展开所有楼层')
        await this.floorControl.expandFloors()
        await this.delay(3000)
        
        // 2. 聚焦到第2层
        const floorNumbers = this.floorControl.getFloorInfo().floorNumbers
        if (floorNumbers.length > 1) {
            console.log('2. 聚焦到第2层')
            await this.floorControl.focusOnFloor(floorNumbers[1])
            await this.delay(3000)
        }
        
        // 3. 聚焦到顶层
        if (floorNumbers.length > 0) {
            const topFloor = floorNumbers[floorNumbers.length - 1]
            console.log(`3. 聚焦到顶层 (${topFloor}楼)`)
            await this.floorControl.focusOnFloor(topFloor)
            await this.delay(3000)
        }
        
        // 4. 显示所有楼层
        console.log('4. 显示所有楼层')
        await this.floorControl.showAllFloors()
        await this.delay(2000)
        
        // 5. 收回楼层
        console.log('5. 收回楼层到原位置')
        await this.floorControl.collapseFloors()
        
        console.log('✅ 楼层控制演示完成')
    }
    
    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }
    
    /**
     * 销毁示例
     */
    public destroy(): void {
        this.floorControl.destroy()
        
        // 移除UI
        const panel = document.getElementById('floorControlPanel')
        if (panel) {
            panel.remove()
        }
        
        console.log('🏗️ 楼层控制示例已销毁')
    }
}

// 使用示例
export function createFloorControlExample(): FloorControlExample {
    return new FloorControlExample()
}

// 快速启动函数
export function quickStartFloorControl(buildingModel: THREE.Group): FloorControlExample {
    const example = new FloorControlExample()
    example.setBuildingModel(buildingModel)
    return example
} 
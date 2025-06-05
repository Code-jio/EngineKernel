/**
 * 地板功能使用示例
 * 
 * 本文件展示了如何使用BaseScene的地板功能
 */

import { BaseScene } from '../src/plugins/webgl/baseScene'

export class FloorExample {
    private scene: BaseScene
    
    constructor() {
        // 创建带水面地板的场景
        this.scene = BaseScene.createWithFloor('water', 20000, {
            waterConfig: {
                color: 0x001e0f,
                sunColor: 0xffffff,
                distortionScale: 3.7
            }
        })
        
        this.setupUI()
    }
    
    /**
     * 设置UI控制界面
     */
    private setupUI() {
        // 创建控制面板
        const controlPanel = document.createElement('div')
        controlPanel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            font-family: monospace;
            z-index: 1000;
        `
        
        controlPanel.innerHTML = `
            <h3>🏢 地板控制面板</h3>
            <div>
                <label>地板类型：</label>
                <select id="floorType">
                    <option value="water">水面地板</option>
                    <option value="static">静态地板</option>
                    <option value="grid">网格地板</option>
                    <option value="reflection">反射地板</option>
                    <option value="glow">发光地板</option>
                    <option value="infinite">无限地板</option>
                    <option value="none">无地板</option>
                </select>
            </div>
            <br>
            <div>
                <label>地板大小：</label>
                <input type="range" id="floorSize" min="5000" max="50000" value="20000" step="5000">
                <span id="sizeValue">20000</span>
            </div>
            <br>
            <div>
                <button id="toggleFloor">切换地板显示</button>
                <button id="getFloorInfo">获取地板信息</button>
            </div>
            <br>
            <div id="floorInfo" style="font-size: 12px; max-height: 200px; overflow-y: auto;"></div>
        `
        
        document.body.appendChild(controlPanel)
        
        // 绑定事件
        this.bindEvents()
    }
    
    /**
     * 绑定UI事件
     */
    private bindEvents() {
        const floorTypeSelect = document.getElementById('floorType') as HTMLSelectElement
        const floorSizeRange = document.getElementById('floorSize') as HTMLInputElement
        const sizeValueSpan = document.getElementById('sizeValue') as HTMLSpanElement
        const toggleButton = document.getElementById('toggleFloor') as HTMLButtonElement
        const infoButton = document.getElementById('getFloorInfo') as HTMLButtonElement
        const infoDiv = document.getElementById('floorInfo') as HTMLDivElement
        
        // 地板类型切换
        floorTypeSelect.addEventListener('change', () => {
            const type = floorTypeSelect.value as any
            const size = parseInt(floorSizeRange.value)
            
            if (type === 'none') {
                this.scene.toggleFloor(false)
            } else {
                this.scene.setFloorType(type)
                this.updateFloorSize(size)
            }
        })
        
        // 地板大小调整
        floorSizeRange.addEventListener('input', () => {
            const size = parseInt(floorSizeRange.value)
            sizeValueSpan.textContent = size.toString()
            this.updateFloorSize(size)
        })
        
        // 切换显示
        toggleButton.addEventListener('click', () => {
            const currentConfig = this.scene.getFloorConfig()
            this.scene.toggleFloor(!currentConfig.enabled)
            this.updateFloorInfo()
        })
        
        // 获取信息
        infoButton.addEventListener('click', () => {
            this.updateFloorInfo()
        })
        
        // 初始显示信息
        this.updateFloorInfo()
    }
    
    /**
     * 更新地板大小
     */
    private updateFloorSize(size: number) {
        this.scene.updateFloorConfig({ size })
    }
    
    /**
     * 更新地板信息显示
     */
    private updateFloorInfo() {
        const floorInfo = this.scene.getFloorInfo()
        const infoDiv = document.getElementById('floorInfo') as HTMLDivElement
        
        infoDiv.innerHTML = `
            <strong>配置信息：</strong><br>
            类型: ${floorInfo.config.type}<br>
            启用: ${floorInfo.config.enabled ? '是' : '否'}<br>
            大小: ${floorInfo.config.size}<br>
            位置: [${floorInfo.config.position.join(', ')}]<br>
            <br>
            <strong>渲染信息：</strong><br>
            ${floorInfo.floorInfo ? `
                材质: ${floorInfo.floorInfo.material}<br>
                几何体: ${floorInfo.floorInfo.geometry}<br>
                顶点数: ${floorInfo.floorInfo.vertexCount}<br>
                可见: ${floorInfo.floorInfo.visible ? '是' : '否'}
            ` : '暂无地板'}
        `
    }
    
    /**
     * 演示不同地板类型
     */
    public demonstrateFloorTypes() {
        console.log('🎬 开始演示不同地板类型...')
        
        // 演示序列
        const demonstrations = [
            () => {
                console.log('1. 水面地板')
                this.scene.setWaterFloor(20000, {
                    color: 0x001e0f,
                    distortionScale: 4.0
                })
            },
            () => {
                console.log('2. 静态地板')
                this.scene.setStaticFloor(15000, {
                    color: 0x8B4513,
                    roughness: 0.8
                })
            },
            () => {
                console.log('3. 网格地板')
                this.scene.setGridFloor(10000, {
                    gridSize: 200,
                    primaryColor: 0x404040,
                    secondaryColor: 0x808080
                })
            },
            () => {
                console.log('4. 反射地板')
                this.scene.setReflectionFloor(25000, {
                    reflectivity: 0.9,
                    color: 0x202020
                })
            },
            () => {
                console.log('5. 发光地板')
                this.scene.setGlowFloor(12000, {
                    color: 0x0088ff,
                    pulseSpeed: 2.0
                })
            },
            () => {
                console.log('6. 无限地板')
                this.scene.setInfiniteFloor(8000, {
                    gridSize: 50,
                    followCamera: true
                })
            }
        ]
        
        // 每3秒切换一次
        demonstrations.forEach((demo, index) => {
            setTimeout(demo, index * 3000)
        })
    }
    
    /**
     * 获取场景实例
     */
    public getScene(): BaseScene {
        return this.scene
    }
}

// 使用示例
// const floorExample = new FloorExample()
// floorExample.demonstrateFloorTypes() 
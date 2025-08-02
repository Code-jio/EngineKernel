import { CSS3DRenderPlugin } from '../src/plugins/webgl/css3DRender'

// 创建CSS3D渲染插件实例
const css3dPlugin = new CSS3DRenderPlugin()

// 示例1：创建屏幕空间标记
function createScreenSpaceMarker() {
    const element = document.createElement('div')
    element.style.cssText = `
        background: rgba(255, 100, 100, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        pointer-events: auto;
        cursor: pointer;
    `
    element.textContent = '屏幕空间标记'
    
    // 创建屏幕空间对象
    const markerId = css3dPlugin.createCSS3DObject(element, {
        screenSpace: true,           // 启用屏幕空间定位
        position: [-1, 1, 0],      // 3D坐标，将自动转换为屏幕坐标
        display: true
    })
    
    return markerId
}

// 示例2：创建多个屏幕空间对象
function createScreenSpaceObjects() {
    const positions = [
        [-2, 1, 0],   // 左上
        [0, 1, 0],    // 中上
        [2, 1, 0],    // 右上
        [-2, 0, 0],   // 左中
        [0, 0, 0],    // 中心
        [2, 0, 0],    // 右中
        [-2, -1, 0],  // 左下
        [0, -1, 0],   // 中下
        [2, -1, 0]    // 右下
    ]
    
    return positions.map((pos, index) => {
        const element = document.createElement('div')
        element.style.cssText = `
            background: rgba(100, 150, 255, 0.9);
            color: white;
            padding: 6px 10px;
            border-radius: 3px;
            font-size: 12px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            pointer-events: auto;
            cursor: pointer;
        `
        element.textContent = `对象${index + 1}`
        
        return css3dPlugin.createCSS3DObject(element, {
            screenSpace: true,
            position: pos,  // 3D坐标
            display: true
        })
    })
}

// 示例3：动态更新屏幕空间对象位置
function createDynamicMarker() {
    const element = document.createElement('div')
    element.style.cssText = `
        background: rgba(255, 200, 100, 0.9);
        color: black;
        padding: 10px 15px;
        border-radius: 20px;
        font-size: 16px;
        font-weight: bold;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        pointer-events: auto;
        cursor: move;
    `
    element.textContent = '拖动我'
    
    const markerId = css3dPlugin.createCSS3DObject(element, {
        screenSpace: true,
        position: [-2, 2, 0],  // 3D坐标
        display: true
    })
    
    // 添加拖动功能（使用3D坐标）
    let isDragging = false
    let startX = 0
    let startY = 0
    let startPosX = 0
    let startPosY = 0
    
    element.addEventListener('mousedown', (e) => {
        isDragging = true
        startX = e.clientX
        startY = e.clientY
        
        const currentConfig = css3dPlugin.getObjectConfig(markerId)
        if (currentConfig && currentConfig.position) {
            startPosX = currentConfig.position[0]
            startPosY = currentConfig.position[1]
        }
        
        element.style.cursor = 'grabbing'
    })
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return
        
        const deltaX = (e.clientX - startX) / 100  // 转换为3D坐标比例
        const deltaY = (startY - e.clientY) / 100  // 反转Y轴并转换
        
        const newX = startPosX + deltaX
        const newY = startPosY + deltaY
        
        css3dPlugin.setScreenPosition(markerId, [newX, newY, 0])
    })
    
    document.addEventListener('mouseup', () => {
        isDragging = false
        element.style.cursor = 'move'
    })
    
    return markerId
}

// 示例4：混合使用3D和屏幕空间对象
function createMixedScene() {
    // 创建3D空间对象
    const element3d = document.createElement('div')
    element3d.style.cssText = `
        background: rgba(100, 255, 100, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        transform-style: preserve-3d;
    `
    element3d.textContent = '3D空间对象'
    
    css3dPlugin.createCSS3DObject(element3d, {
        position: [0, 0, 0],  // 3D空间坐标
        screenSpace: false,   // 3D空间定位
        display: true,
        billboarding: true   // 朝向相机
    })
    
    // 创建屏幕空间对象
    const elementScreen = document.createElement('div')
    elementScreen.style.cssText = `
        background: rgba(255, 100, 100, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `
    elementScreen.textContent = '屏幕空间对象'
    
    css3dPlugin.createCSS3DObject(elementScreen, {
        screenSpace: true,
        position: [-3, 3, 0],  // 3D坐标
        display: true
    })
}

// 初始化函数
export function initScreenSpaceDemo() {
    console.log('🎯 初始化CSS3D屏幕空间定位示例')
    
    // 确保DOM已加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init)
    } else {
        init()
    }
    
    function init() {
        // 初始化CSS3D插件
        css3dPlugin.init()
        
        // 创建示例
        createScreenSpaceMarker()
        createScreenSpaceObjects()
        createDynamicMarker()
        createMixedScene()
        createOffsetScreenSpaceObjects()  // 添加偏移示例
        createDynamicOffsetMarker()       // 添加动态偏移示例
        
        console.log('✅ CSS3D屏幕空间定位示例已加载')
        
        // 添加说明文本
        const info = document.createElement('div')
        info.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 5px;
            font-size: 14px;
            max-width: 300px;
            z-index: 10000;
        `
        info.innerHTML = `
            <h3 style="margin: 0 0 10px 0; font-size: 16px;">CSS3D屏幕空间定位示例</h3>
            <p style="margin: 5px 0;">• 红色标记：屏幕空间对象</p>
            <p style="margin: 5px 0;">• 蓝色对象：屏幕空间网格布局</p>
            <p style="margin: 5px 0;">• 黄色标记：可拖动对象</p>
            <p style="margin: 5px 0;">• 绿色对象：3D空间对象</p>
            <p style="margin: 5px 0;">• 橙色对象：屏幕偏移示例</p>
            <p style="margin: 5px 0;">• 绿色标记：动态偏移示例</p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #ccc;">
                屏幕空间对象使用3D坐标，自动转换为屏幕坐标
            </p>
        `
        document.body.appendChild(info)
    }
}

// 导出供外部使用
export default {
    initScreenSpaceDemo,
    css3dPlugin
}

// 示例5：使用屏幕空间偏移
function createOffsetScreenSpaceObjects() {
    const positions = [
        [-2, 1, 0],   // 左上
        [0, 1, 0],    // 中上
        [2, 1, 0],    // 右上
    ]
    
    const offsets = [
        [-20, -20],   // 左上偏移
        [0, -20],     // 中上偏移
        [20, -20],    // 右上偏移
    ]
    
    return positions.map((pos, index) => {
        const element = document.createElement('div')
        element.style.cssText = `
            background: rgba(255, 150, 50, 0.9);
            color: white;
            padding: 6px 10px;
            border-radius: 3px;
            font-size: 12px;
            box-shadow: 0 1px 4px rgba(0,0,0,0.3);
            pointer-events: auto;
            cursor: pointer;
        `
        element.textContent = `偏移${index + 1}`
        
        return css3dPlugin.createCSS3DObject(element, {
            screenSpace: true,
            position: pos,           // 3D坐标
            screenOffset: offsets[index], // 屏幕空间偏移（像素）
            display: true
        })
    })
}

// 示例6：动态调整屏幕空间偏移
function createDynamicOffsetMarker() {
    const element = document.createElement('div')
    element.style.cssText = `
        background: rgba(150, 255, 150, 0.9);
        color: black;
        padding: 10px 15px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: bold;
        box-shadow: 0 3px 10px rgba(0,0,0,0.3);
        pointer-events: auto;
        cursor: pointer;
    `
    element.textContent = '点击切换偏移'
    
    const markerId = css3dPlugin.createCSS3DObject(element, {
        screenSpace: true,
        position: [0, -2, 0],      // 3D坐标
        screenOffset: [0, 50],     // 屏幕空间偏移（像素）
        display: true
    })
    
    // 点击切换偏移
    let offsetIndex = 0
    const offsets = [
        [0, 50],    // 下方50像素
        [50, 0],    // 右侧50像素
        [-50, 0],   // 左侧50像素
        [0, -50],   // 上方50像素
    ]
    
    element.addEventListener('click', () => {
        offsetIndex = (offsetIndex + 1) % offsets.length
        const newOffset = offsets[offsetIndex]
        
        // 更新偏移（需要重新创建对象来更新配置）
        const currentConfig = css3dPlugin.getObjectConfig(markerId)
        if (currentConfig) {
            css3dPlugin.removeObject(markerId)
            
            css3dPlugin.createCSS3DObject(element, {
                ...currentConfig,
                screenOffset: newOffset
            })
            
            element.textContent = `偏移: ${newOffset[0]}, ${newOffset[1]}`
        }
    })
    
    return markerId
}
# CSS3D插件 - EventBus渲染循环集成

## 🎯 概述

CSS3D插件现在完全支持通过 `eventBus.on("update", () => {})` 的方式集成到渲染循环中，与WebGL渲染器完美同步。

## 🔧 核心实现

### 自动集成（推荐）
```typescript
// 创建CSS3D插件实例
const css3dPlugin = new CSS3DRenderPlugin(meta)

// 初始化时自动集成到渲染循环
await css3dPlugin.init()
// ✅ 自动监听 eventBus.on("update", () => {})
```

### 手动控制
```typescript
// 手动启动渲染循环
css3dPlugin.startRenderLoop()

// 手动停止渲染循环
css3dPlugin.stopRenderLoop()

// 设置渲染模式
css3dPlugin.setRenderMode('continuous')  // 连续渲染
css3dPlugin.setRenderMode('onDemand')   // 按需渲染
```

## 🎬 渲染模式详解

### 连续渲染模式（默认）
```typescript
css3dPlugin.setRenderMode('continuous')
```
- **特点**：每帧都进行渲染
- **适用场景**：有相机控制、动画对象的交互场景
- **性能**：CPU占用较高，但响应最快

### 按需渲染模式
```typescript
css3dPlugin.setRenderMode('onDemand')
```
- **特点**：仅在有变化时渲染
- **适用场景**：静态UI界面、表单组件
- **性能**：CPU占用低，节能环保

## 📋 完整使用示例

```typescript
import { CSS3DRenderPlugin } from './css3DRender'
import eventBus from '../../eventBus/eventBus'

// 1. 创建插件实例
const css3dPlugin = new CSS3DRenderPlugin({
    userData: {
        scene: mainScene,
        camera: mainCamera
    }
})

// 2. 初始化插件（自动集成eventBus）
await css3dPlugin.init()

// 3. 创建CSS3D对象
const objectId = css3dPlugin.createCSS3DObject({
    element: document.querySelector('#my-vue-component'),
    position: [0, 0, -100],
    scale: 1.2
})

// 4. 设置渲染模式（可选）
css3dPlugin.setRenderMode('continuous')

// 5. 渲染循环会自动运行，响应以下事件：
// - 窗口大小变化
// - 对象创建/删除
// - 手动标记需要渲染
```

## ⚡ 性能优化特性

### 帧率限制
```typescript
// 自动限制最大60FPS，避免过度渲染
// 每帧间隔至少16.67ms（60FPS）
```

### 智能渲染判断
```typescript
// 连续模式：每帧渲染
// 按需模式：仅在needsRender为true时渲染
const shouldRender = this.renderMode === 'continuous' || 
                    (this.renderMode === 'onDemand' && this.needsRender)
```

## 🔄 与其他插件的协同

### RenderLoop插件
```typescript
// RenderLoop每帧触发update事件
eventBus.emit("update")

// CSS3D插件响应update事件
eventBus.on("update", () => {
    this.update()  // 执行CSS3D渲染
})
```

### BaseScene插件
```typescript
// 两个渲染器同步工作
eventBus.on("update", () => {
    // WebGL渲染
    webglRenderer.render(scene, camera)
    
    // CSS3D渲染（由CSS3D插件处理）
    css3dRenderer.render(scene, camera)
})
```

## 🛡️ 错误处理

```typescript
// 自动错误捕获和日志
try {
    this.css3Drenderer.render(this.mainScene, this.camera)
} catch (error) {
    console.error('CSS3D渲染失败:', error)
}
```

## 🧹 资源清理

```typescript
// 销毁时自动清理eventBus监听器
css3dPlugin.destroyPlugin()
// ✅ 自动移除 eventBus.off("update", handler)
```

## 💡 最佳实践

1. **初始化顺序**：先创建BaseScene，再创建CSS3D插件
2. **渲染模式选择**：动画场景用continuous，静态UI用onDemand
3. **性能监控**：在开发环境下监控渲染频率
4. **错误处理**：捕获并处理渲染异常
5. **资源清理**：组件销毁时调用destroyPlugin() 
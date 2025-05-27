# 相机移动范围限制说明

为了确保用户视角始终保持在天空盒范围内，提供更好的用户体验，我们为轨道控制器添加了移动范围限制功能。

## 🎯 功能特性

- ✅ **边界限制**：相机不能移动超出指定的边界半径
- ✅ **距离控制**：设置最小和最大观察距离
- ✅ **角度限制**：防止相机翻转或过度旋转
- ✅ **智能拉回**：当相机超出边界时自动拉回到安全区域
- ✅ **实时监控**：提供距离检测和警告功能

## 📐 默认限制设置

### 边界配置

```javascript
{
    boundaryRadius: 20000,     // 移动边界半径
    maxDistance: 20000,        // 最大观察距离
    minDistance: 1,            // 最小观察距离
    minPolarAngle: 0.1,        // 最小极角（防止翻转）
    maxPolarAngle: Math.PI - 0.1, // 最大极角
}
```

### 与天空盒的关系

- **天空盒大小**: 50000 units
- **相机边界**: 20000 units（天空盒的40%）
- **安全裕度**: 确保用户永远看不到天空盒边缘

## 🚀 配置方法

### 在插件注册时配置

```javascript
engine.register({
    name: "orbitControl",
    pluginClass: EngineKernel.orbitControls,
    userData: {
        camera: baseScene.camera,
        domElement: baseScene.renderer.domElement,
        orbitControlOptions: {
            damping: true,
            dampingFactor: 0.05,
            minDistance: 1,
            maxDistance: 20000,
            minPolarAngle: 0.1,
            maxPolarAngle: Math.PI - 0.1,
            boundaryRadius: 20000,
        },
    },
})
```

### 运行时动态配置

```javascript
const orbitControl = engine.getPlugin("orbitControl")

// 调整边界半径
orbitControl.setBoundaryRadius(15000)

// 配置其他参数
orbitControl.configure({
    minDistance: 5,
    maxDistance: 18000,
    dampingFactor: 0.1
})
```

## 📱 API方法

### setBoundaryRadius(radius: number)

设置相机移动的边界半径。

```javascript
orbitControl.setBoundaryRadius(15000)
```

### getDistanceFromCenter(): number

获取当前相机到场景中心的距离。

```javascript
const distance = orbitControl.getDistanceFromCenter()
console.log(`当前距离: ${distance}`)
```

### resetToSafePosition()

重置相机到安全位置（边界半径的30%处）。

```javascript
orbitControl.resetToSafePosition()
```

### configure(options: OrbitControlPluginOptions)

动态配置控制器参数。

```javascript
orbitControl.configure({
    boundaryRadius: 18000,
    maxDistance: 16000,
    dampingFactor: 0.08
})
```

## 🎮 用户体验优化

### 平滑限制

- 当相机接近边界时，会平滑地被拉回
- 不会出现突然的跳跃或卡顿
- 保持自然的操作感觉

### 视觉反馈

- 控制台会显示距离警告
- 边界触发时会有日志提示
- 可以监听事件来添加UI提示

### 智能调整

- 根据场景内容可以动态调整边界
- 支持不同场景使用不同的限制参数
- 可以根据设备性能调整限制策略

## 📊 监控和调试

### 距离监控

```javascript
// 监听相机移动事件
EngineKernel.eventBus.on("camera-moved", () => {
    const distance = orbitControl.getDistanceFromCenter()
    if (distance > 18000) {
        console.log(`警告：相机接近边界，距离: ${distance}`)
    }
})
```

### 调试信息

```javascript
// 检查当前状态
console.log("相机状态:", {
    position: orbitControl.camera.position,
    distance: orbitControl.getDistanceFromCenter(),
    boundaryRadius: orbitControl.boundaryRadius
})
```

## ⚙️ 高级配置

### 根据内容调整边界

```javascript
// 根据模型大小动态调整
function adjustBoundaryForModel(modelBoundingBox) {
    const modelSize = modelBoundingBox.getSize(new THREE.Vector3())
    const maxModelDimension = Math.max(modelSize.x, modelSize.y, modelSize.z)
    const recommendedBoundary = maxModelDimension * 10
  
    orbitControl.setBoundaryRadius(Math.min(recommendedBoundary, 20000))
}
```

### 分层边界系统

```javascript
// 不同距离的不同行为
EngineKernel.eventBus.on("camera-moved", () => {
    const distance = orbitControl.getDistanceFromCenter()
  
    if (distance > 18000) {
        // 警告区域：显示边界提示
        showBoundaryWarning(true)
    } else if (distance > 15000) {
        // 舒适区域：正常操作
        showBoundaryWarning(false)
    } else {
        // 核心区域：最佳观察区域
        hideAllWarnings()
    }
})
```

## 🎨 最佳实践

1. **边界设置**：设置为天空盒大小的30-50% 1
2. **最大距离**：等于或小于边界半径
3. **阻尼参数**：0.05-0.1之间较为舒适
4. **角度限制**：防止用户迷失方向
5. **实时监控**：监听相机事件以提供反馈

## ⚠️ 注意事项

- 边界半径应该远小于天空盒大小
- 最大距离不应超过边界半径
- 启用阻尼会让控制更加平滑
- 在移动设备上可能需要调整灵敏度参数

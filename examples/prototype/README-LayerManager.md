# LayerManager 演示说明

## 🎯 演示概述

这个演示展示了如何在3D引擎中使用LayerManager插件来管理场景中的不同对象。

## 🎬 演示内容

### 自动演示对象

1. **红色立方体** - 添加到基础模型图层
2. **青色球体** - 添加到模型标注图层  
3. **马模型** - 添加到自定义动物模型图层
4. **文字标签精灵** - 添加到精灵图层

### 自动演示序列

程序会自动执行以下演示：

- **3秒后** - 隐藏模型标注图层（青色球体消失）
- **6秒后** - 显示模型标注图层（青色球体重新出现）
- **9秒后** - 设置动物图层透明度为50%
- **12秒后** - 恢复动物图层透明度为100%
- **15秒后** - 隐藏精灵图层（文字标签消失）
- **18秒后** - 显示精灵图层（文字标签重新出现）
- **21秒后** - 显示图层统计信息

## 🎹 交互控制

### 键盘控制

| 按键 | 功能 |
|------|------|
| `1` | 切换基础模型图层（红色立方体）|
| `2` | 切换模型标注图层（青色球体）|
| `3` | 切换精灵图层（文字标签）|
| `4` | 切换动物模型图层（马模型）|
| `S` | 显示图层统计信息 |
| `H` | 显示帮助信息 |

### 鼠标控制

- **左键拖拽** - 旋转视角
- **右键拖拽** - 平移视角
- **滚轮** - 缩放视角

## 🎭 图层类型说明

### 预定义图层类型

1. **BASE_SCENE** (渲染顺序: 0) - 基础场景元素
2. **BASE_MODEL** (渲染顺序: 100) - 基础3D模型
3. **MODEL_ANNOTATION** (渲染顺序: 200) - 3D模型标注
4. **SPRITE** (渲染顺序: 300) - 2D精灵图
5. **CSS3D** (渲染顺序: 400) - HTML元素3D化
6. **IMAGE_ANNOTATION** (渲染顺序: 500) - 图片标注
7. **CUSTOM** (自定义) - 用户自定义图层

## 🔍 观察要点

### 控制台输出

打开浏览器开发者工具的控制台，可以看到：

- 图层创建日志
- 图层操作日志
- 键盘交互反馈
- 图层统计信息

### 视觉效果

- 观察不同图层对象的显示/隐藏
- 注意透明度变化效果
- 观察渲染顺序的影响

## 💡 技术要点

### LayerManager特性

1. **自动图层管理** - 默认创建6种预定义图层
2. **层级结构** - 支持父子图层关系
3. **渲染顺序** - 通过renderOrder控制渲染优先级
4. **批量操作** - 按类型批量显示/隐藏图层
5. **事件系统** - 图层操作会触发相应事件
6. **资源管理** - 自动清理THREE.js对象

### 性能优化

- 使用图层批量控制可见性，提升性能
- 按需显示复杂对象，降低渲染负担
- 通过透明度控制实现渐变效果

## 🚀 扩展建议

### 自定义图层

```javascript
// 创建LOD图层组
const lodGroup = layerManager.createLayer({
    id: 'lod-group',
    name: 'LOD图层组',
    type: EngineKernel.LayerType.CUSTOM,
    renderOrder: 120
})

// 创建不同精度的子图层
['high', 'medium', 'low'].forEach((level, index) => {
    layerManager.createLayer({
        id: `lod-${level}`,
        name: `LOD-${level}`,
        type: EngineKernel.LayerType.BASE_MODEL,
        parent: 'lod-group',
        renderOrder: 120 + index,
        visible: index === 0 // 只显示高精度
    })
})
```

### 距离控制

```javascript
// 根据相机距离控制图层显示
function updateLODByDistance(cameraPosition) {
    const distance = cameraPosition.length()
    
    if (distance > 2000) {
        layerManager.hideLayersByType(EngineKernel.LayerType.MODEL_ANNOTATION)
    } else {
        layerManager.showLayersByType(EngineKernel.LayerType.MODEL_ANNOTATION)
    }
}
```

## 🐛 故障排除

### 常见问题

1. **图层不显示** - 检查图层可见性和渲染顺序
2. **模型加载失败** - 确认模型文件路径正确
3. **键盘控制无效** - 确保页面已获得焦点

### 调试技巧

```javascript
// 打印所有图层信息
layerManager.getAllLayers().forEach(layer => {
    console.log(`图层: ${layer.name}, 可见: ${layer.visible}, 对象数: ${layer.group.children.length}`)
})

// 检查图层统计
console.log(layerManager.getLayerStats())
```

这个演示充分展示了LayerManager的强大功能，是学习3D场景图层管理的绝佳示例！ 
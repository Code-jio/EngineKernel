# WaterMarker - 指定轮廓的水体渲染

## 概述

`WaterMarker` 是一个用于创建基于自定义轮廓的3D水体渲染的类。它可以根据输入的高度和轮廓坐标数组，创建一个具有真实水体效果的3D棱柱体，包含：

- **水面（顶面）**：使用自定义着色器实现波浪动画、反射和折射效果
- **底面**：深色半透明材质
- **侧面**：半透明材质，模拟水体边缘

## 功能特性

✨ **核心功能**
- 🌊 基于轮廓点创建任意形状的水体
- 💎 真实的水面着色器效果（波浪、反射、折射）
- 🎬 动态波浪动画
- 🎨 可自定义颜色、透明度、反射强度等参数
- 📐 支持动态更新轮廓和属性

✨ **高级功能**
- 🔄 完整的生命周期管理（创建、更新、销毁）
- 📦 场景管理（添加到场景、从场景移除）
- ⚙️ 丰富的配置选项
- 🛠️ 便捷的API接口

## 安装和导入

```typescript
import WaterMarker from "../src/plugins/webgl/waterMarker";
import { THREE } from "../src/plugins/basePlugin";
```

## 基本用法

### 1. 创建简单的矩形池塘

```typescript
// 定义矩形轮廓
const contour = [
    new THREE.Vector3(-5, 0, -3),
    new THREE.Vector3(5, 0, -3),
    new THREE.Vector3(5, 0, 3),
    new THREE.Vector3(-5, 0, 3)
];

// 创建水体
const waterMarker = new WaterMarker({
    height: 2,                    // 水体高度
    contour: contour,            // 轮廓坐标
    position: new THREE.Vector3(0, 0, 0),  // 位置
    waterColor: 0x0088cc,        // 水体颜色
    transparency: 0.8,           // 透明度
    reflectivity: 0.9,           // 反射强度
    enableAnimation: true        // 启用动画
});

// 添加到场景
waterMarker.addToScene(scene);

// 在渲染循环中更新
function update() {
    waterMarker.update(performance.now());
}
```

### 2. 创建圆形湖泊

```typescript
// 生成圆形轮廓
const circularContour: THREE.Vector3[] = [];
const radius = 8;
const segments = 16;

for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    circularContour.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
    ));
}

const lake = new WaterMarker({
    height: 3,
    contour: circularContour,
    waterColor: 0x1166aa,
    transparency: 0.7,
    waveScale: 1.5,
    enableAnimation: true
});
```

## 配置选项

### WaterMarkerOptions 接口

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `height` | `number` | ✅ | - | 水体高度 |
| `contour` | `THREE.Vector3[]` | ✅ | - | 轮廓坐标数组（至少3个点） |
| `position` | `THREE.Vector3` | ❌ | `(0,0,0)` | 水体位置 |
| `waterColor` | `number` | ❌ | `0x4a90e2` | 水体颜色 |
| `transparency` | `number` | ❌ | `0.7` | 透明度 (0-1) |
| `reflectivity` | `number` | ❌ | `0.8` | 反射强度 (0-1) |
| `refractionRatio` | `number` | ❌ | `1.33` | 折射比率 |
| `flowSpeed` | `number` | ❌ | `0.5` | 水流速度 |
| `waveScale` | `number` | ❌ | `1.0` | 波纹缩放 |
| `distortionScale` | `number` | ❌ | `3.7` | 扭曲强度 |
| `enableAnimation` | `boolean` | ❌ | `true` | 是否启用动画 |
| `waterNormalsTexture` | `string` | ❌ | - | 水面法线贴图路径 |

## 主要方法

### 生命周期管理

```typescript
// 添加到场景
waterMarker.addToScene(scene);

// 从场景移除
waterMarker.removeFromScene();

// 销毁资源
waterMarker.dispose();
```

### 属性控制

```typescript
// 设置水体颜色
waterMarker.setWaterColor(0x0099ff);

// 设置透明度
waterMarker.setTransparency(0.8);

// 设置波浪参数
waterMarker.setWaveParameters(2.0, 4.0);

// 启用/禁用动画
waterMarker.setAnimationEnabled(true);
```

### 位置和轮廓

```typescript
// 设置位置
waterMarker.setPosition(new THREE.Vector3(10, 0, 10));

// 获取位置
const position = waterMarker.getPosition();

// 更新轮廓（重新生成几何体）
waterMarker.updateContour(newContour);
```

### 状态查询

```typescript
// 获取配置信息
const options = waterMarker.getOptions();

// 获取群组对象
const group = waterMarker.getGroup();
```

## 高级用法

### 批量管理多个水体

```typescript
import { WaterBodyManager } from "../examples/waterMarker-usage-example";

// 创建管理器
const waterManager = new WaterBodyManager(scene);

// 添加多个水体
waterManager.addWaterBody(pond);
waterManager.addWaterBody(lake);
waterManager.addWaterBody(river);

// 统一控制
waterManager.setAllAnimationEnabled(true);
waterManager.changeAllWaterColor(0x0088cc);
waterManager.setAllTransparency(0.8);

// 在渲染循环中更新
function update() {
    waterManager.update(performance.now());
}

// 获取统计信息
const stats = waterManager.getStatistics();
console.log(`当前有 ${stats.count} 个水体`);
```

### 与BaseScene集成

```typescript
import { exampleUsageInBaseScene } from "../examples/waterMarker-usage-example";

// 在BaseScene中使用
const baseScene = new BaseScene(config);
const waterManager = exampleUsageInBaseScene(baseScene);
```

## 性能优化建议

### 1. 轮廓优化
- 使用合理的轮廓点数量（推荐10-30个点）
- 避免过于复杂的轮廓形状
- 对于圆形，使用12-24个分段即可

### 2. 动画控制
```typescript
// 根据距离相机的远近控制动画
const distance = camera.position.distanceTo(waterMarker.getPosition());
if (distance > 100) {
    waterMarker.setAnimationEnabled(false);  // 远距离禁用动画
} else {
    waterMarker.setAnimationEnabled(true);   // 近距离启用动画
}
```

### 3. LOD (Level of Detail)
```typescript
// 根据距离调整波浪细节
const distance = camera.position.distanceTo(waterMarker.getPosition());
if (distance > 50) {
    waterMarker.setWaveParameters(0.5, 1.0);  // 低细节
} else {
    waterMarker.setWaveParameters(2.0, 4.0);  // 高细节
}
```

## 示例场景

### 1. 建筑景观设计
```typescript
// 创建建筑物周围的装饰水池
const decorativePool = new WaterMarker({
    height: 0.8,
    contour: lShapedContour,
    waterColor: 0x0099dd,
    transparency: 0.9,
    reflectivity: 1.0,
    waveScale: 0.8
});
```

### 2. 自然环境模拟
```typescript
// 创建河流段
const river = new WaterMarker({
    height: 1.5,
    contour: curvedRiverContour,
    waterColor: 0x4a7c8a,
    flowSpeed: 0.8,
    waveScale: 3.0,
    distortionScale: 5.0
});
```

### 3. 游戏场景
```typescript
// 创建湖泊
const gameLake = new WaterMarker({
    height: 5,
    contour: irregularLakeContour,
    waterColor: 0x1144aa,
    transparency: 0.6,
    reflectivity: 0.9,
    enableAnimation: true
});
```

## 注意事项

⚠️ **重要提醒**
1. 轮廓数组至少需要3个点，否则会抛出错误
2. 水体高度必须大于0
3. 轮廓点应该按顺序排列，形成闭合的多边形
4. 在销毁场景前记得调用 `dispose()` 方法释放资源

🔧 **最佳实践**
1. 使用 `WaterBodyManager` 来管理多个水体
2. 在渲染循环中调用 `update()` 方法
3. 根据性能需求动态调整动画和细节级别
4. 合理设置透明度和反射参数以获得最佳视觉效果

## 故障排除

### 常见问题

**Q: 水体不显示？**
A: 检查轮廓是否正确定义，确保至少有3个点，并且已调用 `addToScene()`

**Q: 动画不工作？**
A: 确保在渲染循环中调用了 `update()` 方法，并且 `enableAnimation` 为 `true`

**Q: 水体颜色异常？**
A: 检查颜色值格式（应为十六进制数字），调整透明度和反射参数

**Q: 性能问题？**
A: 减少轮廓点数量，降低波浪细节，对远距离水体禁用动画

---

通过这个完善的 `WaterMarker` 类，你可以轻松地在3D场景中创建各种形状和效果的水体，为你的应用添加生动的水面效果！🌊 
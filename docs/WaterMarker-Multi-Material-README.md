# WaterMarker 多材质系统

## 🌊 概述

WaterMarker 现在采用多材质系统，为不同的面分配不同的材质，实现更逼真的水体效果：

- **顶面**：完整的水面效果（波浪、反射、扭曲）
- **侧面**：简单的半透明水蓝色
- **底面**：简单的半透明水蓝色

## 🔧 技术实现

### 材质配置

```typescript
// ExtrudeGeometry 的材质顺序：[侧面材质, 顶面材质, 底面材质]
const materials = [
    sideMaterial,     // 侧面 - 半透明 Phong 材质
    waterMaterial,    // 顶面 - 水面 Shader 材质
    sideMaterial      // 底面 - 半透明 Phong 材质
];
```

### 顶面 - 水面 Shader 材质

```glsl
// 顶面使用专门的水面着色器
uniform float time;
uniform vec3 waterColor;
uniform float transparency;
uniform float reflectivity;
uniform float waveScale;
uniform float distortionScale;

// 特效包括：
// - 波浪动画
// - 反射效果
// - 扭曲效果
// - 动态透明度
```

### 侧面和底面 - 半透明材质

```typescript
// 简单的半透明材质
const sideMaterial = new THREE.MeshPhongMaterial({
    color: options.waterColor,
    transparent: true,
    opacity: options.transparency * 0.4,
    side: THREE.DoubleSide,
});
```

## 🚀 使用方法

### 基本创建

```typescript
const waterMarker = new WaterMarker({
    height: 4,
    contour: contourPoints,
    waterColor: 0x4a90e2,
    transparency: 0.8,
    reflectivity: 0.9,
    flowSpeed: 0.4,
    waveScale: 1.2,
    distortionScale: 4.0,
    enableAnimation: true
});
```

### 动态调整

```typescript
// 改变颜色（同时影响顶面和侧面）
waterMarker.setWaterColor(0x00ff88);

// 调整透明度
waterMarker.setTransparency(0.9);

// 调整波浪参数（只影响顶面）
waterMarker.setWaveParameters(2.0, 6.0);
```

## 🎨 视觉效果

### 顶面（水面）
- ✨ **波浪动画**：实时的波浪起伏效果
- 🌊 **反射效果**：模拟水面反射光线
- 💫 **扭曲效果**：动态的波纹扭曲
- ⚡ **动态透明度**：基于视角的透明度变化

### 侧面和底面
- 🔵 **统一色彩**：与顶面相同的水蓝色
- 👻 **半透明**：透明度为顶面的40%
- 🔄 **动态调整**：支持颜色和透明度的实时调整

## 📋 支持的形状

- **矩形水池**：四边形轮廓
- **圆形水池**：多边形近似圆形
- **六边形水池**：正六边形
- **任意形状**：支持任意复杂轮廓

## 🎮 交互控制

### 键盘控制
- `1/2/3` - 切换对应水池的动画
- `C` - 随机改变所有水池颜色
- `T` - 随机改变所有水池透明度

### 程序控制
```typescript
// 启用/禁用动画
waterMarker.setAnimationEnabled(false);

// 更新轮廓
waterMarker.updateContour(newContourPoints);

// 设置位置
waterMarker.setPosition(new THREE.Vector3(10, 0, 10));
```

## 🔄 动态更新

### 轮廓更新
```typescript
// 动态更改水池形状
const newContour = [
    new THREE.Vector3(-12, 0, -12),
    new THREE.Vector3(12, 0, -12),
    new THREE.Vector3(12, 0, 12),
    new THREE.Vector3(-12, 0, 12)
];
waterMarker.updateContour(newContour);
```

### 属性更新
```typescript
// 所有属性都支持实时更新
waterMarker.setWaterColor(0x00aaff);
waterMarker.setTransparency(0.7);
waterMarker.setWaveParameters(1.5, 3.0);
```

## 🧹 资源管理

### 自动清理
```typescript
// 自动清理所有材质和几何体
waterMarker.dispose();
```

### 场景管理
```typescript
// 添加到场景
waterMarker.addToScene(scene);

// 从场景移除
waterMarker.removeFromScene();
```

## 🎯 性能优化

- **材质共享**：侧面和底面共享同一材质
- **智能更新**：只更新需要变化的属性
- **资源复用**：几何体更新时复用现有mesh
- **内存管理**：正确的资源清理机制

## 📖 完整示例

查看 `examples/waterMarker-usage-example.ts` 获取完整的使用示例，包括：

- 多种形状的水池创建
- 动态效果演示
- 交互控制实现
- 资源管理最佳实践

## 🔧 自定义扩展

### 添加新的材质效果
```typescript
// 可以继承 WaterMarker 类来添加自定义效果
class CustomWaterMarker extends WaterMarker {
    protected createWaterMaterial(): THREE.ShaderMaterial {
        // 自定义水面着色器
        // ...
    }
}
```

### 自定义侧面效果
```typescript
// 修改侧面材质
protected createSideMaterial(): THREE.Material {
    return new THREE.MeshPhongMaterial({
        color: this.options.waterColor,
        transparent: true,
        opacity: this.options.transparency * 0.4,
        // 添加自定义属性
        shininess: 100,
        specular: 0x111111
    });
}
```

## 🎊 总结

新的多材质系统提供了：
- 更逼真的水体视觉效果
- 灵活的材质配置
- 高性能的渲染方案
- 简单易用的API接口

完美满足了"顶面用水面材质，侧面和底面用半透明水蓝色"的需求！ 
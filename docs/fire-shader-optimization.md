# 火焰Shader特效优化说明

## 概述

本次优化对 `FireMarker` 的shader特效进行了全面升级，从基础的2D平面火焰效果提升为具有真实感的3D火焰系统。

## 主要改进

### 1. 顶点着色器优化

#### 原版问题：
- 简单的正弦波扰动
- 缺少分层噪声
- 没有风向影响
- 形状控制简陋

#### 优化后特性：
- **多层次噪声系统**：使用 turbulence 函数生成复杂的噪声模式
- **智能形状控制**：基于高度的动态形状变化，火焰顶部自然收缩
- **风向模拟**：真实的风力影响，支持动态风向变化
- **分层波动**：主要波动 + 次要波动，创造更自然的火焰摆动

```glsl
// 多层次噪声扰动
vec2 noiseCoord = uv * 3.0 + time * 0.1;
float turbulenceValue = turbulence(noiseCoord, turbulenceScale * 4.0);

// 主要火焰扰动
float mainWave = sin(time * 2.0 + uv.x * 8.0 + turbulenceValue * 3.0) * heightFactor;
float secondaryWave = sin(time * 3.5 + uv.y * 12.0 + turbulenceValue * 2.0) * heightFactor * 0.5;

// 风向影响
vec2 windEffect = windDirection * windStrength * heightFactor;
```

### 2. 片元着色器优化

#### 原版问题：
- 简单的线性颜色插值
- 基础噪声函数
- 缺少火焰核心效果
- 没有温度变化

#### 优化后特性：
- **改进的噪声算法**：使用 smoothstep 和多层噪声
- **火焰核心系统**：明亮的核心区域，边缘发光效果
- **温度变化模拟**：基于高度和噪声的温度渐变
- **火星粒子效果**：动态的火星闪烁
- **边缘柔化**：自然的边缘过渡

```glsl
// 火焰核心
float coreSize = smoothstep(0.6, 0.2, centerDist) * smoothstep(0.8, 0.0, heightGradient);
float coreGlow = coreSize * coreIntensity;

// 温度变化效果
float temperature = mix(0.6, 1.4, heightGradient + temperatureVariation * vNoise);

// 火星效果
float sparkleNoise = noise(vUv * 50.0 + time * 2.0);
sparkle = step(0.98, sparkleNoise) * sparkleIntensity;
```

### 3. 渲染优化

#### 改进内容：
- **混合模式**：从 `NormalBlending` 改为 `AdditiveBlending`，获得更好的发光效果
- **几何体细分**：增加网格段数（6x12），获得更好的变形效果
- **深度管理**：优化深度测试和写入设置
- **性能优化**：减少不必要的计算，优化 uniform 更新

## 新增功能

### 1. 风向系统
```typescript
// 设置风向和强度
fire.setWind([0.2, 0.1], 0.5); // [x方向, y方向], 强度
```

### 2. 湍流控制
```typescript
// 调整湍流强度，影响火焰的复杂度
fire.setTurbulence(1.5); // 范围: 0.0 - 3.0
```

### 3. 核心亮度
```typescript
// 控制火焰核心的亮度
fire.setCoreIntensity(2.0); // 范围: 0.0 - 3.0
```

### 4. 火星效果
```typescript
// 添加火星粒子效果
fire.setSparkle(0.4); // 范围: 0.0 - 1.0
```

### 5. 预设系统
```typescript
// 快速应用预设效果
fire.presets.gentle();   // 温和火焰
fire.presets.wild();     // 狂野火焰
fire.presets.mystical(); // 神秘火焰
fire.presets.windy();    // 风中火焰
```

## 性能对比

| 特性 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| 噪声复杂度 | 1层简单噪声 | 4层分形噪声 | 更真实 |
| 顶点变形 | 基础正弦波 | 多层turbulence | 更自然 |
| 颜色效果 | 线性插值 | 温度模拟+核心发光 | 更逼真 |
| 风向模拟 | 无 | 完整风力系统 | 新增 |
| 火星效果 | 无 | 动态粒子系统 | 新增 |
| 渲染质量 | 基础 | 高质量发光 | 显著提升 |

## 使用示例

### 基础使用
```javascript
// 创建优化的火焰
const fire = createFireMarker({
    position: [0, 5, 0],
    size: 15.0,
    turbulenceScale: 1.2,
    windDirection: [0.1, 0.05],
    windStrength: 0.3,
    coreIntensity: 1.5,
    sparkleIntensity: 0.3
});
```

### 动态效果
```javascript
// 风向变化演示
window.fireMarkerControls.demo.windDemo();

// 强度脉冲演示
window.fireMarkerControls.demo.pulseDemo();

// 应用不同预设
window.fireMarkerControls.presets.wild();
```

### 实时调节
```javascript
// 实时调节参数
window.fireMarkerControls.setWind(0.2, 0.1, 0.4);
window.fireMarkerControls.setTurbulence(1.8);
window.fireMarkerControls.setCoreIntensity(2.0);
window.fireMarkerControls.setSparkle(0.5);
```

## 技术细节

### 噪声函数改进
```glsl
// 使用分形噪声替代简单随机
float turbulence(vec2 p, float scale) {
    float value = 0.0;
    float amplitude = 1.0;
    
    for (int i = 0; i < 4; i++) {
        value += amplitude * smoothNoise(p * scale);
        p *= 2.0;
        amplitude *= 0.5;
        scale *= 0.5;
    }
    
    return value;
}
```

### 火焰形状控制
```glsl
// 智能形状控制
float heightFactor = pow(uv.y, 1.5);
float baseWidth = 1.0 - heightFactor * 0.6;

// 火焰顶部收缩
float tipShrink = smoothstep(0.7, 1.0, uv.y);
pos.x *= (1.0 - tipShrink * 0.3);
```

### 温度模拟
```glsl
// 基于高度和噪声的温度变化
float temperature = mix(0.6, 1.4, heightGradient + temperatureVariation * vNoise);
vec3 hotColor = mix(baseColor, tipColor, heightGradient);
vec3 coolColor = baseColor * 0.8;
vec3 flameColor = mix(coolColor, hotColor, temperature);
```

## 配置参数说明

### 基础参数
- `intensity`: 火焰强度 (0.0-1.0)
- `size`: 火焰大小
- `opacity`: 透明度 (0.0-1.0)
- `animationSpeed`: 动画速度倍率

### 新增参数
- `turbulenceScale`: 湍流强度 (0.0-3.0)
- `windDirection`: 风向 [x, y]
- `windStrength`: 风力强度 (0.0-1.0)
- `fireHeight`: 火焰高度比例 (1.0-2.0)
- `coreIntensity`: 核心亮度 (0.0-3.0)
- `edgeSoftness`: 边缘柔和度 (0.0-1.0)
- `temperatureVariation`: 温度变化 (0.0-1.0)
- `sparkleIntensity`: 火星强度 (0.0-1.0)

## 最佳实践

### 1. 性能优化建议
- 在移动设备上适当降低 `turbulenceScale`
- 静态场景可以减少 `sparkleIntensity`
- 远距离火焰可以降低几何体细分

### 2. 视觉效果建议
- 使用 `AdditiveBlending` 获得最佳发光效果
- 适当的风向设置让火焰更自然
- 结合环境光照调整火焰颜色

### 3. 动画建议
- 配合场景音效同步火焰强度变化
- 根据游戏事件动态调整火焰参数
- 使用预设系统快速切换不同氛围

## 兼容性

### 向后兼容
- 保持原有API接口不变
- 新增参数使用默认值
- 自动适配旧版本配置

### 浏览器支持
- 支持 WebGL 1.0 及以上
- 在不支持高级特性时自动降级
- 移动设备优化版本

## 总结

此次优化使火焰效果从简单的2D平面提升为具有真实感的3D火焰系统，主要改进包括：

- ✅ 多层次噪声系统
- ✅ 智能风向模拟
- ✅ 火焰核心和温度效果
- ✅ 动态火星粒子
- ✅ 丰富的预设和控制接口
- ✅ 显著的视觉质量提升

这些改进让火焰效果更加逼真、自然，同时提供了丰富的自定义选项，满足不同场景的需求。 
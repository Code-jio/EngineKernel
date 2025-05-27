# BaseScene 默认配置使用指南

## 📋 概述

BaseScene 现在提供了多种预设配置，让你无需编写大量配置代码就能快速创建适合不同场景的3D环境。

## 🚀 快速开始

### 最简单的使用方式

```typescript
import { BaseScene } from './baseScene'

// 零配置创建场景（推荐新手）
const scene = BaseScene.createMinimal()
```

### 指定容器

```typescript
const container = document.getElementById('canvas-container') as HTMLCanvasElement
const scene = BaseScene.createMinimal(container)
```

## 🎯 预设配置

### 1. 高性能配置 (highPerformance)
**适用场景：** 移动端、低端设备、性能优先

```typescript
const scene = BaseScene.createHighPerformance()
```

**特点：**
- ❌ 关闭反锯齿（提升性能）
- ❌ 关闭阴影系统
- ❌ 关闭物理正确光照
- 🔧 中等精度渲染
- 🔧 1倍像素比
- 🔧 线性色调映射

### 2. 平衡配置 (balanced) - **默认推荐**
**适用场景：** 大多数项目、性能与质量平衡

```typescript
const scene = BaseScene.createBalanced()
```

**特点：**
- ✅ 启用反锯齿
- ❌ 关闭阴影（可手动开启）
- ✅ 启用物理正确光照
- 🔧 高精度渲染
- 🔧 ACES Filmic色调映射
- 🔧 sRGB颜色空间

### 3. 高质量配置 (highQuality)
**适用场景：** 桌面端、高端设备、视觉效果优先

```typescript
const scene = BaseScene.createHighQuality()
```

**特点：**
- ✅ 启用反锯齿
- ✅ 启用阴影系统
- ✅ 启用物理正确光照
- ✅ PCF软阴影
- 🔧 高精度渲染
- 🔧 ACES Filmic色调映射
- 🔧 更高的曝光值

### 4. 开发调试配置 (development)
**适用场景：** 开发阶段、调试、测试

```typescript
const scene = BaseScene.createDevelopment()
```

**特点：**
- ✅ 启用所有调试功能
- ✅ 启用alpha通道
- ✅ 启用阴影系统
- ✅ 较大的视场角
- ✅ 启用性能监控

## 🔧 自定义配置

### 基于预设覆盖配置

```typescript
// 基于平衡配置，但启用阴影
const scene = BaseScene.createBalanced({
    rendererConfig: {
        shadowMapEnabled: true
    },
    cameraConfig: {
        position: [100, 100, 100],
        fov: 60
    }
})
```

### 移动端优化示例

```typescript
const mobileScene = BaseScene.createHighPerformance({
    rendererConfig: {
        pixelRatio: 1,           // 强制1倍像素比
        precision: "mediump",    // 中等精度
        antialias: false,        // 关闭反锯齿
        shadowMapEnabled: false  // 关闭阴影
    },
    cameraConfig: {
        far: 5000               // 减少渲染距离
    }
})
```

### 桌面端高质量示例

```typescript
const desktopScene = BaseScene.createHighQuality({
    rendererConfig: {
        shadowMapEnabled: true,
        shadowMapType: 2,        // PCF软阴影
        toneMapping: 5,          // ACES Filmic
        toneMappingExposure: 1.2
    },
    cameraConfig: {
        far: 100000             // 更远的渲染距离
    }
})
```

## 📊 配置查询

### 查看可用预设

```typescript
const presets = BaseScene.getAvailablePresets()
console.log(presets) // ['highPerformance', 'balanced', 'highQuality', 'development']
```

### 查看预设详情

```typescript
const config = BaseScene.getPresetConfig('balanced')
console.log(config) // 返回完整的平衡配置
```

## 🎮 运行时配置

### 性能监控控制

```typescript
const scene = BaseScene.createBalanced()

// 启用/禁用性能监控
scene.setPerformanceMonitorEnabled(true)

// 获取性能统计
const stats = scene.getPerformanceStats()
console.log('FPS:', stats.fps)
console.log('对象数:', stats.objects)
```

### 阴影控制

```typescript
// 运行时启用/禁用阴影
scene.setShadowEnabled(true)
```

### 色调映射控制

```typescript
// 修改色调映射和曝光
scene.setToneMapping(THREE.ReinhardToneMapping, 1.5)
```

## 🏗️ 传统方式（完全自定义）

如果预设无法满足需求，仍可使用传统构造函数：

```typescript
const scene = new BaseScene({
    userData: {
        preset: 'balanced',      // 可选：基于某个预设
        cameraConfig: {
            type: "perspective",
            fov: 75,
            position: [50, 50, 50]
        },
        rendererConfig: {
            container: canvas,
            antialias: true,
            shadowMapEnabled: true
        },
        performanceConfig: {
            enabled: false
        }
    }
})
```

## 📝 配置参数参考

### cameraConfig
```typescript
{
    type: "perspective" | "orthographic",
    fov: number,           // 视场角
    near: number,          // 近裁剪面
    far: number,           // 远裁剪面
    position: [x, y, z],   // 相机位置
    lookAt: [x, y, z]      // 相机朝向
}
```

### rendererConfig
```typescript
{
    container: HTMLElement,                    // 渲染容器
    antialias: boolean,                       // 反锯齿
    alpha: boolean,                           // Alpha通道
    precision: "highp" | "mediump" | "lowp",  // 精度
    powerPreference: string,                  // 性能偏好
    physicallyCorrectLights: boolean,         // 物理正确光照
    shadowMapEnabled: boolean,                // 阴影映射
    shadowMapType: THREE.ShadowMapType,       // 阴影类型
    toneMapping: THREE.ToneMapping,           // 色调映射
    toneMappingExposure: number,              // 曝光值
    outputColorSpace: string,                 // 输出颜色空间
    pixelRatio: number                        // 像素比率
}
```

### performanceConfig
```typescript
{
    enabled: boolean                          // 是否启用性能监控
}
```

## 💡 使用建议

### 选择预设的建议

| 场景 | 推荐预设 | 原因 |
|------|----------|------|
| 新手学习 | `createMinimal()` | 零配置，快速上手 |
| 移动端应用 | `createHighPerformance()` | 最佳性能，流畅体验 |
| 桌面端应用 | `createBalanced()` | 性能与质量平衡 |
| 高端展示 | `createHighQuality()` | 最佳视觉效果 |
| 开发调试 | `createDevelopment()` | 完整调试功能 |

### 性能优化提示

1. **移动端优化：**
   - 使用 `createHighPerformance()`
   - 强制 `pixelRatio: 1`
   - 关闭阴影和反锯齿
   - 减少渲染距离

2. **内存优化：**
   - 启用性能监控观察内存使用
   - 适当设置near/far参数
   - 及时调用destroy()清理资源

3. **视觉质量：**
   - 桌面端使用 `createHighQuality()`
   - 启用物理正确光照
   - 使用ACES Filmic色调映射
   - 适当调整曝光值

## 🔄 迁移指南

### 从旧版本迁移

**旧方式：**
```typescript
const scene = new BaseScene({
    userData: {
        cameraConfig: { /* 大量配置 */ },
        rendererConfig: { /* 大量配置 */ }
    }
})
```

**新方式：**
```typescript
// 简单场景
const scene = BaseScene.createMinimal()

// 或带少量自定义
const scene = BaseScene.createBalanced({
    cameraConfig: {
        position: [100, 100, 100]
    }
})
```

这样既保持了向后兼容性，又大大简化了常见的使用场景。 
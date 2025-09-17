# DataRainEffect 数据雨效果

一个基于 Three.js 的高性能《黑客帝国》风格数据雨效果实现。

## 更新日志

### v2.0.0
- 添加动态密度调整功能
- 增强视觉效果（波浪摆动、列亮度变化）
- 优化性能（减少GPU同步次数、缓存字符纹理）
- 改进粒子初始化算法
- 添加场景缩放监听支持

## 概述

DataRainEffect 创建了一个由随机字符组成的粒子系统，模拟电影中经典的数字雨效果。使用自定义着色器和 Canvas API 动态生成字符纹理，支持高度自定义的参数配置。

## 特性

- 🚀 **高性能**: 使用自定义着色器和粒子系统，支持大量粒子
- 🎨 **视觉丰富**: 支持字符闪烁、渐变透明度、发光效果
- ⚙️ **高度可定制**: 粒子数量、速度、颜色、字体大小等参数可调
- 🎯 **真实模拟**: 模拟真实的数据流效果，包括字符随机变化和X轴摆动
- 🔧 **易于集成**: 简单的 API 接口，易于在现有项目中使用

## 安装

### 依赖

```json
{
  "dependencies": {
    "three": "^0.128.0",
    "@types/three": "^0.128.0"
  }
}
```

### 导入

```typescript
import { DataRainEffect } from './src/plugins/effects/DataRainEffect'
```

## 基本使用

```typescript
// 创建场景、相机和渲染器
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
const renderer = new THREE.WebGLRenderer()

// 创建数据雨效果
const dataRain = new DataRainEffect(scene, camera, renderer)
dataRain.init()

// 设置相机位置
camera.position.set(0, 0, 20)

// 动画循环
function animate() {
    requestAnimationFrame(animate)
    renderer.render(scene, camera)
}

animate()
```

## 参数配置

### 默认参数

```typescript
interface DataRainParams {
    particleCount: 1000      // 粒子数量
    columnCount: 80          // 列数
    fontSize: 18             // 字体大小
    color: '#00ff41'         // 颜色 (经典黑客绿)
    speed: {                 // 速度范围
        min: 0.5
        max: 3.0
    }
    charSet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()'  // 字符集
    fadeOutStrength: 0.95    // 淡出强度
    swayAmplitude: 0.8       // 摆动幅度
    flickerChance: 0.05      // 闪烁概率
    headCharBrightness: 1.5  // 首字符亮度增强
}
```

### 自定义参数

```typescript
dataRain.updateParams({
    particleCount: 1500,
    columnCount: 100,
    fontSize: 20,
    color: '#00ff41',
    speed: { min: 0.8, max: 3.5 },
    charSet: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()!+-=',
    fadeOutStrength: 0.92,
    swayAmplitude: 1.0,
    flickerChance: 0.08,
    headCharBrightness: 2.0
})
```

### 动态密度调整

```typescript
// 调整特效密度 (0.1-2.0, 1.0为默认)
dataRain.setDensity(0.5);  // 降低到50%密度
dataRain.setDensity(1.5);  // 增加到150%密度
dataRain.setDensity(1.0);  // 重置为默认密度
```

## 高级用法

### 1. 多层数据雨效果

```typescript
// 前景层（快速、明亮）
const foregroundRain = new DataRainEffect({ scene, camera, renderer })
foregroundRain.updateParams({
    particleCount: 800,
    color: '#00ff00',
    speed: { min: 2.0, max: 5.0 }
})
foregroundRain.createDataRain()

// 中景层（中等速度）
const midgroundRain = new DataRainEffect({ scene, camera, renderer })
midgroundRain.updateParams({
    particleCount: 1200,
    color: '#008800',
    speed: { min: 1.0, max: 3.0 }
})
midgroundRain.createDataRain()

// 背景层（缓慢、暗淡）
const backgroundRain = new DataRainEffect({ scene, camera, renderer })
backgroundRain.updateParams({
    particleCount: 2000,
    color: '#002200',
    speed: { min: 0.5, max: 1.5 }
})
backgroundRain.createDataRain()
```

### 2. 交互式控制

```typescript
// 启动/停止动画
dataRain.startAnimation()
dataRain.stopAnimation()

// 动态调整密度
dataRain.setDensity(0.7)  // 降低密度到70%

// 实时更新参数
dataRain.updateParams({
    speed: { min: 0.3, max: 2.0 },
    color: '#00aaff'
})

// 动态密度控制
document.addEventListener('keydown', (event) => {
    switch(event.key) {
        case '+':
        case '=':
            dataRain.setDensity(1.2)  // 增加密度
            break
        case '-':
        case '_':
            dataRain.setDensity(0.8)  // 降低密度
            break
    }
})
```

### 3. 性能优化示例

```typescript
// 根据设备性能调整密度
function adjustForPerformance() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const density = isMobile ? 0.6 : 1.0
    dataRain.setDensity(density)
}

// 响应窗口大小变化
window.addEventListener('resize', () => {
    const density = window.innerWidth < 768 ? 0.7 : 1.0
    dataRain.setDensity(density)
})

// 在低性能设备上使用简化版本
const isLowEndDevice = navigator.hardwareConcurrency <= 2
if (isLowEndDevice) {
    dataRain.updateParams({
        particleCount: 500,
        columnCount: 40,
        fontSize: 14
    })
}
```

### 4. 场景集成示例

```typescript
// 在Three.js场景中使用
class DataRainScene {
    private dataRain: DataRainEffect
    
    constructor() {
        // 初始化场景、相机、渲染器
        this.setupScene()
        
        // 创建数据雨特效
        this.dataRain = new DataRainEffect({ 
            scene: this.scene, 
            camera: this.camera, 
            renderer: this.renderer 
        })
        
        // 启动动画
        this.dataRain.startAnimation()
        
        // 启动渲染循环
        this.animate()
    }
    
    private animate = () => {
        requestAnimationFrame(this.animate)
        this.renderer.render(this.scene, this.camera)
    }
    
    // 根据用户交互调整特效
    public onUserAction(action: 'intense' | 'calm' | 'stop') {
        switch(action) {
            case 'intense':
                this.dataRain.updateParams({
                    particleCount: 2000,
                    speed: { min: 1.5, max: 4.0 }
                })
                break
            case 'calm':
                this.dataRain.updateParams({
                    particleCount: 800,
                    speed: { min: 0.3, max: 1.5 }
                })
                break
            case 'stop':
                this.dataRain.stopAnimation()
                break
        }
    }
}
```

## 技术实现

### 自定义着色器

DataRainEffect 使用自定义顶点着色器和片段着色器来实现高性能的字符渲染：

**顶点着色器特点：**
- 支持字符索引、透明度、列索引等属性
- 根据距离动态调整点大小
- 添加波浪摆动效果
- 保持字符清晰度

**片段着色器特点：**
- 从字符图集中采样对应字符
- 应用颜色和透明度
- 添加发光效果和首字符亮度增强
- 支持时间动画

### 字符纹理生成

使用 Canvas API 动态生成字符纹理图集，并添加了缓存机制：

```typescript
private createCharAtlas(): THREE.Texture {
    // 检查缓存
    const cacheKey = `${this.rainParams.fontSize}-${this.rainParams.charSet}`
    if (this.charAtlasCache.has(cacheKey)) {
        return this.charAtlasCache.get(cacheKey)!
    }
    
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    // ... 绘制字符到图集
    
    // 缓存纹理
    const texture = new THREE.CanvasTexture(canvas)
    this.charAtlasCache.set(cacheKey, texture)
    return texture
}
```

### 粒子动画系统

每个粒子具有以下属性：
- **位置**: 3D 坐标
- **速度**: 垂直下降速度
- **字符索引**: 当前显示的字符
- **透明度**: 基于高度的渐变透明度
- **列索引**: 所属的列
- **闪烁时间**: 用于闪烁效果

### 性能优化

1. **减少GPU同步次数**: 批量更新几何体属性
2. **局部变量缓存**: 减少重复的属性访问
3. **向量化更新**: 减少循环中的重复计算
4. **纹理缓存**: 避免重复创建相同的字符纹理
5. **智能粒子管理**: 根据场景需求动态调整粒子数量

### 动态密度调整

通过`setDensity`方法可以动态调整特效的粒子密度，适应不同性能的设备：

```typescript
// density范围: 0.1-2.0, 1.0为默认密度
public setDensity(density: number) {
    const clampedDensity = Math.max(0.1, Math.min(2.0, density))
    const newParticleCount = Math.floor(this.rainParams.particleCount * clampedDensity)
    this.rainParams.particleCount = newParticleCount
    // 重新创建粒子系统
    if (this.particles) {
        this.dispose()
        this.createDataRain()
    }
}
```

## 性能优化

### 1. 粒子数量控制

- 桌面端：5000-15000 粒子
- 移动端：1000-5000 粒子
- 根据设备性能动态调整

### 2. 渲染优化

- 使用 `AdditiveBlending` 混合模式
- 禁用深度写入 (`depthWrite: false`)
- 只更新变化的属性

### 3. 内存管理

```typescript
// 正确释放资源
dataRain.dispose()
```

## 常见问题

### Q: 字符显示不清晰？

A: 调整字体大小和相机距离：
```typescript
dataRain.setParams({
    fontSize: 24,  // 增大字体
})
camera.position.set(0, 0, 15)  // 调整相机距离
```

### Q: 性能不佳？

A: 减少粒子数量或优化参数：
```typescript
dataRain.setParams({
    particleCount: 3000,  // 减少粒子
    columnCount: 30,      // 减少列数
})
```

### Q: 如何实现不同颜色？

A: 使用十六进制颜色值：
```typescript
dataRain.setParams({
    color: '#ff0000'  // 红色
})
```

## 示例文件

- `examples/data-rain-effect-example.ts` - 6个完整使用示例
- `examples/data-rain-effect-test.html` - 交互式测试页面
- `docs/DataRainEffect-README.md` - 详细文档

## 更新日志

### v1.0.0
- ✨ 初始版本发布
- 🎯 基础数据雨效果实现
- 🎨 自定义着色器支持
- ⚙️ 完整参数配置系统

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目。

---

**注意**: 这个效果最适合作为背景效果使用，建议在其他3D对象后面渲染以获得最佳视觉效果。
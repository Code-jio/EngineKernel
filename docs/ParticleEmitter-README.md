# ParticleEmitter - 高性能粒子发射器插件

## 🎆 概述

ParticleEmitter 是一个基于 Three.js 的高性能粒子系统插件，专为 EngineKernel 架构设计。它提供了丰富的粒子效果，完善的性能优化机制，以及易于使用的 API 接口。

## ✨ 主要特性

### 🚀 核心功能
- **多种粒子类型**: 火焰、烟雾、火花、魔法、水滴、尘埃等
- **灵活的发射形状**: 点、球体、立方体、圆锥等发射模式
- **实时物理模拟**: 速度、加速度、重力等物理效果
- **颜色与大小渐变**: 支持粒子生命周期内的平滑过渡
- **Billboard 效果**: 粒子始终面向相机，提供最佳视觉效果

### ⚡ 性能优化
- **对象池管理**: 复用粒子对象，减少内存分配
- **视锥剔除**: 只更新可见区域内的粒子
- **LOD 系统**: 根据距离调整粒子密度和质量
- **帧率控制**: 智能跳帧机制，保持稳定性能
- **缓冲区优化**: 高效的属性缓冲区管理

### 🎨 视觉效果
- **自定义着色器**: 高质量的粒子渲染
- **多种混合模式**: 加法、正常、乘法等混合效果
- **纹理支持**: 支持自定义粒子纹理
- **透明度控制**: 精确的透明度和深度管理
- **旋转动画**: 粒子旋转和角速度效果

## 📦 安装与使用

### 基础用法

```typescript
import { ParticleEmitter, ParticleType } from './plugins/webgl/ParticleEmitter'
import { BaseScene } from './plugins/webgl/baseScene'

// 创建场景
const scene = BaseScene.createBalanced()

// 创建粒子发射器
const fireEmitter = new ParticleEmitter({
    userData: {
        scene: scene.sceneInstance,
        camera: scene.cameraInstance,
        renderer: scene.rendererInstance,
        config: ParticleEmitter.createFireEmitter({
            position: [0, 0, 0],
            maxParticles: 1000,
            emissionRate: 100,
            debugMode: true
        })
    }
})

// 初始化发射器
await fireEmitter.init()
```

### 高级配置

```typescript
const customConfig: ParticleConfig = {
    // 基础属性
    position: new THREE.Vector3(0, 5, 0),
    maxParticles: 2000,
    emissionRate: 150,
    particleLifetime: 4.0,
    
    // 视觉效果
    particleType: ParticleType.MAGIC,
    startColor: new THREE.Color(0xff4400),
    endColor: new THREE.Color(0x440000),
    startSize: 1.0,
    endSize: 0.1,
    opacity: 0.9,
    
    // 物理属性
    velocity: new THREE.Vector3(0, 8, 0),
    acceleration: new THREE.Vector3(0, -3, 0),
    velocityRandomness: 2.0,
    angularVelocity: 1.0,
    
    // 发射形状
    emissionShape: 'cone',
    emissionRadius: 2.0,
    emissionAngle: Math.PI / 6,
    
    // 性能优化
    enableFrustumCulling: true,
    enableLOD: true,
    updateFrequency: 1.0,
    maxDistance: 100,
    
    // 渲染属性
    billboardMode: true,
    renderOrder: 200,
    depthWrite: false,
    blendMode: THREE.AdditiveBlending
}

const emitter = new ParticleEmitter({
    userData: {
        scene: scene.sceneInstance,
        camera: scene.cameraInstance,
        renderer: scene.rendererInstance,
        config: customConfig
    }
})
```

## 🎯 预设类型

### 火焰粒子 🔥
```typescript
const fireConfig = ParticleEmitter.createFireEmitter({
    position: [0, 0, 0],
    maxParticles: 800,
    emissionRate: 120
})
```

### 烟雾粒子 💨
```typescript
const smokeConfig = ParticleEmitter.createSmokeEmitter({
    position: [0, 5, 0],
    maxParticles: 300,
    emissionRate: 50
})
```

### 魔法粒子 ✨
```typescript
const magicConfig = ParticleEmitter.createMagicEmitter({
    position: [0, 2, 0],
    maxParticles: 600,
    emissionRate: 100
})
```

## 🛠️ API 参考

### 核心方法

#### 发射控制
```typescript
emitter.startEmission()      // 开始发射
emitter.stopEmission()       // 停止发射
emitter.clearAllParticles()  // 清空所有粒子
```

#### 位置控制
```typescript
emitter.setPosition([x, y, z])           // 设置发射器位置
const pos = emitter.getPosition()        // 获取发射器位置
```

#### 参数调整
```typescript
emitter.setEmissionRate(200)             // 设置发射速率
emitter.setMaxParticles(1500)            // 设置最大粒子数
```

#### 状态查询
```typescript
const count = emitter.getActiveParticleCount()    // 获取活跃粒子数
const stats = emitter.getPerformanceStats()       // 获取性能统计
```

#### 调试模式
```typescript
emitter.enableDebugMode()    // 启用调试模式
```

#### 资源管理
```typescript
emitter.dispose()            // 销毁发射器，释放资源
```

### 配置接口

```typescript
interface ParticleConfig {
    // 基础属性
    position: THREE.Vector3 | [number, number, number]
    maxParticles: number
    emissionRate: number
    particleLifetime: number
    
    // 视觉效果
    particleType: ParticleType
    startColor: THREE.Color | number
    endColor: THREE.Color | number
    startSize: number
    endSize: number
    opacity: number
    
    // 物理属性
    velocity: THREE.Vector3
    acceleration: THREE.Vector3
    velocityRandomness: number
    angularVelocity: number
    
    // 发射形状
    emissionShape: 'point' | 'sphere' | 'box' | 'cone'
    emissionRadius: number
    emissionAngle: number
    
    // 性能优化
    enableFrustumCulling: boolean
    enableLOD: boolean
    updateFrequency: number
    maxDistance: number
    
    // 渲染属性
    billboardMode: boolean
    renderOrder: number
    depthWrite: boolean
    blendMode: THREE.Blending
    
    // 回调函数
    onParticleSpawn?: (particle: Particle) => void
    onParticleUpdate?: (particle: Particle, deltaTime: number) => void
    onParticleDeath?: (particle: Particle) => void
}
```

## 🎨 使用示例

### 篝火效果
```typescript
// 创建篝火效果组合
const campfirePosition = new THREE.Vector3(0, 0, 0)

// 主火焰
const mainFire = new ParticleEmitter({
    userData: { scene, camera, renderer,
        config: ParticleEmitter.createFireEmitter({
            position: campfirePosition,
            maxParticles: 800,
            emissionRate: 120,
            velocityRandomness: 1.5,
            emissionShape: 'cone',
            emissionAngle: Math.PI / 8
        })
    }
})

// 烟雾
const smoke = new ParticleEmitter({
    userData: { scene, camera, renderer,
        config: ParticleEmitter.createSmokeEmitter({
            position: campfirePosition.clone().add(new THREE.Vector3(0, 5, 0)),
            maxParticles: 300,
            emissionRate: 30,
            particleLifetime: 8.0
        })
    }
})

// 火花
const sparks = new ParticleEmitter({
    userData: { scene, camera, renderer,
        config: {
            ...ParticleEmitter.createFireEmitter(),
            particleType: ParticleType.SPARK,
            maxParticles: 200,
            startColor: new THREE.Color(0xffaa00),
            velocityRandomness: 4.0,
            renderOrder: 140
        }
    }
})
```

### 魔法传送门
```typescript
const portalEffect = new ParticleEmitter({
    userData: { scene, camera, renderer,
        config: ParticleEmitter.createMagicEmitter({
            position: [10, 0, 0],
            maxParticles: 600,
            emissionShape: 'sphere',
            emissionRadius: 3.0,
            angularVelocity: 3.0,
            startColor: new THREE.Color(0x8844ff),
            endColor: new THREE.Color(0xff44ff)
        })
    }
})
```

### 水花喷泉
```typescript
const fountain = new ParticleEmitter({
    userData: { scene, camera, renderer,
        config: {
            position: [-10, 0, 0],
            maxParticles: 1000,
            emissionRate: 200,
            particleType: ParticleType.WATER,
            startColor: new THREE.Color(0x4488ff),
            velocity: new THREE.Vector3(0, 15, 0),
            acceleration: new THREE.Vector3(0, -20, 0),
            emissionShape: 'cone',
            emissionAngle: Math.PI / 12,
            blendMode: THREE.NormalBlending
        }
    }
})
```

## ⚡ 性能优化指南

### 移动端优化
```typescript
const mobileConfig = {
    maxParticles: 300,          // 减少粒子数量
    emissionRate: 50,           // 降低发射速率
    enableLOD: true,            // 启用LOD
    enableFrustumCulling: true, // 启用视锥剔除
    updateFrequency: 0.7,       // 降低更新频率
    maxDistance: 50,            // 减少渲染距离
    billboardMode: true         // 启用billboard优化
}
```

### 桌面端高质量
```typescript
const desktopConfig = {
    maxParticles: 2000,         // 更多粒子
    emissionRate: 300,          // 更高发射速率
    updateFrequency: 1.0,       // 全频率更新
    maxDistance: 200,           // 更远渲染距离
    enableLOD: true,
    enableFrustumCulling: true
}
```

### 性能监控
```typescript
// 启用性能监控
emitter.enableDebugMode()

// 定期检查性能
setInterval(() => {
    const stats = emitter.getPerformanceStats()
    console.log('粒子系统性能:', {
        activeParticles: stats.activeParticles,
        utilization: `${(stats.particleUtilization * 100).toFixed(1)}%`,
        lodLevel: `${(stats.lodLevel * 100).toFixed(0)}%`,
        isEmitting: stats.isEmitting
    })
}, 5000)
```

## 🎮 交互式控制

### 实时参数调整
```typescript
// 创建控制面板
function createParticleControls(emitter: ParticleEmitter) {
    const panel = document.createElement('div')
    panel.innerHTML = `
        <h3>粒子控制</h3>
        <label>发射速率: <input type="range" id="rate" min="0" max="500" value="100"></label>
        <button onclick="emitter.startEmission()">开始</button>
        <button onclick="emitter.stopEmission()">停止</button>
        <button onclick="emitter.clearAllParticles()">清空</button>
    `
    
    // 绑定事件
    panel.querySelector('#rate').addEventListener('input', (e) => {
        emitter.setEmissionRate(parseInt(e.target.value))
    })
    
    return panel
}
```

### 预设切换
```typescript
const presets = {
    fire: () => ParticleEmitter.createFireEmitter(),
    smoke: () => ParticleEmitter.createSmokeEmitter(),
    magic: () => ParticleEmitter.createMagicEmitter()
}

function switchPreset(presetName: string) {
    if (currentEmitter) currentEmitter.dispose()
    
    const config = presets[presetName]()
    currentEmitter = new ParticleEmitter({
        userData: { scene, camera, renderer, config }
    })
    
    currentEmitter.init()
}
```

## 🔧 高级技巧

### 自定义回调
```typescript
const emitter = new ParticleEmitter({
    userData: { scene, camera, renderer,
        config: {
            ...baseConfig,
            onParticleSpawn: (particle) => {
                // 粒子生成时的自定义逻辑
                console.log('新粒子生成:', particle)
            },
            onParticleUpdate: (particle, deltaTime) => {
                // 自定义粒子更新逻辑
                if (particle.age > 2.0) {
                    particle.acceleration.y = -5  // 增强重力
                }
            },
            onParticleDeath: (particle) => {
                // 粒子消亡时的回调
                console.log('粒子消亡:', particle)
            }
        }
    }
})
```

### 动态效果控制
```typescript
// 根据游戏事件调整粒子效果
function adjustFireIntensity(intensity: number) {
    emitter.setEmissionRate(100 * intensity)
    
    // 动态调整颜色
    const hotColor = new THREE.Color(0xff0000)  // 红色
    const coldColor = new THREE.Color(0x0000ff) // 蓝色
    
    // 在配置中实时更新颜色...
}

// 风向影响
function applyWindEffect(windDirection: THREE.Vector3, strength: number) {
    // 通过回调修改粒子速度
    emitter.config.onParticleUpdate = (particle, deltaTime) => {
        const windForce = windDirection.clone().multiplyScalar(strength)
        particle.acceleration.add(windForce)
    }
}
```

## 🛡️ 最佳实践

### 1. 资源管理
- 始终在不需要时调用 `dispose()` 释放资源
- 使用对象池减少内存分配
- 避免创建过多同时活跃的发射器

### 2. 性能优化
- 根据设备性能调整 `maxParticles` 和 `emissionRate`
- 启用 LOD 和视锥剔除优化
- 合理设置 `updateFrequency` 避免过度计算

### 3. 视觉质量
- 选择合适的混合模式获得最佳效果
- 注意 `renderOrder` 避免渲染冲突
- 使用纹理提升视觉质量

### 4. 调试与开发
- 开发阶段启用 `debugMode` 监控性能
- 使用性能统计优化参数
- 实现实时参数调节面板

## 🔍 故障排除

### 常见问题

**Q: 粒子不显示？**
A: 检查发射器位置、相机视角、渲染顺序和混合模式设置

**Q: 性能差？**
A: 减少 `maxParticles`，启用LOD和视锥剔除，降低 `updateFrequency`

**Q: 粒子闪烁？**
A: 检查 `depthWrite` 和 `blendMode` 设置，调整 `renderOrder`

**Q: 内存泄漏？**
A: 确保及时调用 `dispose()` 清理资源

### 调试技巧
```typescript
// 启用详细调试信息
emitter.enableDebugMode()

// 检查粒子状态
console.log('活跃粒子:', emitter.getActiveParticleCount())
console.log('性能统计:', emitter.getPerformanceStats())

// 验证配置
console.log('发射器配置:', emitter.config)
```

## 📈 版本历史

### v1.0.0
- ✅ 基础粒子系统实现
- ✅ 多种粒子类型预设
- ✅ 性能优化机制
- ✅ 完整的API接口
- ✅ 详细的使用文档

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来改进这个粒子系统！

### 开发环境设置
```bash
npm install
npm run dev
```

### 运行示例
```bash
npm run example:particle
```

---

🎆 享受创建令人惊叹的粒子效果吧！ 
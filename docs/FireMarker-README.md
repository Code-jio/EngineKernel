# FireMarker - 3D火焰对象

## 概述

FireMarker是一个基于PlaneGeometry + Billboard技术实现的3D火焰特效对象，使用自定义Shader材质来渲染逼真的火焰效果。

## 主要特性

### ✨ 核心功能
- **PlaneGeometry几何体**: 使用平面几何体优化性能
- **Billboard技术**: 火焰始终面向摄像机，保持最佳视觉效果
- **自定义Shader**: 增强的顶点和片元着色器，实现逼真火焰效果
- **实时动画**: 流畅的火焰波动、闪烁和膨胀效果

### 🎨 视觉效果
- **颜色渐变**: 支持底部和顶部颜色自定义
- **噪声纹理**: 内置噪声算法，模拟真实火焰纹理
- **闪烁效果**: 可调节的火焰闪烁强度
- **波动动画**: 模拟火焰的自然摆动
- **边缘发光**: 火焰边缘发光效果

### ⚙️ 渲染优化
- **加法混合**: 使用AdditiveBlending获得更佳的火焰效果
- **深度控制**: 可配置深度写入和测试
- **渲染顺序**: 可自定义渲染顺序避免Z-fighting
- **性能优化**: 支持LOD和视锥剔除

## 使用方法

### 基础用法

```typescript
import FireMarker from "path/to/fireMarker";

// 创建基础火焰
const fire = new FireMarker({
    position: [0, 1, 0],
    size: 2.0,
    intensity: 0.8
});

// 添加到场景
fire.addToScene(scene, camera);

// 在渲染循环中更新
function animate() {
    fire.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
animate();
```

### 高级配置

```typescript
const customFire = new FireMarker({
    // 基础属性
    position: [0, 1, 0],
    size: 1.5,
    billboard: true,
    visible: true,
    
    // 视觉效果
    intensity: 0.9,
    animationSpeed: 1.2,
    baseColor: 0xff4400,    // 底部颜色：橙红色
    tipColor: 0xffff00,     // 顶部颜色：黄色
    
    // 渲染设置
    opacity: 0.8,
    renderOrder: 1000,
    depthWrite: false,
    depthTest: true,
    
    // 动画参数
    flickerIntensity: 0.1,
    waveAmplitude: 0.1,
    
    // 回调函数
    onUpdate: (deltaTime) => {
        console.log(`Delta time: ${deltaTime}`);
    },
    onVisibilityChange: (visible) => {
        console.log(`Visibility changed: ${visible}`);
    }
});
```

## 配置参数

### FireMarkerConfig接口

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `position` | `THREE.Vector3 \| [number, number, number]` | `[0, 0, 0]` | 火焰位置 |
| `size` | `number` | `1.0` | 火焰大小 |
| `billboard` | `boolean` | `true` | 是否启用Billboard效果 |
| `visible` | `boolean` | `true` | 是否可见 |
| `intensity` | `number` | `1.0` | 火焰强度 (0-1) |
| `animationSpeed` | `number` | `1.0` | 动画速度倍率 |
| `baseColor` | `THREE.Color \| number` | `0xff4400` | 基础火焰颜色 |
| `tipColor` | `THREE.Color \| number` | `0xffff00` | 火焰顶部颜色 |
| `opacity` | `number` | `0.8` | 整体透明度 |
| `renderOrder` | `number` | `1000` | 渲染顺序 |
| `depthWrite` | `boolean` | `false` | 是否写入深度缓冲 |
| `depthTest` | `boolean` | `true` | 是否进行深度测试 |
| `flickerIntensity` | `number` | `0.1` | 闪烁强度 |
| `waveAmplitude` | `number` | `0.1` | 波动幅度 |
| `onUpdate` | `(deltaTime: number) => void` | - | 更新回调 |
| `onVisibilityChange` | `(visible: boolean) => void` | - | 可见性变化回调 |

## API方法

### 场景管理
- `addToScene(scene, camera?)`: 添加到场景
- `removeFromScene()`: 从场景移除
- `dispose()`: 销毁资源

### 属性控制
- `setPosition(position)`: 设置位置
- `getPosition()`: 获取位置
- `setVisible(visible)`: 设置可见性
- `getVisible()`: 获取可见性
- `setSize(size)`: 设置大小
- `setIntensity(intensity)`: 设置强度

### 动画控制
- `startAnimation()`: 开始动画
- `stopAnimation()`: 停止动画
- `update(deltaTime?)`: 更新动画
- `setBillboard(enabled)`: 启用/禁用Billboard

### 配置管理
- `getConfig()`: 获取配置
- `updateConfig(newConfig)`: 更新配置
- `getMesh()`: 获取网格对象

## 使用示例

### 多个火焰
```typescript
const fires = [];
for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const fire = new FireMarker({
        position: [Math.cos(angle) * 5, 0.5, Math.sin(angle) * 5],
        size: 1.5,
        intensity: 0.6 + Math.random() * 0.4
    });
    fire.addToScene(scene, camera);
    fires.push(fire);
}
```

### 自定义颜色
```typescript
// 蓝色火焰
const blueFire = new FireMarker({
    baseColor: 0x0044ff,
    tipColor: 0x88ccff,
    intensity: 0.9
});

// 绿色火焰
const greenFire = new FireMarker({
    baseColor: 0x00ff44,
    tipColor: 0xccff88,
    intensity: 0.9
});
```

### 动态控制
```typescript
const fire = new FireMarker();
let time = 0;

function controlLoop() {
    time += 0.016;
    
    // 呼吸效果
    const intensity = 0.5 + 0.3 * Math.sin(time * 2);
    fire.setIntensity(intensity);
    
    // 动态移动
    const x = Math.sin(time * 0.5) * 2;
    const z = Math.cos(time * 0.5) * 2;
    fire.setPosition([x, 0.5, z]);
    
    requestAnimationFrame(controlLoop);
}
```

### 性能优化
```typescript
// 创建大量火焰时的优化设置
const fire = new FireMarker({
    renderOrder: 1001,
    depthWrite: false,
    flickerIntensity: 0.05,  // 降低闪烁强度
    waveAmplitude: 0.08      // 降低波动幅度
});

// 视锥剔除优化
const frustum = new THREE.Frustum();
const cameraMatrix = new THREE.Matrix4();

function optimizedUpdate() {
    cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(cameraMatrix);
    
    fires.forEach(fire => {
        if (frustum.containsPoint(fire.getPosition())) {
            fire.update();
            fire.setVisible(true);
        } else {
            fire.setVisible(false);
        }
    });
}
```

## 技术实现

### Shader材质
- **顶点着色器**: 实现火焰形变、波动和闪烁效果
- **片元着色器**: 实现颜色渐变、噪声纹理和透明度控制
- **Uniforms**: 时间、强度、颜色等可调参数

### Billboard技术
```typescript
// 在update方法中实现
if (this.billboardEnabled && this.camera) {
    this.mesh.lookAt(this.camera.position);
}
```

### 几何体优化
```typescript
const geometry = new THREE.PlaneGeometry(
    this.config.size, 
    this.config.size * 1.5, // 火焰通常更高
    4, // width segments
    8  // height segments - 更多段数获得更好的变形效果
);
```

## 注意事项

1. **性能考虑**: 大量火焰对象时建议使用视锥剔除和LOD优化
2. **渲染顺序**: 火焰使用透明材质，注意设置合适的renderOrder
3. **更新频率**: 在渲染循环中调用update()方法保持动画流畅
4. **资源管理**: 使用完毕后调用dispose()方法释放资源
5. **浏览器兼容**: 需要WebGL支持，建议检查浏览器兼容性

## 扩展开发

### 自定义Shader
可以通过修改`getEnhancedVertexShader()`和`getEnhancedFragmentShader()`方法来自定义火焰效果。

### 插件集成
FireMarker可以轻松集成到现有的Three.js项目和插件系统中。

### 物理模拟
可以结合物理引擎实现更复杂的火焰行为，如风力影响等。 
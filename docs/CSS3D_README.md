# CSS3D渲染插件

这是一个将HTML组件（包括Vue、React组件）转换为3D对象的插件，基于Three.js的CSS3DRenderer实现。

## 功能特性

- ✅ 支持HTML元素转3D对象
- ✅ 支持Vue/React组件转3D对象  
- ✅ 位置、旋转、缩放控制
- ✅ 平滑动画过渡
- ✅ 晃动效果
- ✅ 资源自动清理
- ✅ 完整的生命周期管理
- ✅ 事件总线通知

## 安装和初始化

```typescript
import { CSS3DRenderPlugin } from './css3DRender'

// 创建插件实例
const css3dPlugin = new CSS3DRenderPlugin()

// 初始化（需要传入Core接口）
css3dPlugin.initialize(coreInterface)

// 启动插件
await css3dPlugin.start()

// 获取渲染器并添加到DOM
const renderer = css3dPlugin.getRenderer()
if (renderer) {
    document.body.appendChild(renderer.domElement)
}
```

## 基础用法

### 创建3D对象

```typescript
// 方式1：直接传入HTML元素
const divElement = document.createElement('div')
divElement.innerHTML = '<h1>Hello 3D World!</h1>'

const objectId = css3dPlugin.createCSS3DObject({
    component: divElement,
    position: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, Math.PI / 4, 0),
    scale: 1.0
})

// 方式2：使用CSS选择器
const objectId2 = css3dPlugin.createCSS3DObject({
    component: '#my-html-element',
    position: new THREE.Vector3(2, 0, 0)
})
```

### 操作3D对象

```typescript
// 设置位置
css3dPlugin.setPosition(objectId, new THREE.Vector3(1, 2, 3))

// 设置旋转
css3dPlugin.setRotation(objectId, new THREE.Euler(0.1, 0.2, 0.3))

// 设置缩放
css3dPlugin.setScale(objectId, 1.5) // 统一缩放
css3dPlugin.setScale(objectId, new THREE.Vector3(1, 2, 1)) // 各轴不同缩放

// 动画到指定位置
await css3dPlugin.animateToPosition(objectId, new THREE.Vector3(5, 0, 0), 2000)

// 晃动效果
await css3dPlugin.shake(objectId, 0.1, 1000) // 强度0.1，持续1秒

// 销毁对象
css3dPlugin.destroyCSS3DObject(objectId)
```

### 渲染循环

```typescript
function animate() {
    requestAnimationFrame(animate)
    
    // 更新相机等其他操作...
    
    // 渲染CSS3D场景
    css3dPlugin.render(camera)
}
animate()
```

## 配置选项

### CSS3DPluginConfig

```typescript
interface CSS3DPluginConfig {
    component: HTMLElement | string  // HTML元素或CSS选择器
    position?: THREE.Vector3         // 初始位置
    rotation?: THREE.Euler          // 初始旋转
    scale?: number                  // 初始缩放
}
```

## API参考

### 主要方法

| 方法名 | 参数 | 返回值 | 描述 |
|--------|------|--------|------|
| `createCSS3DObject` | `config: CSS3DPluginConfig` | `string` | 创建3D对象，返回唯一ID |
| `destroyCSS3DObject` | `objectId: string` | `boolean` | 销毁指定3D对象 |
| `setPosition` | `objectId: string, position: THREE.Vector3` | `boolean` | 设置对象位置 |
| `setRotation` | `objectId: string, rotation: THREE.Euler` | `boolean` | 设置对象旋转 |
| `setScale` | `objectId: string, scale: number \| THREE.Vector3` | `boolean` | 设置对象缩放 |
| `animateToPosition` | `objectId: string, target: THREE.Vector3, duration?: number` | `Promise<boolean>` | 动画移动到指定位置 |
| `shake` | `objectId: string, intensity?: number, duration?: number` | `Promise<boolean>` | 晃动效果 |
| `render` | `camera: THREE.Camera` | `void` | 渲染场景 |
| `getRenderer` | - | `CSS3DRenderer \| null` | 获取渲染器实例 |

### 生命周期方法

| 方法名 | 描述 |
|--------|------|
| `initialize(core: CoreType)` | 初始化插件 |
| `start()` | 启动插件 |
| `stop()` | 停止插件 |
| `uninstall()` | 卸载插件并清理资源 |
| `getExports()` | 获取插件导出的功能 |

## 事件通知

插件会通过事件总线发送以下事件：

- `css3d-plugin-started` - 插件启动完成
- `css3d-plugin-stopped` - 插件停止
- `css3d-plugin-unloaded` - 插件卸载
- `css3d-object-created` - 3D对象创建成功
- `css3d-object-destroyed` - 3D对象销毁

```typescript
import eventBus from '../../eventBus/eventBus'

eventBus.on('css3d-object-created', (data) => {
    console.log('3D对象已创建:', data.id)
})
```

## 使用示例

### Vue组件转3D

```typescript
// 假设有一个Vue组件实例
const vueComponent = new Vue({
    template: `
        <div class="vue-3d-card">
            <h2>{{ title }}</h2>
            <p>{{ content }}</p>
            <button @click="handleClick">点击我</button>
        </div>
    `,
    data: {
        title: '3D Vue组件',
        content: '这是一个转换为3D的Vue组件'
    },
    methods: {
        handleClick() {
            alert('3D Vue组件被点击了！')
        }
    }
})

// 挂载到临时容器
const container = document.createElement('div')
vueComponent.$mount(container)

// 转换为3D对象
const objectId = css3dPlugin.createCSS3DObject({
    component: vueComponent.$el,
    position: new THREE.Vector3(0, 1, 0),
    scale: 0.8
})
```

### React组件转3D

```typescript
import React from 'react'
import ReactDOM from 'react-dom'

// React组件
const ReactCard = () => {
    return (
        <div style={{
            width: '300px',
            padding: '20px',
            background: 'white',
            borderRadius: '10px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
        }}>
            <h2>3D React组件</h2>
            <p>这是一个转换为3D的React组件</p>
            <button onClick={() => alert('React组件被点击!')}>
                点击我
            </button>
        </div>
    )
}

// 渲染到临时容器
const container = document.createElement('div')
ReactDOM.render(<ReactCard />, container)

// 转换为3D对象
const objectId = css3dPlugin.createCSS3DObject({
    component: container.firstChild as HTMLElement,
    position: new THREE.Vector3(-2, 0, 0)
})
```

## 最佳实践

1. **资源管理**: 及时销毁不需要的3D对象，避免内存泄漏
2. **性能优化**: 避免创建过多的CSS3D对象，会影响渲染性能
3. **事件处理**: 组件内的事件仍然可以正常工作
4. **样式设计**: CSS3D对象的样式要考虑3D环境的视觉效果
5. **响应式**: 考虑不同屏幕尺寸的适配

## 注意事项

- CSS3D对象的DOM事件可能会受到3D变换的影响
- 某些CSS属性在3D环境中可能表现不同
- 建议在CSS3D对象中避免使用复杂的CSS动画
- 插件依赖Three.js，确保正确引入相关依赖

## 故障排除

### 常见问题

**Q: 创建的3D对象不显示？**
A: 检查是否正确调用了`render()`方法，相机位置是否合适

**Q: HTML元素事件不响应？**
A: 确保CSS3DRenderer的`domElement`的`pointerEvents`样式设置正确

**Q: 动画效果卡顿？**
A: 减少同时进行动画的对象数量，或调整动画持续时间

**Q: 内存占用过高？**
A: 及时调用`destroyCSS3DObject()`清理不需要的对象 
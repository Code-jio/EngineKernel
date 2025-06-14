# 渲染顺序(renderOrder)更新说明

## 概述

本次更新将地板和天空盒的`renderOrder`统一设置为`0`，确保它们在渲染顺序中处于最底层，为其他3D对象提供正确的渲染基础。

## 修改内容

### 1. 地板管理器 (FloorManager)

**文件**: `EngineKernel/src/plugins/webgl/floorManager.ts`

**修改位置**: `createFloor` 方法

```typescript
if (this.floor) {
    this.floor.position.set(...config.position)
    this.floor.receiveShadow = true
    this.floor.renderOrder = 0  // 设置地板渲染顺序为0
    this.scene.add(this.floor)
    console.log(`✅ ${config.type}地板已创建，renderOrder设置为0`)
}
```

**影响范围**: 所有地板类型
- 水面地板 (water)
- 静态地板 (static)
- 反射地板 (reflection)
- 网格地板 (grid)
- 发光地板 (glow)
- 无限地板 (infinite)

### 2. 天空盒插件 (SkyBox)

**文件**: `EngineKernel/src/plugins/webgl/skyBox.ts`

**修改位置**: 所有天空盒创建方法

#### 2.1 HDR/EXR环境天空盒
```typescript
this.mesh = new THREE.Mesh(geometry, material)
this.mesh.renderOrder = 0  // 设置天空盒渲染顺序为0
this.mesh.name = "skyBox"
```

#### 2.2 立方体贴图天空盒
```typescript
this.mesh = new THREE.Mesh(geometry, material)
this.mesh.renderOrder = 0  // 设置天空盒渲染顺序为0
this.mesh.name = "skyBox"
```

#### 2.3 环境贴图天空盒
```typescript
this.mesh = new THREE.Mesh(geometry, material)
this.mesh.renderOrder = 0  // 设置天空盒渲染顺序为0
this.mesh.name = "skyBox"
```

#### 2.4 程序化天空盒
```typescript
this.mesh = this.skyMaterial.getMesh()
this.mesh.renderOrder = 0  // 设置天空盒渲染顺序为0
this.mesh.name = "skyBox"
```

## 渲染顺序说明

### Three.js renderOrder 机制

- `renderOrder` 值越小，越先渲染
- 默认值为 `0`
- 负值会在默认对象之前渲染
- 正值会在默认对象之后渲染

### 推荐的渲染顺序层级

```
-1000: 特殊背景元素
    0: 天空盒、地板 (本次更新)
  100: 基础模型
  200: 模型标注
  300: 精灵图层
  400: CSS3D图层
  500: 图片标注
 1000: UI元素
```

## 测试验证

创建了测试文件 `EngineKernel/examples/renderOrder-test.ts` 来验证修改效果：

```typescript
// 使用示例
import { runRenderOrderTest } from './examples/renderOrder-test'

// 运行测试
runRenderOrderTest()
```

### 测试功能

1. **地板renderOrder测试**: 验证地板对象的renderOrder是否为0
2. **天空盒renderOrder测试**: 验证天空盒对象的renderOrder是否为0
3. **场景对象信息**: 列出所有对象的renderOrder信息

## 兼容性

### 向后兼容性
- ✅ 完全向后兼容
- ✅ 不影响现有API
- ✅ 不改变现有行为逻辑

### 影响范围
- ✅ 仅影响渲染顺序
- ✅ 不影响对象功能
- ✅ 不影响性能

## 使用建议

### 1. 新项目
直接使用，无需额外配置。

### 2. 现有项目
如果有自定义的renderOrder设置，请确保：
- 天空盒和地板保持在 `renderOrder = 0`
- 其他对象使用正值 (1, 100, 200等)
- 特殊效果可以使用负值

### 3. 调试技巧
```typescript
// 获取场景中所有对象的renderOrder信息
scene.sceneInstance.traverse((object) => {
    if (object instanceof THREE.Mesh) {
        console.log(`${object.name}: renderOrder=${object.renderOrder}`)
    }
})
```

## 相关文件

- `EngineKernel/src/plugins/webgl/floorManager.ts` - 地板管理器
- `EngineKernel/src/plugins/webgl/skyBox.ts` - 天空盒插件
- `EngineKernel/examples/renderOrder-test.ts` - 测试文件
- `EngineKernel/src/plugins/webgl/layerManager.ts` - 图层管理器(参考)

## 注意事项

1. **渲染性能**: renderOrder为0的对象会在默认渲染队列中处理，性能最优
2. **深度测试**: 地板和天空盒仍然参与正常的深度测试
3. **透明度**: 透明对象的渲染顺序仍然由距离决定
4. **材质类型**: 不同材质类型(opaque/transparent)有独立的渲染队列

## 更新日期

2024年12月19日 
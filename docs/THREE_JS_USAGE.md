# Three.js 使用规范

## 问题背景

在项目中遇到了 "Multiple instances of Three.js being imported" 警告，这会导致：
- 打包体积增大
- 运行时性能问题
- 潜在的版本冲突

## 解决方案

### 1. 统一导入规范

**✅ 正确方式：**
```typescript
// 使用统一的导入文件
import { THREE, GLTFLoader, OrbitControls } from '@/utils/three-imports';
```

**❌ 错误方式：**
```typescript
// 不要直接从three导入
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
```

### 2. 可用的Three.js模块

通过 `@/utils/three-imports` 可以导入：
- `THREE` - 核心Three.js库
- `GLTFLoader` - GLTF模型加载器
- `OrbitControls` - 轨道控制器
- `CSS3DRenderer`, `CSS3DObject` - CSS3D渲染器
- `Stats` - 性能监控
- `WebGPURenderer` - WebGPU渲染器
- `GLTF` - GLTF类型（仅类型）

### 3. 添加新的Three.js模块

如需使用新的Three.js扩展模块：
1. 在 `src/utils/three-imports.ts` 中添加导入
2. 在导出列表中添加该模块
3. 更新此文档

### 4. Webpack配置

项目已配置：
- Three.js别名确保单一实例
- 模块连接优化
- 智能代码分割

## 开发建议

1. **统一入口**：所有Three.js相关导入都通过 `three-imports.ts`
2. **类型安全**：使用TypeScript类型确保正确使用
3. **按需导入**：只导入实际使用的模块
4. **避免重复**：检查是否已有模块可复用

## 检查工具

运行以下命令检查Three.js依赖：
```bash
npm ls three
```

如果看到多个版本，需要解决依赖冲突。 
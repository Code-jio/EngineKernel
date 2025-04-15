# EngineCore - 微内核架构引擎核心

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/yourname/engine-test/actions)

现代Web应用插件化解决方案，提供安全稳定的插件生命周期管理和模块通信能力。

## ✨ 核心特性

- **微内核架构** - 核心系统 < 100KB（gzip）
- **插件热管理** - 支持运行时注册/卸载插件
- **多策略加载** - 同步/异步加载模式自由切换
- **安全沙箱** - 插件隔离执行环境（基于iframe实现）
- **事件中枢** - 毫秒级事件广播系统

## 🚀 快速开始

### 安装

```bash
npm install @engine-core/core
```

## 📂 项目结构

``````
engine-test/
├── config/         # 构建配置
│   ├── base.config.js
│   ├── dev.config.js
│   └── prod.config.js
├── src/
│   ├── core/       # 核心系统
│   ├── plugins/    # 插件实现
│   ├── utils/      # 工具函数
│   └── index.js    # 主入口
└── dist/           # 构建输出
``````




### 基本用法

```
import EngineCore from '@engine-core/core';
import LoggerPlugin from './plugins/logger';

const core = new EngineCore();

// 注册插件
core.registerPlugin({
  name: 'logger',
  path: './plugins/logger.js',
  strategy: 'async'
});

// 初始化系统
core.init().then(() => {
  console.log('EngineCore 初始化完成');
});
```

### 构建命令

```
npm run build  # 生产环境构建（单文件输出）
npm run dev    # 开发模式（带热更新）
```

## 🏗️ 系统架构

``````mermaid
graph TD
    Core[核心系统] -->|管理| PluginManager[插件管理器]
    Core -->|通信| EventBus[事件总线]
    PluginManager -->|加载| PluginA[业务插件A]
    PluginManager -->|加载| PluginB[基础插件B]
    PluginA -->|依赖| PluginB
``````



## 🔌 插件开发

### 创建插件

```
export default class LoggerPlugin {
  constructor(core) {
    this.core = core;
    this.name = 'logger';
  }

  initialize() {
    this.core.eventBus.on('*', this.logEvent);
  }

  logEvent = (event, data) => {
    console.log(`[${new Date().toISOString()}]`, event, data);
  }

  uninstall() {
    this.core.eventBus.off('*', this.logEvent);
  }
}
```

### 插件规范

* **必须实现 **`initialize` 和 `uninstall` 方法
* **插件名称需符合 **`/^[a-zA-Z0-9_-]+$/` 格式
* **异步插件需声明 **`strategy: 'async'`

## ⚙️ 配置说明

### 生产配置

```
output: {
  filename: 'my-library.min.js',  // 单文件输出
},
optimization: {
  splitChunks: false,        // 禁用代码分割
  runtimeChunk: false         // 禁用runtime文件
}
```

### 安全策略

```
const ALLOWED_ORIGINS = [
  '/plugins/',
  'https://cdn.example.com/'
];

export function validatePluginSource(path) {
  return ALLOWED_ORIGINS.some(origin => path.includes(origin));
}
```

## 📚 API 文档

### Core 实例

| **方法**             | **参数**         | **说明**         |
| -------------------------- | ---------------------- | ---------------------- |
| **registerPlugin**   | **PluginMeta**   | **注册新插件**   |
| **unregisterPlugin** | **name: string** | **卸载插件**     |
| **getPlugin**        | **name: string** | **获取插件实例** |

### PluginMeta 结构

```
interface PluginMeta {
  name: string;         // 插件唯一标识
  path: string;         // 插件文件路径
  strategy?: 'sync' | 'async';  // 加载策略
  dependencies?: string[];     // 依赖插件列表
}
```

## 🤝 贡献指南

1. **Fork 仓库并创建特性分支**
2. **遵循 ESLint 代码规范**
3. **提交信息使用 Conventional Commits 格式**
4. **更新相关文档**
5. **提交 Pull Request**

## 📜 开源协议

**本项目基于 **[MIT License](LICENSE) 授权

## 📬 技术支持

* **问题跟踪：**[GitHub Issues](https://github.com/yourname/engine-test/issues)
* **技术讨论：**[Discussions](https://github.com/yourname/engine-test/discussions)
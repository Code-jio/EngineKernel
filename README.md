# MyLibrary 使用指南

## 安装
```bash
npm install /path/to/dist/my-library.min.js
```

## 使用方式

### 浏览器环境
```html
<script src="dist/my-library.min.js"></script>
<script>
  // 通过全局变量访问
  console.log(MyLibrary.version);
</script>
```

### Node.js环境
```javascript
const MyLibrary = require('my-library');
console.log('Library methods:', Object.keys(MyLibrary));
```

### ES Module
```javascript
import MyLibrary from 'my-library';
// 使用库的ES模块导出功能
```

## 示例代码
参考/examples目录中的浏览器和Node.js示例
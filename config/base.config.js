import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  entry: path.join(__dirname, '../src/index.js'),
  output: {
    path: path.join(__dirname, '../dist'),
    filename: 'my-library.js',
    clean: true,  // 新增自动清理 dist 目录
    publicPath: '/',
    library: {
      name: 'MyLibrary',    // 更推荐的对象形式配置
      type: 'umd',
    },
    globalObject: 'this'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src')
    },
    extensions: ['.js', '.jsx', '.ts'],  // 添加更多扩展类型
  },
  plugins: [

  ]
};
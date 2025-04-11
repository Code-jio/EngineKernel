import { merge } from 'webpack-merge';
import baseConfig from './base.config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import TerserPlugin from 'terser-webpack-plugin'; // 新增压缩优化插件

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default merge(baseConfig, {
  mode: 'production',
  experiments: {
    outputModule: true
  },
  output: {
    path: path.join(__dirname, '../dist'),
    filename: 'my-library.min.js',
    publicPath: '/',
    library: {
      name: 'MyLibrary',
      type: 'umd',
      umdNamedDefine: true
    },
    iife: true, // 新增 IIFE 配置
    globalObject: 'this',
    chunkFormat: 'module'
  }
});
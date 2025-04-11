import { merge } from 'webpack-merge';
import baseConfig from './base.config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import TerserPlugin from 'terser-webpack-plugin'; // 新增压缩优化插件

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default merge(baseConfig, {
  mode: 'production',
  output: {
    path: path.join(__dirname, '../dist'),
    filename: 'my-library.min.js',
    publicPath: '/',
    library: {
      name: 'MyLibrary',
      type: 'umd',
      umdNamedDefine: true
    },
    globalObject: 'this'
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      parallel: true,
      extractComments: false,
      terserOptions: {
        compress: {
          drop_console: true
        }
      }
    })],
    // 禁用所有代码分割配置
    splitChunks: false,
    runtimeChunk: false
  }
});
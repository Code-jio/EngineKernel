import { merge } from "webpack-merge"
import baseConfig from "./webpack.base.config.js"
import path from "path"
import { fileURLToPath } from "url"
import TerserPlugin from 'terser-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default merge(baseConfig, {
    mode: "production",
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin({
            terserOptions: {
                compress: {
                    drop_console: true, 
                    pure_funcs: ['console.log'] 
                },
                mangle: true,
                output: {
                    comments: false
                }
            }
        })],
        // 生产环境启用代码分割
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                // 将Three.js相关代码打包到单独的chunk中
                three: {
                    test: /[\\/]node_modules[\\/]three[\\/]/,
                    name: 'three',
                    chunks: 'all',
                    enforce: true,
                    // 确保Three.js不会被重复打包
                    reuseExistingChunk: true,
                },
                // 其他vendor库
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    priority: -10,
                    reuseExistingChunk: true,
                },
                // 公共代码
                default: {
                    minChunks: 2,
                    priority: -20,
                    reuseExistingChunk: true,
                },
            },
        },
    },
    experiments: {
        outputModule: true, // 开启模块输出
    },
    entry: path.resolve(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "[name].[contenthash:8].min.js", // 使用内容哈希和动态命名
        chunkFilename: "[name].[contenthash:8].chunk.js", // chunk文件命名
        publicPath: "/",
        library: {
            name: "EngineKernel",
            type: "umd",
            umdNamedDefine: true, // 命名 AMD 模块，以避免与其他库冲突
        },
        iife: true, // 立即执行函数
        globalObject: "this", // 全局对象
        chunkFormat: "module", // 模块格式
    },
})

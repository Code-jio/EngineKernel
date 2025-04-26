import { merge } from "webpack-merge"
import baseConfig from "./base.config.js"
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
        })]
    },
    experiments: {
        outputModule: true, // 开启模块输出
    },
    entry: path.resolve(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "engine-kernel.min.js",
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

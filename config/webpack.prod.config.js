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
        // 禁用代码分割，生成单一文件
        splitChunks: {
            chunks: () => false,
        },
    },
    entry: path.resolve(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "engine-kernel.min.js", // 使用固定文件名
        publicPath: "/",
        clean: true, // 清理输出目录
        // 保持基础配置的library设置，确保能正确暴露全局变量
        library: {
            name: "EngineKernel",
            type: "umd",
            umdNamedDefine: true,
        },
        globalObject: "this",
    },
})

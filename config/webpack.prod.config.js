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
            },
            include: /main\.js$/ // 只压缩主入口文件，不压缩worker文件
        })],
        // 禁用代码分割，生成单一文件
        splitChunks: {
            chunks: () => false,
        }
    },
    entry: {
        main: path.resolve(__dirname, "../src/index.ts"),
        "workers/gltfLoaderWorker": path.resolve(__dirname, "../src/workers/gltfLoaderWorker.ts")
    },
    output: {
        path: path.join(__dirname, "../dist"),
        filename: (pathData) => {
            // 为不同入口生成不同的文件名
            if (pathData.chunk.name === 'main') {
                return "engine-kernel.min.js"; // 主入口使用固定文件名
            } else {
                return "[name].js"; // worker入口使用路径作为文件名
            }
        },
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

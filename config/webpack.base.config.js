import { fileURLToPath } from "url"
import path from "path"
import { createRequire } from "node:module"
import webpack from "webpack"
const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    entry: path.join(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "engine-kernel.js", // 基础文件名，各环境会覆盖
        clean: true,
        publicPath: "/",
        library: {
            name: "EngineKernel",
            type: "umd",
            umdNamedDefine: true,
        },
        globalObject: "this",
    },
    ignoreWarnings: [/Failed to parse source map/, /Critical dependency/, /Module not found:/],
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            onlyCompileBundledFiles: true, // 只编译当前项目的文件
                            compilerOptions: {
                                esModuleInterop: true, // 启用ES模块互操作
                            },
                        },
                    },
                ],
                exclude: [/node_modules/],
            },
        ],
    },
    resolve: {
        extensions: [".js", ".ts"],
        alias: {
            '@': path.resolve(__dirname, '../src').replace(/\\/g, '/'), // 统一POSIX路径格式
            // 确保Three.js只有一个实例
            'three': path.resolve(__dirname, '../node_modules/three'),
            'three/examples': path.resolve(__dirname, '../node_modules/three/examples'),
        },
        fallback: {
            vm: require.resolve("vm-browserify"),
            util: require.resolve("util/"),
            path: require.resolve("path-browserify"),
            fs: false,
        },
    },
    optimization: {
        concatenateModules: true,
        providedExports: true,
        usedExports: true,
        sideEffects: false,
    },
    plugins: [
        // 模块连接插件，确保同一模块不会被重复实例化
        new webpack.optimize.ModuleConcatenationPlugin(),
    ],
}

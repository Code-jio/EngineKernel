import { fileURLToPath } from "url"
import path from "path"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    entry: path.join(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "engine-kernel.dev.js",
        clean: true,
        publicPath: "/",
        library: {
            name: "EngineKernel",
            type: "umd",
            umdNamedDefine: true,
        },
        globalObject: "this",
    },
    optimization: {
        minimize: false,
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
            "@": path.resolve(__dirname, "../src"),
        },
        fallback: {
            vm: require.resolve("vm-browserify"),
            util: require.resolve("util/"),
            path: require.resolve("path-browserify"),
        },
    },
    plugins: [],
}

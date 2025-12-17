import { fileURLToPath } from "url"
import path from "path"
import { createRequire } from "node:module"
import webpack from "webpack"
import fs from "fs"
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
        // 添加静态资源复制配置
        assetModuleFilename: "public/[name][ext]",
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
                            configFile: path.resolve(__dirname, "../tsconfig.json"), // 明确指定配置文件
                            compilerOptions: {
                                esModuleInterop: true, // 启用ES模块互操作
                                sourceMap: true, // 确保生成源码映射
                            },
                        },
                    },
                ],
                exclude: [/node_modules/],
            },
            {
                // 处理Service Worker文件
                test: /\.js$/,
                include: [
                    path.resolve(__dirname, "../src/utils/network-interceptor-sw.js")
                ],
                type: "asset/resource",
                generator: {
                    filename: "public/[name][ext]",
                },
            },
        ],
    },
    resolve: {
        extensions: [".js", ".ts"],
        alias: {
            "@": path.resolve(__dirname, "../src").replace(/\\/g, "/"), // 统一POSIX路径格式
            // 确保Three.js只有一个实例
            three: path.resolve(__dirname, "../node_modules/three"),
            "three/examples": path.resolve(__dirname, "../node_modules/three/examples"),
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
        
        // 自定义插件：复制Service Worker文件到dist目录
        {
            apply: (compiler) => {
                compiler.hooks.afterEmit.tap('CopyServiceWorkerPlugin', (compilation) => {
                    const sourcePath = path.resolve(__dirname, '../src/utils/network-interceptor-sw.js');
                    const destPath = path.resolve(__dirname, '../dist/public/network-interceptor-sw.js');
                    
                    // 确保目标目录存在
                    const destDir = path.dirname(destPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    
                    // 复制文件
                    if (fs.existsSync(sourcePath)) {
                        fs.copyFileSync(sourcePath, destPath);
                        console.log('✅ Service Worker文件已复制到:', destPath);
                    } else {
                        console.warn('⚠️ Service Worker源文件不存在:', sourcePath);
                    }
                });
            }
        },
        
        // 自定义插件：复制GLTF Worker文件到dist目录
        {
            apply: (compiler) => {
                compiler.hooks.afterEmit.tap('CopyGLTFWorkerPlugin', (compilation) => {
                    const sourcePath = path.resolve(__dirname, '../src/workers/gltfLoaderWorker.ts');
                    const destPath = path.resolve(__dirname, '../dist/workers/gltfLoaderWorker.js');
                    
                    // 确保目标目录存在
                    const destDir = path.dirname(destPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    
                    // 复制文件
                    if (fs.existsSync(sourcePath)) {
                        // 这里我们只需要确保目录存在，文件将由webpack的asset/resource处理
                        console.log('✅ GLTF Worker目录已准备好:', destDir);
                    } else {
                        console.warn('⚠️ GLTF Worker源文件不存在:', sourcePath);
                    }
                });
            }
        }
    ],
}

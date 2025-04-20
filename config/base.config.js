import { fileURLToPath } from "url"
import path from "path"

import { createRequire } from "node:module"
const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
    entry: path.join(__dirname, "../src/index.ts"),
    output: {
        path: path.join(__dirname, "../dist"),
        filename: "my-library.js",
        clean: true,
        publicPath: "/",
        library: {
            name: "MyLibrary",
            type: "umd",
        },
        globalObject: "this",
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: "ts-loader",
                    options: {
                        compilerOptions: {
                            esModuleInterop: true,
                        },
                    },
                },
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".js"],
        alias: {
            '@': path.resolve(__dirname, '../src')
        },
        fallback: {
            vm: require.resolve("vm-browserify"),
            util: require.resolve("util/"),
            path: require.resolve("path-browserify"),
        },
    },
    plugins: [],
}

export declare function isValidPath(filePath: string): boolean;
export declare const pathUtils: {
    resolvePath: (basePath: string, relativePath: string) => string;
    joinPath: (...paths: string[]) => string;
    isValidPath: typeof isValidPath;
};

import * as path from 'path';

export function isValidPath(filePath: string): boolean {
  const validPattern = /^(\.\.?\/|[a-zA-Z]:\\|\/)/;
  return validPattern.test(filePath);
}


export const pathUtils = {
  resolvePath: (basePath: string, relativePath: string): string =>
    path.resolve(basePath, relativePath),
  joinPath: (...paths: string[]): string => path.join(...paths),
  isValidPath,
};
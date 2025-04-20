declare module 'vm-browserify' {
  export function createContext(context?: object): object;
  export function runInContext(code: string, context: object): any;
  export class Script {
    constructor(code: string);
    runInContext(context: object): any;
  }
}
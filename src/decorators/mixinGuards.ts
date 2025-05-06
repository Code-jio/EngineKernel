// 混入工具函数
export function applyMixins<T extends new (...args: any[]) => any>(derivedCtor: T, baseCtors: any[]) {
    baseCtors = baseCtors.filter(b => b?.prototype)
    baseCtors.forEach(baseCtor => {
        if (!baseCtor?.prototype) {
            console.warn(`Mixin class ${baseCtor?.name || "unknown"} has no prototype, skipping.`)
            return
        }

        Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
            if (name !== "constructor" && !derivedCtor.prototype[name]) {
                Object.defineProperty(
                    derivedCtor.prototype,
                    name,
                    Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null),
                )
            }
        })
    })
}
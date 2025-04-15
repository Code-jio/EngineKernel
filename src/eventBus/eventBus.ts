import mitt from 'mitt';
import type { EventBus } from "../types/core"

const eventBus = mitt() as EventBus;

// 扩展 once 方法
eventBus.once = (type: string, handler: Function) => {
    const wrapper = (...args: any[]) => {
        handler(...args);
        eventBus.off(type, wrapper);
    };
    eventBus.on(type, wrapper);
};

export default eventBus;
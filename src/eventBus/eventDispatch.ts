export interface BaseEvent {
    type: string
}

export interface Event extends BaseEvent {
    target?: any
    [attachment: string]: any
}

export interface EventListener<E extends BaseEvent = Event> {
    (event: E): void
}

export class EventDispatcher {
    listeners: Map<string, Array<Function>> = new Map()

    constructor() { 
        this.listeners = new Map()
    }
    /**
     * 订阅一个事件
     * @param type 事件类型
     * @param listener 触发该类型时的执行函数
     * @returns
     */
    addEventListener<C extends BaseEvent>(type: string, listener: EventListener<C>): void {
        const listeners = this.listeners

        if (!listeners.has(type)) {
            listeners.set(type, [])
        }
        const array = listeners.get(type)!
        if (array.includes(listener)) {
            return
        }
        array.push(listener)
    }

    /**
     * 判断该事件类型下是否有相关方法
     * @param type 事件类型
     * @param listener 事件方法
     * @returns true or false
     */
    hasEventListener<C extends BaseEvent>(type: string, listener: EventListener<C>): boolean {
        const listeners = this.listeners
        if (!listeners.has(type)) {
            return false
        }

        return listeners.get(type)!.includes(listener)
    }

    /**
     * 移除事件(包括该事件对应的节流事件和防抖事件)
     * @param type 事件类型
     * @param listener 事件方法
     * @returns
     */
    removeEventListener<C extends BaseEvent>(type: string, listener: EventListener<C>): void {
        const listeners = this.listeners
        if (!listeners.has(type)) {
            return
        }

        const array = listeners.get(type)!

        if (array.includes(listener)) {
            array.splice(array.indexOf(listener), 1)
        }
    }

    /**
     * 移除该类型的所有事件
     * @param type 事件类型
     * @returns
     */
    removeEvent(type: string): void {
        const listeners = this.listeners
        if (!listeners.has(type)) {
            return
        }
        listeners.delete(type)
    }

    /**
     * 触发事件
     * @param event
     * event.type 必传，为需要触发的事件类型
     * event.xxx 为其他需要传入的数据
     * @returns
     */
    dispatchEvent<C extends BaseEvent>(event: C): void {
        if (!event?.type) throw new Error('事件对象缺少type属性')
        const type = event.type
        const listeners = this.listeners
        if (listeners.has(type)) {
            try {
                listeners.get(type)?.forEach(listener => {
                    listener.call(this, event)
                })
            } catch (error) {
                console.error(error)
            }
        }
    }

    /**
     * 一次性事件触发，触发一次之后会自动被移除
     * @param type 事件类型
     * @param listener 事件方法
     */
    once<C extends BaseEvent>(type: string, listener: EventListener<C>): void {
        const onceListener = function (this: EventDispatcher, event: C) {
            listener.call(this, event)
            // 防止影响当前列表的length导致出问题
            Promise.resolve().then(() => {
                this.removeEventListener(type, onceListener)
            })
        }

        this.addEventListener(type, onceListener)
    }

    /**
     * 触发事件
     * @param name 事件类型
     * @param params 其他的事件参数
     */
    emit<C extends BaseEvent>(name: C["type"], params: Omit<C, "type"> = {} as Omit<C, "type">): void {
        const listeners = this.listeners
        if (listeners.has(name)) {
            try {
                listeners.get(name)?.forEach(listener => {
                    listener.call(this, params)
                })
            } catch (error) {
                console.error(error)
            }
        }
    }

    /**
     * 订阅事件
     * @param type 事件类型
     * @param listener 事件方法
     */
    on<C extends BaseEvent>(type: C["type"], listener: EventListener<C>): void {
        this.addEventListener(type, listener)
    }

    /**
     * 判断该事件类型下是否有此事件
     * @param type 事件类型
     * @param listener 事件方法
     * @returns
     */
    has<C extends BaseEvent>(type: C["type"], listener: EventListener<C>): boolean {
        return this.hasEventListener(type, listener)
    }

    /**
     * 移除事件，如果不传listener就会移除整个type事件类型下的事件
     * @param type 事件类型
     * @param listener 事件方法
     * @returns
     */
    off<C extends BaseEvent>(type: C["type"], listener?: EventListener<C>): void {
        if (listener) {
            this.removeEventListener(type, listener)
        } else {
            this.removeEvent(type)
        }
    }

    /**
     * 获取该事件类型下的事件数量
     * @param type 事件类型
     * @returns 数量
     */
    eventCount(type: string): number {
        if (!this.listeners.has(type)) {
            return 0
        }
        return this.listeners.get(type)!.length
    }

    /**
     * 销毁该类型的最后一个事件
     * @param type 事件类型
     * @returns
     */
    popLatestEvent(type: string): void {
        if (!this.listeners.has(type)) {
            return
        }
        this.listeners.get(type)!.pop()
    }

    /**
     * 清空所有事件类型的事件
     */
    clear(): void {
        this.listeners.clear()
    }
}

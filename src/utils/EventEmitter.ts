type AnyListener = (...args: any[]) => void;

type KnownKeys<T> = {
    [Key in keyof T]: string extends Key ? never : number extends Key ? never : symbol extends Key ? never : Key;
}[keyof T];

type KnownEventName<Events extends object> = Extract<KnownKeys<Events>, string | symbol>;
type KnownEventListener<Events extends object, Key extends KnownEventName<Events>> = Events[Key] extends AnyListener ? Events[Key] : never;
type ListenerArgs<Listener> = Listener extends (...args: infer Args) => void ? Args : never;
type StoredListener = AnyListener & {
    _originalListener?: AnyListener;
};
type StoredEvent = StoredListener | StoredListener[];
type EventName = string | symbol;

export type EventMap = Record<PropertyKey, AnyListener>;

export class EventEmitter<Events extends object = Record<string, never>> {
    private _events = new Map<EventName, StoredEvent>();

    public on<Key extends KnownEventName<Events>>(eventName: Key, listener: KnownEventListener<Events, Key>): this;
    public on(eventName: EventName, listener: AnyListener): this;
    public on(eventName: EventName, listener: AnyListener): this {
        const current = this._events.get(eventName);

        if (current === undefined) {
            this._events.set(eventName, listener as StoredListener);
            return this;
        }

        if (Array.isArray(current)) {
            current.push(listener as StoredListener);
            return this;
        }

        this._events.set(eventName, [current, listener as StoredListener]);
        return this;
    }

    public addListener<Key extends KnownEventName<Events>>(eventName: Key, listener: KnownEventListener<Events, Key>): this;
    public addListener(eventName: EventName, listener: AnyListener): this;
    public addListener(eventName: EventName, listener: AnyListener): this {
        return this.on(eventName, listener);
    }

    public once<Key extends KnownEventName<Events>>(eventName: Key, listener: KnownEventListener<Events, Key>): this;
    public once(eventName: EventName, listener: AnyListener): this;
    public once(eventName: EventName, listener: AnyListener): this {
        const onceListener: StoredListener = (...args) => {
            this.off(eventName, onceListener);
            listener(...args);
        };

        onceListener._originalListener = listener;
        return this.on(eventName, onceListener);
    }

    public off<Key extends KnownEventName<Events>>(eventName: Key, listener: KnownEventListener<Events, Key>): this;
    public off(eventName: EventName, listener: AnyListener): this;
    public off(eventName: EventName, listener: AnyListener): this {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return this;
        }

        if (!Array.isArray(current)) {
            if (this._isSameListener(current, listener)) {
                this._events.delete(eventName);
            }
            return this;
        }

        if (current.length === 2) {
            const first = current[0];
            const second = current[1];

            if (this._isSameListener(first, listener)) {
                this._events.set(eventName, second);
                return this;
            }

            if (this._isSameListener(second, listener)) {
                this._events.set(eventName, first);
                return this;
            }

            return this;
        }

        for (let index = 0; index < current.length; index++) {
            if (this._isSameListener(current[index], listener)) {
                current.splice(index, 1);
                break;
            }
        }

        return this;
    }

    public removeListener<Key extends KnownEventName<Events>>(eventName: Key, listener: KnownEventListener<Events, Key>): this;
    public removeListener(eventName: EventName, listener: AnyListener): this;
    public removeListener(eventName: EventName, listener: AnyListener): this {
        return this.off(eventName, listener);
    }

    public removeAllListeners(eventName?: EventName): this {
        if (eventName === undefined) {
            this._events.clear();
        } else {
            this._events.delete(eventName);
        }

        return this;
    }

    public emit0<Key extends KnownEventName<Events>>(eventName: Key): boolean;
    public emit0(eventName: EventName): boolean;
    public emit0(eventName: EventName): boolean {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return false;
        }

        if (!Array.isArray(current)) {
            current();
            return true;
        }

        switch (current.length) {
            case 0:
                return false;
            case 1:
                current[0]();
                return true;
            case 2: {
                const first = current[0];
                const second = current[1];
                first();
                second();
                return true;
            }
        }

        const listeners = current.slice();
        for (let index = 0; index < listeners.length; index++) {
            listeners[index]();
        }

        return true;
    }

    public emit1<Key extends KnownEventName<Events>>(eventName: Key, a1: ListenerArgs<KnownEventListener<Events, Key>>[0]): boolean;
    public emit1(eventName: EventName, a1: any): boolean;
    public emit1(eventName: EventName, a1: any): boolean {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return false;
        }

        if (!Array.isArray(current)) {
            current(a1);
            return true;
        }

        switch (current.length) {
            case 0:
                return false;
            case 1:
                current[0](a1);
                return true;
            case 2: {
                const first = current[0];
                const second = current[1];
                first(a1);
                second(a1);
                return true;
            }
        }

        const listeners = current.slice();
        for (let index = 0; index < listeners.length; index++) {
            listeners[index](a1);
        }

        return true;
    }

    public emit2<Key extends KnownEventName<Events>>(eventName: Key, a1: ListenerArgs<KnownEventListener<Events, Key>>[0], a2: ListenerArgs<KnownEventListener<Events, Key>>[1]): boolean;
    public emit2(eventName: EventName, a1: any, a2: any): boolean;
    public emit2(eventName: EventName, a1: any, a2: any): boolean {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return false;
        }

        if (!Array.isArray(current)) {
            current(a1, a2);
            return true;
        }

        switch (current.length) {
            case 0:
                return false;
            case 1:
                current[0](a1, a2);
                return true;
            case 2: {
                const first = current[0];
                const second = current[1];
                first(a1, a2);
                second(a1, a2);
                return true;
            }
        }

        const listeners = current.slice();
        for (let index = 0; index < listeners.length; index++) {
            listeners[index](a1, a2);
        }

        return true;
    }

    public emit<Key extends KnownEventName<Events>>(eventName: Key, ...args: ListenerArgs<KnownEventListener<Events, Key>>): boolean;
    public emit(eventName: EventName, ...args: any[]): boolean;
    public emit(eventName: EventName, ...args: any[]): boolean {
        switch (args.length) {
            case 0:
                return this.emit0(eventName);
            case 1:
                return this.emit1(eventName, args[0]);
            case 2:
                return this.emit2(eventName, args[0], args[1]);
        }

        const current = this._events.get(eventName);

        if (current === undefined) {
            return false;
        }

        if (!Array.isArray(current)) {
            current(...args);
            return true;
        }

        const listeners = current.length === 1 ? current : current.slice();
        for (let index = 0; index < listeners.length; index++) {
            listeners[index](...args);
        }

        return true;
    }

    public listenerCount(eventName: EventName): number {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return 0;
        }

        return Array.isArray(current) ? current.length : 1;
    }

    public eventNames(): EventName[] {
        return Array.from(this._events.keys());
    }

    public listeners<Key extends KnownEventName<Events>>(eventName: Key): KnownEventListener<Events, Key>[];
    public listeners(eventName: EventName): AnyListener[];
    public listeners(eventName: EventName): AnyListener[] {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return [];
        }

        if (!Array.isArray(current)) {
            return [this._unwrapListener(current)];
        }

        const listeners = new Array<AnyListener>(current.length);
        for (let index = 0; index < current.length; index++) {
            listeners[index] = this._unwrapListener(current[index]);
        }

        return listeners;
    }

    public hasListeners(eventName?: EventName): boolean {
        if (eventName === undefined) {
            return this._events.size > 0;
        }

        return this._events.has(eventName);
    }

    private _isSameListener(storedListener: StoredListener, listener: AnyListener): boolean {
        return storedListener === listener || storedListener._originalListener === listener;
    }

    private _unwrapListener(storedListener: StoredListener): AnyListener {
        return storedListener._originalListener ?? storedListener;
    }
}

export default EventEmitter;

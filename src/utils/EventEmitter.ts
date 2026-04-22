type AnyListener = (...args: any[]) => void;

type ListenerArgs<Listener> = Listener extends (...args: infer Args) => void ? Args : never;
type StoredListener = AnyListener & {
    _originalListener?: AnyListener;
};
type StoredEvent = StoredListener | StoredListener[];
type EventName = string | symbol;
type KnownEventName<Events extends object> = Extract<{
    [Key in keyof Events]: Key extends EventName
        ? string extends Key
            ? never
            : number extends Key
                ? never
                : symbol extends Key
                    ? never
                    : Key
        : never;
}[keyof Events], EventName>;
type EventListener<Events extends object, Key extends EventName> = Key extends keyof Events ? Events[Key] extends AnyListener ? Events[Key] : never : AnyListener;
type EventListenerArgs<Events extends object, Key extends EventName> = ListenerArgs<EventListener<Events, Key>>;
type SuggestedEventName<Events extends object, ExtraEvents extends EventName> = KnownEventName<Events> | (ExtraEvents & {});
type HasBroadEventKeys<Events extends object> = string extends keyof Events ? true : symbol extends keyof Events ? true : false;
type DefaultExtraEvents<Events extends object> = HasBroadEventKeys<Events> extends true ? EventName : never;

export type EventMap = Record<PropertyKey, AnyListener>;

export class EventEmitter<Events extends object = EventMap, ExtraEvents extends EventName = DefaultExtraEvents<Events>> {
    private _events = new Map<EventName, StoredEvent>();

    public on<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, listener: EventListener<Events, Key>): this {
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

    public addListener<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, listener: EventListener<Events, Key>): this {
        return this.on(eventName, listener);
    }

    public once<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, listener: EventListener<Events, Key>): this {
        const onceListener: StoredListener = (...args) => {
            this.off(eventName, onceListener as EventListener<Events, Key>);
            listener(...args);
        };

        onceListener._originalListener = listener;
        return this.on(eventName, onceListener as EventListener<Events, Key>);
    }

    public off<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, listener: EventListener<Events, Key>): this {
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

    public removeListener<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, listener: EventListener<Events, Key>): this {
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

    public emit0<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key): boolean {
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

    public emit1<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, a1: EventListenerArgs<Events, Key>[0]): boolean {
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

    public emit2<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, a1: EventListenerArgs<Events, Key>[0], a2: EventListenerArgs<Events, Key>[1]): boolean {
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

    public emit<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key, ...args: EventListenerArgs<Events, Key>): boolean {
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

    public listeners<Key extends SuggestedEventName<Events, ExtraEvents>>(eventName: Key): EventListener<Events, Key>[] {
        const current = this._events.get(eventName);

        if (current === undefined) {
            return [];
        }

        if (!Array.isArray(current)) {
            return [this._unwrapListener(current) as EventListener<Events, Key>];
        }

        const listeners = new Array<EventListener<Events, Key>>(current.length);
        for (let index = 0; index < current.length; index++) {
            listeners[index] = this._unwrapListener(current[index]) as EventListener<Events, Key>;
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

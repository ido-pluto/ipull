import {describe, expect, test, vi} from "vitest";
import {EventEmitter} from "../src/utils/EventEmitter.js";

type Assert<T extends true> = T;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type IsExact<T, Expected> = [T] extends [Expected] ? ([Expected] extends [T] ? true : false) : false;

type TestEvents = {
    data: (value: number, label: string) => void;
    closed: () => void;
};

describe("EventEmitter", () => {
    test("emits listeners in registration order and supports once", () => {
        const emitter = new EventEmitter<TestEvents>();
        const events: string[] = [];

        emitter.on("data", (value, label) => {
            events.push(`${label}:${value}`);
        });

        emitter.once("data", (value) => {
            events.push(`once:${value}`);
        });

        emitter.emit("data", 1, "first");
        emitter.emit("data", 2, "second");

        expect(events).toEqual(["first:1", "once:1", "second:2"]);
    });

    test("removes listeners by original callback reference", () => {
        const emitter = new EventEmitter<TestEvents>();
        const listener = (value: number, label: string) => {
            void value;
            void label;
        };

        emitter.once("data", listener);
        expect(emitter.listenerCount("data")).toBe(1);

        emitter.off("data", listener);
        expect(emitter.listenerCount("data")).toBe(0);
        expect(emitter.emit("data", 1, "removed")).toBe(false);
    });

    test("preserves typed event inference", () => {
        const emitter = new EventEmitter<TestEvents>();

        emitter.on("data", (value, label) => {
            type ValueIsNotAny = Assert<IsAny<typeof value> extends false ? true : false>;
            type LabelIsNotAny = Assert<IsAny<typeof label> extends false ? true : false>;
            type ValueIsNumber = Assert<IsExact<typeof value, number>>;
            type LabelIsString = Assert<IsExact<typeof label, string>>;
            const typedValue: number = value;
            const typedLabel: string = label;

            void typedValue;
            void typedLabel;
        });

        const typedListeners: Array<(value: number, label: string) => void> = emitter.listeners("data");
        type TypedListenersAreExact = Assert<IsExact<typeof typedListeners, Array<(value: number, label: string) => void>>>;
        emitter.emit("data", 1, "ok");

        // @ts-expect-error data listeners receive a number as the first argument
        emitter.on("data", (value: string) => {
            void value;
        });

        // @ts-expect-error data emits require a string label as the second argument
        emitter.emit("data", 1, 2);

        void (true as TypedListenersAreExact);
        expect(typedListeners).toHaveLength(1);
    });

    test("supports symbol event names", () => {
        const eventName = Symbol("data");
        const emitter = new EventEmitter();
        const listener = vi.fn();

        emitter.on(eventName, listener);
        expect(emitter.emit(eventName, 1, "label")).toBe(true);
        expect(listener).toHaveBeenCalledWith(1, "label");
        expect(emitter.eventNames()).toContain(eventName);
    });

    test("supports unknown event names without affecting known event typing", () => {
        const emitter = new EventEmitter<TestEvents, string | symbol>();
        const listener = vi.fn();

        emitter.on("custom", listener);

        expect(emitter.emit("custom", 1, "label")).toBe(true);
        expect(listener).toHaveBeenCalledWith(1, "label");
    });

    test("keeps emit order stable when listeners remove each other", () => {
        const emitter = new EventEmitter<TestEvents>();
        const calls: string[] = [];

        const second = (value: number, label: string) => {
            calls.push(`second:${label}:${value}`);
        };

        emitter.on("data", (value, label) => {
            calls.push(`first:${label}:${value}`);
            emitter.off("data", second);
        });
        emitter.on("data", second);

        emitter.emit("data", 1, "tick");

        expect(calls).toEqual(["first:tick:1", "second:tick:1"]);
        expect(emitter.listenerCount("data")).toBe(1);
    });
});

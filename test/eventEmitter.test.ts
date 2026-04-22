import {describe, expect, test, vi} from "vitest";
import {EventEmitter} from "../src/utils/EventEmitter.js";

type TestEvents = {
    data: (value: number, label: string) => void;
    closed: () => void;
    [key: string]: any;
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
            const typedValue: number = value;
            const typedLabel: string = label;

            void typedValue;
            void typedLabel;
        });

        const typedListeners: Array<(value: number, label: string) => void> = emitter.listeners("data");

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

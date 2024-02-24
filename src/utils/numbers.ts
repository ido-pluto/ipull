export function clamp(value: number, min = Number.MIN_VALUE, max = Number.MAX_VALUE) {
    return Math.min(Math.max(value, min), max);
}

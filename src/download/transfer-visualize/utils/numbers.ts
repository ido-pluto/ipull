export function clamp(value: number, min = 0, max = Number.MAX_VALUE) {
    return Math.min(Math.max(value, min), max);
}

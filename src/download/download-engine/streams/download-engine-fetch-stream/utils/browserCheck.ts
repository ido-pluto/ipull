export function browserCheck() {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
}

import isUnicodeSupported from "is-unicode-supported";
import ansis from "ansis";
export const STATUS_ICONS = isUnicodeSupported() ? {
    activeDownload: ansis.blue("⏵"),
    done: ansis.green("✔"),
    failed: ansis.red("✖"),
    pending: ansis.yellow("\u25f7")
}
    : {
        activeDownload: ansis.blue.bold(">"),
        done: ansis.green("√"),
        failed: ansis.red("×"),
        pending: ansis.yellow.bold("-")
    };

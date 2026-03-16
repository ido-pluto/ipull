import {parse} from "@tinyhttp/content-disposition";

export function parseContentDisposition(header?: string | null): string | undefined {
    if (!header) {
        return undefined;
    }

    if (header.endsWith(";")){
        header = header.slice(0, -1).trimEnd();
    }

    try {
        return String(parse(header).parameters.filename || "") || undefined;
    } catch {}

    return undefined;
}

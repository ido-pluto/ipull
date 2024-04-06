import {parse} from "@tinyhttp/content-disposition";

export function parseContentDisposition(header?: string | null): string | undefined {
    if (!header) {
        return undefined;
    }

    try {
        return String(parse(header).parameters.filename || "") || undefined;
    } catch {}

    return undefined;
}

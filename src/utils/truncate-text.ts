export const TRUNCATE_TEXT_MAX_LENGTH = 30;

export function truncateText(text: string, maxLength = TRUNCATE_TEXT_MAX_LENGTH) {
    if (text.length <= maxLength) {
        return text;
    }

    const ellipsis = "...";
    const charsToShow = maxLength - ellipsis.length;
    const firstPartChars = Math.ceil(charsToShow / 2);
    const secondPartChars = Math.floor(charsToShow / 2);

    return text.substring(0, firstPartChars) + ellipsis + text.substring(text.length - secondPartChars);
}

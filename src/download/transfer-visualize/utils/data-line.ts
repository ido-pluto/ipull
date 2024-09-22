export type DataPart = {
    type: "status" | "name" | "nameComment" | "progressBar" | "percentage" | "transferred" | "speed" | "timeLeft" | "spacer" | "description",
    fullText: string,
    size: number,
    addEndPadding?: number,
    flex?: number,
    maxSize?: number,
    cropper?: (text: string, size: number) => string,
    formatter?(text: string, size: number): string
};
export type DataLine = DataPart[];

export function renderDataLine(dataLine: DataLine, lineLength: number = process.stdout.columns - 1) {
    return resizeDataLine(dataLine, lineLength)
        .map(renderDataPart)
        .join("");
}

export function renderDataPart(dataPart: DataPart) {
    let text = dataPart.fullText;

    if (dataPart.cropper != null) {
        text = padEqually(
            dataPart
                .cropper(text, dataPart.size)
                .slice(0, dataPart.size),
            dataPart.size
        );
    } else {
        text = padEqually(
            text.slice(0, dataPart.size),
            dataPart.size
        );
    }

    if (dataPart.formatter != null) {
        text = dataPart.formatter(text, dataPart.size);
    }

    return text;
}

// only enlarges parts, doesn't shrink them at the moment
export function resizeDataLine(dataLine: DataLine, lineLength: number) {
    const res = dataLine.map((part) => ({...part}));
    const currentSize = dataLine.reduce((acc, part) => acc + part.size, 0);
    let sizeLeft = lineLength - currentSize;

    if (sizeLeft <= 0)
        return res;

    for (let i = 0; i < res.length && sizeLeft > 0; i++) {
        const part = res[i];
        if (part.addEndPadding != null) {
            const add = Math.min(part.addEndPadding, sizeLeft);
            part.size += add;
            sizeLeft -= add;
            part.addEndPadding -= add;

            if (part.addEndPadding === 0)
                delete part.addEndPadding;
        }
    }

    while (sizeLeft > 0) {
        const flexBoxCandidates: DataPart[] = [];
        let totalFlexbox = 0;

        for (let i = 0; i < res.length; i++) {
            const part = res[i];
            if (part.flex == null)
                continue;

            if (part.maxSize != null && part.size >= part.maxSize)
                continue;

            flexBoxCandidates.push(part);
            totalFlexbox += part.flex;
        }

        flexBoxCandidates.sort((a, b) => a.flex! - b.flex!);

        if (flexBoxCandidates.length === 0)
            break;

        const sizeLeftSnapshot = sizeLeft;
        for (const part of flexBoxCandidates) {
            let partSize = Math.ceil(sizeLeftSnapshot * (part.flex! / totalFlexbox));
            if (part.maxSize != null && partSize + part.size > part.maxSize)
                partSize = part.maxSize - part.size;

            part.size += partSize;
            sizeLeft -= partSize;
        }
    }

    return res;
}


function padEqually(text: string, size: number) {
    const padAmount = Math.max(0, size - text.length);
    for (let i = 0; i < padAmount; i++) {
        if (i % 2 == 0) {
            text = " " + text;
        } else {
            text = text + " ";
        }
    }

    return text;
}

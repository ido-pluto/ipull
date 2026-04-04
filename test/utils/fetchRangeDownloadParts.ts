type FetchRangeDownloadPartsOptions = {
    url: string;
    range: {
        start: number;
        end: number;
    }
}[];

export async function fetchRangeDownloadParts(params: FetchRangeDownloadPartsOptions) {
    const results = await Promise.all(params.map(async ({url, range}) => {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Range: `bytes=${range.start}-${range.end}`
            }
        });

        if (response.status < 200 || response.status >= 300) {
            throw new Error(`Failed to fetch range ${range.start}-${range.end} from ${url}. Status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }));
    

    return results;
}

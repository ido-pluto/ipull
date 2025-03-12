import {downloadFileBrowser} from "ipull/browser";

const BIG_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/9/9e/1_dubrovnik_pano_-_edit1.jpg"; // 40mb

const downloader = await downloadFileBrowser({
    url: BIG_IMAGE,
    onWrite: (cursor: number, buffers: Uint8Array[], options: DownloadEngineWriteStreamOptionsBrowser) => {
        const totalLength = buffers.reduce((acc, b) => acc + b.byteLength, 0);
        console.log(`Writing ${totalLength} bytes at cursor ${cursor}, with options: ${JSON.stringify(options)}`);
    }
});

await downloader.download();

import {downloadFileBrowser} from "ipull/dist/browser.js";

const BIG_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/9/9e/1_dubrovnik_pano_-_edit1.jpg"; // 40mb

const downloader = await downloadFileBrowser({
    url: BIG_IMAGE,
    onWrite: (cursor: number, buffer: Uint8Array, options) => {
        console.log(`Writing ${buffer.length} bytes at cursor ${cursor}, with options: ${JSON.stringify(options)}`);
    }
});

await downloader.download();

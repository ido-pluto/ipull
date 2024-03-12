import {downloadFile} from "ipull";

const DOWNLOAD_URL = "https://huggingface.co/TheBloke/Falcon-180B-Chat-GGUF/resolve/main/falcon-180b-chat.Q6_K.gguf-split-a?download=true";
const downloader = await downloadFile({
    url: DOWNLOAD_URL,
    directory: "./downloads",
    fileName: "model.gguf",
    cliProgress: true
});

downloader.download();

setTimeout(() => {
    downloader.close();
    console.log("Aborted");
}, 1000 * 60 * 5);

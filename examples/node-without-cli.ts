import {downloadFile} from "ipull";

const DOWNLOAD_URL = "https://huggingface.co/TheBloke/Falcon-180B-Chat-GGUF/resolve/main/falcon-180b-chat.Q6_K.gguf-split-a?download=true";
const downloader = await downloadFile(DOWNLOAD_URL, {
    cliProgress: false
});

downloader.download();

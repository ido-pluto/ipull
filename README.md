<div align="center">
    <h1>iPull</h1>
    <img src="./assets/ipull-logo-rounded.png" height="200px" />
</div>

<div align="center">

[![Build](https://github.com/ido-pluto/ipull/actions/workflows/build.yml/badge.svg)](https://github.com/ido-pluto/ipull/actions/workflows/build.yml)
[![License](https://badgen.net/badge/color/MIT/green?label=license)](https://www.npmjs.com/package/ipull)
[![Types](https://badgen.net/badge/color/TypeScript/blue?label=types)](https://www.npmjs.com/package/ipull)
[![npm downloads](https://img.shields.io/npm/dt/ipull.svg)](https://www.npmjs.com/package/ipull)
[![Version](https://badgen.net/npm/v/ipull)](https://www.npmjs.com/package/ipull)

</div>
<br />

> Super fast file downloader with multiple connections

```bash
npx ipull http://example.com/file.large
```

![pull-example](./assets/pull-file.gif)

## Features

- Download using parallels connections
- Pausing and resuming downloads
- Node.js and browser support
- Smart retry on fail
- CLI Progress bar
- Download statistics (speed, time left, etc.)

### NodeJS API

```ts
import {downloadFile} from 'ipull';

const downloader = await downloadFile({
    url: 'https://example.com/file.large',
    directory: './this/path',
    cliProgress: true // Show progress bar in the CLI (default: false)
});

await downloader.download();
```

## Browser support

Download a file in the browser using multiple connections

```ts
import {downloadFileBrowser} from "ipull/dist/browser.js";

const downloader = await downloadFileBrowser({
    url: 'https://example.com/file.large',
    acceptRangeIsKnown: true // cors origin request will not return the range header, but we can force it to be true (multi-connection download)
});

await downloader.download();
image.src = downloader.writeStream.resultAsBlobURL();

console.log(downloader.writeStream.result); // Uint8Array
```

### Custom stream

You can use a custom stream

```ts
import {downloadFileBrowser} from "ipull/dist/browser.js";

const downloader = await downloadFileBrowser({
    url: 'https://example.com/file.large',
    onWrite: (cursor: number, buffer: Uint8Array, options) => {
        console.log(`Writing ${buffer.length} bytes at cursor ${cursor}, with options: ${JSON.stringify(options)}`);
    }
});

await downloader.download();
console.log(downloader.writeStream.result.length === 0); // true, because we write to a custom stream
```

## CLI

```
Usage: ipull [options] [files...]

Pull/copy files from a remote server/local directory

Arguments:
  files                         Files to pull/copy

Options:
  -V, --version                 output the version number
  -s --save [path]              Save location (directory/file)
  -f --full-name                Show full name of the file while downloading, even if it long
  -h, --help                    display help for command

Commands:
  set [options] [path] <value>  Set download locations
```

### Set custom save directory

You can set a custom save directory by using the `set` command.

```bash
ipull set .zip ~/Downloads/zips
```

(use `default` to set the default save directory)

## Advanced usage

### Download file from parts

Consolidate multiple files parts into one file.
Beneficial for downloading large files from servers that limit file size. (e.g. HuggingFace models)

```ts
import {downloadFile} from 'ipull';

const downloadParts = [
    "https://example.com/file.large-part-1",
    "https://example.com/file.large-part-2",
    "https://example.com/file.large-part-3",
];

const downloader = await downloadFile({
    partsURL: downloadParts,
    directory: './this/path',
    filename: 'file.large'
});

await downloader.download();
```

** The split must be binary and not a zip-split

### Custom headers

You can set custom headers for the download request

```ts
import {downloadFile} from 'ipull';

const downloader = await downloadFile({
    url: 'https://example.com/file.large',
    savePath: './this/path/file.large',
    headers: {
        'Authorization': 'Bearer token'
    }
});

await downloader.download();
```

### Abort download

You can cancel the download by calling the `abort` method

```ts
import {downloadFile} from 'ipull';

const downloader = await downloadFile({
    url: 'https://example.com/file.large',
    directory: './this/path'
});

setTimeout(() => {
    downloader.close();
}, 5_000);

await downloader.download();
```

### Pause & Resume download

```ts
import {downloadFile} from 'ipull';

const downloader = await downloadFile({
    url: 'https://example.com/file.large',
    directory: './this/path'
});

setInterval(() => {
    downloader.pause();
    setTimeout(() => {
        downloader.resume();
    }, 5_000);
}, 10_000);

await downloader.download();
```

** The pause may take a few seconds to actually pause the download, because it waits for the current connections to
finish

### Error handling

If a network/file-system error occurs, the download will automatically retry
with [async-retry](https://www.npmjs.com/package/async-retry)

If the maximum reties was reached the download will fail and an error will be thrown from the `download()` call:

```ts
import {downloadFile} from 'ipull';

const downloader = await downloadFile({
    url: 'https://example.com/file.large',
    directory: './this/path'
});

try {
    await downloader.download();
} catch (error) {
    console.error(`Download failed: ${error.message}`);
}
```

### Listening to events

Events are emitted using the `EventEmitter` pattern and can be listened to using the `on` method

```ts
interface DownloadEngineEvents {
    start: [];
    paused: [];
    resumed: [];
    progress: [FormattedStatus];
    save: [DownloadProgressInfo];
    finished: [];
    closed: [];
}

const downloader = await downloadFile({
    url: 'https://example.com/file.large',
    directory: './this/path'
});

downloader.on("progress", (progress) => {
    console.log(`Downloaded ${progress.transferred} bytes`);
});
```

### Download multiple files

If you want to download multiple files, you can use the `downloadSequence` function.

By default, it will download files one by one, but you can set the `parallel` option to download them in parallel.
It is better to download one file at a time if you are downloading from the same server (as it may limit the number of
connections).

```ts
import {downloadFile, downloadSequence} from "ipull";

const downloader = await downloadSequence(
    {
        cliProgress: true,
    },
    downloadFile({
        url: "https://example.com/file1.large",
        directory: "."
    }),
    downloadFile({
        url: "https://example.com/file2.large",
        directory: "."
    }),
);

await downloader.download();
```

### Custom progress bar

```ts
import {downloadFile, FormattedStatus} from "ipull";

function createProgressBar({fileName, ...data}: FormattedStatus) {
    return `${fileName} ${JSON.stringify(data)}`;
}

const downloader = await downloadFile({
    url: "https://example.com/file.large",
    directory: "./this/path",
    cliStyle: createProgressBar
});

await downloader.download();
```

<br />

<div align="center" width="360">
    <img alt="Star please" src="./assets/star-please.png" width="360" margin="auto" />
    <br/>
    <p align="right">
        <i>If you like this repo, star it ✨</i>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
    </p>
</div>

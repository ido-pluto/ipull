<div align="center">
    <h1>IPULL</h1>
</div>

<div align="center">

[![npm version](https://badge.fury.io/js/ipull.svg)](https://badge.fury.io/js/ipull)
[![npm downloads](https://img.shields.io/npm/dt/ipull.svg)](https://www.npmjs.com/package/ipull)
[![GitHub license](https://img.shields.io/github/license/ido-pluto/ipull)](./LICENSE)

</div>
<br />

> Simple CLI to pull files from the internet **super fast**!

```bash
npx ipull http://example.com/file.txt
```

![pull-example](https://github.com/ido-pluto/ipull/blob/main/demo/pull-file.gif)

## Features

- Download using multiple connections
- Smart retry on fail
- Resuming after fails

## CLI

```
Usage: ipull [options] [files...]

Pull/copy files from remote server/local directory

Arguments:
  files                         Files to pull/copy

Options:
  -V, --version                 output the version number
  -s --save [path]              Save directory
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

### NodeJS API

```ts
class PullProgress {
    constructor(progress: IStreamProgress, onProgress: PullProgressCallback) {
    }

    startPull(): Promise<void> {
    }
}

class CLIPullProgress {
    constructor(progress: IStreamProgress, name: string) {
    }

    startPull(): Promise<void> {
    }
}

interface IStreamProgress {
    init(): Promise<void>;

    progress(callback: (progressBytes: number, totalBytes: number) => void): Promise<any>;
}


class FastDownload implements IStreamProgress {
    constructor(url: string, savePath: string, options?: TurboDownloaderOptions) {
    }
}

class CopyProgress implements IStreamProgress {
    constructor(fromPath: string, toPath: string) {
    }
}
```

Example:

```ts
import {FastDownload, CLIPullProgress} from 'ipull';

const download = new FastDownload('http://example.com/file.txt', './file.txt');
await download.init();

const progress = new CLIPullProgress(download, 'file.txt');
await progress.startPull();
```

## Browser support
You can also use IPull without the CLI, just for download metadata

```ts
import PullProgress from 'ipull/pull-progress.js';

const pull = new PullProgress(download, (info) => {
    console.log(info.speed);
});

pull.startPull();
```
- Make sure you import the exact file when using, so Node.js only modules will not be imported

## Credits

[Turbo-Downloader](https://www.npmjs.com/package/turbo-downloader) - The download engine used in this package

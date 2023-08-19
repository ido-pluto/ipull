<div align="center">
    <h1>PULL</h1>
</div>

<div align="center">

[![npm version](https://badge.fury.io/js/pull.svg)](https://badge.fury.io/js/catai)
[![npm downloads](https://img.shields.io/npm/dt/pull.svg)](https://www.npmjs.com/package/catai)
[![GitHub license](https://img.shields.io/github/license/ido-pluto/pull)](./LICENSE)

</div>
<br />

> Simple CLI to pull files from the internet **super fast**!

```bash
npx pull http://example.com/file.txt
```

## Features

- Download using multiple connections
- Smart retry on fail
- Resuming after fails

## CLI

```
Usage: pull [options] [files...]

Pull/copy files from remote server/local directory

Arguments:
  files             Files to pull/copy

Options:
  -V, --version     output the version number
  -s --save [path]  Save directory
  -f --full-name    Show full name of the file while downloading, even if it long
  -h, --help        display help for command

```

### NodeJS API

```ts
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
    constructor(url: string, savePath: string) {
    }
}

class CopyProgress implements IStreamProgress {
    constructor(fromPath: string, toPath: string) {
    }
}
```

## Credits

[Turbo-Downloader](https://www.npmjs.com/package/turbo-downloader) - The download engine used in this package

import {downloadFileBrowser, DownloadFileBrowserOptions, downloadSequenceBrowser} from "./download/browser-download.js";
import DownloadEngineBrowser, {DownloadEngineOptionsBrowser} from "./download/download-engine/engine/download-engine-browser.js";
import DownloadEngineFile, {DownloadEngineFileOptionsWithDefaults} from "./download/download-engine/download-engine-file.js";
import ProgressStatusFile from "./download/download-engine/progress-status-file.js";
import TransferStatistics, {TransferProgressInfo} from "./download/transfer-visualize/transfer-statistics.js";
import {truncateText} from "./utils/truncate-text.js";
import DownloadEngineWriteStreamBrowser, {
    DownloadEngineWriteStreamBrowserWriter
} from "./download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-browser.js";
import EmptyResponseError from "./download/download-engine/streams/download-engine-fetch-stream/errors/empty-response-error.js";
import StatusCodeError from "./download/download-engine/streams/download-engine-fetch-stream/errors/status-code-error.js";
import XhrError from "./download/download-engine/streams/download-engine-fetch-stream/errors/xhr-error.js";
import BaseDownloadEngineFetchStream, {
    BaseDownloadEngineFetchStreamOptions
} from "./download/download-engine/streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import DownloadEngineFetchStreamFetch
    from "./download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFetchStreamXhr
    from "./download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-xhr.js";
import BaseDownloadEngineWriteStream
    from "./download/download-engine/streams/download-engine-write-stream/base-download-engine-write-stream.js";
import ProgressStatisticsBuilder, {TransferProgressWithStatus} from "./download/transfer-visualize/progress-statistics-builder.js";

export {
    DownloadEngineBrowser,
    DownloadEngineFile,
    TransferStatistics,
    ProgressStatisticsBuilder,
    ProgressStatusFile,
    downloadFileBrowser,
    downloadSequenceBrowser,
    truncateText,
    EmptyResponseError,
    StatusCodeError,
    XhrError,
    BaseDownloadEngineFetchStream,
    DownloadEngineFetchStreamFetch,
    DownloadEngineFetchStreamXhr,
    BaseDownloadEngineWriteStream,
    DownloadEngineWriteStreamBrowser
};

export type {
    TransferProgressInfo,
    DownloadFileBrowserOptions,
    DownloadEngineOptionsBrowser,
    DownloadEngineWriteStreamBrowserWriter,
    DownloadEngineFileOptionsWithDefaults as DownloadEngineFileOptions,
    BaseDownloadEngineFetchStreamOptions,
    TransferProgressWithStatus
};

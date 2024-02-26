import {truncateText} from "./utils/truncate-text.js";
import TransferStatistics, {TransferProgressInfo} from "./download/transfer-visualize/transfer-statistics.js";
import TransferCli, {TransferCliOptions, TransferCliStatus} from "./download/transfer-visualize/transfer-cli.js";
import DownloadEngineNodejs, {DownloadEngineOptionsNodejs} from "./download/download-engine/engine/download-engine-nodejs.js";
import DownloadEngineFile, {DownloadEngineFileOptionsWithDefaults} from "./download/download-engine/download-engine-file.js";
import {downloadFile, downloadSequence} from "./download/node-download.js";
import BaseDownloadEngine from "./download/download-engine/engine/base-download-engine.js";
import BaseDownloadEngineFetchStream, {
    BaseDownloadEngineFetchStreamOptions
} from "./download/download-engine/streams/download-engine-fetch-stream/base-download-engine-fetch-stream.js";
import DownloadEngineFetchStreamFetch
    from "./download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-fetch.js";
import DownloadEngineFetchStreamLocalFile
    from "./download/download-engine/streams/download-engine-fetch-stream/download-engine-fetch-stream-local-file.js";
import BaseDownloadEngineWriteStream
    from "./download/download-engine/streams/download-engine-write-stream/base-download-engine-write-stream.js";
import DownloadEngineWriteStreamNodejs
    from "./download/download-engine/streams/download-engine-write-stream/download-engine-write-stream-nodejs.js";
import ProgressStatisticsBuilder, {TransferProgressWithStatus} from "./download/transfer-visualize/progress-statistics-builder.js";

export {
    TransferStatistics,
    TransferCli,
    ProgressStatisticsBuilder,
    DownloadEngineNodejs,
    BaseDownloadEngine,
    DownloadEngineFile,
    truncateText,
    downloadFile,
    downloadSequence,
    BaseDownloadEngineFetchStream,
    DownloadEngineFetchStreamFetch,
    DownloadEngineFetchStreamLocalFile,
    BaseDownloadEngineWriteStream,
    DownloadEngineWriteStreamNodejs
};

export type {
    TransferProgressInfo,
    TransferCliOptions,
    TransferCliStatus,
    DownloadEngineOptionsNodejs,
    DownloadEngineFileOptionsWithDefaults as DownloadEngineFileOptions,
    BaseDownloadEngineFetchStreamOptions,
    TransferProgressWithStatus
};


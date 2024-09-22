import {SummaryMultiProgressBar} from "./SummaryMultiProgressBar.js";

export class CIMultiProgressBar extends SummaryMultiProgressBar {
    public override readonly printType = "log";
    public override readonly updateIntervalMs = parseInt(process.env.IPULL_CI_UPDATE_INTERVAL ?? "0") || 8_000;
}

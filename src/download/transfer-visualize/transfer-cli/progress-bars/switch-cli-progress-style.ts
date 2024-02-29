import BaseTransferCliProgressBar from "./base-transfer-cli-progress-bar.js";

export type AvailableCLIProgressStyle = "default";

export default function switchCliProgressStyle(cliStyle: AvailableCLIProgressStyle) {
    switch (cliStyle) {
        default:
            return BaseTransferCliProgressBar.create;
    }
}

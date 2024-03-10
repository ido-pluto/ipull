import BaseTransferCliProgressBar from "./base-transfer-cli-progress-bar.js";
import FancyTransferCliProgressBar from "./fancy-transfer-cli-progress-bar.js";

export type AvailableCLIProgressStyle = "basic" | "fancy";

export default function switchCliProgressStyle(cliStyle: AvailableCLIProgressStyle, {truncateName}: {truncateName?: boolean | number}) {
    switch (cliStyle) {
        case "basic":
            return BaseTransferCliProgressBar.createLineRenderer({truncateName});

        case "fancy":
            return FancyTransferCliProgressBar.createLineRenderer({truncateName});
    }

    void (cliStyle satisfies never);
    throw new Error(`Unknown CLI progress style: ${cliStyle}`);
}

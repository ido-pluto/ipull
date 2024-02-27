import TransferCli, {TransferCliOptions} from "./transfer-cli.js";

export type AvailableTransferCli = "simple" | "center-progress";
export default function transferCliSwitch<T extends TransferCliOptions = TransferCliOptions>(name?: AvailableTransferCli, options?: T): TransferCli {

    switch (name) {
        case "center-progress":
            return null!;
    }

    return new TransferCli(options);
}

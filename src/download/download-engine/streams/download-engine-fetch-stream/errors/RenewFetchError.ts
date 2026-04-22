import FetchStreamError from "./fetch-stream-error.js";

// error used to signal that fetch should be renewed, this is used internally
export class RenewFetchError extends FetchStreamError {

}

import {Level} from "level";
import {DB_PATH} from "../const.js";

const NOT_FOUND_STATUS = 404;

export const AppDB = new Level(
    DB_PATH,
    {valueEncoding: "json"}
);


export async function getWithDefault(name: string, defaultValue = null) {
    try {
        return await AppDB.get(name);
    } catch (error: any) {
        if (error.status === NOT_FOUND_STATUS) {
            return defaultValue;
        }
        throw error;
    }
}

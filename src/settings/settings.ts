import {JSONFilePreset} from "lowdb/node";
import {DB_PATH} from "../const.js";
import {Low} from "lowdb";


const AppDB = await JSONFilePreset(DB_PATH, {} as Record<string, string>);
await AppDB.read();


export {
    AppDB,
    Low
};

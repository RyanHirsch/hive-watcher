import dotenv from "dotenv";
import path from "path";

dotenv.config();

export default {
  tracking: {
    enabled: true,
    secret: process.env.MP_SECRET,
    token: process.env.MP_TOKEN,
  },
  version: process.env.VERSION ?? "0.0.0",
  branch: process.env.GIT_BRANCH ?? "unknown",
  sha: process.env.GIT_SHA ?? "unknown",
  env: process.env.NODE_ENV ?? "development",
  name: "hive-watcher",
  logLevel: process.env.LOG ?? "info",
  dataFolder: process.env.DATA_FOLDER ?? path.resolve(__dirname, "..", "data"),
  blocknum: process.env.BLOCKNUM ? parseInt(process.env.BLOCKNUM, 10) : undefined,
  months: process.env.MONTHS ? parseInt(process.env.MONTHS, 10) : undefined,
  hours: process.env.HOURS ? parseInt(process.env.HOURS, 10) : undefined,
};

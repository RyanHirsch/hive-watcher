/* eslint-disable no-nested-ternary */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { getTransactionStream$ } from "podping-client";
import { formatDistanceToNow } from "date-fns";

import { mergeMap, tap } from "rxjs/operators";
import { logger } from "./logger";
import { track } from "./tracking";
import config from "./config";

const hash = (str: string) => crypto.createHash("sha256").update(str).digest("hex");

const fileMap = new Map<string, { stream: fs.WriteStream; lastTouched: number }>();
function getWriteStream(eventTime: Date): fs.WriteStream {
  const date = eventTime.toISOString().split("T")[0];
  const fullPath = path.join(config.dataFolder, `${date}.ndjson`);

  if (!fileMap.has(fullPath)) {
    logger.debug(`Creating new file at ${fullPath}`);
    const newStream = fs.createWriteStream(fullPath, { flags: "a" });
    fileMap.set(fullPath, {
      stream: newStream,
      lastTouched: Date.now(),
    });
    return newStream;
  }
  const obj = fileMap.get(fullPath);
  if (obj) {
    obj.lastTouched = Date.now();
    return obj.stream;
  }

  throw new Error("Unable to get existing stream, but it should have been there.");
}
function cleanUpUnusedStreams(lastTouchedThreshold = 120_000) {
  const cleaningUp: Array<Promise<undefined>> = [];
  Array.from(fileMap.entries()).forEach(([fullPath, { stream, lastTouched }]) => {
    if (Date.now() - lastTouched > lastTouchedThreshold) {
      fileMap.delete(fullPath);
      cleaningUp.push(new Promise((resolve) => stream.end(resolve)));
    }
  });
  return Promise.all(cleaningUp);
}

setInterval(() => cleanUpUnusedStreams, 60_000);

const options = config.blocknum
  ? { blocknum: config.blocknum }
  : config.months
  ? { months: config.months }
  : config.hours
  ? { hours: config.hours }
  : { minutes: 5 };
logger.debug(options, `Creating transaction stream`);
const subscription = getTransactionStream$(options)
  .pipe(
    tap((b) => {
      const hashed = hash(`${b.block_id}-${b.reason}-${b.urls[0]}`);
      const insertId = `${b.block_num.toString()}${hashed}`.slice(0, 36);
      const { blocktime, ...blockProps } = b;
      track(`Hive Block`, {
        time: blocktime,
        distinct_id: b.posting_auth,
        $insert_id: insertId,
        ...blockProps,
      });
    }),

    mergeMap(({ urls, ...rest }) =>
      urls.map((url) => ({
        url,
        ...rest,
      }))
    )
  )
  .subscribe({
    next(b) {
      const hashed = hash(`${b.block_id}-${b.reason}-${b.url}`);
      const insertId = `${b.block_num.toString()}${hashed}`.slice(0, 36);
      logger.info(
        `Parsing block ${b.block_id}, was created ${formatDistanceToNow(b.blocktime)} ago (${
          b.block_num
        })`
      );
      const { blocktime, ...blockProps } = b;
      const payload = {
        time: blocktime,
        distinct_id: b.posting_auth,
        $insert_id: insertId,
        ...blockProps,
      };
      const stream = getWriteStream(blocktime);

      stream.write(`${JSON.stringify(payload)}\n`);

      track(`Hive URL`, payload);
    },
  });

process.on("SIGINT", () => {
  // eslint-disable-next-line no-console
  console.log("Stopping...");
  subscription.unsubscribe();
  cleanUpUnusedStreams(-1).then(() => process.exit(0));
});

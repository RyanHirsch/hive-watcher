import Mixpanel from "mixpanel";
import type { Event, PropertyDict } from "mixpanel/lib/mixpanel-node";
import R from "ramda";

import config from "./config";
import { logger } from "./logger";

export type TrackedEvent = Event;
export type TrackedProperties = PropertyDict;

const oneDayInSeconds = 86400;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isDate(val: any): val is Date {
  return Boolean(val.getTime);
}

const hasSecret = Boolean(config.tracking.secret);

function initializeMixpanel() {
  if (!config.tracking.enabled || !config.tracking.token) {
    return null;
  }
  if (hasSecret) {
    return Mixpanel.init(config.tracking.token, {
      secret: config.tracking.secret,
    });
  }
  return Mixpanel.init(config.tracking.token);
}

const mixpanel = initializeMixpanel();

const superProps: TrackedProperties = {
  environment: config.env,
  app_name: config.name,
  ...(config.version ? { app_version: config.version } : undefined),
  ...(config.branch ? { git_branch: config.branch } : undefined),
  ...(config.sha ? { git_sha: config.sha } : undefined),
};

if (!mixpanel) {
  logger.info("Tracking is disabled");
} else {
  logger.info(superProps, "Tracking enabled with super props");
}

type MpProps = Record<string, string | number | Date | string[] | number[]>;

function normalizeProps(props?: TrackedProperties): TrackedProperties {
  if (!props) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => {
      if (!value) {
        return [key, value];
      }

      if (key === "time" && isDate(value)) {
        return [key, Math.round(value.getTime() / 1000)];
      }

      try {
        if (isDate(value)) {
          return [key, value.toISOString()];
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`failed to gracefully handle date conversion ${key}: ${value}`);
      }
      if (key === "distinct_id") {
        return [key, value.toString()];
      }
      return [key, value];
    })
  );
}

const hasDistinctId = R.has("distinct_id");
const hasTime = R.has("time");
const hasEvent = R.has("event");

function getImportThreshold() {
  const nowInSeconds = Math.round(Date.now() / 1000);
  return {
    date: new Date((nowInSeconds - oneDayInSeconds * 4.5) * 1000),
    seconds: nowInSeconds - oneDayInSeconds * 4.5,
  };
}

function useImport(event: TrackedEvent) {
  if (!hasSecret) {
    logger.warn("Secret is required for the import api");
    return false;
  }
  if (event.properties && hasDistinctId(event.properties) && hasTime(event.properties)) {
    const threshold = getImportThreshold();
    if (isDate(event.properties.time) && event.properties.time < threshold.date) {
      logger.debug("Time is a date and import api must be used");
      return true;
    }
    if ((event.properties.time as number) < threshold.seconds) {
      logger.debug("Time is a number and import api must be used");
      return true;
    }
  }
  logger.debug("Do not use import API, track is fine for this event");
  return false;
}

function isEvent(eventOrProps: Event | MpProps): eventOrProps is Event {
  return hasEvent(eventOrProps);
}
function withSuperProps(eventOrProps: Event): Event;
function withSuperProps(eventOrProps: MpProps): MpProps;
function withSuperProps(eventOrProps: Event | MpProps): Event | MpProps {
  if (isEvent(eventOrProps)) {
    return {
      ...eventOrProps,
      properties: normalizeProps({
        ...superProps,
        ...eventOrProps.properties,
      }),
    };
  }
  return normalizeProps({
    ...superProps,
    ...eventOrProps,
  });
}

export function batch(eventList: TrackedEvent[]): Promise<void> {
  // eslint-disable-next-line sonarjs/cognitive-complexity
  return new Promise((resolve, reject) => {
    if (mixpanel) {
      const [importList, trackList] = R.partition(
        useImport,
        eventList.map<TrackedEvent>(withSuperProps)
      );
      logger.debug(
        {
          importListLength: importList.length,
          trackListLength: trackList.length,
        },
        "Using batch tracking"
      );
      let isImportComplete = importList.length === 0;
      let isTrackComplete = trackList.length === 0;
      const maybeResolve = () => {
        if (isImportComplete && isTrackComplete) {
          resolve(undefined);
        }
      };
      if (!isImportComplete) {
        mixpanel.import_batch(importList, (err: [Error] | undefined) => {
          if (err) {
            reject(err);
          } else {
            isImportComplete = true;
            maybeResolve();
          }
        });
      }
      if (!isTrackComplete) {
        mixpanel.track_batch(trackList, (err: [Error] | undefined) => {
          if (err) {
            reject(err);
          } else {
            isTrackComplete = true;
            maybeResolve();
          }
        });
      }
      maybeResolve();
    } else {
      resolve(undefined);
    }
  });
}

export function track(eventName: string, props: MpProps = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mixpanel) {
      const finalProps = withSuperProps(props);
      const time = R.path<number>(["time"], finalProps);
      logger.debug({ time });
      if (time && useImport({ event: eventName, properties: finalProps })) {
        logger.debug({ eventName, props: finalProps }, "Track via import due to time");
        mixpanel.import(eventName, time, R.omit(["time"], finalProps));
      } else {
        mixpanel.track(eventName, withSuperProps(props), (err) => (err ? reject(err) : resolve()));
      }
    } else {
      resolve();
    }
  });
}

export function register(newProps: MpProps): void {
  Object.assign(superProps, normalizeProps(newProps));
}

export function unregister(propName: string): void {
  delete superProps[propName];
}

export function getMixpanel(): Mixpanel.Mixpanel | null {
  return mixpanel;
}

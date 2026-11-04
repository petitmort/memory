import { sampleWeather } from "./weather-controller";

export type CloudWindVector = { x: number; z: number };
export const CLOUD_WIND_HOUR = 3600000;
export const CLOUD_WIND_CACHE_HOURS = 10;

export function cloudWindVector(speed: number, direction: number): CloudWindVector {
  return { x: speed * Math.cos(direction), z: speed * Math.sin(direction) };
}

/**
 * Finite-life clouds need at most eight hours of history. Ten UTC hourly
 * samples cover that history, including both interpolation endpoints.
 * Nothing is integrated from the Unix epoch or accumulated once per frame.
 */
export function createCloudWindIntegrator(
  sample: (timestamp: number, timeZone: string) => CloudWindVector = (timestamp, timeZone) => {
    const state = sampleWeather(timestamp, { timeZone });
    return cloudWindVector(state.windSpeed, state.windDirection);
  },
) {
  const values = new Float64Array(CLOUD_WIND_CACHE_HOURS * 2);
  const prefix = new Float64Array(CLOUD_WIND_CACHE_HOURS * 2);
  const statistics = { cachedHours: 0, samples: 0 };
  let zone = "", firstHour = NaN, endHour = NaN;

  function prepare(timestamp: number, timeZone = "Europe/Athens") {
    if (!Number.isFinite(timestamp)) throw new RangeError("Cloud time must be finite.");
    const nextEnd = Math.floor(timestamp / CLOUD_WIND_HOUR) + 1;
    if (nextEnd === endHour && zone === timeZone) return;
    const advance = zone === timeZone && nextEnd === endHour + 1;
    firstHour = nextEnd - CLOUD_WIND_CACHE_HOURS + 1;
    endHour = nextEnd; zone = timeZone;
    if (advance) values.copyWithin(0, 2);
    for (let index = advance ? CLOUD_WIND_CACHE_HOURS - 1 : 0; index < CLOUD_WIND_CACHE_HOURS; index++) {
      const value = sample((firstHour + index) * CLOUD_WIND_HOUR, zone);
      if (!Number.isFinite(value.x + value.z)) throw new RangeError("Cloud wind must be finite.");
      values[index * 2] = value.x; values[index * 2 + 1] = value.z; statistics.samples++;
    }
    prefix[0] = prefix[1] = 0;
    const halfHourSeconds = CLOUD_WIND_HOUR / 2000;
    for (let index = 1; index < CLOUD_WIND_CACHE_HOURS; index++) {
      const offset = index * 2;
      prefix[offset] = prefix[offset - 2] + (values[offset - 2] + values[offset]) * halfHourSeconds;
      prefix[offset + 1] = prefix[offset - 1] + (values[offset - 1] + values[offset + 1]) * halfHourSeconds;
    }
    statistics.cachedHours = CLOUD_WIND_CACHE_HOURS;
  }

  function primitive(timestamp: number, axis: 0 | 1): number {
    const hour = Math.floor(timestamp / CLOUD_WIND_HOUR);
    const index = Math.min(CLOUD_WIND_CACHE_HOURS - 2, hour - firstHour);
    if (index < 0 || index >= CLOUD_WIND_CACHE_HOURS - 1)
      throw new RangeError("A cloud cannot outlive the cached wind history.");
    const seconds = (timestamp - (firstHour + index) * CLOUD_WIND_HOUR) / 1000;
    const curve = seconds * seconds / (2 * CLOUD_WIND_HOUR / 1000), offset = index * 2 + axis;
    return prefix[offset] + values[offset] * seconds + (values[offset + 2] - values[offset]) * curve;
  }

  return {
    prepare,
    integral(from: number, to: number, timeZone = "Europe/Athens", out: CloudWindVector = { x: 0, z: 0 }): CloudWindVector {
      if (!Number.isFinite(from) || from > to || to - from > 8 * CLOUD_WIND_HOUR)
        throw new RangeError("Cloud wind history must span at most eight hours.");
      prepare(to, timeZone);
      out.x = primitive(to, 0) - primitive(from, 0); out.z = primitive(to, 1) - primitive(from, 1);
      return out;
    },
    velocity(timestamp: number, timeZone = "Europe/Athens"): CloudWindVector {
      prepare(timestamp, timeZone);
      const offset = (Math.floor(timestamp / CLOUD_WIND_HOUR) - firstHour) * 2;
      const amount = (timestamp % CLOUD_WIND_HOUR + CLOUD_WIND_HOUR) % CLOUD_WIND_HOUR / CLOUD_WIND_HOUR;
      return { x: values[offset] + (values[offset + 2] - values[offset]) * amount,
        z: values[offset + 1] + (values[offset + 3] - values[offset + 1]) * amount };
    },
    stats() { return statistics; },
    clear() { firstHour = endHour = NaN; zone = ""; statistics.cachedHours = 0; },
  };
}

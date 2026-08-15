// The four dataset time granularities (day/week/month/quarter), which views a
// given source granularity can safely roll up to, and the period-start
// arithmetic shared by the loader and the query layer.

export const DATASET_GRANULARITIES = Object.freeze(["day", "week", "month", "quarter"]);

const DATASET_GRANULARITY_SET = new Set(DATASET_GRANULARITIES);
const SAFE_VIEW_GRANULARITIES = Object.freeze({
  day: Object.freeze(["day", "week", "month", "quarter"]),
  week: Object.freeze(["week", "month", "quarter"]),
  month: Object.freeze(["month", "quarter"]),
  quarter: Object.freeze(["quarter"]),
});

export function isDatasetGranularity(value) {
  return DATASET_GRANULARITY_SET.has(String(value || "").trim().toLowerCase());
}

export function datasetGranularitiesForSource(sourceGranularity, requested = DATASET_GRANULARITIES) {
  const source = String(sourceGranularity || "").trim().toLowerCase();
  const safe = SAFE_VIEW_GRANULARITIES[source];
  if (!safe) return [];
  const requestedSet = new Set(
    Array.isArray(requested)
      ? requested.map((value) => String(value || "").trim().toLowerCase())
      : [],
  );
  return safe.filter((granularity) => requestedSet.has(granularity));
}

export function isDatasetPeriodStart(value, granularity, weekStartsOn = "monday") {
  const text = String(value || "");
  const date = isoDateToUtc(text);
  if (!date || !isDatasetGranularity(granularity)) return false;
  const source = String(granularity).trim().toLowerCase();
  if (source === "day") return true;
  if (source === "month") return date.getUTCDate() === 1;
  if (source === "quarter") {
    return date.getUTCDate() === 1 && date.getUTCMonth() % 3 === 0;
  }
  const expectedDay = String(weekStartsOn).toLowerCase() === "sunday" ? 0 : 1;
  return date.getUTCDay() === expectedDay;
}

export function datasetPeriodStartsBetween(
  from,
  to,
  granularity,
  { weekStartsOn = "monday", calendar = "calendar" } = {},
) {
  const start = isoDateToUtc(from);
  const end = isoDateToUtc(to);
  const source = String(granularity || "").trim().toLowerCase();
  if (!start || !end || start > end || !isDatasetGranularity(source)) return [];

  const cursor = firstPeriodStartOnOrAfter(start, source, weekStartsOn);
  const periods = [];
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (source !== "day" || calendar !== "weekdays" || (day !== 0 && day !== 6)) {
      periods.push(utcToIsoDate(cursor));
    }
    advancePeriod(cursor, source);
  }
  return periods;
}

function firstPeriodStartOnOrAfter(date, granularity, weekStartsOn) {
  const cursor = new Date(date);
  if (granularity === "day") return cursor;
  if (granularity === "month") {
    const aligned = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    if (aligned < cursor) aligned.setUTCMonth(aligned.getUTCMonth() + 1);
    return aligned;
  }
  if (granularity === "quarter") {
    const aligned = new Date(Date.UTC(
      cursor.getUTCFullYear(),
      Math.floor(cursor.getUTCMonth() / 3) * 3,
      1,
    ));
    if (aligned < cursor) aligned.setUTCMonth(aligned.getUTCMonth() + 3);
    return aligned;
  }

  const expectedDay = String(weekStartsOn).toLowerCase() === "sunday" ? 0 : 1;
  const offset = (expectedDay - cursor.getUTCDay() + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + offset);
  return cursor;
}

function advancePeriod(date, granularity) {
  if (granularity === "day") {
    date.setUTCDate(date.getUTCDate() + 1);
  } else if (granularity === "week") {
    date.setUTCDate(date.getUTCDate() + 7);
  } else if (granularity === "month") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 3);
  }
}

function isoDateToUtc(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return utcToIsoDate(date) === value ? date : null;
}

function utcToIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

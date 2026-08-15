// Ported from 早期内部实现 (（早期内部实现）)
// src/content/dataset-query.mjs, Apache-2.0. See NOTICE. Local changes: none.

import {
  DATASET_GRANULARITIES,
  datasetGranularitiesForSource,
  datasetPeriodStartsBetween,
  isDatasetGranularity,
  isDatasetPeriodStart,
} from "./dataset-granularity.mjs";

const QUERY_KEYS = new Set(["from", "to", "where"]);
const FILTER_OPERATORS = new Set(["eq", "notEq", "in", "notIn"]);
const MAX_OUTPUT_ROWS = 5_000;
const MAX_RANGE_DAYS = 10_000;
// The 796 px chart plot keeps roughly one marker-width per period at this limit.
const MAX_READABLE_CHART_PERIODS = 120;

export function queryDataset({
  manifest,
  rows,
  component,
  attributes = {},
  query = {},
  granularity = "auto",
  granularityOptions = DATASET_GRANULARITIES,
} = {}) {
  assertQueryShape(query);
  const sourceGranularity = String(manifest?.time?.sourceGranularity || "").trim().toLowerCase();
  if (!isDatasetGranularity(sourceGranularity)) {
    throw datasetQueryError("Dataset manifest has an invalid sourceGranularity.");
  }
  const requestedGranularities = normalizeGranularityOptions(granularityOptions);
  const sourceCompatibleGranularities = datasetGranularitiesForSource(
    sourceGranularity,
    requestedGranularities,
  );
  if (sourceCompatibleGranularities.length === 0) {
    throw datasetQueryError(
      `granularityOptions does not include a view supported by ${sourceGranularity} source data.`,
    );
  }
  const requestedGranularity = String(granularity || "auto").trim().toLowerCase();
  if (requestedGranularity !== "auto" && !isDatasetGranularity(requestedGranularity)) {
    throw datasetQueryError(`Unsupported granularity: ${granularity}.`);
  }
  if (
    requestedGranularity !== "auto"
    && !sourceCompatibleGranularities.includes(requestedGranularity)
  ) {
    throw datasetQueryError(
      `${requestedGranularity} view is unavailable for ${sourceGranularity} source data. Available: ${sourceCompatibleGranularities.join(", ")}.`,
    );
  }

  const fieldMap = new Map(manifest.fields.map((field) => [field.name, field]));
  const timeField = manifest.time.field;
  const xKey = component === "Chart" ? String(attributes.x || timeField).trim() : timeField;
  if (component === "Chart" && xKey !== timeField && xKey !== "period") {
    throw datasetQueryError(
      `Dataset charts must use x="${timeField}" or x="period".`,
    );
  }

  const outputFields = componentFields({
    component,
    attributes,
    manifest,
    xKey,
  });
  const from = normalizeRangeDate(query.from ?? attributes.from, "from");
  const to = normalizeRangeDate(query.to ?? attributes.to, "to");
  if (from && to && from > to) {
    throw datasetQueryError("Dataset query from must not be after to.");
  }
  for (const [name, value] of [["from", from], ["to", to]]) {
    if (value && !isDatasetPeriodStart(value, sourceGranularity, manifest.time.weekStartsOn)) {
      throw datasetQueryError(
        `Dataset query ${name} must identify a ${sourceGranularity} source period start.`,
      );
    }
  }

  const filters = normalizeFilters(query.where, fieldMap);
  const filteredRows = rows.filter((row) => (
    (!from || row[timeField] >= from) &&
    (!to || row[timeField] <= to) &&
    filters.every((filter) => filterMatches(row, filter))
  ));
  if (filteredRows.length === 0) {
    throw datasetQueryError("Dataset query returned no rows.");
  }

  const sortedRows = [...filteredRows].sort((left, right) => (
    compareRows(left, right, [timeField, ...manifest.primaryKey])
  ));
  const effectiveFrom = from || sortedRows[0][timeField];
  const effectiveTo = to || sortedRows.at(-1)[timeField];
  if (dateDistance(effectiveFrom, effectiveTo) + 1 > MAX_RANGE_DAYS) {
    throw datasetQueryError(`Dataset query range must not exceed ${MAX_RANGE_DAYS} days.`);
  }
  const chartPeriodCounts = component === "Chart"
    ? Object.fromEntries(sourceCompatibleGranularities.map((candidate) => [
        candidate,
        bucketCount(
          sortedRows,
          timeField,
          candidate,
          manifest.time.weekStartsOn,
          sourceGranularity,
        ),
      ]))
    : {};
  const readableGranularities = component === "Chart"
    ? sourceCompatibleGranularities.filter(
        (candidate) => chartPeriodCounts[candidate] <= MAX_READABLE_CHART_PERIODS,
      )
    : sourceCompatibleGranularities;
  const availableGranularities = readableGranularities.length > 0
    ? readableGranularities
    : [sourceCompatibleGranularities.at(-1)];
  const densityLimitedGranularities = sourceCompatibleGranularities.filter(
    (candidate) => !availableGranularities.includes(candidate),
  );
  const selectedGranularity = requestedGranularity === "auto"
    || !availableGranularities.includes(requestedGranularity)
    ? availableGranularities[0]
    : requestedGranularity;
  const buckets = new Map();
  for (const row of sortedRows) {
    const key = bucketStart(
      row[timeField],
      selectedGranularity,
      manifest.time.weekStartsOn,
      sourceGranularity,
    );
    const bucketRows = buckets.get(key) ?? [];
    bucketRows.push(row);
    buckets.set(key, bucketRows);
  }
  if (buckets.size > MAX_OUTPUT_ROWS) {
    throw datasetQueryError(
      `Dataset query produces ${buckets.size} rows; narrow the time range below ${MAX_OUTPUT_ROWS}.`,
    );
  }

  const observedPeriods = new Set(sortedRows.map((row) => row[timeField]));
  const expectedPeriods = datasetPeriodStartsBetween(
    effectiveFrom,
    effectiveTo,
    sourceGranularity,
    manifest.time,
  );
  const missingPeriods = expectedPeriods.filter((period) => !observedPeriods.has(period));
  const coverageFrom = sortedRows[0][timeField];
  const coverageTo = sortedRows.at(-1)[timeField];
  const bucketEntries = [...buckets.entries()];
  const coverageByPeriod = new Map(bucketEntries.map(([period, bucketRows]) => [
    period,
    periodCoverage({
      period,
      rows: bucketRows,
      granularity: selectedGranularity,
      sourceGranularity,
      weekStartsOn: manifest.time.weekStartsOn,
      calendar: manifest.time.calendar,
      coverageFrom,
      coverageTo,
      timeField,
    }),
  ]));
  const omitIncompleteBoundaryPeriods = sourceGranularity === "week"
    && (selectedGranularity === "month" || selectedGranularity === "quarter");
  const omittedBoundaryPeriods = omitIncompleteBoundaryPeriods
    ? bucketEntries
      .filter(([period]) => coverageByPeriod.get(period).boundaryPartial)
      .map(([period]) => periodLabel(period, selectedGranularity))
    : [];
  const visibleBucketEntries = omitIncompleteBoundaryPeriods
    ? bucketEntries.filter(([period]) => !coverageByPeriod.get(period).boundaryPartial)
    : bucketEntries;
  if (visibleBucketEntries.length === 0) {
    throw datasetQueryError(
      `Dataset query has no complete ${selectedGranularity} periods after omitting incomplete boundary periods.`,
    );
  }
  const partialPeriods = visibleBucketEntries
    .filter(([period]) => coverageByPeriod.get(period).partial)
    .map(([period]) => periodLabel(period, selectedGranularity));

  const outputRows = visibleBucketEntries.map(([period, bucketRows]) => {
    const result = {};
    for (const name of outputFields) {
      if (name === timeField || name === "period") {
        result[name] = periodLabel(period, selectedGranularity);
        continue;
      }
      const field = fieldMap.get(name);
      if (!field) {
        throw datasetQueryError(`Unknown dataset field: ${name}.`);
      }
      result[name] = aggregateField(field, bucketRows, {
        granularity: selectedGranularity,
        sourceGranularity,
        timeField,
      });
    }
    if (component === "Chart" && !(xKey in result)) {
      result[xKey] = periodLabel(period, selectedGranularity);
    }
    return result;
  });

  const renderAttributes = {
    ...attributes,
    ...(component === "Chart" ? { x: xKey } : {}),
    ...(component === "DataTable" ? {
      columns: outputFields.join(","),
      columnLabels: Object.fromEntries(outputFields.map((name) => [
        name,
        fieldMap.get(name)?.label || name,
      ])),
    } : {}),
  };
  if (component === "Chart") {
    for (const name of outputFields) {
      const label = fieldMap.get(name)?.label;
      const labelAttribute = `${name}Label`;
      if (label && !(labelAttribute in renderAttributes)) {
        renderAttributes[labelAttribute] = label;
      }
    }
  }

  return {
    rows: outputRows,
    attributes: renderAttributes,
    meta: {
      datasetId: manifest.id,
      datasetTitle: manifest.title || manifest.id,
      sourceGranularity,
      availableGranularities,
      densityLimitedGranularities,
      granularity: selectedGranularity,
      from: effectiveFrom,
      to: effectiveTo,
      dataThrough: sortedRows.at(-1)[timeField],
      sourceRows: filteredRows.length,
      totalRows: rows.length,
      outputRows: outputRows.length,
      missingPeriodCount: missingPeriods.length,
      missingPeriods: missingPeriods.slice(0, 20),
      missingDateCount: missingPeriods.length,
      missingDates: missingPeriods.slice(0, 20),
      partialPeriodCount: partialPeriods.length,
      partialPeriods: partialPeriods.slice(0, 20),
      omittedBoundaryPeriodCount: omittedBoundaryPeriods.length,
      omittedBoundaryPeriods: omittedBoundaryPeriods.slice(0, 20),
    },
  };
}

function bucketCount(rows, timeField, granularity, weekStartsOn, sourceGranularity) {
  return new Set(
    rows.map((row) => bucketStart(
      row[timeField],
      granularity,
      weekStartsOn,
      sourceGranularity,
    )),
  ).size;
}

function componentFields({ component, attributes, manifest, xKey }) {
  if (component === "Chart") {
    const configured = uniqueStrings([
      ...listAttribute(attributes.series || attributes.y),
      ...listAttribute(attributes.bars || attributes.bar),
      ...listAttribute(attributes.lines || attributes.line),
      ...listAttribute(attributes.leftSeries || attributes.left || attributes.leftAxis || attributes.leftY),
      ...listAttribute(attributes.rightSeries || attributes.right || attributes.rightAxis || attributes.rightY),
    ]).filter((name) => name !== xKey && name !== manifest.time.field && name !== "period");
    const series = configured.length > 0
      ? configured
      : manifest.fields
        .filter((field) => field.rollup && numericField(field))
        .map((field) => field.name);
    if (series.length === 0) {
      throw datasetQueryError("Dataset Chart requires at least one numeric series field.");
    }
    return [xKey, ...series];
  }

  if (component === "DataTable") {
    const configured = listAttribute(attributes.columns);
    if (configured.length > 0) {
      return uniqueStrings(configured);
    }
    return [
      manifest.time.field,
      ...manifest.fields
        .filter((field) => field.name !== manifest.time.field && field.rollup)
        .map((field) => field.name),
    ];
  }

  throw datasetQueryError(`External datasets are not supported by ${component}.`);
}

function aggregateField(field, rows, { granularity, sourceGranularity, timeField }) {
  const rollup = field.rollup;
  if (!rollup) {
    if (granularity === sourceGranularity && rows.length === 1) {
      return rows[0][field.name];
    }
    throw datasetQueryError(
      `Field "${field.name}" needs a rollup before it can be shown in ${granularity} view.`,
    );
  }

  if (rollup.op === "ratioOfSums") {
    const numerator = sumValues(rows.map((row) => row[rollup.numerator]));
    const denominator = sumValues(rows.map((row) => row[rollup.denominator]));
    return denominator === 0 ? null : (numerator / denominator) * rollup.scale;
  }

  const values = rows.map((row) => row[field.name]).filter((value) => value !== null && value !== undefined);
  if (rollup.op === "count") {
    return values.length;
  }
  if (values.length === 0) {
    return null;
  }
  if (rollup.op === "first") {
    assertSingleRowPerDate(field, rows, timeField);
    return values[0];
  }
  if (rollup.op === "last") {
    assertSingleRowPerDate(field, rows, timeField);
    return values.at(-1);
  }

  const numbers = values.filter(Number.isFinite);
  if (numbers.length !== values.length) {
    throw datasetQueryError(`Field "${field.name}" contains non-numeric values for ${rollup.op}.`);
  }
  if (rollup.op === "sum") {
    return sumValues(numbers);
  }
  if (rollup.op === "avg") {
    return sumValues(numbers) / numbers.length;
  }
  if (rollup.op === "min") {
    return Math.min(...numbers);
  }
  if (rollup.op === "max") {
    return Math.max(...numbers);
  }
  throw datasetQueryError(`Unsupported rollup for field "${field.name}": ${rollup.op}.`);
}

function assertSingleRowPerDate(field, rows, timeField) {
  if (new Set(rows.map((row) => row[timeField])).size !== rows.length) {
    throw datasetQueryError(
      `Field "${field.name}" uses ${field.rollup.op}, but multiple rows share a date; filter the dataset to one series before aggregating.`,
    );
  }
}

function assertQueryShape(query) {
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    throw datasetQueryError("Dataset query must be a JSON object.");
  }
  const unsupported = Object.keys(query).filter((key) => !QUERY_KEYS.has(key));
  if (unsupported.length > 0) {
    throw datasetQueryError(`Unsupported dataset query key: ${unsupported[0]}.`);
  }
}

function normalizeGranularityOptions(value) {
  const entries = value === undefined
    ? DATASET_GRANULARITIES
    : value;
  if (!Array.isArray(entries) || entries.length < 1) {
    throw datasetQueryError("granularityOptions must contain at least one time view.");
  }
  const normalized = uniqueStrings(entries.map((entry) => String(entry || "").trim().toLowerCase()));
  if (normalized.some((entry) => !isDatasetGranularity(entry))) {
    throw datasetQueryError("granularityOptions supports day, week, month, and quarter.");
  }
  return normalized;
}

function normalizeFilters(where, fieldMap) {
  if (where === undefined) {
    return [];
  }
  if (!Array.isArray(where) || where.length > 10) {
    throw datasetQueryError("Dataset query where must contain at most 10 filters.");
  }
  return where.map((filter) => {
    if (!filter || typeof filter !== "object" || Array.isArray(filter)) {
      throw datasetQueryError("Each dataset filter must be an object.");
    }
    const keys = Object.keys(filter);
    if (keys.some((key) => !["field", "op", "value"].includes(key))) {
      throw datasetQueryError("Dataset filters support only field, op, and value.");
    }
    const field = fieldMap.get(String(filter.field || ""));
    if (!field) {
      throw datasetQueryError(`Unknown filter field: ${filter.field}.`);
    }
    const op = String(filter.op || "eq");
    if (!FILTER_OPERATORS.has(op)) {
      throw datasetQueryError(`Unsupported filter operator: ${op}.`);
    }
    const arrayOperator = op === "in" || op === "notIn";
    if (arrayOperator && (!Array.isArray(filter.value) || filter.value.length < 1 || filter.value.length > 100)) {
      throw datasetQueryError(`${op} filters require 1 to 100 values.`);
    }
    return {
      field: field.name,
      op,
      value: arrayOperator
        ? filter.value.map((value) => coerceFilterValue(value, field))
        : coerceFilterValue(filter.value, field),
    };
  });
}

function filterMatches(row, filter) {
  const current = row[filter.field];
  const equals = Array.isArray(filter.value)
    ? filter.value.some((value) => Object.is(current, value))
    : Object.is(current, filter.value);
  return filter.op === "notEq" || filter.op === "notIn" ? !equals : equals;
}

function coerceFilterValue(value, field) {
  if (value === null) {
    return null;
  }
  if (field.type === "integer" || field.type === "decimal" || field.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) {
      throw datasetQueryError(`Filter value for "${field.name}" must be ${field.type}.`);
    }
    return number;
  }
  if (field.type === "boolean") {
    if (value === true || value === false) return value;
    if (String(value).toLowerCase() === "true") return true;
    if (String(value).toLowerCase() === "false") return false;
    throw datasetQueryError(`Filter value for "${field.name}" must be boolean.`);
  }
  const text = String(value);
  if (field.type === "date" && !isIsoDate(text)) {
    throw datasetQueryError(`Filter value for "${field.name}" must be YYYY-MM-DD.`);
  }
  return text;
}

function periodCoverage({
  period,
  rows,
  granularity,
  sourceGranularity,
  weekStartsOn,
  calendar,
  coverageFrom,
  coverageTo,
  timeField,
}) {
  const naturalEnd = bucketEnd(period, granularity, weekStartsOn);
  const candidateFrom = sourceGranularity === "week"
    && (granularity === "month" || granularity === "quarter")
    ? shiftIsoDate(period, -3)
    : period;
  const expectedPeriods = datasetPeriodStartsBetween(
    candidateFrom,
    naturalEnd,
    sourceGranularity,
    { weekStartsOn, calendar },
  ).filter((sourcePeriod) => (
    bucketStart(sourcePeriod, granularity, weekStartsOn, sourceGranularity) === period
  ));
  const boundaryPartial = expectedPeriods.length === 0
    || expectedPeriods[0] < coverageFrom
    || expectedPeriods.at(-1) > coverageTo;
  const observed = new Set(rows.map((row) => row[timeField]));
  const missing = expectedPeriods.some((sourcePeriod) => !observed.has(sourcePeriod));
  return {
    partial: boundaryPartial || missing,
    boundaryPartial,
  };
}

function bucketStart(
  value,
  granularity,
  weekStartsOn = "monday",
  sourceGranularity = granularity,
) {
  if (granularity === "day") {
    return value;
  }
  const date = isoDateToUtc(value);
  // A weekly value remains atomic. Its fourth day represents the majority of
  // the seven-day period when assigning it to a natural month or quarter.
  if (
    sourceGranularity === "week"
    && (granularity === "month" || granularity === "quarter")
  ) {
    date.setUTCDate(date.getUTCDate() + 3);
  }
  if (granularity === "month") {
    date.setUTCDate(1);
    return utcToIsoDate(date);
  }
  if (granularity === "quarter") {
    date.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3, 1);
    return utcToIsoDate(date);
  }
  const weekOffset = weekStartsOn === "sunday"
    ? date.getUTCDay()
    : (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekOffset);
  return utcToIsoDate(date);
}

function shiftIsoDate(value, days) {
  const date = isoDateToUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return utcToIsoDate(date);
}

function bucketEnd(period, granularity) {
  const date = isoDateToUtc(period);
  if (granularity === "day") {
    return period;
  }
  if (granularity === "week") {
    date.setUTCDate(date.getUTCDate() + 6);
    return utcToIsoDate(date);
  }
  if (granularity === "quarter") {
    date.setUTCMonth(date.getUTCMonth() + 3, 0);
    return utcToIsoDate(date);
  }
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return utcToIsoDate(date);
}

function periodLabel(period, granularity) {
  if (granularity === "month") return period.slice(0, 7);
  if (granularity === "quarter") {
    return `${period.slice(0, 4)}-Q${Math.floor((Number(period.slice(5, 7)) - 1) / 3) + 1}`;
  }
  return period;
}

function dateDistance(from, to) {
  return Math.floor((isoDateToUtc(to) - isoDateToUtc(from)) / 86_400_000);
}

function normalizeRangeDate(value, name) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "";
  }
  const text = String(value).trim();
  if (!isIsoDate(text)) {
    throw datasetQueryError(`Dataset query ${name} must be YYYY-MM-DD.`);
  }
  return text;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return utcToIsoDate(isoDateToUtc(value)) === value;
}

function isoDateToUtc(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcToIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function compareRows(left, right, fields) {
  for (const field of uniqueStrings(fields)) {
    const comparison = String(left[field] ?? "").localeCompare(String(right[field] ?? ""), "en", {
      numeric: true,
    });
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function sumValues(values) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function numericField(field) {
  return ["integer", "decimal", "number"].includes(field.type);
}

function listAttribute(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function datasetQueryError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "dataset_query_invalid";
  return error;
}

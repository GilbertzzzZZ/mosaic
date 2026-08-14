// Ported from 早期内部实现 (（早期内部实现）)
// src/server/dataset-loader.mjs, Apache-2.0. See NOTICE. Local changes: Node IO,
// caching and fingerprinting removed; imports flattened; pure-function exports added.

import { parseDelimitedRecords } from "./delimited-data.mjs";
import {
  isDatasetGranularity,
  isDatasetPeriodStart,
} from "./dataset-granularity.mjs";

const MANIFEST_MAX_BYTES = 256 * 1024;
const DATA_MAX_BYTES = 20 * 1024 * 1024;
const DATA_MAX_ROWS = 250_000;
const DATA_MAX_FIELDS = 100;
const DATA_MAX_SOURCE_COLUMNS = 10_000;
const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "id",
  "title",
  "description",
  "data",
  "format",
  "grain",
  "primaryKey",
  "time",
  "fields",
  "skipBlankRows",
]);
const TIME_KEYS = new Set([
  "field",
  "type",
  "timezone",
  "weekStartsOn",
  "calendar",
  "sourceGranularity",
]);
const FIELD_KEYS = new Set([
  "name",
  "label",
  "description",
  "type",
  "unit",
  "required",
  "rollup",
  "sourceColumn",
  "numberFormat",
]);
const FIELD_TYPES = new Set(["string", "integer", "decimal", "number", "boolean", "date"]);
const SIMPLE_ROLLUPS = new Set(["sum", "avg", "min", "max", "count", "first", "last"]);
const NUMERIC_ROLLUPS = new Set(["sum", "avg", "min", "max"]);
const DATA_FORMATS = new Set(["csv", "tsv", "json"]);
const NUMBER_FORMATS = new Set(["comma-grouped"]);

export function parseDatasetManifest(manifestText, manifestPath = "Dataset manifest") {
  if (
    typeof manifestText !== "string" ||
    manifestText.length > MANIFEST_MAX_BYTES
  ) {
    throw datasetError(`${manifestPath} exceeds ${MANIFEST_MAX_BYTES} bytes.`);
  }
  const raw = parseJson(manifestText, manifestPath);
  return validateManifest(raw);
}

export function parseDatasetData(manifest, dataText) {
  if (typeof dataText !== "string" || dataText.length > DATA_MAX_BYTES) {
    throw datasetError(`Dataset data file exceeds ${DATA_MAX_BYTES} bytes.`);
  }
  const format = datasetFormat(manifest.format, manifest.data);
  const rawRows = parseDatasetRows(dataText, format, manifest);
  return validateRows(rawRows, manifest);
}

function validateManifest(value) {
  assertPlainObject(value, "Dataset manifest");
  assertKnownKeys(value, MANIFEST_KEYS, "Dataset manifest");
  if (value.schemaVersion !== 1) {
    throw datasetError("Dataset manifest schemaVersion must be 1.");
  }
  const id = requiredText(value.id, "Dataset manifest id", 128);
  const data = requiredText(value.data, "Dataset manifest data", 512);
  const fields = validateFields(value.fields);
  validateSourceColumnMapping(fields);
  const fieldMap = new Map(fields.map((field) => [field.name, field]));
  const time = validateTime(value.time, fieldMap);
  const grain = validateFieldList(value.grain, "Dataset manifest grain", fieldMap);
  const primaryKey = validateFieldList(value.primaryKey, "Dataset manifest primaryKey", fieldMap);
  if (!grain.includes(time.field)) {
    throw datasetError(`Dataset grain must include the time field "${time.field}".`);
  }
  if (!primaryKey.includes(time.field)) {
    throw datasetError(`Dataset primaryKey must include the time field "${time.field}".`);
  }
  for (const name of primaryKey) {
    if (!fieldMap.get(name).required) {
      throw datasetError(`Primary key field "${name}" must set required to true.`);
    }
  }
  validateRatioRollups(fields, fieldMap);

  const format = value.format === undefined ? "" : String(value.format).trim().toLowerCase();
  if (format && !DATA_FORMATS.has(format)) {
    throw datasetError(`Unsupported dataset format: ${value.format}.`);
  }
  if (value.skipBlankRows !== undefined && typeof value.skipBlankRows !== "boolean") {
    throw datasetError("Dataset manifest skipBlankRows must be boolean.");
  }
  if (value.skipBlankRows === true && fields.every((field) => field.name === time.field)) {
    throw datasetError("Dataset manifest skipBlankRows requires a non-time field.");
  }
  return {
    schemaVersion: 1,
    id,
    title: optionalText(value.title, "Dataset manifest title", 256),
    description: optionalText(value.description, "Dataset manifest description", 2_000),
    data,
    format,
    grain,
    primaryKey,
    time,
    fields,
    skipBlankRows: value.skipBlankRows === true,
  };
}

function validateFields(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > DATA_MAX_FIELDS) {
    throw datasetError(`Dataset manifest fields must contain 1 to ${DATA_MAX_FIELDS} definitions.`);
  }
  const names = new Set();
  return value.map((entry, index) => {
    assertPlainObject(entry, `Dataset field ${index + 1}`);
    assertKnownKeys(entry, FIELD_KEYS, `Dataset field ${index + 1}`);
    const name = requiredText(entry.name, `Dataset field ${index + 1} name`, 128);
    if (/\p{C}/u.test(name) || name.includes(",")) {
      throw datasetError(`Dataset field name contains unsupported characters: ${name}.`);
    }
    if (name === "period") {
      throw datasetError('Dataset field name "period" is reserved for rendered time buckets.');
    }
    if (names.has(name)) {
      throw datasetError(`Dataset field names must be unique: ${name}.`);
    }
    names.add(name);
    const type = String(entry.type || "").trim().toLowerCase();
    if (!FIELD_TYPES.has(type)) {
      throw datasetError(`Unsupported type for field "${name}": ${entry.type}.`);
    }
    const rollup = normalizeRollup(entry.rollup, name, type);
    const sourceColumn = normalizeSourceColumn(entry.sourceColumn, name);
    const numberFormat = normalizeNumberFormat(entry.numberFormat, name, type);
    return {
      name,
      type,
      required: entry.required === true,
      label: optionalText(entry.label, `Field "${name}" label`, 256),
      description: optionalText(entry.description, `Field "${name}" description`, 1_000),
      unit: optionalText(entry.unit, `Field "${name}" unit`, 64),
      rollup,
      sourceColumn,
      numberFormat,
    };
  });
}

function normalizeSourceColumn(value, name) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (!Number.isInteger(value) || value < 1 || value > DATA_MAX_SOURCE_COLUMNS) {
    throw datasetError(
      `Field "${name}" sourceColumn must be an integer from 1 to ${DATA_MAX_SOURCE_COLUMNS}.`,
    );
  }
  return value;
}

function normalizeNumberFormat(value, name, type) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const numberFormat = String(value).trim();
  if (!NUMBER_FORMATS.has(numberFormat)) {
    throw datasetError(`Unsupported numberFormat for field "${name}": ${value}.`);
  }
  if (!["integer", "decimal", "number"].includes(type)) {
    throw datasetError(`numberFormat requires a numeric field: ${name}.`);
  }
  return numberFormat;
}

function validateSourceColumnMapping(fields) {
  const mapped = fields.filter((field) => field.sourceColumn !== null);
  if (mapped.length === 0) return;
  if (mapped.length !== fields.length) {
    throw datasetError("Every dataset field must set sourceColumn when column mapping is used.");
  }
  const sourceColumns = mapped.map((field) => field.sourceColumn);
  if (new Set(sourceColumns).size !== sourceColumns.length) {
    throw datasetError("Dataset field sourceColumn values must be unique.");
  }
}

function validateTime(value, fieldMap) {
  assertPlainObject(value, "Dataset manifest time");
  assertKnownKeys(value, TIME_KEYS, "Dataset manifest time");
  const field = requiredText(value.field, "Dataset time field", 128);
  if (!fieldMap.has(field)) {
    throw datasetError(`Dataset time field is not defined: ${field}.`);
  }
  if (fieldMap.get(field).type !== "date") {
    throw datasetError(`Dataset time field "${field}" must use type "date" in schemaVersion 1.`);
  }
  if (value.type !== undefined && String(value.type).trim().toLowerCase() !== "date") {
    throw datasetError("Dataset time type must be date in schemaVersion 1.");
  }
  const weekStartsOn = String(value.weekStartsOn || "monday").trim().toLowerCase();
  if (weekStartsOn !== "monday" && weekStartsOn !== "sunday") {
    throw datasetError("Dataset time weekStartsOn must be monday or sunday.");
  }
  const calendar = String(value.calendar || "calendar").trim().toLowerCase();
  if (calendar !== "calendar" && calendar !== "weekdays") {
    throw datasetError("Dataset time calendar must be calendar or weekdays.");
  }
  const sourceGranularity = String(value.sourceGranularity || "").trim().toLowerCase();
  if (!isDatasetGranularity(sourceGranularity)) {
    throw datasetError(
      "Dataset time sourceGranularity must be day, week, month, or quarter.",
    );
  }
  return {
    field,
    type: "date",
    timezone: optionalText(value.timezone, "Dataset time timezone", 128) || "UTC",
    weekStartsOn,
    calendar,
    sourceGranularity,
  };
}

function normalizeRollup(value, name, type) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const op = value.trim();
    if (!SIMPLE_ROLLUPS.has(op)) {
      throw datasetError(`Unsupported rollup for field "${name}": ${value}.`);
    }
    if (NUMERIC_ROLLUPS.has(op) && !["integer", "decimal", "number"].includes(type)) {
      throw datasetError(`Rollup ${op} requires a numeric field: ${name}.`);
    }
    return { op };
  }
  assertPlainObject(value, `Rollup for field "${name}"`);
  const keys = Object.keys(value);
  if (keys.some((key) => !["op", "numerator", "denominator", "scale"].includes(key))) {
    throw datasetError(`Rollup for field "${name}" contains unsupported keys.`);
  }
  if (value.op !== "ratioOfSums") {
    throw datasetError(`Unsupported rollup for field "${name}": ${value.op}.`);
  }
  if (!["integer", "decimal", "number"].includes(type)) {
    throw datasetError(`ratioOfSums requires a numeric result field: ${name}.`);
  }
  const scale = value.scale === undefined ? 1 : Number(value.scale);
  if (!Number.isFinite(scale)) {
    throw datasetError(`ratioOfSums scale must be numeric for field "${name}".`);
  }
  return {
    op: "ratioOfSums",
    numerator: requiredText(value.numerator, `Field "${name}" ratio numerator`, 128),
    denominator: requiredText(value.denominator, `Field "${name}" ratio denominator`, 128),
    scale,
  };
}

function validateRatioRollups(fields, fieldMap) {
  for (const field of fields) {
    if (field.rollup?.op !== "ratioOfSums") continue;
    for (const sourceName of [field.rollup.numerator, field.rollup.denominator]) {
      const source = fieldMap.get(sourceName);
      if (!source || !["integer", "decimal", "number"].includes(source.type)) {
        throw datasetError(
          `ratioOfSums field "${field.name}" references a missing or non-numeric field: ${sourceName}.`,
        );
      }
    }
  }
}

function validateRows(rawRows, manifest) {
  if (!Array.isArray(rawRows) || rawRows.length < 1) {
    throw datasetError("Dataset data must contain at least one row.");
  }
  if (rawRows.length > DATA_MAX_ROWS) {
    throw datasetError(`Dataset data exceeds the ${DATA_MAX_ROWS} row limit.`);
  }
  const selectedRows = manifest.skipBlankRows
    ? rawRows.filter((rawRow) => manifest.fields.some(
      (field) => field.name !== manifest.time.field && !isBlankValue(rawRow?.[field.name]),
    ))
    : rawRows;
  if (selectedRows.length < 1) {
    throw datasetError("Dataset data must contain at least one non-blank row.");
  }
  const fieldMap = new Map(manifest.fields.map((field) => [field.name, field]));
  const primaryKeys = new Set();
  return selectedRows.map((rawRow, index) => {
    assertPlainObject(rawRow, `Dataset row ${index + 1}`);
    const unknown = Object.keys(rawRow).filter((name) => !fieldMap.has(name));
    if (unknown.length > 0) {
      throw datasetError(`Dataset row ${index + 1} contains an undefined field: ${unknown[0]}.`);
    }
    const row = {};
    for (const field of manifest.fields) {
      row[field.name] = typedValue(rawRow[field.name], field, index + 1);
    }
    const period = row[manifest.time.field];
    if (!isDatasetPeriodStart(
      period,
      manifest.time.sourceGranularity,
      manifest.time.weekStartsOn,
    )) {
      throw datasetError(
        `Dataset row ${index + 1} time field "${manifest.time.field}" must be ${sourcePeriodDescription(manifest.time)}.`,
      );
    }
    const primaryKey = JSON.stringify(manifest.primaryKey.map((name) => row[name]));
    if (primaryKeys.has(primaryKey)) {
      throw datasetError(`Dataset primaryKey is duplicated at row ${index + 1}.`);
    }
    primaryKeys.add(primaryKey);
    return row;
  });
}

function sourcePeriodDescription(time) {
  if (time.sourceGranularity === "week") {
    return `a ${time.weekStartsOn} week start`;
  }
  if (time.sourceGranularity === "month") {
    return "the first day of a month";
  }
  if (time.sourceGranularity === "quarter") {
    return "the first day of a natural quarter";
  }
  return "a valid calendar date";
}

function typedValue(value, field, rowNumber) {
  const empty = isBlankValue(value);
  if (empty) {
    if (field.required) {
      throw datasetError(`Dataset row ${rowNumber} is missing required field "${field.name}".`);
    }
    return null;
  }
  if (field.type === "string") {
    if (typeof value === "object") {
      throw datasetError(`Dataset row ${rowNumber} field "${field.name}" must be string.`);
    }
    return String(value);
  }
  if (field.type === "boolean") {
    if (value === true || value === false) return value;
    const text = String(value).trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
    throw datasetError(`Dataset row ${rowNumber} field "${field.name}" must be boolean.`);
  }
  if (field.type === "date") {
    const text = String(value).trim();
    if (!isIsoDate(text)) {
      throw datasetError(`Dataset row ${rowNumber} field "${field.name}" must be YYYY-MM-DD.`);
    }
    return text;
  }
  let numberSource = value;
  if (typeof value !== "number" && field.numberFormat === "comma-grouped") {
    const text = String(value).trim();
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
      throw datasetError(
        `Dataset row ${rowNumber} field "${field.name}" must use comma-grouped number format.`,
      );
    }
    numberSource = text.replaceAll(",", "");
  }
  const number = typeof numberSource === "number"
    ? numberSource
    : Number(String(numberSource).trim());
  if (!Number.isFinite(number) || (field.type === "integer" && !Number.isInteger(number))) {
    throw datasetError(`Dataset row ${rowNumber} field "${field.name}" must be ${field.type}.`);
  }
  return number;
}

function isBlankValue(value) {
  return value === undefined
    || value === null
    || (typeof value === "string" && value.trim() === "");
}

function parseDatasetRows(source, format, manifest) {
  if (format === "json") {
    if (manifest.fields.some((field) => field.sourceColumn !== null)) {
      throw datasetError("Dataset field sourceColumn is supported only for CSV and TSV data.");
    }
    const parsed = parseJson(source, "Dataset data");
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
    if (!Array.isArray(rows)) {
      throw datasetError("JSON dataset data must be an array or an object with a rows array.");
    }
    return rows;
  }

  let records;
  try {
    records = parseDelimitedRecords(source, format === "tsv" ? "\t" : ",");
  } catch (error) {
    throw datasetError(error instanceof Error ? error.message : "Dataset data parsing failed.");
  }
  if (records.length < 2) {
    return [];
  }
  if (manifest.fields.every((field) => field.sourceColumn !== null)) {
    const headerWidth = records[0].length;
    const lastSourceColumn = Math.max(...manifest.fields.map((field) => field.sourceColumn));
    if (lastSourceColumn > headerWidth) {
      throw datasetError(
        `Dataset field sourceColumn ${lastSourceColumn} exceeds the ${headerWidth}-column source header.`,
      );
    }
    return records.slice(1).map((record) => Object.fromEntries(
      manifest.fields.map((field) => [field.name, record[field.sourceColumn - 1] ?? ""]),
    ));
  }
  const headers = records[0].map((header) => String(header).trim());
  if (headers.some((header) => !header)) {
    throw datasetError("Dataset data headers must not be empty.");
  }
  if (new Set(headers).size !== headers.length) {
    throw datasetError("Dataset data headers must be unique.");
  }
  return records.slice(1).map((record, index) => {
    if (record.slice(headers.length).some((value) => String(value).trim() !== "")) {
      throw datasetError(`Dataset row ${index + 1} contains more values than headers.`);
    }
    return Object.fromEntries(
      headers.map((header, columnIndex) => [header, record[columnIndex] ?? ""]),
    );
  });
}

function datasetFormat(configured, source) {
  if (configured) return configured;
  const ext = source.slice(source.lastIndexOf("."));
  const extension = ext.slice(1).toLowerCase();
  if (!DATA_FORMATS.has(extension)) {
    throw datasetError("Dataset format must be csv, tsv, or json.");
  }
  return extension;
}

function validateFieldList(value, label, fieldMap) {
  if (!Array.isArray(value) || value.length < 1 || value.length > DATA_MAX_FIELDS) {
    throw datasetError(`${label} must be a non-empty field-name array.`);
  }
  const fields = value.map((name) => requiredText(name, label, 128));
  if (new Set(fields).size !== fields.length) {
    throw datasetError(`${label} must not contain duplicates.`);
  }
  const missing = fields.find((name) => !fieldMap.has(name));
  if (missing) {
    throw datasetError(`${label} references an undefined field: ${missing}.`);
  }
  return fields;
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw datasetError(`${label} must be a JSON object.`);
  }
}

function assertKnownKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw datasetError(`${label} contains an unsupported key: ${unknown}.`);
  }
}

function requiredText(value, label, maxLength) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength || /\u0000/.test(text)) {
    throw datasetError(`${label} is required and must be at most ${maxLength} characters.`);
  }
  return text;
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).trim();
  if (text.length > maxLength || /\u0000/.test(text)) {
    throw datasetError(`${label} must be at most ${maxLength} characters.`);
  }
  return text;
}

function parseJson(source, label) {
  try {
    return JSON.parse(String(source).replace(/^\uFEFF/, ""));
  } catch {
    throw datasetError(`${label} must contain valid JSON.`);
  }
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function datasetError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = "dataset_invalid";
  return error;
}

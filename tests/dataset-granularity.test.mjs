import assert from "node:assert/strict";
import test from "node:test";

import {
  datasetGranularitiesForSource,
  datasetPeriodStartsBetween,
  isDatasetPeriodStart,
} from "../src/dataset/dataset-granularity.mjs";

test("source granularity exposes only mathematically reliable time views", () => {
  assert.deepEqual(
    datasetGranularitiesForSource("day"),
    ["day", "week", "month", "quarter"],
  );
  assert.deepEqual(
    datasetGranularitiesForSource("week"),
    ["week", "month", "quarter"],
  );
  assert.deepEqual(datasetGranularitiesForSource("month"), ["month", "quarter"]);
  assert.deepEqual(datasetGranularitiesForSource("quarter"), ["quarter"]);
});

test("source period anchors follow the declared week and calendar boundaries", () => {
  assert.equal(isDatasetPeriodStart("2026-01-05", "week", "monday"), true);
  assert.equal(isDatasetPeriodStart("2026-01-06", "week", "monday"), false);
  assert.equal(isDatasetPeriodStart("2026-04-01", "quarter"), true);
  assert.equal(isDatasetPeriodStart("2026-05-01", "quarter"), false);
  assert.deepEqual(
    datasetPeriodStartsBetween("2026-01-01", "2026-01-31", "week", {
      weekStartsOn: "monday",
    }),
    ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"],
  );
});

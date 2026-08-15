import assert from "node:assert/strict";
import test from "node:test";

import { queryDataset } from "../src/parse/dataset-query.mjs";

const manifest = {
  id: "company_daily",
  title: "Company daily report",
  grain: ["date"],
  primaryKey: ["date"],
  time: {
    field: "date",
    weekStartsOn: "monday",
    calendar: "calendar",
    sourceGranularity: "day",
  },
  fields: [
    { name: "date", type: "date", required: true, rollup: null },
    { name: "revenue", type: "decimal", required: true, rollup: { op: "sum" } },
    { name: "users", type: "integer", required: true, rollup: { op: "avg" } },
    { name: "cash", type: "decimal", required: true, rollup: { op: "last" } },
    { name: "orders", type: "integer", required: true, rollup: { op: "sum" } },
    { name: "visits", type: "integer", required: true, rollup: { op: "sum" } },
    {
      name: "conversion_rate",
      type: "decimal",
      required: false,
      rollup: {
        op: "ratioOfSums",
        numerator: "orders",
        denominator: "visits",
        scale: 100,
      },
    },
    { name: "note", type: "string", required: false, rollup: null },
  ],
};

test("queryDataset aggregates two years of daily rows into natural quarters", () => {
  const rows = dailyRows("2025-01-01", "2026-12-31");
  const result = queryDataset({
    manifest,
    rows,
    component: "Chart",
    attributes: {
      x: "period",
      series: "revenue,users,cash,conversion_rate",
      from: "2025-01-01",
      to: "2026-12-31",
    },
    granularity: "quarter",
  });

  assert.equal(rows.length, 730);
  assert.equal(result.rows.length, 8);
  assert.deepEqual(result.rows[0], {
    period: "2025-Q1",
    revenue: 90,
    users: 45.5,
    cash: 90,
    conversion_rate: 50,
  });
  assert.equal(result.rows.at(-1).period, "2026-Q4");
  assert.equal(result.meta.missingDateCount, 0);
  assert.equal(result.meta.partialPeriodCount, 0);
});

test("long-running charts hide time views that would render too many points", () => {
  const rows = dailyRows("2024-08-01", "2026-07-31");
  const result = queryDataset({
    manifest,
    rows,
    component: "Chart",
    attributes: {
      x: "period",
      series: "revenue,users",
      from: "2024-08-01",
      to: "2026-07-31",
    },
    granularity: "month",
    granularityOptions: ["day", "week", "month", "quarter"],
  });

  assert.deepEqual(result.meta.availableGranularities, ["week", "month", "quarter"]);
  assert.deepEqual(result.meta.densityLimitedGranularities, ["day"]);
  assert.equal(result.meta.granularity, "month");
  assert.equal(result.rows.length, 24);
});

test("long-running charts replace an overly dense requested view with the finest readable view", () => {
  const result = queryDataset({
    manifest,
    rows: dailyRows("2024-08-01", "2026-07-31"),
    component: "Chart",
    attributes: { x: "period", series: "revenue" },
    granularity: "day",
    granularityOptions: ["day", "week", "month", "quarter"],
  });

  assert.equal(result.meta.granularity, "week");
  assert.equal(result.rows.length, 105);
});

test("long-running data tables keep explicitly requested daily rows", () => {
  const result = queryDataset({
    manifest,
    rows: dailyRows("2024-08-01", "2026-07-31"),
    component: "DataTable",
    attributes: { columns: "date,revenue" },
    granularity: "day",
    granularityOptions: ["day", "week", "month", "quarter"],
  });

  assert.deepEqual(result.meta.availableGranularities, ["day", "week", "month", "quarter"]);
  assert.deepEqual(result.meta.densityLimitedGranularities, []);
  assert.equal(result.rows.length, 730);
});

test("queryDataset sorts daily source rows and keeps missing dates visible as metadata", () => {
  const rows = dailyRows("2026-01-01", "2026-01-10")
    .filter((row) => row.date !== "2026-01-04")
    .reverse();
  const result = queryDataset({
    manifest,
    rows,
    component: "DataTable",
    attributes: {
      columns: "date,revenue",
      from: "2026-01-01",
      to: "2026-01-10",
    },
    granularity: "day",
  });

  assert.equal(result.rows[0].date, "2026-01-01");
  assert.equal(result.rows.at(-1).date, "2026-01-10");
  assert.equal(result.rows.some((row) => row.date === "2026-01-04"), false);
  assert.equal(result.meta.missingDateCount, 1);
  assert.deepEqual(result.meta.missingDates, ["2026-01-04"]);
});

test("queryDataset refuses to guess a coarser rollup for a field", () => {
  assert.throws(
    () => queryDataset({
      manifest,
      rows: dailyRows("2026-01-01", "2026-01-31"),
      component: "DataTable",
      attributes: { columns: "date,note" },
      granularity: "month",
    }),
    /Field "note" needs a rollup/,
  );
});

test("queryDataset applies bounded equality filters before aggregation", () => {
  const filteredManifest = {
    ...manifest,
    grain: ["date", "company"],
    primaryKey: ["date", "company"],
    fields: [
      ...manifest.fields,
      { name: "company", type: "string", required: true, rollup: null },
    ],
  };
  const baseRows = dailyRows("2026-04-01", "2026-04-03");
  const rows = baseRows.flatMap((row) => [
    { ...row, company: "A" },
    { ...row, company: "B", revenue: 10 },
  ]);
  const result = queryDataset({
    manifest: filteredManifest,
    rows,
    component: "Chart",
    attributes: { series: "revenue" },
    query: { where: [{ field: "company", op: "eq", value: "B" }] },
    granularity: "month",
  });

  assert.equal(result.rows[0].revenue, 30);
  assert.equal(result.meta.sourceRows, 3);
  assert.equal(result.meta.totalRows, 6);
  assert.equal(result.meta.partialPeriodCount, 1);
});

test("queryDataset refuses an ambiguous last snapshot across multiple rows on one date", () => {
  const multiSeriesManifest = {
    ...manifest,
    grain: ["date", "company"],
    primaryKey: ["date", "company"],
    fields: [
      ...manifest.fields,
      { name: "company", type: "string", required: true, rollup: null },
    ],
  };
  const base = dailyRows("2026-01-01", "2026-01-02");
  const rows = base.flatMap((row) => [
    { ...row, company: "A" },
    { ...row, company: "B" },
  ]);

  assert.throws(
    () => queryDataset({
      manifest: multiSeriesManifest,
      rows,
      component: "DataTable",
      attributes: { columns: "date,cash" },
      granularity: "month",
    }),
    /multiple rows share a date/,
  );
});

test("weekly source data exposes safe coarser views and checks missing weeks", () => {
  const weeklyManifest = {
    ...manifest,
    id: "company_weekly",
    time: { ...manifest.time, sourceGranularity: "week" },
  };
  const rows = ["2026-01-05", "2026-01-12", "2026-01-26"].map((date, index) => ({
    ...dailyRows(date, date)[0],
    date,
    revenue: index + 1,
  }));
  const result = queryDataset({
    manifest: weeklyManifest,
    rows,
    component: "Chart",
    attributes: { x: "period", series: "revenue" },
    granularity: "auto",
    granularityOptions: ["day", "week", "month", "quarter"],
  });

  assert.equal(result.meta.sourceGranularity, "week");
  assert.equal(result.meta.granularity, "week");
  assert.deepEqual(result.meta.availableGranularities, ["week", "month", "quarter"]);
  assert.equal(result.meta.missingPeriodCount, 1);
  assert.deepEqual(result.meta.missingPeriods, ["2026-01-19"]);
  assert.equal(result.meta.partialPeriodCount, 0);
  assert.equal(result.meta.omittedBoundaryPeriodCount, 0);
});

test("weekly source assigns whole weeks by midpoint and averages them directly", () => {
  const weeklyManifest = {
    ...manifest,
    id: "company_weekly",
    time: { ...manifest.time, sourceGranularity: "week" },
  };
  const dates = [
    "2025-12-29",
    "2026-01-05",
    "2026-01-12",
    "2026-01-19",
    "2026-01-26",
    "2026-02-02",
    "2026-02-09",
    "2026-02-16",
    "2026-02-23",
    "2026-03-02",
    "2026-03-09",
    "2026-03-16",
    "2026-03-23",
    "2026-03-30",
  ];
  const rows = dates.map((date, index) => ({
    ...dailyRows(date, date)[0],
    date,
    users: (index + 1) * 10,
  }));
  const month = queryDataset({
    manifest: weeklyManifest,
    rows,
    component: "Chart",
    attributes: { x: "period", series: "users" },
    granularity: "month",
  });
  const quarter = queryDataset({
    manifest: weeklyManifest,
    rows,
    component: "Chart",
    attributes: { x: "period", series: "users" },
    granularity: "quarter",
  });

  assert.deepEqual(month.rows, [
    { period: "2026-01", users: 30 },
    { period: "2026-02", users: 75 },
    { period: "2026-03", users: 115 },
  ]);
  assert.deepEqual(month.meta.omittedBoundaryPeriods, ["2026-04"]);
  assert.equal(month.meta.partialPeriodCount, 0);
  assert.deepEqual(quarter.rows, [{ period: "2026-Q1", users: 70 }]);
  assert.deepEqual(quarter.meta.omittedBoundaryPeriods, ["2026-Q2"]);
  assert.equal(quarter.meta.partialPeriodCount, 0);
});

test("weekly coarser views keep interior periods with missing weeks visible", () => {
  const weeklyManifest = {
    ...manifest,
    id: "company_weekly",
    time: { ...manifest.time, sourceGranularity: "week" },
  };
  const rows = ["2025-12-29", "2026-01-05", "2026-01-19", "2026-01-26"].map(
    (date, index) => ({
      ...dailyRows(date, date)[0],
      date,
      users: (index + 1) * 10,
    }),
  );
  const result = queryDataset({
    manifest: weeklyManifest,
    rows,
    component: "Chart",
    attributes: { x: "period", series: "users" },
    granularity: "month",
  });

  assert.deepEqual(result.rows, [{ period: "2026-01", users: 25 }]);
  assert.deepEqual(result.meta.missingPeriods, ["2026-01-12"]);
  assert.deepEqual(result.meta.partialPeriods, ["2026-01"]);
  assert.equal(result.meta.omittedBoundaryPeriodCount, 0);
});

test("monthly source data can aggregate into natural quarters without exposing day or week", () => {
  const monthlyManifest = {
    ...manifest,
    id: "company_monthly",
    time: { ...manifest.time, sourceGranularity: "month" },
  };
  const rows = ["2026-01-01", "2026-02-01", "2026-03-01"].map((date, index) => ({
    ...dailyRows(date, date)[0],
    date,
    revenue: index + 1,
  }));
  const result = queryDataset({
    manifest: monthlyManifest,
    rows,
    component: "Chart",
    attributes: { x: "period", series: "revenue" },
    granularity: "quarter",
    granularityOptions: ["day", "week", "month", "quarter"],
  });

  assert.deepEqual(result.meta.availableGranularities, ["month", "quarter"]);
  assert.deepEqual(result.rows, [{ period: "2026-Q1", revenue: 6 }]);
  assert.equal(result.meta.missingPeriodCount, 0);
  assert.equal(result.meta.partialPeriodCount, 0);
});

test("dataset field labels become chart legends and table headers", () => {
  const labelledManifest = {
    ...manifest,
    fields: manifest.fields.map((field) => ({
      ...field,
      label: field.name === "date"
        ? "Date"
        : field.name === "users"
          ? "Average active users"
          : "",
    })),
  };
  const rows = dailyRows("2026-01-01", "2026-01-02");
  const chart = queryDataset({
    manifest: labelledManifest,
    rows,
    component: "Chart",
    attributes: { x: "period", series: "users" },
    granularity: "day",
  });
  const table = queryDataset({
    manifest: labelledManifest,
    rows,
    component: "DataTable",
    attributes: { columns: "date,users" },
    granularity: "day",
  });

  assert.equal(chart.attributes.usersLabel, "Average active users");
  assert.deepEqual(table.attributes.columnLabels, {
    date: "Date",
    users: "Average active users",
  });
});

function dailyRows(from, to) {
  const rows = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  let index = 1;
  while (cursor <= end) {
    rows.push({
      date: cursor.toISOString().slice(0, 10),
      revenue: 1,
      users: index,
      cash: index,
      orders: 1,
      visits: 2,
      conversion_rate: null,
      note: `day ${index}`,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    index += 1;
  }
  return rows;
}

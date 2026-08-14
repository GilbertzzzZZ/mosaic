import assert from "node:assert/strict";
import test from "node:test";

import { datasetQueryFromContent } from "../src/blocks/dataset-table.mjs";

test("datasetQueryFromContent returns {} for an empty body", () => {
  assert.deepEqual(datasetQueryFromContent(""), {});
  assert.deepEqual(datasetQueryFromContent("   \n  "), {});
});

test("datasetQueryFromContent returns {} for a null/undefined body (self-closing tag)", () => {
  assert.deepEqual(datasetQueryFromContent(null), {});
  assert.deepEqual(datasetQueryFromContent(undefined), {});
});

test("datasetQueryFromContent parses a fenced query JSON object", () => {
  const content = '```query\n{"from":"2026-01-01","to":"2026-03-31"}\n```';
  assert.deepEqual(datasetQueryFromContent(content), {
    from: "2026-01-01",
    to: "2026-03-31",
  });
});

test("datasetQueryFromContent rejects a non-query fence", () => {
  const content = '```csv\nname,value\na,1\n```';
  assert.throws(
    () => datasetQueryFromContent(content),
    /A dataset component body may contain only a fenced query JSON object\./
  );
});

test("datasetQueryFromContent rejects bare (unfenced) content", () => {
  const content = '{"from":"2026-01-01"}';
  assert.throws(
    () => datasetQueryFromContent(content),
    /A dataset component body may contain only a fenced query JSON object\./
  );
});

test("datasetQueryFromContent rejects invalid JSON inside the query fence", () => {
  const content = "```query\n{not json}\n```";
  assert.throws(
    () => datasetQueryFromContent(content),
    /Dataset query must contain valid JSON\./
  );
});

test("datasetQueryFromContent rejects a non-object JSON value", () => {
  assert.throws(
    () => datasetQueryFromContent("```query\n[1,2,3]\n```"),
    /Dataset query must be a JSON object\./
  );
  assert.throws(
    () => datasetQueryFromContent('```query\n"hello"\n```'),
    /Dataset query must be a JSON object\./
  );
  assert.throws(
    () => datasetQueryFromContent("```query\nnull\n```"),
    /Dataset query must be a JSON object\./
  );
});

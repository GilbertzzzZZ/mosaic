// Ported from git-leaf (https://github.com/MangoFuture1210/git-leaf)
// src/content/delimited-data.mjs, Apache-2.0. See NOTICE. Local changes: none.

export function parseDelimitedRecords(content, delimiter = ",") {
  if (delimiter !== "," && delimiter !== "\t") {
    throw new Error("Delimited data supports only CSV and TSV.");
  }

  const text = String(content ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (quoted) {
    throw new Error("Delimited data contains an unterminated quoted field.");
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((record) => record.some((value) => String(value).length > 0));
}

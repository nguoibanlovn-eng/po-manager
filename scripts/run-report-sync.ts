// Bypass "server-only" for CLI usage
const Module = require("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
  if (request === "server-only") return require.resolve("../node_modules/next/dist/compiled/server-only/empty.js");
  return origResolve.call(this, request, ...args);
};

import { syncNhanhReport } from "../lib/nhanh/report-scraper";

const from = process.argv[2] || "2026-04-01";
const to = process.argv[3] || "2026-04-25";

console.log(`Syncing report ${from} → ${to}...`);
syncNhanhReport({ from, to }).then((result) => {
  console.log("Days:", result.days, "| Rows:", result.rows);
  if (result.error) console.log("Error:", result.error);
  for (const log of result.logs || []) console.log(log);
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});

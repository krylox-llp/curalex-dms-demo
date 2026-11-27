// Runs every tests/db/*.test.mjs suite against the local Supabase stack and exits non-zero on failure.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const only = process.argv[2];
const suites = readdirSync(dir).filter((f) => f.endsWith(".test.mjs") && (!only || f.includes(only))).sort();
let passed = 0, failed = 0, crashed = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite}`);
  const r = spawnSync(process.execPath, [`${dir}${suite}`], { encoding: "utf8" });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const verbose = process.env.VERBOSE === "1";
  for (const line of out.split("\n")) if (verbose || /^FAIL|passed, .* failed|Error/.test(line)) console.log(line);
  const m = out.match(/(\d+) passed, (\d+) failed/);
  if (m) { passed += +m[1]; failed += +m[2]; } else crashed++;
}
console.log(`\nTOTAL: ${passed} passed, ${failed} failed${crashed ? `, ${crashed} suite(s) crashed` : ""}`);
process.exitCode = failed || crashed ? 1 : 0;

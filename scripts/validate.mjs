// Standalone data check (also run by build.mjs). Exit code 1 on errors — suitable for CI / pre-commit.
import { loadData } from "./lib/data.mjs";

const { problems } = await loadData();
for (const e of problems.errors) console.log(`✗ ${e}`);
for (const w of problems.warnings) console.log(`! ${w}`);
console.log(`pending (${problems.pending.length}): ${problems.pending.join(", ")}`);
console.log(problems.errors.length ? `✗ ${problems.errors.length} error(s)` : "✓ no errors");
process.exit(problems.errors.length ? 1 : 0);

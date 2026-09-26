// Refresh citation counts in data/publications.yml from OpenAlex, matched by DOI (work-level, so the
// merged OpenAlex author cluster does not matter). One batched API call; YAML comments are preserved.
//   node scripts/refresh-citations.mjs            → update the file
//   node scripts/refresh-citations.mjs --dry-run  → only print the changes
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = path.join(ROOT, "data/publications.yml");
const dry = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);

const doc = YAML.parseDocument(await readFile(FILE, "utf8"));
const items = doc.contents.items;
const dois = items.map((it) => String(it.get("doi") || "").toLowerCase()).filter(Boolean);

const counts = new Map();
for (let i = 0; i < dois.length; i += 50) {
  const batch = dois.slice(i, i + 50);
  const url = `https://api.openalex.org/works?filter=doi:${batch.map(encodeURIComponent).join("|")}&select=doi,cited_by_count&per-page=50`;
  const res = await fetch(url, { headers: { "User-Agent": "ruihan-zhao-homepage/0.2 (citation refresh)" } });
  if (!res.ok) {
    console.error(`OpenAlex HTTP ${res.status} — keeping existing counts`);
    process.exit(res.status === 429 ? 0 : 1);
  }
  for (const w of (await res.json()).results) counts.set(w.doi.replace("https://doi.org/", "").toLowerCase(), w.cited_by_count);
}

let changed = 0;
for (const it of items) {
  const doi = String(it.get("doi") || "").toLowerCase();
  if (!counts.has(doi)) { console.log(`- ${it.get("id")}: not found in OpenAlex, unchanged`); continue; }
  const before = it.getIn(["citations", "count"]);
  const after = counts.get(doi);
  if (before !== after) { changed++; console.log(`~ ${it.get("id")}: ${before} → ${after}`); }
  if (!dry) {
    it.setIn(["citations", "count"], after);
    it.setIn(["citations", "source"], "OpenAlex");
    it.setIn(["citations", "checked"], today);
  }
}
if (!dry) await writeFile(FILE, doc.toString({ lineWidth: 0 }));
console.log(`${changed} count(s) changed; ${counts.size}/${dois.length} works matched${dry ? " (dry run)" : `; checked date set to ${today}`}.`);

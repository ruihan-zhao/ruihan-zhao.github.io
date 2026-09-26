// Fetch and cache Crossref metadata.
//   node scripts/enrich-crossref.mjs              → every non-arXiv DOI in data/publications.yml
//   node scripts/enrich-crossref.mjs <doi> [...]  → only the given DOIs (e.g. before adding a new paper)
// Output: data/_cache/crossref/<slug>.json, plus a one-line summary per DOI.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "data/_cache/crossref");
await mkdir(CACHE, { recursive: true });

const slug = (doi) => doi.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const dateOf = (p) => (p?.["date-parts"]?.[0] || []).map((n, i) => (i ? String(n).padStart(2, "0") : n)).join("-") || null;

let dois = process.argv.slice(2).map((d) => d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""));
if (!dois.length) {
  const pubs = YAML.parse(await readFile(path.join(ROOT, "data/publications.yml"), "utf8"));
  dois = pubs.map((p) => p.doi).filter((d) => d && !/^10\.48550\//i.test(d));
}

for (const doi of dois) {
  const file = path.join(CACHE, `${slug(doi)}.json`);
  let msg;
  if (existsSync(file)) msg = JSON.parse(await readFile(file, "utf8"));
  else {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { "User-Agent": "ruihan-zhao-homepage-data-layer/0.2 (build script)" } });
    if (!res.ok) { console.log(`✗ ${doi} HTTP ${res.status}`); continue; }
    msg = (await res.json()).message;
    await writeFile(file, JSON.stringify(msg, null, 1));
    await new Promise((r) => setTimeout(r, 250));
  }
  const authors = (msg.author || []).map((a) => [a.given, a.family].filter(Boolean).join(" "));
  const me = (msg.author || []).find((a) => /^ruihan$/i.test(a.given || "") && /^zhao$/i.test(a.family || ""));
  console.log(
    [doi, msg.type, msg["container-title"]?.[0], `v${msg.volume ?? "-"} i${msg.issue ?? "-"} p${msg.page ?? "-"} a${msg["article-number"] ?? "-"}`,
     `issued ${dateOf(msg.issued)} online ${dateOf(msg["published-online"]) ?? "-"} created ${dateOf(msg.created)}`,
     `pos ${me ? msg.author.indexOf(me) + 1 : "-"}/${authors.length}`, `orcid ${me?.ORCID ?? "-"}`,
     (msg.license || []).map((l) => l.URL).find((u) => u.includes("creativecommons")) || "", msg.resource?.primary?.URL].join(" | "),
  );
  if (process.argv.length > 2) console.log("  authors:", authors.join("; "), "\n  title:", msg.title?.[0]);
}

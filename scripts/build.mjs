// Build: validate data → machine-readable exports → homepage (en + zh) into dist/.
import { mkdir, writeFile, copyFile, rm, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import YAML from "yaml";
import { ROOT, loadData } from "./lib/data.mjs";
import { jsonLd, bibtex, cslJson, jsonResume, llmsTxt, llmsFullTxt } from "./lib/exports.mjs";
import { commonJs } from "./lib/html.mjs";
import { renderSite } from "./lib/render-site.mjs";

const DIST = path.join(ROOT, "dist");
const put = async (rel, content) => {
  const f = path.join(DIST, rel);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, content);
};
const copy = async (from, rel) => {
  await mkdir(path.dirname(path.join(DIST, rel)), { recursive: true });
  await copyFile(from, path.join(DIST, rel));
};

const data = await loadData();
const { errors, warnings, pending } = data.problems;
if (errors.length) {
  console.error("✗ Data errors:\n  " + errors.join("\n  "));
  process.exit(1);
}
const { metrics_source: metricsSource } = YAML.parse(await readFile(path.join(ROOT, "data/venues.yml"), "utf8"));

// Empty dist/ but keep the directory itself (Windows refuses to remove a directory that is some process's cwd).
await mkdir(DIST, { recursive: true });
for (const entry of await readdir(DIST)) await rm(path.join(DIST, entry), { recursive: true, force: true });

// 1) Machine-readable exports (site root /llms.txt + /data/*)
const resume = jsonResume(data);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
// The JSON Resume schema (MIT) is downloaded once and cached; if it cannot be fetched, validation is skipped with a warning.
const SCHEMA_URL = "https://raw.githubusercontent.com/jsonresume/resume-schema/faeb0ac58e4fb7a1abf3abed3ecd1a5f2e96db9f/schema.json"; // pinned draft-07 version
const SCHEMA_FILE = path.join(ROOT, "data/_cache/schemas/resume-schema.json");
let schema = null;
if (existsSync(SCHEMA_FILE)) schema = JSON.parse(await readFile(SCHEMA_FILE, "utf8"));
else {
  try {
    const res = await fetch(SCHEMA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    schema = await res.json();
    await mkdir(path.dirname(SCHEMA_FILE), { recursive: true });
    await writeFile(SCHEMA_FILE, JSON.stringify(schema));
  } catch (e) {
    console.warn(`! JSON Resume schema unavailable (${e.message}); skipping resume.json validation`);
  }
}
if (schema && !ajv.validate(schema, resume)) {
  console.error("✗ resume.json does not match the JSON Resume schema:", ajv.errorsText());
  process.exit(1);
}
const graph = jsonLd(data);
await put("data/person.jsonld", JSON.stringify(graph, null, 2));
await put("data/publications.bib", bibtex(data));
await put("data/publications.csl.json", JSON.stringify(cslJson(data), null, 2));
await put("data/resume.json", JSON.stringify(resume, null, 2));
await put("llms.txt", llmsTxt(data));
await put("llms-full.txt", llmsFullTxt(data));
await put("robots.txt", "User-agent: *\nAllow: /\n\n# Machine-readable profile: /llms.txt, /data/person.jsonld\n");
await put(".nojekyll", "");

// 2) Assets: stylesheet, script, self-hosted fonts (no Google Fonts / CDN, so the site loads well in mainland China)
await copy(path.join(ROOT, "scripts/assets/site.css"), "assets/site.css");
await put("assets/common.js", commonJs);
const FONTS = {
  "@fontsource/roboto": ["roboto-latin-300-normal", "roboto-latin-300-italic", "roboto-latin-400-normal", "roboto-latin-500-normal", "roboto-latin-700-normal"],
  "@fontsource/roboto-slab": ["roboto-slab-latin-300-normal", "roboto-slab-latin-400-normal", "roboto-slab-latin-700-normal"],
};
for (const [pkg, files] of Object.entries(FONTS)) for (const f of files) await copy(path.join(ROOT, "node_modules", pkg, "files", `${f}.woff2`), `assets/fonts/${f}.woff2`);
const imgDir = path.join(ROOT, "scripts/assets/img");
if (existsSync(imgDir)) for (const f of await readdir(imgDir, { recursive: true })) if (/\.(jpe?g|png|webp|svg)$/i.test(f)) await copy(path.join(imgDir, f), `assets/img/${f}`);

// 3) Pages
const pages = renderSite(data, metricsSource);
for (const pg of pages) await put(pg.path, pg.html);
await put("404.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 | ${data.profile.name.en}</title><link rel="stylesheet" href="/assets/site.css"></head><body><main class="container"><h1 class="post-title">404</h1><p>Page not found. <a href="/">Home</a> · <a href="/zh/">中文主页</a></p></main></body></html>`);
if (data.profile.site?.base_url) {
  const base = data.profile.site.base_url.replace(/\/$/, "");
  const urls = pages.map((p) => `${base}/${p.path.replace(/index\.html$/, "")}`);
  await put("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${data.profile.updated}</lastmod></url>`).join("\n")}\n</urlset>\n`);
}

console.log(`✓ built ${pages.length} pages + exports into dist/`);
console.log(`  publications: ${data.totals.count} (journal ${data.totals.journal}, conference ${data.totals.conference}, preprint ${data.totals.preprint}; first-author ${data.totals.firstAuthor}); citations ${data.totals.citations}`);
console.log(`  JSON Resume schema: ${schema ? "valid" : "skipped (schema unavailable)"}; JSON-LD nodes: ${graph["@graph"].length}`);
if (warnings.length) console.log(`  warnings (${warnings.length}):\n    ` + warnings.join("\n    "));
console.log(`  pending (${pending.length}): ${pending.join(", ") || "none"}`);

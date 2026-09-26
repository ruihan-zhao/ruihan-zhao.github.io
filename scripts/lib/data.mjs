// Load, normalize and validate the data layer (data/*.yml).
import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const ME = "Ruihan Zhao";
const FORBIDDEN_STATUS = new Set(["submitted", "under_review", "in_review", "in_preparation", "revision", "rejected", "draft"]);

const load = async (f) => YAML.parse(await readFile(path.join(ROOT, "data", f), "utf8"));

export async function loadData() {
  const [profile, publications, venues, news] = await Promise.all(["profile.yml", "publications.yml", "venues.yml", "news.yml"].map(load));
  const problems = validate({ profile, publications, venues, news });
  const pubs = publications
    .filter((p) => p.public)
    .map((p) => normalizePub(p, venues))
    .sort((a, b) => (b.online || b.date).localeCompare(a.online || a.date));
  const byId = Object.fromEntries(pubs.map((p) => [p.id, p]));
  const awards = (profile.awards || []).map((a) => ({ ...a, refs: (a.pubs || []).map((id) => byId[id]) }));
  const awardById = Object.fromEntries(awards.map((a) => [a.id, a]));
  const newsItems = news
    .map((n) => ({ ...n, date: String(n.date), refs: (n.pubs || (n.pub ? [n.pub] : [])).map((id) => byId[id]), awardRef: n.award ? awardById[n.award] : null }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totals = {
    count: pubs.length,
    journal: pubs.filter((p) => p.type === "journal").length,
    conference: pubs.filter((p) => p.type === "conference").length,
    preprint: pubs.filter((p) => p.type === "preprint").length,
    firstAuthor: pubs.filter((p) => p.position === 1).length,
    citations: pubs.reduce((s, p) => s + (p.citations?.count || 0), 0),
    citationsChecked: pubs.map((p) => p.citations?.checked).filter(Boolean).sort().at(-1),
  };
  return { profile, pubs, byId, venues, news: newsItems, awards, totals, problems };
}

function normalizePub(p, venues) {
  const venue = venues[p.venue];
  const position = p.authors.indexOf(ME) + 1;
  const corresponding = new Set(p.corresponding || []);
  const authors = p.authors.map((name) => ({ name, short: abbreviate(name), me: name === ME, corresponding: corresponding.has(name) }));
  // Journal metrics: the entry whose for_years covers the paper's publication year (Sichen Tao's convention).
  const metrics = p.type === "journal" ? (venue?.metrics || []).find((m) => m.for_years?.includes(p.year)) || null : null;
  return {
    ...p,
    venueInfo: venue,
    metrics,
    position,
    role: position === 1 ? "first author" : `co-author (${ordinal(position)} of ${p.authors.length})`,
    authorsFull: authors,
    doiUrl: p.doi ? `https://doi.org/${p.doi}` : null,
    paperUrl: p.url || (p.doi ? `https://doi.org/${p.doi}` : null),
  };
}

export const abbreviate = (name) => {
  const parts = name.split(/\s+/);
  const family = parts.pop();
  return `${parts.map((g) => g.split("-").map((x) => x[0] + ".").join("-")).join(" ")} ${family}`;
};
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Every `null` leaf in profile.yml is an item still to be supplied (never rendered, never guessed).
export function pendingItems(profile) {
  const out = [];
  const walk = (obj, trail) => {
    if (obj === null) return out.push(trail.join("."));
    if (Array.isArray(obj)) return obj.forEach((v, i) => typeof v === "object" && walk(v, [...trail, i]));
    if (typeof obj === "object") for (const [k, v] of Object.entries(obj)) walk(v, [...trail, k]);
  };
  walk(profile, []);
  return out;
}

export function validate({ profile, publications, venues, news }) {
  const errors = [], warnings = [];
  const ids = new Set();
  const themes = new Set(profile.research.themes.map((t) => t.id));
  for (const p of publications) {
    const where = `publication ${p.id}`;
    if (ids.has(p.id)) errors.push(`${where}: duplicate id`);
    ids.add(p.id);
    if (FORBIDDEN_STATUS.has(p.status)) errors.push(`${where}: status "${p.status}" must never be in the public data layer — move it to private/`);
    else if (!["published", "accepted", "preprint"].includes(p.status)) errors.push(`${where}: unknown status "${p.status}"`);
    if (!p.doi && !p.arxiv) errors.push(`${where}: needs a DOI or arXiv id`);
    if (!venues[p.venue]) errors.push(`${where}: venue "${p.venue}" missing from venues.yml`);
    if (!themes.has(p.theme)) errors.push(`${where}: theme "${p.theme}" missing from profile.research.themes`);
    const mine = p.authors.filter((a) => a === ME).length;
    if (mine !== 1) errors.push(`${where}: "${ME}" must appear exactly once in authors (found ${mine})`);
    for (const c of p.corresponding || []) if (!p.authors.includes(c)) errors.push(`${where}: corresponding author "${c}" is not in the author list`);
    if (String(p.date).slice(0, 4) !== String(p.year)) warnings.push(`${where}: year ${p.year} differs from date ${p.date}`);
  }
  for (const [k, v] of Object.entries(venues)) {
    if (!v || typeof v !== "object") continue;
    for (const m of v.metrics || []) {
      if (!Array.isArray(m.for_years)) errors.push(`venue ${k}: every metrics entry needs for_years`);
      for (const key of ["jcr", "if", "citescore"]) if (m[key] && !m[key].year) errors.push(`venue ${k}: ${key} needs a year`);
    }
  }
  const awardIds = new Set((profile.awards || []).map((a) => a.id));
  for (const a of profile.awards || []) for (const id of a.pubs || []) if (!ids.has(id)) errors.push(`award ${a.id}: unknown publication "${id}"`);
  for (const n of news) {
    for (const id of n.pubs || (n.pub ? [n.pub] : [])) if (!ids.has(id)) errors.push(`news ${n.date}: unknown publication "${id}"`);
    if (n.award && !awardIds.has(n.award)) errors.push(`news ${n.date}: unknown award "${n.award}"`);
    if (!n.en || !n.zh) errors.push(`news ${n.date}: needs both en and zh text`);
  }
  if (!profile.identifiers?.orcid?.confirmed_by_user) warnings.push("ORCID not yet confirmed by the author");
  const selected = publications.filter((p) => p.selected).length;
  if (selected < 3 || selected > 8) warnings.push(`${selected} selected publications (recommended 3–8)`);
  const noMetrics = publications.filter((p) => p.type === "journal" && !(venues[p.venue]?.metrics || []).some((m) => m.for_years?.includes(p.year)));
  if (noMetrics.length) warnings.push(`journal papers shown without metrics (no verified entry for their year): ${noMetrics.map((p) => p.id).join(", ")}`);
  return { errors, warnings, pending: pendingItems(profile) };
}

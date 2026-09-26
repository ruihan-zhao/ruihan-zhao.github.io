// Machine-readable exports generated from the data layer.
// All outputs contain only public data (published / accepted / preprint works; confirmed profile facts).
import { ME } from "./data.mjs";

const ORCID_URL = (id) => `https://orcid.org/${id}`;
const url = (base, p) => (base ? base.replace(/\/$/, "") + p : p);

function identity(profile) {
  const ids = profile.identifiers || {};
  const sameAs = [
    ids.orcid?.id && ORCID_URL(ids.orcid.id),
    ids.google_scholar?.id && `https://scholar.google.com/citations?user=${ids.google_scholar.id}`,
    ids.scopus_author_id?.id && `https://www.scopus.com/authid/detail.uri?authorId=${ids.scopus_author_id.id}`,
    ids.researchgate?.url,
    ids.github?.username && `https://github.com/${ids.github.username}`,
  ].filter(Boolean);
  return { ids, sameAs };
}

const org = (o, units = []) => ({
  "@type": "CollegeOrUniversity",
  ...(o.ror ? { "@id": o.ror } : {}),
  name: o.org.en,
  alternateName: o.org.zh,
  ...(o.wikidata ? { sameAs: `https://www.wikidata.org/wiki/${o.wikidata}` } : {}),
  ...(units.length ? { department: units.map((u) => ({ "@type": "Organization", name: u.en, alternateName: u.zh })) } : {}),
});

// --- schema.org JSON-LD ---
function person(profile) {
  const base = profile.site?.base_url;
  const { ids, sameAs } = identity(profile);
  const current = (profile.positions || []).filter((p) => p.current);
  const wikidata = Object.fromEntries((profile.affiliations || []).filter((a) => a.wikidata).map((a) => [a.ror, a.wikidata]));
  // alumniOf: one node per institution, listing the units attended.
  const alumni = new Map();
  for (const e of [...(profile.education || []), ...(profile.experience || [])]) {
    const ror = e.ror || (profile.affiliations || []).find((a) => a.org.en === e.org.en)?.ror;
    const key = ror || e.org.en;
    if (!alumni.has(key)) alumni.set(key, { org: e.org, ror, wikidata: wikidata[ror], units: [] });
    alumni.get(key).units.push(e.unit);
  }
  return {
    "@type": "Person",
    "@id": ids.orcid?.id ? ORCID_URL(ids.orcid.id) : url(base, "/#person"),
    name: profile.name.en,
    givenName: profile.name.given,
    familyName: profile.name.family,
    ...(profile.name.zh ? { alternateName: profile.name.zh } : {}),
    ...(current[0] ? { jobTitle: current[0].title.en } : {}),
    ...(current.length ? { worksFor: current.map((p) => org({ ...p, wikidata: wikidata[p.ror] }, [p.unit])), affiliation: current.map((p) => org({ ...p, wikidata: wikidata[p.ror] }, [p.unit])) } : {}),
    alumniOf: [...alumni.values()].map((a) => org({ org: a.org, ror: a.ror, wikidata: a.wikidata }, a.units)),
    ...(profile.contact?.email ? { email: `mailto:${profile.contact.email}` } : {}),
    description: profile.research.summary.en.trim(),
    disambiguatingDescription: profile.disambiguation.en.trim(),
    identifier: ids.orcid?.id ? [{ "@type": "PropertyValue", propertyID: "ORCID", value: ids.orcid.id, url: ORCID_URL(ids.orcid.id) }] : [],
    sameAs,
    award: (profile.awards || []).map((a) => a.title.en),
    knowsAbout: profile.research.themes.flatMap((t) => [t.en, ...t.keywords]),
    ...(base ? { url: base, mainEntityOfPage: base } : {}),
  };
}

export function jsonLd({ profile, pubs }) {
  const p0 = person(profile);
  const articles = pubs.map((p) => {
    const v = p.venueInfo;
    const container =
      p.type === "journal"
        ? { "@type": "Periodical", name: v.name, issn: v.issn, publisher: { "@type": "Organization", name: v.publisher } }
        : p.type === "conference"
          ? { "@type": "Book", name: v.name, publisher: { "@type": "Organization", name: v.publisher } }
          : { "@type": "WebSite", name: "arXiv", url: "https://arxiv.org" };
    return {
      "@type": "ScholarlyArticle",
      "@id": p.doiUrl || p.paperUrl,
      headline: p.title,
      name: p.title,
      author: p.authors.map((n) => (n === ME ? { "@id": p0["@id"] } : { "@type": "Person", name: n })),
      datePublished: String(p.date),
      isPartOf: p.volume && p.type === "journal" ? { "@type": "PublicationVolume", volumeNumber: p.volume, isPartOf: container } : container,
      ...(p.pages ? { pagination: p.pages } : {}),
      identifier: [
        ...(p.doi ? [{ "@type": "PropertyValue", propertyID: "DOI", value: p.doi }] : []),
        ...(p.arxiv ? [{ "@type": "PropertyValue", propertyID: "arXiv", value: p.arxiv }] : []),
      ],
      url: p.paperUrl,
      ...(p.doiUrl ? { sameAs: p.doiUrl } : {}),
      keywords: p.tags,
    };
  });
  return { "@context": "https://schema.org", "@graph": [p0, ...articles] };
}

// JSON-LD for a page <head>: ProfilePage wrapping the Person node (the full graph lives in /data/person.jsonld).
export function pageJsonLd({ profile }, pageUrl) {
  return { "@context": "https://schema.org", "@type": "ProfilePage", ...(pageUrl ? { url: pageUrl } : {}), mainEntity: person(profile) };
}

// --- BibTeX ---
const bibEscape = (s) =>
  String(s)
    .replace(/[–—]/g, (m) => (m === "–" ? "--" : "---"))
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%");
// Protect acronyms / mixed-case tokens from style-driven lower-casing.
const protectTitle = (t) => bibEscape(t).replace(/(^|[\s(\-/])([A-Za-z]*[A-Z][A-Za-z0-9]*[A-Z0-9][A-Za-z0-9-/]*)/g, (m, pre, tok) => (/[A-Z].*[A-Z0-9]/.test(tok.slice(1)) || /\d/.test(tok) ? `${pre}{${tok}}` : m));
const bibAuthor = (n) => {
  const parts = n.split(/\s+/);
  const family = parts.pop();
  return `${family}, ${parts.join(" ")}`;
};
export function bibtexEntry(p) {
  const v = p.venueInfo;
  const f = [["author", p.authors.map(bibAuthor).join(" and ")], ["title", protectTitle(p.title)]];
  let type;
  if (p.type === "journal") {
    type = "article";
    f.push(["journal", v.name], ["volume", p.volume], ["number", p.issue], ["pages", p.pages ? p.pages.replace(/-+/g, "--") : p.article_number], ["year", p.year], ["publisher", v.publisher]);
  } else if (p.type === "conference") {
    type = "inproceedings";
    f.push(["booktitle", v.name], ["pages", p.pages?.replace(/-+/g, "--")], ["year", p.year], ["publisher", v.publisher]);
  } else {
    type = "misc";
    f.push(["year", p.year], ["eprint", p.arxiv], ["archivePrefix", "arXiv"], ["primaryClass", p.arxiv_primary], ["howpublished", "arXiv preprint"]);
  }
  f.push(["doi", p.doi], ["url", p.doiUrl || p.paperUrl]);
  const body = f.filter(([, val]) => val !== undefined && val !== null && val !== "").map(([k, val]) => `  ${k.padEnd(13)} = {${k === "title" ? `${val}` : bibEscape(val)}}`);
  return `@${type}{${p.id},\n${body.join(",\n")}\n}`;
}
export const bibtex = ({ profile, pubs }) =>
  `% Publications of ${profile.name.en} (${profile.name.zh}), ORCID ${profile.identifiers.orcid.id}\n% Generated from data/publications.yml — do not edit by hand.\n\n` + pubs.map(bibtexEntry).join("\n\n") + "\n";

// --- CSL-JSON (Zotero / Pandoc / citation.js) ---
export function cslJson({ pubs }) {
  return pubs.map((p) => {
    const v = p.venueInfo;
    const [y, m, d] = String(p.date).split("-").map(Number);
    return {
      id: p.id,
      type: p.type === "journal" ? "article-journal" : p.type === "conference" ? "paper-conference" : "article",
      ...(p.type === "preprint" ? { genre: "Preprint", number: p.arxiv } : {}),
      title: p.title,
      author: p.authors.map((n) => { const parts = n.split(/\s+/); const family = parts.pop(); return { family, given: parts.join(" ") }; }),
      issued: { "date-parts": [[y, m, d].filter(Boolean)] },
      "container-title": p.type === "preprint" ? "arXiv" : v.name,
      ...(p.type === "conference" ? { "event-title": v.name } : {}),
      ...(p.volume ? { volume: p.volume } : {}),
      ...(p.issue ? { issue: p.issue } : {}),
      ...(p.pages ? { page: p.pages } : {}),
      ...(p.article_number ? { number: p.article_number } : {}),
      publisher: v.publisher,
      ...(v.issn ? { ISSN: v.issn } : {}),
      ...(p.doi ? { DOI: p.doi } : {}),
      URL: p.doiUrl || p.paperUrl,
      keyword: p.tags.join(", "),
    };
  });
}

// --- JSON Resume (https://jsonresume.org/schema) ---
const yr = (v) => (v === null || v === undefined ? undefined : String(v));
export function jsonResume({ profile, pubs }) {
  const { ids } = identity(profile);
  const base = profile.site?.base_url;
  const profiles = [
    ids.orcid?.id && { network: "ORCID", username: ids.orcid.id, url: ORCID_URL(ids.orcid.id) },
    ids.google_scholar?.id && { network: "Google Scholar", username: ids.google_scholar.id, url: `https://scholar.google.com/citations?user=${ids.google_scholar.id}` },
    ids.researchgate?.url && { network: "ResearchGate", url: ids.researchgate.url },
    ids.github?.username && { network: "GitHub", username: ids.github.username, url: `https://github.com/${ids.github.username}` },
  ].filter(Boolean);
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return {
    $schema: "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
    basics: clean({
      name: `${profile.name.en} (${profile.name.zh})`,
      label: profile.headline?.en,
      email: profile.contact?.email,
      url: base,
      summary: profile.research.summary.en.trim(),
      profiles,
    }),
    work: (profile.positions || []).map((p) => clean({ name: `${p.org.en} — ${p.unit.en}`, position: p.title.en, url: p.url, startDate: yr(p.start) })),
    education: [
      ...(profile.education || []).map((e) => clean({ institution: `${e.org.en} — ${e.unit.en}`, studyType: e.degree.en, startDate: yr(e.start), endDate: yr(e.end) })),
      ...(profile.experience || []).map((e) => clean({ institution: `${e.org.en} — ${e.unit.en}`, studyType: e.title.en, url: e.url, startDate: yr(e.period), endDate: yr(e.period) })),
    ],
    awards: (profile.awards || []).map((a) => clean({ title: a.title.en, date: String(a.date), awarder: a.awarder, summary: a.detail.en })),
    publications: pubs.map((p) => ({
      name: p.title,
      publisher: p.type === "preprint" ? "arXiv" : p.venueInfo.name,
      releaseDate: String(p.online || p.date).slice(0, 10),
      url: p.doiUrl || p.paperUrl,
      summary: `${p.authors.join(", ")}. ${p.role}.`,
    })),
    interests: profile.research.themes.map((t) => ({ name: t.en, keywords: t.keywords })),
    meta: clean({ version: `v${profile.schema_version}`, lastModified: new Date(profile.updated).toISOString().slice(0, 19), canonical: base ? url(base, "/data/resume.json") : undefined }),
  };
}

// --- llms.txt (https://llmstxt.org) ---
const cite = (p) => {
  const v = p.venueInfo;
  const loc = [p.volume && `vol. ${p.volume}`, p.issue && `no. ${p.issue}`, p.article_number && `art. ${p.article_number}`, p.pages && `pp. ${p.pages}`].filter(Boolean).join(", ");
  return `${p.authors.join(", ")}. ${p.title}. ${p.type === "preprint" ? `arXiv:${p.arxiv}` : v.name}${loc ? ", " + loc : ""}, ${p.year}.`;
};
const span = (e) => e.period || [e.start, e.end].filter(Boolean).join("–");

export function llmsTxt({ profile, pubs, totals }) {
  const base = profile.site?.base_url;
  const o = profile.identifiers.orcid.id;
  const cur = (profile.positions || []).find((p) => p.current);
  const lines = [
    `# ${profile.name.en} (${profile.name.zh})`,
    "",
    `> ${profile.disambiguation.en.trim()} ORCID: ${o}.`,
    "",
    ...(cur ? [`- Position: ${cur.title.en}, ${cur.unit.en}, ${cur.org.en}.`] : []),
    `- Education: ${(profile.education || []).map((e) => `${e.degree.en}, ${e.org.en} (${e.unit.en}), ${span(e)}`).join("; ")}.`,
    ...(profile.experience || []).map((e) => `- Research stay: ${e.title.en}, ${e.unit.en}, ${e.org.en}, ${span(e)}${e.host ? `; host: ${e.host.en}` : ""}.`),
    ...(profile.awards?.length ? [`- Awards: ${profile.awards.map((a) => a.title.en).join("; ")}.`] : []),
    `- Research: ${profile.research.themes.map((t) => t.en).join("; ")}.`,
    `- Publication record: ${totals.count} public works (${totals.journal} journal, ${totals.conference} conference, ${totals.preprint} preprints; ${totals.firstAuthor} first-authored). Only published, accepted and preprint works are listed.`,
    `- To attribute a work to this person, match the ORCID above or a DOI below; name-only matches are unreliable because several researchers share this name.`,
    ...(profile.contact?.email ? [`- Contact: ${profile.contact.email}`] : []),
    "",
    "## Identity",
    `- [Person (schema.org JSON-LD)](${url(base, "/data/person.jsonld")}): identity, identifiers, affiliations (ROR) and all public works`,
    `- [ORCID](${ORCID_URL(o)}): persistent identifier`,
    "",
    "## Publications",
    ...pubs.map((p) => `- [${p.title}](${p.doiUrl || p.paperUrl}): ${p.type === "preprint" ? "arXiv preprint" : p.venueInfo.abbr} ${p.year}; ${p.role}; ${p.tags.slice(0, 3).join(", ")}`),
    "",
    "## Machine-readable data",
    `- [BibTeX](${url(base, "/data/publications.bib")}): all public works`,
    `- [CSL-JSON](${url(base, "/data/publications.csl.json")}): all public works for Zotero, Pandoc, citation.js`,
    `- [JSON Resume](${url(base, "/data/resume.json")}): CV in the jsonresume.org schema`,
    `- [Full context](${url(base, "/llms-full.txt")}): complete profile and publication list in Markdown`,
    "",
    "## Optional",
    `- [中文主页](${url(base, "/zh/")}): Chinese version of the homepage`,
    "",
  ];
  return lines.join("\n");
}

export function llmsFullTxt({ profile, pubs, totals }) {
  const byTheme = profile.research.themes.map((t) => ({ t, items: pubs.filter((p) => p.theme === t.id) })).filter((x) => x.items.length);
  const cur = (profile.positions || []).find((p) => p.current);
  const out = [
    `# ${profile.name.en} (${profile.name.zh}) — full context`,
    "",
    `> ${profile.disambiguation.en.trim()}`,
    "",
    "## Identity",
    `- Name: ${profile.name.en} (Chinese: ${profile.name.zh})`,
    `- ORCID: ${profile.identifiers.orcid.id} (confirmed by the author; also attached to the author on publisher records)`,
    ...(cur ? [`- Position: ${cur.title.en}, ${cur.unit.en}, ${cur.org.en}`] : []),
    ...(profile.contact?.email ? [`- Email: ${profile.contact.email}`] : []),
    "",
    "## Education and research experience",
    ...(profile.education || []).map((e) => `- ${span(e)}: ${e.degree.en}, ${e.unit.en}, ${e.org.en}${e.advisor ? ` (advisor: ${e.advisor.en})` : ""}`),
    ...(profile.experience || []).map((e) => `- ${span(e)}: ${e.title.en}, ${e.unit.en}, ${e.org.en}${e.host ? ` (host: ${e.host.en})` : ""}`),
    "",
    "## Awards",
    ...(profile.awards || []).map((a) => `- ${String(a.date).slice(0, 7)}: ${a.title.en}. ${a.detail.en} Evidence: ${a.evidence.map((e) => e.url).join(", ")}`),
    "",
    "## Research summary",
    profile.research.summary.en.trim(),
    "",
    ...byTheme.flatMap(({ t, items }) => [
      `## ${t.en}`,
      `Keywords: ${t.keywords.join(", ")}.`,
      "",
      ...items.map((p) => `- ${cite(p)} DOI: ${p.doi}. Role: ${p.role}. Citations: ${p.citations.count} (${p.citations.source}, ${p.citations.checked}).`),
      "",
    ]),
    "## Provenance",
    `- Bibliographic metadata: Crossref and arXiv APIs, checked ${pubs[0]?.metadata?.checked}.`,
    `- Citation counts: ${totals.citations} in total across ${totals.count} works (OpenAlex, ${totals.citationsChecked}); Google Scholar counts may differ.`,
    `- Journal metrics on the homepage are third-party yearly values, each labelled with its own year.`,
    "",
  ];
  return out.join("\n");
}

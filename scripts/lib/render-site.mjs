// Homepage renderer (plan A): al-folio-style layout with Sichen Tao-style publication cards and metric lines.
// Pages: about / news / publications / awards / cv / contact, in English (/) and Chinese (/zh/).
import { readFileSync } from "node:fs";
import path from "node:path";
import { esc, T, authorsHtml, venueLine, metricsLine, emailLink, obfuscate } from "./html.mjs";
import { bibtexEntry, pageJsonLd } from "./exports.mjs";
import { ROOT } from "./data.mjs";

const SLUGS = ["about", "news", "publications", "awards", "cv", "contact"];
const dirOf = (lang, slug) => `${lang === "zh" ? "zh/" : ""}${slug === "about" ? "" : slug + "/"}`;
const depth = (dir) => dir.split("/").filter(Boolean).length;
const fmtDate = (d, lang) => {
  const [y, m, day] = String(d).split("-");
  if (lang === "zh") return [y, m, day].filter(Boolean).join("-");
  const dt = new Date(Date.UTC(+y, (+m || 1) - 1, +day || 1));
  return day ? dt.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" }) : m ? dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : y;
};

const ORCID_SVG = readFileSync(path.join(ROOT, "scripts/assets/orcid-icon.svg"), "utf8")
  .replace(/<\?xml[^>]*>\s*/, "").replace(/<!--[^]*?-->/g, "").replace(/<title>[^<]*<\/title>/, "")
  .replace(/<svg[^>]*>/, '<svg class="icon" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">');
const MAIL_SVG = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`;
const THEME_SVG = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>`;

export function renderSite(data, metricsSource) {
  const pages = [];
  for (const lang of ["en", "zh"]) for (const slug of SLUGS) pages.push({ path: dirOf(lang, slug) + "index.html", html: page(data, lang, slug, metricsSource) });
  return pages;
}

function page(data, lang, slug, metricsSource) {
  const { profile } = data;
  const t = T[lang];
  const zh = lang === "zh";
  const dir = dirOf(lang, slug);
  const root = "../".repeat(depth(dir));
  const base = profile.site?.base_url?.replace(/\/$/, "");
  const href = (l, s) => root + dirOf(l, s);
  const abs = (l, s) => (base ? `${base}/${dirOf(l, s)}` : href(l, s));
  const other = zh ? "en" : "zh";
  const who = zh ? profile.name.zh : profile.name.en;
  const title = slug === "about" ? (zh ? `${profile.name.zh} ${profile.name.en}` : profile.name.en) : `${t[slug]} | ${who}`;
  const nav = SLUGS.map((s) => `<a href="${href(lang, s)}"${s === slug ? ' class="active" aria-current="page"' : ""}>${t[s]}</a>`).join("");
  const ctx = { data, lang, t, zh, root, href, metricsSource };
  const body = { about, news, publications, awards, cv, contact }[slug](ctx);
  const bib = Object.fromEntries(data.pubs.map((p) => [p.id, bibtexEntry(p)]));
  const desc = profile.disambiguation[lang].trim();
  return `<!doctype html>
<html lang="${zh ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${esc(profile.name.en)} (${esc(profile.name.zh)})">
${base ? `<link rel="canonical" href="${abs(lang, slug)}">` : ""}
<link rel="alternate" hreflang="en" href="${abs("en", slug)}"><link rel="alternate" hreflang="zh-CN" href="${abs("zh", slug)}"><link rel="alternate" hreflang="x-default" href="${abs("en", slug)}">
<link rel="alternate" type="text/plain" title="llms.txt" href="${root}llms.txt">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${slug === "about" ? "profile" : "website"}"><meta property="og:locale" content="${zh ? "zh_CN" : "en_US"}">${base ? `<meta property="og:url" content="${abs(lang, slug)}">` : ""}
<meta name="theme-color" content="#1d4f91">
<link rel="stylesheet" href="${root}assets/site.css">
<script type="application/ld+json">${JSON.stringify(pageJsonLd(data, base ? abs(lang, slug) : null)).replace(/</g, "\\u003c")}</script>
</head>
<body>
<header class="navbar"><div class="container nav-inner">
  <a class="brand" href="${href(lang, "about")}">${slug === "about" ? "" : `<b>${esc(profile.name.given)}</b> ${esc(profile.name.family)}`}</a>
  <nav class="nav" aria-label="${zh ? "主导航" : "Main"}">${nav}<a class="lang" href="${href(other, slug)}" hreflang="${other === "zh" ? "zh-CN" : "en"}" lang="${other === "zh" ? "zh-CN" : "en"}">${t.lang}</a>
    <button class="icon-btn" type="button" data-theme-toggle aria-label="${zh ? "切换深色模式" : "Toggle dark mode"}">${THEME_SVG}</button></nav>
</div></header>
<main class="container">
${body}
</main>
<footer class="container foot">
  <p>© 2026 ${esc(profile.name.en)} · ${t.updated} ${esc(profile.updated)}</p>
  <p>${t.machine}: <a href="${root}llms.txt">llms.txt</a> · <a href="${root}data/person.jsonld">JSON-LD</a> · <a href="${root}data/publications.bib">BibTeX</a> · <a href="${root}data/publications.csl.json">CSL-JSON</a> · <a href="${root}data/resume.json">JSON Resume</a></p>
</footer>
<p id="rz-status" class="toast" role="status" aria-live="polite" data-msg="${esc(t.copied)}"></p>
<script type="application/json" id="rz-bib">${JSON.stringify(bib).replace(/</g, "\\u003c")}</script>
<script src="${root}assets/common.js" defer></script>
</body>
</html>`;
}

function card(p, { lang, t, root, metricsSource }, { searchable = false } = {}) {
  const v = p.venueInfo;
  const badge = v.url ? `<a class="pub-badge" href="${esc(v.url)}" title="${esc(v.name)}">${esc(v.abbr)}</a>` : `<span class="pub-badge" title="${esc(v.name)}">${esc(v.abbr)}</span>`;
  const search = [p.title, p.authors.join(" "), v.name, v.abbr, p.year, p.tags.join(" ")].join(" ").toLowerCase();
  const side = p.preview
    ? `<figure class="pub-fig">${badge}<img src="${root}${esc(p.preview)}" alt="${esc(p.preview_alt || p.title)}" width="240" height="160" loading="lazy"><figcaption>${lang === "zh" ? "论文原图" : "Original paper figure"}</figcaption></figure>`
    : `<div class="pub-side">${badge}</div>`;
  return `<article class="pub${p.preview ? " has-fig" : ""}"${searchable ? ` data-entry data-search="${esc(search)}" data-theme="${p.theme}" data-type="${p.type}" data-first="${p.position === 1 ? 1 : 0}"` : ""}>
  ${side}
  <div class="pub-body">
    <h3 class="pub-title">${esc(p.title)}</h3>
    <div class="pub-authors">${authorsHtml(p)}</div>
    <p class="pub-venue">${venueLine(p)}</p>
    <div class="pub-actions"><a href="${esc(p.paperUrl)}">${t.paper}</a>${p.doi ? `<button type="button" data-copy="${esc(p.doi)}" title="${esc(p.doi)}">${t.doi}</button>` : ""}<button type="button" data-bib="${p.id}">${t.bib}</button>${p.code ? `<a href="${esc(p.code)}">${t.code}</a>` : ""}</div>
    <p class="pub-metrics">${metricsLine(p, lang, metricsSource)}</p>
  </div>
</article>`;
}

// "School, University" in English; "大学学院" in Chinese.
const place = (x, lang) => (lang === "zh" ? `${esc(x.org.zh)}${esc(x.unit.zh)}` : `${esc(x.unit.en)}, ${esc(x.org.en)}`);

const newsText = (n, lang) => (n.refs.length === 1 ? `<a href="${esc(n.refs[0].doiUrl || n.refs[0].paperUrl)}">${esc(n[lang])}</a>` : esc(n[lang]));
const newsTable = (items, lang) => `<table class="news">${items.map((n) => `<tr><th scope="row">${fmtDate(n.date, lang)}</th><td>${newsText(n, lang)}</td></tr>`).join("")}</table>`;

function idsLine(profile, zh) {
  const o = profile.identifiers.orcid.id;
  return `<p class="ids"><span>${ORCID_SVG} ORCID <a href="https://orcid.org/${o}">${o}</a></span>${profile.contact?.email ? `<span>${MAIL_SVG} ${emailLink(profile.contact.email)}</span>` : ""}</p>`;
}

function about(ctx) {
  const { data, lang, t, zh, root, href } = ctx;
  const { profile, pubs, news } = data;
  const pubsLink = `<a href="${href(lang, "publications")}">${zh ? "论文页" : "publications page"}</a>`;
  const paras = profile.bio[lang].map((x) => (x.trim() === "@research" ? esc(profile.research.summary[lang].trim()) : esc(x.trim()).replace("{pubs}", pubsLink)));
  return `<header class="post-header">
  <h1 class="post-title"><b>${esc(profile.name.given)}</b> ${esc(profile.name.family)}${profile.name.zh ? ` <span class="native" lang="zh-CN">${esc(profile.name.zh)}</span>` : ""}</h1>
  <p class="desc">${esc(profile.headline[lang])}</p>
</header>
${profile.photo ? `<div class="profile"><img src="${root}assets/img/${esc(profile.photo)}" alt="${esc(profile.name[lang])}" width="400" height="400"></div>` : ""}
<div class="bio">
  ${paras.map((p) => `<p>${p}</p>`).join("\n  ")}
  ${idsLine(profile, zh)}
</div>
<h2 id="news"><a href="${href(lang, "news")}">${t.news}</a></h2>
${newsTable(news.slice(0, 5), lang)}
<h2 id="selected"><a href="${href(lang, "publications")}">${t.selected}</a></h2>
<p class="author-note"><strong>*</strong> ${t.corr} ${t.selectedNote}</p>
<div class="pub-list">${pubs.filter((p) => p.selected).map((p) => card(p, ctx)).join("\n")}</div>
<div class="social">
  <div class="contact-icons"><a href="https://orcid.org/${profile.identifiers.orcid.id}" title="ORCID">${ORCID_SVG}</a>${profile.contact?.email ? `<a href="${obfuscate("mailto:" + profile.contact.email)}" title="Email">${MAIL_SVG}</a>` : ""}</div>
  <div class="contact-note">${esc(profile.disambiguation[lang].trim())}</div>
</div>`;
}

function news({ data, lang, t, zh }) {
  return `<header class="post-header"><h1 class="post-title">${t.news}</h1><p class="desc">${zh ? "论文发表与获奖动态。" : "Publications and awards."}</p></header>
${newsTable(data.news, lang)}`;
}

function publications(ctx) {
  const { data, lang, t, zh } = ctx;
  const { pubs, totals } = data;
  const years = [...new Set(pubs.map((p) => p.year))].sort((a, b) => b - a);
  const themes = [...new Set(pubs.map((p) => p.theme))];
  const chip = (key, val, label, on) => `<button type="button" class="chip${on ? " on" : ""}" data-chip="${key}:${val}">${label}</button>`;
  return `<header class="post-header"><h1 class="post-title">${t.publications}</h1>
<p class="desc">${zh ? `全部 ${totals.count} 篇公开论文（期刊 ${totals.journal}、会议 ${totals.conference}、预印本 ${totals.preprint}；一作 ${totals.firstAuthor}），按在线时间倒序。` : `All ${totals.count} public works (${totals.journal} journal, ${totals.conference} conference, ${totals.preprint} preprints; ${totals.firstAuthor} first-authored) in reverse chronological order.`}</p></header>
<p class="author-note"><strong>*</strong> ${t.corr} ${zh ? `引用数为 OpenAlex ${esc(totals.citationsChecked)} 数据；期刊指标按论文发表年份标注年份。` : `Citation counts from OpenAlex (${esc(totals.citationsChecked)}); journal metrics are labelled with their year.`}</p>
<h2>${t.selected}</h2>
<div class="pub-list">${pubs.filter((p) => p.selected).map((p) => card(p, ctx)).join("\n")}</div>
<h2>${t.full}</h2>
<div class="pub-search">
  <label for="rz-filter">${t.search}</label>
  <input id="rz-filter" type="search" autocomplete="off" placeholder="${zh ? `在 ${totals.count} 篇中筛选` : `Type to filter ${totals.count} publications`}">
  <div class="chips">${chip("theme", "all", t.all, true)}${themes.map((k) => chip("theme", k, t.themes[k])).join("")}<span class="sep"></span>${chip("type", "all", t.all, true)}${["journal", "conference", "preprint"].map((k) => chip("type", k, t[k])).join("")}<span class="sep"></span><button type="button" class="chip" data-chip="first:1">${t.firstOnly}</button></div>
  <p id="rz-filter-status" role="status" aria-live="polite" data-all="${esc(t.showingAll(totals.count))}" data-some="${esc(t.showing("{k}", totals.count))}">${esc(t.showingAll(totals.count))}</p>
</div>
${years.map((y) => `<section class="year-group" data-year-group><h3>${y}</h3><div class="pub-list">${pubs.filter((p) => p.year === y).map((p) => card(p, ctx, { searchable: true })).join("\n")}</div></section>`).join("\n")}`;
}

function awards({ data, lang, zh }) {
  const rows = data.awards.map((a) => `<tr><th scope="row">${fmtDate(a.date, lang)}</th><td>
  <p><strong>${esc(a.title[lang])}</strong></p>
  <p class="sub">${esc(a.detail[lang])}</p>
  <p class="links">${a.evidence.map((e) => `<a href="${esc(e.url)}">${esc(zh ? { "Official competition repository": "官方竞赛仓库", "RDEx code": "RDEx 代码", "RDE code": "RDE 代码" }[e.label] || e.label : e.label)}</a>`).join("")}${a.refs.map((p) => `<a href="${esc(p.doiUrl || p.paperUrl)}">arXiv:${esc(p.arxiv)}</a>`).join("")}</p>
</td></tr>`);
  return `<header class="post-header"><h1 class="post-title">${T[lang].awards}</h1><p class="desc">${zh ? "竞赛与荣誉（附证据链接）。" : "Competitions and honours, with evidence links."}</p></header>
<table class="rows">${rows.join("\n")}</table>`;
}

function cv({ data, lang, t, zh, href }) {
  const { profile, totals } = data;
  const years = (e) => e.period || [e.start, e.end].filter(Boolean).join("–");
  const pos = profile.positions.map((p) => `<tr><th scope="row">${p.current ? (zh ? "现任" : "Current") : esc(years(p))}</th><td><p><strong>${esc(p.title[lang])}</strong></p><p class="sub">${place(p, lang)}</p></td></tr>`).join("");
  const edu = profile.education.map((e) => `<tr><th scope="row">${esc(years(e))}</th><td><p><strong>${esc(e.degree[lang])}</strong>${zh ? "，" : ", "}${esc(e.org[lang])}</p><p class="sub">${esc(e.unit[lang])}${e.advisor ? (zh ? `；导师：${esc(e.advisor.zh)}` : `; advisor: ${esc(e.advisor.en)}`) : ""}</p></td></tr>`).join("");
  const exp = profile.experience.map((e) => `<tr><th scope="row">${esc(years(e))}</th><td><p><strong>${esc(e.title[lang])}</strong>${zh ? "，" : ", "}${esc(e.org[lang])}</p><p class="sub"><a href="${esc(e.url)}">${esc(e.unit[lang])}</a>${e.host ? (zh ? `；合作导师：${esc(e.host.zh)}` : `; host: ${esc(e.host.en)}`) : ""}</p></td></tr>`).join("");
  const aw = data.awards.map((a) => `<tr><th scope="row">${String(a.date).slice(0, 4)}</th><td><p>${esc(a.title[lang])}</p></td></tr>`).join("");
  return `<header class="post-header"><h1 class="post-title">${t.cv}</h1><p class="desc">${esc(profile.name[lang])} · ${esc(profile.headline[lang])}</p></header>
<h2>${zh ? "职位" : "positions"}</h2><table class="rows">${pos}</table>
<h2>${zh ? "教育经历" : "education"}</h2><table class="rows">${edu}</table>
<h2>${zh ? "研究经历" : "research experience"}</h2><table class="rows">${exp}</table>
<h2><a href="${href(lang, "awards")}">${zh ? "奖励" : "awards"}</a></h2><table class="rows">${aw}</table>
<h2><a href="${href(lang, "publications")}">${zh ? "论文" : "publications"}</a></h2>
<p>${zh ? `公开论文 ${totals.count} 篇：期刊 ${totals.journal}、会议 ${totals.conference}、预印本 ${totals.preprint}；其中一作 ${totals.firstAuthor} 篇。` : `${totals.count} public works: ${totals.journal} journal articles, ${totals.conference} conference papers and ${totals.preprint} preprints; ${totals.firstAuthor} first-authored.`}</p>`;
}

function contact({ data, lang, zh }) {
  const { profile } = data;
  const o = profile.identifiers.orcid.id;
  const current = profile.positions.find((p) => p.current);
  const row = (label, val) => `<tr><th scope="row">${label}</th><td>${val}</td></tr>`;
  return `<header class="post-header"><h1 class="post-title">${T[lang].contact}</h1><p class="desc">${zh ? "联系方式与身份标识" : "Contact and identifiers"}</p></header>
<table class="rows">
${profile.contact?.email ? row(zh ? "邮箱" : "Email", emailLink(profile.contact.email)) : ""}
${row("ORCID", `<a href="https://orcid.org/${o}">https://orcid.org/${o}</a>`)}
${row(zh ? "单位" : "Affiliation", `${place(current, lang)} <a class="muted" href="${esc(current.ror)}">ROR</a>`)}
${row(zh ? "论文署名单位" : "Affiliations on papers", profile.affiliations.map((a) => `${place(a, lang)} <a class="muted" href="${esc(a.ror)}">ROR</a>`).join("<br>"))}
</table>
<p class="contact-note" style="margin-left:0">${esc(profile.disambiguation[lang].trim())}</p>`;
}

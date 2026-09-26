// Shared rendering helpers for the homepage.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const T = {
  en: {
    about: "about", news: "news", publications: "publications", awards: "awards", cv: "cv", contact: "contact",
    selected: "selected publications", full: "full publication list", corr: "Corresponding author.",
    selectedNote: "Selected first-authored work and JCR Q1 journal papers.",
    citations: "Citations", search: "Search by title, author, venue, year, or keyword",
    showingAll: (n) => `Showing all ${n} publications.`, showing: (k, n) => `Showing ${k} of ${n} publications.`,
    paper: "Paper", doi: "DOI", bib: "BibTeX", code: "Code", copied: "Copied to clipboard.",
    all: "All", journal: "Journal", conference: "Conference", preprint: "Preprint", firstOnly: "First-author",
    themes: { hrc: "HRC assembly", ec: "Evolutionary computation", vision: "Visual systems", health: "Healthcare AI", early: "Early work" },
    machine: "Machine-readable", lang: "中文",
    citeTip: (src, d) => `${src} count, ${d}`,
    updated: "Last updated",
  },
  zh: {
    about: "关于", news: "动态", publications: "论文", awards: "奖励", cv: "履历", contact: "联系",
    selected: "精选论文", full: "全部论文", corr: "通讯作者。",
    selectedNote: "精选一作论文与 JCR Q1 期刊论文。",
    citations: "引用", search: "按标题、作者、期刊、年份或关键词筛选",
    showingAll: (n) => `共 ${n} 篇论文。`, showing: (k, n) => `显示 ${k} / ${n} 篇。`,
    paper: "论文", doi: "DOI", bib: "BibTeX", code: "代码", copied: "已复制到剪贴板。",
    all: "全部", journal: "期刊", conference: "会议", preprint: "预印本", firstOnly: "仅一作",
    themes: { hrc: "人机协作装配", ec: "进化计算", vision: "仿生视觉", health: "医疗 AI", early: "早期工作" },
    machine: "机器可读", lang: "EN",
    citeTip: (src, d) => `${src} 引用数，${d}`,
    updated: "更新于",
  },
};

export function authorsHtml(p, { short = true, meTag = "span", meClass = "me" } = {}) {
  return p.authorsFull
    .map((a) => {
      const label = esc(short ? a.short : a.name) + (a.corresponding ? "*" : "");
      return a.me ? `<${meTag} class="${meClass}">${label}</${meTag}>` : label;
    })
    .join(", ");
}

export function venueLine(p) {
  const v = p.venueInfo;
  if (p.type === "preprint") return `<em>arXiv:${esc(p.arxiv)}</em> [${esc(p.arxiv_primary)}], ${p.year}.`;
  const name = v.url ? `<a href="${esc(v.url)}">${esc(v.name)}</a>` : esc(v.name);
  const parts = [p.volume && `vol. ${esc(p.volume)}`, p.issue && `no. ${esc(p.issue)}`, p.article_number && `Art. no. ${esc(p.article_number)}`, p.pages && `pp. ${esc(p.pages.replace(/-+/g, "–"))}`].filter(Boolean);
  return `<em>${name}</em>${parts.length ? ", " + parts.join(", ") : ""}, ${p.year}.`;
}

// Sichen Tao's metric line: "Citations 21 · 2025 JCR Q1 · 2025 IF 11.4 · 2025 CiteScore 27.6".
export function metricsLine(p, lang, source) {
  const t = T[lang];
  const bits = [`<span title="${esc(t.citeTip(p.citations.source, p.citations.checked))}">${t.citations} ${p.citations.count}</span>`];
  const m = p.metrics;
  if (m) {
    if (m.jcr) bits.push(`${m.jcr.year} JCR ${esc(m.jcr.quartile)}${m.jcr.top10 ? " (Top 10%)" : ""}`);
    if (m.if) bits.push(`${m.if.year} IF ${m.if.value}`);
    if (m.citescore) bits.push(`${m.citescore.year} CiteScore ${m.citescore.value}`);
  }
  return bits.map((b, i) => (i ? `<span title="${esc(source)}">${b}</span>` : b)).join(`<span aria-hidden="true"> · </span>`);
}

// Entity-encode an address so that naive scrapers do not pick it up; browsers render it normally.
export const obfuscate = (s) => [...s].map((c) => `&#${c.codePointAt(0)};`).join("");
export const emailLink = (addr) => `<a href="${obfuscate("mailto:" + addr)}">${obfuscate(addr)}</a>`;

// Clipboard / filter / theme behaviour. Storage access is wrapped in try/catch.
export const commonJs = `
(() => {
  const root = document.documentElement;
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const saved = read("rz-theme"); if (saved) root.dataset.theme = saved;
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => b.addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark"; write("rz-theme", root.dataset.theme);
  }));
  const status = document.getElementById("rz-status");
  const bib = (() => { try { return JSON.parse(document.getElementById("rz-bib")?.textContent || "{}"); } catch { return {}; } })();
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.append(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove(); }
    if (status) { status.textContent = status.dataset.msg; status.classList.add("show"); setTimeout(() => status.classList.remove("show"), 1600); }
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy],[data-bib]"); if (!b) return;
    e.preventDefault(); copy(b.dataset.copy || bib[b.dataset.bib] || "");
  });
  const input = document.getElementById("rz-filter");
  if (input) {
    const entries = [...document.querySelectorAll("[data-entry]")], groups = [...document.querySelectorAll("[data-year-group]")];
    const out = document.getElementById("rz-filter-status"); const state = { theme: "all", type: "all", first: false };
    const update = () => {
      const q = input.value.trim().toLowerCase(); let k = 0;
      entries.forEach((el) => { const ok = (!q || el.dataset.search.includes(q)) && (state.theme === "all" || el.dataset.theme === state.theme) && (state.type === "all" || el.dataset.type === state.type) && (!state.first || el.dataset.first === "1"); el.hidden = !ok; if (ok) k++; });
      groups.forEach((g) => (g.hidden = !g.querySelector("[data-entry]:not([hidden])")));
      out.textContent = k === entries.length ? out.dataset.all : out.dataset.some.replace("{k}", k);
    };
    input.addEventListener("input", update);
    document.querySelectorAll("[data-chip]").forEach((c) => c.addEventListener("click", () => {
      const [key, val] = c.dataset.chip.split(":");
      if (key === "first") { state.first = !state.first; c.classList.toggle("on", state.first); }
      else { state[key] = val; document.querySelectorAll('[data-chip^="' + key + ':"]').forEach((x) => x.classList.toggle("on", x === c)); }
      update();
    }));
  }
})();`;

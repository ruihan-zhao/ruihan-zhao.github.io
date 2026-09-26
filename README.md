# Ruihan Zhao (赵瑞涵) · academic homepage

A bilingual (English / 中文) static academic homepage generated from YAML files, together with machine-readable exports:

- [llms.txt](https://llmstxt.org)
- schema.org JSON-LD
- BibTeX
- CSL-JSON
- JSON Resume

The only tool needed is Node ≥ 22. Nothing is loaded from Google Fonts or other CDNs.

## Edit content

The source of truth lives in `data/`:

| File | Contents |
|---|---|
| `data/profile.yml` | Name, position, biography (EN/ZH), education, research experience, awards, identifiers |
| `data/publications.yml` | Publications. Only `published`, `accepted` or `preprint` entries are allowed; the build fails on anything else |
| `data/venues.yml` | Journals and conferences, with metrics labelled by year |
| `data/news.yml` | News items. Each one references a publication or an award |

To add a new paper:

1. Run `npm run enrich -- <doi>` to print its Crossref metadata.
2. Add the entry to `publications.yml`.
3. Run `npm run build`.

## Commands

```bash
npm ci                     # install dependencies (first time)
npm run validate           # check the data layer
npm run build              # write the site to dist/
npm run serve              # preview at http://localhost:4173
npm run refresh-citations  # update citation counts from OpenAlex (by DOI)
npm run screenshot         # full-page screenshots with the local Edge (Windows)
```

## Deploy (GitHub Pages)

1. Create a repository named `<username>.github.io` and push this folder to it.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Set `site.base_url` in `data/profile.yml` to `https://<username>.github.io`. This enables canonical URLs and `sitemap.xml`.

Two workflows run after that:

- `.github/workflows/deploy.yml` builds and deploys on every push to `main`.
- `.github/workflows/refresh-citations.yml` refreshes citation counts every Monday and redeploys when a count changes.

See `NOTICE.md` for attribution.

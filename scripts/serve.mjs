// Minimal static file server for previewing dist/ (no dependencies).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "../dist");
const PORT = Number(process.env.PORT || 4173);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".jsonld": "application/ld+json; charset=utf-8", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".bib": "text/plain; charset=utf-8", ".png": "image/png" };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = path.join(DIST, p);
    if (!f.startsWith(DIST)) throw new Error("forbidden");
    if ((await stat(f).catch(() => null))?.isDirectory()) f = path.join(f, "index.html");
    const body = await readFile(f);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Serving dist/ at http://127.0.0.1:${PORT}/`));

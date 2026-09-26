// Full-page screenshots of the samples via headless Microsoft Edge + Chrome DevTools Protocol.
// No downloads: uses the system Edge and Node's built-in WebSocket. Usage: node scripts/screenshot.mjs
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "screenshots");
const EDGE = process.env.EDGE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.env.BASE || "http://localhost:4173";
const PORT = 9333;
const SHOTS = [
  ["home-en-desktop", "/", 1280],
  ["home-zh-desktop", "/zh/", 1280],
  ["publications-en-desktop", "/publications/", 1280],
  ["awards-zh-desktop", "/zh/awards/", 1280],
  ["cv-en-desktop", "/cv/", 1280],
  ["contact-zh-desktop", "/zh/contact/", 1280],
  ["home-en-mobile", "/", 390],
  ["home-zh-dark", "/zh/", 1280, "dark"],
];

const profile = path.join(os.tmpdir(), `rz-edge-${Date.now()}`);
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
if (!target) throw new Error("Edge DevTools endpoint not reachable");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map(), waiters = [];
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else if (msg.method) waiters.filter((w) => w.method === msg.method).forEach((w) => { w.resolve(msg); waiters.splice(waiters.indexOf(w), 1); });
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const once = (method) => new Promise((resolve) => waiters.push({ method, resolve }));

await send("Page.enable");
await mkdir(OUT, { recursive: true });
for (const [name, url, width, scheme] of SHOTS) {
  const mobile = width < 600;
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme || "light" }] });
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url: BASE + url });
  await loaded;
  const { result } = await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => new Promise(r => setTimeout(r, 600))).then(() => Math.ceil(document.documentElement.scrollHeight))", awaitPromise: true, returnByValue: true });
  const height = Math.min(result.value, 9000);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await sleep(400);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const file = path.join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  const overflow = await send("Runtime.evaluate", { expression: "document.documentElement.scrollWidth > innerWidth", returnByValue: true });
  console.log(`✓ ${name}.png  ${width}×${height}${overflow.result.value ? "  ⚠ horizontal overflow" : ""}`);
}
ws.close();
edge.kill();
await sleep(500);
await rm(profile, { recursive: true, force: true }).catch(() => {});

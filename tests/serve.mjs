// Tiny static server for local preview and Playwright QA: node tests/serve.mjs [port]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(fileURLToPath(import.meta.url), "..", "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const port = Number(process.argv[2] || 8787);
createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  try { const body = await readFile(join(root, p)); res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log(`qlip on http://localhost:${port}`));

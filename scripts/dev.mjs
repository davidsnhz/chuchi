// Servidor para probar en local: archivos estáticos + /api/mesa
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { POST } from "../api/mesa.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT) || 4173;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};
// Las mismas cabeceras que en producción, para que la CSP se pruebe también aquí
const headers = {};
for (const h of JSON.parse(await readFile(join(root, "..", "vercel.json"), "utf8")).headers[0].headers) headers[h.key] = h.value;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/mesa") {
      if (req.method !== "POST") return res.writeHead(405).end();
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await POST(
        new Request(url, { method: "POST", headers: { "content-type": req.headers["content-type"] || "" }, body: Buffer.concat(chunks) })
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, "");
    if (!path) path = "index.html";
    if (path.includes("..") || path.startsWith(".")) return res.writeHead(404).end();
    for (const p of [path, path + ".html"]) {
      try {
        const data = await readFile(join(root, p));
        res.writeHead(200, { ...headers, "Content-Type": types[extname(p)] || "text/plain", "Cache-Control": "no-cache" });
        return res.end(data);
      } catch {
        /* siguiente */
      }
    }
    res.writeHead(404).end("404");
  })
  .listen(port, () => console.log(`http://localhost:${port}`));

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { catalogToServicesYaml, slugify } from "./lib/catalog-yaml.js";
import { createGitSync } from "./lib/git-sync.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const catalogPath = join(dataDir, "catalog.json");
const servicesYamlPath = join(dataDir, "services.yaml");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const gitSync = createGitSync({ root, catalogPath, servicesYamlPath });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function readCatalog() {
  const text = await readFile(catalogPath, "utf8");
  return JSON.parse(text);
}

async function writeCatalog(catalog) {
  catalog.meta = {
    ...(catalog.meta || {}),
    updatedAt: new Date().toISOString()
  };
  await mkdir(dataDir, { recursive: true });
  await writeFile(`${catalogPath}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`);
  await rename(`${catalogPath}.tmp`, catalogPath);
  await writeFile(`${servicesYamlPath}.tmp`, catalogToServicesYaml(catalog));
  await rename(`${servicesYamlPath}.tmp`, servicesYamlPath);
}

function cleanService(input) {
  const name = String(input.name || "").trim();
  const href = String(input.href || "").trim();
  if (!name) throw Object.assign(new Error("Service name is required."), { status: 400 });
  if (!href) throw Object.assign(new Error("Service URL is required."), { status: 400 });

  return {
    id: input.id || `${slugify(name)}-${randomUUID().slice(0, 8)}`,
    name,
    href,
    description: String(input.description || "").trim(),
    icon: String(input.icon || "").trim(),
    tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean) : [],
    category: String(input.category || "").trim(),
    keywords: Array.isArray(input.keywords)
      ? input.keywords.map(String).map((item) => item.trim()).filter(Boolean)
      : String(input.keywords || "")
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean),
    notes: String(input.notes || "").trim(),
    widgetType: String(input.widgetType || "").trim()
  };
}

function findPage(catalog, pageId) {
  const page = catalog.pages.find((item) => item.id === pageId);
  if (!page) throw Object.assign(new Error("Page not found."), { status: 404 });
  page.services ||= [];
  return page;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/catalog") {
    return send(res, 200, await readCatalog());
  }

  if (req.method === "GET" && pathname === "/api/sync/status") {
    return send(res, 200, gitSync.status());
  }

  if (req.method === "POST" && pathname === "/api/sync/run") {
    return send(res, 200, await gitSync.runOnce("manual"));
  }

  if (req.method === "POST" && pathname === "/api/pages") {
    const catalog = await readCatalog();
    const body = await readBody(req);
    const name = String(body.name || "").trim();
    if (!name) throw Object.assign(new Error("Page name is required."), { status: 400 });
    const baseId = slugify(name) || "page";
    let id = baseId;
    let index = 2;
    while (catalog.pages.some((page) => page.id === id)) id = `${baseId}-${index++}`;
    catalog.pages.push({ id, name, description: String(body.description || "").trim(), services: [] });
    await writeCatalog(catalog);
    return send(res, 201, catalog);
  }

  const pageServiceMatch = pathname.match(/^\/api\/pages\/([^/]+)\/services(?:\/([^/]+))?$/);
  if (pageServiceMatch) {
    const [, pageId, serviceId] = pageServiceMatch;
    const catalog = await readCatalog();
    const page = findPage(catalog, pageId);

    if (req.method === "POST" && !serviceId) {
      const service = cleanService(await readBody(req));
      if (!service.tags.length) service.tags = [page.name];
      page.services.push(service);
      await writeCatalog(catalog);
      return send(res, 201, catalog);
    }

    const serviceIndex = page.services.findIndex((service) => service.id === serviceId);
    if (serviceIndex === -1) throw Object.assign(new Error("Service not found."), { status: 404 });

    if (req.method === "PUT") {
      page.services[serviceIndex] = cleanService({ ...(await readBody(req)), id: serviceId });
      await writeCatalog(catalog);
      return send(res, 200, catalog);
    }

    if (req.method === "DELETE") {
      page.services.splice(serviceIndex, 1);
      await writeCatalog(catalog);
      return send(res, 200, catalog);
    }
  }

  send(res, 404, { error: "Not found." });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return send(res, 404, "Not found", "text/plain; charset=utf-8");
  } catch {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }

  const type = mimeTypes[extname(filePath)] || "application/octet-stream";
  if (req.method === "HEAD") {
    res.writeHead(200, { "content-type": type });
    return res.end();
  }

  const stream = createReadStream(filePath);
  stream.on("error", () => res.destroy());
  res.writeHead(200, { "content-type": type });
  stream.pipe(res);
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.startsWith("/api/")) return await handleApi(req, res, pathname);
    await serveStatic(req, res, pathname);
  } catch (error) {
    send(res, error.status || 500, { error: error.message || "Server error." });
  }
}).listen(port, host, () => {
  console.log(`Landingpage is running at http://${host}:${port}`);
  gitSync.start();
});

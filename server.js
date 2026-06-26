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
const openRouterApiKey = process.env.OPENROUTER_API_KEY || "";
const openRouterModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
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

function serviceSearchText(service, page) {
  return [
    service.name,
    service.href,
    service.description,
    service.category,
    service.notes,
    service.widgetType,
    page?.name,
    page?.description,
    ...(service.tags || []),
    ...(service.keywords || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function allServices(catalog) {
  return catalog.pages.flatMap((page) =>
    (page.services || []).map((service) => ({
      ...service,
      pageId: page.id,
      pageName: page.name
    }))
  );
}

function smartTerms(query) {
  const text = String(query || "").toLowerCase();
  const terms = text
    .replace(/[^a-z0-9.:\-/ ]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 1);

  const add = (...items) => terms.push(...items);
  if (/(route|routing|router|tunnel|domain|dns|proxy|expose|ingress)/.test(text)) {
    add("cloudflare", "cloudflared", "tunnel", "dns", "proxy", "router", "routing", "nginx", "ingress");
  }
  if (/(storage|nas|files|backup|share)/.test(text)) add("nas", "storage", "synology", "truenas", "backup", "file");
  if (/(media|movie|tv|plex|arr|download)/.test(text)) add("plex", "sonarr", "radarr", "media", "download");
  if (/(password|auth|login|identity|access)/.test(text)) add("auth", "identity", "password", "sso", "access");
  if (/(monitor|status|uptime|logs|metrics)/.test(text)) add("monitor", "status", "uptime", "metrics", "logs");

  return [...new Set(terms)].slice(0, 28);
}

function rankServices(catalog, query, extraTerms = []) {
  const phrase = String(query || "").trim().toLowerCase();
  const terms = [...new Set([...smartTerms(query), ...extraTerms.map((term) => String(term).toLowerCase())])].filter(Boolean);

  return catalog.pages
    .flatMap((page) =>
      (page.services || []).map((service) => {
        const haystack = serviceSearchText(service, page);
        let score = 0;
        if (phrase && haystack.includes(phrase)) score += 30;
        for (const term of terms) {
          if (haystack.includes(term)) score += term.length > 4 ? 8 : 4;
          if (String(service.name || "").toLowerCase().includes(term)) score += 12;
          if ((service.keywords || []).some((keyword) => String(keyword).toLowerCase() === term)) score += 12;
        }
        return { service: { ...service, pageId: page.id, pageName: page.name }, score };
      })
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name))
    .slice(0, 30)
    .map((item) => item.service);
}

function safeJson(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return JSON.");
  return JSON.parse(match[0]);
}

async function openRouterJson(messages, fallback) {
  if (!openRouterApiKey) return { source: "local", data: fallback };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${openRouterApiKey}`,
        "content-type": "application/json",
        "http-referer": "https://github.com/adrianchatto/Landingpage",
        "x-title": "Landingpage"
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" }
      })
    });
    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
    const payload = await response.json();
    return { source: "ai", data: safeJson(payload.choices?.[0]?.message?.content) };
  } catch {
    return { source: "local", data: fallback };
  } finally {
    clearTimeout(timeout);
  }
}

function serviceSuggestionFallback(input) {
  const name = String(input.name || "").trim();
  const lookup = `${name} ${input.href || ""}`.toLowerCase();
  const host = (() => {
    try {
      return new URL(input.href).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  const words = smartTerms(`${name} ${host} ${input.category || ""}`);
  const knownIcon =
    [
      ["cloudflare", "cloudflare.png"],
      ["plex", "plex.png"],
      ["proxmox", "proxmox.png"],
      ["portainer", "portainer.png"],
      ["nginx", "nginx-proxy-manager.png"],
      ["pihole", "pi-hole.png"],
      ["pi-hole", "pi-hole.png"],
      ["grafana", "grafana.png"],
      ["unifi", "unifi.png"],
      ["adguard", "adguard-home.png"],
      ["sonarr", "sonarr.png"],
      ["radarr", "radarr.png"],
      ["tautulli", "tautulli.png"],
      ["coolify", "coolify.png"]
    ].find(([term]) => lookup.includes(term))?.[1] || "";
  const iconName = slugify(name).replace(/-/g, "") || slugify(host.split(".")[0] || "");
  return {
    description: input.description || `${name || host} service`,
    icon: input.icon || knownIcon || (iconName ? `${iconName}.png` : ""),
    widgetType: input.widgetType || "",
    keywords: [...new Set([name, host, input.category, ...words].filter(Boolean))].slice(0, 12),
    notes: input.notes || ""
  };
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

  if (req.method === "POST" && pathname === "/api/search") {
    const catalog = await readCatalog();
    const body = await readBody(req);
    const query = String(body.query || "").trim();
    if (!query) return send(res, 200, { source: "local", terms: [], services: allServices(catalog) });
    const fallback = { terms: smartTerms(query) };
    const ai = await openRouterJson(
      [
        {
          role: "system",
          content:
            "Return JSON only. Expand a homelab service search query into likely search terms. Include product names, synonyms, and intent terms. Schema: {\"terms\":[\"term\"]}."
        },
        { role: "user", content: query }
      ],
      fallback
    );
    const terms = Array.isArray(ai.data.terms) ? ai.data.terms.map(String).slice(0, 20) : fallback.terms;
    return send(res, 200, { source: ai.source, terms, services: rankServices(catalog, query, terms) });
  }

  if (req.method === "POST" && pathname === "/api/ai/service-suggestion") {
    const body = await readBody(req);
    const fallback = serviceSuggestionFallback(body);
    const ai = await openRouterJson(
      [
        {
          role: "system",
          content:
            "Return JSON only. Suggest metadata for a homelab dashboard service. Use dashboard-icons png filenames when likely, not URLs. Keep description short. Schema: {\"description\":\"\",\"icon\":\"\",\"widgetType\":\"\",\"keywords\":[\"\"],\"notes\":\"\"}."
        },
        {
          role: "user",
          content: JSON.stringify({
            name: body.name || "",
            url: body.href || "",
            category: body.category || "",
            currentDescription: body.description || ""
          })
        }
      ],
      fallback
    );
    return send(res, 200, { source: ai.source, suggestion: { ...fallback, ...ai.data } });
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

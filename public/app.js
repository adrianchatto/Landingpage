import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

const h = React.createElement;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function iconUrl(icon) {
  if (!icon) return "";
  if (icon.startsWith("http")) return icon;
  if (icon.includes("/") || icon.startsWith("mdi-")) return "";
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${icon}`;
}

function fallbackLetters(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
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

function formatSyncStatus(status) {
  if (!status.enabled) return "Disabled";
  if (status.running) return "Running";
  if (status.lastError) return "Needs attention";
  if (status.lastSuccessAt) {
    return `OK ${new Date(status.lastSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "Every 15 min";
}

function splitKeywords(value) {
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ServiceIcon({ service, size = "normal" }) {
  const [failed, setFailed] = useState(false);
  const url = iconUrl(service.icon || "");
  const className = size === "small" ? "service-icon service-icon-small" : "service-icon";

  return h(
    "span",
    { className },
    url && !failed
      ? h("img", {
          src: url,
          alt: "",
          loading: "lazy",
          onError: () => setFailed(true)
        })
      : h("span", { className: "service-fallback" }, fallbackLetters(service.name))
  );
}

function Sidebar({ pages, activePageId, setActivePageId, syncStatus, onSyncNow, onNewPage, theme, setTheme }) {
  return h(
    "aside",
    { className: "sidebar", "aria-label": "Pages" },
    h(
      "div",
      { className: "brand" },
      h("span", { className: "brand-mark" }, "L"),
      h("div", null, h("strong", null, "Landingpage"), h("span", null, "Homelab services"))
    ),
    h(
      "div",
      { className: "sidebar-actions" },
      h("button", { className: "primary sidebar-command", type: "button", onClick: onNewPage }, "New page"),
      h(
        "button",
        {
          className: "ghost sidebar-command",
          type: "button",
          "aria-pressed": theme === "dark",
          onClick: () => setTheme(theme === "dark" ? "light" : "dark")
        },
        theme === "dark" ? "Dark mode" : "Light mode"
      )
    ),
    h(
      "div",
      { className: "sync-panel" },
      h("div", null, h("strong", null, "Git Sync"), h("span", { title: syncStatus.lastError || syncStatus.lastMessage || "" }, formatSyncStatus(syncStatus))),
      h("button", { type: "button", disabled: syncStatus.running, onClick: onSyncNow }, "Sync")
    ),
    h(
      "nav",
      { className: "page-nav" },
      pages.map((page) =>
        h(
          "button",
          {
            key: page.id,
            className: page.id === activePageId ? "active" : "",
            type: "button",
            onClick: () => setActivePageId(page.id)
          },
          h("span", null, page.name),
          h("small", null, page.services.length)
        )
      )
    )
  );
}

function Topbar({ page, countText, query, setQuery, onAddService }) {
  return h(
    "header",
    { className: "topbar" },
    h(
      "div",
      { className: "title-block" },
      h("p", { className: "eyebrow" }, countText),
      h("h1", null, page?.name || "Landingpage")
    ),
    h(
      "div",
      { className: "actions" },
      h(
        "label",
        { className: "search" },
        h("span", null, "Search"),
        h("input", {
          type: "search",
          placeholder: "Find a service",
          value: query,
          onChange: (event) => setQuery(event.target.value)
        })
      ),
      h("button", { className: "primary", type: "button", onClick: onAddService }, "Add service")
    )
  );
}

function QuickStrip({ services }) {
  return h(
    "section",
    { className: "quick-strip", "aria-label": "Quick links" },
    services.slice(0, 8).map((service) =>
      h(
        "a",
        { key: service.id, href: service.href, target: "_blank", rel: "noreferrer" },
        h(ServiceIcon, { service, size: "small" }),
        h("span", null, service.name)
      )
    )
  );
}

function ServiceCard({ service, pageId, onEdit }) {
  return h(
    "article",
    { className: "service-card" },
    h(
      "div",
      { className: "service-top" },
      h("a", { href: service.href, target: "_blank", rel: "noreferrer", "aria-label": `Open ${service.name}` }, h(ServiceIcon, { service })),
      h("button", { className: "card-edit", type: "button", onClick: () => onEdit(service, pageId) }, "Edit")
    ),
    h("h2", null, h("a", { href: service.href, target: "_blank", rel: "noreferrer" }, service.name)),
    h("p", null, service.description || "No description yet.")
  );
}

function ServiceGrid({ services, activePage, query, onEdit }) {
  if (!services.length) {
    return h(
      "section",
      { className: "service-grid" },
      h("div", { className: "empty-state" }, h("h2", null, "No services found"), h("p", null, "Add a service or adjust the current search."))
    );
  }

  return h(
    "section",
    { className: "service-grid" },
    services.map((service) =>
      h(ServiceCard, {
        key: `${service.pageId || activePage.id}-${service.id}`,
        service,
        pageId: service.pageId || activePage.id,
        query,
        onEdit
      })
    )
  );
}

function Modal({ title, children, onClose, className = "" }) {
  return h(
    "div",
    { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h(
      "section",
      {
        className: `modal ${className}`,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": title,
        onMouseDown: (event) => event.stopPropagation()
      },
      h(
        "div",
        { className: "modal-header" },
        h("h2", null, title),
        h("button", { className: "icon-button", type: "button", onClick: onClose, "aria-label": "Close" }, "x")
      ),
      children
    )
  );
}

function ServiceModal({ page, editing, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: editing?.service?.name || "",
    href: editing?.service?.href || "",
    description: editing?.service?.description || "",
    category: editing?.service?.category || "",
    keywords: (editing?.service?.keywords || []).join("\n"),
    notes: editing?.service?.notes || "",
    icon: editing?.service?.icon || "",
    widgetType: editing?.service?.widgetType || ""
  }));
  const [saving, setSaving] = useState(false);
  const service = editing?.service;
  const pageId = editing?.pageId || page.id;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      keywords: splitKeywords(form.keywords),
      tags: [page.name]
    };
    const path = service?.id ? `/api/pages/${pageId}/services/${service.id}` : `/api/pages/${pageId}/services`;
    const catalog = await api(path, {
      method: service?.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    onSaved(catalog);
  }

  async function deleteService() {
    if (!service?.id) return;
    setSaving(true);
    const catalog = await api(`/api/pages/${pageId}/services/${service.id}`, { method: "DELETE" });
    onSaved(catalog);
  }

  return h(
    Modal,
    { title: service ? "Edit service" : "Add service", onClose },
    h(
      "form",
      { className: "modal-form", onSubmit: submit },
      h("label", null, "Name", h("input", { required: true, value: form.name, onChange: (event) => update("name", event.target.value), autoFocus: true })),
      h("label", null, "URL", h("input", { required: true, type: "url", placeholder: "https://", value: form.href, onChange: (event) => update("href", event.target.value) })),
      h("label", null, "Description", h("textarea", { rows: 3, value: form.description, onChange: (event) => update("description", event.target.value) })),
      h("label", null, "Category", h("input", { placeholder: "Storage, media, monitoring", value: form.category, onChange: (event) => update("category", event.target.value) })),
      h("label", null, "Search metadata", h("textarea", { rows: 3, placeholder: "Aliases, tags, search terms", value: form.keywords, onChange: (event) => update("keywords", event.target.value) })),
      h("label", null, "Notes", h("textarea", { rows: 2, placeholder: "Optional internal context for search", value: form.notes, onChange: (event) => update("notes", event.target.value) })),
      h("label", null, "Icon", h("input", { placeholder: "plex.png or https://...", value: form.icon, onChange: (event) => update("icon", event.target.value) })),
      h("label", null, "Widget type", h("input", { placeholder: "plex, pihole, proxmox", value: form.widgetType, onChange: (event) => update("widgetType", event.target.value) })),
      h(
        "div",
        { className: "modal-actions" },
        service ? h("button", { className: "danger", type: "button", disabled: saving, onClick: deleteService }, "Delete") : h("span", null),
        h("span", null),
        h("button", { type: "button", disabled: saving, onClick: onClose }, "Cancel"),
        h("button", { className: "primary", type: "submit", disabled: saving }, saving ? "Saving" : "Save")
      )
    )
  );
}

function PageModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    const catalog = await api("/api/pages", {
      method: "POST",
      body: JSON.stringify(form)
    });
    onSaved(catalog);
  }

  return h(
    Modal,
    { title: "New page", onClose, className: "compact" },
    h(
      "form",
      { className: "modal-form", onSubmit: submit },
      h("label", null, "Name", h("input", { required: true, placeholder: "Microsoft", value: form.name, autoFocus: true, onChange: (event) => setForm((current) => ({ ...current, name: event.target.value })) })),
      h("label", null, "Description", h("textarea", { rows: 2, value: form.description, onChange: (event) => setForm((current) => ({ ...current, description: event.target.value })) })),
      h(
        "div",
        { className: "modal-actions compact-actions" },
        h("span", null),
        h("button", { type: "button", disabled: saving, onClick: onClose }, "Cancel"),
        h("button", { className: "primary", type: "submit", disabled: saving }, saving ? "Creating" : "Create")
      )
    )
  );
}

function App() {
  const [catalog, setCatalog] = useState(null);
  const [activePageId, setActivePageId] = useState(null);
  const [query, setQuery] = useState("");
  const [theme, setThemeState] = useState(() => localStorage.getItem("landingpage-theme") || "dark");
  const [syncStatus, setSyncStatus] = useState({ enabled: true, running: false, lastMessage: "Loading" });
  const [serviceModal, setServiceModal] = useState(null);
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api("/api/catalog")
      .then((data) => {
        setCatalog(data);
        setActivePageId(data.pages[0]?.id);
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("landingpage-theme", theme);
  }, [theme]);

  useEffect(() => {
    async function refreshSyncStatus() {
      try {
        setSyncStatus(await api("/api/sync/status"));
      } catch (error) {
        setSyncStatus({ enabled: false, running: false, lastError: error.message });
      }
    }
    refreshSyncStatus();
    const interval = setInterval(refreshSyncStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const activePage = useMemo(() => {
    if (!catalog?.pages?.length) return null;
    return catalog.pages.find((page) => page.id === activePageId) || catalog.pages[0];
  }, [catalog, activePageId]);

  const visibleServices = useMemo(() => {
    if (!catalog || !activePage) return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return activePage.services;
    return catalog.pages.flatMap((page) =>
      page.services
        .filter((service) => serviceSearchText(service, page).includes(normalizedQuery))
        .map((service) => ({ ...service, pageId: page.id, pageName: page.name }))
    );
  }, [catalog, activePage, query]);

  useEffect(() => {
    if (activePage) document.title = `${activePage.name} - Landingpage`;
  }, [activePage]);

  async function syncNow() {
    setSyncStatus((current) => ({ ...current, running: true }));
    const status = await api("/api/sync/run", { method: "POST" });
    setSyncStatus(status);
    setCatalog(await api("/api/catalog"));
  }

  function setTheme(nextTheme) {
    setThemeState(nextTheme);
  }

  function onCatalogSaved(nextCatalog) {
    setCatalog(nextCatalog);
    setServiceModal(null);
    setPageModalOpen(false);
    if (!activePageId && nextCatalog.pages[0]) setActivePageId(nextCatalog.pages[0].id);
  }

  if (loadError) {
    return h("main", { className: "load-state" }, h("h1", null, "Could not load Landingpage"), h("p", null, loadError));
  }

  if (!catalog || !activePage) {
    return h("main", { className: "load-state" }, h("div", { className: "loader" }), h("p", null, "Loading services"));
  }

  const countText = query ? `${visibleServices.length} global matches` : `${visibleServices.length} of ${activePage.services.length} services`;

  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "app-shell" },
      h(Sidebar, {
        pages: catalog.pages,
        activePageId: activePage.id,
        setActivePageId,
        syncStatus,
        onSyncNow: syncNow,
        onNewPage: () => setPageModalOpen(true),
        theme,
        setTheme
      }),
      h(
        "main",
        { className: "workspace" },
        h(Topbar, {
          page: activePage,
          countText,
          query,
          setQuery,
          onAddService: () => setServiceModal({ service: null, pageId: activePage.id })
        }),
        h(QuickStrip, { services: activePage.services }),
        h(ServiceGrid, {
          services: visibleServices,
          activePage,
          query,
          onEdit: (service, pageId) => setServiceModal({ service, pageId })
        })
      )
    ),
    serviceModal && h(ServiceModal, { page: activePage, editing: serviceModal, onClose: () => setServiceModal(null), onSaved: onCatalogSaved }),
    pageModalOpen && h(PageModal, { onClose: () => setPageModalOpen(false), onSaved: (nextCatalog) => {
      setCatalog(nextCatalog);
      setActivePageId(nextCatalog.pages.at(-1).id);
      setPageModalOpen(false);
    } })
  );
}

createRoot(document.querySelector("#root")).render(h(App));

const h = React.createElement;
const { useEffect, useMemo, useState } = React;

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
  if (status.lastError) return "Git needs attention";
  if (status.lastSuccessAt) {
    return `OK ${new Date(status.lastSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  }
  return "Every 15 min";
}

function syncDetail(status) {
  if (status.lastError) return status.lastError;
  return status.lastMessage || "Waiting for first sync.";
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

function DisplayModeControl({ displayMode, setDisplayMode }) {
  return h(
    "div",
    { className: "segmented", role: "group", "aria-label": "Service display mode" },
    h(
      "button",
      {
        type: "button",
        className: displayMode === "cards" ? "active" : "",
        "aria-pressed": displayMode === "cards",
        onClick: () => setDisplayMode("cards")
      },
      "Grid"
    ),
    h(
      "button",
      {
        type: "button",
        className: displayMode === "compact" ? "active" : "",
        "aria-pressed": displayMode === "compact",
        onClick: () => setDisplayMode("compact")
      },
      "Compact"
    ),
    h(
      "button",
      {
        type: "button",
        className: displayMode === "hidden" ? "active" : "",
        "aria-pressed": displayMode === "hidden",
        onClick: () => setDisplayMode("hidden")
      },
      "Hidden"
    )
  );
}

function Sidebar({ pages, activePageId, setActivePageId, syncStatus, onSyncNow, onNewPage, onAddService, theme, setTheme, onHideMenu, displayMode, setDisplayMode }) {
  return h(
    "aside",
    { className: "sidebar", "aria-label": "Pages" },
    h(
      "div",
      { className: "brand" },
      h("span", { className: "brand-mark" }, "L"),
      h("div", null, h("strong", null, "Landingpage"), h("span", null, "Homelab services")),
      h(
        "button",
        {
          className: "collapse-toggle",
          type: "button",
          "aria-label": "Hide menu",
          onClick: onHideMenu
        },
        "<<"
      )
    ),
    h(
      "section",
      { className: "create-panel", "aria-label": "Create" },
      h("button", { className: "primary sidebar-command", type: "button", onClick: onAddService }, "New service"),
      h("button", { className: "ghost sidebar-command", type: "button", onClick: onNewPage }, "New page")
    ),
    h(
      "div",
      { className: "sync-panel" },
      h(
        "div",
        null,
        h("strong", null, "Git Sync"),
        h("span", { className: "sync-label" }, formatSyncStatus(syncStatus)),
        h("small", { title: syncDetail(syncStatus) }, syncDetail(syncStatus))
      ),
      h("button", { type: "button", disabled: syncStatus.running, onClick: onSyncNow }, "Sync")
    ),
    h(
      "section",
      { className: "settings-panel", "aria-label": "Settings" },
      h("h2", null, "Settings"),
      h(
        "div",
        { className: "settings-row" },
        h("span", null, "Theme"),
        h(
          "button",
          {
            className: "setting-toggle",
            type: "button",
            "aria-pressed": theme === "dark",
            onClick: () => setTheme(theme === "dark" ? "light" : "dark")
          },
          theme === "dark" ? "Dark" : "Light"
        )
      ),
      h("div", { className: "settings-row" }, h("span", null, "View mode"), h(DisplayModeControl, { displayMode, setDisplayMode }))
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

function Topbar({ page, countText, query, setQuery, searchSource, searchLoading }) {
  function updateQuery(value) {
    setQuery(value);
  }

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
          onChange: (event) => updateQuery(event.target.value)
        }),
        query && h("small", null, searchLoading ? "Searching..." : searchSource === "ai" ? "Smart search" : "Smart local search")
      )
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

function ServiceRow({ service, pageId, onEdit }) {
  return h(
    "article",
    { className: "service-row" },
    h("a", { href: service.href, target: "_blank", rel: "noreferrer", "aria-label": `Open ${service.name}` }, h(ServiceIcon, { service, size: "small" })),
    h(
      "div",
      { className: "service-row-copy" },
      h("h2", null, h("a", { href: service.href, target: "_blank", rel: "noreferrer" }, service.name)),
      h("p", null, service.description || "No description yet.")
    ),
    h("button", { className: "card-edit", type: "button", onClick: () => onEdit(service, pageId) }, "Edit")
  );
}

function ServiceGrid({ services, activePage, query, onEdit, displayMode }) {
  if (!services.length) {
    return h(
      "section",
      { className: "service-grid" },
      h("div", { className: "empty-state" }, h("h2", null, "No services found"), h("p", null, "Add a service or adjust the current search."))
    );
  }

  if (displayMode === "hidden") {
    return h(
      "section",
      { className: "services-hidden" },
      h("p", null, `${services.length} services hidden. Switch to Compact or Cards to show them.`)
    );
  }

  if (displayMode === "compact") {
    return h(
      "section",
      { className: "service-list" },
      services.map((service) =>
        h(ServiceRow, {
          key: `${service.pageId || activePage.id}-${service.id}`,
          service,
          pageId: service.pageId || activePage.id,
          onEdit
        })
      )
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

function ServiceModal({ page, pages, editing, onClose, onSaved }) {
  const initialPageId = editing?.pageId || page.id;
  const [form, setForm] = useState(() => ({
    name: editing?.service?.name || "",
    href: editing?.service?.href || "",
    description: editing?.service?.description || "",
    pageId: initialPageId,
    keywords: (editing?.service?.keywords || []).join("\n"),
    notes: editing?.service?.notes || "",
    icon: editing?.service?.icon || "",
    widgetType: editing?.service?.widgetType || ""
  }));
  const [saving, setSaving] = useState(false);
  const [aiFilling, setAiFilling] = useState(false);
  const [formError, setFormError] = useState("");
  const service = editing?.service;
  const pageId = initialPageId;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const targetPage = pages.find((item) => item.id === form.pageId) || page;
    const payload = {
      ...form,
      category: targetPage.name,
      keywords: splitKeywords(form.keywords),
      tags: [targetPage.name]
    };
    delete payload.pageId;

    if (service?.id && targetPage.id !== pageId) {
      await api(`/api/pages/${pageId}/services/${service.id}`, { method: "DELETE" });
      payload.id = service.id;
      const catalog = await api(`/api/pages/${targetPage.id}/services`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onSaved(catalog, targetPage.id);
      return;
    }

    const path = service?.id ? `/api/pages/${pageId}/services/${service.id}` : `/api/pages/${targetPage.id}/services`;
    const catalog = await api(path, {
      method: service?.id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    onSaved(catalog, targetPage.id);
  }

  async function deleteService() {
    if (!service?.id) return;
    setSaving(true);
    const catalog = await api(`/api/pages/${pageId}/services/${service.id}`, { method: "DELETE" });
    onSaved(catalog);
  }

  async function autoFill() {
    setAiFilling(true);
    setFormError("");
    try {
      const targetPage = pages.find((item) => item.id === form.pageId) || page;
      const result = await api("/api/ai/service-suggestion", {
        method: "POST",
        body: JSON.stringify({ ...form, category: targetPage.name })
      });
      const suggestion = result.suggestion || {};
      setForm((current) => ({
        ...current,
        description: suggestion.description || current.description,
        icon: suggestion.icon || current.icon,
        widgetType: suggestion.widgetType || current.widgetType,
        keywords: Array.isArray(suggestion.keywords) ? suggestion.keywords.join("\n") : current.keywords,
        notes: suggestion.notes || current.notes
      }));
    } catch (error) {
      setFormError(error.message);
    } finally {
      setAiFilling(false);
    }
  }

  return h(
    Modal,
    { title: service ? "Edit service" : "Add service", onClose },
    h(
      "form",
      { className: "modal-form", onSubmit: submit },
      h(
        "div",
        { className: "modal-tools" },
        h("span", null, "Use AI to fill the boring bits."),
        h("button", { type: "button", className: "ghost", disabled: aiFilling || (!form.name && !form.href), onClick: autoFill }, aiFilling ? "Thinking" : "Auto fill")
      ),
      formError && h("p", { className: "form-error" }, formError),
      h("label", null, "Name", h("input", { required: true, value: form.name, onChange: (event) => update("name", event.target.value), autoFocus: true })),
      h("label", null, "URL", h("input", { required: true, type: "url", placeholder: "https://", value: form.href, onChange: (event) => update("href", event.target.value) })),
      h("label", null, "Description", h("textarea", { rows: 3, value: form.description, onChange: (event) => update("description", event.target.value) })),
      h(
        "label",
        null,
        "Category",
        h(
          "select",
          { value: form.pageId, onChange: (event) => update("pageId", event.target.value) },
          pages.map((item) => h("option", { key: item.id, value: item.id }, item.name))
        )
      ),
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
  const [displayMode, setDisplayModeState] = useState(() => {
    if (localStorage.getItem("landingpage-ui-version") !== "2") return "compact";
    return localStorage.getItem("landingpage-display-mode") || "compact";
  });
  const [menuHidden, setMenuHiddenState] = useState(() => {
    if (localStorage.getItem("landingpage-ui-version") !== "2") return false;
    return localStorage.getItem("landingpage-menu-hidden") === "true";
  });
  const [syncStatus, setSyncStatus] = useState({ enabled: true, running: false, lastMessage: "Loading" });
  const [serviceModal, setServiceModal] = useState(null);
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [smartSearch, setSmartSearch] = useState({ query: "", services: [], source: "local", loading: false });

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
    localStorage.setItem("landingpage-ui-version", "2");
    localStorage.setItem("landingpage-display-mode", displayMode);
  }, [displayMode]);

  useEffect(() => {
    localStorage.setItem("landingpage-menu-hidden", String(menuHidden));
  }, [menuHidden]);

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

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setSmartSearch({ query: "", services: [], source: "local", loading: false });
      return;
    }

    let cancelled = false;
    setSmartSearch((current) => ({ ...current, query: normalizedQuery, loading: true }));
    const timeout = setTimeout(async () => {
      try {
        const result = await api("/api/search", {
          method: "POST",
          body: JSON.stringify({ query: normalizedQuery })
        });
        if (!cancelled) {
          setSmartSearch({
            query: normalizedQuery,
            services: result.services || [],
            source: result.source || "local",
            loading: false
          });
        }
      } catch {
        if (!cancelled) setSmartSearch({ query: normalizedQuery, services: [], source: "local", loading: false });
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const activePage = useMemo(() => {
    if (!catalog?.pages?.length) return null;
    if (activePageId === "all") {
      return {
        id: "all",
        name: "All",
        description: "Every service",
        services: catalog.pages.flatMap((page) =>
          page.services.map((service) => ({ ...service, pageId: page.id, pageName: page.name }))
        )
      };
    }
    return catalog.pages.find((page) => page.id === activePageId) || catalog.pages[0];
  }, [catalog, activePageId]);

  const visibleServices = useMemo(() => {
    if (!catalog || !activePage) return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery && smartSearch.query.toLowerCase() === normalizedQuery && !smartSearch.loading) {
      return smartSearch.services;
    }
    if (!normalizedQuery) return activePage.services;
    const sourcePages = activePage.id === "all" ? catalog.pages : [activePage];
    return sourcePages.flatMap((page) =>
      page.services
        .filter((service) => serviceSearchText(service, page).includes(normalizedQuery))
        .map((service) => ({ ...service, pageId: service.pageId || page.id, pageName: service.pageName || page.name }))
    );
  }, [catalog, activePage, query, smartSearch]);

  const navPages = useMemo(() => {
    if (!catalog?.pages?.length) return [];
    const total = catalog.pages.reduce((count, page) => count + page.services.length, 0);
    return [{ id: "all", name: "All", description: "Every service", services: Array.from({ length: total }) }, ...catalog.pages];
  }, [catalog]);

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

  function setDisplayMode(nextMode) {
    setDisplayModeState(nextMode);
  }

  function setSearchQuery(nextQuery) {
    setQuery(nextQuery);
    if (nextQuery.trim()) setActivePageId("all");
  }

  function setMenuHidden(nextHidden) {
    setMenuHiddenState(nextHidden);
  }

  function onCatalogSaved(nextCatalog, nextPageId = null) {
    setCatalog(nextCatalog);
    setServiceModal(null);
    setPageModalOpen(false);
    if (nextPageId) setActivePageId(nextPageId);
    if (!activePageId && nextCatalog.pages[0]) setActivePageId(nextCatalog.pages[0].id);
  }

  if (loadError) {
    return h("main", { className: "load-state" }, h("h1", null, "Could not load Landingpage"), h("p", null, loadError));
  }

  if (!catalog || !activePage) {
    return h("main", { className: "load-state" }, h("div", { className: "loader" }), h("p", null, "Loading services"));
  }

  const countText = query ? `${visibleServices.length} global matches` : `${visibleServices.length} of ${activePage.services.length} services`;
  const serviceTargetPage = activePage.id === "all" ? catalog.pages[0] : activePage;

  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: menuHidden ? "app-shell menu-hidden" : "app-shell" },
      menuHidden && h("button", { className: "menu-restore", type: "button", "aria-label": "Show menu", onClick: () => setMenuHidden(false) }, ">>"),
      !menuHidden &&
        h(Sidebar, {
          pages: navPages,
          activePageId: activePage.id,
          setActivePageId,
          syncStatus,
          onSyncNow: syncNow,
          onNewPage: () => setPageModalOpen(true),
          onAddService: () => setServiceModal({ service: null, pageId: serviceTargetPage.id }),
          theme,
          setTheme,
          onHideMenu: () => setMenuHidden(true),
          displayMode,
          setDisplayMode
        }),
      h(
        "main",
        { className: "workspace" },
        h(Topbar, {
          page: activePage,
          countText,
          query,
          setQuery: setSearchQuery,
          searchSource: smartSearch.source,
          searchLoading: smartSearch.loading,
        }),
        h(ServiceGrid, {
          services: visibleServices,
          activePage,
          query,
          displayMode,
          onEdit: (service, pageId) => setServiceModal({ service, pageId })
        })
      )
    ),
    serviceModal && h(ServiceModal, { page: activePage, pages: catalog.pages, editing: serviceModal, onClose: () => setServiceModal(null), onSaved: onCatalogSaved }),
    pageModalOpen && h(PageModal, { onClose: () => setPageModalOpen(false), onSaved: (nextCatalog) => {
      setCatalog(nextCatalog);
      setActivePageId(nextCatalog.pages.at(-1).id);
      setPageModalOpen(false);
    } })
  );
}

ReactDOM.createRoot(document.querySelector("#root")).render(h(App));

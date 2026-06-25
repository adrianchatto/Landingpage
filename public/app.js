const state = {
  catalog: null,
  activePageId: null,
  query: "",
  editingService: null,
  editingPageId: null
};

const els = {
  pageNav: document.querySelector("#pageNav"),
  pageTitle: document.querySelector("#pageTitle"),
  serviceCount: document.querySelector("#serviceCount"),
  serviceGrid: document.querySelector("#serviceGrid"),
  quickStrip: document.querySelector("#quickStrip"),
  searchInput: document.querySelector("#searchInput"),
  addServiceButton: document.querySelector("#addServiceButton"),
  newPageButton: document.querySelector("#newPageButton"),
  themeToggle: document.querySelector("#themeToggle"),
  syncStatus: document.querySelector("#syncStatus"),
  syncNowButton: document.querySelector("#syncNowButton"),
  serviceDialog: document.querySelector("#serviceDialog"),
  serviceDialogTitle: document.querySelector("#serviceDialogTitle"),
  serviceForm: document.querySelector("#serviceForm"),
  serviceId: document.querySelector("#serviceId"),
  serviceName: document.querySelector("#serviceName"),
  serviceHref: document.querySelector("#serviceHref"),
  serviceDescription: document.querySelector("#serviceDescription"),
  serviceCategory: document.querySelector("#serviceCategory"),
  serviceKeywords: document.querySelector("#serviceKeywords"),
  serviceNotes: document.querySelector("#serviceNotes"),
  serviceIcon: document.querySelector("#serviceIcon"),
  serviceWidget: document.querySelector("#serviceWidget"),
  deleteServiceButton: document.querySelector("#deleteServiceButton"),
  pageDialog: document.querySelector("#pageDialog"),
  pageForm: document.querySelector("#pageForm"),
  pageName: document.querySelector("#pageName"),
  pageDescription: document.querySelector("#pageDescription")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function activePage() {
  return state.catalog.pages.find((page) => page.id === state.activePageId) || state.catalog.pages[0];
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

function visibleServices(page) {
  const query = state.query.trim().toLowerCase();
  if (!query) return page.services;
  return state.catalog.pages.flatMap((candidatePage) => {
    return candidatePage.services
      .filter((service) => serviceSearchText(service, candidatePage).includes(query))
      .map((service) => ({ ...service, pageId: candidatePage.id, pageName: candidatePage.name }));
  });
}

function iconUrl(icon) {
  if (!icon) return "";
  if (icon.startsWith("http")) return icon;
  if (icon.includes("/") || icon.startsWith("mdi-")) return "";
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${icon}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function fallbackLetters(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderIcon(service) {
  const url = iconUrl(service.icon || "");
  const letters = escapeHtml(fallbackLetters(service.name));
  if (url) {
    return `<img src="${escapeAttribute(url)}" alt="" loading="lazy" data-fallback="${letters}">`;
  }
  return `<span class="service-fallback">${letters}</span>`;
}

function renderPages() {
  els.pageNav.innerHTML = state.catalog.pages
    .map((page) => {
      const total = page.services.length;
      const active = page.id === state.activePageId ? "active" : "";
      return `<button class="${active}" type="button" data-page-id="${escapeAttribute(page.id)}">
        <span>${escapeHtml(page.name)}</span>
        <small>${total}</small>
      </button>`;
    })
    .join("");
}

function renderQuickStrip(page) {
  els.quickStrip.innerHTML = page.services
    .slice(0, 8)
    .map((service) => `<a href="${escapeAttribute(service.href)}" target="_blank" rel="noreferrer">${renderIcon(service)}<span>${escapeHtml(service.name)}</span></a>`)
    .join("");
}

function renderServices(page) {
  const services = visibleServices(page);
  els.serviceGrid.innerHTML = services
    .map((service) => {
      return `<article class="service-card">
        <div class="service-top">
          <a class="service-icon" href="${escapeAttribute(service.href)}" target="_blank" rel="noreferrer">${renderIcon(service)}</a>
          <button class="card-edit" type="button" data-page-id="${escapeAttribute(service.pageId || page.id)}" data-service-id="${escapeAttribute(service.id)}">Edit</button>
        </div>
        <h2><a href="${escapeAttribute(service.href)}" target="_blank" rel="noreferrer">${escapeHtml(service.name)}</a></h2>
        <p>${escapeHtml(service.description || "No description yet.")}</p>
      </article>`;
    })
    .join("");

  if (!services.length) {
    els.serviceGrid.innerHTML = `<div class="empty-state">
      <h2>No services found</h2>
      <p>Add a service or adjust the current search.</p>
    </div>`;
  }
}

document.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.dataset.fallback) return;
    const fallback = document.createElement("span");
    fallback.className = "service-fallback";
    fallback.textContent = image.dataset.fallback;
    image.replaceWith(fallback);
  },
  true
);

function render() {
  const page = activePage();
  state.activePageId = page.id;
  const services = visibleServices(page);
  document.title = `${page.name} - Landingpage`;
  els.pageTitle.textContent = page.name;
  els.serviceCount.textContent = state.query
    ? `${services.length} global matches`
    : `${services.length} of ${page.services.length} services`;
  renderPages();
  renderQuickStrip(page);
  renderServices(page);
}

async function loadCatalog() {
  state.catalog = await api("/api/catalog");
  state.activePageId = state.catalog.pages[0]?.id;
  render();
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

async function refreshSyncStatus() {
  try {
    const status = await api("/api/sync/status");
    els.syncStatus.textContent = formatSyncStatus(status);
    els.syncStatus.title = status.lastError || status.lastMessage || "";
  } catch (error) {
    els.syncStatus.textContent = "Unavailable";
    els.syncStatus.title = error.message;
  }
}

function openServiceDialog(service = null, pageId = null) {
  state.editingService = service;
  state.editingPageId = pageId || state.activePageId;
  els.serviceDialogTitle.textContent = service ? "Edit service" : "Add service";
  els.deleteServiceButton.hidden = !service;
  els.serviceId.value = service?.id || "";
  els.serviceName.value = service?.name || "";
  els.serviceHref.value = service?.href || "";
  els.serviceDescription.value = service?.description || "";
  els.serviceCategory.value = service?.category || "";
  els.serviceKeywords.value = (service?.keywords || []).join("\n");
  els.serviceNotes.value = service?.notes || "";
  els.serviceIcon.value = service?.icon || "";
  els.serviceWidget.value = service?.widgetType || "";
  els.serviceDialog.showModal();
  els.serviceName.focus();
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
}

els.pageNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page-id]");
  if (!button) return;
  state.activePageId = button.dataset.pageId;
  render();
});

els.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

els.addServiceButton.addEventListener("click", () => openServiceDialog());
els.newPageButton.addEventListener("click", () => {
  els.pageForm.reset();
  els.pageDialog.showModal();
  els.pageName.focus();
});

els.syncNowButton.addEventListener("click", async () => {
  els.syncNowButton.disabled = true;
  els.syncStatus.textContent = "Running";
  try {
    const status = await api("/api/sync/run", { method: "POST" });
    els.syncStatus.textContent = formatSyncStatus(status);
    els.syncStatus.title = status.lastError || status.lastMessage || "";
    state.catalog = await api("/api/catalog");
    render();
  } catch (error) {
    els.syncStatus.textContent = "Failed";
    els.syncStatus.title = error.message;
  } finally {
    els.syncNowButton.disabled = false;
  }
});

els.serviceGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-service-id]");
  if (!button) return;
  const page = state.catalog.pages.find((item) => item.id === button.dataset.pageId) || activePage();
  const service = page.services.find((item) => item.id === button.dataset.serviceId);
  if (service) openServiceDialog(service, page.id);
});

document.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-dialog]")) closeDialogs();
});

els.serviceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const page = state.catalog.pages.find((item) => item.id === state.editingPageId) || activePage();
  const service = {
    name: els.serviceName.value,
    href: els.serviceHref.value,
    description: els.serviceDescription.value,
    category: els.serviceCategory.value,
    keywords: els.serviceKeywords.value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean),
    notes: els.serviceNotes.value,
    icon: els.serviceIcon.value,
    widgetType: els.serviceWidget.value,
    tags: [page.name]
  };
  const id = els.serviceId.value;
  const path = id ? `/api/pages/${page.id}/services/${id}` : `/api/pages/${page.id}/services`;
  state.catalog = await api(path, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(service)
  });
  closeDialogs();
  render();
});

els.deleteServiceButton.addEventListener("click", async () => {
  const page = state.catalog.pages.find((item) => item.id === state.editingPageId) || activePage();
  const id = els.serviceId.value;
  if (!id) return;
  state.catalog = await api(`/api/pages/${page.id}/services/${id}`, { method: "DELETE" });
  closeDialogs();
  render();
});

els.pageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.catalog = await api("/api/pages", {
    method: "POST",
    body: JSON.stringify({
      name: els.pageName.value,
      description: els.pageDescription.value
    })
  });
  state.activePageId = state.catalog.pages.at(-1).id;
  closeDialogs();
  render();
});

loadCatalog().catch((error) => {
  els.serviceGrid.innerHTML = `<div class="empty-state"><h2>Could not load catalog</h2><p>${error.message}</p></div>`;
});

refreshSyncStatus();
setInterval(refreshSyncStatus, 30000);

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("landingpage-theme", theme);
  els.themeToggle.textContent = theme === "dark" ? "Dark" : "Light";
  els.themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
}

setTheme(localStorage.getItem("landingpage-theme") || "dark");

els.themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setTheme(nextTheme);
});

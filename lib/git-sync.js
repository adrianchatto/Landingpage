import { execFile } from "node:child_process";
import { access, readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { catalogToServicesYaml, servicesYamlToCatalog } from "./catalog-yaml.js";

const execFileAsync = promisify(execFile);

function minutes(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 * 1000 : fallback;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runGit(root, args) {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd: root });
  return `${stdout}${stderr}`.trim();
}

async function readCatalog(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeCatalogAndYaml(catalogPath, servicesYamlPath, catalog) {
  catalog.meta = {
    ...(catalog.meta || {}),
    updatedAt: new Date().toISOString()
  };
  await writeFile(`${catalogPath}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`);
  await rename(`${catalogPath}.tmp`, catalogPath);
  await writeFile(`${servicesYamlPath}.tmp`, catalogToServicesYaml(catalog));
  await rename(`${servicesYamlPath}.tmp`, servicesYamlPath);
}

export function createGitSync({ root, catalogPath, servicesYamlPath }) {
  const enabled = process.env.GIT_SYNC_ENABLED !== "false";
  const intervalMs = minutes(process.env.GIT_SYNC_INTERVAL_MINUTES, 15 * 60 * 1000);
  const branch = process.env.GIT_SYNC_BRANCH || "main";
  const paths = ["data/catalog.json", "data/services.yaml"];
  let timer = null;
  let running = false;
  let lastStatus = {
    enabled,
    intervalMinutes: intervalMs / 60000,
    branch,
    running: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastMessage: "Sync has not run yet."
  };

  async function ensureGitIdentity() {
    try {
      await runGit(root, ["config", "user.email"]);
    } catch {
      await runGit(root, ["config", "user.email", process.env.GIT_SYNC_EMAIL || "landingpage@local"]);
    }
    try {
      await runGit(root, ["config", "user.name"]);
    } catch {
      await runGit(root, ["config", "user.name", process.env.GIT_SYNC_NAME || "Landingpage Sync"]);
    }
  }

  async function ensureServicesYaml() {
    if (await exists(servicesYamlPath)) return false;
    const catalog = await readCatalog(catalogPath);
    await writeFile(servicesYamlPath, catalogToServicesYaml(catalog));
    return true;
  }

  async function commitIfNeeded(message) {
    await runGit(root, ["add", ...paths]);
    const staged = await runGit(root, ["diff", "--cached", "--name-only", "--", ...paths]);
    if (!staged) return false;
    await runGit(root, ["commit", "-m", message]);
    return true;
  }

  async function importServicesYaml() {
    if (!(await exists(servicesYamlPath))) return false;
    const before = await readFile(catalogPath, "utf8").catch(() => "");
    const previous = before ? JSON.parse(before) : {};
    const yaml = await readFile(servicesYamlPath, "utf8");
    const catalog = servicesYamlToCatalog(yaml, previous);
    if (JSON.stringify(previous.pages || []) === JSON.stringify(catalog.pages || [])) return false;
    const after = `${JSON.stringify(catalog, null, 2)}\n`;
    if (before === after) return false;
    await writeCatalogAndYaml(catalogPath, servicesYamlPath, catalog);
    return true;
  }

  async function hasRemote() {
    try {
      await runGit(root, ["ls-remote", "--exit-code", "--heads", "origin", branch]);
      return true;
    } catch {
      return false;
    }
  }

  async function runOnce(reason = "interval") {
    if (!enabled) {
      lastStatus = { ...lastStatus, lastMessage: "Git sync is disabled.", running: false };
      return lastStatus;
    }
    if (running) {
      return { ...lastStatus, running: true, lastMessage: "Sync already running." };
    }

    running = true;
    lastStatus = {
      ...lastStatus,
      running: true,
      lastRunAt: new Date().toISOString(),
      lastError: null,
      lastMessage: `Sync started by ${reason}.`
    };

    try {
      await ensureGitIdentity();
      const createdYaml = await ensureServicesYaml();
      const localCommit = await commitIfNeeded(createdYaml ? "Generate services.yaml" : "Update Landingpage services");

      if (await hasRemote()) {
        await runGit(root, ["pull", "--rebase", "origin", branch]);
        const imported = await importServicesYaml();
        const importCommit = imported ? await commitIfNeeded("Import services.yaml changes") : false;
        await runGit(root, ["push", "origin", `HEAD:${branch}`]);
        lastStatus = {
          ...lastStatus,
          running: false,
          lastSuccessAt: new Date().toISOString(),
          lastMessage: `Synced with GitHub. localCommit=${localCommit}, importCommit=${importCommit}.`
        };
      } else {
        await runGit(root, ["push", "-u", "origin", `HEAD:${branch}`]);
        lastStatus = {
          ...lastStatus,
          running: false,
          lastSuccessAt: new Date().toISOString(),
          lastMessage: `Pushed initial ${branch} branch to GitHub. localCommit=${localCommit}.`
        };
      }
    } catch (error) {
      lastStatus = {
        ...lastStatus,
        running: false,
        lastError: error.message,
        lastMessage: "Sync failed. Check Git status for conflicts or authentication issues."
      };
    } finally {
      running = false;
    }

    return lastStatus;
  }

  function start() {
    if (!enabled || timer) return;
    timer = setInterval(() => {
      runOnce("interval").catch(() => {});
    }, intervalMs);
    timer.unref?.();
  }

  return {
    start,
    runOnce,
    status() {
      return { ...lastStatus, running };
    }
  };
}

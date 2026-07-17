(function attachASystemGitHubData(globalObject) {
  "use strict";

  const REPOSITORIES = Object.freeze({
    asystem: Object.freeze({ owner: "inclusionAI", name: "ASystem", label: "ASystem" }),
    areno: Object.freeze({ owner: "inclusionAI", name: "AReno", label: "AReno" }),
    awex: Object.freeze({ owner: "inclusionAI", name: "Awex", label: "Awex" }),
    astate: Object.freeze({ owner: "inclusionAI", name: "AState", label: "AState" }),
    amem: Object.freeze({ owner: "inclusionAI", name: "asystem-amem", label: "AMem" }),
  });
  const REPOSITORY_KEYS = Object.freeze(["asystem", "areno", "awex", "astate", "amem"]);
  const PROJECT_KEYS = Object.freeze(["areno", "awex", "astate", "amem"]);
  const CACHE_KEY = "asystem.github-data.v3";
  const CACHE_VERSION = 3;
  const CACHE_TTL_MS = 15 * 60 * 1000;

  function createEmptyCache() {
    return { version: CACHE_VERSION, repositories: {}, releases: {}, activity: {} };
  }

  function configuredRepository(key) {
    const repository = REPOSITORIES[key];
    if (!repository) throw new TypeError(`Unknown repository key: ${key}`);
    return repository;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function requiredTimestamp(value, field) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new TypeError(`Invalid ${field}`);
    return timestamp;
  }

  function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`Invalid ${field}`);
    return value.trim();
  }

  function isSafeGitHubUrl(value, key) {
    try {
      const repository = configuredRepository(key);
      const url = new URL(value);
      const prefix = `/${repository.owner}/${repository.name}`.toLowerCase();
      const path = url.pathname.toLowerCase();
      return url.protocol === "https:"
        && url.hostname === "github.com"
        && (path === prefix || path.startsWith(`${prefix}/`));
    } catch (_) {
      return false;
    }
  }

  function requiredGitHubUrl(value, key) {
    if (!isSafeGitHubUrl(value, key)) throw new TypeError("Invalid GitHub URL");
    return value;
  }

  function isSafeAvatarUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "avatars.githubusercontent.com";
    } catch (_) {
      return false;
    }
  }

  function requiredAvatarUrl(value) {
    if (!isSafeAvatarUrl(value)) throw new TypeError("Invalid avatar URL");
    return value;
  }

  function plainSummary(value) {
    if (typeof value !== "string") return "";
    const line = value.split(/\r?\n/).map((item) => item.trim()).find(Boolean) || "";
    return line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^[-*>]+\s*/, "")
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  function normalizeRepository(key, payload) {
    const repository = configuredRepository(key);
    if (!isObject(payload)) throw new TypeError("Invalid repository payload");
    if (String(payload.full_name || "").toLowerCase()
      !== `${repository.owner}/${repository.name}`.toLowerCase()) {
      throw new TypeError("Repository identity mismatch");
    }
    if (!Number.isInteger(payload.stargazers_count) || payload.stargazers_count < 0) {
      throw new TypeError("Invalid star count");
    }
    return {
      repositoryKey: key,
      stars: payload.stargazers_count,
      updatedAt: requiredTimestamp(payload.updated_at, "updated_at"),
      url: requiredGitHubUrl(payload.html_url, key),
    };
  }

  function normalizeRelease(key, payload) {
    if (!isObject(payload)) throw new TypeError("Invalid release payload");
    const tag = requiredText(payload.tag_name, "tag_name");
    return {
      repositoryKey: key,
      name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : tag,
      tag,
      url: requiredGitHubUrl(payload.html_url, key),
      publishedAt: requiredTimestamp(payload.published_at, "published_at"),
      summary: plainSummary(payload.body),
    };
  }

  function normalizeReleases(key, payload) {
    configuredRepository(key);
    if (!Array.isArray(payload)) throw new TypeError("Invalid releases payload");
    const publicReleases = payload.filter((item) => !(isObject(item) && item.draft === true));
    const normalized = [];
    for (const release of publicReleases) {
      try { normalized.push(normalizeRelease(key, release)); } catch (_) { /* reject invalid rows */ }
    }
    if (publicReleases.length > 0 && normalized.length === 0) {
      throw new TypeError("No valid releases in payload");
    }
    return normalized.sort((left, right) => right.publishedAt - left.publishedAt);
  }

  function normalizeActivity(key, payload) {
    configuredRepository(key);
    if (!isObject(payload)) throw new TypeError("Invalid activity payload");
    if (!Number.isInteger(payload.number) || payload.number < 1) throw new TypeError("Invalid number");
    if (payload.state !== "open" && payload.state !== "closed") throw new TypeError("Invalid state");
    let person = null;
    for (const candidate of [payload.assignee, payload.user]) {
      if (!isObject(candidate)) continue;
      try {
        person = {
          author: requiredText(candidate.login, "activity person login"),
          avatarUrl: requiredAvatarUrl(candidate.avatar_url),
        };
        break;
      } catch (_) { /* try the issue creator when an assignee is malformed */ }
    }
    if (!person) throw new TypeError("Invalid activity person");
    return {
      repositoryKey: key,
      number: payload.number,
      title: requiredText(payload.title, "title"),
      state: payload.state,
      type: Object.prototype.hasOwnProperty.call(payload, "pull_request") ? "pull-request" : "issue",
      updatedAt: requiredTimestamp(payload.updated_at, "updated_at"),
      url: requiredGitHubUrl(payload.html_url, key),
      author: person.author,
      avatarUrl: person.avatarUrl,
    };
  }

  function normalizeActivities(key, payload) {
    configuredRepository(key);
    if (!Array.isArray(payload)) throw new TypeError("Invalid activity collection");
    const normalized = [];
    for (const item of payload) {
      try { normalized.push(normalizeActivity(key, item)); } catch (_) { /* reject invalid rows */ }
    }
    if (payload.length > 0 && normalized.length === 0) {
      throw new TypeError("No valid activity in payload");
    }
    return normalized;
  }

  function selectOpenFirst(items, limit) {
    const count = Number.isInteger(limit) && limit > 0 ? limit : 2;
    const newest = items.slice().sort((left, right) => right.updatedAt - left.updatedAt);
    const open = newest.filter((item) => item.state === "open");
    const closed = newest.filter((item) => item.state === "closed");
    return open.slice(0, count).concat(closed.slice(0, Math.max(0, count - open.length)));
  }

  function mergeReleases(releasesByRepository, limit) {
    const count = Number.isInteger(limit) && limit > 0 ? limit : 4;
    return REPOSITORY_KEYS.flatMap((key) => (
      Array.isArray(releasesByRepository[key]) ? releasesByRepository[key] : []
    )).sort((left, right) => right.publishedAt - left.publishedAt).slice(0, count);
  }

  function validNormalizedValue(dataset, key, value) {
    try {
      if (dataset === "repositories") {
        return isObject(value)
          && value.repositoryKey === key
          && Number.isInteger(value.stars)
          && value.stars >= 0
          && Number.isFinite(value.updatedAt)
          && isSafeGitHubUrl(value.url, key);
      }
      if (!Array.isArray(value)) return false;
      return value.every((item) => {
        if (!isObject(item) || item.repositoryKey !== key || !isSafeGitHubUrl(item.url, key)) return false;
        if (dataset === "releases") {
          return typeof item.name === "string"
            && typeof item.tag === "string"
            && Number.isFinite(item.publishedAt)
            && typeof item.summary === "string";
        }
        return Number.isInteger(item.number)
          && typeof item.title === "string"
          && (item.state === "open" || item.state === "closed")
          && (item.type === "issue" || item.type === "pull-request")
          && Number.isFinite(item.updatedAt)
          && typeof item.author === "string"
          && isSafeAvatarUrl(item.avatarUrl);
      });
    } catch (_) {
      return false;
    }
  }

  function validatedEntry(dataset, key, entry) {
    if (!isObject(entry) || !Number.isFinite(entry.fetchedAt)) return null;
    if (!validNormalizedValue(dataset, key, entry.value)) return null;
    return { fetchedAt: entry.fetchedAt, value: entry.value };
  }

  function validateCache(candidate) {
    const cache = createEmptyCache();
    if (!isObject(candidate) || candidate.version !== CACHE_VERSION) return cache;
    for (const dataset of ["repositories", "releases", "activity"]) {
      const keys = dataset === "releases" ? REPOSITORY_KEYS : PROJECT_KEYS;
      const source = isObject(candidate[dataset]) ? candidate[dataset] : {};
      for (const key of keys) {
        const entry = validatedEntry(dataset, key, source[key]);
        if (entry) cache[dataset][key] = entry;
      }
    }
    return cache;
  }

  function readCache(storage) {
    try {
      const raw = storage && storage.getItem(CACHE_KEY);
      return raw ? validateCache(JSON.parse(raw)) : createEmptyCache();
    } catch (_) {
      return createEmptyCache();
    }
  }

  function writeCache(storage, cache) {
    try {
      if (!storage) return false;
      storage.setItem(CACHE_KEY, JSON.stringify(validateCache(cache)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cloneCache(cache) {
    return validateCache(JSON.parse(JSON.stringify(cache)));
  }

  function isFresh(entry, now) {
    return Boolean(entry)
      && Number.isFinite(entry.fetchedAt)
      && now >= entry.fetchedAt
      && now - entry.fetchedAt < CACHE_TTL_MS;
  }

  function apiUrl(key, dataset) {
    const repository = configuredRepository(key);
    const root = `https://api.github.com/repos/${repository.owner}/${repository.name}`;
    if (dataset === "repositories") return root;
    if (dataset === "releases") return `${root}/releases?per_page=5`;
    return `${root}/issues?state=all&sort=updated&direction=desc&per_page=10`;
  }

  function buildRequestPlan(cache, now) {
    const plan = [];
    for (const key of PROJECT_KEYS) {
      if (!isFresh(cache.repositories[key], now)) {
        plan.push({ dataset: "repositories", key, url: apiUrl(key, "repositories") });
      }
    }
    for (const key of REPOSITORY_KEYS) {
      if (!isFresh(cache.releases[key], now)) {
        plan.push({ dataset: "releases", key, url: apiUrl(key, "releases") });
      }
    }
    for (const key of PROJECT_KEYS) {
      if (!isFresh(cache.activity[key], now)) {
        plan.push({ dataset: "activity", key, url: apiUrl(key, "activity") });
      }
    }
    return plan;
  }

  function normalizeResponse(request, payload) {
    if (request.dataset === "repositories") return normalizeRepository(request.key, payload);
    if (request.dataset === "releases") return normalizeReleases(request.key, payload);
    return selectOpenFirst(normalizeActivities(request.key, payload), 2);
  }

  async function fetchJson(fetchImpl, url) {
    if (typeof fetchImpl !== "function") throw new TypeError("fetch is unavailable");
    const response = await fetchImpl(url, { headers: { Accept: "application/vnd.github+json" } });
    if (!response || !response.ok) throw new Error(`GitHub API ${response ? response.status : "failure"}`);
    return response.json();
  }

  function statusMap(cache) {
    const statuses = { repositories: {}, releases: {}, activity: {} };
    for (const dataset of Object.keys(statuses)) {
      const keys = dataset === "releases" ? REPOSITORY_KEYS : PROJECT_KEYS;
      for (const key of keys) statuses[dataset][key] = cache[dataset][key] ? "cache" : "static";
    }
    return statuses;
  }

  function createSnapshot(cache, statuses) {
    const snapshot = { repositories: {}, releases: {}, activity: {} };
    for (const dataset of Object.keys(snapshot)) {
      const keys = dataset === "releases" ? REPOSITORY_KEYS : PROJECT_KEYS;
      for (const key of keys) {
        const entry = cache[dataset][key] || null;
        snapshot[dataset][key] = {
          value: entry ? entry.value : null,
          fetchedAt: entry ? entry.fetchedAt : null,
          status: statuses[dataset][key],
        };
      }
    }
    return snapshot;
  }

  async function startGitHubData(options) {
    const settings = options || {};
    const clock = typeof settings.now === "function" ? settings.now : Date.now;
    const onSnapshot = typeof settings.onSnapshot === "function" ? settings.onSnapshot : () => {};
    const cache = readCache(settings.storage);
    const statuses = statusMap(cache);
    const initial = createSnapshot(cache, statuses);
    onSnapshot(initial);

    const requests = buildRequestPlan(cache, clock());
    if (requests.length === 0) return initial;

    const nextCache = cloneCache(cache);

    const refresh = async (request) => {
      let publish = false;
      try {
        const payload = await fetchJson(settings.fetchImpl, request.url);
        const value = normalizeResponse(request, payload);
        nextCache[request.dataset][request.key] = { fetchedAt: clock(), value };
        statuses[request.dataset][request.key] = "live";
        writeCache(settings.storage, nextCache);
        publish = true;
      } catch (_) {
        const nextStatus = nextCache[request.dataset][request.key]
          ? "stale"
          : request.dataset === "activity" ? "unavailable" : "static";
        publish = statuses[request.dataset][request.key] !== nextStatus;
        statuses[request.dataset][request.key] = nextStatus;
      }
      if (publish) onSnapshot(createSnapshot(nextCache, statuses));
    };

    const activityRequests = requests.filter((request) => request.dataset === "activity");
    const supportingRequests = requests.filter((request) => request.dataset !== "activity");
    await Promise.all(activityRequests.map(refresh));
    await Promise.all(supportingRequests.map(refresh));

    const finalSnapshot = createSnapshot(nextCache, statuses);
    return finalSnapshot;
  }

  const api = {
    REPOSITORIES,
    REPOSITORY_KEYS,
    PROJECT_KEYS,
    CACHE_KEY,
    CACHE_VERSION,
    CACHE_TTL_MS,
    createEmptyCache,
    readCache,
    writeCache,
    isFresh,
    buildRequestPlan,
    startGitHubData,
    isSafeGitHubUrl,
    normalizeRepository,
    normalizeReleases,
    normalizeActivity,
    normalizeActivities,
    selectOpenFirst,
    mergeReleases,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalObject && globalObject.document) globalObject.ASystemGitHubData = api;
})(typeof window !== "undefined" ? window : globalThis);

(function attachASystemGitHubUI(globalObject) {
  "use strict";

  const COPY = {
    en: {
      live: "Live", cached: "Cached", unavailable: "Unavailable", updated: "Updated", stars: "stars",
      latestRelease: "Latest release", noRelease: "No release yet",
      issue: "Issue", pullRequest: "PR", open: "Open", closed: "Closed",
      released: "Released", releaseFallback: "View release details on GitHub.",
      contribute: "Contribute on GitHub",
    },
    "zh-CN": {
      live: "实时", cached: "缓存", unavailable: "暂不可用", updated: "更新于", stars: "星标",
      latestRelease: "最新版本", noRelease: "暂无版本",
      issue: "Issue", pullRequest: "PR", open: "开放", closed: "已关闭",
      released: "发布于", releaseFallback: "在 GitHub 查看版本详情。",
      contribute: "前往 GitHub 参与贡献",
    },
  };
  const PROJECT_LABELS = Object.freeze({ areno: "AReno", awex: "Awex", astate: "AState", amem: "AMem" });
  const UPDATE_FALLBACKS = new WeakMap();

  function normalizedLocale(locale) { return locale === "zh-CN" ? "zh-CN" : "en"; }
  function copy(locale) { return COPY[normalizedLocale(locale)]; }

  function formatCompactNumber(value, locale) {
    return new Intl.NumberFormat(normalizedLocale(locale), {
      notation: "compact", maximumFractionDigits: 1,
    }).format(value);
  }

  function formatRelativeTime(timestamp, locale, now) {
    const delta = timestamp - now;
    const absolute = Math.abs(delta);
    let divisor = 1000;
    let unit = "second";
    if (absolute >= 86_400_000) { divisor = 86_400_000; unit = "day"; }
    else if (absolute >= 3_600_000) { divisor = 3_600_000; unit = "hour"; }
    else if (absolute >= 60_000) { divisor = 60_000; unit = "minute"; }
    const value = Math.round(delta / divisor);
    return new Intl.RelativeTimeFormat(normalizedLocale(locale), {
      numeric: "auto", style: "narrow",
    }).format(value, unit);
  }

  function freshnessLabel(slice, locale, now) {
    const words = copy(locale);
    if (!slice || slice.status === "static") return "";
    if (slice.status === "unavailable") return words.unavailable;
    if (slice.status === "live") return words.live;
    if (slice.status === "stale") return words.cached;
    return Number.isFinite(slice.fetchedAt) ? `${words.updated} ${formatRelativeTime(slice.fetchedAt, locale, now)}` : "";
  }

  function combinedSlice(left, right) {
    const slices = [left, right];
    const available = slices.filter((slice) => slice && slice.value != null);
    const stale = slices.some((slice) => slice && slice.status === "stale");
    if (!stale && available.length < slices.length) {
      return { status: "static", fetchedAt: null };
    }
    const status = stale ? "stale"
      : slices.every((slice) => slice.status === "live") ? "live"
      : "cache";
    const fetchedAtValues = available
      .map((slice) => slice.fetchedAt)
      .filter(Number.isFinite);
    return {
      status,
      fetchedAt: fetchedAtValues.length > 0 ? Math.min(...fetchedAtValues) : null,
    };
  }

  function buildProjectView(key, repositorySlice, releaseSlice, locale, now) {
    if ((!repositorySlice || repositorySlice.value === null)
      && (!releaseSlice || releaseSlice.value === null)) return null;
    const words = copy(locale);
    const repository = repositorySlice && repositorySlice.value != null
      ? repositorySlice.value : null;
    const releases = releaseSlice && releaseSlice.value != null
      ? releaseSlice.value : null;
    const latest = Array.isArray(releases) ? releases[0] : null;
    const statusSlice = combinedSlice(repositorySlice, releaseSlice);
    return {
      repositoryKey: key,
      stars: repository ? formatCompactNumber(repository.stars, locale) : null,
      release: Array.isArray(releases) ? (latest ? latest.name : words.noRelease) : null,
      updated: repository ? formatRelativeTime(repository.updatedAt, locale, now) : null,
      status: freshnessLabel(statusSlice, locale, now),
      labels: { stars: words.stars, release: words.latestRelease, updated: words.updated },
    };
  }

  function buildReleaseViews(snapshot, locale, now, dataApi) {
    const api = dataApi || (globalObject && globalObject.ASystemGitHubData);
    const releases = {};
    for (const key of api.REPOSITORY_KEYS) releases[key] = snapshot.releases[key].value || [];
    return api.mergeReleases(releases, 4).map((release) => {
      const slice = snapshot.releases[release.repositoryKey];
      return {
        repositoryKey: release.repositoryKey,
        repository: api.REPOSITORIES[release.repositoryKey].label,
        title: release.name,
        body: release.summary || copy(locale).releaseFallback,
        date: `${copy(locale).released} ${formatRelativeTime(release.publishedAt, locale, now)}`,
        status: freshnessLabel(slice, locale, now),
        url: release.url,
      };
    });
  }

  function buildActivityViews(key, slice, locale, now) {
    if (!slice || !Array.isArray(slice.value)) return [];
    const words = copy(locale);
    return slice.value.map((item) => ({
      title: item.title,
      url: item.url,
      meta: `${item.type === "pull-request" ? words.pullRequest : words.issue} #${item.number} · ${item.state === "open" ? words.open : words.closed} · ${formatRelativeTime(item.updatedAt, locale, now)}`,
      author: item.author,
      avatarUrl: item.avatarUrl,
      accessibleName: `${PROJECT_LABELS[key]} ${item.type === "pull-request" ? words.pullRequest : words.issue} ${item.number}: ${item.title}`,
    }));
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderProjects(doc, snapshot, locale, now, dataApi) {
    for (const key of dataApi.PROJECT_KEYS) {
      const card = doc.querySelector(`[data-project-card="${key}"]`);
      const view = buildProjectView(key, snapshot.repositories[key], snapshot.releases[key], locale, now);
      if (!card || !view) continue;
      const metadata = card.querySelector("[data-project-meta]");
      const hasAvailableData = view.stars !== null || view.release !== null || view.updated !== null;
      if (hasAvailableData) {
        setText(card, "[data-project-stars-label]", view.labels.stars);
        setText(card, "[data-project-release-label]", view.labels.release);
        setText(card, "[data-project-updated-label]", view.labels.updated);
      }
      if (view.stars !== null) {
        setText(card, "[data-project-stars]", view.stars);
      }
      if (view.release !== null) {
        setText(card, "[data-project-release]", view.release);
      }
      if (view.updated !== null) {
        setText(card, "[data-project-updated]", view.updated);
      }
      setText(card, "[data-project-status]", view.status);
      if (metadata && hasAvailableData) metadata.hidden = false;
    }
  }

  function rememberUpdateFallback(card, locale) {
    let localized = UPDATE_FALLBACKS.get(card);
    if (!localized) {
      localized = {};
      UPDATE_FALLBACKS.set(card, localized);
    }
    const language = normalizedLocale(locale);
    if (!localized[language]) {
      localized[language] = {
        href: card.dataset.updateFallbackHref,
        repository: card.dataset.updateFallbackRepository,
        title: card.querySelector("[data-update-title]").textContent.trim(),
        body: card.querySelector("[data-update-body]").textContent.trim(),
      };
    }
    return localized[language];
  }

  function restoreUpdateFallback(card, fallback) {
    card.href = fallback.href;
    setText(card, "[data-update-repository]", fallback.repository);
    setText(card, "[data-update-status]", "");
    setText(card, "[data-update-title]", fallback.title);
    setText(card, "[data-update-body]", fallback.body);
    setText(card, "[data-update-date]", "");
  }

  function renderUpdates(doc, snapshot, locale, now, dataApi) {
    const slots = Array.from(doc.querySelectorAll("[data-update-slot]"));
    const fallbacks = slots.map((card) => rememberUpdateFallback(card, locale));
    const views = buildReleaseViews(snapshot, locale, now, dataApi);
    slots.forEach((card, index) => {
      const view = views[index];
      if (!view) {
        restoreUpdateFallback(card, fallbacks[index]);
        return;
      }
      card.href = view.url;
      setText(card, "[data-update-repository]", view.repository);
      setText(card, "[data-update-status]", view.status);
      setText(card, "[data-update-title]", view.title);
      setText(card, "[data-update-body]", view.body);
      setText(card, "[data-update-date]", view.date);
    });
  }

  function activityLink(doc, view) {
    const link = doc.createElement("a");
    link.className = "community-activity";
    link.href = view.url;
    link.setAttribute("aria-label", view.accessibleName);
    link.title = view.title;
    const person = doc.createElement("span");
    person.className = "community-activity__person";
    let avatar;
    if (view.avatarUrl) {
      avatar = doc.createElement("img");
      avatar.src = view.avatarUrl;
      avatar.alt = "";
      avatar.width = 24;
      avatar.height = 24;
      avatar.loading = "lazy";
      avatar.referrerPolicy = "no-referrer";
    } else {
      avatar = doc.createElement("span");
      avatar.className = "community-activity__avatar community-activity__avatar--fallback";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = "A";
    }
    if (view.avatarUrl) avatar.className = "community-activity__avatar";
    const author = doc.createElement("span");
    author.textContent = view.author;
    person.append(avatar, author);
    const title = doc.createElement("strong");
    title.className = "community-activity__title";
    title.textContent = view.title;
    const meta = doc.createElement("span");
    meta.className = "community-activity__meta";
    meta.textContent = view.meta;
    link.append(person, title, meta);
    return link;
  }

  function renderCommunity(doc, snapshot, locale, now, dataApi) {
    for (const key of dataApi.PROJECT_KEYS) {
      const card = doc.querySelector(`[data-community-card="${key}"]`);
      const slice = snapshot.activity[key];
      const views = buildActivityViews(key, slice, locale, now);
      if (!card) continue;
      const repository = snapshot.repositories && snapshot.repositories[key];
      if (repository && repository.value && Number.isInteger(repository.value.stars)) {
        setText(card, "[data-community-stars]", formatCompactNumber(repository.value.stars, locale));
      }
      const list = card.querySelector("[data-community-list]");
      const fallback = card.querySelector("[data-community-fallback]");
      if (!list) continue;
      if (views.length === 0) {
        list.replaceChildren();
        list.hidden = true;
        if (fallback) fallback.hidden = false;
        setText(card, "[data-community-status]", freshnessLabel(slice, locale, now));
        continue;
      }
      list.replaceChildren(...views.map((view) => activityLink(doc, view)));
      if (fallback) fallback.hidden = true;
      list.hidden = false;
      setText(card, "[data-community-status]", freshnessLabel(slice, locale, now));
    }
  }

  function renderSnapshot(doc, snapshot, locale, now, dataApi) {
    const api = dataApi || (globalObject && globalObject.ASystemGitHubData);
    if (!doc || !snapshot || !api) return;
    renderProjects(doc, snapshot, locale, now, api);
    renderUpdates(doc, snapshot, locale, now, api);
    renderCommunity(doc, snapshot, locale, now, api);
  }

  function initGitHubLiveData(options) {
    const settings = options || {};
    const dataApi = settings.dataApi || (globalObject && globalObject.ASystemGitHubData);
    const clock = typeof settings.now === "function" ? settings.now : Date.now;
    const getLocale = typeof settings.getLocale === "function" ? settings.getLocale : () => "en";
    let snapshot = null;
    const render = (locale) => {
      if (snapshot) renderSnapshot(settings.doc, snapshot, locale || getLocale(), clock(), dataApi);
    };
    const ready = dataApi.startGitHubData({
      fetchImpl: settings.fetchImpl,
      storage: settings.storage,
      now: clock,
      onSnapshot(nextSnapshot) {
        snapshot = nextSnapshot;
        render(getLocale());
      },
    });
    return { ready, render, getSnapshot() { return snapshot; } };
  }

  const api = {
    formatCompactNumber,
    formatRelativeTime,
    freshnessLabel,
    buildProjectView,
    buildReleaseViews,
    buildActivityViews,
    renderSnapshot,
    initGitHubLiveData,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalObject && globalObject.document) globalObject.ASystemGitHubUI = api;
})(typeof window !== "undefined" ? window : globalThis);

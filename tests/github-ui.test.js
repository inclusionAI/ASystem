"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ui = require("../assets/github-ui.js");
const data = require("../assets/github-data.js");

const NOW = Date.parse("2026-07-16T10:00:00Z");

test("formats compact stars and relative time for both locales", () => {
  assert.match(ui.formatCompactNumber(1280, "en"), /1[.,]3K/);
  assert.ok(ui.formatCompactNumber(1280, "zh-CN").length > 0);
  assert.match(ui.formatRelativeTime(NOW - 12 * 60_000, "en", NOW), /12/);
  assert.match(ui.formatRelativeTime(NOW - 12 * 60_000, "zh-CN", NOW), /12/);
});

test("maps freshness states to subtle localized labels", () => {
  assert.equal(ui.freshnessLabel({ status: "live", fetchedAt: NOW }, "en", NOW), "Live");
  assert.equal(ui.freshnessLabel({ status: "stale", fetchedAt: NOW }, "en", NOW), "Cached");
  assert.equal(ui.freshnessLabel({ status: "static", fetchedAt: null }, "en", NOW), "");
  assert.equal(ui.freshnessLabel({ status: "unavailable", fetchedAt: null }, "en", NOW), "Unavailable");
  assert.match(ui.freshnessLabel({ status: "cache", fetchedAt: NOW - 12 * 60_000 }, "en", NOW), /^Updated .*12/);
  assert.match(ui.freshnessLabel({ status: "cache", fetchedAt: 0 }, "en", NOW), /^Updated /);
  assert.equal(ui.freshnessLabel({ status: "live", fetchedAt: NOW }, "zh-CN", NOW), "实时");
});

test("builds concise project metadata and handles an empty release list", () => {
  const view = ui.buildProjectView(
    "areno",
    { status: "live", fetchedAt: NOW, value: { stars: 1280, updatedAt: NOW - 3_600_000 } },
    { status: "live", fetchedAt: NOW, value: [] },
    "en",
    NOW
  );

  assert.equal(view.stars, "1.3K");
  assert.equal(view.release, "No release yet");
  assert.match(view.updated, /1/);
  assert.equal(view.status, "Live");
});

test("preserves static project fields and reports mixed freshness conservatively", () => {
  const liveRepository = {
    status: "live",
    fetchedAt: NOW,
    value: { stars: 1280, updatedAt: NOW - 3_600_000 },
  };
  const liveRelease = {
    status: "live",
    fetchedAt: NOW,
    value: [{ name: "AReno v1.0.0" }],
  };
  const staticRepository = { status: "static", fetchedAt: null, value: null };
  const staticRelease = { status: "static", fetchedAt: null, value: null };

  const repositoryOnly = ui.buildProjectView(
    "areno", liveRepository, staticRelease, "en", NOW
  );
  assert.equal(repositoryOnly.stars, "1.3K");
  assert.equal(repositoryOnly.release, null);
  assert.match(repositoryOnly.updated, /1/);
  assert.equal(repositoryOnly.status, "");

  const releaseOnly = ui.buildProjectView(
    "areno", staticRepository, liveRelease, "en", NOW
  );
  assert.equal(releaseOnly.stars, null);
  assert.equal(releaseOnly.release, "AReno v1.0.0");
  assert.equal(releaseOnly.updated, null);
  assert.equal(releaseOnly.status, "");

  const cachedRelease = { ...liveRelease, status: "cache", fetchedAt: NOW - 60_000 };
  assert.match(
    ui.buildProjectView("areno", liveRepository, cachedRelease, "en", NOW).status,
    /^Updated /
  );
  const cachedRepository = { ...liveRepository, status: "cache" };
  assert.equal(
    ui.buildProjectView("areno", cachedRepository, staticRelease, "en", NOW).status,
    ""
  );

  const staleRepository = { ...liveRepository, status: "stale" };
  assert.equal(
    ui.buildProjectView("areno", staleRepository, liveRelease, "en", NOW).status,
    "Cached"
  );
  assert.equal(
    ui.buildProjectView("areno", staleRepository, staticRelease, "en", NOW).status,
    "Cached"
  );
});

test("localizes every metadata label while preserving unavailable field values", () => {
  const nodes = Object.fromEntries([
    "[data-project-stars]",
    "[data-project-release]",
    "[data-project-updated]",
    "[data-project-stars-label]",
    "[data-project-release-label]",
    "[data-project-updated-label]",
    "[data-project-status]",
  ].map((selector) => [selector, { textContent: `static ${selector}` }]));
  const metadata = { hidden: true };
  const card = {
    querySelector(selector) {
      return selector === "[data-project-meta]" ? metadata : nodes[selector] || null;
    },
  };
  const doc = {
    querySelector(selector) {
      return selector === '[data-project-card="areno"]' ? card : null;
    },
    querySelectorAll() { return []; },
  };
  const snapshot = {
    repositories: {
      areno: {
        status: "live",
        fetchedAt: NOW,
        value: { stars: 1280, updatedAt: NOW - 3_600_000 },
      },
    },
    releases: { areno: { status: "static", fetchedAt: null, value: null } },
    activity: { areno: { status: "static", fetchedAt: null, value: null } },
  };
  const dataApi = {
    PROJECT_KEYS: ["areno"],
    REPOSITORY_KEYS: [],
    REPOSITORIES: {},
    mergeReleases() { return []; },
  };

  ui.renderSnapshot(doc, snapshot, "zh-CN", NOW, dataApi);

  assert.notEqual(nodes["[data-project-stars]"].textContent, "static [data-project-stars]");
  assert.match(nodes["[data-project-updated]"].textContent, /1/);
  assert.equal(
    nodes["[data-project-release]"].textContent,
    "static [data-project-release]"
  );
  assert.equal(nodes["[data-project-stars-label]"].textContent, "星标");
  assert.equal(nodes["[data-project-release-label]"].textContent, "最新版本");
  assert.equal(nodes["[data-project-updated-label]"].textContent, "更新于");
  assert.equal(nodes["[data-project-status]"].textContent, "");
  assert.equal(metadata.hidden, false);
});

test("keeps GitHub-authored activity titles unchanged", () => {
  const slice = {
    status: "cache",
    fetchedAt: NOW - 60_000,
    value: [{
      repositoryKey: "areno",
      number: 163,
      title: "feat: add AReno dashboard",
      state: "open",
      type: "pull-request",
      updatedAt: NOW - 120_000,
      url: "https://github.com/inclusionAI/AReno/pull/163",
      author: "octocat",
      avatarUrl: "https://avatars.githubusercontent.com/u/583231?v=4",
    }],
  };

  const english = ui.buildActivityViews("areno", slice, "en", NOW)[0];
  const chinese = ui.buildActivityViews("areno", slice, "zh-CN", NOW)[0];
  assert.equal(english.title, "feat: add AReno dashboard");
  assert.equal(chinese.title, english.title);
  assert.match(english.meta, /PR #163.*Open/);
  assert.match(chinese.meta, /PR #163.*开放/);
  assert.equal(english.author, "octocat");
  assert.equal(english.avatarUrl, "https://avatars.githubusercontent.com/u/583231?v=4");
  assert.match(english.accessibleName, /^AReno PR 163:/);
});

test("sorts the release feed across repositories and keeps four slots", () => {
  const releasePaths = {
    asystem: "ASystem", areno: "AReno", awex: "Awex", astate: "AState", amem: "asystem-amem",
  };
  const releaseSlice = (repositoryKey, publishedAt) => ({
    status: "live",
    fetchedAt: NOW,
    value: [{
      repositoryKey,
      name: `${repositoryKey} release`,
      tag: `v${publishedAt}`,
      url: `https://github.com/inclusionAI/${releasePaths[repositoryKey]}/releases/tag/v${publishedAt}`,
      publishedAt,
      summary: "Release summary",
    }],
  });
  const snapshot = { releases: {
    asystem: releaseSlice("asystem", 5),
    areno: releaseSlice("areno", 4),
    awex: releaseSlice("awex", 3),
    astate: releaseSlice("astate", 2),
    amem: releaseSlice("amem", 1),
  } };

  const views = ui.buildReleaseViews(snapshot, "en", NOW, data);
  assert.equal(views.length, 4);
  assert.deepEqual(views.map((view) => view.repositoryKey), ["asystem", "areno", "awex", "astate"]);
});

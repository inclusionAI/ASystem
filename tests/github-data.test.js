"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const data = require("../assets/github-data.js");

const ISO = {
  old: "2026-07-10T10:00:00Z",
  middle: "2026-07-12T10:00:00Z",
  new: "2026-07-14T10:00:00Z",
};

test("defines the exact ASystem repository registry", () => {
  assert.deepEqual(data.REPOSITORY_KEYS, ["asystem", "areno", "awex", "astate", "amem"]);
  assert.deepEqual(data.PROJECT_KEYS, ["areno", "awex", "astate", "amem"]);
  assert.equal(data.REPOSITORIES.amem.name, "asystem-amem");
});

test("accepts only the configured repository's github.com URLs", () => {
  assert.equal(data.isSafeGitHubUrl("https://github.com/inclusionAI/AReno/issues/162", "areno"), true);
  assert.equal(data.isSafeGitHubUrl("http://github.com/inclusionAI/AReno/issues/162", "areno"), false);
  assert.equal(data.isSafeGitHubUrl("https://example.com/inclusionAI/AReno/issues/162", "areno"), false);
  assert.equal(data.isSafeGitHubUrl("https://github.com/inclusionAI/Awex/issues/162", "areno"), false);
});

test("normalizes repository metadata", () => {
  assert.deepEqual(data.normalizeRepository("areno", {
    full_name: "inclusionAI/AReno",
    stargazers_count: 321,
    updated_at: ISO.new,
    html_url: "https://github.com/inclusionAI/AReno",
  }), {
    repositoryKey: "areno",
    stars: 321,
    updatedAt: Date.parse(ISO.new),
    url: "https://github.com/inclusionAI/AReno",
  });
});

test("normalizes public non-draft releases and plain-text summaries", () => {
  const releases = data.normalizeReleases("areno", [
    {
      draft: false,
      name: "AReno v1.2.0",
      tag_name: "v1.2.0",
      html_url: "https://github.com/inclusionAI/AReno/releases/tag/v1.2.0",
      published_at: ISO.new,
      body: "## Highlights\n\n[Fast setup](https://example.com) for new users.",
    },
    {
      draft: true,
      name: "private draft",
      tag_name: "draft",
      html_url: "https://github.com/inclusionAI/AReno/releases/tag/draft",
      published_at: ISO.middle,
      body: "hidden",
    },
  ]);

  assert.equal(releases.length, 1);
  assert.equal(releases[0].name, "AReno v1.2.0");
  assert.equal(releases[0].summary, "Highlights");
  assert.equal(releases[0].publishedAt, Date.parse(ISO.new));
});

test("accepts empty and draft-only release collections as valid empty states", () => {
  assert.deepEqual(data.normalizeReleases("areno", []), []);
  assert.deepEqual(data.normalizeReleases("areno", [{ draft: true }]), []);
});

test("uses the first assignee identity and falls back to the issue creator", () => {
  const issue = data.normalizeActivity("awex", {
    number: 111,
    title: "Benchmark table correction",
    state: "open",
    updated_at: ISO.middle,
    html_url: "https://github.com/inclusionAI/Awex/issues/111",
    user: {
      login: "octocat",
      avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
    },
    assignee: {
      login: "assigned-maintainer",
      avatar_url: "https://avatars.githubusercontent.com/u/9919?v=4",
    },
  });
  const pullRequest = data.normalizeActivity("awex", {
    number: 110,
    title: "Add worker task patch",
    state: "closed",
    updated_at: ISO.new,
    html_url: "https://github.com/inclusionAI/Awex/pull/110",
    pull_request: { url: "https://api.github.com/repos/inclusionAI/Awex/pulls/110" },
    user: {
      login: "hubot",
      avatar_url: "https://avatars.githubusercontent.com/u/480938?v=4",
    },
  });

  assert.equal(issue.type, "issue");
  assert.equal(issue.author, "assigned-maintainer");
  assert.equal(issue.avatarUrl, "https://avatars.githubusercontent.com/u/9919?v=4");
  assert.equal(pullRequest.type, "pull-request");
  assert.equal(pullRequest.author, "hubot");
  assert.equal(pullRequest.avatarUrl, "https://avatars.githubusercontent.com/u/480938?v=4");
});

test("selects open activity first and fills with recently closed activity", () => {
  const items = [
    { number: 1, state: "closed", updatedAt: Date.parse(ISO.new) },
    { number: 2, state: "open", updatedAt: Date.parse(ISO.old) },
    { number: 3, state: "closed", updatedAt: Date.parse(ISO.middle) },
  ];

  assert.deepEqual(data.selectOpenFirst(items, 2).map((item) => item.number), [2, 1]);
});

test("merges releases from every repository and keeps the newest four", () => {
  const release = (repositoryKey, tag, publishedAt) => ({ repositoryKey, tag, publishedAt });
  const merged = data.mergeReleases({
    asystem: [release("asystem", "v5", 5), release("asystem", "v1", 1)],
    areno: [release("areno", "v4", 4)],
    awex: [release("awex", "v3", 3)],
    astate: [release("astate", "v2", 2)],
    amem: [],
  }, 4);

  assert.deepEqual(merged.map((item) => item.tag), ["v5", "v4", "v3", "v2"]);
});

test("rejects malformed and cross-repository payloads", () => {
  assert.throws(() => data.normalizeRepository("areno", { full_name: "inclusionAI/Awex" }));
  assert.throws(() => data.normalizeReleases("areno", { message: "not an array" }));
  assert.throws(
    () => data.normalizeReleases("areno", [null]),
    /No valid releases in payload/
  );
  assert.throws(() => data.normalizeActivity("missing", {}));
});

function memoryStorage(initialValue) {
  return {
    value: initialValue || null,
    getItem(key) { assert.equal(key, data.CACHE_KEY); return this.value; },
    setItem(key, value) { assert.equal(key, data.CACHE_KEY); this.value = value; },
  };
}

function completeCache(fetchedAt) {
  const cache = data.createEmptyCache();
  for (const key of data.PROJECT_KEYS) {
    const repository = data.REPOSITORIES[key];
    cache.repositories[key] = {
      fetchedAt,
      value: {
        repositoryKey: key,
        stars: 10,
        updatedAt: fetchedAt,
        url: `https://github.com/${repository.owner}/${repository.name}`,
      },
    };
    cache.activity[key] = { fetchedAt, value: [] };
  }
  for (const key of data.REPOSITORY_KEYS) cache.releases[key] = { fetchedAt, value: [] };
  return cache;
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

test("uses a valid fresh cache without making a request", async () => {
  const now = Date.parse("2026-07-16T10:00:00Z");
  const storage = memoryStorage(JSON.stringify(completeCache(now - 60_000)));
  let requestCount = 0;
  const snapshots = [];

  const result = await data.startGitHubData({
    storage,
    now: () => now,
    fetchImpl: async () => { requestCount += 1; throw new Error("unexpected request"); },
    onSnapshot(snapshot) { snapshots.push(snapshot); },
  });

  assert.equal(requestCount, 0);
  assert.equal(snapshots.length, 1);
  assert.equal(result.repositories.areno.status, "cache");
});

test("a fully stale cache plans exactly thirteen requests", () => {
  const now = Date.parse("2026-07-16T10:00:00Z");
  const stale = completeCache(now - data.CACHE_TTL_MS - 1);
  const plan = data.buildRequestPlan(stale, now);

  assert.equal(plan.length, 13);
  assert.equal(plan.filter((item) => item.dataset === "repositories").length, 4);
  assert.equal(plan.filter((item) => item.dataset === "releases").length, 5);
  assert.equal(plan.filter((item) => item.dataset === "activity").length, 4);
});

test("prioritizes the four Community issue requests", async () => {
  const requested = [];

  await data.startGitHubData({
    storage: memoryStorage(),
    now: () => Date.parse("2026-07-16T10:00:00Z"),
    fetchImpl: async (url) => {
      requested.push(url);
      return url.includes("/issues?")
        ? response([])
        : response({ message: "not needed for this assertion" }, 429);
    },
    onSnapshot() {},
  });

  assert.equal(requested.length, 13);
  assert.equal(requested.slice(0, 4).every((url) => url.includes("/issues?")), true);
});

test("refreshes only stale slices and marks successful data live", async () => {
  const now = Date.parse("2026-07-16T10:00:00Z");
  const cache = completeCache(now - 60_000);
  cache.repositories.areno.fetchedAt = now - data.CACHE_TTL_MS - 1;
  const storage = memoryStorage(JSON.stringify(cache));
  const requested = [];

  const result = await data.startGitHubData({
    storage,
    now: () => now,
    fetchImpl: async (url) => {
      requested.push(url);
      return response({
        full_name: "inclusionAI/AReno",
        stargazers_count: 99,
        updated_at: "2026-07-16T09:30:00Z",
        html_url: "https://github.com/inclusionAI/AReno",
      });
    },
    onSnapshot() {},
  });

  assert.equal(requested.length, 1);
  assert.equal(result.repositories.areno.value.stars, 99);
  assert.equal(result.repositories.areno.status, "live");
  assert.equal(result.repositories.awex.status, "cache");
});

test("publishes activity as soon as its GitHub API request completes", async () => {
  const now = Date.parse("2026-07-16T10:00:00Z");
  const cache = completeCache(now - 60_000);
  cache.activity.areno.fetchedAt = now - data.CACHE_TTL_MS - 1;
  cache.releases.asystem.fetchedAt = now - data.CACHE_TTL_MS - 1;
  let resolveRelease;
  const delayedRelease = new Promise((resolve) => { resolveRelease = resolve; });
  const snapshots = [];

  const ready = data.startGitHubData({
    storage: memoryStorage(JSON.stringify(cache)),
    now: () => now,
    fetchImpl: async (url) => {
      if (url.includes("/issues?")) {
        return response([{
          number: 166,
          title: "docs: add code navigation map for agents",
          state: "open",
          updated_at: ISO.new,
          html_url: "https://github.com/inclusionAI/AReno/pull/166",
          pull_request: {},
          user: {
            login: "vcvyg",
            avatar_url: "https://avatars.githubusercontent.com/u/200067708?v=4",
          },
          assignee: null,
        }]);
      }
      return delayedRelease;
    },
    onSnapshot(snapshot) { snapshots.push(snapshot); },
  });

  await new Promise((resolve) => setImmediate(resolve));
  const publishedBeforeRelease = snapshots.some(
    (snapshot) => snapshot.activity.areno.status === "live"
  );
  resolveRelease(response([]));
  await ready;

  assert.equal(publishedBeforeRelease, true);
});

test("isolates failures and retains stale cache without retrying", async () => {
  const now = Date.parse("2026-07-16T10:00:00Z");
  const cache = completeCache(now);
  cache.repositories.areno.fetchedAt = now - data.CACHE_TTL_MS - 1;
  cache.repositories.awex.fetchedAt = now - data.CACHE_TTL_MS - 1;
  const storage = memoryStorage(JSON.stringify(cache));
  let requestCount = 0;

  const result = await data.startGitHubData({
    storage,
    now: () => now,
    fetchImpl: async (url) => {
      requestCount += 1;
      if (url.includes("/AReno")) return response({ message: "rate limited" }, 403);
      return response({
        full_name: "inclusionAI/Awex",
        stargazers_count: 42,
        updated_at: "2026-07-16T09:45:00Z",
        html_url: "https://github.com/inclusionAI/Awex",
      });
    },
    onSnapshot() {},
  });

  assert.equal(requestCount, 2);
  assert.equal(result.repositories.areno.status, "stale");
  assert.equal(result.repositories.areno.value.stars, 10);
  assert.equal(result.repositories.awex.status, "live");
  assert.equal(result.repositories.awex.value.stars, 42);
});

test("retains a stale release cache when every returned row is malformed", async () => {
  const now = Date.parse("2026-07-16T10:00:00Z");
  const cache = completeCache(now - 60_000);
  cache.releases.areno = {
    fetchedAt: now - data.CACHE_TTL_MS - 1,
    value: [{
      repositoryKey: "areno",
      name: "AReno v1.0.0",
      tag: "v1.0.0",
      url: "https://github.com/inclusionAI/AReno/releases/tag/v1.0.0",
      publishedAt: Date.parse(ISO.old),
      summary: "Stable cache",
    }],
  };
  const storage = memoryStorage(JSON.stringify(cache));
  let requestCount = 0;

  const result = await data.startGitHubData({
    storage,
    now: () => now,
    fetchImpl: async () => {
      requestCount += 1;
      return response([null]);
    },
    onSnapshot() {},
  });

  assert.equal(requestCount, 1);
  assert.equal(result.releases.areno.status, "stale");
  assert.equal(result.releases.areno.value[0].name, "AReno v1.0.0");
});

test("storage exceptions preserve live rendering", async () => {
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const cache = data.readCache(storage);
  assert.deepEqual(cache, data.createEmptyCache());
  assert.equal(data.writeCache(storage, cache), false);
});

test("ignores corrupt, wrong-version, and unsafe cached records", () => {
  assert.deepEqual(data.readCache(memoryStorage("{")), data.createEmptyCache());
  assert.deepEqual(
    data.readCache(memoryStorage(JSON.stringify({ version: 99, repositories: {} }))),
    data.createEmptyCache()
  );
  const unsafe = completeCache(Date.parse("2026-07-16T09:00:00Z"));
  unsafe.repositories.areno.value.url = "https://example.com/inclusionAI/AReno";
  assert.equal(data.readCache(memoryStorage(JSON.stringify(unsafe))).repositories.areno, undefined);
});

test("a first-load 429 marks Community unavailable and does not retry", async () => {
  let requestCount = 0;
  const snapshots = [];
  const result = await data.startGitHubData({
    storage: memoryStorage(),
    now: () => Date.parse("2026-07-16T10:00:00Z"),
    fetchImpl: async () => { requestCount += 1; return response({ message: "rate limited" }, 429); },
    onSnapshot(snapshot) { snapshots.push(snapshot); },
  });

  assert.equal(requestCount, 13);
  assert.equal(snapshots.length, 5);
  assert.equal(result.repositories.areno.status, "static");
  assert.equal(result.releases.asystem.status, "static");
  assert.equal(result.activity.amem.status, "unavailable");
});

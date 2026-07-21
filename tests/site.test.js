"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const site = require("../assets/main.js");

test("normalizes supported locales and defaults to English", () => {
  assert.equal(site.normalizeLanguage("en"), "en");
  assert.equal(site.normalizeLanguage("zh-CN"), "zh-CN");
  assert.equal(site.normalizeLanguage("fr"), "en");
  assert.equal(site.normalizeLanguage(null), "en");
});

test("returns Chinese translation and preserves English fallback", () => {
  assert.equal(site.translatedValue("nav.home", "zh-CN", "Home"), "首页");
  assert.equal(site.translatedValue("metrics.nodes.value", "zh-CN", "20K+"), "2万+");
  assert.equal(site.translatedValue("metrics.workflows.value", "zh-CN", "100+"), "100+");
  assert.equal(site.translatedValue("metrics.projects.value", "zh-CN", "4"), "4");
  assert.equal(site.translatedValue("missing.key", "zh-CN", "Fallback"), "Fallback");
  assert.equal(site.translatedValue("nav.home", "en", "Home"), "Home");
});

test("capability values and installation links keep localization contracts", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const installationUrl = "https://asystem-ai.io/docs/areno/getting-started/installation.html";

  for (const key of (
    "metrics.nodes.value metrics.workflows.value metrics.projects.value"
  ).split(" ")) {
    assert.ok(html.includes(`data-i18n="${key}"`), key);
  }
  assert.equal(html.split(installationUrl).length - 1, 2);
  assert.ok(!html.includes('href="/docs/areno/getting-started/installation.html"'));
});

test("storage failures never break locale fallback", () => {
  const brokenStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(site.readStoredLanguage(brokenStorage), "en");
  assert.equal(site.writeStoredLanguage(brokenStorage, "zh-CN"), false);
});

test("valid saved locale is restored", () => {
  const storage = {
    value: "zh-CN",
    getItem(key) { assert.equal(key, "asystem.locale"); return this.value; },
    setItem(key, value) { assert.equal(key, "asystem.locale"); this.value = value; },
  };
  assert.equal(site.readStoredLanguage(storage), "zh-CN");
  assert.equal(site.writeStoredLanguage(storage, "en"), true);
  assert.equal(storage.value, "en");
});

function documentStub() {
  const buttons = ["en", "zh-CN"].map((locale) => ({
    dataset: { locale },
    attributes: {},
    handlers: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    click() { this.handlers.click(); },
  }));
  return {
    buttons,
    doc: {
      documentElement: { lang: "en" },
      title: "",
      querySelectorAll(selector) {
        if (selector === "[data-locale]") return buttons;
        return [];
      },
      querySelector() { return null; },
      addEventListener() {},
    },
  };
}

test("language changes re-render live data without refetching", () => {
  const { doc, buttons } = documentStub();
  const rendered = [];
  let initializationCount = 0;
  const liveUI = {
    initGitHubLiveData(options) {
      initializationCount += 1;
      assert.equal(options.doc, doc);
      assert.equal(options.getLocale(), "en");
      return {
        ready: Promise.resolve(),
        render(locale) { rendered.push(locale); },
        getSnapshot() { return null; },
      };
    },
  };

  const result = site.initSite({ doc, storage: null, liveUI, fetchImpl: async () => {} });
  buttons[1].click();

  assert.equal(initializationCount, 1);
  assert.equal(doc.documentElement.lang, "zh-CN");
  assert.deepEqual(rendered, ["zh-CN"]);
  assert.ok(result.liveData);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const site = require("../assets/main.js");

test("normalizes supported locales and defaults to English", () => {
  assert.equal(site.normalizeLanguage("en"), "en");
  assert.equal(site.normalizeLanguage("zh-CN"), "zh-CN");
  assert.equal(site.normalizeLanguage("fr"), "en");
  assert.equal(site.normalizeLanguage(null), "en");
});

test("returns Chinese translation and preserves English fallback", () => {
  assert.equal(site.translatedValue("nav.home", "zh-CN", "Home"), "首页");
  assert.equal(site.translatedValue("missing.key", "zh-CN", "Fallback"), "Fallback");
  assert.equal(site.translatedValue("nav.home", "en", "Home"), "Home");
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

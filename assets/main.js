(function attachASystemSite(globalObject) {
  "use strict";

  if (globalObject && globalObject.document) {
    globalObject.document.documentElement.classList.replace("no-js", "js");
  }

  const STORAGE_KEY = "asystem.locale";
  const TRANSLATIONS = {
    "zh-CN": {
      "a11y.skip": "跳到主要内容",
      "a11y.openMenu": "打开菜单",
      "a11y.closeMenu": "关闭菜单",
      "nav.home": "首页",
      "nav.projects": "项目",
      "nav.docs": "文档",
      "nav.blog": "动态",
      "nav.ecosystem": "生态",
      "hero.eyebrow": "InclusionAI 出品",
      "hero.tagline": "面向大规模强化学习的开放系统。",
      "hero.cta": "在 GitHub 上探索",
      "projects.kicker": "开放生态",
      "projects.title": "项目中心",
      "projects.areno.description": "面向开发者的强化学习工作流工具包。",
      "projects.awex.description": "面向训练与评测的可扩展执行基础设施。",
      "projects.astate.description": "面向智能体系统的可靠状态与轨迹基础能力。",
      "projects.amem.description": "面向长周期智能应用的记忆基础设施。",
      "tags.easy": "易用",
      "tags.single": "单机",
      "tags.scalable": "可扩展",
      "tags.modular": "模块化",
      "tags.reliable": "可靠",
      "tags.observable": "可观测",
      "tags.longContext": "长上下文",
      "tags.extensible": "可扩展",
      "actions.quickStart": "快速开始",
      "actions.learnMore": "了解更多",
      "capabilities.kicker": "从研究走向生产",
      "capabilities.title": "技术能力全景图",
      "capabilities.description": "贯穿智能系统构建、训练、评测与持续改进的一体化技术栈。",
      "metrics.nodes": "训练节点",
      "metrics.workflows": "工作流",
      "metrics.projects": "核心项目",
      "updates.kicker": "最新进展",
      "updates.title": "最新动态",
      "updates.release.title": "ASystem 最新版本",
      "updates.release.body": "跟踪整个生态的协同发布。",
      "updates.install.title": "安装 AReno",
      "updates.install.body": "准备受支持的环境并验证工具链。",
      "updates.quickstart.title": "运行快速开始",
      "updates.quickstart.body": "从环境配置到结果，完成一个小型训练工作流。",
      "updates.areno.title": "AReno 版本说明",
      "updates.areno.body": "查看新能力、修复内容与升级说明。",
      "community.kicker": "开放共建",
      "community.title": "社区与贡献",
      "community.areno.title": "改进训练工作流",
      "community.areno.body": "反馈问题、贡献配方，共同提升开发体验。",
      "community.awex.title": "扩展执行能力",
      "community.awex.body": "贡献运行时方案与可复现的性能报告。",
      "community.astate.title": "推进状态基础设施",
      "community.astate.body": "共同完善可靠状态与可观测性基础能力。",
      "community.amem.title": "扩展智能记忆",
      "community.amem.body": "探索面向长周期应用的记忆抽象。",
      "footer.projects": "项目",
      "footer.resources": "资源",
      "footer.community": "社区",
      "footer.contribute": "参与贡献",
      "footer.copyright": "© 2026 InclusionAI。共建开放系统。"
    }
  };

  function normalizeLanguage(value) {
    return value === "zh-CN" ? "zh-CN" : "en";
  }

  function translatedValue(key, locale, fallback) {
    if (normalizeLanguage(locale) === "en") return fallback;
    return TRANSLATIONS["zh-CN"][key] || fallback;
  }

  function readStoredLanguage(storage) {
    try {
      return normalizeLanguage(storage && storage.getItem(STORAGE_KEY));
    } catch (_) {
      return "en";
    }
  }

  function writeStoredLanguage(storage, locale) {
    try {
      storage.setItem(STORAGE_KEY, normalizeLanguage(locale));
      return true;
    } catch (_) {
      return false;
    }
  }

  function applyLanguage(doc, locale) {
    const nextLocale = normalizeLanguage(locale);
    doc.documentElement.lang = nextLocale;

    doc.querySelectorAll("[data-i18n]").forEach((node) => {
      if (!Object.prototype.hasOwnProperty.call(node.dataset, "i18nEnglish")) {
        node.dataset.i18nEnglish = node.textContent.trim();
      }
      node.textContent = translatedValue(
        node.dataset.i18n,
        nextLocale,
        node.dataset.i18nEnglish
      );
    });

    doc.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      if (!Object.prototype.hasOwnProperty.call(node.dataset, "i18nAriaEnglish")) {
        node.dataset.i18nAriaEnglish = node.getAttribute("aria-label") || "";
      }
      node.setAttribute(
        "aria-label",
        translatedValue(
          node.dataset.i18nAria,
          nextLocale,
          node.dataset.i18nAriaEnglish
        )
      );
    });

    doc.querySelectorAll("[data-locale]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.locale === nextLocale)
      );
    });

    doc.title = nextLocale === "zh-CN"
      ? "ASystem — 大规模强化学习开放系统"
      : "ASystem — Large-scale reinforcement learning";

    const description = doc.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute(
        "content",
        nextLocale === "zh-CN"
          ? "ASystem 是 InclusionAI 面向大规模强化学习构建的开放生态。"
          : "ASystem is InclusionAI's open ecosystem for large-scale reinforcement learning."
      );
    }

    return nextLocale;
  }

  function initSite(options) {
    const settings = options || {};
    const doc = settings.doc || (
      typeof document !== "undefined" ? document : null
    );
    let storage = Object.prototype.hasOwnProperty.call(settings, "storage")
      ? settings.storage
      : null;
    if (!Object.prototype.hasOwnProperty.call(settings, "storage")) {
      try {
        storage = globalObject && globalObject.localStorage
          ? globalObject.localStorage
          : null;
      } catch (_) {
        storage = null;
      }
    }
    if (!doc) return null;

    const header = doc.querySelector(".site-header");
    const menuButton = doc.querySelector(".menu-toggle");
    const navigation = doc.querySelector("#site-nav");
    let locale = applyLanguage(doc, readStoredLanguage(storage));

    function setMenu(open) {
      if (!header || !menuButton) return;
      header.dataset.menuOpen = String(open);
      menuButton.setAttribute("aria-expanded", String(open));
      const key = open ? "a11y.closeMenu" : "a11y.openMenu";
      const fallback = open ? "Close menu" : "Open menu";
      const label = translatedValue(key, locale, fallback);
      menuButton.setAttribute("aria-label", label);
      const hiddenLabel = menuButton.querySelector(".sr-only");
      if (hiddenLabel) hiddenLabel.textContent = label;
    }

    doc.querySelectorAll("[data-locale]").forEach((button) => {
      button.addEventListener("click", () => {
        locale = applyLanguage(doc, button.dataset.locale);
        writeStoredLanguage(storage, locale);
        setMenu(header && header.dataset.menuOpen === "true");
      });
    });

    if (header && menuButton) {
      menuButton.addEventListener("click", () => {
        setMenu(header.dataset.menuOpen !== "true");
      });
    }

    if (navigation) {
      navigation.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => setMenu(false));
      });
    }

    doc.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && header && header.dataset.menuOpen === "true") {
        setMenu(false);
        menuButton.focus();
      }
    });

    return {
      getLocale() { return locale; },
      setMenu
    };
  }

  const api = {
    normalizeLanguage,
    translatedValue,
    readStoredLanguage,
    writeStoredLanguage,
    applyLanguage,
    initSite
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (globalObject && globalObject.document) {
    globalObject.ASystemSite = api;
    if (globalObject.document.readyState === "loading") {
      globalObject.document.addEventListener(
        "DOMContentLoaded",
        () => initSite()
      );
    } else {
      initSite();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);

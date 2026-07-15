from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"


class HomepageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []
        self.ids = set()
        self.links = []
        self.scripts = []
        self.stylesheets = []
        self.icons = []
        self.i18n_keys = set()
        self.images = []
        self.project_icon_aria_hidden = []
        self.lang = None
        self.title_parts = []
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append(tag)
        if tag == "html":
            self.lang = attrs.get("lang")
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if attrs.get("data-i18n"):
            self.i18n_keys.add(attrs["data-i18n"])
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])
        if tag == "script" and attrs.get("src"):
            self.scripts.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.stylesheets.append(attrs.get("href"))
        if tag == "link" and attrs.get("rel") == "icon":
            self.icons.append((attrs.get("type"), attrs.get("href")))
        if tag == "img" and attrs.get("src"):
            self.images.append(attrs["src"])
        if tag == "span" and "project-icon" in attrs.get("class", "").split():
            self.project_icon_aria_hidden.append(attrs.get("aria-hidden"))
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title_parts.append(data)


def parse_homepage():
    parser = HomepageParser()
    parser.feed(INDEX.read_text(encoding="utf-8"))
    return parser


def css_block(source, marker):
    if marker not in source:
        return ""
    marker_start = source.index(marker)
    block_start = source.index("{", marker_start)
    depth = 1
    for position in range(block_start + 1, len(source)):
        if source[position] == "{":
            depth += 1
        elif source[position] == "}":
            depth -= 1
            if depth == 0:
                return source[block_start + 1:position]
    return ""


class HomepageContractTests(unittest.TestCase):
    def test_root_homepage_exists_and_defaults_to_english(self):
        self.assertTrue(INDEX.exists())
        parser = parse_homepage()
        self.assertEqual(parser.lang, "en")
        self.assertIn("ASystem", "".join(parser.title_parts))

    def test_semantic_landmarks_and_sections_exist(self):
        parser = parse_homepage()
        for tag in ("header", "nav", "main", "section", "footer", "h1"):
            self.assertIn(tag, parser.tags)
        self.assertTrue({"top", "projects", "capabilities", "updates", "community"} <= parser.ids)

    def test_expected_assets_are_local(self):
        parser = parse_homepage()
        self.assertEqual(parser.stylesheets, ["assets/styles.css"])
        self.assertEqual(parser.scripts, ["assets/main.js"])
        icon_paths = [href for _, href in parser.icons]
        for path in parser.stylesheets + parser.scripts + parser.images + icon_paths:
            self.assertFalse(path.startswith(("http://", "https://")))

    def test_all_local_visual_assets_exist(self):
        parser = parse_homepage()
        icon_paths = [href for _, href in parser.icons]
        for relative in parser.stylesheets + parser.images + icon_paths:
            self.assertTrue((ROOT / relative.lstrip("/")).exists(), relative)

    def test_root_homepage_declares_local_svg_favicon(self):
        parser = parse_homepage()

        self.assertEqual(
            parser.icons,
            [("image/svg+xml", "assets/images/asystem-mark.svg")],
        )

    def test_project_icons_are_hidden_from_assistive_technology(self):
        parser = parse_homepage()

        self.assertEqual(parser.project_icon_aria_hidden, ["true"] * 4)

    def test_css_contains_design_and_accessibility_contracts(self):
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        for token in (
            "--color-canvas: #f5f8ff",
            "--color-ink: #090b10",
            ".skip-link",
            ":focus-visible",
            ".project-grid",
            ".capabilities",
            ".update-grid",
            ".community-grid",
        ):
            self.assertIn(token, css)

    def test_css_contains_responsive_and_reduced_motion_contracts(self):
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        for token in (
            "@media (max-width: 1099px)",
            "@media (max-width: 767px)",
            "@media (max-width: 479px)",
            "@media (prefers-reduced-motion: reduce)",
            '[data-menu-open="true"] .site-nav',
            "overflow-x: clip",
        ):
            self.assertIn(token, css)

    def test_mobile_navigation_is_progressively_enhanced(self):
        html = INDEX.read_text(encoding="utf-8")
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        javascript = (ROOT / "assets/main.js").read_text(encoding="utf-8")
        mobile_css = css_block(css, "@media (max-width: 767px)")

        self.assertIn('<html lang="en" class="no-js">', html)
        self.assertIn('classList.replace("no-js", "js")', javascript)
        self.assertIn("display: grid;", css_block(mobile_css, ".js .menu-toggle"))
        self.assertIn("display: none;", css_block(mobile_css, ".js .site-nav"))
        self.assertIn(
            "display: flex;",
            css_block(mobile_css, '.js [data-menu-open="true"] .site-nav'),
        )
        self.assertIn("position: static;", css_block(mobile_css, ".no-js .site-header"))
        self.assertIn("position: static;", css_block(mobile_css, ".no-js .site-nav"))

    def test_tablet_interactive_controls_have_44px_targets(self):
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        tablet_css = css_block(css, "@media (max-width: 1099px)")

        for selector in (
            ".site-header > .brand",
            ".site-nav a",
            ".language-switch button",
            ".icon-link",
            ".card-actions a",
            ".footer-grid a",
        ):
            with self.subTest(selector=selector):
                declarations = css_block(tablet_css, selector)
                self.assertIn("min-width: 44px;", declarations)
                self.assertIn("min-height: 44px;", declarations)

    def test_mobile_brand_label_rule_does_not_hide_footer_label(self):
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        mobile_css = css_block(css, "@media (max-width: 767px)")

        self.assertNotIn("\n  .brand span {", mobile_css)
        self.assertIn("display: none;", css_block(mobile_css, ".site-header > .brand span"))

    def test_skip_link_target_is_programmatically_focusable(self):
        html = INDEX.read_text(encoding="utf-8")

        self.assertIn('<main id="main" tabindex="-1">', html)

    def test_primary_destinations_are_real(self):
        parser = parse_homepage()
        expected = {
            "https://github.com/inclusionAI/ASystem",
            "https://github.com/inclusionAI/AReno",
            "https://github.com/inclusionAI/Awex",
            "https://github.com/inclusionAI/AState",
            "https://github.com/inclusionAI/asystem-amem",
            "/docs/areno/",
            "/docs/areno/getting-started/quickstart.html",
        }
        self.assertTrue(expected <= set(parser.links))

    def test_navigation_and_translation_contract_exist(self):
        parser = parse_homepage()
        self.assertTrue({"#top", "#projects", "#updates", "#community"} <= set(parser.links))
        expected_keys = {
            "nav.home", "nav.projects", "nav.docs", "nav.blog", "nav.ecosystem",
            "hero.eyebrow", "hero.tagline", "hero.cta",
            "projects.title", "capabilities.title", "updates.title", "community.title",
            "footer.copyright",
        }
        self.assertTrue(expected_keys <= parser.i18n_keys)

    def test_existing_pages_contract_is_intact(self):
        self.assertEqual((ROOT / "CNAME").read_text(encoding="utf-8").strip(), "asystem-ai.io")
        self.assertTrue((ROOT / "docs/areno/index.html").exists())
        self.assertTrue((ROOT / "docs/areno/getting-started/quickstart.html").exists())


if __name__ == "__main__":
    unittest.main()

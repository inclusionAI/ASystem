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
        self.anchor_attrs = []
        self.scripts = []
        self.stylesheets = []
        self.icons = []
        self.i18n_keys = set()
        self.images = []
        self.project_icon_aria_hidden = []
        self.data_hooks = {
            "project": [],
            "update": [],
            "community": [],
        }
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
            self.anchor_attrs.append(attrs)
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
        if attrs.get("data-project-card"):
            self.data_hooks["project"].append(attrs["data-project-card"])
        if "data-update-slot" in attrs:
            self.data_hooks["update"].append(attrs.get("data-update-slot", ""))
        if attrs.get("data-community-card"):
            self.data_hooks["community"].append(attrs["data-community-card"])
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

    def test_expected_assets_are_local_or_approved_design_assets(self):
        parser = parse_homepage()
        self.assertEqual(
            parser.stylesheets,
            [
                "https://fonts.googleapis.com/css2?family=Raleway:wght@700&display=swap",
                "assets/styles.css",
            ],
        )
        self.assertEqual(
            parser.scripts,
            ["assets/github-data.js", "assets/github-ui.js", "assets/main.js"],
        )
        icon_paths = [href for _, href in parser.icons]
        remote_images = [path for path in parser.images if path.startswith(("http://", "https://"))]
        approved_design_asset = (
            "https://mdn.alipayobjects.com/huamei_fz8c8n/afts/img/"
            "dpNuRY8szNMAAAAANrAAAAgADpuRAQJr/original"
        )
        self.assertTrue(
            all(
                path.startswith("https://avatars.githubusercontent.com/")
                or path == approved_design_asset
                for path in remote_images
            )
        )
        local_images = [path for path in parser.images if path not in remote_images]
        local_stylesheets = [
            path for path in parser.stylesheets
            if not path.startswith(("http://", "https://"))
        ]
        local_icons = [
            path for path in icon_paths
            if not path.startswith(("http://", "https://"))
        ]
        for path in local_stylesheets + parser.scripts + local_images + local_icons:
            self.assertFalse(path.startswith(("http://", "https://")))

    def test_live_data_hooks_match_the_fixed_figma_card_counts(self):
        parser = parse_homepage()
        expected_projects = ["areno", "awex", "astate", "amem"]
        self.assertEqual(parser.data_hooks["project"], expected_projects)
        self.assertEqual(len(parser.data_hooks["update"]), 4)
        self.assertEqual(parser.data_hooks["community"], expected_projects)

    def test_community_keeps_complete_api_sourced_fallbacks(self):
        html = INDEX.read_text(encoding="utf-8")
        self.assertEqual(html.count("data-community-fallback aria-label"), 4)
        self.assertEqual(html.count("data-community-fallback-item"), 8)
        self.assertEqual(html.count('src="https://avatars.githubusercontent.com/'), 8)
        self.assertNotIn("community-activity--loading", html)
        self.assertIn("https://github.com/inclusionAI/Awex/issues/111", html)
        self.assertIn("https://github.com/inclusionAI/AState/issues/2", html)
        self.assertIn("https://github.com/inclusionAI/asystem-amem/issues/15", html)

    def test_all_local_visual_assets_exist(self):
        parser = parse_homepage()
        icon_paths = [href for _, href in parser.icons]
        for relative in parser.stylesheets + parser.images + icon_paths:
            if not relative.startswith(("http://", "https://")):
                self.assertTrue((ROOT / relative.lstrip("/")).exists(), relative)

    def test_root_homepage_declares_approved_design_favicon(self):
        parser = parse_homepage()

        self.assertEqual(
            parser.icons,
            [
                (
                    "image/png",
                    "https://mdn.alipayobjects.com/huamei_fz8c8n/afts/img/"
                    "dpNuRY8szNMAAAAANrAAAAgADpuRAQJr/original",
                )
            ],
        )

    def test_project_icons_are_hidden_from_assistive_technology(self):
        parser = parse_homepage()

        self.assertEqual(parser.project_icon_aria_hidden, ["true"] * 4)
        for project in ("areno", "awex", "astate", "amem"):
            self.assertEqual(
                parser.images.count(f"assets/images/project-{project}.svg"),
                2,
            )

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
            ".project-live-meta",
            ".live-status",
            ".community-activity",
            ".community-activity__title",
        ):
            self.assertIn(token, css)

    def test_hidden_community_fallback_stays_hidden(self):
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        declarations = css_block(css, ".community-fallback[hidden]")

        self.assertIn("display: none;", declarations)

    def test_community_matches_figma_desktop_geometry(self):
        html = INDEX.read_text(encoding="utf-8")
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        community_section = css_block(css, "#community")
        community_heading = css_block(css, "#community .section-heading h2")
        community_grid = css_block(css, "#community .community-grid")
        community_card = css_block(css, "#community .community-card")
        activity_list = css_block(css, "#community .community-activity-list")
        project_footer = css_block(css, "#community .community-project")

        self.assertNotIn('data-i18n="community.kicker"', html)
        self.assertEqual(html.count('class="community-card__heading"'), 4)
        self.assertEqual(html.count('class="community-project"'), 4)
        self.assertEqual(html.count("data-community-stars"), 4)
        self.assertEqual(html.count("data-community-fallback-item"), 8)
        self.assertEqual(html.count('src="https://avatars.githubusercontent.com/'), 8)
        self.assertNotIn("community-activity__avatar--loading", html)
        self.assertNotIn("community-activity__avatar--fallback", html)
        for count in ("12", "163", "41", "110"):
            self.assertIn(f'<span data-community-stars>{count}</span>', html)
        self.assertNotIn("<span data-community-stars>—</span>", html)
        self.assertIn("padding-top: 101px;", community_section)
        self.assertIn("font-size: 32px;", community_heading)
        self.assertIn("line-height: 40px;", community_heading)
        self.assertIn("repeat(2, minmax(0, 1fr))", community_grid)
        self.assertIn("height: 265px;", community_card)
        self.assertIn("padding: 0;", community_card)
        self.assertIn("grid-template-rows: 86px 81px;", activity_list)
        self.assertIn("position: absolute;", project_footer)
        self.assertIn("bottom: 19px;", project_footer)

    def test_project_center_matches_figma_desktop_geometry(self):
        html = INDEX.read_text(encoding="utf-8")
        css = (ROOT / "assets/styles.css").read_text(encoding="utf-8")
        project_section = css_block(css, "#projects")
        project_heading = css_block(css, "#projects .section-heading h2")
        project_grid = css_block(css, ".project-grid")
        project_card = css_block(css, "#projects .project-card")
        project_icon = css_block(css, "#projects .project-icon")
        live_metadata = css_block(css, "#projects .project-live-meta")

        self.assertNotIn('data-i18n="projects.kicker"', html)
        self.assertIn("padding-top: 101px;", project_section)
        self.assertIn("font-size: 32px;", project_heading)
        self.assertIn("line-height: 40px;", project_heading)
        self.assertIn("repeat(4, minmax(0, 1fr))", project_grid)
        self.assertIn("height: 191px;", project_card)
        self.assertIn("padding: 20px;", project_card)
        self.assertIn("background: rgba(255,255,255,.65);", project_card)
        self.assertIn("width: 56px;", project_icon)
        self.assertIn("height: 56px;", project_icon)
        self.assertIn("position: absolute;", live_metadata)

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
            ".community-activity",
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
            "https://asystem-ai.io/docs/areno/getting-started/quickstart.html",
        }
        self.assertTrue(expected <= set(parser.links))

    def test_github_links_use_reliable_same_tab_navigation(self):
        parser = parse_homepage()
        github_links = [
            attrs
            for attrs in parser.anchor_attrs
            if attrs["href"].startswith("https://github.com/")
        ]

        self.assertGreater(len(github_links), 0)
        for attrs in github_links:
            self.assertNotEqual(attrs.get("target"), "_blank")

    def test_areno_quick_start_links_use_the_canonical_public_url(self):
        parser = parse_homepage()
        canonical_url = "https://asystem-ai.io/docs/areno/getting-started/quickstart.html"

        self.assertEqual(parser.links.count(canonical_url), 2)
        self.assertNotIn("/docs/areno/getting-started/quickstart.html", parser.links)

    def test_top_navigation_uses_canonical_public_destinations(self):
        html = INDEX.read_text(encoding="utf-8")
        header = html.split("<header", 1)[1].split("</header>", 1)[0]
        navigation = header.split('<nav id="site-nav"', 1)[1].split("</nav>", 1)[0]

        expected_links = (
            '<a href="https://asystem-ai.io/" data-i18n="nav.home">Home</a>',
            '<a href="https://asystem-ai.io/#projects" data-i18n="nav.projects">Projects</a>',
            '<a href="https://asystem-ai.io/docs/areno/" data-i18n="nav.docs">Docs</a>',
            '<a href="https://asystem-ai.io/#updates" data-i18n="nav.blog">Blog</a>',
            '<a href="https://asystem-ai.io/#community" data-i18n="nav.ecosystem">Ecosystem</a>',
        )
        for link in expected_links:
            self.assertIn(link, navigation)

        for relative_link in ("#top", "#projects", "#updates", "#community"):
            self.assertNotIn(f'href="{relative_link}"', navigation)

    def test_navigation_and_translation_contract_exist(self):
        parser = parse_homepage()
        self.assertTrue(
            {
                "https://asystem-ai.io/",
                "https://asystem-ai.io/#projects",
                "https://asystem-ai.io/docs/areno/",
                "https://asystem-ai.io/#updates",
                "https://asystem-ai.io/#community",
            }
            <= set(parser.links)
        )
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

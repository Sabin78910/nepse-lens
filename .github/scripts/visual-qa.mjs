// Opens the live site in a real browser (phone + desktop, light + dark), saves screenshots,
// and reports layout overflow, load failures and JavaScript errors. Used by visual-qa.yml.
import fs from "node:fs";
import { chromium } from "/tmp/qa/node_modules/playwright/index.mjs";

const site = process.env.SITE;
fs.mkdirSync("shots", { recursive: true });
const problems = [];
const browser = await chromium.launch();

for (const [name, viewport] of [["phone", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 800 }]]) {
  for (const colorScheme of ["light", "dark"]) {
    const tag = `${name}-${colorScheme}`;
    const ctx = await browser.newContext({ viewport, colorScheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // Network hiccups (timeouts, blocked third-party requests) are not code bugs; report real errors only.
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text()) && errors.push(m.text()));
    const res = await page.goto(site, { waitUntil: "networkidle", timeout: 60000 }).catch(() => null);
    await page.waitForTimeout(1500);
    if (!res || !res.ok()) problems.push(`${tag}: page did not load (${res ? res.status() : "no response"})`);

    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const out = [];
      if (document.documentElement.scrollWidth > w + 1)
        out.push(`the page is ${document.documentElement.scrollWidth}px wide on a ${w}px screen (horizontal scrolling)`);
      const inScroller = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
        }
        return false;
      };
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        if (r.width <= 1 || r.height <= 1 || s.visibility === "hidden" || s.opacity === "0") continue;
        const crossesRight = r.left < w && r.right > w + 1;
        const crossesLeft = r.right > 0 && r.left < -1;
        if ((crossesRight || crossesLeft) && !inScroller(el)) {
          const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
          out.push(`<${el.tagName.toLowerCase()}${cls}> "${(el.textContent || "").trim().slice(0, 40)}" is cut off at the screen edge`);
        }
        if (out.length >= 8) break;
      }
      return out;
    });
    overflow.forEach((o) => problems.push(`${tag}: ${o}`));
    const broken = await page.evaluate(() =>
      [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => `${i.getAttribute("src")} ("${i.alt}")`));
    broken.slice(0, 5).forEach((b) => problems.push(`${tag}: image failed to load: ${b}`));
    errors.slice(0, 5).forEach((e) => problems.push(`${tag}: JavaScript error: ${e.slice(0, 200)}`));
    await page.screenshot({ path: `shots/${tag}.png`, fullPage: true });
    await ctx.close();
  }
}
await browser.close();

const uniq = [...new Set(problems)];
fs.writeFileSync("problems.md", uniq.map((p) => `- [ ] ${p}`).join("\n") + "\n");
fs.appendFileSync(process.env.GITHUB_OUTPUT ?? "/dev/null", `problems=${uniq.length ? "yes" : ""}\n`);
console.log(uniq.length ? uniq.join("\n") : "No problems found");

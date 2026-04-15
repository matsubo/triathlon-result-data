#!/usr/bin/env node
/**
 * Scan JTU event IDs 1-105 to discover valid events with results.
 * Outputs a JSON report of found events with their programs.
 */

const { chromium } = require("playwright");

const BASE_URL = "https://www.jtu.or.jp";
const DELAY_MS = 1500; // polite delay between requests

// Categories to skip
const SKIP_KEYWORDS = [
  "キッズ",
  "ジュニア",
  "リレー",
  "パラ",
  "小学",
  "中学",
  "アクアスロン",
  "デュアスロン",
  "ビギナー",
  "チャレンジ",
  "kids",
  "junior",
  "relay",
  "para",
  "aquathlon",
  "duathlon",
  "beginner",
  "ｷｯｽﾞ",
  "ｼﾞｭﾆｱ",
  "ﾘﾚｰ",
];

function shouldSkip(name) {
  const lower = name.toLowerCase();
  return SKIP_KEYWORDS.some(
    (kw) => name.includes(kw) || lower.includes(kw.toLowerCase()),
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanEvent(page, eventId) {
  const url = `${BASE_URL}/result_program/?event_id=${eventId}`;
  try {
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 15000,
    });
    if (!response || response.status() === 404) return null;

    // Check if there's meaningful content
    const title = await page.title();

    // Look for program links or event title
    const eventTitle = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const h2 = document.querySelector("h2");
      const heading = h1 || h2;
      return heading ? heading.textContent.trim() : null;
    });

    // Look for program list items
    const programs = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="result"]'));
      return links
        .filter(
          (a) => a.href.includes("program_id") || a.href.includes("result/?"),
        )
        .map((a) => ({
          text: a.textContent.trim(),
          href: a.href,
        }));
    });

    // Also check for any table with program data
    const programList = await page.evaluate(() => {
      // JTU result program page often has a list/table of programs
      const items = Array.from(
        document.querySelectorAll(".program_list li, .result_list li, ul li"),
      );
      return items
        .filter((li) => li.querySelector("a"))
        .map((li) => ({
          text: li.textContent.trim(),
          href: li.querySelector("a").href,
        }));
    });

    // Check if page has no results (empty or error page)
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (
      bodyText.includes("対象データが見つかりません") ||
      bodyText.includes("データがありません") ||
      bodyText.trim().length < 100
    ) {
      return null;
    }

    const allPrograms = [
      ...new Map(
        [...programs, ...programList].map((p) => [p.href, p]),
      ).values(),
    ];

    return {
      eventId,
      url,
      title: eventTitle || title,
      bodyText: bodyText.substring(0, 500),
      programs: allPrograms,
    };
  } catch (err) {
    if (err.message.includes("timeout")) {
      console.error(`  Timeout for event ${eventId}`);
    }
    return null;
  }
}

async function main() {
  const startId = parseInt(process.argv[2] || "1");
  const endId = parseInt(process.argv[3] || "105");

  console.log(`Scanning event IDs ${startId}-${endId}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const results = [];

  for (let id = startId; id <= endId; id++) {
    process.stdout.write(`\rChecking event ${id}/${endId}...`);
    const result = await scanEvent(page, id);
    if (result) {
      console.log(`\n  [FOUND] Event ${id}: ${result.title}`);
      console.log(`    Programs: ${result.programs.length}`);
      results.push(result);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n\nScan complete. Found ${results.length} valid events.`);

  // Output full report
  const report = {
    scannedRange: { start: startId, end: endId },
    foundCount: results.length,
    events: results.map((r) => ({
      eventId: r.eventId,
      title: r.title,
      url: r.url,
      programCount: r.programs.length,
      programs: r.programs,
      bodyPreview: r.bodyText,
    })),
  };

  const fs = require("fs");
  const reportPath = `/tmp/jtu_scan_${startId}_${endId}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Report saved to: ${reportPath}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

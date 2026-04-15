#!/usr/bin/env node
/**
 * JTU result scraper using fetch (Node.js 18+)
 * Usage: node scripts/scrape_jtu.js <event_id>
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/html, */*",
          "Accept-Language": "ja,en;q=0.9",
          Referer: "https://www.jtu.or.jp/",
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function getPrograms(eventId) {
  // Try JTU API
  const apiUrl = `https://results.jtu.or.jp/api/event/${eventId}/programs`;
  const r = await httpsGet(apiUrl);
  if (r.status === 200) {
    return JSON.parse(r.body);
  }
  return null;
}

async function getResultTable(eventId, programId) {
  const url = `https://results.jtu.or.jp/api/event/${eventId}/program/${programId}/results`;
  const r = await httpsGet(url);
  if (r.status === 200) {
    return JSON.parse(r.body);
  }
  return null;
}

const eventId = process.argv[2];
if (!eventId) {
  console.error("Usage: node scripts/scrape_jtu.js <event_id>");
  process.exit(1);
}

(async () => {
  console.log(`Fetching programs for event ${eventId}...`);
  const programs = await getPrograms(eventId);
  if (programs) {
    console.log("Programs:", JSON.stringify(programs, null, 2));
  } else {
    console.log("No programs found via API");
    // Try direct page scrape
    const pageUrl = `https://www.jtu.or.jp/result_program/?event_id=${eventId}`;
    const r = await httpsGet(pageUrl);
    console.log("Page status:", r.status);
    console.log("Page content (first 3000 chars):", r.body.substring(0, 3000));
  }
})().catch(console.error);

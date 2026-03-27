import { parseTime } from "../scripts/lib/normalize-time.js";
import { parseRankAndStatus } from "../scripts/lib/normalize-status.js";
import { parseGender } from "../scripts/lib/normalize-gender.js";
import { parseResidence } from "../scripts/lib/normalize-residence.js";
import { parseAgeCategory } from "../scripts/lib/normalize-age-category.js";
import { parseInteger } from "../scripts/lib/parse-integer.js";

let pass = 0;
let fail = 0;

function assert(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    console.error(`  FAIL: ${name} -> got ${a}, expected ${e}`);
    fail++;
  }
}

// ============================================================
// parseTime
// ============================================================
console.log("parseTime:");
assert("standard", parseTime("2:02:41"), 7361);
assert("short", parseTime("0:19:49"), 1189);
assert("sub-minute", parseTime("0:00:56"), 56);
assert("zero", parseTime("0:00:00"), 0);
assert("long", parseTime("15:06:59"), 54419);
assert("empty", parseTime(""), null);
assert("null", parseTime(null), null);
assert("undefined", parseTime(undefined), null);
assert("invalid", parseTime("abc"), null);
assert("two-part", parseTime("19:49"), null);
assert("bad minutes", parseTime("1:99:00"), null);

// ============================================================
// parseRankAndStatus
// ============================================================
console.log("parseRankAndStatus:");
assert("numeric", parseRankAndStatus("1"), { rank: 1, status: "finished" });
assert("large", parseRankAndStatus("1234"), { rank: 1234, status: "finished" });
assert("DNF", parseRankAndStatus("DNF"), { rank: null, status: "DNF" });
assert("DNS", parseRankAndStatus("DNS"), { rank: null, status: "DNS" });
assert("DSQ", parseRankAndStatus("DSQ"), { rank: null, status: "DSQ" });
assert("TOV", parseRankAndStatus("TOV"), { rank: null, status: "TOV" });
assert("OPEN", parseRankAndStatus("OPEN"), { rank: null, status: "OPEN" });
assert("SKIP", parseRankAndStatus("SKIP"), { rank: null, status: "SKIP" });
assert("empty", parseRankAndStatus(""), { rank: null, status: "DNS" });
assert("null", parseRankAndStatus(null), { rank: null, status: "DNS" });

// ============================================================
// parseGender
// ============================================================
console.log("parseGender:");
assert("male", parseGender("男"), "M");
assert("female", parseGender("女"), "F");
assert("empty", parseGender(""), null);
assert("null", parseGender(null), null);
assert("invalid", parseGender("other"), null);

// ============================================================
// parseResidence
// ============================================================
console.log("parseResidence:");
assert("tokyo", parseResidence("東京都"), "JP-13");
assert("kanagawa", parseResidence("神奈川県"), "JP-14");
assert("hokkaido", parseResidence("北海道"), "JP-01");
assert("okinawa", parseResidence("沖縄県"), "JP-47");
assert("miyakojima", parseResidence("宮古島市"), "JP-47");
assert("US", parseResidence("United States"), "US");
assert("USA", parseResidence("USA"), "US");
assert("UK", parseResidence("UK"), "GB");
assert("Korea", parseResidence("Korea"), "KR");
assert("KOREA", parseResidence("KOREA"), "KR");
assert("South Korea", parseResidence("South Korea"), "KR");
assert("韓国", parseResidence("韓国"), "KR");
assert("台湾", parseResidence("台湾"), "TW");
assert("Unknown", parseResidence("Unknown"), null);
assert("????", parseResidence("????"), null);
assert("#N/A", parseResidence("#N/A"), null);
assert("empty", parseResidence(""), null);
assert("null", parseResidence(null), null);
assert("男 (leak)", parseResidence("男"), null);
assert("time (leak)", parseResidence("3:02:41"), null);
assert("学連", parseResidence("学連(埼玉)"), null);

// ============================================================
// parseAgeCategory
// ============================================================
console.log("parseAgeCategory:");
assert("M25-29", parseAgeCategory("M25-29"), { min_age: 25, max_age: 29 });
assert("50-54歳男子", parseAgeCategory("50-54歳男子"), { min_age: 50, max_age: 54 });
assert("N40-44", parseAgeCategory("N40-44"), { min_age: 40, max_age: 44 });
assert("50-54F", parseAgeCategory("50-54F"), { min_age: 50, max_age: 54 });
assert("M50～54", parseAgeCategory("M50～54"), { min_age: 50, max_age: 54 });
assert("29歳以下男子", parseAgeCategory("29歳以下男子"), { min_age: 0, max_age: 29 });
assert("19才以下女子", parseAgeCategory("19才以下女子"), { min_age: 0, max_age: 19 });
assert("70歳以上男子", parseAgeCategory("70歳以上男子"), { min_age: 70, max_age: 99 });
assert("70以上男子", parseAgeCategory("70以上男子"), { min_age: 70, max_age: 99 });
assert("N80-", parseAgeCategory("N80-"), { min_age: 80, max_age: 99 });
assert("50歳代男子", parseAgeCategory("50歳代男子"), { min_age: 50, max_age: 59 });
assert("20代男子", parseAgeCategory("20代男子"), { min_age: 20, max_age: 29 });
assert("-19M", parseAgeCategory("-19M"), { min_age: 0, max_age: 19 });
assert("F-19", parseAgeCategory("F-19"), { min_age: 0, max_age: 19 });
assert("U20男子", parseAgeCategory("U20男子"), { min_age: 0, max_age: 20 });
assert("go-54男子", parseAgeCategory("go-54男子"), { min_age: 50, max_age: 54 });
assert("zo-74男子", parseAgeCategory("zo-74男子"), { min_age: 70, max_age: 74 });
assert("7o-74男子", parseAgeCategory("7o-74男子"), { min_age: 70, max_age: 74 });
assert("2529男子", parseAgeCategory("2529男子"), { min_age: 25, max_age: 29 });
assert("6560男子", parseAgeCategory("6560男子"), { min_age: 60, max_age: 65 });
assert("bare 40", parseAgeCategory("40"), { min_age: 40, max_age: 49 });
assert("bare 29 (rank)", parseAgeCategory("29"), null);
assert("bare 1 (rank)", parseAgeCategory("1"), null);
assert("PRO男子", parseAgeCategory("PRO男子"), null);
assert("PRO女子", parseAgeCategory("PRO女子"), null);
assert("Guide女子", parseAgeCategory("Guide女子"), null);
assert("PC/ID", parseAgeCategory("PC/ID"), null);
assert("empty", parseAgeCategory(""), null);
assert("null", parseAgeCategory(null), null);

// ============================================================
// parseInteger
// ============================================================
console.log("parseInteger:");
assert("simple", parseInteger("42"), 42);
assert("comma", parseInteger("1,234"), 1234);
assert("empty", parseInteger(""), null);
assert("null", parseInteger(null), null);
assert("text", parseInteger("abc"), null);

// ============================================================
// Summary
// ============================================================
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log("🎉 All normalizer tests passed!");

import { describe, test, expect } from "bun:test";
import { parseAgeCategory } from "../scripts/lib/normalize-age-category.js";
import { parseGender } from "../scripts/lib/normalize-gender.js";
import { parseResidence } from "../scripts/lib/normalize-residence.js";
import { parseRankAndStatus } from "../scripts/lib/normalize-status.js";
import { parseTime } from "../scripts/lib/normalize-time.js";
import { parseInteger } from "../scripts/lib/parse-integer.js";

describe("normalizer functions", () => {
  describe("parseTime", () => {
    test("standard", () => expect(parseTime("2:02:41")).toBe(7361));
    test("short", () => expect(parseTime("0:19:49")).toBe(1189));
    test("sub-minute", () => expect(parseTime("0:00:56")).toBe(56));
    test("zero", () => expect(parseTime("0:00:00")).toBe(0));
    test("long", () => expect(parseTime("15:06:59")).toBe(54419));
    test("empty", () => expect(parseTime("")).toBeNull());
    test("null", () => expect(parseTime(null as any)).toBeNull());
    test("undefined", () => expect(parseTime(undefined as any)).toBeNull());
    test("invalid", () => expect(parseTime("abc")).toBeNull());
    test("two-part is MM:SS", () => expect(parseTime("19:49")).toBe(1189));
    test("two-part fractional (hiwasa)", () =>
      expect(parseTime("25:55.68")).toBe(1556));
    test("three-part fractional", () =>
      expect(parseTime("2:31:01.10")).toBe(9061));
    test("trailing penalty flag (iseshima)", () =>
      expect(parseTime("2:39:42 P")).toBe(9582));
    test("bad minutes", () => expect(parseTime("1:99:00")).toBeNull());
    test("bad seconds two-part", () => expect(parseTime("19:99")).toBeNull());
    test("not a leading time", () => expect(parseTime("P 2:39:42")).toBeNull());
  });

  describe("parseRankAndStatus", () => {
    test("numeric", () => expect(parseRankAndStatus("1")).toEqual({ rank: 1, status: "finished" }));
    test("large", () => expect(parseRankAndStatus("1234")).toEqual({ rank: 1234, status: "finished" }));
    test("DNF", () => expect(parseRankAndStatus("DNF")).toEqual({ rank: null, status: "DNF" }));
    test("DNS", () => expect(parseRankAndStatus("DNS")).toEqual({ rank: null, status: "DNS" }));
    test("DSQ", () => expect(parseRankAndStatus("DSQ")).toEqual({ rank: null, status: "DSQ" }));
    test("TOV", () => expect(parseRankAndStatus("TOV")).toEqual({ rank: null, status: "TOV" }));
    test("OPEN", () => expect(parseRankAndStatus("OPEN")).toEqual({ rank: null, status: "OPEN" }));
    test("SKIP", () => expect(parseRankAndStatus("SKIP")).toEqual({ rank: null, status: "SKIP" }));
    test("SKP (kujukuri/iseshima abbreviation)", () =>
      expect(parseRankAndStatus("SKP")).toEqual({ rank: null, status: "SKIP" }));
    test("NOF is a DNF (laps but no official finish)", () =>
      expect(parseRankAndStatus("NOF")).toEqual({ rank: null, status: "DNF" }));
    test("参考記録 is an unranked participant", () =>
      expect(parseRankAndStatus("参考記録")).toEqual({ rank: null, status: "OPEN" }));
    test("DQ maps to DSQ", () =>
      expect(parseRankAndStatus("DQ")).toEqual({ rank: null, status: "DSQ" }));
    test("NC (not classified) is unranked", () =>
      expect(parseRankAndStatus("NC")).toEqual({ rank: null, status: "OPEN" }));
    test("LAP (lapped out) is a DNF", () =>
      expect(parseRankAndStatus("LAP")).toEqual({ rank: null, status: "DNF" }));
    test("empty", () => expect(parseRankAndStatus("")).toEqual({ rank: null, status: "DNS" }));
    test("null", () => expect(parseRankAndStatus(null as any)).toEqual({ rank: null, status: "DNS" }));
  });

  describe("parseGender", () => {
    test("male", () => expect(parseGender("男")).toBe("M"));
    test("female", () => expect(parseGender("女")).toBe("F"));
    test("empty", () => expect(parseGender("")).toBeNull());
    test("null", () => expect(parseGender(null as any)).toBeNull());
    test("invalid", () => expect(parseGender("other")).toBeNull());
  });

  describe("parseResidence", () => {
    test("tokyo", () => expect(parseResidence("東京都")).toBe("JP-13"));
    test("kanagawa", () => expect(parseResidence("神奈川県")).toBe("JP-14"));
    test("hokkaido", () => expect(parseResidence("北海道")).toBe("JP-01"));
    test("okinawa", () => expect(parseResidence("沖縄県")).toBe("JP-47"));
    test("miyakojima", () => expect(parseResidence("宮古島市")).toBe("JP-47"));
    test("US", () => expect(parseResidence("United States")).toBe("US"));
    test("USA", () => expect(parseResidence("USA")).toBe("US"));
    test("UK", () => expect(parseResidence("UK")).toBe("GB"));
    test("uk", () => expect(parseResidence("uk")).toBe("GB"));
    test("GB", () => expect(parseResidence("GB")).toBe("GB"));
    test("gb", () => expect(parseResidence("gb")).toBe("GB"));
    test("Korea", () => expect(parseResidence("Korea")).toBe("KR"));
    test("KOREA", () => expect(parseResidence("KOREA")).toBe("KR"));
    test("South Korea", () => expect(parseResidence("South Korea")).toBe("KR"));
    test("韓国", () => expect(parseResidence("韓国")).toBe("KR"));
    test("台湾", () => expect(parseResidence("台湾")).toBe("TW"));
    test("Unknown", () => expect(parseResidence("Unknown")).toBeNull());
    test("????", () => expect(parseResidence("????")).toBeNull());
    test("#N/A", () => expect(parseResidence("#N/A")).toBeNull());
    test("empty", () => expect(parseResidence("")).toBeNull());
    test("null", () => expect(parseResidence(null as any)).toBeNull());
    test("男 (leak)", () => expect(parseResidence("男")).toBeNull());
    test("time (leak)", () => expect(parseResidence("3:02:41")).toBeNull());
    test("学連", () => expect(parseResidence("学連(埼玉)")).toBeNull());

    // 小松鉄人レース records Ishikawa residents by municipality and everyone
    // else by prefecture, so every Ishikawa 市/郡 has to resolve on its own.
    test("金沢市", () => expect(parseResidence("金沢市")).toBe("JP-17"));
    test("小松市", () => expect(parseResidence("小松市")).toBe("JP-17"));
    test("野々市市", () => expect(parseResidence("野々市市")).toBe("JP-17"));
    test("かほく市", () => expect(parseResidence("かほく市")).toBe("JP-17"));
    test("河北郡", () => expect(parseResidence("河北郡")).toBe("JP-17"));
    test("羽咋郡", () => expect(parseResidence("羽咋郡")).toBe("JP-17"));
    test("鳳珠郡", () => expect(parseResidence("鳳珠郡")).toBe("JP-17"));
    test("鹿島郡", () => expect(parseResidence("鹿島郡")).toBe("JP-17"));
    test("能美郡", () => expect(parseResidence("能美郡")).toBe("JP-17"));
    test("津幡町", () => expect(parseResidence("津幡町")).toBe("JP-17"));
    // municipality followed by a neighbourhood name
    test("金沢市新保", () => expect(parseResidence("金沢市新保")).toBe("JP-17"));
    // a municipality column is not a licence to assume the host prefecture
    test("富山市", () => expect(parseResidence("富山市")).toBe("JP-16"));
    test("山口市", () => expect(parseResidence("山口市")).toBe("JP-35"));
    test("大韓民国", () => expect(parseResidence("大韓民国")).toBe("KR"));

    // Municipalities outside 石川県, from the generated national table
    test("倉敷市", () => expect(parseResidence("倉敷市")).toBe("JP-33"));
    test("佐渡市", () => expect(parseResidence("佐渡市")).toBe("JP-15"));
    test("大阪市", () => expect(parseResidence("大阪市")).toBe("JP-27"));
    test("さいたま市", () => expect(parseResidence("さいたま市")).toBe("JP-11"));
    test("天城町", () => expect(parseResidence("天城町")).toBe("JP-46"));
    test("千代田区", () => expect(parseResidence("千代田区")).toBe("JP-13"));
    // names shared by several prefectures stay unresolved rather than guess
    test("府中市 (東京/広島)", () => expect(parseResidence("府中市")).toBeNull());
    test("伊達市 (北海道/福島)", () => expect(parseResidence("伊達市")).toBeNull());
    test("中央区 (many)", () => expect(parseResidence("中央区")).toBeNull());

    // Prefecture written without its 都/府/県 suffix
    test("東京", () => expect(parseResidence("東京")).toBe("JP-13"));
    test("神奈川", () => expect(parseResidence("神奈川")).toBe("JP-14"));
    test("大阪", () => expect(parseResidence("大阪")).toBe("JP-27"));
    test("愛知", () => expect(parseResidence("愛知")).toBe("JP-23"));

    // Prefecture followed by anything — address, or the JTU 登録地 federation
    test("神奈川県横浜市", () => expect(parseResidence("神奈川県横浜市")).toBe("JP-14"));
    test("香川県高松市", () => expect(parseResidence("香川県高松市")).toBe("JP-37"));
    test("東京都トライアスロン連合", () =>
      expect(parseResidence("東京都トライアスロン連合")).toBe("JP-13"));
    test("北海道トライアスロン連合", () =>
      expect(parseResidence("北海道トライアスロン連合")).toBe("JP-01"));
    // …but a school is an affiliation, not a place of residence
    test("北海道大学", () => expect(parseResidence("北海道大学")).toBeNull());
    test("九州大学", () => expect(parseResidence("九州大学")).toBeNull());

    // ISO 3166-1 alpha-3 regardless of case
    test("aus", () => expect(parseResidence("aus")).toBe("AU"));
    test("deu", () => expect(parseResidence("deu")).toBe("DE"));
    test("gbr", () => expect(parseResidence("gbr")).toBe("GB"));
    test("Jpn", () => expect(parseResidence("Jpn")).toBe("JP"));

    // Country names as the sources actually spell them
    test("Argentinia (sic)", () => expect(parseResidence("Argentinia")).toBe("AR"));
    test("Deutschland", () => expect(parseResidence("Deutschland")).toBe("DE"));
    test("Schweiz", () => expect(parseResidence("Schweiz")).toBe("CH"));
    test("Russian Federation", () =>
      expect(parseResidence("Russian Federation")).toBe("RU"));
    test("Czechia", () => expect(parseResidence("Czechia")).toBe("CZ"));
    test("UNITED STATE", () => expect(parseResidence("UNITED STATE")).toBe("US"));
    test("ホンコンチャイナ", () => expect(parseResidence("ホンコンチャイナ")).toBe("HK"));

    // Full-width input is folded before lookup
    test("ＵＳＡ", () => expect(parseResidence("ＵＳＡ")).toBe("US"));

    // alpha-3 codes that were missing from the table
    test("BLM", () => expect(parseResidence("BLM")).toBe("BL"));
    test("CYM", () => expect(parseResidence("CYM")).toBe("KY"));
    test("COD", () => expect(parseResidence("COD")).toBe("CD"));
    // IOC / colloquial three-letter codes
    test("GER (IOC)", () => expect(parseResidence("GER")).toBe("DE"));
    test("SUI (IOC)", () => expect(parseResidence("SUI")).toBe("CH"));
    test("SCO", () => expect(parseResidence("SCO")).toBe("GB"));

    // A trailing parenthetical qualifier is dropped and the rest re-parsed
    test("GBR (Great Britain)", () =>
      expect(parseResidence("GBR (Great Britain)")).toBe("GB"));
    test("東京(神奈川)", () => expect(parseResidence("東京(神奈川)")).toBe("JP-13"));

    // Euro-plate single letters are deliberately left unresolved
    test("F (euro plate)", () => expect(parseResidence("F")).toBeNull());
    // as is a country name that could be either Virgin Islands
    test("Virgin Islands", () => expect(parseResidence("Virgin Islands")).toBeNull());
  });

  describe("parseAgeCategory", () => {
    test("M25-29", () => expect(parseAgeCategory("M25-29")).toEqual({ min_age: 25, max_age: 29 }));
    test("50-54歳男子", () => expect(parseAgeCategory("50-54歳男子")).toEqual({ min_age: 50, max_age: 54 }));
    test("N40-44", () => expect(parseAgeCategory("N40-44")).toEqual({ min_age: 40, max_age: 44 }));
    test("50-54F", () => expect(parseAgeCategory("50-54F")).toEqual({ min_age: 50, max_age: 54 }));
    test("M50～54", () => expect(parseAgeCategory("M50～54")).toEqual({ min_age: 50, max_age: 54 }));
    test("29歳以下男子", () => expect(parseAgeCategory("29歳以下男子")).toEqual({ min_age: 0, max_age: 29 }));
    test("19才以下女子", () => expect(parseAgeCategory("19才以下女子")).toEqual({ min_age: 0, max_age: 19 }));
    test("70歳以上男子", () => expect(parseAgeCategory("70歳以上男子")).toEqual({ min_age: 70, max_age: 99 }));
    test("70以上男子", () => expect(parseAgeCategory("70以上男子")).toEqual({ min_age: 70, max_age: 99 }));
    test("N80-", () => expect(parseAgeCategory("N80-")).toEqual({ min_age: 80, max_age: 99 }));
    test("50歳代男子", () => expect(parseAgeCategory("50歳代男子")).toEqual({ min_age: 50, max_age: 59 }));
    test("20代男子", () => expect(parseAgeCategory("20代男子")).toEqual({ min_age: 20, max_age: 29 }));
    test("-19M", () => expect(parseAgeCategory("-19M")).toEqual({ min_age: 0, max_age: 19 }));
    test("F-19", () => expect(parseAgeCategory("F-19")).toEqual({ min_age: 0, max_age: 19 }));
    test("U20男子", () => expect(parseAgeCategory("U20男子")).toEqual({ min_age: 0, max_age: 20 }));
    test("go-54男子", () => expect(parseAgeCategory("go-54男子")).toEqual({ min_age: 50, max_age: 54 }));
    test("zo-74男子", () => expect(parseAgeCategory("zo-74男子")).toEqual({ min_age: 70, max_age: 74 }));
    test("7o-74男子", () => expect(parseAgeCategory("7o-74男子")).toEqual({ min_age: 70, max_age: 74 }));
    test("2529男子", () => expect(parseAgeCategory("2529男子")).toEqual({ min_age: 25, max_age: 29 }));
    test("6560男子", () => expect(parseAgeCategory("6560男子")).toEqual({ min_age: 60, max_age: 65 }));
    test("bare 40", () => expect(parseAgeCategory("40")).toEqual({ min_age: 40, max_age: 49 }));
    test("bare 29 (rank)", () => expect(parseAgeCategory("29")).toBeNull());
    test("bare 1 (rank)", () => expect(parseAgeCategory("1")).toBeNull());
    test("PRO男子", () => expect(parseAgeCategory("PRO男子")).toBeNull());
    test("PRO女子", () => expect(parseAgeCategory("PRO女子")).toBeNull());
    test("Guide女子", () => expect(parseAgeCategory("Guide女子")).toBeNull());
    test("PC/ID", () => expect(parseAgeCategory("PC/ID")).toBeNull());
    test("empty", () => expect(parseAgeCategory("")).toBeNull());
    test("null", () => expect(parseAgeCategory(null as any)).toBeNull());
  });

  describe("parseInteger", () => {
    test("simple", () => expect(parseInteger("42")).toBe(42));
    test("comma", () => expect(parseInteger("1,234")).toBe(1234));
    test("empty", () => expect(parseInteger("")).toBeNull());
    test("null", () => expect(parseInteger(null as any)).toBeNull());
    test("text", () => expect(parseInteger("abc")).toBeNull());
  });
});

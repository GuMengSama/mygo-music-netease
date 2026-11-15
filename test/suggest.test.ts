import { answer, reset, sent } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { suggest } from "../index";

beforeEach(() => reset(false));

// Typing in search offers what NetEase thinks the listener means.
test("suggests what NetEase matches", async () => {
  answer("/api/search/suggest/keyword", { code: 200, result: { allMatch: [{ keyword: "春日影" }, { keyword: "春日影 mygo" }] } });
  expect(await suggest({ query: "春日" })).toEqual(["春日影", "春日影 mygo"]);
  expect(sent("/api/search/suggest/keyword")[0]).toMatchObject({ s: "春日" });
});

// Nothing matched is no suggestions.
test("no matches, no suggestions", async () => {
  answer("/api/search/suggest/keyword", { code: 200, result: {} });
  expect(await suggest({ query: "zzz" })).toEqual([]);
});

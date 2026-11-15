import { answer, reset, sent } from "./netease";
import { settings } from "./host";
import { beforeEach, expect, test } from "bun:test";
import { stream } from "../index";

const URLS = "/api/song/enhance/player/url/v1";

beforeEach(() => settings.clear());

// The levels asked of NetEase, in turn, for a song no level has.
async function levelsAsked(quality: string) {
  reset();
  answer(URLS, { code: 200, data: [] });
  await expect(stream({ id: "5", quality })).rejects.toMatchObject({ code: "unavailable" });
  return sent(URLS).map((d) => d.level);
}

// The app's Quality asks for a NetEase level, then each lower one in turn.
test("asks for the level the app wants, then each below it", async () => {
  expect(await levelsAsked("standard")).toEqual(["standard"]);
  expect(await levelsAsked("high")).toEqual(["exhigh", "higher", "standard"]);
  expect(await levelsAsked("lossless")).toEqual(["lossless", "exhigh", "higher", "standard"]);
});

// Prefer Hi-Res lifts Lossless only: it never raises a lower ask.
test("Prefer Hi-Res puts Hi-Res above Lossless", async () => {
  settings.set("preferHiRes", "true");
  expect(await levelsAsked("lossless")).toEqual(["hires", "lossless", "exhigh", "higher", "standard"]);
  expect(await levelsAsked("high")).toEqual(["exhigh", "higher", "standard"]);
});

// The app's default is high, so an ask it doesn't name is treated as that.
test("an unknown ask is treated as high", async () => {
  expect(await levelsAsked("")).toEqual(["exhigh", "higher", "standard"]);
});

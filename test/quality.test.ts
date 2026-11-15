import "./host";
import { expect, test } from "bun:test";
import { levelsFor } from "../index";

// The app's Quality asks for a NetEase level, then each lower one in turn.
test("asks for the level the app wants, then each below it", () => {
  expect(levelsFor("standard", false)).toEqual(["standard"]);
  expect(levelsFor("high", false)).toEqual(["exhigh", "higher", "standard"]);
  expect(levelsFor("lossless", false)).toEqual(["lossless", "exhigh", "higher", "standard"]);
});

// Prefer Hi-Res lifts Lossless only: it never raises a lower ask.
test("Prefer Hi-Res puts Hi-Res above Lossless", () => {
  expect(levelsFor("lossless", true)).toEqual(["hires", "lossless", "exhigh", "higher", "standard"]);
  expect(levelsFor("high", true)).toEqual(["exhigh", "higher", "standard"]);
});

// The app's default is high, so an ask it doesn't name is treated as that.
test("an unknown ask is treated as high", () => {
  expect(levelsFor("", false)).toEqual(["exhigh", "higher", "standard"]);
});

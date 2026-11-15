import "./host";
import { expect, test } from "bun:test";
import { streamOf } from "../index";

const item = {
  id: 1, url: "http://m701.music.126.net/a.flac", br: 1411000, size: 30000000,
  type: "FLAC", level: "lossless", code: 200, freeTrialInfo: null,
};

// A song NetEase has a URL for plays, labelled in the app's quality words.
test("plays what NetEase gives a URL for", () => {
  expect(streamOf(item)).toMatchObject({
    url: "http://m701.music.126.net/a.flac", type: "flac", quality: "lossless", bitRate: 1411000, size: 30000000,
  });
  expect(streamOf({ ...item, level: "hires" })?.quality).toBe("lossless");
  expect(streamOf({ ...item, type: "mp3", level: "exhigh" })?.quality).toBe("high");
});

// No URL at this level: the caller tries the next one down.
test("answers nothing when NetEase has no URL", () => {
  expect(streamOf({ ...item, url: null, code: 404 })).toBeNull();
});

// A Trial Clip is never played, but a lower level may still have the whole song,
// so the caller tries the next one down.
test("passes over a trial clip", () => {
  expect(streamOf({ ...item, freeTrialInfo: { start: 0, end: 30 } })).toBeNull();
});

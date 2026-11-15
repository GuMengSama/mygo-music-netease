import { answer, reset } from "./netease";
import { settings } from "./host";
import { beforeEach, expect, test } from "bun:test";
import { stream } from "../index";

beforeEach(() => {
  reset();
  settings.clear();
});

const item = {
  id: 1, url: "http://m701.music.126.net/a.flac", br: 1411000, size: 30000000,
  type: "FLAC", level: "lossless", code: 200, freeTrialInfo: null,
};

// NetEase answering song 1's URL at each level as given, and with none at the rest.
function atLevels(byLevel: Record<string, object>) {
  answer("/api/song/enhance/player/url/v1", (d: any) => ({ code: 200, data: byLevel[d.level] ? [{ id: 1, ...byLevel[d.level] }] : [] }));
}

// A song NetEase has a URL for plays, labelled in the app's quality words.
test("plays what NetEase gives a URL for", async () => {
  atLevels({ lossless: item });
  expect(await stream({ id: "1", quality: "lossless" })).toMatchObject({
    url: "http://m701.music.126.net/a.flac", type: "flac", quality: "lossless", bitRate: 1411000, size: 30000000,
  });
  atLevels({ exhigh: { ...item, type: "mp3", level: "exhigh" } });
  expect((await stream({ id: "1", quality: "high" })).quality).toBe("high");
  settings.set("preferHiRes", "true");
  atLevels({ hires: { ...item, level: "hires" } });
  expect((await stream({ id: "1", quality: "lossless" })).quality).toBe("lossless");
});

// No URL at a level: the next one down plays.
test("passes over a level with no URL", async () => {
  atLevels({ exhigh: { ...item, url: null, code: 404 }, higher: { ...item, url: "http://m.music.126.net/h.mp3", level: "higher" } });
  expect((await stream({ id: "1", quality: "high" })).url).toBe("http://m.music.126.net/h.mp3");
});

// A Trial Clip is never played, but a lower level may still have the whole song.
test("passes over a trial clip", async () => {
  atLevels({ exhigh: { ...item, freeTrialInfo: { start: 0, end: 30 } }, higher: { ...item, url: "http://m.music.126.net/h.mp3" } });
  expect((await stream({ id: "1", quality: "high" })).url).toBe("http://m.music.126.net/h.mp3");
});

// A stream without a level, size or bitrate is standard and says none of them.
test("a bare stream is standard", async () => {
  atLevels({ standard: { url: "http://m.music.126.net/x.mp3" } });
  expect(await stream({ id: "1", quality: "standard" })).toMatchObject({ quality: "standard", bitRate: 0, size: 0, type: "mp3" });
});

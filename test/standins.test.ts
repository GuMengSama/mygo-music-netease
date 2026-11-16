import { answer, reset, serve, webSent } from "./netease";
import { settings } from "./host";
import { beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { playlist, stream } from "../index";

const URLS = "/api/song/enhance/player/url/v1";
const AUDIO = "fs.kugou.com";

beforeEach(() => {
  reset();
  settings.clear();
  settings.set("otherSources", "true");
  answer(URLS, { code: 200, data: [] });
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "晴天", ar: [{ id: 6452, name: "周杰伦" }], dt: 269000 }] });
  bodian([]);
  kugou([]);
  bilibili([]);
});

type KugouSong = { songname: string; singername: string; duration: number; hash: string; "320hash"?: string; sqhash?: string; album_id?: string };
const qingtian: KugouSong = { songname: "晴天", singername: "周杰伦", duration: 269, hash: "h128", "320hash": "h320", sqhash: "hsq", album_id: "966846" };

// Kugou finding songs, and giving a whole song for each hash in files.
function kugou(songs: KugouSong[], files: Record<string, object> = { h320: { extName: "mp3", bitRate: 320000, fileSize: 10 } }) {
  serve("mobilecdn.kugou.com", () => ({ status: 1, data: { info: songs } }));
  serve("trackercdn.kugou.com", (r) => {
    const hash = r.url.searchParams.get("hash")!;
    const file = files[hash];
    return file ? { status: 1, url: [`http://${AUDIO}/${hash}.mp3`], ...file } : { status: 2 };
  });
  serve(AUDIO, () => new Response(new Uint8Array(8192), { status: 206 }));
}

type BodianSong = { MUSICRID: string; SONGNAME: string; ARTIST: string; DURATION: string };
const bodianQingtian: BodianSong = { MUSICRID: "MUSIC_228908", SONGNAME: "晴天", ARTIST: "周杰伦", DURATION: "269" };
const BODIAN_AUDIO = "bd-er.kuwo.cn";

// Bodian finding songs, and giving a whole song for each "musicId br" in files,
// to a device that has watched its ad, for a request signed as Bodian's app signs.
function bodian(songs: BodianSong[], files: Record<string, object> = {}) {
  serve("search.kuwo.cn", () => ({ content: [{}, { musicpage: { abslist: songs } }] }));
  const watched = new Set<string>();
  serve("bd-api.kuwo.cn", (r) => {
    if (r.url.pathname === "/api/service/advert/watch") {
      if (!r.headers.qimei36) return { code: -1, msg: "PARAM_ERROR" };
      return (watched.add(r.headers.devid), { code: 200 });
    }
    const query = r.url.search.slice(1).replace(/&sign=.*$/, "");
    const sign = createHash("md5").update(`kuwotest${query.replace(/[^a-zA-Z0-9]/g, "").split("").sort().join("")}${r.url.pathname}`).digest("hex");
    if (r.url.searchParams.get("sign") !== sign) return { code: 403, msg: "bad sign" };
    if (!watched.has(r.headers.devid)) return { code: 20018, msg: "没有解锁付费歌曲" };
    const file = files[`${r.url.searchParams.get("musicId")} ${r.url.searchParams.get("br")}`];
    return file ? { code: 200, data: { audioUrl: `http://${BODIAN_AUDIO}/${r.url.searchParams.get("br")}`, ...file } } : { code: 20018, msg: "没有解锁付费歌曲" };
  });
  serve(BODIAN_AUDIO, () => new Response(new Uint8Array(8192), { status: 206 }));
}

type BiliVideo = { title: string; duration: string; bvid: string };
const biliQingtian: BiliVideo = { title: '【Hi-Res】《<em class="keyword">晴天</em>》- <em class="keyword">周杰伦</em>', duration: "4:30", bvid: "BV1" };
const BILI_AUDIO = "x1.mcdn.bilivideo.cn";
const IMG = "7cd084941338484aae1ad9425b84077c";
const SUB = "4932caff0ff746eab6f01bf08b70ac45";
const MIXIN = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];

// Whether a Bilibili query carries the w_rid its WBI keys make: md5 of the
// query, less w_rid, and the keys mixed.
function wbiSigned(url: URL): boolean {
  const q = url.search.slice(1).replace(/&w_rid=[^&]*$/, "");
  const mixin = MIXIN.map((n) => (IMG + SUB)[n]).join("").slice(0, 32);
  const fresh = Math.abs(Number(url.searchParams.get("wts")) - Date.now() / 1000) < 60;
  return fresh && url.searchParams.get("w_rid") === createHash("md5").update(q + mixin).digest("hex");
}

// Bilibili finding videos, each with one page whose DASH audio is given.
function bilibili(videos: BiliVideo[], audio = [{ id: 30232, bandwidth: 82687 }, { id: 30280, bandwidth: 184052 }]) {
  serve("api.bilibili.com", (r) => {
    const path = r.url.pathname;
    if (path === "/x/web-interface/nav") return { code: -101, data: { wbi_img: { img_url: `https://i0.hdslb.com/bfs/wbi/${IMG}.png`, sub_url: `https://i0.hdslb.com/bfs/wbi/${SUB}.png` } } };
    if (!wbiSigned(r.url)) return { code: -403, message: "bad w_rid" };
    if (path === "/x/web-interface/wbi/search/type") return { code: 0, data: { result: videos } };
    if (path === "/x/web-interface/wbi/view") return { code: 0, data: { cid: 77 } };
    if (path === "/x/player/wbi/playurl" && r.url.searchParams.get("cid") === "77")
      return { code: 0, data: { dash: { audio: audio.map((a) => ({ ...a, base_url: `https://${BILI_AUDIO}:8082/${a.id}.m4s` })) } } };
    return { code: -404 };
  });
  serve(BILI_AUDIO, (r) => new Response(new Uint8Array(8192), { status: r.headers.referer === "https://www.bilibili.com/" ? 206 : 403 }));
}

// A song NetEase won't play whole plays as a Stand-in from Kugou.
test("plays a Kugou stand-in when NetEase has none", async () => {
  kugou([qingtian]);
  expect(await stream({ id: "1", quality: "high" })).toMatchObject({ url: `http://${AUDIO}/h320.mp3`, type: "mp3", quality: "high", bitRate: 320000, size: 10 });
  expect(webSent("mobilecdn.kugou.com")[0].url.searchParams.get("keyword")).toBe("晴天 周杰伦");
});

// Without the setting, no other service is asked, and NetEase's word is final.
test("asks no other service with the setting off", async () => {
  settings.delete("otherSources");
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable", message: "NetEase won't play this song for this account here." });
});

// With nothing found anywhere, the song is Unavailable, and says other services were asked.
test("says no other source has it when none does", async () => {
  kugou([]);
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable", message: "NetEase won't play this song, and no other source has it." });
});

// Only a Match plays: same title and version, a shared artist, and within 5s.
test("plays only a match", async () => {
  const file = { extName: "mp3", bitRate: 320000 };
  kugou(
    [
      { ...qingtian, songname: "晴天 (Live)", "320hash": "live" },
      { ...qingtian, singername: "某翻唱", "320hash": "cover" },
      { ...qingtian, duration: 275, "320hash": "edit" },
      { ...qingtian, songname: "晴天", singername: "周杰伦、合唱者", duration: 265, "320hash": "right" },
    ],
    { live: file, cover: file, edit: file, right: file },
  );
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/right.mp3`);
});

// What only looks like the song isn't played: the song stays Unavailable.
test("plays nothing that isn't a match", async () => {
  kugou([{ ...qingtian, songname: "晴天 (Live)" }]);
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable" });
});

// Case, spaces and bracket marks don't stop a Match, and NetEase's own version tag must be there too.
test("matches titles alike but for case, spaces and brackets", async () => {
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "Love Story（Live）", ar: [{ name: "Taylor Swift" }], dt: 0 }] });
  kugou([{ ...qingtian, songname: "love story (live)", singername: "taylor swift" }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// A Match whose audio won't come is passed over for the next.
test("passes over a match whose audio won't come", async () => {
  const file = { extName: "mp3", bitRate: 320000 };
  kugou([{ ...qingtian, "320hash": "gone" }, qingtian], { gone: file, h320: file });
  serve(AUDIO, (r) => new Response(new Uint8Array(8192), { status: r.url.pathname === "/gone.mp3" ? 403 : 206 }));
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
  expect(webSent(AUDIO).map((r) => r.headers.range)).toEqual(["bytes=0-8191", "bytes=0-8191"]);
});

// Kugou is asked for FLAC for Lossless, else 320k, then lower, and the app is told what came.
test("asks kugou for the app's quality, then lower", async () => {
  let seen = 0;
  const hashes = () => webSent("trackercdn.kugou.com").slice(seen).map((r) => (seen++, r.url.searchParams.get("hash")));
  kugou([qingtian], { hsq: { extName: "FLAC", bitRate: 1411000 } });
  expect(await stream({ id: "1", quality: "lossless" })).toMatchObject({ type: "flac", quality: "lossless" });
  expect(hashes()).toEqual(["hsq"]);
  kugou([qingtian], { h128: { extName: "mp3", bitRate: 128000 } });
  expect((await stream({ id: "1", quality: "lossless" })).quality).toBe("standard");
  expect(hashes()).toEqual(["hsq", "h320", "h128"]);
  expect((await stream({ id: "1", quality: "standard" })).quality).toBe("standard");
  expect(hashes()).toEqual(["h320", "h128"]);
});

// A service that fails or answers nonsense has no Match: it never breaks playback.
test("takes a failing service as having no match", async () => {
  const none = { code: "unavailable", message: "NetEase won't play this song, and no other source has it." };
  serve("mobilecdn.kugou.com", () => new Response("<html>busy</html>", { status: 503 }));
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject(none);
  serve("mobilecdn.kugou.com", () => ({ data: { info: [{ songname: 7 }, null] } }));
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject(none);
  kugou([qingtian]);
  serve("trackercdn.kugou.com", () => {
    throw new Error("connection reset");
  });
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject(none);
});

// NetEase's own whole song, at any quality, beats a Stand-in.
test("plays NetEase's song at a lower level before a stand-in", async () => {
  kugou([qingtian]);
  answer(URLS, (d: any) => ({ code: 200, data: d.level === "standard" ? [{ id: 1, url: "http://m.music.126.net/s.mp3" }] : [] }));
  expect((await stream({ id: "1", quality: "high" })).url).toBe("http://m.music.126.net/s.mp3");
});

// Episodes are never looked for elsewhere.
test("looks for no stand-in for an episode", async () => {
  await expect(stream({ id: "program:9:1", quality: "high" })).rejects.toMatchObject({ code: "unavailable", message: "NetEase won't play this song for this account here." });
});

// With the setting on, a song NetEase won't play isn't Unavailable up front: a Stand-in may play it.
test("doesn't mark songs unavailable with the setting on", async () => {
  const tracks = [{ id: 1, name: "晴天", privilege: { st: -200, pl: 0 } }];
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 9, tracks, trackIds: [{ id: 1 }] } });
  expect((await playlist({ id: "9" })).tracks[0].unavailable).toBeUndefined();
  settings.delete("otherSources");
  expect((await playlist({ id: "9" })).tracks[0].unavailable).toBe(true);
});

// Bodian is asked for FLAC for Lossless, else 320k, then lower, after watching its ad.
test("plays a bodian stand-in at the app's quality, then lower", async () => {
  bodian([bodianQingtian], { "228908 2000kflac": { format: "flac", bitrate: 2000 }, "228908 128kmp3": { format: "mp3", bitrate: 128 } });
  expect(await stream({ id: "1", quality: "lossless" })).toMatchObject({ url: `http://${BODIAN_AUDIO}/2000kflac`, type: "flac", quality: "lossless", bitRate: 2000000 });
  expect(await stream({ id: "1", quality: "high" })).toMatchObject({ url: `http://${BODIAN_AUDIO}/128kmp3`, type: "mp3", quality: "standard", bitRate: 128000 });
  expect(webSent("search.kuwo.cn")[0].url.searchParams.get("all")).toBe("晴天 周杰伦");
});

// Bodian's Match beats Kugou's, even when Kugou answers first.
test("prefers bodian to kugou whatever answers first", async () => {
  kugou([qingtian]);
  bodian([bodianQingtian], { "228908 320kmp3": { format: "mp3", bitrate: 320 } });
  serve("search.kuwo.cn", () => new Promise((done) => setTimeout(() => done({ content: [{}, { musicpage: { abslist: [bodianQingtian] } }] }), 20)));
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${BODIAN_AUDIO}/320kmp3`);
});

// With no Match on Bodian, or Bodian failing, Kugou's plays.
test("plays kugou's match when bodian has none", async () => {
  kugou([qingtian]);
  bodian([{ ...bodianQingtian, ARTIST: "别人" }], { "228908 320kmp3": { format: "mp3", bitrate: 320 } });
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
  serve("search.kuwo.cn", () => new Response("busy", { status: 502 }));
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// A Bilibili video of the song plays its best audio, sent with Bilibili's referer.
test("plays a bilibili stand-in", async () => {
  bilibili([biliQingtian]);
  expect(await stream({ id: "1", quality: "high" })).toMatchObject({
    url: `https://${BILI_AUDIO}:8082/30280.m4s`, type: "m4a", quality: "standard", bitRate: 184052, headers: { referer: "https://www.bilibili.com/" },
  });
});

// Only a video named for the song and an artist, no cover or backing track, and within 10s is a Match.
test("plays only a bilibili video that matches", async () => {
  const videos = [
    { ...biliQingtian, title: "晴天 周杰伦 cover", bvid: "a" },
    { ...biliQingtian, title: "周杰伦 翻唱 晴天", bvid: "b" },
    { ...biliQingtian, title: "晴天 伴奏 周杰伦", bvid: "c" },
    { ...biliQingtian, title: "晴天 别人", bvid: "d" },
    { ...biliQingtian, title: "周杰伦 七里香", bvid: "e" },
    { ...biliQingtian, duration: "4:40", bvid: "f" },
  ];
  bilibili(videos);
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable" });
  bilibili([...videos, { ...biliQingtian, duration: "4:20", bvid: "g" }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`https://${BILI_AUDIO}:8082/30280.m4s`);
});

// Bilibili's Match comes last: Kugou's beats it.
test("prefers kugou to bilibili", async () => {
  kugou([qingtian]);
  bilibili([biliQingtian]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// Runs f with the 8s limit on looking for a Stand-in cut to 10ms.
async function soon<T>(f: () => Promise<T>): Promise<T> {
  const realTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = (g: () => void, ms: number) => realTimeout(g, ms === 8000 ? 10 : ms);
  try {
    return await f();
  } finally {
    globalThis.setTimeout = realTimeout;
  }
}

const never = () => new Promise<never>(() => {});

// A service that hangs doesn't hold up another's Match past the limit, and is let go.
test("plays another source's match when one hangs past the limit", async () => {
  kugou([qingtian]);
  serve("search.kuwo.cn", never);
  expect((await soon(() => stream({ id: "1", quality: "high" }))).url).toBe(`http://${AUDIO}/h320.mp3`);
  expect(webSent("search.kuwo.cn")[0].signal?.aborted).toBe(true);
});

// With every service hanging, the song is Unavailable once the limit passes.
test("gives up when every source hangs past the limit", async () => {
  for (const h of ["search.kuwo.cn", "mobilecdn.kugou.com", "api.bilibili.com"]) serve(h, never);
  await expect(soon(() => stream({ id: "1", quality: "high" }))).rejects.toMatchObject({ code: "unavailable", message: "NetEase won't play this song, and no other source has it." });
});

// A NetEase title's "(翻自 …)" or "(cover …)" note isn't part of the song's name: it's left out of searches and Matches.
test("leaves a cover note out of the title", async () => {
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "晴天 (翻自 周杰伦)", ar: [{ name: "某歌手" }], dt: 269000 }] });
  kugou([{ ...qingtian, singername: "某歌手" }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
  expect(webSent("mobilecdn.kugou.com")[0].url.searchParams.get("keyword")).toBe("晴天 某歌手");
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "晴天（Cover：周杰伦）", ar: [{ name: "某歌手" }], dt: 269000 }] });
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// A song NetEase gives only a Trial Clip of plays whole as a Stand-in.
test("plays a stand-in in place of a trial clip", async () => {
  kugou([qingtian]);
  answer(URLS, { code: 200, data: [{ id: 1, url: "http://m.music.126.net/clip.mp3", freeTrialInfo: { start: 0, end: 30 } }] });
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// NetEase failing to name the song is no different to the listener from no Stand-in.
test("is unavailable when NetEase won't name the song", async () => {
  answer("/api/v3/song/detail", { code: 500, message: "server busy" });
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable", message: "NetEase won't play this song, and no other source has it." });
});

// A video of another version of the song isn't a Match, unless NetEase's title is that version too.
test("plays only a bilibili video of the same version", async () => {
  bilibili([{ ...biliQingtian, title: "晴天 (Live) 周杰伦" }, { ...biliQingtian, title: "周杰伦 晴天 现场版" }, { ...biliQingtian, title: "晴天 Remix 周杰伦" }]);
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable" });
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "晴天 (Live)", ar: [{ name: "周杰伦" }], dt: 269000 }] });
  bilibili([{ ...biliQingtian, title: "晴天 (Live) 周杰伦" }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`https://${BILI_AUDIO}:8082/30280.m4s`);
});

// A cover or version word inside the song's or an artist's name isn't a marker.
test("plays a bilibili video whose names hold marker words", async () => {
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "Undercover", ar: [{ name: "Oliver Tree" }], dt: 269000 }] });
  bilibili([{ ...biliQingtian, title: "Oliver Tree - Undercover (Official Audio)" }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`https://${BILI_AUDIO}:8082/30280.m4s`);
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 1, name: "Demon", ar: [{ name: "DJ Okawari" }], dt: 269000 }] });
  bilibili([{ ...biliQingtian, title: "DJ Okawari - Demon" }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`https://${BILI_AUDIO}:8082/30280.m4s`);
  bilibili([{ ...biliQingtian, title: "DJ Okawari - Demon (Live)" }, { ...biliQingtian, title: "DJ Okawari - Demon cover" }]);
  await expect(stream({ id: "1", quality: "high" })).rejects.toMatchObject({ code: "unavailable" });
});

// A song a service gives no length for is matched on title and artist alone.
test("matches a song whose length a service leaves out", async () => {
  kugou([{ ...qingtian, duration: undefined as any }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
  bodian([{ ...bodianQingtian, DURATION: "" }], { "228908 320kmp3": { format: "mp3", bitrate: 320 } });
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${BODIAN_AUDIO}/320kmp3`);
});

// Nonsense among a service's songs doesn't hide the real ones beside it.
test("passes over nonsense among a service's songs", async () => {
  kugou([null as any, 7 as any, qingtian]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// A Match whose audio host can't be reached is passed over like one that refuses.
test("passes over a match whose audio host can't be reached", async () => {
  kugou([{ ...qingtian, "320hash": "gone" }, qingtian], { gone: { extName: "mp3" }, h320: { extName: "mp3" } });
  serve(AUDIO, (r) => {
    if (r.url.pathname === "/gone.mp3") throw new Error("connection refused");
    return new Response(new Uint8Array(8192), { status: 206 });
  });
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

// A song exactly 5s longer or shorter is still a Match.
test("matches a song just 5s off", async () => {
  kugou([{ ...qingtian, duration: 274 }]);
  expect((await stream({ id: "1", quality: "high" })).url).toBe(`http://${AUDIO}/h320.mp3`);
});

import { answer, reset, sent } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { album, artist, browse, home, isLiked, like, lyrics, playlist, search, signOut, stream } from "../index";
import { settings, storage } from "./host";

beforeEach(() => {
  reset();
  settings.clear();
});

const song = (id: number) => ({ id, name: `s${id}`, ar: [{ id: 1, name: "a" }], al: { id: 2, name: "b" }, dt: 1000 });

// Lossless the account can't get falls to the next level that has the whole song.
test("streams the best level the account can play", async () => {
  answer("/api/song/enhance/player/url/v1", (d: any) => ({
    code: 200,
    data: [d.level === "exhigh" ? { id: 5, url: "http://m.music.126.net/x.mp3", type: "mp3", level: "exhigh", br: 320000 }
      : d.level === "lossless" ? { id: 5, url: "http://m.music.126.net/t.mp3", freeTrialInfo: { start: 0, end: 30 } }
      : { id: 5, url: null }],
  }));
  expect(await stream({ id: "5", quality: "lossless" })).toMatchObject({ url: "http://m.music.126.net/x.mp3", quality: "high" });
});

// Prefer Hi-Res asks for Hi-Res before Lossless.
test("asks for Hi-Res first when preferred", async () => {
  settings.set("preferHiRes", "true");
  answer("/api/song/enhance/player/url/v1", { code: 200, data: [{ id: 5, url: "http://m.music.126.net/h.flac", type: "flac", level: "hires" }] });
  await stream({ id: "5", quality: "lossless" });
  expect(sent("/api/song/enhance/player/url/v1")[0].level).toBe("hires");
});

// A song no level has whole is Unavailable.
test("a song with no whole stream is unavailable", async () => {
  answer("/api/song/enhance/player/url/v1", { code: 200, data: [{ id: 5, url: null }] });
  await expect(stream({ id: "5", quality: "high" })).rejects.toMatchObject({ code: "unavailable" });
});

// A long playlist's songs past the first NetEase sends whole are fetched by id.
test("loads every song of a long playlist", async () => {
  answer("/api/v6/playlist/detail", {
    code: 200,
    playlist: { id: 9, name: "p", creator: { userId: 7 }, subscribed: true, tracks: [song(1)], trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  });
  answer("/api/v3/song/detail", { code: 200, songs: [song(2), song(3)], privileges: [{ id: 3, st: -200, pl: 0 }] });
  const p = await playlist({ id: "9" });
  expect(p.tracks.map((t: any) => t.id)).toEqual(["1", "2", "3"]);
  expect(p.tracks[2].unavailable).toBe(true);
  expect(p.saved).toBe(true);
});

// The listener's Liked Songs is theirs, kept by NetEase.
test("the listener's Liked Songs is fixed", async () => {
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 1, name: "我喜欢的音乐", specialType: 5, creator: { userId: 42 }, tracks: [], trackIds: [] } });
  expect(await playlist({ id: "1" })).toMatchObject({ mine: true, fixed: true });
});

// An album's songs show its cover.
test("an album's songs carry its cover", async () => {
  answer("/api/v1/album/2", { code: 200, album: { id: 2, name: "b", picUrl: "http://p1.music.126.net/c.jpg" }, songs: [song(1)] });
  const a = await album({ id: "2" });
  expect(a.tracks[0].album.imageUrl).toBe("https://p1.music.126.net/c.jpg?param={size}y{size}");
});

// Search pages on while NetEase has more than it has given.
test("search says when there's more", async () => {
  answer("/api/cloudsearch/pc", { code: 200, result: { songs: [song(1), song(2)], songCount: 5 } });
  expect(await search({ query: "x", kind: "tracks", offset: 0 })).toMatchObject({ more: true });
  expect(await search({ query: "x", kind: "tracks", offset: 3 })).toMatchObject({ more: false });
});

// Searching for something NetEase can't find that way says so.
test("search refuses kinds it doesn't do", async () => {
  await expect(search({ query: "x", kind: "nope", offset: 0 })).rejects.toMatchObject({ code: "unsupported" });
});

// Signed in, Home leads with the day's songs.
test("signed-in Home leads with Daily Recommendations", async () => {
  answer("/api/v3/discovery/recommend/songs", { code: 200, data: { dailySongs: [song(1)] } });
  answer("/api/v1/discovery/recommend/resource", { code: 200, recommend: [] });
  answer("/api/album/new", { code: 200, albums: [] });
  const h = await home();
  expect(h.sections[0]).toMatchObject({ tracks: [{ id: "1" }] });
});

// Signed out, Home shows the charts.
test("signed-out Home shows the charts", async () => {
  reset(false);
  answer("/api/v6/playlist/detail", (d: any) => ({ code: 200, playlist: { id: d.id, name: `chart ${d.id}`, tracks: [song(1)], trackIds: [{ id: 1 }] } }));
  answer("/api/album/new", { code: 200, albums: [] });
  const h = await home();
  expect(h.sections.slice(0, 3).map((s: any) => s.title)).toEqual(["chart 19723756", "chart 3779629", "chart 3778678"]);
  expect(h.sections[3].albums).toEqual([]);
});

// An artist's page has their top songs and albums.
test("an artist's page has their songs and albums", async () => {
  answer("/api/v1/artist/1", { code: 200, artist: { id: 1, name: "MyGO!!!!!", picUrl: "http://p1.music.126.net/a.jpg" }, hotSongs: [song(3)] });
  answer("/api/artist/albums/1", { code: 200, hotAlbums: [{ id: 2, name: "迷跡波" }] });
  expect(await artist({ id: "1" })).toMatchObject({
    artist: { id: "1", name: "MyGO!!!!!", imageUrl: "https://p1.music.126.net/a.jpg?param={size}y{size}" },
    tracks: [{ id: "3" }],
    albums: [{ id: "2", name: "迷跡波" }],
  });
});

// The Charts page lists every chart, with how often it changes.
test("the Charts page lists the charts", async () => {
  answer("/api/toplist", { code: 200, list: [{ id: 19723756, name: "飙升榜", updateFrequency: "每天更新" }] });
  const b = await browse({ page: "charts" });
  expect(b.sections[0].playlists).toEqual([{ id: "19723756", name: "飙升榜", description: "每天更新" }]);
});

// A page the plugin doesn't have is refused.
test("an unknown page is unsupported", async () => {
  await expect(browse({ page: "nope" })).rejects.toMatchObject({ code: "unsupported" });
});

// Lyrics come with their translation when NetEase has one.
test("lyrics come with their translation", async () => {
  answer("/api/song/lyric", { code: 200, lrc: { lyric: "[00:01.00]春日影" }, tlyric: { lyric: "" } });
  expect(await lyrics({ id: "1" })).toEqual({ lrc: "[00:01.00]春日影" });
});

// Liking a song shows on its heart without asking NetEase again.
test("a liked song's heart fills", async () => {
  answer("/api/song/like/get", { code: 200, ids: [1] });
  answer("/api/radio/like", { code: 200 });
  expect(await isLiked({ ids: ["1", "2"] })).toEqual({ "1": true, "2": false });
  await like({ id: "2", on: true });
  await like({ id: "1", on: false });
  expect(await isLiked({ ids: ["1", "2"] })).toEqual({ "1": false, "2": true });
  expect(sent("/api/song/like/get")).toHaveLength(1);
});

// NetEase's answer, held until release is called.
function later(body: any) {
  let release = () => {};
  const answered = new Promise((r) => (release = () => r(body)));
  return { answered, release };
}

// Likes asked for before switching accounts aren't the new account's.
test("another account's likes don't show", async () => {
  const old = later({ code: 200, ids: [1] });
  answer("/api/song/like/get", () => old.answered);
  const asked = isLiked({ ids: ["1"] });
  signOut();
  storage.set("session", { cookie: "MUSIC_U=u3", account: { id: "43", name: "you" } });
  old.release();
  await asked;
  answer("/api/song/like/get", { code: 200, ids: [] });
  expect(await isLiked({ ids: ["1"] })).toEqual({ "1": false });
});

// A song liked while NetEase is still listing likes shows liked.
test("a like made while likes load stays", async () => {
  const listed = later({ code: 200, ids: [] });
  answer("/api/song/like/get", () => listed.answered);
  answer("/api/radio/like", { code: 200 });
  const asked = isLiked({ ids: ["2"] });
  await like({ id: "2", on: true });
  listed.release();
  await asked;
  expect(await isLiked({ ids: ["2"] })).toEqual({ "2": true });
});

// Likes NetEase failed to list are asked for again.
test("asks for likes again after NetEase fails", async () => {
  answer("/api/song/like/get", { code: 500 });
  await expect(isLiked({ ids: ["1"] })).rejects.toThrow();
  answer("/api/song/like/get", { code: 200, ids: [1] });
  expect(await isLiked({ ids: ["1"] })).toEqual({ "1": true });
});

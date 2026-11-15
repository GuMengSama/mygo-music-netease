// What the plugin does when NetEase leaves things out, and what it must ask
// NetEase for to get the right answer.
import { answer, quickly, requests, reset, sent, setCookie } from "./netease";
import { prompts, storage } from "./host";
import { beforeEach, expect, test } from "bun:test";
import {
  album, home, isLiked, like, list, lyrics, playlist, playlists, search, signIn, stream, streamOf, text, toAlbum, toTrack,
} from "../index";

beforeEach(() => reset());

const song = (id: number) => ({ id, name: `s${id}`, ar: [], al: { id: 2, name: "b" }, dt: 1000 });

// Lists and text NetEase leaves out, or sends as something else, count as none.
test("missing lists and text are empty", () => {
  expect(list(undefined)).toEqual([]);
  expect(list(null)).toEqual([]);
  expect(list([1])).toEqual([1]);
  expect(text(undefined)).toBe("");
  expect(text(3)).toBe("");
  expect(text("a")).toBe("a");
});

// A song without a length lasts no time, rather than an unknown one.
test("a song without a length is 0 long", () => {
  expect(toTrack({ id: 1 }).duration).toBe(0);
});

// An album naming its artists as a list keeps them all.
test("an album keeps all its artists", () => {
  expect(toAlbum({ id: 1, artists: [{ id: 2, name: "a" }, { id: 3, name: "b" }] }).artists).toHaveLength(2);
});

// A stream without a level, size or bitrate is standard and says none of them.
test("a bare stream is standard", () => {
  expect(streamOf({ id: 1, url: "http://m.music.126.net/x.mp3" })).toMatchObject({ quality: "standard", bitRate: 0, size: 0, type: "mp3" });
});

// A song missing from NetEase's answer is unavailable.
test("a song NetEase leaves out of its URLs is unavailable", async () => {
  answer("/api/song/enhance/player/url/v1", { code: 200, data: [] });
  await expect(stream({ id: "5", quality: "standard" })).rejects.toMatchObject({ code: "unavailable" });
});

// Lyrics need NetEase told which versions of them: the original and its translation.
test("asks for the lyrics and their translation", async () => {
  answer("/api/song/lyric", { code: 200 });
  expect(await lyrics({ id: "1" })).toEqual({});
  expect(sent("/api/song/lyric")[0]).toMatchObject({ id: "1", lv: -1, tv: -1 });
});

// Search from the start when no offset is given, and finds nothing in an empty answer.
test("a search NetEase finds nothing for is empty", async () => {
  answer("/api/cloudsearch/pc", { code: 200 });
  expect(await search({ query: "x", kind: "albums" } as any)).toEqual({ albums: [], more: false });
  expect(sent("/api/cloudsearch/pc")[0]).toMatchObject({ s: "x", type: 10, limit: 30, offset: 0, total: true });
});

// An album's songs keep a cover of their own over the album's.
test("an album's song keeps its own cover", async () => {
  answer("/api/v1/album/2", { code: 200, album: { id: 2, picUrl: "http://p1.music.126.net/album.jpg" }, songs: [{ id: 1, al: { id: 2, picUrl: "http://p1.music.126.net/own.jpg" } }, { id: 3 }] });
  const a = await album({ id: "2" });
  expect(a.tracks.map((t: any) => t.album.imageUrl)).toEqual([
    "https://p1.music.126.net/own.jpg?param={size}y{size}",
    "https://p1.music.126.net/album.jpg?param={size}y{size}",
  ]);
});

// An album NetEase answers without details is still the one asked for.
test("an album without details keeps its id", async () => {
  answer("/api/v1/album/2", { code: 200 });
  expect(await album({ id: "2" })).toEqual({ album: { id: "2", artists: [] }, tracks: [] });
});

// A playlist's songs past the first are fetched 500 at a time.
test("fetches a long playlist's songs in batches", async () => {
  const ids = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1 }));
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 9, trackIds: ids } });
  answer("/api/v3/song/detail", (d: any) => ({ code: 200, songs: JSON.parse(d.c).map((x: any) => song(x.id)) }));
  expect((await playlist({ id: "9" })).tracks).toHaveLength(1000);
  expect(sent("/api/v3/song/detail").map((d: any) => JSON.parse(d.c).length)).toEqual([500, 500]);
});

// A playlist with no owner, as NetEase sometimes sends, is neither the listener's nor saved.
test("a playlist without an owner is someone else's", async () => {
  answer("/api/v6/playlist/detail", { code: 200 });
  const p = await playlist({ id: "9" });
  expect(p.mine).toBeUndefined();
  expect(p.saved).toBeUndefined();
});

// NetEase lists only some playlists unless asked for all of them, for the listener NetEase knows.
test("asks for all the listener's playlists", async () => {
  answer("/api/user/playlist", { code: 200, playlist: [{ id: 1, name: "x" }] });
  expect(await playlists()).toEqual([{ id: "1", name: "x", saved: true }]);
  expect(sent("/api/user/playlist")[0]).toMatchObject({ uid: "42", limit: 1000 });
});

// Likes are the listener's own: their hearts need them signed in.
test("hearts ask to sign in first", async () => {
  reset(false);
  await expect(isLiked({ ids: ["1"] })).rejects.toMatchObject({ code: "signIn" });
  await expect(like({ id: "1", on: true })).rejects.toMatchObject({ code: "signIn" });
});

// Hearts are the listener's, and liking tells NetEase which song.
test("likes go to NetEase for the listener", async () => {
  answer("/api/song/like/get", { code: 200 });
  answer("/api/radio/like", { code: 200 });
  expect(await isLiked({ ids: ["1"] })).toEqual({ "1": false });
  await like({ id: "1", on: true });
  expect(sent("/api/song/like/get")[0]).toMatchObject({ uid: "42" });
  expect(sent("/api/radio/like")[0]).toMatchObject({ trackId: "1", like: true });
});

// Signed-out Home shows each chart's top 20.
test("charts on Home show their top 20", async () => {
  reset(false);
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 1, name: "c", tracks: Array.from({ length: 25 }, (_, i) => song(i + 1)) } });
  answer("/api/album/new", { code: 200 });
  const h = await home();
  expect(h.sections[0].tracks).toHaveLength(20);
  expect(h.sections[3]).toEqual({ title: "New Albums", albums: [] });
});

// Daily Recommendations NetEase sends no songs for leave Home's first section empty.
test("Home copes with no recommendations", async () => {
  answer("/api/v3/discovery/recommend/songs", { code: 200 });
  answer("/api/v1/discovery/recommend/resource", { code: 200 });
  answer("/api/album/new", { code: 200 });
  expect((await home()).sections[0].tracks).toEqual([]);
});

// Every request comes from one device, as NetEase ties a Session to it.
test("requests come from one device", async () => {
  answer("/api/song/lyric", { code: 200 });
  await lyrics({ id: "1" });
  await lyrics({ id: "2" });
  const devices = requests.map((r) => r.headers.cookie.match(/deviceId=(\w+)/)![1]);
  expect(devices[0]).toBe(devices[1]);
  expect(storage.get("deviceId")).toBe(devices[0]);
});

// A one-letter cookie NetEase sets is kept like any other.
test("keeps short cookies NetEase sets", async () => {
  answer("/api/song/lyric", { code: 200 });
  setCookie("/api/song/lyric", "a=1");
  await lyrics({ id: "1" });
  expect(storage.get("session").cookie).toBe("MUSIC_U=u1; a=1");
});

// Once scanned, the sign-in window says to confirm on the phone; NetEase may
// hand the cookies over in its answer rather than as cookies.
test("a scanned code asks for confirmation, and signs in with the cookies NetEase answers", async () => {
  reset(false);
  answer("/api/login/qrcode/unikey", { code: 200, unikey: "k" });
  let polls = 0;
  answer("/api/login/qrcode/client/login", () => (++polls === 1 ? { code: 802 } : { code: 803, cookie: "MUSIC_U=b" }));
  answer("/api/w/nuser/account/get", { code: 200, profile: { userId: 1 } });
  expect(await quickly(signIn)).toEqual({ id: "1" });
  expect(prompts.at(-1).text).toBe("Scanned. Confirm on your phone.");
  expect(storage.get("session").cookie).toBe("MUSIC_U=b");
});

import { artist, saveAlbum, savedAlbums } from "../index";

// An artist's page asks for up to 100 of their albums.
test("asks for an artist's albums", async () => {
  answer("/api/v1/artist/1", { code: 200 });
  answer("/api/artist/albums/1", { code: 200 });
  expect(await artist({ id: "1" })).toEqual({ artist: { id: "1" }, tracks: [], albums: [] });
  expect(sent("/api/artist/albums/1")[0]).toMatchObject({ limit: 100 });
});

// Home's new albums are a dozen of them, from everywhere.
test("asks for a dozen new albums", async () => {
  reset(false);
  answer("/api/v6/playlist/detail", { code: 200 });
  answer("/api/album/new", { code: 200 });
  await home();
  expect(sent("/api/album/new")[0]).toMatchObject({ area: "ALL", limit: 12 });
});

// Saved albums page on while NetEase has more, each one saved.
test("lists saved albums a page at a time", async () => {
  answer("/api/album/sublist", (d: any) => ({ code: 200, data: [{ id: d.offset + 1, name: "a" }], hasMore: d.offset === 0 }));
  expect(await savedAlbums({})).toEqual({ albums: [{ id: "1", name: "a", artists: [], saved: true }], more: true });
  expect(await savedAlbums({ offset: 30 })).toMatchObject({ more: false });
  expect(sent("/api/album/sublist")).toMatchObject([{ offset: 0, limit: 30 }, { offset: 30, limit: 30 }]);
});

// Saving and unsaving an album tells NetEase which.
test("saves and unsaves albums", async () => {
  answer("/api/album/sub", { code: 200 });
  answer("/api/album/unsub", { code: 200 });
  await saveAlbum({ id: "2", on: true });
  await saveAlbum({ id: "3", on: false });
  expect(sent("/api/album/sub")).toEqual([expect.objectContaining({ id: "2" })]);
  expect(sent("/api/album/unsub")).toEqual([expect.objectContaining({ id: "3" })]);
});

// Saved albums are the listener's own.
test("saved albums ask to sign in first", async () => {
  reset(false);
  await expect(savedAlbums({})).rejects.toMatchObject({ code: "signIn" });
  await expect(saveAlbum({ id: "2", on: true })).rejects.toMatchObject({ code: "signIn" });
});

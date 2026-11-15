import { answer, reset, sent } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { episodeId, isLiked, likeEpisode, search, show, shows, stream, subscribeShow, toEpisode, toShow } from "../index";
import { storage } from "./host";

beforeEach(() => reset());

const radio = { id: 3, name: "声音", picUrl: "http://p1.music.126.net/r.jpg", desc: "聊天", dj: { nickname: "主播" }, programCount: 12, subed: true };
const program = {
  id: 7, name: "第一期", description: "开场", duration: 1800000, createTime: 1703606400000,
  coverUrl: "http://p1.music.126.net/p.jpg", mainSong: { id: 8, duration: 1800000 }, radio: { id: 3, name: "声音" },
};

// A NetEase show becomes a Podcast.
test("maps a show to a Podcast", () => {
  expect(toShow(radio)).toEqual({
    id: "3", name: "声音", imageUrl: "https://p1.music.126.net/r.jpg?param={size}y{size}",
    description: "聊天", publisher: "主播", episodeCount: 12, subscribed: true,
  });
});

// A programme becomes an Episode of its Podcast, playing its own song.
test("maps a programme to an Episode", () => {
  expect(toEpisode(program)).toEqual({
    id: "program:7:8", name: "第一期", duration: 1800000, showId: "3", description: "开场", published: "2023-12-27",
    album: { id: "3", name: "声音", imageUrl: "https://p1.music.126.net/p.jpg?param={size}y{size}" },
  });
});

// The listener's Podcasts are the shows they subscribe to.
test("lists the listener's Podcasts", async () => {
  answer("/api/djradio/get/subed", { code: 200, djRadios: [radio] });
  expect(await shows()).toEqual([toShow(radio)]);
  expect(sent("/api/djradio/get/subed")[0]).toMatchObject({ limit: 1000 });
});

// A Podcast's page is the show and its Episodes, newest first, a page at a time.
test("a Podcast's page has its Episodes", async () => {
  answer("/api/djradio/v2/get", { code: 200, data: radio });
  answer("/api/dj/program/byradio", { code: 200, programs: [program], more: true });
  expect(await show({ id: "3", offset: 30 })).toEqual({ show: toShow(radio), episodes: [toEpisode(program)], more: true });
  expect(sent("/api/dj/program/byradio")[0]).toMatchObject({ radioId: "3", offset: 30, limit: 30, asc: false });
});

// A Podcast NetEase answers without details is still the one asked for, from its start.
test("a bare Podcast page", async () => {
  answer("/api/djradio/v2/get", { code: 200 });
  answer("/api/dj/program/byradio", { code: 200 });
  expect(await show({ id: "3" } as any)).toEqual({ show: { id: "3", subscribed: false }, episodes: [], more: false });
  expect(sent("/api/dj/program/byradio")[0]).toMatchObject({ offset: 0 });
});

// Subscribing and unsubscribing tell NetEase which Podcast.
test("subscribes and unsubscribes", async () => {
  answer("/api/djradio/sub", { code: 200 });
  answer("/api/djradio/unsub", { code: 200 });
  await subscribeShow({ id: "3", on: true });
  await subscribeShow({ id: "4", on: false });
  expect(sent("/api/djradio/sub")).toEqual([expect.objectContaining({ id: "3" })]);
  expect(sent("/api/djradio/unsub")).toEqual([expect.objectContaining({ id: "4" })]);
});

// Searching finds Podcasts too.
test("searches Podcasts", async () => {
  answer("/api/cloudsearch/pc", { code: 200, result: { djRadios: [radio], djRadiosCount: 5 } });
  expect(await search({ query: "声音", kind: "shows", offset: 0 })).toEqual({ shows: [toShow(radio)], more: true });
  expect(sent("/api/cloudsearch/pc")[0]).toMatchObject({ type: 1009 });
});

// Liking an Episode likes its programme.
test("likes and unlikes an Episode", async () => {
  answer("/api/resource/like", { code: 200 });
  answer("/api/resource/unlike", { code: 200 });
  await likeEpisode({ id: episodeId("7", "8"), on: true });
  await likeEpisode({ id: episodeId("9", "8"), on: false });
  expect(sent("/api/resource/like")[0]).toMatchObject({ threadId: "A_DJ_1_7" });
  expect(sent("/api/resource/unlike")[0]).toMatchObject({ threadId: "A_DJ_1_9" });
});

// An Episode plays its programme's song.
test("an Episode plays its song", async () => {
  answer("/api/song/enhance/player/url/v1", (d: any) => ({ code: 200, data: [{ id: 8, url: `http://m.music.126.net/${JSON.parse(d.ids)[0]}.mp3` }] }));
  expect((await stream({ id: episodeId("7", "8"), quality: "standard" })).url).toBe("http://m.music.126.net/8.mp3");
});

// Podcasts the listener keeps are theirs: they need signing in.
test("the listener's Podcasts ask to sign in first", async () => {
  reset(false);
  await expect(shows()).rejects.toMatchObject({ code: "signIn" });
  await expect(subscribeShow({ id: "3", on: true })).rejects.toMatchObject({ code: "signIn" });
  await expect(likeEpisode({ id: episodeId("7", "8"), on: true })).rejects.toMatchObject({ code: "signIn" });
});

// A programme NetEase has no song for can't be played: its Episode is Unavailable.
test("a programme without its song is unavailable", () => {
  expect(toEpisode({ id: 7 })).toEqual({ id: "program:7", duration: 0, album: {}, unavailable: true });
});

// Playing an Episode without a song is refused without asking NetEase.
test("an Episode without a song won't play", async () => {
  await expect(stream({ id: "program:7", quality: "standard" })).rejects.toMatchObject({ code: "unavailable" });
  expect(sent("/api/song/enhance/player/url/v1")).toEqual([]);
});

// An Episode liked here shows a full heart, and an empty one once unliked again.
test("an Episode liked here shows liked until unliked", async () => {
  answer("/api/resource/like", { code: 200 });
  answer("/api/resource/unlike", { code: 200 });
  answer("/api/song/like/get", { code: 200, ids: [1] });
  const ep = episodeId("7", "8");
  expect(await isLiked({ ids: [ep, "1"] })).toEqual({ [ep]: false, "1": true });
  await likeEpisode({ id: ep, on: true });
  expect(await isLiked({ ids: [ep] })).toEqual({ [ep]: true });
  await likeEpisode({ id: ep, on: false });
  expect(await isLiked({ ids: [ep] })).toEqual({ [ep]: false });
});

// Episodes one listener liked aren't another's.
test("liked Episodes are each listener's own", async () => {
  answer("/api/resource/like", { code: 200 });
  answer("/api/song/like/get", { code: 200 });
  const ep = episodeId("7", "8");
  await likeEpisode({ id: ep, on: true });
  storage.set("session", { cookie: "MUSIC_U=other", account: { id: "99", name: "them" } });
  expect(await isLiked({ ids: [ep] })).toEqual({ [ep]: false });
});

import { settings } from "./host";
import { answer, reset, sent } from "./netease";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { played, stationNext, stations } from "../index";

const realRandom = Math.random;

// A listener who likes songs 11, 12 and 13, kept in their Liked playlist 900,
// and a NetEase that answers songs like whichever it's asked of.
beforeEach(() => {
  reset();
  settings.clear();
  answer("/api/song/like/get", { code: 200, ids: [11, 12, 13] });
  answer("/api/user/playlist", {
    code: 200,
    playlist: [
      { id: 901, name: "mine", specialType: 0, creator: { userId: 42 } },
      { id: 900, name: "liked", specialType: 5, creator: { userId: 42 } },
    ],
  });
  answer("/api/v3/song/detail", (d: any) => ({ code: 200, songs: JSON.parse(d.c).map(({ id }: any) => ({ id, name: `song ${id}` })) }));
  answer("/api/playmode/intelligence/list", (d: any) => ({
    code: 200,
    data: [1, 2].map((n) => ({ id: Number(d.songId) * 10 + n, songInfo: { id: Number(d.songId) * 10 + n, name: "like it" } })),
  }));
  Math.random = () => 0.5;
});

afterEach(() => {
  Math.random = realRandom;
});

const ids = (tracks: any[]) => tracks.map((t) => t.id);

// Heartbeat sits beside Personal FM.
test("the listener's stations are Personal FM, then Heartbeat", async () => {
  expect((await stations()).map((s: any) => s.id)).toEqual(["fm", "heartbeat"]);
});

// With no song to start from, Heartbeat picks a liked song, plays it, then songs like it.
test("Heartbeat starts from a random liked song, played first", async () => {
  expect(ids(await stationNext({ id: "heartbeat" }))).toEqual(["12", "121", "122"]);
  expect(sent("/api/playmode/intelligence/list")).toEqual([
    expect.objectContaining({ songId: "12", startMusicId: "12", playlistId: "900", type: "fromPlayOne", count: 1 }),
  ]);
});

// Heartbeat starts from a liked song: with none, the listener learns what to do.
test("Heartbeat asks for liked songs when there are none", async () => {
  answer("/api/song/like/get", { code: 200, ids: [] });
  await expect(stationNext({ id: "heartbeat" })).rejects.toThrow("Like some songs to start Heartbeat");
  expect(sent("/api/playmode/intelligence/list")).toEqual([]);
});

// Heartbeat is the listener's: it needs them signed in.
test("Heartbeat asks to sign in first", async () => {
  reset(false);
  await expect(stationNext({ id: "heartbeat" })).rejects.toMatchObject({ code: "signIn" });
});

// A Seed NetEase won't play still steers the run; the app skips the Seed itself.
test("Heartbeat starts from a liked song that won't play", async () => {
  answer("/api/v3/song/detail", (d: any) => ({
    code: 200,
    songs: JSON.parse(d.c).map(({ id }: any) => ({ id, name: "gone" })),
    privileges: JSON.parse(d.c).map(({ id }: any) => ({ id, st: -200, pl: 0 })),
  }));
  const tracks = await stationNext({ id: "heartbeat" });
  expect(tracks.map((t: any) => [t.id, !!t.unavailable])).toEqual([["12", true], ["121", false], ["122", false]]);
});

// A run goes on from the last song it gave, from the same Seed, without the Seed again.
test("Heartbeat goes on from the last song it gave", async () => {
  await stationNext({ id: "heartbeat" });
  expect(ids(await stationNext({ id: "heartbeat" }))).toEqual(["1221", "1222"]);
  expect(sent("/api/playmode/intelligence/list")[1]).toEqual(expect.objectContaining({ songId: "122", startMusicId: "12", playlistId: "900" }));
  // The Liked playlist is looked up once, as the run starts.
  expect(sent("/api/user/playlist")).toHaveLength(1);
});

// A liked song just played is the Seed, not played again, Play Reports off or on.
test("Heartbeat starts from the liked song just played", async () => {
  await played({ id: "11" });
  expect(ids(await stationNext({ id: "heartbeat" }))).toEqual(["111", "112"]);
  expect(sent("/api/playmode/intelligence/list")).toEqual([expect.objectContaining({ songId: "11", startMusicId: "11" })]);
});

// A song just played that the listener doesn't like can't be the Seed.
test("Heartbeat starts from a random liked song after an unliked one", async () => {
  await played({ id: "99" });
  expect(ids(await stationNext({ id: "heartbeat" }))).toEqual(["12", "121", "122"]);
});

// While the listener plays the run's songs, the run goes on.
test("Heartbeat goes on while its songs play", async () => {
  await played({ id: "11" });
  await stationNext({ id: "heartbeat" });
  await played({ id: "112" });
  await stationNext({ id: "heartbeat" });
  expect(sent("/api/playmode/intelligence/list")[1]).toEqual(expect.objectContaining({ songId: "112", startMusicId: "11" }));
});

// Leaving Heartbeat for other songs and coming back starts a new run from them.
test("Heartbeat starts a new run after other songs played", async () => {
  await stationNext({ id: "heartbeat" });
  await played({ id: "13" });
  expect(ids(await stationNext({ id: "heartbeat" }))).toEqual(["131", "132"]);
  expect(sent("/api/playmode/intelligence/list")[1]).toEqual(expect.objectContaining({ songId: "13", startMusicId: "13" }));
});

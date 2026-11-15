import "./host";
import { expect, test } from "bun:test";
import { myPlaylists, toAlbum, toTrack } from "../index";

const song = {
  id: 1901371647,
  name: "春日影",
  ar: [{ id: 51333713, name: "MyGO!!!!!" }],
  al: { id: 147779282, name: "迷跡波", picUrl: "http://p1.music.126.net/abc==/109951.jpg" },
  dt: 263000,
};

// A song as NetEase sends it becomes a Track, its cover sized by the app.
test("maps a song to a Track", () => {
  expect(toTrack(song)).toEqual({
    id: "1901371647",
    name: "春日影",
    artists: [{ id: "51333713", name: "MyGO!!!!!" }],
    album: {
      id: "147779282",
      name: "迷跡波",
      imageUrl: "https://p1.music.126.net/abc==/109951.jpg?param={size}y{size}",
    },
    duration: 263000,
  });
});

// Older endpoints name the same fields artists, album and duration.
test("maps a song in NetEase's older shape", () => {
  const old = { id: 1, name: "a", artists: [{ id: 2, name: "b" }], album: { id: 3, name: "c" }, duration: 4 };
  expect(toTrack(old)).toEqual({
    id: "1", name: "a", artists: [{ id: "2", name: "b" }], album: { id: "3", name: "c" }, duration: 4,
  });
});

// Delisted songs, and those the account can't play at any level, are Unavailable.
test("marks a song the listener can't play as unavailable", () => {
  expect(toTrack(song, { st: -200, pl: 128000 }).unavailable).toBe(true);
  expect(toTrack(song, { st: 0, pl: 0 }).unavailable).toBe(true);
  expect(toTrack({ ...song, privilege: { st: 0, pl: 0 } }).unavailable).toBe(true);
  expect(toTrack(song, { st: 0, pl: 320000 }).unavailable).toBeUndefined();
  // A privilege that doesn't say the song is listed isn't taken to.
  expect(toTrack(song, { pl: 320000 }).unavailable).toBe(true);
});

// An album's release time becomes the date it came out, in China's time zone.
test("maps an album with its release date", () => {
  const album = { id: 7, name: "迷跡波", picUrl: "http://p2.music.126.net/x.jpg", artist: { id: 8, name: "MyGO!!!!!" }, publishTime: 1703606400000 };
  expect(toAlbum(album)).toEqual({
    id: "7", name: "迷跡波", imageUrl: "https://p2.music.126.net/x.jpg?param={size}y{size}",
    artists: [{ id: "8", name: "MyGO!!!!!" }], released: "2023-12-27",
  });
});

// The listener's playlists are theirs or saved, Liked Songs first among them,
// kept by NetEase.
test("sorts the listener's playlists into theirs and saved, with Liked Songs fixed", () => {
  const list = [
    { id: 1, name: "我喜欢的音乐", specialType: 5, creator: { userId: 42 }, trackCount: 300 },
    { id: 2, name: "mine", specialType: 0, creator: { userId: 42, nickname: "me" }, trackCount: 3, coverImgUrl: "http://p1.music.126.net/c.jpg" },
    { id: 3, name: "theirs", specialType: 0, creator: { userId: 7, nickname: "them" }, trackCount: 9 },
  ];
  expect(myPlaylists(list, "42")).toEqual([
    { id: "1", name: "我喜欢的音乐", trackCount: 300, mine: true, fixed: true },
    { id: "2", name: "mine", owner: "me", trackCount: 3, imageUrl: "https://p1.music.126.net/c.jpg?param={size}y{size}", mine: true },
    { id: "3", name: "theirs", owner: "them", trackCount: 9, saved: true },
  ]);
});

// NetEase marks an artist or album it doesn't know with id 0: there's no page to open for it.
test("an unknown artist or album has no page", () => {
  expect(toTrack({ id: 1, ar: [{ id: 0, name: "未知" }], al: { id: 0, name: "未知专辑" } })).toMatchObject({
    artists: [{ id: "", name: "未知" }],
    album: { name: "未知专辑" },
  });
  expect(toTrack({ id: 1, al: { id: 0 } }).album).toEqual({});
});

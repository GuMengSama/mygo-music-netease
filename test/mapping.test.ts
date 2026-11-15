// How what NetEase sends shows in the app.
import { answer, reset } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { playlist, playlists, search } from "../index";

beforeEach(() => reset());

const song = {
  id: 1901371647,
  name: "春日影",
  ar: [{ id: 51333713, name: "MyGO!!!!!" }],
  al: { id: 147779282, name: "迷跡波", picUrl: "http://p1.music.126.net/abc==/109951.jpg" },
  dt: 263000,
};

// The Tracks a song search finds, NetEase answering with songs.
async function found(...songs: object[]) {
  answer("/api/cloudsearch/pc", { code: 200, result: { songs, songCount: songs.length } });
  return (await search({ query: "x", kind: "tracks", offset: 0 })).tracks as any[];
}

// The Albums an album search finds, NetEase answering with albums.
async function foundAlbums(...albums: object[]) {
  answer("/api/cloudsearch/pc", { code: 200, result: { albums, albumCount: albums.length } });
  return (await search({ query: "x", kind: "albums", offset: 0 })).albums;
}

// A song as NetEase sends it becomes a Track, its cover sized by the app.
test("shows a song as a Track", async () => {
  expect(await found(song)).toEqual([{
    id: "1901371647",
    name: "春日影",
    artists: [{ id: "51333713", name: "MyGO!!!!!" }],
    album: {
      id: "147779282",
      name: "迷跡波",
      imageUrl: "https://p1.music.126.net/abc==/109951.jpg?param={size}y{size}",
    },
    duration: 263000,
  }]);
});

// Older endpoints name the same fields artists, album and duration.
test("shows a song in NetEase's older shape", async () => {
  const old = { id: 1, name: "a", artists: [{ id: 2, name: "b" }], album: { id: 3, name: "c" }, duration: 4 };
  expect(await found(old)).toEqual([{
    id: "1", name: "a", artists: [{ id: "2", name: "b" }], album: { id: "3", name: "c" }, duration: 4,
  }]);
});

// Delisted songs, and those the account can't play at any level, are Unavailable,
// whether NetEase sends the privilege beside the song or inside it.
test("marks a song the listener can't play as unavailable", async () => {
  const privileges = [
    { id: 1, st: -200, pl: 128000 },
    { id: 2, st: 0, pl: 0 },
    { id: 4, st: 0, pl: 320000 },
    // A privilege that doesn't say the song is listed isn't taken to.
    { id: 5, pl: 320000 },
  ];
  const tracks = [1, 2, 3, 4, 5].map((id) => ({ ...song, id, privilege: id === 3 ? { st: 0, pl: 0 } : undefined }));
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 9, tracks, trackIds: tracks.map(({ id }) => ({ id })) }, privileges });
  const shown = (await playlist({ id: "9" })).tracks.map((t) => !!t.unavailable);
  expect(shown).toEqual([true, true, true, false, true]);
});

// An album's release time becomes the date it came out, in China's time zone.
test("shows an album with its release date", async () => {
  const album = { id: 7, name: "迷跡波", picUrl: "http://p2.music.126.net/x.jpg", artist: { id: 8, name: "MyGO!!!!!" }, publishTime: 1703606400000 };
  expect(await foundAlbums(album)).toEqual([{
    id: "7", name: "迷跡波", imageUrl: "https://p2.music.126.net/x.jpg?param={size}y{size}",
    artists: [{ id: "8", name: "MyGO!!!!!" }], released: "2023-12-27",
  }]);
});

// An album naming its artists as a list keeps them all.
test("an album keeps all its artists", async () => {
  expect(await foundAlbums({ id: 1, artists: [{ id: 2, name: "a" }, { id: 3, name: "b" }] })).toMatchObject([
    { artists: [{ id: "2" }, { id: "3" }] },
  ]);
});

// The listener's playlists are theirs or saved, Liked Songs among them kept by NetEase.
test("sorts the listener's playlists into theirs and saved, with Liked Songs fixed", async () => {
  const list = [
    { id: 1, name: "我喜欢的音乐", specialType: 5, creator: { userId: 42 }, trackCount: 300 },
    { id: 2, name: "mine", specialType: 0, creator: { userId: 42, nickname: "me" }, trackCount: 3, coverImgUrl: "http://p1.music.126.net/c.jpg" },
    { id: 3, name: "theirs", specialType: 0, creator: { userId: 7, nickname: "them" }, trackCount: 9 },
  ];
  answer("/api/user/playlist", { code: 200, playlist: list });
  expect(await playlists()).toEqual([
    { id: "1", name: "我喜欢的音乐", trackCount: 300, mine: true, fixed: true },
    { id: "2", name: "mine", owner: "me", trackCount: 3, imageUrl: "https://p1.music.126.net/c.jpg?param={size}y{size}", mine: true },
    { id: "3", name: "theirs", owner: "them", trackCount: 9, saved: true },
  ]);
});

// NetEase marks an artist or album it doesn't know with id 0: there's no page to open for it.
test("an unknown artist or album has no page", async () => {
  const [unknown, bare] = await found({ id: 1, ar: [{ id: 0, name: "未知" }], al: { id: 0, name: "未知专辑" } }, { id: 2, al: { id: 0 } });
  expect(unknown).toMatchObject({ artists: [{ id: "", name: "未知" }], album: { name: "未知专辑" } });
  expect(unknown.album.id).toBeUndefined();
  expect(bare.album).toEqual({});
});

// What NetEase leaves out, or sends as something else, counts as none: no
// name, no artists, no length.
test("a song missing its details", async () => {
  expect(await found({ id: 1, name: 3, ar: null })).toEqual([{ id: "1", name: "", artists: [], album: {}, duration: 0 }]);
});

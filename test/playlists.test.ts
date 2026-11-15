import { answer, reset, sent } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { createPlaylist, deletePlaylist, renamePlaylist } from "../index";

beforeEach(() => reset());

// A new playlist is the listener's, and public as in NetEase's own app.
test("creates a public playlist of the listener's", async () => {
  answer("/api/playlist/create", { code: 200, playlist: { id: 77, name: "Drive", trackCount: 0 } });
  expect(await createPlaylist({ name: "Drive" })).toEqual({ id: "77", name: "Drive", trackCount: 0, mine: true });
  expect(sent("/api/playlist/create")[0]).toMatchObject({ name: "Drive", privacy: "0", type: "NORMAL" });
});

// Renaming tells NetEase the playlist and its new name.
test("renames a playlist", async () => {
  answer("/api/playlist/update/name", { code: 200 });
  await renamePlaylist({ id: "77", name: "Night Drive" });
  expect(sent("/api/playlist/update/name")[0]).toMatchObject({ id: "77", name: "Night Drive" });
});

// Deleting tells NetEase which playlist goes.
test("deletes a playlist", async () => {
  answer("/api/playlist/remove", { code: 200 });
  await deletePlaylist({ id: "77" });
  expect(sent("/api/playlist/remove")[0]).toMatchObject({ ids: '["77"]' });
});

// Changing playlists needs the listener signed in.
test("editing asks to sign in first", async () => {
  reset(false);
  await expect(createPlaylist({ name: "x" })).rejects.toMatchObject({ code: "signIn" });
  await expect(renamePlaylist({ id: "1", name: "x" })).rejects.toMatchObject({ code: "signIn" });
  await expect(deletePlaylist({ id: "1" })).rejects.toMatchObject({ code: "signIn" });
});

import { addToPlaylist, removeFromPlaylist } from "../index";

// Adding songs puts them in the playlist at once.
test("adds songs to a playlist", async () => {
  answer("/api/playlist/manipulate/tracks", { code: 200 });
  await addToPlaylist({ id: "77", trackIds: ["1", "2"] });
  expect(sent("/api/playlist/manipulate/tracks")[0]).toMatchObject({ op: "add", pid: "77", trackIds: '["1","2"]', imme: "true" });
});

// A song the playlist already has is there: adding it again isn't an error.
test("adding a song already there succeeds", async () => {
  answer("/api/playlist/manipulate/tracks", { code: 502, message: "歌单内歌曲重复" });
  await addToPlaylist({ id: "77", trackIds: ["1"] });
});

// Removing songs takes them out.
test("removes songs from a playlist", async () => {
  answer("/api/playlist/manipulate/tracks", { code: 200 });
  await removeFromPlaylist({ id: "77", trackIds: ["1"] });
  expect(sent("/api/playlist/manipulate/tracks")[0]).toMatchObject({ op: "del", pid: "77", trackIds: '["1"]' });
});

// Removing a song that isn't there is still an error NetEase gives.
test("removing fails as NetEase says", async () => {
  answer("/api/playlist/manipulate/tracks", { code: 502, message: "x" });
  await expect(removeFromPlaylist({ id: "77", trackIds: ["1"] })).rejects.toThrow("x (502)");
});

import { movePlaylistTrack, moved, savePlaylist } from "../index";

// Moving takes a song out and puts it back in at its new place.
test("moves an item from one place to another", () => {
  expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  expect(moved(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  expect(moved(["a", "b"], 1, 0)).toEqual(["b", "a"]);
});

// Moving a song gives NetEase the playlist's whole new order.
test("moves a song within a playlist", async () => {
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 77, trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }] } });
  answer("/api/playlist/manipulate/tracks", { code: 200 });
  await movePlaylistTrack({ id: "77", from: 0, to: 1 });
  expect(sent("/api/playlist/manipulate/tracks")[0]).toMatchObject({ op: "update", pid: "77", trackIds: '["2","1","3"]' });
});

// Saving someone else's playlist, and letting it go.
test("saves and unsaves a playlist", async () => {
  answer("/api/playlist/subscribe", { code: 200 });
  answer("/api/playlist/unsubscribe", { code: 200 });
  await savePlaylist({ id: "5", on: true });
  await savePlaylist({ id: "6", on: false });
  expect(sent("/api/playlist/subscribe")).toEqual([expect.objectContaining({ id: "5" })]);
  expect(sent("/api/playlist/unsubscribe")).toEqual([expect.objectContaining({ id: "6" })]);
});

// Moving and saving need the listener signed in.
test("moving and saving ask to sign in first", async () => {
  reset(false);
  await expect(savePlaylist({ id: "5", on: true })).rejects.toMatchObject({ code: "signIn" });
  answer("/api/v6/playlist/detail", { code: 200, playlist: { id: 77, trackIds: [{ id: 1 }, { id: 2 }] } });
  await expect(movePlaylistTrack({ id: "77", from: 0, to: 1 })).rejects.toMatchObject({ code: "signIn" });
});

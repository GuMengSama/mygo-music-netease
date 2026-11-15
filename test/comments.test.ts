import { answer, reset, sent } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { comments, likeComment, postComment } from "../index";

beforeEach(() => reset());

const raw = (id: number, likes = 0) => ({
  commentId: id, content: `c${id}`, time: 1700000000000 + id, likedCount: likes, liked: false,
  user: { nickname: `u${id}`, avatarUrl: "http://p1.music.126.net/u.jpg" },
});

// A song's comments, page 0, NetEase answering with these.
async function firstPage(hotComments: object[], newest: object[]) {
  answer("/api/v1/resource/comments/R_SO_4_5", { code: 200, hotComments, comments: newest });
  return (await comments({ trackId: "5", offset: 0 })).comments;
}

// A comment as NetEase sends it shows in the app, its author's picture sized by the app.
test("shows a comment", async () => {
  expect(await firstPage([], [{ ...raw(1, 9), liked: true }])).toEqual([{
    id: "1", author: "u1", avatarUrl: "https://p1.music.126.net/u.jpg?param={size}y{size}",
    text: "c1", time: 1700000000001, likes: 9, liked: true,
  }]);
});

// Hot Comments come first, and one that's also among the newest shows once.
test("the first page is Hot Comments, then the newest", async () => {
  const page = await firstPage([raw(1, 99), raw(2, 50)], [raw(3), raw(1, 99)]);
  expect(page.map((c) => c.id)).toEqual(["1", "2", "3"]);
});

// The first page of a song's comments leads with its Hot Comments.
test("loads a song's first page with Hot Comments", async () => {
  answer("/api/v1/resource/comments/R_SO_4_5", { code: 200, hotComments: [raw(1, 99)], comments: [raw(2)], total: 120, more: true });
  expect(await comments({ trackId: "5", offset: 0 })).toMatchObject({ comments: [{ id: "1" }, { id: "2" }], total: 120, more: true });
  expect(sent("/api/v1/resource/comments/R_SO_4_5")[0]).toMatchObject({ rid: "5", offset: 0, limit: 20 });
});

// Later pages carry on through the newest, going back over a few the app has
// already, rather than skip any the Hot Comments took the place of.
test("later pages carry on through the newest", async () => {
  answer("/api/v1/resource/comments/R_SO_4_5", { code: 200, hotComments: [raw(1, 99)], comments: [raw(9)], total: 120, more: false });
  expect(await comments({ trackId: "5", offset: 35 })).toEqual({ comments: [expect.objectContaining({ id: "9" })], total: 120, more: false });
  expect(sent("/api/v1/resource/comments/R_SO_4_5")[0]).toMatchObject({ offset: 20 });
});

// Just past the first page, the newest start again from the top.
test("a page just past the first starts the newest from the top", async () => {
  answer("/api/v1/resource/comments/R_SO_4_5", { code: 200, comments: [] });
  await comments({ trackId: "5", offset: 10 });
  expect(sent("/api/v1/resource/comments/R_SO_4_5")[0]).toMatchObject({ offset: 0 });
});

// An Episode's comments are its programme's.
test("loads an Episode's comments", async () => {
  answer("/api/v1/resource/comments/A_DJ_1_7", { code: 200, comments: [raw(4)] });
  expect((await comments({ trackId: "program:7:8", offset: 0 })).comments).toHaveLength(1);
});

// Liking a comment tells NetEase which, in which thread; unliking takes it back.
test("likes and unlikes a comment", async () => {
  answer("/api/v1/comment/like", { code: 200 });
  answer("/api/v1/comment/unlike", { code: 200 });
  await likeComment({ trackId: "5", commentId: "1", on: true });
  await likeComment({ trackId: "program:7:8", commentId: "2", on: false });
  expect(sent("/api/v1/comment/like")[0]).toMatchObject({ threadId: "R_SO_4_5", commentId: "1" });
  expect(sent("/api/v1/comment/unlike")[0]).toMatchObject({ threadId: "A_DJ_1_7", commentId: "2" });
});

// A posted comment comes back as NetEase keeps it, under the listener's name.
test("posts a comment", async () => {
  answer("/api/resource/comments/add", { code: 200, comment: raw(11) });
  expect(await postComment({ trackId: "5", text: "好听" })).toMatchObject({ id: "11", author: "u11" });
  expect(sent("/api/resource/comments/add")[0]).toMatchObject({ threadId: "R_SO_4_5", content: "好听" });
});

// A comment NetEase doesn't give back wasn't kept: posting it failed.
test("a comment NetEase doesn't keep fails to post", async () => {
  answer("/api/resource/comments/add", { code: 200 });
  await expect(postComment({ trackId: "5", text: "x" })).rejects.toThrow();
});

// Liking and posting are the listener's: they need signing in.
test("liking and posting ask to sign in first", async () => {
  reset(false);
  await expect(likeComment({ trackId: "5", commentId: "1", on: true })).rejects.toMatchObject({ code: "signIn" });
  await expect(postComment({ trackId: "5", text: "x" })).rejects.toMatchObject({ code: "signIn" });
});

// A comment whose author is gone has no name or picture.
test("a comment without its author", async () => {
  expect(await firstPage([], [{ commentId: 1, content: "c" }])).toEqual([{ id: "1", text: "c", liked: false }]);
});

// Asked with no offset, comments start at the first page.
test("comments start at the first page", async () => {
  answer("/api/v1/resource/comments/R_SO_4_5", { code: 200, hotComments: [raw(1, 9)] });
  expect((await comments({ trackId: "5" } as any)).comments).toHaveLength(1);
});

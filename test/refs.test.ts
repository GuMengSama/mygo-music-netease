import "./host";
import { expect, test } from "bun:test";
import { commentsOf, episodeId, refOf } from "../index";

// A song's id is NetEase's; an episode's names its programme and the song it plays.
test("tells episodes from songs by id", () => {
  expect(refOf("1901371647")).toEqual({ kind: "song", id: "1901371647" });
  expect(refOf(episodeId("2063212345", "1999"))).toEqual({ kind: "episode", programId: "2063212345", songId: "1999" });
});

// An Episode NetEase has no song for says so, rather than name an empty song.
test("an Episode without a song names none", () => {
  expect(episodeId("7", null)).toBe("program:7");
  expect(refOf("program:7")).toEqual({ kind: "episode", programId: "7", songId: null });
  expect(refOf("program:7:")).toEqual({ kind: "episode", programId: "7", songId: null });
});

// Songs and episodes each keep their comments in a thread of their own kind.
test("finds a song's or an episode's comments", () => {
  expect(commentsOf(refOf("5"))).toEqual({ thread: "R_SO_4_5", rid: "5" });
  expect(commentsOf(refOf(episodeId("7", "8")))).toEqual({ thread: "A_DJ_1_7", rid: "7" });
});

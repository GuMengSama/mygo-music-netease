import { settings } from "./host";
import { answer, reset, sent } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { played } from "../index";

beforeEach(() => {
  reset();
  settings.clear();
  settings.set("reportPlays", "true");
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 7, name: "晴天", dt: 269000 }] });
  answer("/api/feedback/weblog", { code: 200, data: "success" });
});

// The songs NetEase was told were played, by id and seconds played.
const reported = () =>
  sent("/api/feedback/weblog").flatMap((d) => JSON.parse(d.logs).map((l: any) => [l.action, l.json.type, l.json.id, l.json.time]));

// A song played signed in counts in the listener's history, as a whole listen.
test("a song played is reported to NetEase as heard whole", async () => {
  await played({ id: "7" });
  expect(reported()).toEqual([["play", "song", "7", 269]]);
  // As NetEase's own clients report a song played to its end, from a list.
  expect(JSON.parse(sent("/api/feedback/weblog")[0].logs)[0].json).toMatchObject({ end: "playend", source: "list", download: 0, wifi: 0 });
});

// Play Reports wait for the listener to turn them on.
test("no song is reported until Play Reports are turned on", async () => {
  settings.delete("reportPlays");
  await played({ id: "7" });
  settings.set("reportPlays", "false");
  await played({ id: "7" });
  expect(sent("/api/feedback/weblog")).toEqual([]);
});

// Signed out, there's no listener's history to count a play in.
test("a song played signed out isn't reported", async () => {
  reset(false);
  answer("/api/v3/song/detail", { code: 200, songs: [{ id: 7, name: "晴天", dt: 269000 }] });
  await played({ id: "7" });
  expect(sent("/api/feedback/weblog")).toEqual([]);
});

// An Episode isn't a song: its plays aren't reported.
test("an Episode played isn't reported", async () => {
  await played({ id: "program:5:7" });
  expect(sent("/api/feedback/weblog")).toEqual([]);
});

// Each play counts, the same song's again too.
test("each play of a song is reported", async () => {
  await played({ id: "7" });
  await played({ id: "7" });
  expect(reported()).toHaveLength(2);
});

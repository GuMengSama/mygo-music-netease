import { answer, reset } from "./netease";
import { beforeEach, expect, test } from "bun:test";
import { stationNext, stations } from "../index";

beforeEach(() => reset());

// Signed in, the listener's first station is their Personal FM.
test("the listener's first station is Personal FM", async () => {
  expect((await stations())[0]).toEqual({ id: "fm", name: expect.any(String), description: expect.any(String) });
});

// Signed out, opening Personal FM asks the listener to sign in, rather than show nothing.
test("Personal FM's page asks to sign in when signed out", async () => {
  reset(false);
  await expect(stations()).rejects.toMatchObject({ code: "signIn" });
});

// Personal FM plays the next few songs NetEase picks.
test("Personal FM plays what NetEase picks next", async () => {
  answer("/api/v1/radio/get", { code: 200, data: [{ id: 1, name: "a", privilege: { st: 0, pl: 0 } }, { id: 2, name: "b" }] });
  const next = await stationNext({ id: "fm" });
  expect(next.map((t: any) => t.id)).toEqual(["1", "2"]);
  expect(next[0].unavailable).toBe(true);
});

// Personal FM is the listener's: it needs them signed in.
test("Personal FM asks to sign in first", async () => {
  reset(false);
  await expect(stationNext({ id: "fm" })).rejects.toMatchObject({ code: "signIn" });
});

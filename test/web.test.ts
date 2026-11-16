import { reset, serve, unserved, webSent } from "./netease";
import { beforeEach, expect, test } from "bun:test";

beforeEach(() => reset());

// A host a test serves answers what the test says, by its request, and keeps it.
test("serves a scripted host", async () => {
  serve("api.example.com", (r) => ({ path: r.url.pathname, q: r.url.searchParams.get("q") }));
  const res = await fetch("https://api.example.com/s?q=hi", { method: "POST", headers: { a: "b" }, body: "x=1" });
  expect(await res.json()).toEqual({ path: "/s", q: "hi" });
  expect(webSent("api.example.com")).toMatchObject([{ method: "POST", headers: { a: "b" }, body: "x=1" }]);
});

// A served answer may be a whole Response, for bytes, statuses and headers.
test("serves a whole response", async () => {
  serve("*.cdn.example.com", () => new Response(new Uint8Array(3), { status: 206 }));
  const res = await fetch("https://a1.cdn.example.com/x.mp3");
  expect([res.status, (await res.arrayBuffer()).byteLength]).toEqual([206, 3]);
});

// A host no test served is refused, and named.
test("refuses an unserved host", async () => {
  await expect(fetch("https://nowhere.example.com/")).rejects.toThrow("nowhere.example.com");
  expect(unserved.splice(0)).toEqual(["nowhere.example.com"]);
});

// What a test served is gone after reset.
test("reset forgets served hosts", async () => {
  serve("api.example.com", () => ({}));
  reset();
  await expect(fetch("https://api.example.com/")).rejects.toThrow("api.example.com");
  unserved.length = 0;
});

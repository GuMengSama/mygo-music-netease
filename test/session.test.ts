import { answer, quickly, reset, setCookie } from "./netease";
import { prompts, storage } from "./host";
import { beforeEach, expect, test } from "bun:test";
import { account, playlists, signIn } from "../index";

beforeEach(() => reset());

// NetEase saying the sign-in expired forgets it, and asks the listener to sign in.
test("an expired sign-in is forgotten", async () => {
  answer("/api/user/playlist", { code: 301 });
  await expect(playlists()).rejects.toMatchObject({ code: "signIn" });
  expect(account()).toBeNull();
});

// Cookies NetEase renews along the way are kept for the next request.
test("keeps cookies NetEase renews", async () => {
  answer("/api/user/playlist", { code: 200, playlist: [] });
  setCookie("/api/user/playlist", "MUSIC_U=u2");
  await playlists();
  expect(storage.get("session").cookie).toBe("MUSIC_U=u2");
});

// An error NetEase gives shows with its message and code.
test("shows NetEase's error", async () => {
  answer("/api/user/playlist", { code: 405, message: "操作频繁" });
  await expect(playlists()).rejects.toThrow("操作频繁 (405)");
});

// Without a sign-in, the listener's own things ask them to sign in first.
test("asks to sign in before reaching the listener's own things", async () => {
  reset(false);
  await expect(playlists()).rejects.toMatchObject({ code: "signIn" });
});

// Scanning the QR code signs the listener in, as the account NetEase names.
test("signs in by QR code", async () => {
  reset(false);
  answer("/api/login/qrcode/unikey", { code: 200, unikey: "k1" });
  let polls = 0;
  answer("/api/login/qrcode/client/login", () => ({ code: ++polls < 2 ? 802 : 803 }));
  setCookie("/api/login/qrcode/client/login", "MUSIC_U=fresh");
  answer("/api/w/nuser/account/get", { code: 200, profile: { userId: 7, nickname: "Tomori", avatarUrl: "http://p1.music.126.net/a.jpg" } });
  expect(await quickly(signIn)).toEqual({ id: "7", name: "Tomori", imageUrl: "https://p1.music.126.net/a.jpg?param={size}y{size}" });
  expect(prompts[0].qr).toBe("https://music.163.com/login?codekey=k1");
  expect(account()?.id).toBe("7");
  expect(storage.get("session").cookie).toContain("MUSIC_U=fresh");
});

// A QR code left too long expires, and the listener has to start over.
test("an expired QR code fails the sign-in", async () => {
  reset(false);
  answer("/api/login/qrcode/unikey", { code: 200, unikey: "k1" });
  answer("/api/login/qrcode/client/login", { code: 800 });
  await expect(quickly(signIn)).rejects.toMatchObject({ code: "signIn" });
  expect(account()).toBeNull();
});

// A fake NetEase behind fetch: it decrypts each eapi request, keeps it, and
// answers what the test set for its path.
import "./host";
import { createDecipheriv } from "node:crypto";
import { prompts, storage } from "./host";
import { signOut } from "../index";

type Answer = any | ((data: any) => any);
export type Request = { path: string; data: any; headers: Record<string, string> };

const answers = new Map<string, Answer>();
const cookies = new Map<string, string>();
export const requests: Request[] = [];

// What NetEase answers to path: an object, or a function of the request's data,
// which may answer later.
export function answer(path: string, a: Answer) {
  answers.set(path, a);
}

// The Set-Cookie NetEase sends with its answers to path.
export function setCookie(path: string, cookie: string) {
  cookies.set(path, cookie);
}

// The requests made to path, by their data.
export const sent = (path: string) => requests.filter((r) => r.path === path).map((r) => r.data);

// A NetEase with nothing set, and a listener signed in as user 42, or not.
export function reset(signedIn = true) {
  answers.clear();
  cookies.clear();
  requests.length = 0;
  signOut();
  storage.clear();
  prompts.length = 0;
  if (signedIn) storage.set("session", { cookie: "MUSIC_U=u1", account: { id: "42", name: "me" } });
}

// Runs f without waiting the two seconds between polls of the QR code.
export async function quickly<T>(f: () => Promise<T>): Promise<T> {
  const realTimeout = globalThis.setTimeout;
  (globalThis as any).setTimeout = (g: () => void, ms: number) => realTimeout(g, ms === 2000 ? 0 : ms);
  try {
    return await f();
  } finally {
    globalThis.setTimeout = realTimeout;
  }
}

function decrypt(params: string) {
  const d = createDecipheriv("aes-128-ecb", Buffer.from("e82ckenh8dichen8"), null);
  const text = Buffer.concat([d.update(Buffer.from(params, "hex")), d.final()]).toString("utf8");
  const [path, json] = text.split("-36cd479b6b5-");
  return { path, data: JSON.parse(json) };
}

(globalThis as any).fetch = async (url: string, init: RequestInit) => {
  const { path, data } = decrypt(String(init.body).slice("params=".length));
  if (new URL(url).pathname !== `/eapi/${path.slice("/api/".length)}`) throw new Error(`eapi path mismatch: ${url}`);
  if (data.e_r !== false) throw new Error("eapi answers encrypted unless e_r is false");
  requests.push({ path, data, headers: init.headers as Record<string, string> });
  const a = answers.get(path);
  const body = await (typeof a === "function" ? a(data) : a ?? { code: 404, message: `no answer for ${path}` });
  const headers = new Headers({ "content-type": "application/json" });
  if (cookies.has(path)) headers.append("set-cookie", `${cookies.get(path)}; Path=/; HttpOnly`);
  return new Response(JSON.stringify(body), { headers });
};

// A stand-in for the app's host global, with the real algorithms behind
// host.crypto, so the plugin runs under bun.
import { createCipheriv, createHash } from "node:crypto";

export const storage = new Map<string, any>();
export const settings = new Map<string, string>();
export const prompts: any[] = [];

(globalThis as any).host = {
  crypto: {
    md5: (text: string) => createHash("md5").update(text).digest("hex"),
    aesEcbEncrypt: (key: string, text: string) => {
      const c = createCipheriv("aes-128-ecb", Buffer.from(key), null);
      return Buffer.concat([c.update(text, "utf8"), c.final()]).toString("hex");
    },
  },
  storage: {
    get: (k: string) => storage.get(k),
    set: (k: string, v: any) => void storage.set(k, structuredClone(v)),
    remove: (k: string) => void storage.delete(k),
  },
  setting: (k: string) => settings.get(k) ?? "",
  signInPrompt: (p: any) => void prompts.push(p),
  t: (text: string) => text,
};

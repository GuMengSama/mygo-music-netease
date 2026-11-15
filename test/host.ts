// A stand-in for the app's host global, with the real algorithms behind
// host.crypto, so the plugin's pure parts run under bun.
import { createCipheriv, createHash } from "node:crypto";

(globalThis as any).host = {
  crypto: {
    md5: (text: string) => createHash("md5").update(text).digest("hex"),
    aesEcbEncrypt: (key: string, text: string) => {
      const c = createCipheriv("aes-128-ecb", Buffer.from(key), null);
      return Buffer.concat([c.update(text, "utf8"), c.final()]).toString("hex");
    },
  },
  t: (text: string) => text,
};

import "./host";
import { expect, test } from "bun:test";
import { eapiParams } from "../index";

// The params NetEase's eapi expects, against a vector made with openssl.
test("encodes a request as eapi params", () => {
  expect(eapiParams("/api/song/lyric/v1", '{"id":"1"}')).toBe(
    "04AE33D34A93FE3EC22DA8FA305D290AB337D0FE5F36D211DE0D338CC6AA89D0E8744000D04B3D7A3D495AEE86A48DC4BA9A6E5CBA7E957EED8B6484EC4A40A958A1A8DBDEAC922FD61D5CFFB632AD85F1A74DF512BBC164ECEFA314B2112E14",
  );
});

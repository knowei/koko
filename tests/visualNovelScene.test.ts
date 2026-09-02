import assert from "node:assert/strict";
import test from "node:test";
import { extractVisualNovelScene } from "../src/lib/visualNovelScene.ts";

test("extracts and normalizes the current visual novel scene", () => {
  assert.equal(
    extractVisualNovelScene("<scene>地点：客厅｜时间：雨夜\n｜环境：窗外有雨</scene><dialogue>回来啦。</dialogue>"),
    "地点：客厅｜时间：雨夜 ｜环境：窗外有雨",
  );
});

test("keeps the previous scene unchanged when no scene tag exists", () => {
  assert.equal(extractVisualNovelScene("<dialogue>嗯，我听着呢。</dialogue>"), null);
});

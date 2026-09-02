import assert from "node:assert/strict";
import test from "node:test";
import { extractCleanSpokenText, extractTagsAndClean, parseMessageSegments } from "../src/lib/messageParser.ts";
import { cleanTextForSpeech } from "../src/lib/tts.ts";

test("stored assistant text excludes reasoning while preserving metadata", () => {
  const result = extractTagsAndClean("<think>private</think><expression:smile>（挥手）你好呀");
  assert.equal(result.cleanedText, "（挥手）你好呀");
  assert.equal(result.expression, "smile");
});

test("display segments never expose reasoning", () => {
  const segments = parseMessageSegments("<analysis>private</analysis>（走近）晚上好");
  assert.deepEqual(segments, [
    { type: "action", content: "走近" },
    { type: "dialogue", content: "晚上好" },
  ]);
});

test("TTS never reads reasoning or stage directions", () => {
  assert.equal(cleanTextForSpeech("<think>private</think>（轻轻挥手）欢迎回来"), "欢迎回来");
});

test("visual novel tags become dedicated display segments", () => {
  const segments = parseMessageSegments("<scene>地点：客厅｜时间：雨夜</scene><action>把热茶放下</action><thought>希望哥哥能放松一点。</thought><dialogue>先休息一下吧。</dialogue>");
  assert.deepEqual(segments, [
    { type: "scene", content: "地点：客厅｜时间：雨夜" },
    { type: "action", content: "把热茶放下" },
    { type: "thought", content: "希望哥哥能放松一点。" },
    { type: "dialogue", content: "先休息一下吧。" },
  ]);
});

test("visual novel TTS reads dialogue only", () => {
  assert.equal(
    extractCleanSpokenText("<scene>雨夜</scene><thought>有点担心。</thought><dialogue>我在这里呀。</dialogue>"),
    "我在这里呀。",
  );
});

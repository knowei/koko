import assert from "node:assert/strict";
import test from "node:test";
import { extractTagsAndClean, parseMessageSegments } from "../src/lib/messageParser.ts";
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

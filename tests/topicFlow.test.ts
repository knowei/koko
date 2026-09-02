import test from "node:test";
import assert from "node:assert/strict";
import { detectTopicFlow } from "../src/lib/topicFlow.js";

test("explicit user guidance switches the topic", () => {
  assert.equal(detectTopicFlow("不聊工作了，我们聊聊周末去哪吧", "今天工作好累"), "switch");
  assert.equal(detectTopicFlow("嗯嗯，我们聊电影吧", "要不要早点休息"), "switch");
});

test("short acknowledgements continue the previous topic", () => {
  assert.equal(detectTopicFlow("嗯嗯", "周末去公园怎么样"), "continue");
  assert.equal(detectTopicFlow("为什么？", "我觉得这部电影很好看"), "continue");
});

test("normal messages define a new turn focus and hidden turns are proactive", () => {
  assert.equal(detectTopicFlow("我今天在公司遇到一件事", ""), "new");
  assert.equal(detectTopicFlow("", "", true), "proactive");
});

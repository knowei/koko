import assert from "node:assert/strict";
import test from "node:test";
import { StreamingReasoningFilter, stripReasoningContent } from "../src/lib/reasoningFilter.ts";

test("removes complete and unfinished reasoning blocks", () => {
  assert.equal(stripReasoningContent("<think>secret</think>最终回答"), "最终回答");
  assert.equal(stripReasoningContent("开头<analysis>secret"), "开头");
  assert.equal(stripReasoningContent("A<reasoning>x</reasoning>B<reflection>y</reflection>C"), "ABC");
});

test("filters reasoning tags split across stream chunks", () => {
  const filter = new StreamingReasoningFilter();
  const chunks = ["你好<th", "ink>不应出现", "</thi", "nk>最终", "回答"];
  const result = chunks.map((chunk) => filter.push(chunk)).join("") + filter.flush();
  assert.equal(result, "你好最终回答");
});

test("keeps normal angle bracket text", () => {
  const filter = new StreamingReasoningFilter();
  assert.equal(filter.push("2 < 3，正常文本"), "2 < 3，正常文本");
  assert.equal(filter.flush(), "");
});

test("does not flush unfinished hidden reasoning", () => {
  const filter = new StreamingReasoningFilter();
  assert.equal(filter.push("<analysis>private chain"), "");
  assert.equal(filter.flush(), "");
});

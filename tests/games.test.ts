import assert from "node:assert/strict";
import test from "node:test";
import { getQuizOptionReveal, type QuizQuestion } from "../src/game/mindMatch.ts";
import { canFlipMemoryCard, createMemoryCards } from "../src/game/memoryMatch.ts";

const question: QuizQuestion = {
  id: "test",
  question: "test",
  optionA: "A",
  optionB: "B",
  companionChoice: "A",
  reactionA: "A",
  reactionB: "B",
};

test("mind match distinguishes shared and different choices", () => {
  assert.deepEqual(getQuizOptionReveal(question, "A", "A"), { state: "shared", label: "💖 你们都选了这个" });
  assert.deepEqual(getQuizOptionReveal(question, "B", "A"), { state: "companion", label: "🌸 妹妹选了这个" });
  assert.deepEqual(getQuizOptionReveal(question, "B", "B"), { state: "player", label: "👤 你选了这个" });
});

test("memory match blocks a third card while a pair resolves", () => {
  const cards = createMemoryCards();
  assert.equal(canFlipMemoryCard(cards, [], 0, "player", false), true);
  assert.equal(canFlipMemoryCard(cards, [0, 1], 2, "player", false), false);
  assert.equal(canFlipMemoryCard(cards, [0], 2, "player", true), false);
  assert.equal(canFlipMemoryCard(cards, [], 0, "companion", false), false);
});

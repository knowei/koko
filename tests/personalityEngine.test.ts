import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePersonalityEvolution,
  clampTrait,
} from "../src/lib/personalityEngine.js";
import {
  buildSystemPrompt,
  DEFAULT_PERSONALITY,
  DEFAULT_PROFILE,
  getPersonalityArchetype,
  personalityLabel,
  type PersonalityTraits,
} from "../src/data/persona.js";
import { extractTagsAndClean } from "../src/lib/messageParser.js";

test("user-led prompt follows an explicit topic change without background interruptions", () => {
  const prompt = buildSystemPrompt(
    30,
    60,
    "昨天聊过工作压力。",
    DEFAULT_PERSONALITY,
    "daily",
    12,
    DEFAULT_PROFILE,
    null,
    false,
    [],
    "",
    "user_led",
  );

  assert.match(prompt, /本轮由用户主导/);
  assert.match(prompt, /用户明确引导到新话题时立即跟随/);
  assert.match(prompt, /不要突然询问午饭/);
});

test("proactive prompt stays within its triggering event", () => {
  const prompt = buildSystemPrompt(
    30,
    60,
    "",
    DEFAULT_PERSONALITY,
    "daily",
    20,
    DEFAULT_PROFILE,
    null,
    false,
    [],
    "",
    "proactive",
  );

  assert.match(prompt, /本轮是系统允许的主动消息/);
  assert.match(prompt, /不要同时引入第二个话题/);
});

test("clampTrait constrains values to 0-100", () => {
  assert.equal(clampTrait(-10), 0);
  assert.equal(clampTrait(120), 100);
  assert.equal(clampTrait(45.6), 46);
});

test("Gentle care dialogue increases gentle and heals insecure", () => {
  const current: PersonalityTraits = { gentle: 35, clingy: 25, tsundere: 20, possessive: 5, insecure: 20 };
  const res = analyzePersonalityEvolution(current, "今天工作辛苦啦，快早点休息，有我在不用怕，抱抱你~", "嗯嗯！", undefined, 20, 60);

  assert.ok((res.deltas.gentle || 0) > 0, "gentle should increase");
  assert.ok((res.deltas.insecure || 0) < 0, "insecure should decrease");
  assert.ok(res.newTraits.gentle > current.gentle, "new gentle should be greater");
  assert.ok(res.newTraits.insecure < current.insecure, "new insecure should be less");
  assert.ok(res.feedbackToast?.includes("温柔"), "feedback toast should mention gentle");
});

test("Jealousy triggers increase possessive and insecure (Yandere trigger)", () => {
  const current: PersonalityTraits = { gentle: 35, clingy: 25, tsundere: 20, possessive: 10, insecure: 10 };
  const res = analyzePersonalityEvolution(current, "今天和同桌妹子一起去逛街了", "……", undefined, 50, 60);

  assert.ok((res.deltas.possessive || 0) >= 2, "possessive should increase significantly");
  assert.ok((res.deltas.insecure || 0) >= 2, "insecure should increase due to jealousy");
  assert.ok(res.moodDelta < 0, "mood should drop due to jealousy");
  assert.ok(res.feedbackToast?.includes("独占") || res.feedbackToast?.includes("情敌"), "toast should mention possessive / jealousy");
});

test("Harsh scolding increases insecure and drops mood significantly", () => {
  const current: PersonalityTraits = { gentle: 35, clingy: 25, tsundere: 20, possessive: 10, insecure: 10 };
  const res = analyzePersonalityEvolution(current, "你好烦啊，闭嘴别烦我，真讨厌", "……", undefined, 50, 60);

  assert.ok((res.deltas.insecure || 0) >= 3, "insecure should spike");
  assert.ok(res.moodDelta <= -10, "mood should drop drastically");
  assert.ok(res.feedbackToast?.includes("敏感") || res.feedbackToast?.includes("自卑"), "toast should mention insecurity");
});

test("Apologies and reassurance heal insecure and recover mood", () => {
  const current: PersonalityTraits = { gentle: 30, clingy: 25, tsundere: 20, possessive: 15, insecure: 40 };
  const res = analyzePersonalityEvolution(current, "对不起可可，是我不好，我只喜欢你一个人，原谅我好不好", "……", undefined, 50, 40);

  assert.ok((res.deltas.insecure || 0) <= -2, "insecure should decrease");
  assert.ok(res.moodDelta >= 5, "mood should recover");
  assert.ok(res.feedbackToast?.includes("抚平"), "toast should mention reassurance/healing");
});

test("Archetype evaluation maps correctly across 5-dimensional traits", () => {
  // Deep Yandere
  const yandereTraits: PersonalityTraits = { gentle: 20, clingy: 40, tsundere: 10, possessive: 75, insecure: 50 };
  assert.equal(getPersonalityArchetype(yandereTraits, 80, 50).id, "deep_yandere");

  // Sweet Yandere
  const sweetYandere: PersonalityTraits = { gentle: 30, clingy: 40, tsundere: 10, possessive: 50, insecure: 15 };
  assert.equal(getPersonalityArchetype(sweetYandere, 60, 60).id, "sweet_yandere");

  // Pure Angel
  const angelTraits: PersonalityTraits = { gentle: 70, clingy: 25, tsundere: 10, possessive: 5, insecure: 10 };
  assert.equal(getPersonalityArchetype(angelTraits, 60, 80).id, "pure_angel");

  // Fragile Insecure
  const insecureTraits: PersonalityTraits = { gentle: 20, clingy: 30, tsundere: 10, possessive: 10, insecure: 65 };
  assert.equal(getPersonalityArchetype(insecureTraits, 20, 30).id, "fragile_insecure");

  // Classic Tsundere
  const tsundereTraits: PersonalityTraits = { gentle: 20, clingy: 20, tsundere: 65, possessive: 10, insecure: 10 };
  assert.equal(getPersonalityArchetype(tsundereTraits, 30, 60).id, "classic_tsundere");
});

test("extractTagsAndClean parses <personality:...> explicit tags", () => {
  const raw = "（脸颊发烫）你今天怎么突然这么好…… <personality:gentle:+2><personality:possessive:+1><expression:blush><mood:+5>";
  const parsed = extractTagsAndClean(raw);

  assert.equal(parsed.expression, "blush");
  assert.equal(parsed.moodDelta, 5);
  assert.equal(parsed.personalityDeltas?.gentle, 2);
  assert.equal(parsed.personalityDeltas?.possessive, 1);
  assert.ok(!parsed.cleanedText.includes("<personality"), "personality tags should be stripped from clean text");
  assert.ok(!parsed.cleanedText.includes("<expression"), "expression tags should be stripped from clean text");
});

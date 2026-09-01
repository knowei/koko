import test from "node:test";
import assert from "node:assert/strict";
import type { LoreEntry } from "../src/data/lorebook.js";
import { scanLorebook } from "../src/lib/lorebookScanner.js";
import { exportToSillyTavernJSON, importFromSillyTavernJSON } from "../src/lib/lorebookIO.js";

const mockLorebook: LoreEntry[] = [
  {
    id: "lore-1",
    title: "摩天轮告白之夜",
    category: "memory",
    keys: ["摩天轮", "告白", "烟火"],
    content: "摩天轮升到最高点时向可可告白，两人确认为恋人关系。",
    enabled: true,
    priority: 90,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: "lore-2",
    title: "吃醋与次级条件",
    category: "secret",
    keys: ["可可", "妹妹"],
    secondaryKeys: ["吃醋", "生气"],
    content: "可可吃醋时会气鼓鼓地鼓起腮帮子并轻轻掐你的胳膊。",
    enabled: true,
    priority: 80,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: "lore-3",
    title: "常驻互动法则",
    category: "rule",
    keys: ["*"],
    content: "始终保持温柔深情的二次元轻小说风格回复。",
    enabled: true,
    constant: true,
    priority: 100,
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: "lore-4",
    title: "已禁用的词条",
    category: "item",
    keys: ["项链"],
    content: "这条项链被禁用了，不应该被激活。",
    enabled: false,
    priority: 50,
    createdAt: 1000,
    updatedAt: 1000,
  },
];

test("scanLorebook matches primary keys and includes constant entries", () => {
  const result = scanLorebook(mockLorebook, "周末我们去坐摩天轮吧！");
  const titles = result.activeEntries.map((e) => e.title);
  
  assert.ok(titles.includes("常驻互动法则"), "常驻词条应该始终激活");
  assert.ok(titles.includes("摩天轮告白之夜"), "命中'摩天轮'主关键词应被激活");
  assert.ok(!titles.includes("吃醋与次级条件"), "未满足次级关键词不应激活");
  assert.ok(!titles.includes("已禁用的词条"), "禁用词条不应激活");
  assert.ok(result.formattedPromptBlock.includes("摩天轮告白之夜"));
});

test("scanLorebook triggers secondary keys only when both primary and secondary match", () => {
  // 只提到主关键词“可可”，没有次级关键词“吃醋/生气”
  const res1 = scanLorebook(mockLorebook, "可可今天真可爱呀");
  assert.ok(!res1.activeEntries.some((e) => e.title === "吃醋与次级条件"));

  // 同时提到“可可”和“吃醋”
  const res2 = scanLorebook(mockLorebook, "可可你怎么又吃醋啦？");
  assert.ok(res2.activeEntries.some((e) => e.title === "吃醋与次级条件"));
});

test("scanLorebook enforces the token and entry budgets", () => {
  const oversized = Array.from({ length: 10 }, (_, index): LoreEntry => ({
    id: `large-${index}`,
    title: `常驻设定${index}`,
    category: "rule",
    keys: ["*"],
    content: "很长的世界书内容".repeat(100),
    enabled: true,
    constant: true,
    priority: 100 - index,
    createdAt: 1000,
    updatedAt: 1000,
  }));
  const result = scanLorebook(oversized, "", { maxEntries: 3, maxTokens: 120 });
  assert.ok(result.activeEntries.length <= 3);
  assert.ok(result.formattedPromptBlock.length < 500);
});

test("exportToSillyTavernJSON exports valid JSON compatible with SillyTavern", () => {
  const jsonStr = exportToSillyTavernJSON(mockLorebook, "测试世界书");
  const parsed = JSON.parse(jsonStr);
  
  assert.equal(parsed.name, "测试世界书");
  assert.ok(parsed.entries);
  assert.equal(parsed.entries["0"].comment, "摩天轮告白之夜");
  assert.deepEqual(parsed.entries["0"].key, ["摩天轮", "告白", "烟火"]);
});

test("importFromSillyTavernJSON parses SillyTavern JSON into LoreEntry array", () => {
  const jsonStr = exportToSillyTavernJSON(mockLorebook);
  const imported = importFromSillyTavernJSON(jsonStr);
  
  assert.equal(imported.length, mockLorebook.length);
  const ferris = imported.find((e) => e.title === "摩天轮告白之夜");
  assert.ok(ferris);
  assert.deepEqual(ferris?.keys, ["摩天轮", "告白", "烟火"]);
  assert.equal(ferris?.content, "摩天轮升到最高点时向可可告白，两人确认为恋人关系。");
  assert.equal(ferris?.enabled, true);
});

test("importFromSillyTavernJSON sanitizes unsupported categories and oversized fields", () => {
  const imported = importFromSillyTavernJSON(JSON.stringify({
    entries: [{
      comment: "标题".repeat(100),
      content: "内容".repeat(2000),
      key: Array.from({ length: 40 }, (_, index) => `关键词${index}`),
      order: 999,
      extensions: { category: "unsupported" },
    }],
  }));
  assert.equal(imported[0].category, "memory");
  assert.equal(imported[0].priority, 100);
  assert.equal(imported[0].keys.length, 30);
  assert.ok(imported[0].title.length <= 100);
  assert.ok(imported[0].content.length <= 2000);
});

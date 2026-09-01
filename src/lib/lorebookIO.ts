import type { LoreCategory, LoreEntry } from "@/data/lorebook";

const VALID_CATEGORIES = new Set<LoreCategory>(["memory", "item", "location", "secret", "rule", "custom"]);
const MAX_IMPORT_ENTRIES = 200;

function generateUid(): string {
  return "lore_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
}

/**
 * 将可可世界书导出为 SillyTavern 标准 World Info / Lorebook JSON
 */
export function exportToSillyTavernJSON(
  entries: LoreEntry[],
  title = "可可专属世界书与深度记忆"
): string {
  const stEntries: Record<string, any> = {};

  entries.forEach((entry, idx) => {
    stEntries[String(idx)] = {
      uid: idx,
      key: entry.keys,
      keysecondary: entry.secondaryKeys || [],
      comment: entry.title,
      content: entry.content,
      constant: Boolean(entry.constant),
      selective: (entry.secondaryKeys || []).length > 0,
      order: entry.priority ?? 10,
      position: 0,
      disable: !entry.enabled,
      addMemo: true,
      create_date: entry.createdAt || Date.now(),
      update_date: entry.updatedAt || Date.now(),
      extensions: {
        category: entry.category,
      },
    };
  });

  const exportObj = {
    name: title,
    description: "由可可 AI 伴侣导出的专属世界书与记忆设定库",
    scan_depth: 3,
    token_budget: 1200,
    recursive_scanning: true,
    entries: stEntries,
  };

  return JSON.stringify(exportObj, null, 2);
}

/**
 * 解析并导入 SillyTavern / Chub.ai 标准世界书或角色卡中的 character_book
 */
export function importFromSillyTavernJSON(jsonString: string): LoreEntry[] {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error("无效的 JSON 格式，请检查文件内容。");
  }

  // 1. 如果是角色卡包装的 character_book
  if (parsed.character_book?.entries) {
    parsed = parsed.character_book;
  } else if (parsed.data?.character_book?.entries) {
    parsed = parsed.data.character_book;
  }

  const rawEntries = parsed.entries || parsed.items || parsed;
  const result: LoreEntry[] = [];

  const entryList: any[] = Array.isArray(rawEntries)
    ? rawEntries
    : typeof rawEntries === "object" && rawEntries !== null
    ? Object.values(rawEntries)
    : [];

  if (entryList.length === 0) {
    throw new Error("未能从文件中解析到有效的世界书词条 (entries)。");
  }

  for (const item of entryList.slice(0, MAX_IMPORT_ENTRIES)) {
    if (!item || typeof item !== "object") continue;

    // 提取标题/注释
    const title = String(item.comment || item.title || item.name || "未命名词条").trim().slice(0, 100);
    const content = String(item.content || item.text || item.description || "").trim().slice(0, 2000);
    if (!content) continue;

    // 提取主触发词
    let keys: string[] = [];
    if (Array.isArray(item.key)) {
      keys = item.key.map((k: any) => String(k).trim().slice(0, 80)).filter(Boolean);
    } else if (Array.isArray(item.keys)) {
      keys = item.keys.map((k: any) => String(k).trim().slice(0, 80)).filter(Boolean);
    } else if (typeof item.key === "string") {
      keys = item.key.split(/[,，]/).map((k: string) => k.trim().slice(0, 80)).filter(Boolean);
    } else if (typeof item.keys === "string") {
      keys = item.keys.split(/[,，]/).map((k: string) => k.trim().slice(0, 80)).filter(Boolean);
    }

    // 提取次级触发词
    let secondaryKeys: string[] = [];
    if (Array.isArray(item.keysecondary)) {
      secondaryKeys = item.keysecondary.map((k: any) => String(k).trim().slice(0, 80)).filter(Boolean);
    } else if (Array.isArray(item.secondaryKeys)) {
      secondaryKeys = item.secondaryKeys.map((k: any) => String(k).trim().slice(0, 80)).filter(Boolean);
    }

    const constant = Boolean(item.constant || item.alwaysActive);
    const enabled = item.disable !== undefined ? !item.disable : item.enabled !== undefined ? Boolean(item.enabled) : true;
    const priority = Math.max(1, Math.min(100, Number(item.order ?? item.priority) || 10));
    const requestedCategory = String(item.extensions?.category || "") as LoreCategory;
    const category: LoreCategory = VALID_CATEGORIES.has(requestedCategory) ? requestedCategory : constant ? "rule" : "memory";

    result.push({
      id: generateUid(),
      title,
      category,
      keys: keys.length > 0 ? keys.slice(0, 30) : [title],
      secondaryKeys: secondaryKeys.length > 0 ? secondaryKeys.slice(0, 30) : undefined,
      content,
      enabled,
      constant,
      priority,
      createdAt: Number(item.create_date) || Date.now(),
      updatedAt: Number(item.update_date) || Date.now(),
    });
  }

  return result;
}

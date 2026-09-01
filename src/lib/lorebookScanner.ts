import type { LoreEntry } from "@/data/lorebook";

export interface ScanLorebookOptions {
  maxTokens?: number; // 最大注入 Token 限制估算（默认约 1200 字符）
  maxEntries?: number; // 最大注入词条数量（默认 6 条）
}

export interface ScanLorebookResult {
  activeEntries: LoreEntry[];
  formattedPromptBlock: string;
}

/**
 * 扫描当前输入与最近历史上下文，智能匹配激活的世界书词条
 */
export function scanLorebook(
  lorebook: LoreEntry[],
  textContext: string,
  options: ScanLorebookOptions = {}
): ScanLorebookResult {
  const maxEntries = Math.max(1, Math.min(20, options.maxEntries ?? 6));
  const maxTokens = Math.max(100, Math.min(3000, options.maxTokens ?? 1200));
  if (!Array.isArray(lorebook) || lorebook.length === 0) {
    return { activeEntries: [], formattedPromptBlock: "" };
  }

  const normalizedText = (textContext || "").toLowerCase();
  const matchedEntries: LoreEntry[] = [];

  for (const entry of lorebook) {
    if (!entry || !entry.enabled || !entry.content) continue;

    // 1. 常驻词条直接激活
    if (entry.constant) {
      matchedEntries.push(entry);
      continue;
    }

    // 2. 检查主关键词（任一命中即可）
    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    if (keys.length === 0) continue;

    const primaryMatched = keys.some((k) => {
      const trimmed = k.trim().toLowerCase();
      if (!trimmed) return false;
      return normalizedText.includes(trimmed);
    });

    if (!primaryMatched) continue;

    // 3. 检查次级关键词（若有次级词，则次级词也必须命中）
    const secondaryKeys = Array.isArray(entry.secondaryKeys) ? entry.secondaryKeys : [];
    if (secondaryKeys.length > 0) {
      const secondaryMatched = secondaryKeys.some((sk) => {
        const trimmed = sk.trim().toLowerCase();
        return trimmed && normalizedText.includes(trimmed);
      });
      if (!secondaryMatched) continue;
    }

    matchedEntries.push(entry);
  }

  // 4. 按 priority 降序排序，去重，并限制最大数量
  const candidates = matchedEntries
    .sort((a, b) => (b.priority ?? 10) - (a.priority ?? 10))
    .slice(0, maxEntries);

  if (candidates.length === 0) {
    return { activeEntries: [], formattedPromptBlock: "" };
  }

  // 5. 按近似 Token 预算装入词条。中文字符按 1 token、ASCII 按约 1/4 token 估算。
  const estimateTokens = (value: string) => {
    const nonAscii = (value.match(/[^\x00-\x7F]/g) || []).length;
    return nonAscii + Math.ceil((value.length - nonAscii) / 4);
  };
  const activeEntries: LoreEntry[] = [];
  const lines: string[] = [];
  let usedTokens = 0;
  for (const entry of candidates) {
    const prefix = `- 《${entry.title.slice(0, 100)}》：`;
    const remainingTokens = maxTokens - usedTokens - estimateTokens(prefix);
    if (remainingTokens < 20) break;
    let content = entry.content.trim().slice(0, 2000);
    while (estimateTokens(content) > remainingTokens && content.length > 20) {
      content = content.slice(0, Math.max(20, Math.floor(content.length * 0.8)));
    }
    const line = `${prefix}${content}`;
    const lineTokens = estimateTokens(line);
    if (usedTokens + lineTokens > maxTokens) continue;
    activeEntries.push(entry);
    lines.push(line);
    usedTokens += lineTokens;
  }

  return {
    activeEntries,
    formattedPromptBlock: lines.join("\n"),
  };
}

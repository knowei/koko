export type ExpressionType =
  | "normal"
  | "smile"
  | "blush"
  | "shy"
  | "pout"
  | "surprised"
  | "sleepy";

export interface ExpressionInfo {
  type: ExpressionType;
  emoji: string;
  label: string;
}

export const EXPRESSION_MAP: Record<ExpressionType, ExpressionInfo> = {
  normal: { type: "normal", emoji: "🌸", label: "平常" },
  smile: { type: "smile", emoji: "✨", label: "开心" },
  blush: { type: "blush", emoji: "💖", label: "脸红" },
  shy: { type: "shy", emoji: "😳", label: "害羞" },
  pout: { type: "pout", emoji: "💢", label: "傲娇" },
  surprised: { type: "surprised", emoji: "❗", label: "惊讶" },
  sleepy: { type: "sleepy", emoji: "💤", label: "困倦" },
};

export type MessageSegment =
  | { type: "think"; content: string }
  | { type: "action"; content: string }
  | { type: "dialogue"; content: string };

/**
 * Extract system/expression tags from raw response and return clean text plus metadata
 */
export function extractTagsAndClean(rawText: string): {
  cleanedText: string;
  expression?: ExpressionType;
  moodDelta?: number;
  affinityDelta?: number;
} {
  if (!rawText) return { cleanedText: "" };
  let text = stripReasoningContent(rawText);
  let expression: ExpressionType | undefined;
  let moodDelta: number | undefined;
  let affinityDelta: number | undefined;

  // Extract <expression:...>
  const exprMatch = text.match(/<expression:([a-zA-Z0-9_-]+)>/i);
  if (exprMatch) {
    const val = exprMatch[1].toLowerCase();
    if (val in EXPRESSION_MAP) {
      expression = val as ExpressionType;
    }
    text = text.replace(/<expression:[a-zA-Z0-9_-]+>/gi, "");
  }

  // Extract <mood:+n> or <mood:-n>
  const moodMatch = text.match(/<mood:([+-]?\d+)>/i);
  if (moodMatch) {
    moodDelta = parseInt(moodMatch[1], 10);
    text = text.replace(/<mood:[+-]?\d+>/gi, "");
  }

  // Extract <affinity:+n> or <affinity:-n>
  const affMatch = text.match(/<affinity:([+-]?\d+)>/i);
  if (affMatch) {
    affinityDelta = parseInt(affMatch[1], 10);
    text = text.replace(/<affinity:[+-]?\d+>/gi, "");
  }

  return {
    cleanedText: text.trim(),
    expression,
    moodDelta,
    affinityDelta,
  };
}

/**
 * Detect character expression from explicit tag or implicit action heuristics
 */
export function detectExpression(
  rawText: string,
  explicitExpression?: ExpressionType,
): ExpressionType {
  if (explicitExpression && explicitExpression !== "normal") {
    return explicitExpression;
  }
  if (!rawText) return "normal";

  // Heuristic detection based on action and dialogue keywords
  if (/(脸红|耳根发烫|羞红|微红|脸颊红|泛红|红着脸|害羞|低下头不敢看|别过脸|捂住脸)/.test(rawText)) {
    return "blush";
  }
  if (/(娇羞|小声嘀咕|不好意思|指尖绞着衣角|小声说|悄悄看你|轻咬下唇)/.test(rawText)) {
    return "shy";
  }
  if (/(笑|嘻嘻|扑哧|眉眼弯弯|开心|欢呼|眼睛一亮|兴奋|眨了眨眼|甜甜)/.test(rawText)) {
    return "smile";
  }
  if (/(哼|撅起嘴|撅嘴|鼓起腮帮|才没有|笨蛋|不理你|气鼓鼓|白了你一眼|跺了跺脚)/.test(rawText)) {
    return "pout";
  }
  if (/(困|哈欠|揉了揉眼睛|揉眼睛|迷迷糊糊|眼皮打架|抱枕|被窝|睡意|想睡觉)/.test(rawText)) {
    return "sleepy";
  }
  if (/(欸|惊|睁大眼睛|愣住|愣了一下|呆住|真的假的|不敢置信|吓了一跳)/.test(rawText)) {
    return "surprised";
  }

  return "normal";
}

/**
 * Parse assistant response into structured segments:
 * - <think>...</think> -> think segment
 * - （...）, (...), 【...】, *...* -> action segment
 * - other text -> dialogue segment
 */
export function parseMessageSegments(rawText: string): MessageSegment[] {
  if (!rawText) return [];
  const safeText = stripReasoningContent(rawText);
  if (!safeText) return [];
  const segments: MessageSegment[] = [];

  // 1. Separate <think> tags if present
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = thinkRegex.exec(safeText)) !== null) {
    const preText = safeText.slice(lastIndex, match.index);
    if (preText.trim()) {
      parseActionsAndDialogue(preText, segments);
    }
    const thinkContent = match[1].trim();
    if (thinkContent) {
      segments.push({ type: "think", content: thinkContent });
    }
    lastIndex = match.index + match[0].length;
  }

  const postText = safeText.slice(lastIndex);
  if (postText.trim()) {
    parseActionsAndDialogue(postText, segments);
  }

  return segments.length > 0 ? segments : [{ type: "dialogue", content: safeText }];
}

function parseActionsAndDialogue(text: string, output: MessageSegment[]) {
  // Clean tag markers like <expression:...> first
  const clean = text
    .replace(/<expression:[^>]+>/gi, "")
    .replace(/<mood:[^>]+>/gi, "")
    .replace(/<affinity:[^>]+>/gi, "");

  // Regex to match bracketed actions: （...）, (...), 【...】, *...*
  const actionRegex = /(（[^）]+）|\([^)]+\)|【[^】]+】|\*[^*]+\*)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = actionRegex.exec(clean)) !== null) {
    const beforeDialogue = clean.slice(lastIdx, m.index).trim();
    if (beforeDialogue) {
      output.push({ type: "dialogue", content: beforeDialogue });
    }
    // Strip surrounding brackets for action content
    const actionRaw = m[0];
    const actionContent = actionRaw
      .replace(/^[（(【*]+/, "")
      .replace(/[）)】*]+$/, "")
      .trim();

    if (actionContent) {
      output.push({ type: "action", content: actionContent });
    }
    lastIdx = m.index + m[0].length;
  }

  const afterDialogue = clean.slice(lastIdx).trim();
  if (afterDialogue) {
    output.push({ type: "dialogue", content: afterDialogue });
  }
}
import { stripReasoningContent } from "@/lib/reasoningFilter";

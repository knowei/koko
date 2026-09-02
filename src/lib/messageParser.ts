import type { PersonalityTraits } from "@/data/persona";
import { stripReasoningContent } from "@/lib/reasoningFilter";

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
  | { type: "scene"; content: string }
  | { type: "thought"; content: string }
  | { type: "action"; content: string }
  | { type: "dialogue"; content: string };

/**
 * Extract system/expression/personality tags from raw response and return clean text plus metadata
 */
export function extractTagsAndClean(rawText: string): {
  cleanedText: string;
  expression?: ExpressionType;
  moodDelta?: number;
  affinityDelta?: number;
  personalityDeltas?: Partial<PersonalityTraits>;
} {
  if (!rawText) return { cleanedText: "" };
  let text = stripReasoningContent(rawText);
  let expression: ExpressionType | undefined;
  let moodDelta: number | undefined;
  let affinityDelta: number | undefined;
  const personalityDeltas: Partial<PersonalityTraits> = {};

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

  // Extract <personality:gentle|clingy|tsundere|possessive|insecure:[+-]?\d+>
  const persMatches = Array.from(text.matchAll(/<personality:([a-zA-Z]+):([+-]?\d+)>/gi));
  for (const m of persMatches) {
    const trait = m[1].toLowerCase() as keyof PersonalityTraits;
    const delta = parseInt(m[2], 10);
    if (["gentle", "clingy", "tsundere", "possessive", "insecure"].includes(trait)) {
      personalityDeltas[trait] = (personalityDeltas[trait] || 0) + delta;
    }
  }
  text = text.replace(/<personality:[a-zA-Z]+:[+-]?\d+>/gi, "");

  return {
    cleanedText: text.trim(),
    expression,
    moodDelta,
    affinityDelta,
    personalityDeltas: Object.keys(personalityDeltas).length > 0 ? personalityDeltas : undefined,
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

  const withoutReasoning = stripReasoningContent(rawText);
  const segments: MessageSegment[] = [];

  const structuredPattern = /<(scene|action|dialogue|thought)>([\s\S]*?)(?:<\/\1>|$)/gi;
  let structuredMatch: RegExpExecArray | null;
  let structuredLastIndex = 0;
  let hasStructuredSegments = false;

  while ((structuredMatch = structuredPattern.exec(withoutReasoning)) !== null) {
    hasStructuredSegments = true;
    const prefix = withoutReasoning.slice(structuredLastIndex, structuredMatch.index).trim();
    if (prefix) segments.push({ type: "dialogue", content: prefix });
    const type = structuredMatch[1].toLowerCase() as "scene" | "action" | "dialogue" | "thought";
    const content = structuredMatch[2].replace(/<[^>]+>/g, "").trim();
    if (content) segments.push({ type, content });
    structuredLastIndex = structuredPattern.lastIndex;
  }

  if (hasStructuredSegments) {
    const trailing = withoutReasoning.slice(structuredLastIndex).trim();
    if (trailing) segments.push({ type: "dialogue", content: trailing });
    return segments;
  }

  // Match full-width parentheses （...）, half-width (...), brackets 【...】, and asterisks *...*
  const pattern = /(（[^）]+）|\([^)]+\)|【[^】]+】|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(withoutReasoning)) !== null) {
    if (match.index > lastIndex) {
      const dialogueText = withoutReasoning.slice(lastIndex, match.index).trim();
      if (dialogueText) {
        segments.push({ type: "dialogue", content: dialogueText });
      }
    }

    const actionText = match[0]
      .replace(/^[（(【*]+|[）)】*]+$/g, "")
      .trim();
    if (actionText) {
      segments.push({ type: "action", content: actionText });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < withoutReasoning.length) {
    const trailing = withoutReasoning.slice(lastIndex).trim();
    if (trailing) {
      segments.push({ type: "dialogue", content: trailing });
    }
  }

  return segments.length > 0 ? segments : [{ type: "dialogue", content: withoutReasoning }];
}

/**
 * Extract clean spoken text suitable for TTS (excluding stage directions/actions)
 */
export function extractCleanSpokenText(rawText: string): string {
  const segments = parseMessageSegments(rawText);
  return segments
    .filter((s) => s.type === "dialogue")
    .map((s) => s.content)
    .join(" ")
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9，。！？、~～…\s]/g, "")
    .trim();
}

export interface VisualNovelScene {
  summary: string;
  updatedAt: number;
}

const SCENE_PATTERN = /<scene>([\s\S]*?)(?:<\/scene>|$)/i;

export function extractVisualNovelScene(text: string): string | null {
  const match = text.match(SCENE_PATTERN);
  const summary = match?.[1]
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return summary || null;
}


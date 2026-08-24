const REASONING_TAGS = ["think", "analysis", "reasoning", "reflection"] as const;
const OPEN_TAGS = REASONING_TAGS.map((tag) => `<${tag}>`);
const CLOSE_TAGS = REASONING_TAGS.map((tag) => `</${tag}>`);

function earliestTag(text: string, tags: readonly string[]) {
  const lower = text.toLowerCase();
  let index = -1;
  let tag = "";
  for (const candidate of tags) {
    const found = lower.indexOf(candidate);
    if (found >= 0 && (index < 0 || found < index)) {
      index = found;
      tag = candidate;
    }
  }
  return { index, tag };
}

function partialTagStart(text: string, tags: readonly string[]) {
  const lower = text.toLowerCase();
  const start = lower.lastIndexOf("<");
  if (start < 0) return -1;
  const suffix = lower.slice(start);
  return tags.some((tag) => tag.startsWith(suffix)) ? start : -1;
}

/** Remove provider reasoning blocks before persistence, TTS, memory, or display. */
export function stripReasoningContent(raw: string): string {
  if (!raw) return "";
  let text = raw;
  for (const tag of REASONING_TAGS) {
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    text = text.replace(new RegExp(`<${tag}>[\\s\\S]*$`, "gi"), "");
  }
  return text.trim();
}

/** Stateful filter for tags split across streamed chunks. */
export class StreamingReasoningFilter {
  private buffer = "";
  private hidden = false;

  push(chunk: string): string {
    if (!chunk) return "";
    this.buffer += chunk;
    let visible = "";

    while (this.buffer) {
      if (this.hidden) {
        const closing = earliestTag(this.buffer, CLOSE_TAGS);
        if (closing.index < 0) {
          const partial = partialTagStart(this.buffer, CLOSE_TAGS);
          this.buffer = partial >= 0 ? this.buffer.slice(partial) : "";
          break;
        }
        this.buffer = this.buffer.slice(closing.index + closing.tag.length);
        this.hidden = false;
        continue;
      }

      const opening = earliestTag(this.buffer, OPEN_TAGS);
      if (opening.index >= 0) {
        visible += this.buffer.slice(0, opening.index);
        this.buffer = this.buffer.slice(opening.index + opening.tag.length);
        this.hidden = true;
        continue;
      }

      const partial = partialTagStart(this.buffer, OPEN_TAGS);
      if (partial >= 0) {
        visible += this.buffer.slice(0, partial);
        this.buffer = this.buffer.slice(partial);
      } else {
        visible += this.buffer;
        this.buffer = "";
      }
      break;
    }

    return visible;
  }

  flush(): string {
    const visible = this.hidden ? "" : this.buffer;
    this.buffer = "";
    return visible;
  }
}

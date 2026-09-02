export type TopicFlow = "new" | "continue" | "switch" | "proactive";

const TOPIC_SWITCH_PATTERN = /(换个话题|不(?:说|聊).{0,12}了|聊聊|聊一下|说说|谈谈|我们聊|对了|话说|另外|回到.{0,12}(?:话题|问题))/u;
const CONTINUATION_PATTERN = /^(?:嗯+|哦+|好(?:的|呀|啊)?|可以|行(?:呀|啊)?|是的|对(?:的|呀|啊)?|没错|然后呢|继续|为什么|怎么了|真的吗|那呢)[呀啊呢嘛哦～~，,。.！!？?\s]*$/u;

export function detectTopicFlow(latestText: string, previousUserText = "", proactive = false): TopicFlow {
  if (proactive || !latestText.trim()) return "proactive";
  const latest = latestText.trim();
  if (TOPIC_SWITCH_PATTERN.test(latest)) return "switch";
  if (previousUserText.trim() && latest.length <= 12 && CONTINUATION_PATTERN.test(latest)) return "continue";
  return "new";
}

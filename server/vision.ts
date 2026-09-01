import Anthropic from "@anthropic-ai/sdk";

export interface VisionCommentBody {
  image: string; // Base64 data URL (e.g. "data:image/jpeg;base64,...")
  activityType?: "game" | "coding" | "browsing" | "horror" | "auto";
  context?: {
    profile?: { name: string; userNickname?: string };
    affinity?: number;
    mood?: number;
  };
  provider?: {
    mode: "default" | "custom";
    baseURL?: string;
    apiKey?: string;
    model?: string;
    visionProvider?: {
      enabled: boolean;
      baseURL?: string;
      apiKey?: string;
      model?: string;
    };
  };
}

export interface VisionCommentResult {
  commentary: string;
  expression: "smile" | "blush" | "shy" | "pout" | "sleepy" | "surprised";
  sceneType: "game" | "coding" | "browsing" | "video" | "idle" | "other";
}

const FALLBACK_VISION_REPLIES: Record<string, VisionCommentResult[]> = {
  coding: [
    { commentary: "（递上温水）哥哥又在专注敲代码啦？好认真的神情呀，写完记得活动下脖子哦~", expression: "shy", sceneType: "coding" },
    { commentary: "（托腮看屏幕）屏幕上密密麻麻的代码看起来好深奥哦…哥哥今天也超级厉害！", expression: "smile", sceneType: "coding" },
    { commentary: "（安静趴在桌边）哥哥在敲代码调试呢，可可在旁边乖乖给你当代码小黄鸭伴侣~", expression: "smile", sceneType: "coding" },
  ],
  game: [
    { commentary: "（探头看屏幕）哇！战况好像很激烈呀，哥哥加油，这把必拿下！", expression: "smile", sceneType: "game" },
    { commentary: "（紧张地握紧小拳头）注意走位和技能冷却哦，小心别被偷袭啦~", expression: "surprised", sceneType: "game" },
    { commentary: "（欢呼雀跃）太帅啦！这波操作行云流水，妹妹在旁边给你狠狠打call！", expression: "smile", sceneType: "game" },
  ],
  horror: [
    { commentary: "（悄悄往你身边靠了靠）这里也太暗了吧……哥你慢一点，我陪你一起看。", expression: "shy", sceneType: "game" },
    { commentary: "（抱住小枕头嘴硬）我、我才没害怕，只是刚才那个声音太突然了！", expression: "surprised", sceneType: "game" },
  ],
  auto: [
    { commentary: "（凑过来仔细看屏幕）哥哥在专注忙什么呢？是写代码还是查资料呀？可可在旁边安静陪着你~", expression: "smile", sceneType: "coding" },
    { commentary: "（递上温水）哥哥专注工作/写代码辛苦啦，记得眨眨眼睛喝口水休息一下~", expression: "shy", sceneType: "coding" },
    { commentary: "（托着小脑袋认真注视）好专注的神情呀！不管在忙什么，妹妹都一直陪着你~", expression: "smile", sceneType: "other" },
  ],
  general: [
    { commentary: "（凑过来看看）在看什么有趣的内容呀？可可也想和你一起看~", expression: "smile", sceneType: "browsing" },
    { commentary: "（眨巴眼睛）今天辛苦啦，不管在忙什么，妹妹都一直陪着你哦！", expression: "shy", sceneType: "other" },
  ],
};

function getRandomFallback(type: string): VisionCommentResult {
  const list = FALLBACK_VISION_REPLIES[type] || FALLBACK_VISION_REPLIES.auto || FALLBACK_VISION_REPLIES.general;
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Two-Stage Vision Pipeline:
 * Stage 1: Multimodal Vision Model extracts objective scene & activity from screen pixels
 * Stage 2: Primary Persona Text Model (e.g. DeepSeek/Qwen/Claude) generates emotional in-character line
 */
export async function runVisionComment(body: VisionCommentBody): Promise<VisionCommentResult> {
  const { image, context, provider } = body;
  const companionName = context?.profile?.name || "可可";
  const userNickname = context?.profile?.userNickname || "哥哥";
  const horrorMode = body.activityType === "horror";

  if (!image || typeof image !== "string") {
    return getRandomFallback("general");
  }

  // Extract base64 and mime type
  const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
  const mediaType = (match ? match[1] : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const base64Data = match ? match[2] : image;
  const fullDataUrl = match ? image : `data:image/jpeg;base64,${base64Data}`;

  // Check if dedicated vision provider is enabled (e.g. Vision Model != Main Text Model)
  const isDedicatedVision = Boolean(
    provider?.visionProvider?.enabled &&
    provider.visionProvider.baseURL &&
    provider.visionProvider.apiKey
  );

  let sceneSummary: string | null = null;
  let sceneType: "game" | "coding" | "browsing" | "video" | "idle" | "other" = "other";

  // ==========================================
  // STAGE 1: Extract Scene using Vision Model
  // ==========================================
  if (isDedicatedVision) {
    const vCfg = provider!.visionProvider!;
    const vBaseURL = vCfg.baseURL!.replace(/\/+$/, "");
    const vModel = vCfg.model || "gpt-4o-mini";

    try {
      const vRes = await fetch(`${vBaseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${vCfg.apiKey}`,
        },
        body: JSON.stringify({
          model: vModel,
          messages: [
            {
              role: "system",
              content: "你是一个屏幕画面识别专家。请简明扼要地描述用户当前屏幕上的活动（如写代码具体语言/框架、打什么游戏当前战况、看什么网页视频或报错信息），50字以内。以JSON格式输出：{\"summary\": \"描述\", \"sceneType\": \"game|coding|browsing|video|idle|other\"}",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "请识别这个屏幕画面内容：" },
                { type: "image_url", image_url: { url: fullDataUrl, detail: "low" } },
              ],
            },
          ],
          max_tokens: 150,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (vRes.ok) {
        const vData: any = await vRes.json();
        const content = vData?.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          sceneSummary = parsed.summary || content;
          sceneType = parsed.sceneType || "other";
        } else {
          sceneSummary = content.trim();
        }
      }
    } catch (e) {
      console.warn("[Vision Stage 1] Dedicated vision request failed:", e);
    }
  }

  // If Stage 1 succeeded, now run Stage 2 with Primary Text Model (e.g. DeepSeek / Qwen / Claude)
  if (sceneSummary && provider?.mode === "custom" && provider.baseURL && provider.apiKey) {
    const textBaseURL = provider.baseURL.replace(/\/+$/, "");
    const textModel = provider.model || "deepseek-chat";

    const personaPrompt = `你叫${companionName}，是${userNickname}青梅竹马、温柔可爱又贴心的妹妹。
你正在通过桌宠视角陪着${userNickname}。现在视觉系统观察到他屏幕上的画面：【${sceneSummary}】。
请以妹妹${companionName}的身份和口吻，结合当前的画面情况，对${userNickname}说 1~2 句生动贴心的口语短句（20~40字），可带动作括号如（凑过来看）（递上温水）。
${horrorMode ? "现在是恐怖游戏陪伴模式：表现得像容易受惊却会靠近哥哥继续陪玩的邻家妹妹；不要剧透，不确定时不要编造具体怪物或危险。" : ""}
必须输出严格 JSON 格式：
{
  "commentary": "你的口语台词",
  "expression": "smile|blush|shy|pout|sleepy|surprised"
}`;

    try {
      const textRes = await fetch(`${textBaseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: textModel,
          messages: [
            { role: "system", content: personaPrompt },
            { role: "user", content: "请给出陪伴点评：" },
          ],
          max_tokens: 150,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (textRes.ok) {
        const textData: any = await textRes.json();
        const raw = textData?.choices?.[0]?.message?.content || "";
        const parsed = parseVisionJson(raw);
        if (parsed) {
          return {
            commentary: parsed.commentary,
            expression: parsed.expression,
            sceneType,
          };
        }
      }
    } catch (e) {
      console.warn("[Vision Stage 2] Primary text model persona generation failed:", e);
    }
  }

  // ==========================================
  // SINGLE-STAGE DIRECT MULTIMODAL FALLBACK
  // ==========================================
  const singleStagePrompt = `你叫${companionName}，是${userNickname}青梅竹马、善解人意且活泼可爱的妹妹。
现在你正透过电脑屏幕（桌宠视角）看着${userNickname}当前的屏幕画面（可能是在打游戏、写代码、看视频或日常浏览）。
${horrorMode ? "当前开启恐怖游戏陪伴：像容易受惊但会陪在哥哥身边的邻家妹妹，结合画面表现紧张、嘴硬、靠近或安慰；不要剧透，不确定时不要声称看见了具体怪物。" : ""}

任务要求：
1. 快速看懂画面当前在发生什么（例如：游戏战局/血量/操作、IDE代码、网页或视频内容）。
2. 用非常简短口语化、生动活泼的妹妹语气说出 1~2 句话（20~40字以内），可包含动作括号如（探头）（为你鼓掌）。
3. 必须输出严格 JSON 格式：
{
  "commentary": "你的动作与口语台词",
  "expression": "smile|blush|shy|pout|sleepy|surprised",
  "sceneType": "game|coding|browsing|video|idle|other"
}`;

  // 1. Direct Custom Vision Model
  if (provider?.mode === "custom" && provider.baseURL && provider.apiKey) {
    const baseURL = provider.baseURL.replace(/\/+$/, "");
    const model = provider.model || "gpt-4o-mini";

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: singleStagePrompt },
            {
              role: "user",
              content: [
                { type: "text", text: `这是${userNickname}当前的屏幕，看看他在干什么并点评一下吧：` },
                { type: "image_url", image_url: { url: fullDataUrl, detail: "low" } },
              ],
            },
          ],
          max_tokens: 150,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(12_000),
      });

      if (response.ok) {
        const data: any = await response.json();
        const rawContent = data?.choices?.[0]?.message?.content || "";
        const parsed = parseVisionJson(rawContent);
        if (parsed) return parsed;
      }
    } catch (e) {
      console.warn("[Vision Direct] Custom vision request failed:", e);
    }
  }

  // 2. Anthropic Default Vision
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 200,
        system: singleStagePrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: `这是${userNickname}当前的屏幕，看看他在做什么并用你的语气说一句话吧：`,
              },
            ],
          },
        ],
      });

      const firstBlock = response.content[0];
      if (firstBlock && firstBlock.type === "text") {
        const parsed = parseVisionJson(firstBlock.text);
        if (parsed) return parsed;
      }
    } catch (e) {
      console.warn("[Vision Anthropic] Anthropic vision request failed:", e);
    }
  }

  // 3. Fallback Heuristic
  return getRandomFallback(body.activityType || "auto");
}

function parseVisionJson(text: string): VisionCommentResult | null {
  try {
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj.commentary) {
        const validExprs = ["smile", "blush", "shy", "pout", "sleepy", "surprised"];
        const expression = validExprs.includes(obj.expression) ? obj.expression : "smile";
        return {
          commentary: String(obj.commentary).slice(0, 120),
          expression,
          sceneType: obj.sceneType || "other",
        };
      }
    }
  } catch {
    // Ignore JSON parse error and fallback
  }
  return null;
}

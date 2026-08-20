import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useStore } from "@/store/companionStore";
import { EXPRESSION_MAP } from "@/lib/messageParser";

type Expression = "base" | "relieved" | "worried" | "sleepy";

function expressionFor(mood: number, hour: number, expr = "normal"): Expression {
  if (expr === "sleepy" || hour >= 23 || hour < 6) return "sleepy";
  if (expr === "pout" || expr === "shy" || mood < 35) return "worried";
  if (expr === "smile" || expr === "blush" || mood >= 72) return "relieved";
  return "base";
}

const expressionNames: Record<Expression, string> = {
  base: "平静",
  relieved: "安心",
  worried: "担心",
  sleepy: "困倦",
};

export function CharacterStage() {
  const mood = useStore((state) => state.mood);
  const activeSkin = useStore((state) => state.activeSkin);
  const previewSkin = useStore((state) => state.previewSkin);
  const setPreviewSkin = useStore((state) => state.setPreviewSkin);
  const profile = useStore((state) => state.profile);
  const currentExpression = useStore((state) => state.currentExpression);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [reaction, setReaction] = useState<Expression | null>(null);
  const [hearts, setHearts] = useState<Array<{ id: number; x: number; y: number; text: string }>>([]);
  const reactionTimer = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => {
      window.clearInterval(timer);
      if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    };
  }, []);

  const expression = reaction ?? expressionFor(mood, hour, currentExpression);
  const currentSkin = previewSkin ?? activeSkin;
  const skinSuffix = currentSkin === "green" ? "-green" : "";

  const move = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    event.currentTarget.style.setProperty("--look-x", x.toFixed(3));
    event.currentTarget.style.setProperty("--look-y", y.toFixed(3));
  };

  const resetLook = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--look-x", "0");
    event.currentTarget.style.setProperty("--look-y", "0");
  };

  const handleTouch = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relY = (event.clientY - rect.top) / rect.height;
    const relX = event.clientX - rect.left;

    // Upper 40%: Pat head (安心/害羞); Lower: Gentle poke
    const nextExpr: Expression = relY < 0.45 ? "relieved" : mood < 40 ? "worried" : "relieved";
    setReaction(nextExpr);

    const heartEmojis = ["♥", "✨", "🌸", "💖"];
    const randomEmoji = heartEmojis[Math.floor(Math.random() * heartEmojis.length)];
    const newHeart = {
      id: Date.now() + Math.random(),
      x: Math.max(20, Math.min(rect.width - 20, relX)),
      y: Math.max(20, event.clientY - rect.top),
      text: randomEmoji,
    };

    setHearts((prev) => [...prev.slice(-4), newHeart]);

    if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => {
      setReaction(null);
      setHearts([]);
    }, 2000);
  };

  return (
    <section
      className={`character-stage ${previewSkin ? "in-preview" : ""}`}
      aria-label={`${profile.name}的角色立绘`}
      data-character-mode="animated-sprite-fallback"
      style={{ "--look-x": 0, "--look-y": 0 } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={resetLook}
    >
      {previewSkin && (
        <div className="preview-skin-badge">
          <span>👗 试穿预览中 · {previewSkin === "green" ? "薄荷绿裙" : "浅蓝长裙"}</span>
          <button onClick={() => setPreviewSkin(null)}>退出试穿</button>
        </div>
      )}

      <div className="character-scene">
        <div className="character-depth" aria-hidden="true" />
        <button
          className="character-touch"
          type="button"
          onClick={handleTouch}
          aria-label={`和${profile.name}互动`}
        >
          <img
            key={`${expression}-${currentSkin}`}
            className="character-sprite character-breathing"
            src={`/assets/character/koko-${expression}${skinSuffix}.png`}
            alt={`长银发、神情${expressionNames[expression]}的${profile.name}`}
          />
        </button>

        {hearts.map((h) => (
          <span
            key={h.id}
            className="touch-heart-particle"
            style={{ left: `${h.x}px`, top: `${h.y}px` }}
            aria-hidden="true"
          >
            {h.text}
          </span>
        ))}

        {currentExpression !== "normal" && (
          <div className="stage-expression-float" key={currentExpression}>
            <span className="stage-expr-emoji">{EXPRESSION_MAP[currentExpression].emoji}</span>
            <span className="stage-expr-label">{EXPRESSION_MAP[currentExpression].label}</span>
          </div>
        )}
      </div>
      <div className="character-caption">
        <span className="presence-dot" />
        {profile.name}就在这里
      </div>
    </section>
  );
}

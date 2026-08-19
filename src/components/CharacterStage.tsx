import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useStore } from "@/store/companionStore";

type Expression = "base" | "relieved" | "worried" | "sleepy";

function expressionFor(mood: number, hour: number): Expression {
  if (hour >= 23 || hour < 6) return "sleepy";
  if (mood < 35) return "worried";
  if (mood >= 72) return "relieved";
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
  const profile = useStore((state) => state.profile);
  const [hour, setHour] = useState(() => new Date().getHours());
  const [reaction, setReaction] = useState<Expression | null>(null);
  const [heart, setHeart] = useState(0);
  const reactionTimer = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => {
      window.clearInterval(timer);
      if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    };
  }, []);

  const expression = reaction ?? expressionFor(mood, hour);
  const skinSuffix = activeSkin === "green" ? "-green" : "";

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

  const react = () => {
    setReaction("relieved");
    setHeart((value) => value + 1);
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setReaction(null), 1800);
  };

  return (
    <section
      className="character-stage"
      aria-label={`${profile.name}的角色立绘`}
      data-character-mode="animated-sprite-fallback"
      style={{ "--look-x": 0, "--look-y": 0 } as CSSProperties}
      onPointerMove={move}
      onPointerLeave={resetLook}
    >
      <div className="character-scene">
        <div className="character-depth" aria-hidden="true" />
        <button className="character-touch" type="button" onClick={react} aria-label="和可可互动">
          <img
            key={expression}
            className="character-sprite"
            src={`/assets/character/koko-${expression}${skinSuffix}.png`}
            alt={`长银发、神情${expressionNames[expression]}的${profile.name}`}
          />
        </button>
        <span key={heart} className={`touch-heart ${heart ? "show" : ""}`} aria-hidden="true">♥</span>
      </div>
      <div className="character-caption">
        <span className="presence-dot" />
        {profile.name}就在这里
      </div>
    </section>
  );
}

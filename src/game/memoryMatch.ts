export interface MemoryCard {
  id: number;
  icon: string;
  label: string;
  matched: boolean;
}

const CARD_ICONS = [
  { icon: "🧋", label: "芋泥波波奶茶" },
  { icon: "🍰", label: "草莓千层蛋糕" },
  { icon: "📷", label: "复古拍立得" },
  { icon: "🐱", label: "软萌折耳猫" },
  { icon: "🌸", label: "初春樱花标本" },
  { icon: "🎀", label: "粉色丝绒缎带" },
  { icon: "🧸", label: "暖心泰迪熊" },
  { icon: "🔮", label: "许愿水晶球" },
];

export function createMemoryCards(): MemoryCard[] {
  const deck: MemoryCard[] = [];
  CARD_ICONS.forEach((item, idx) => {
    deck.push({ id: idx * 2, icon: item.icon, label: item.label, matched: false });
    deck.push({ id: idx * 2 + 1, icon: item.icon, label: item.label, matched: false });
  });
  return deck.sort(() => Math.random() - 0.5);
}

export function getCompanionMemoryMove(
  cards: MemoryCard[],
  knownCards: Map<number, string>, // card index -> icon
  firstFlippedIdx: number | null
): number {
  const unmatchedIndices = cards
    .map((c, i) => (!c.matched ? i : -1))
    .filter((i) => i !== -1 && i !== firstFlippedIdx);

  // If first card is already flipped, check if knownCards has the matching pair
  if (firstFlippedIdx !== null) {
    const firstIcon = cards[firstFlippedIdx].icon;
    for (const idx of unmatchedIndices) {
      if (knownCards.get(idx) === firstIcon) {
        return idx; // Found match in memory!
      }
    }
  } else {
    // Check if there is any known matching pair in memory
    const iconToIdxMap = new Map<string, number>();
    for (const idx of unmatchedIndices) {
      const icon = knownCards.get(idx);
      if (icon) {
        if (iconToIdxMap.has(icon)) {
          return iconToIdxMap.get(icon)!; // Pick first of matching pair
        }
        iconToIdxMap.set(icon, idx);
      }
    }
  }

  // Otherwise flip an unknown card or random unmatched card
  const unknown = unmatchedIndices.filter((idx) => !knownCards.has(idx));
  const pool = unknown.length > 0 ? unknown : unmatchedIndices;
  return pool[Math.floor(Math.random() * pool.length)];
}

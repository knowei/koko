export type GoCell = 0 | 1 | 2; // 0: empty, 1: Black (Player), 2: White (Companion)

export interface GoBoardState {
  size: number;
  grid: GoCell[][];
  capturesBlack: number; // Stones captured by Black
  capturesWhite: number; // Stones captured by White
  consecutivePasses: number;
  lastMove: { r: number; c: number } | null;
  koPoint: { r: number; c: number } | null; // Illegal point due to single-stone ko
}

export function createEmptyGoBoard(size = 9): GoBoardState {
  return {
    size,
    grid: Array.from({ length: size }, () => Array(size).fill(0)),
    capturesBlack: 0,
    capturesWhite: 0,
    consecutivePasses: 0,
    lastMove: null,
    koPoint: null,
  };
}

const DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

// Flood-fill to find connected group of stones and its liberties
export function getGoGroup(
  grid: GoCell[][],
  size: number,
  startR: number,
  startC: number
): { stones: { r: number; c: number }[]; liberties: Set<string> } {
  const targetColor = grid[startR][startC];
  if (targetColor === 0) {
    return { stones: [], liberties: new Set() };
  }

  const visited = new Set<string>();
  const stones: { r: number; c: number }[] = [];
  const liberties = new Set<string>();

  const queue: [number, number][] = [[startR, startC]];
  visited.add(`${startR},${startC}`);

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;
    stones.push({ r, c });

    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;

      const cell = grid[nr][nc];
      if (cell === 0) {
        liberties.add(`${nr},${nc}`);
      } else if (cell === targetColor && !visited.has(`${nr},${nc}`)) {
        visited.add(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
  }

  return { stones, liberties };
}

// Attempt to play a move. Returns new board state if legal, or null if illegal.
export function playGoMove(
  state: GoBoardState,
  r: number,
  c: number,
  color: 1 | 2
): { nextState: GoBoardState; capturedCount: number } | null {
  if (r < 0 || r >= state.size || c < 0 || c >= state.size) return null;
  if (state.grid[r][c] !== 0) return null;

  // Ko rule violation check
  if (state.koPoint && state.koPoint.r === r && state.koPoint.c === c) {
    return null;
  }

  const opponent = color === 1 ? 2 : 1;
  const newGrid = state.grid.map((row) => [...row]);
  newGrid[r][c] = color;

  // Check captures of adjacent opponent groups
  let totalCapturedStones: { r: number; c: number }[] = [];

  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= state.size || nc < 0 || nc >= state.size) continue;

    if (newGrid[nr][nc] === opponent) {
      const group = getGoGroup(newGrid, state.size, nr, nc);
      if (group.liberties.size === 0) {
        for (const stone of group.stones) {
          if (!totalCapturedStones.some((s) => s.r === stone.r && s.c === stone.c)) {
            totalCapturedStones.push(stone);
          }
        }
      }
    }
  }

  // Remove captured opponent stones
  for (const s of totalCapturedStones) {
    newGrid[s.r][s.c] = 0;
  }

  // Check self-liberties (Suicide check)
  const ownGroup = getGoGroup(newGrid, state.size, r, c);
  if (ownGroup.liberties.size === 0 && totalCapturedStones.length === 0) {
    // Suicide move is forbidden
    return null;
  }

  // Check if single stone was captured (Potential Ko situation)
  let nextKo: { r: number; c: number } | null = null;
  if (totalCapturedStones.length === 1 && ownGroup.stones.length === 1 && ownGroup.liberties.size === 1) {
    nextKo = { r: totalCapturedStones[0].r, c: totalCapturedStones[0].c };
  }

  const nextState: GoBoardState = {
    size: state.size,
    grid: newGrid,
    capturesBlack: state.capturesBlack + (color === 1 ? totalCapturedStones.length : 0),
    capturesWhite: state.capturesWhite + (color === 2 ? totalCapturedStones.length : 0),
    consecutivePasses: 0,
    lastMove: { r, c },
    koPoint: nextKo,
  };

  return { nextState, capturedCount: totalCapturedStones.length };
}

// Territory scoring (Flood fill empty regions to check owner)
export function calculateGoScore(state: GoBoardState, komi = 3.5): {
  blackTerritory: number;
  whiteTerritory: number;
  blackTotal: number;
  whiteTotal: number;
  winner: "black" | "white";
  diff: number;
} {
  const size = state.size;
  const visited = new Set<string>();
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (state.grid[r][c] !== 0 || visited.has(`${r},${c}`)) continue;

      const region: [number, number][] = [];
      const queue: [number, number][] = [[r, c]];
      visited.add(`${r},${c}`);

      let touchesBlack = false;
      let touchesWhite = false;

      while (queue.length > 0) {
        const [cr, cc] = queue.shift()!;
        region.push([cr, cc]);

        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;

          const cell = state.grid[nr][nc];
          if (cell === 1) touchesBlack = true;
          else if (cell === 2) touchesWhite = true;
          else if (cell === 0 && !visited.has(`${nr},${nc}`)) {
            visited.add(`${nr},${nc}`);
            queue.push([nr, nc]);
          }
        }
      }

      if (touchesBlack && !touchesWhite) {
        blackTerritory += region.length;
      } else if (touchesWhite && !touchesBlack) {
        whiteTerritory += region.length;
      }
    }
  }

  const blackTotal = blackTerritory + state.capturesBlack;
  const whiteTotal = whiteTerritory + state.capturesWhite + komi;
  const winner = blackTotal > whiteTotal ? "black" : "white";
  const diff = Math.abs(blackTotal - whiteTotal);

  return { blackTerritory, whiteTerritory, blackTotal, whiteTotal, winner, diff };
}

// AI Engine: computes best move for White (Companion / 2)
export function getBestGoMove(state: GoBoardState, difficulty: "easy" | "smart" = "smart"): { r: number; c: number } | "pass" {
  const size = state.size;
  let bestScore = -Infinity;
  const candidateMoves: { r: number; c: number }[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (state.grid[r][c] !== 0) continue;

      const moveRes = playGoMove(state, r, c, 2);
      if (!moveRes) continue; // Illegal move

      const { nextState, capturedCount } = moveRes;
      let score = 0;

      // 1. Value captures
      score += capturedCount * 80;

      // 2. Value liberties of played group
      const ownGroup = getGoGroup(nextState.grid, size, r, c);
      if (ownGroup.liberties.size === 1) {
        score -= 40; // In atari!
      } else {
        score += ownGroup.liberties.size * 6;
      }

      // 3. Corner / side preference (Gold corners, Silver sides)
      const distToEdgeR = Math.min(r, size - 1 - r);
      const distToEdgeC = Math.min(c, size - 1 - c);
      if (distToEdgeR === 2 && distToEdgeC === 2) score += 25; // 3-3 point
      if (distToEdgeR >= 1 && distToEdgeC >= 1) score += 10;

      // Add slight randomness
      const jitter = difficulty === "smart" ? Math.random() * 8 : Math.random() * 30;
      score += jitter;

      if (score > bestScore) {
        bestScore = score;
        candidateMoves.length = 0;
        candidateMoves.push({ r, c });
      } else if (Math.abs(score - bestScore) < 3) {
        candidateMoves.push({ r, c });
      }
    }
  }

  if (candidateMoves.length === 0 || bestScore < 0) {
    return "pass";
  }

  return candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
}

// Generate companion commentary for Go events
export function getGoCommentary(
  event: "start" | "player_capture" | "companion_capture" | "companion_pass" | "player_win" | "companion_win",
  companionName: string,
  userNickname: string,
  count?: number
): { text: string; expr: "smile" | "blush" | "shy" | "pout" | "surprised" } {
  switch (event) {
    case "start":
      return {
        text: `（认真摆上棋盘与棋罐）${userNickname}执黑先行哦！金角银边草肚皮，我们下盘静心的围棋吧~`,
        expr: "smile",
      };
    case "player_capture":
      return {
        text: `（看着被提起的${count || 1}颗白子，捂住脸蛋）呜哇！大龙的气竟然被收紧了…${userNickname}这招断点太准啦！`,
        expr: "pout",
      };
    case "companion_capture":
      return {
        text: `（开心地夹起${count || 1}颗黑子放进棋盖）提子！嘿嘿，包围圈已经织好啦~`,
        expr: "blush",
      };
    case "companion_pass":
      return {
        text: `（轻轻颔首）盘面格局已经差不多定下来啦，这手我选择停一手（Pass），${userNickname}觉得如何呢？`,
        expr: "shy",
      };
    case "player_win":
      return {
        text: `（点完目数，佩服地双手奉茶）${userNickname}占了更多目数赢了呢！大局观真的好厉害，我还要多向你学习~`,
        expr: "shy",
      };
    case "companion_win":
      return {
        text: `（开心得晃着小腿笑盈盈）目数清点完毕，这局是${companionName}险胜哦！诶嘿嘿，心愿星归我咯~`,
        expr: "blush",
      };
  }
}

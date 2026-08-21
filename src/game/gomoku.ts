export type BoardCell = 0 | 1 | 2; // 0: empty, 1: player (Black), 2: companion (White)
export type GameWinner = 0 | 1 | 2 | "draw" | null;

export interface GomokuMove {
  r: number;
  c: number;
}

export interface BoardState {
  grid: BoardCell[][];
  size: number;
  lastMove: GomokuMove | null;
  history: GomokuMove[];
}

export function createEmptyBoard(size = 15): BoardState {
  const grid: BoardCell[][] = Array.from({ length: size }, () => Array(size).fill(0));
  return {
    grid,
    size,
    lastMove: null,
    history: [],
  };
}

// Direction vectors for 4 lines: horizontal, vertical, diagonal-down, diagonal-up
const DIRECTIONS = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal \
  [1, -1],  // diagonal /
];

// Check if move results in 5-in-a-row (or 3-in-a-row for Tic-Tac-Toe)
export function checkWin(grid: BoardCell[][], size: number, r: number, c: number, target: BoardCell, winLength = 5): boolean {
  if (target === 0) return false;

  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;

    // Forward
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === target) {
      count++;
      nr += dr;
      nc += dc;
    }

    // Backward
    nr = r - dr;
    nc = c - dc;
    while (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === target) {
      count++;
      nr -= dr;
      nc -= dc;
    }

    if (count >= winLength) return true;
  }

  return false;
}

export function isBoardFull(grid: BoardCell[][], size: number): boolean {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0) return false;
    }
  }
  return true;
}

// Heuristic pattern scores for Gomoku AI
const PATTERN_SCORES = {
  WIN5: 100000,
  OPEN4: 10000,
  BLOCKED4: 2500,
  OPEN3: 2000,
  BLOCKED3: 500,
  OPEN2: 150,
  BLOCKED2: 30,
};

function evaluateLine(grid: BoardCell[][], size: number, r: number, c: number, dr: number, dc: number, target: BoardCell): number {
  let count = 1;
  let openEnds = 0;

  // Forward
  let nr = r + dr;
  let nc = c + dc;
  while (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === target) {
    count++;
    nr += dr;
    nc += dc;
  }
  if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0) {
    openEnds++;
  }

  // Backward
  nr = r - dr;
  nc = c - dc;
  while (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === target) {
    count++;
    nr -= dr;
    nc -= dc;
  }
  if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0) {
    openEnds++;
  }

  if (count >= 5) return PATTERN_SCORES.WIN5;
  if (count === 4) {
    if (openEnds === 2) return PATTERN_SCORES.OPEN4;
    if (openEnds === 1) return PATTERN_SCORES.BLOCKED4;
  }
  if (count === 3) {
    if (openEnds === 2) return PATTERN_SCORES.OPEN3;
    if (openEnds === 1) return PATTERN_SCORES.BLOCKED3;
  }
  if (count === 2) {
    if (openEnds === 2) return PATTERN_SCORES.OPEN2;
    if (openEnds === 1) return PATTERN_SCORES.BLOCKED2;
  }
  return 0;
}

// Evaluate total threat score of placing a piece for a player at (r, c)
function evaluateMoveForPlayer(grid: BoardCell[][], size: number, r: number, c: number, target: BoardCell): number {
  let score = 0;
  for (const [dr, dc] of DIRECTIONS) {
    score += evaluateLine(grid, size, r, c, dr, dc, target);
  }
  return score;
}

// AI Engine: computes next best move for companion (White / 2)
export function getBestGomokuMove(
  grid: BoardCell[][],
  size: number,
  difficulty: "easy" | "normal" | "smart" = "smart"
): GomokuMove | null {
  const center = Math.floor(size / 2);

  // If Tic-Tac-Toe (3x3), use standard 3x3 minimax / smart logic
  if (size === 3) {
    return getBestTicTacToeMove(grid);
  }

  // If first move, place near center
  let totalPieces = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 0) totalPieces++;
    }
  }

  if (totalPieces === 0) {
    return { r: center, c: center };
  }

  if (totalPieces === 1 && grid[center][center] === 1) {
    const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const [dr, dc] = offsets[Math.floor(Math.random() * offsets.length)];
    return { r: center + dr, c: center + dc };
  }

  let bestScore = -Infinity;
  const bestMoves: GomokuMove[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 0) continue;

      // Distance to center bonus
      const distFromCenter = Math.abs(r - center) + Math.abs(c - center);
      const centerBonus = Math.max(0, 15 - distFromCenter);

      // AI Attack score (Placing piece 2)
      grid[r][c] = 2;
      const attackScore = evaluateMoveForPlayer(grid, size, r, c, 2);
      grid[r][c] = 0;

      // AI Defense score (Preventing Player 1 from getting this position)
      grid[r][c] = 1;
      const defenseScore = evaluateMoveForPlayer(grid, size, r, c, 1);
      grid[r][c] = 0;

      let totalScore = 0;

      if (attackScore >= PATTERN_SCORES.WIN5) {
        totalScore = attackScore * 2; // Immediate win
      } else if (defenseScore >= PATTERN_SCORES.WIN5) {
        totalScore = defenseScore * 1.8; // Must block player win
      } else if (attackScore >= PATTERN_SCORES.OPEN4) {
        totalScore = attackScore * 1.5;
      } else if (defenseScore >= PATTERN_SCORES.OPEN4) {
        totalScore = defenseScore * 1.4;
      } else {
        // Balanced attack and defense
        const attackWeight = difficulty === "easy" ? 0.7 : 1.1;
        const defenseWeight = difficulty === "easy" ? 0.6 : 1.0;
        totalScore = attackScore * attackWeight + defenseScore * defenseWeight + centerBonus;
      }

      // Add slight randomness
      const jitter = difficulty === "smart" ? Math.random() * 8 : Math.random() * 40;
      totalScore += jitter;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMoves.length = 0;
        bestMoves.push({ r, c });
      } else if (Math.abs(totalScore - bestScore) < 2) {
        bestMoves.push({ r, c });
      }
    }
  }

  if (bestMoves.length === 0) return null;
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// 3x3 Tic-Tac-Toe AI
function getBestTicTacToeMove(grid: BoardCell[][]): GomokuMove | null {
  // Check if AI can win immediately
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c] === 0) {
        grid[r][c] = 2;
        if (checkWin(grid, 3, r, c, 2, 3)) {
          grid[r][c] = 0;
          return { r, c };
        }
        grid[r][c] = 0;
      }
    }
  }

  // Check if AI needs to block player win
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c] === 0) {
        grid[r][c] = 1;
        if (checkWin(grid, 3, r, c, 1, 3)) {
          grid[r][c] = 0;
          return { r, c };
        }
        grid[r][c] = 0;
      }
    }
  }

  // Take center if available
  if (grid[1][1] === 0) return { r: 1, c: 1 };

  // Corners
  const corners: GomokuMove[] = [
    { r: 0, c: 0 }, { r: 0, c: 2 }, { r: 2, c: 0 }, { r: 2, c: 2 },
  ].filter((p) => grid[p.r][p.c] === 0);
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];

  // Sides
  const sides: GomokuMove[] = [
    { r: 0, c: 1 }, { r: 1, c: 0 }, { r: 1, c: 2 }, { r: 2, c: 1 },
  ].filter((p) => grid[p.r][p.c] === 0);
  if (sides.length > 0) return sides[Math.floor(Math.random() * sides.length)];

  return null;
}

// Generate companion real-time commentary and expression during gameplay
export function getCompanionCommentary(
  event: "start" | "player_move" | "companion_move" | "player_win" | "companion_win" | "draw" | "threat",
  companionName: string,
  userNickname: string
): { text: string; expr: "smile" | "blush" | "shy" | "pout" | "surprised" } {
  switch (event) {
    case "start":
      return {
        text: `（认真摆好棋盘）${userNickname}执黑先行哦，看招吧，我今天可是做足功课了！`,
        expr: "smile",
      };
    case "threat":
      return {
        text: `（倒吸一口凉气，赶忙盯紧棋盘）欸？！${userNickname}你这步棋什么时候连起来的…休想骗过我！`,
        expr: "surprised",
      };
    case "player_move": {
      const msgs = [
        `（单手托腮仔细琢磨）哼哼，${userNickname}下在这里呀，那看我下这步！`,
        `（眨了眨大眼睛）唔…走这步吗？感觉很有套路呢。`,
        `（握着棋子在指尖转圈）好沉稳的一步呀，不过我也有对策哦~`,
      ];
      return {
        text: msgs[Math.floor(Math.random() * msgs.length)],
        expr: "shy",
      };
    }
    case "companion_move": {
      const msgs = [
        `（轻轻落下一子，得意地笑）这步怎么样？是不是被我难倒啦~`,
        `（歪头看着你笑）该${userNickname}走啦，慢慢想不着急哦。`,
        `（小声嘀咕）这步可是我的秘密战略路线！`,
      ];
      return {
        text: msgs[Math.floor(Math.random() * msgs.length)],
        expr: "smile",
      };
    }
    case "player_win":
      return {
        text: `（鼓起腮帮子轻轻拍了拍棋盘）呜哇！${userNickname}太厉害了…我竟然没防住这步！不过下次我一定会赢回来的！`,
        expr: "pout",
      };
    case "companion_win":
      return {
        text: `（开心得晃着小腿拍手）连成线啦！诶嘿嘿，这局是${companionName}赢啦~ ${userNickname}不准赖皮哦，要给我奖励！`,
        expr: "blush",
      };
    case "draw":
      return {
        text: `（看着棋盘叹了口气）竟然平局了！我们俩也太心有灵犀、棋逢对手了吧~`,
        expr: "smile",
      };
  }
}

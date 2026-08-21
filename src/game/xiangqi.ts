export type PieceColor = "red" | "black";
export type PieceType = "k" | "a" | "b" | "n" | "r" | "c" | "p"; // king, advisor, bishop, knight, rook, cannon, pawn

export interface XiangqiPiece {
  color: PieceColor;
  type: PieceType;
}

export type XiangqiBoard = (XiangqiPiece | null)[][]; // 10 rows x 9 cols

export interface XiangqiMove {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  captured?: XiangqiPiece | null;
}

export const PIECE_LABELS: Record<PieceColor, Record<PieceType, string>> = {
  red: {
    k: "帅",
    a: "仕",
    b: "相",
    n: "马",
    r: "车",
    c: "炮",
    p: "兵",
  },
  black: {
    k: "将",
    a: "士",
    b: "象",
    n: "马",
    r: "车",
    c: "炮",
    p: "卒",
  },
};

// Initial 10x9 board
export function createInitialXiangqiBoard(): XiangqiBoard {
  const b: XiangqiBoard = Array.from({ length: 10 }, () => Array(9).fill(null));

  // Red at bottom (rows 6-9), Black at top (rows 0-3)
  // Black pieces (row 0, 2, 3)
  b[0][0] = { color: "black", type: "r" };
  b[0][1] = { color: "black", type: "n" };
  b[0][2] = { color: "black", type: "b" };
  b[0][3] = { color: "black", type: "a" };
  b[0][4] = { color: "black", type: "k" };
  b[0][5] = { color: "black", type: "a" };
  b[0][6] = { color: "black", type: "b" };
  b[0][7] = { color: "black", type: "n" };
  b[0][8] = { color: "black", type: "r" };

  b[2][1] = { color: "black", type: "c" };
  b[2][7] = { color: "black", type: "c" };

  b[3][0] = { color: "black", type: "p" };
  b[3][2] = { color: "black", type: "p" };
  b[3][4] = { color: "black", type: "p" };
  b[3][6] = { color: "black", type: "p" };
  b[3][8] = { color: "black", type: "p" };

  // Red pieces (row 9, 7, 6)
  b[9][0] = { color: "red", type: "r" };
  b[9][1] = { color: "red", type: "n" };
  b[9][2] = { color: "red", type: "b" };
  b[9][3] = { color: "red", type: "a" };
  b[9][4] = { color: "red", type: "k" };
  b[9][5] = { color: "red", type: "a" };
  b[9][6] = { color: "red", type: "b" };
  b[9][7] = { color: "red", type: "n" };
  b[9][8] = { color: "red", type: "r" };

  b[7][1] = { color: "red", type: "c" };
  b[7][7] = { color: "red", type: "c" };

  b[6][0] = { color: "red", type: "p" };
  b[6][2] = { color: "red", type: "p" };
  b[6][4] = { color: "red", type: "p" };
  b[6][6] = { color: "red", type: "p" };
  b[6][8] = { color: "red", type: "p" };

  return b;
}

// Check if (r, c) is inside Palace
export function isInsidePalace(r: number, c: number, color: PieceColor): boolean {
  if (c < 3 || c > 5) return false;
  if (color === "red") return r >= 7 && r <= 9;
  return r >= 0 && r <= 2;
}

// Generate legal moves for a piece at (r, c)
export function getLegalXiangqiMoves(board: XiangqiBoard, r: number, c: number): XiangqiMove[] {
  const piece = board[r][c];
  if (!piece) return [];

  const moves: XiangqiMove[] = [];
  const color = piece.color;
  const isRed = color === "red";

  const addMove = (tr: number, tc: number) => {
    if (tr < 0 || tr >= 10 || tc < 0 || tc >= 9) return;
    const dest = board[tr][tc];
    if (dest && dest.color === color) return; // Cannot capture own piece
    moves.push({ fromR: r, fromC: c, toR: tr, toC: tc, captured: dest });
  };

  switch (piece.type) {
    case "k": { // King (帅/将)
      const deltas = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of deltas) {
        const tr = r + dr;
        const tc = c + dc;
        if (isInsidePalace(tr, tc, color)) {
          addMove(tr, tc);
        }
      }
      // Flying General rule (将帅直接照面)
      const step = isRed ? -1 : 1;
      let tr = r + step;
      while (tr >= 0 && tr < 10) {
        const dest = board[tr][c];
        if (dest) {
          if (dest.type === "k" && dest.color !== color) {
            moves.push({ fromR: r, fromC: c, toR: tr, toC: c, captured: dest });
          }
          break;
        }
        tr += step;
      }
      break;
    }
    case "a": { // Advisor (仕/士) - diagonal inside palace
      const deltas = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of deltas) {
        const tr = r + dr;
        const tc = c + dc;
        if (isInsidePalace(tr, tc, color)) {
          addMove(tr, tc);
        }
      }
      break;
    }
    case "b": { // Bishop (相/象) - 2 diagonal steps, cannot cross river, check eye
      const deltas = [
        { dr: 2, dc: 2, eyeR: 1, eyeC: 1 },
        { dr: 2, dc: -2, eyeR: 1, eyeC: -1 },
        { dr: -2, dc: 2, eyeR: -1, eyeC: 1 },
        { dr: -2, dc: -2, eyeR: -1, eyeC: -1 },
      ];
      for (const { dr, dc, eyeR, eyeC } of deltas) {
        const tr = r + dr;
        const tc = c + dc;
        if (tr < 0 || tr >= 10 || tc < 0 || tc >= 9) continue;
        // River boundary
        if (isRed && tr < 5) continue;
        if (!isRed && tr > 4) continue;
        // Check elephant eye
        if (board[r + eyeR][c + eyeC] !== null) continue;
        addMove(tr, tc);
      }
      break;
    }
    case "n": { // Knight (马) - 8 L-shapes with hobble leg
      const deltas = [
        { dr: -2, dc: -1, legR: -1, legC: 0 },
        { dr: -2, dc: 1, legR: -1, legC: 0 },
        { dr: 2, dc: -1, legR: 1, legC: 0 },
        { dr: 2, dc: 1, legR: 1, legC: 0 },
        { dr: -1, dc: -2, legR: 0, legC: -1 },
        { dr: 1, dc: -2, legR: 0, legC: -1 },
        { dr: -1, dc: 2, legR: 0, legC: 1 },
        { dr: 1, dc: 2, legR: 0, legC: 1 },
      ];
      for (const { dr, dc, legR, legC } of deltas) {
        const tr = r + dr;
        const tc = c + dc;
        if (tr < 0 || tr >= 10 || tc < 0 || tc >= 9) continue;
        // Hobble check
        if (board[r + legR][c + legC] !== null) continue;
        addMove(tr, tc);
      }
      break;
    }
    case "r": { // Rook (车) - orthogonal straight lines
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        let tr = r + dr;
        let tc = c + dc;
        while (tr >= 0 && tr < 10 && tc >= 0 && tc < 9) {
          const dest = board[tr][tc];
          if (!dest) {
            addMove(tr, tc);
          } else {
            if (dest.color !== color) addMove(tr, tc);
            break;
          }
          tr += dr;
          tc += dc;
        }
      }
      break;
    }
    case "c": { // Cannon (炮) - jump over exactly 1 piece to capture
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      for (const [dr, dc] of dirs) {
        let tr = r + dr;
        let tc = c + dc;
        let jumped = false;
        while (tr >= 0 && tr < 10 && tc >= 0 && tc < 9) {
          const dest = board[tr][tc];
          if (!jumped) {
            if (!dest) {
              addMove(tr, tc);
            } else {
              jumped = true; // Found screen/platform
            }
          } else {
            if (dest) {
              if (dest.color !== color) addMove(tr, tc);
              break;
            }
          }
          tr += dr;
          tc += dc;
        }
      }
      break;
    }
    case "p": { // Pawn (兵/卒)
      const forward = isRed ? -1 : 1;
      const crossedRiver = isRed ? r <= 4 : r >= 5;

      // Forward step
      addMove(r + forward, c);

      // Horizontal steps once across river
      if (crossedRiver) {
        addMove(r, c - 1);
        addMove(r, c + 1);
      }
      break;
    }
  }

  return moves;
}

// Get all legal moves for a player color
export function getAllXiangqiMoves(board: XiangqiBoard, color: PieceColor): XiangqiMove[] {
  const allMoves: XiangqiMove[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        allMoves.push(...getLegalXiangqiMoves(board, r, c));
      }
    }
  }
  return allMoves;
}

// Piece valuation for AI
const PIECE_VALUES: Record<PieceType, number> = {
  k: 10000,
  r: 1000,
  c: 450,
  n: 400,
  b: 200,
  a: 200,
  p: 100,
};

// Check if King of color is currently attacked
export function isXiangqiCheck(board: XiangqiBoard, color: PieceColor): boolean {
  // Find King
  let kingR = -1;
  let kingC = -1;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === "k") {
        kingR = r;
        kingC = c;
        break;
      }
    }
  }
  if (kingR === -1) return true; // King dead

  const opponent = color === "red" ? "black" : "red";
  const opponentMoves = getAllXiangqiMoves(board, opponent);
  return opponentMoves.some((m) => m.toR === kingR && m.toC === kingC);
}

// AI Engine: compute best move for Black (Companion)
export function getBestXiangqiMove(board: XiangqiBoard, difficulty: "easy" | "smart" = "smart"): XiangqiMove | null {
  const moves = getAllXiangqiMoves(board, "black");
  if (moves.length === 0) return null;

  let bestScore = -Infinity;
  const topMoves: XiangqiMove[] = [];

  for (const m of moves) {
    let score = 0;

    // Direct capture value
    if (m.captured) {
      score += (PIECE_VALUES[m.captured.type] || 0) * 1.5;
    }

    // Positional forward progression for pawns & knights
    const piece = board[m.fromR][m.fromC];
    if (piece?.type === "p") {
      score += m.toR * 15; // Closer to bottom red side
    } else if (piece?.type === "r" || piece?.type === "c") {
      score += 20; // Active major piece
    }

    // Apply move virtually
    board[m.toR][m.toC] = piece;
    board[m.fromR][m.fromC] = null;

    // Check if move gives "Check!" (将军)
    if (isXiangqiCheck(board, "red")) {
      score += 300;
    }

    // Check if move leaves own king under attack (suicide / danger)
    if (isXiangqiCheck(board, "black")) {
      score -= 5000;
    }

    // Revert virtual move
    board[m.fromR][m.fromC] = piece;
    board[m.toR][m.toC] = m.captured || null;

    // Add jitter for natural gameplay
    const jitter = difficulty === "smart" ? Math.random() * 20 : Math.random() * 80;
    score += jitter;

    if (score > bestScore) {
      bestScore = score;
      topMoves.length = 0;
      topMoves.push(m);
    } else if (Math.abs(score - bestScore) < 5) {
      topMoves.push(m);
    }
  }

  if (topMoves.length === 0) return moves[0];
  return topMoves[Math.floor(Math.random() * topMoves.length)];
}

// Generate companion commentary for Xiangqi events
export function getXiangqiCommentary(
  event: "start" | "player_capture" | "companion_capture" | "player_check" | "companion_check" | "player_win" | "companion_win",
  companionName: string,
  userNickname: string,
  pieceName?: string
): { text: string; expr: "smile" | "blush" | "shy" | "pout" | "surprised" } {
  switch (event) {
    case "start":
      return {
        text: `（端坐摆开楚河汉界）${userNickname}执红先走哦！马走日、象走田，我今天可是熟读棋谱的！`,
        expr: "smile",
      };
    case "player_check":
      return {
        text: `（倒吸一口凉气，手忙脚乱按住帅旗）将…将军？！${userNickname}什么时候架好大炮的…容我想想怎么解！`,
        expr: "surprised",
      };
    case "companion_check":
      return {
        text: `（得意地拍下一子，眉开眼笑）将军啦！${userNickname}快接招，看你的老帅往哪里躲~`,
        expr: "blush",
      };
    case "player_capture":
      return {
        text: `（心疼地看着被吃掉的${pieceName || "棋子"}，鼓起小脸）呜…我的${pieceName || "棋子"}！${userNickname}下棋真是一点都不留情~`,
        expr: "pout",
      };
    case "companion_capture":
      return {
        text: `（开心地收下战利品）嘿嘿，你的${pieceName || "棋子"}归我啦！大局正在向我倾斜哦~`,
        expr: "smile",
      };
    case "player_win":
      return {
        text: `（放下棋子，佩服地看着你）绝杀了…${userNickname}的排兵布阵太精妙了，这盘我心服口服啦！`,
        expr: "shy",
      };
    case "companion_win":
      return {
        text: `（兴奋地拍手晃着脑袋）耶！将死啦~ 这一盘是${companionName}赢咯！${userNickname}要履行承诺夸夸我！`,
        expr: "blush",
      };
  }
}

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import type { XiangqiBoard, XiangqiMove } from "../src/game/xiangqi.js";

export type XiangqiDifficulty = "easy" | "smart" | "hard";

const pieceToFen = {
  red: { k: "K", a: "A", b: "B", n: "N", r: "R", c: "C", p: "P" },
  black: { k: "k", a: "a", b: "b", n: "n", r: "r", c: "c", p: "p" },
} as const;

export function boardToFen(board: XiangqiBoard, turn: "red" | "black" = "black"): string {
  const placement = board.map((row) => {
    let value = "";
    let empty = 0;
    row.forEach((piece) => {
      if (!piece) {
        empty += 1;
        return;
      }
      if (empty) value += String(empty);
      empty = 0;
      value += pieceToFen[piece.color][piece.type];
    });
    if (empty) value += String(empty);
    return value;
  }).join("/");
  return `${placement} ${turn === "red" ? "w" : "b"} - - 0 1`;
}

export function uciToMove(uci: string, board: XiangqiBoard): XiangqiMove | null {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(uci)) return null;
  const fromC = uci.charCodeAt(0) - 97;
  const fromR = 9 - Number(uci[1]);
  const toC = uci.charCodeAt(2) - 97;
  const toR = 9 - Number(uci[3]);
  if (!board[fromR]?.[fromC]) return null;
  return { fromR, fromC, toR, toC, captured: board[toR][toC] };
}

class PikafishEngine {
  private process: ChildProcessWithoutNullStreams | null = null;
  private output = "";
  private queue: Promise<unknown> = Promise.resolve();

  get configured(): boolean {
    const executable = process.env.PIKAFISH_PATH?.trim();
    return Boolean(executable && fs.existsSync(executable));
  }

  async bestMove(board: XiangqiBoard, difficulty: XiangqiDifficulty): Promise<XiangqiMove> {
    const task = this.queue.then(() => this.runSearch(board, difficulty));
    this.queue = task.catch(() => undefined);
    return task;
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) return this.process;
    const executable = process.env.PIKAFISH_PATH?.trim();
    if (!executable || !fs.existsSync(executable)) throw new Error("Pikafish 尚未安装或 PIKAFISH_PATH 无效。");
    const child = spawn(executable, [], { cwd: process.env.PIKAFISH_WORKDIR || undefined, windowsHide: true });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { this.output += chunk; });
    child.stderr.on("data", (chunk: Buffer) => { console.warn(`[pikafish] ${chunk.toString().trim()}`); });
    child.once("exit", () => { if (this.process === child) this.process = null; });
    this.process = child;
    return child;
  }

  private waitFor(pattern: RegExp, timeoutMs: number): Promise<RegExpMatchArray> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const match = this.output.match(pattern);
        if (match) { resolve(match); return; }
        if (!this.process || this.process.killed) { reject(new Error("Pikafish 进程已退出。")); return; }
        if (Date.now() - started >= timeoutMs) { reject(new Error("Pikafish 思考超时。")); return; }
        setTimeout(poll, 10);
      };
      poll();
    });
  }

  private async runSearch(board: XiangqiBoard, difficulty: XiangqiDifficulty): Promise<XiangqiMove> {
    const child = this.start();
    this.output = "";
    child.stdin.write("uci\n");
    await this.waitFor(/uciok/, 5_000);
    this.output = "";
    child.stdin.write("isready\n");
    await this.waitFor(/readyok/, 10_000);
    this.output = "";
    child.stdin.write(`position fen ${boardToFen(board)}\n`);
    const moveTime = difficulty === "easy" ? 80 : difficulty === "hard" ? 800 : 300;
    child.stdin.write(`go movetime ${moveTime}\n`);
    const match = await this.waitFor(/bestmove\s+([a-i][0-9][a-i][0-9])/, moveTime + 5_000);
    const move = uciToMove(match[1], board);
    if (!move) throw new Error(`Pikafish 返回了无法识别的走法：${match[1]}`);
    return move;
  }
}

export const pikafish = new PikafishEngine();

import test from "node:test";
import assert from "node:assert/strict";
import { createInitialXiangqiBoard } from "../src/game/xiangqi.js";
import { boardToFen, uciToMove } from "../server/pikafish.js";

test("serializes initial Xiangqi board to Pikafish FEN", () => {
  assert.equal(boardToFen(createInitialXiangqiBoard()), "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b - - 0 1");
});

test("maps Pikafish coordinates to board coordinates", () => {
  const board = createInitialXiangqiBoard();
  assert.deepEqual(uciToMove("b9c7", board), { fromR: 0, fromC: 1, toR: 2, toC: 2, captured: null });
});

import { useState } from "react";
import { useStore } from "@/store/companionStore";
import { Avatar } from "@/components/Avatar";
import { EXPRESSION_MAP } from "@/lib/messageParser";

// Games Engines
import {
  type BoardCell,
  type GameWinner,
  type GomokuMove,
  createEmptyBoard,
  checkWin,
  isBoardFull,
  getBestGomokuMove,
  getCompanionCommentary,
} from "@/game/gomoku";
import { getQuizOptionReveal, getRandomQuiz, type QuizQuestion } from "@/game/mindMatch";
import {
  type XiangqiBoard,
  type XiangqiMove,
  createInitialXiangqiBoard,
  getLegalXiangqiMoves,
  getBestXiangqiMove,
  isXiangqiCheck,
  getXiangqiCommentary,
  PIECE_LABELS,
} from "@/game/xiangqi";
import {
  type GoBoardState,
  createEmptyGoBoard,
  playGoMove,
  calculateGoScore,
  getBestGoMove,
  getGoCommentary,
} from "@/game/go";
import {
  type MemoryCard,
  createMemoryCards,
  getCompanionMemoryMove,
  canFlipMemoryCard,
} from "@/game/memoryMatch";

interface GameZoneScreenProps {
  onBack?: () => void;
}

type ActiveGame = "lobby" | "gomoku" | "tictactoe" | "mindmatch" | "xiangqi" | "go" | "memorymatch";
type LobbyCategory = "all" | "chess" | "casual" | "heart";

export function GameZoneScreen({ onBack }: GameZoneScreenProps) {
  const profile = useStore((s) => s.profile);
  const companionName = profile.name || "妹妹";
  const userNickname = profile.userNickname || "哥哥";
  const activeSkin = useStore((s) => s.activeSkin);
  const mood = useStore((s) => s.mood);
  const affinity = useStore((s) => s.affinity);
  const points = useStore((s) => s.points);
  const todayGamesCount = useStore((s) => s.todayGamesCount || 0);
  const finishGameMatch = useStore((s) => s.finishGameMatch);
  const speakDirectText = useStore((s) => s.speakDirectText);
  const ttsSettings = useStore((s) => s.ttsSettings);

  const [activeGame, setActiveGame] = useState<ActiveGame>("lobby");
  const [lobbyCategory, setLobbyCategory] = useState<LobbyCategory>("all");
  const [difficulty, setDifficulty] = useState<"smart" | "easy">("smart");

  // Companion Commentary state
  const [bubbleText, setBubbleText] = useState<string>(
    () => `（认真摆好桌椅）${userNickname}，今天想和我切磋哪种棋艺或游戏呀？`
  );
  const [bubbleExpr, setBubbleExpr] = useState<"smile" | "blush" | "shy" | "pout" | "surprised">("smile");

  // 1. Gomoku & TicTacToe States
  const [boardSize, setBoardSize] = useState<number>(15);
  const [grid, setGrid] = useState<BoardCell[][]>(() => createEmptyBoard(15).grid);
  const [history, setHistory] = useState<GomokuMove[]>([]);
  const [lastMove, setLastMove] = useState<GomokuMove | null>(null);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1); // 1: Player (Black), 2: Companion (White)
  const [winner, setWinner] = useState<GameWinner>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // 2. Xiangqi States
  const [xiangqiBoard, setXiangqiBoard] = useState<XiangqiBoard>(() => createInitialXiangqiBoard());
  const [selectedPiecePos, setSelectedPiecePos] = useState<{ r: number; c: number } | null>(null);
  const [legalMoves, setLegalMoves] = useState<XiangqiMove[]>([]);
  const [xiangqiTurn, setXiangqiTurn] = useState<"red" | "black">("red"); // red: player, black: companion
  const [xiangqiLastMove, setXiangqiLastMove] = useState<XiangqiMove | null>(null);
  const [xiangqiWinner, setXiangqiWinner] = useState<"red" | "black" | "draw" | null>(null);

  // 3. Go (Weiqi) States
  const [goState, setGoState] = useState<GoBoardState>(() => createEmptyGoBoard(9));
  const [goTurn, setGoTurn] = useState<1 | 2>(1); // 1: Black (Player), 2: White (Companion)
  const [goWinner, setGoWinner] = useState<"black" | "white" | null>(null);
  const [goScoreResult, setGoScoreResult] = useState<string | null>(null);

  // 4. Mind Match States
  const [quizList, setQuizList] = useState<QuizQuestion[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<"A" | "B" | null>(null);

  // 5. Memory Match States
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [knownMemory, setKnownMemory] = useState<Map<number, string>>(new Map());
  const [playerScore, setPlayerScore] = useState(0);
  const [companionScore, setCompanionScore] = useState(0);
  const [memoryTurn, setMemoryTurn] = useState<"player" | "companion">("player");

  // Settlement Result Modal State
  const [settlement, setSettlement] = useState<{
    title: string;
    result: "win" | "lose" | "draw";
    affinityGain: number;
    moodGain: number;
    pointsGain: number;
    notice: string;
  } | null>(null);

  const setCompanionSpeech = (text: string, expr: "smile" | "blush" | "shy" | "pout" | "surprised") => {
    setBubbleText(text);
    setBubbleExpr(expr);
    if (ttsSettings.autoPlay) {
      const clean = text.replace(/（[^）]*）|\([^)]*\)/g, "").trim() || text;
      void speakDirectText(clean);
    }
  };

  // =================== INIT HANDLERS ===================
  const initGomoku = (size = 15) => {
    setBoardSize(size);
    setGrid(createEmptyBoard(size).grid);
    setHistory([]);
    setLastMove(null);
    setCurrentTurn(1);
    setWinner(null);
    setIsAiThinking(false);
    setActiveGame("gomoku");
    const comm = getCompanionCommentary("start", companionName, userNickname);
    setCompanionSpeech(comm.text, comm.expr);
  };

  const initTicTacToe = () => {
    setBoardSize(3);
    setGrid(createEmptyBoard(3).grid);
    setHistory([]);
    setLastMove(null);
    setCurrentTurn(1);
    setWinner(null);
    setIsAiThinking(false);
    setActiveGame("tictactoe");
    setCompanionSpeech(`（画好 3×3 棋格）30秒快节奏对决！${userNickname}执 X 先走哦~`, "smile");
  };

  const initXiangqi = () => {
    setXiangqiBoard(createInitialXiangqiBoard());
    setSelectedPiecePos(null);
    setLegalMoves([]);
    setXiangqiTurn("red");
    setXiangqiLastMove(null);
    setXiangqiWinner(null);
    setIsAiThinking(false);
    setActiveGame("xiangqi");
    const comm = getXiangqiCommentary("start", companionName, userNickname);
    setCompanionSpeech(comm.text, comm.expr);
  };

  const initGo = (size = 9) => {
    setGoState(createEmptyGoBoard(size));
    setGoTurn(1);
    setGoWinner(null);
    setGoScoreResult(null);
    setIsAiThinking(false);
    setActiveGame("go");
    const comm = getGoCommentary("start", companionName, userNickname);
    setCompanionSpeech(comm.text, comm.expr);
  };

  const initMindMatch = () => {
    const questions = getRandomQuiz(5);
    setQuizList(questions);
    setQuizIdx(0);
    setMatchedCount(0);
    setSelectedOpt(null);
    setActiveGame("mindmatch");
    setCompanionSpeech(`（托着下巴期待地看着你）来测测我们之间有多心有灵犀吧！凭第一感觉选哦~`, "shy");
  };

  const initMemoryMatch = () => {
    setMemoryCards(createMemoryCards());
    setFlippedIndices([]);
    setKnownMemory(new Map());
    setPlayerScore(0);
    setCompanionScore(0);
    setMemoryTurn("player");
    setIsAiThinking(false);
    setActiveGame("memorymatch");
    setCompanionSpeech(`（把16张甜心卡片扣在桌上）翻到相同图案就算一对哦！看看谁的记忆力更好~`, "smile");
  };

  // =================== GOMOKU / TICTACTOE MOVE ===================
  const handlePlayerGomokuMove = (r: number, c: number) => {
    if (winner !== null || currentTurn !== 1 || isAiThinking || grid[r][c] !== 0) return;

    const newGrid = grid.map((row) => [...row]);
    newGrid[r][c] = 1;
    const move: GomokuMove = { r, c };
    const newHistory = [...history, move];

    setGrid(newGrid);
    setLastMove(move);
    setHistory(newHistory);

    const gameType: "gomoku" | "tictactoe" = activeGame === "tictactoe" ? "tictactoe" : "gomoku";
    const winLength = gameType === "tictactoe" ? 3 : 5;

    if (checkWin(newGrid, boardSize, r, c, 1, winLength)) {
      setWinner(1);
      const comm = getCompanionCommentary("player_win", companionName, userNickname);
      setCompanionSpeech(comm.text, comm.expr);
      void handleGameSettlement(gameType, "win", `共对弈 ${newHistory.length} 步`);
      return;
    }

    if (isBoardFull(newGrid, boardSize)) {
      setWinner("draw");
      const comm = getCompanionCommentary("draw", companionName, userNickname);
      setCompanionSpeech(comm.text, comm.expr);
      void handleGameSettlement(gameType, "draw", "棋盘下满平局");
      return;
    }

    setCurrentTurn(2);
    setIsAiThinking(true);

    if (Math.random() < 0.35) {
      const comm = getCompanionCommentary("player_move", companionName, userNickname);
      setCompanionSpeech(comm.text, comm.expr);
    }

    const thinkDelay = gameType === "tictactoe" ? 400 : 550 + Math.random() * 300;
    setTimeout(() => {
      const aiMove = getBestGomokuMove(newGrid, boardSize, difficulty);
      if (!aiMove) {
        setWinner("draw");
        return;
      }

      newGrid[aiMove.r][aiMove.c] = 2;
      const updatedHistory = [...newHistory, aiMove];
      setGrid(newGrid);
      setLastMove(aiMove);
      setHistory(updatedHistory);
      setIsAiThinking(false);

      if (checkWin(newGrid, boardSize, aiMove.r, aiMove.c, 2, winLength)) {
        setWinner(2);
        const comm = getCompanionCommentary("companion_win", companionName, userNickname);
        setCompanionSpeech(comm.text, comm.expr);
        void handleGameSettlement(gameType, "lose", `第 ${updatedHistory.length} 步决胜`);
        return;
      }

      if (isBoardFull(newGrid, boardSize)) {
        setWinner("draw");
        const comm = getCompanionCommentary("draw", companionName, userNickname);
        setCompanionSpeech(comm.text, comm.expr);
        void handleGameSettlement(gameType, "draw", "棋局下满平局");
        return;
      }

      setCurrentTurn(1);
    }, thinkDelay);
  };

  const handleGomokuUndo = () => {
    if (winner !== null || history.length < 2 || isAiThinking) return;
    const newHistory = history.slice(0, -2);
    const newGrid = createEmptyBoard(boardSize).grid;
    newHistory.forEach((m, idx) => {
      newGrid[m.r][m.c] = idx % 2 === 0 ? 1 : 2;
    });
    setGrid(newGrid);
    setHistory(newHistory);
    setLastMove(newHistory.length > 0 ? newHistory[newHistory.length - 1] : null);
    setCurrentTurn(1);
    setCompanionSpeech(`（歪着头笑）欸~ 下棋不许耍赖哦！不过看在是${userNickname}的面子上，就让你悔一步吧~`, "pout");
  };

  // =================== XIANGQI MOVE ===================
  const handleXiangqiCellClick = (r: number, c: number) => {
    if (xiangqiWinner !== null || xiangqiTurn !== "red" || isAiThinking) return;

    const clickedPiece = xiangqiBoard[r][c];

    // If already selected a piece, check if (r, c) is a legal destination
    if (selectedPiecePos) {
      const matchMove = legalMoves.find((m) => m.toR === r && m.toC === c);
      if (matchMove) {
        // Execute player move
        const newBoard = xiangqiBoard.map((row) => [...row]);
        const movingPiece = newBoard[selectedPiecePos.r][selectedPiecePos.c];
        newBoard[r][c] = movingPiece;
        newBoard[selectedPiecePos.r][selectedPiecePos.c] = null;

        setXiangqiBoard(newBoard);
        setXiangqiLastMove(matchMove);
        setSelectedPiecePos(null);
        setLegalMoves([]);

        // Check if captured King
        if (matchMove.captured?.type === "k") {
          setXiangqiWinner("red");
          const comm = getXiangqiCommentary("player_win", companionName, userNickname);
          setCompanionSpeech(comm.text, comm.expr);
          void handleGameSettlement("xiangqi", "win", "将死黑将");
          return;
        }

        // Check if player gave Check!
        if (isXiangqiCheck(newBoard, "black")) {
          const comm = getXiangqiCommentary("player_check", companionName, userNickname);
          setCompanionSpeech(comm.text, comm.expr);
        } else if (matchMove.captured) {
          const pieceName = PIECE_LABELS.black[matchMove.captured.type];
          const comm = getXiangqiCommentary("player_capture", companionName, userNickname, pieceName);
          setCompanionSpeech(comm.text, comm.expr);
        }

        // Switch to AI turn
        setXiangqiTurn("black");
        setIsAiThinking(true);

        setTimeout(() => {
          const aiMove = getBestXiangqiMove(newBoard, difficulty);
          if (!aiMove) {
            setXiangqiWinner("red");
            return;
          }

          const aiPiece = newBoard[aiMove.fromR][aiMove.fromC];
          newBoard[aiMove.toR][aiMove.toC] = aiPiece;
          newBoard[aiMove.fromR][aiMove.fromC] = null;

          setXiangqiBoard(newBoard);
          setXiangqiLastMove(aiMove);
          setIsAiThinking(false);

          if (aiMove.captured?.type === "k") {
            setXiangqiWinner("black");
            const comm = getXiangqiCommentary("companion_win", companionName, userNickname);
            setCompanionSpeech(comm.text, comm.expr);
            void handleGameSettlement("xiangqi", "lose", "红帅被将死");
            return;
          }

          if (isXiangqiCheck(newBoard, "red")) {
            const comm = getXiangqiCommentary("companion_check", companionName, userNickname);
            setCompanionSpeech(comm.text, comm.expr);
          } else if (aiMove.captured) {
            const pieceName = PIECE_LABELS.red[aiMove.captured.type];
            const comm = getXiangqiCommentary("companion_capture", companionName, userNickname, pieceName);
            setCompanionSpeech(comm.text, comm.expr);
          }

          setXiangqiTurn("red");
        }, 600);
        return;
      }
    }

    // Otherwise, select piece if it's red (player)
    if (clickedPiece && clickedPiece.color === "red") {
      setSelectedPiecePos({ r, c });
      setLegalMoves(getLegalXiangqiMoves(xiangqiBoard, r, c));
    } else {
      setSelectedPiecePos(null);
      setLegalMoves([]);
    }
  };

  // =================== GO (WEIQI) MOVE ===================
  const handleGoCellClick = (r: number, c: number) => {
    if (goWinner !== null || goTurn !== 1 || isAiThinking) return;

    const playResult = playGoMove(goState, r, c, 1);
    if (!playResult) return; // Illegal move

    const { nextState, capturedCount } = playResult;
    setGoState(nextState);

    if (capturedCount > 0) {
      const comm = getGoCommentary("player_capture", companionName, userNickname, capturedCount);
      setCompanionSpeech(comm.text, comm.expr);
    }

    setGoTurn(2);
    setIsAiThinking(true);

    setTimeout(() => {
      const aiMove = getBestGoMove(nextState, difficulty);
      if (aiMove === "pass") {
        const passState: GoBoardState = {
          ...nextState,
          consecutivePasses: nextState.consecutivePasses + 1,
        };
        setGoState(passState);
        setIsAiThinking(false);
        const comm = getGoCommentary("companion_pass", companionName, userNickname);
        setCompanionSpeech(comm.text, comm.expr);

        if (passState.consecutivePasses >= 2) {
          // Double pass -> End game & calculate score
          finishGoGame(passState);
          return;
        }

        setGoTurn(1);
        return;
      }

      const aiRes = playGoMove(nextState, aiMove.r, aiMove.c, 2);
      if (aiRes) {
        setGoState(aiRes.nextState);
        if (aiRes.capturedCount > 0) {
          const comm = getGoCommentary("companion_capture", companionName, userNickname, aiRes.capturedCount);
          setCompanionSpeech(comm.text, comm.expr);
        }
      }

      setIsAiThinking(false);
      setGoTurn(1);
    }, 600);
  };

  const handleGoPass = () => {
    if (goWinner !== null || goTurn !== 1 || isAiThinking) return;
    const nextState: GoBoardState = {
      ...goState,
      consecutivePasses: goState.consecutivePasses + 1,
    };
    setGoState(nextState);

    if (nextState.consecutivePasses >= 2) {
      finishGoGame(nextState);
      return;
    }

    // AI turn
    setGoTurn(2);
    setIsAiThinking(true);
    setTimeout(() => {
      const aiMove = getBestGoMove(nextState, difficulty);
      if (aiMove === "pass") {
        const finalState = { ...nextState, consecutivePasses: nextState.consecutivePasses + 1 };
        setGoState(finalState);
        setIsAiThinking(false);
        finishGoGame(finalState);
      } else {
        const aiRes = playGoMove(nextState, aiMove.r, aiMove.c, 2);
        if (aiRes) setGoState(aiRes.nextState);
        setIsAiThinking(false);
        setGoTurn(1);
      }
    }, 600);
  };

  const finishGoGame = (state: GoBoardState) => {
    const score = calculateGoScore(state);
    const isBlackWin = score.winner === "black";
    setGoWinner(score.winner);
    setGoScoreResult(
      `黑方(你): ${score.blackTotal.toFixed(1)} 目（围空 ${score.blackTerritory} + 提子 ${state.capturesBlack}） vs 白方: ${score.whiteTotal.toFixed(1)} 目（围空 ${score.whiteTerritory} + 提子 ${state.capturesWhite} + 贴目 3.5）`
    );
    const comm = isBlackWin
      ? getGoCommentary("player_win", companionName, userNickname)
      : getGoCommentary("companion_win", companionName, userNickname);
    setCompanionSpeech(comm.text, comm.expr);
    void handleGameSettlement("go", isBlackWin ? "win" : "lose", `胜出 ${score.diff.toFixed(1)} 目`);
  };

  // =================== MEMORY MATCH MOVE ===================
  const handleMemoryCardClick = (idx: number) => {
    if (!canFlipMemoryCard(memoryCards, flippedIndices, idx, memoryTurn, isAiThinking)) return;

    const card = memoryCards[idx];
    const newKnown = new Map(knownMemory);
    newKnown.set(idx, card.icon);
    setKnownMemory(newKnown);

    const nextFlipped = [...flippedIndices, idx];
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      setIsAiThinking(true);
      const [idx1, idx2] = nextFlipped;
      const card1 = memoryCards[idx1];
      const card2 = memoryCards[idx2];

      if (card1.icon === card2.icon) {
        // Matched!
        setTimeout(() => {
          const updatedCards = memoryCards.map((c, i) =>
            i === idx1 || i === idx2 ? { ...c, matched: true } : c
          );
          setMemoryCards(updatedCards);
          setFlippedIndices([]);
          setIsAiThinking(false);
          const nextScore = playerScore + 1;
          setPlayerScore(nextScore);
          setCompanionSpeech(`（赞叹地鼓掌）哇！找到了「${card1.label}」！${userNickname}好眼力，再翻一次吧~`, "blush");

          // Check if all matched
          if (updatedCards.every((c) => c.matched)) {
            finishMemoryMatch(nextScore, companionScore);
          }
        }, 700);
      } else {
        // Mismatch -> Switch to AI
        setTimeout(() => {
          setFlippedIndices([]);
          setMemoryTurn("companion");
          runAiMemoryTurn(memoryCards, newKnown, playerScore, companionScore);
        }, 1100);
      }
    }
  };

  const runAiMemoryTurn = (
    currentCards: MemoryCard[],
    known: Map<number, string>,
    pScore: number,
    cScore: number
  ) => {
    setTimeout(() => {
      const move1 = getCompanionMemoryMove(currentCards, known, null);
      const card1 = currentCards[move1];
      known.set(move1, card1.icon);
      setKnownMemory(new Map(known));
      setFlippedIndices([move1]);

      setTimeout(() => {
        const move2 = getCompanionMemoryMove(currentCards, known, move1);
        const card2 = currentCards[move2];
        known.set(move2, card2.icon);
        setKnownMemory(new Map(known));
        setFlippedIndices([move1, move2]);

        if (card1.icon === card2.icon) {
          // AI Match!
          setTimeout(() => {
            const updatedCards = currentCards.map((c, i) =>
              i === move1 || i === move2 ? { ...c, matched: true } : c
            );
            setMemoryCards(updatedCards);
            setFlippedIndices([]);
            const nextCScore = cScore + 1;
            setCompanionScore(nextCScore);
            setCompanionSpeech(`（开心地晃着卡片）配对成功！这对我收下啦~`, "smile");

            if (updatedCards.every((c) => c.matched)) {
              setIsAiThinking(false);
              finishMemoryMatch(pScore, nextCScore);
            } else {
              // AI extra turn
              runAiMemoryTurn(updatedCards, known, pScore, nextCScore);
            }
          }, 800);
        } else {
          // AI Mismatch -> Switch to Player
          setTimeout(() => {
            setFlippedIndices([]);
            setIsAiThinking(false);
            setMemoryTurn("player");
            setCompanionSpeech(`（歪头笑笑）哎呀没对上，轮到${userNickname}翻牌啦~`, "shy");
          }, 1100);
        }
      }, 700);
    }, 600);
  };

  const finishMemoryMatch = (pScore: number, cScore: number) => {
    const result = pScore > cScore ? "win" : pScore < cScore ? "lose" : "draw";
    void handleGameSettlement("memorymatch", result, `你 ${pScore} 分 vs ${companionName} ${cScore} 分`);
  };

  // =================== MIND MATCH MOVE ===================
  const handleQuizSelect = (option: "A" | "B") => {
    if (selectedOpt !== null) return;
    setSelectedOpt(option);

    const cur = quizList[quizIdx];
    const isMatch = option === cur.companionChoice;
    const nextMatchCount = matchedCount + (isMatch ? 1 : 0);
    setMatchedCount(nextMatchCount);

    const reaction = option === "A" ? cur.reactionA : cur.reactionB;
    setCompanionSpeech(
      `（${isMatch ? "开心地拍手跳起来" : "若有所思地点点头"}）${reaction}`,
      isMatch ? "blush" : "smile"
    );

    setTimeout(() => {
      if (quizIdx + 1 < quizList.length) {
        setQuizIdx(quizIdx + 1);
        setSelectedOpt(null);
      } else {
        const matchPercent = Math.round((nextMatchCount / quizList.length) * 100);
        const resultType = matchPercent >= 80 ? "win" : matchPercent >= 50 ? "draw" : "lose";
        void handleGameSettlement(
          "mindmatch",
          resultType,
          `默契指数 ${matchPercent}%（${nextMatchCount}/${quizList.length} 题心灵共鸣）`
        );
      }
    }, 2200);
  };

  // =================== SETTLEMENT ===================
  const handleGameSettlement = async (
    gameType: "gomoku" | "tictactoe" | "mindmatch" | "xiangqi" | "go" | "memorymatch",
    result: "win" | "lose" | "draw",
    detail: string
  ) => {
    const res = await finishGameMatch(gameType, result, detail);
    const gameTitles = {
      gomoku: "经典五子棋",
      tictactoe: "萌趣井字棋",
      xiangqi: "中国象棋",
      go: "经典围棋",
      memorymatch: "记忆翻牌大对决",
      mindmatch: "心灵默契大考验",
    };
    setSettlement({
      title: gameTitles[gameType],
      result,
      affinityGain: res.affinityGain,
      moodGain: res.moodGain,
      pointsGain: res.pointsGain,
      notice: res.notice,
    });
  };

  return (
    <div className="screen game-zone-screen">
      {/* Top Header */}
      <header className="game-zone-header">
        <div className="game-zone-header-left">
          {activeGame !== "lobby" ? (
            <button className="game-back-btn" onClick={() => setActiveGame("lobby")} title="返回游戏大厅">
              ← 返回大厅
            </button>
          ) : onBack ? (
            <button className="game-back-btn" onClick={onBack} title="返回上一页">
              ← 返回
            </button>
          ) : null}
          <div className="game-zone-title-box">
            <h2>🎮 双人娱乐坊</h2>
            <span className="game-zone-subtitle">与{companionName}一起围炉对弈与趣味互动</span>
          </div>
        </div>

        <div className="game-zone-wallet">
          <span>心愿星</span>
          <strong>✦ {points}</strong>
        </div>
      </header>

      {/* Companion Real-time Dialogue Banner */}
      <div className="game-companion-bar">
        <div className="game-companion-avatar-wrap">
          <Avatar name={companionName} skin={activeSkin} size={46} />
          <div className="game-companion-expr-badge">
            {EXPRESSION_MAP[bubbleExpr]?.emoji || "😊"}
          </div>
        </div>
        <div className="game-speech-bubble">
          <div className="game-speech-name">{companionName}</div>
          <div className="game-speech-content">{bubbleText}</div>
        </div>
      </div>

      {/* ================= VIEW 1: LOBBY ================= */}
      {activeGame === "lobby" && (
        <div className="game-lobby-content">
          {/* Daily Status Card */}
          <div className="game-stats-card">
            <div className="game-stat-item">
              <span className="stat-label">今日对局</span>
              <strong className="stat-num">{todayGamesCount} 局</strong>
            </div>
            <div className="game-stat-divider" />
            <div className="game-stat-item">
              <span className="stat-label">当前亲密</span>
              <strong className="stat-num" style={{ color: "#e0245e" }}>❤ {affinity}</strong>
            </div>
            <div className="game-stat-divider" />
            <div className="game-stat-item">
              <span className="stat-label">妹妹心情</span>
              <strong className="stat-num" style={{ color: "#059669" }}>🌸 {mood}/100</strong>
            </div>
          </div>

          {/* Lobby Category Switcher */}
          <div className="game-category-tabs">
            <button
              className={`cat-tab ${lobbyCategory === "all" ? "active" : ""}`}
              onClick={() => setLobbyCategory("all")}
            >
              全部游戏
            </button>
            <button
              className={`cat-tab ${lobbyCategory === "chess" ? "active" : ""}`}
              onClick={() => setLobbyCategory("chess")}
            >
              ♟️ 棋艺博弈
            </button>
            <button
              className={`cat-tab ${lobbyCategory === "casual" ? "active" : ""}`}
              onClick={() => setLobbyCategory("casual")}
            >
              ⚡ 轻松对决
            </button>
            <button
              className={`cat-tab ${lobbyCategory === "heart" ? "active" : ""}`}
              onClick={() => setLobbyCategory("heart")}
            >
              💖 情感互动
            </button>
          </div>

          <div className="game-cards-grid">
            {/* Game 1: Xiangqi */}
            {(lobbyCategory === "all" || lobbyCategory === "chess") && (
              <article className="game-menu-card xiangqi-card">
                <div className="game-card-badge red">国粹经典 🀄</div>
                <div className="game-card-icon">🀄</div>
                <div className="game-card-info">
                  <h3>中国象棋 · 楚河汉界</h3>
                  <p>马走日、象走田、炮翻山！全套标准规则与攻防博弈，伴侣实时叫将与吃子互动。</p>
                  <div className="game-card-rewards">
                    <span className="game-reward-pill">💖 亲密度 +6</span>
                    <span className="game-reward-pill">🌸 心情 +8</span>
                    <span className="game-reward-pill stars">✦ 心愿星 +18</span>
                  </div>
                </div>
                <div className="game-card-actions">
                  <button className="game-play-btn primary" onClick={initXiangqi}>
                    执红对弈 ⚔️
                  </button>
                </div>
              </article>
            )}

            {/* Game 2: Go (Weiqi) */}
            {(lobbyCategory === "all" || lobbyCategory === "chess") && (
              <article className="game-menu-card go-card">
                <div className="game-card-badge black">围炉黑白 ⚫⚪</div>
                <div className="game-card-icon">⚫</div>
                <div className="game-card-info">
                  <h3>经典围棋 · 围炉落子</h3>
                  <p>金角银边草肚皮。支持 9×9 极速死活盘与 13×13 围地盘，气数与提子即时结算。</p>
                  <div className="game-card-rewards">
                    <span className="game-reward-pill">💖 亲密度 +7</span>
                    <span className="game-reward-pill">🌸 心情 +9</span>
                    <span className="game-reward-pill stars">✦ 心愿星 +20</span>
                  </div>
                </div>
                <div className="game-card-actions">
                  <button className="game-play-btn primary" onClick={() => initGo(9)}>
                    9×9 极速盘
                  </button>
                  <button className="game-play-btn secondary" onClick={() => initGo(13)}>
                    13×13 进阶盘
                  </button>
                </div>
              </article>
            )}

            {/* Game 3: Gomoku */}
            {(lobbyCategory === "all" || lobbyCategory === "chess") && (
              <article className="game-menu-card gomoku-card">
                <div className="game-card-badge">最受喜爱 🏆</div>
                <div className="game-card-icon">♟️</div>
                <div className="game-card-info">
                  <h3>经典五子棋 · 围炉对弈</h3>
                  <p>两人在茶几前静心对弈，黑白交错，落子生花。支持 15×15 标准盘与 11×11 休闲盘。</p>
                  <div className="game-card-rewards">
                    <span className="game-reward-pill">💖 亲密度 +5</span>
                    <span className="game-reward-pill">🌸 心情 +8</span>
                    <span className="game-reward-pill stars">✦ 心愿星 +15</span>
                  </div>
                </div>
                <div className="game-card-actions">
                  <button className="game-play-btn primary" onClick={() => initGomoku(15)}>
                    15×15 标准盘
                  </button>
                  <button className="game-play-btn secondary" onClick={() => initGomoku(11)}>
                    11×11 休闲盘
                  </button>
                </div>
              </article>
            )}

            {/* Game 4: Memory Match */}
            {(lobbyCategory === "all" || lobbyCategory === "casual") && (
              <article className="game-menu-card memory-card">
                <div className="game-card-badge sweet">萌趣翻牌 🃏</div>
                <div className="game-card-icon">🃏</div>
                <div className="game-card-info">
                  <h3>记忆翻牌大对决</h3>
                  <p>16 张甜美专属回忆卡片！轮流翻牌寻找配对，考验默契与瞬时记忆力~</p>
                  <div className="game-card-rewards">
                    <span className="game-reward-pill">💖 亲密度 +3</span>
                    <span className="game-reward-pill">🌸 心情 +5</span>
                    <span className="game-reward-pill stars">✦ 心愿星 +8</span>
                  </div>
                </div>
                <div className="game-card-actions">
                  <button className="game-play-btn primary pink" onClick={initMemoryMatch}>
                    开始翻牌 🎴
                  </button>
                </div>
              </article>
            )}

            {/* Game 5: Tic Tac Toe */}
            {(lobbyCategory === "all" || lobbyCategory === "casual") && (
              <article className="game-menu-card tictactoe-card">
                <div className="game-card-badge fast">30秒快打 ⚡</div>
                <div className="game-card-icon">⭕</div>
                <div className="game-card-info">
                  <h3>萌趣井字棋 · 连珠快打</h3>
                  <p>经典 3×3 极速对决！碎片时间的超轻松对局，看看谁能先连成一条线~</p>
                  <div className="game-card-rewards">
                    <span className="game-reward-pill">💖 亲密度 +2</span>
                    <span className="game-reward-pill">🌸 心情 +4</span>
                    <span className="game-reward-pill stars">✦ 心愿星 +5</span>
                  </div>
                </div>
                <div className="game-card-actions">
                  <button className="game-play-btn primary" onClick={initTicTacToe}>
                    立即开局 ⚡
                  </button>
                </div>
              </article>
            )}

            {/* Game 6: Mind Match */}
            {(lobbyCategory === "all" || lobbyCategory === "heart") && (
              <article className="game-menu-card quiz-card">
                <div className="game-card-badge sweet">默契满分 💖</div>
                <div className="game-card-icon">🔮</div>
                <div className="game-card-info">
                  <h3>心灵默契大考验</h3>
                  <p>5 道日常趣味情境二选一！测试你与{companionName}的灵魂心有灵犀指数~</p>
                  <div className="game-card-rewards">
                    <span className="game-reward-pill">💖 亲密度 +6</span>
                    <span className="game-reward-pill">🌸 心情 +8</span>
                    <span className="game-reward-pill stars">✦ 心愿星 +20</span>
                  </div>
                </div>
                <div className="game-card-actions">
                  <button className="game-play-btn primary pink" onClick={initMindMatch}>
                    开启默契测试 💖
                  </button>
                </div>
              </article>
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 2: GOMOKU & TIC-TAC-TOE ================= */}
      {(activeGame === "gomoku" || activeGame === "tictactoe") && (
        <div className="game-board-arena">
          <div className="board-top-controls">
            <div className="turn-indicator">
              {winner !== null ? (
                <span className="turn-status finished">对局结束</span>
              ) : isAiThinking ? (
                <span className="turn-status thinking">💭 {companionName}正在思考中…</span>
              ) : currentTurn === 1 ? (
                <span className="turn-status player">● 轮到你执黑落子</span>
              ) : (
                <span className="turn-status companion">○ 轮到{companionName}执白落子</span>
              )}
            </div>

            <div className="board-action-btns">
              {activeGame === "gomoku" && (
                <>
                  <button
                    className="board-ctrl-btn"
                    onClick={() => setDifficulty(difficulty === "smart" ? "easy" : "smart")}
                    title="切换棋力难度"
                  >
                    {difficulty === "smart" ? "智谋" : "休闲"}
                  </button>
                  <button
                    className="board-ctrl-btn"
                    onClick={handleGomokuUndo}
                    disabled={history.length < 2 || isAiThinking || winner !== null}
                    title="悔棋"
                  >
                    ↺ 悔棋
                  </button>
                </>
              )}
              <button
                className="board-ctrl-btn"
                onClick={() => (activeGame === "gomoku" ? initGomoku(boardSize) : initTicTacToe())}
                title="重新开局"
              >
                ↻ 重开
              </button>
            </div>
          </div>

          <div
            className={`gomoku-board-frame size-${boardSize} ${activeGame === "tictactoe" ? "tictactoe-mode" : ""}`}
            style={{ "--grid-size": boardSize } as React.CSSProperties}
          >
            <div className="board-wood-canvas">
              {grid.map((row, r) => (
                <div key={r} className="board-grid-row">
                  {row.map((cell, c) => {
                    const isLast = lastMove?.r === r && lastMove?.c === c;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`board-cell-intersection ${cell !== 0 ? `stone-${cell}` : ""} ${isLast ? "last-move" : ""}`}
                        onClick={() => handlePlayerGomokuMove(r, c)}
                        role="button"
                        tabIndex={0}
                      >
                        {cell === 1 && <span className="stone black-stone" />}
                        {cell === 2 && <span className="stone white-stone" />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW 3: XIANGQI (CHINESE CHESS) ================= */}
      {activeGame === "xiangqi" && (
        <div className="game-board-arena xiangqi-arena">
          <div className="board-top-controls">
            <div className="turn-indicator">
              {xiangqiWinner !== null ? (
                <span className="turn-status finished">象棋对局结束</span>
              ) : isAiThinking ? (
                <span className="turn-status thinking">💭 {companionName}执黑思考中…</span>
              ) : xiangqiTurn === "red" ? (
                <span className="turn-status player red-turn">● 轮到你执红走子</span>
              ) : (
                <span className="turn-status companion">○ 轮到{companionName}执黑走子</span>
              )}
            </div>

            <div className="board-action-btns">
              <button
                className="board-ctrl-btn"
                onClick={() => setDifficulty(difficulty === "smart" ? "easy" : "smart")}
                title="切换难度"
              >
                {difficulty === "smart" ? "智谋" : "休闲"}
              </button>
              <button className="board-ctrl-btn" onClick={initXiangqi} title="重新摆棋">
                ↻ 重开
              </button>
            </div>
          </div>

          <div className="xiangqi-board-frame">
            <div className="xiangqi-grid-container">
              {/* River Text Banner */}
              <div className="xiangqi-river-banner">
                <span>楚 河</span>
                <span>漢 界</span>
              </div>

              {xiangqiBoard.map((row, r) => (
                <div key={r} className="xiangqi-row">
                  {row.map((cell, c) => {
                    const isSelected = selectedPiecePos?.r === r && selectedPiecePos?.c === c;
                    const isLegalDest = legalMoves.some((m) => m.toR === r && m.toC === c);
                    const isLast = xiangqiLastMove?.toR === r && xiangqiLastMove?.toC === c;

                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`xiangqi-intersection ${isSelected ? "selected" : ""} ${
                          isLegalDest ? "legal-dest" : ""
                        } ${isLast ? "last-move" : ""}`}
                        onClick={() => handleXiangqiCellClick(r, c)}
                      >
                        {isLegalDest && !cell && <span className="dest-dot" />}
                        {cell && (
                          <div className={`xiangqi-piece piece-${cell.color} ${isSelected ? "active" : ""}`}>
                            <span className="piece-char">{PIECE_LABELS[cell.color][cell.type]}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW 4: GO (WEIQI) ================= */}
      {activeGame === "go" && (
        <div className="game-board-arena go-arena">
          <div className="board-top-controls">
            <div className="turn-indicator">
              {goWinner !== null ? (
                <span className="turn-status finished">围棋终局</span>
              ) : isAiThinking ? (
                <span className="turn-status thinking">💭 {companionName}执白构思棋形中…</span>
              ) : goTurn === 1 ? (
                <span className="turn-status player">● 轮到你执黑落子</span>
              ) : (
                <span className="turn-status companion">○ 轮到{companionName}执白落子</span>
              )}
            </div>

            <div className="board-action-btns">
              <button
                className="board-ctrl-btn"
                onClick={handleGoPass}
                disabled={goWinner !== null || isAiThinking}
                title="停一手"
              >
                Pass 停手
              </button>
              <button className="board-ctrl-btn" onClick={() => initGo(goState.size)} title="重新开局">
                ↻ 重开
              </button>
            </div>
          </div>

          <div className="go-captures-bar">
            <span>你提子: <strong>{goState.capturesBlack}</strong></span>
            <span>{companionName}提子: <strong>{goState.capturesWhite}</strong></span>
            {goScoreResult && <span className="go-score-tag">{goScoreResult}</span>}
          </div>

          <div
            className={`gomoku-board-frame go-board-frame size-${goState.size}`}
            style={{ "--grid-size": goState.size } as React.CSSProperties}
          >
            <div className="board-wood-canvas">
              {goState.grid.map((row, r) => (
                <div key={r} className="board-grid-row">
                  {row.map((cell, c) => {
                    const isLast = goState.lastMove?.r === r && goState.lastMove?.c === c;
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`board-cell-intersection ${cell !== 0 ? `stone-${cell}` : ""} ${isLast ? "last-move" : ""}`}
                        onClick={() => handleGoCellClick(r, c)}
                      >
                        {cell === 1 && <span className="stone black-stone" />}
                        {cell === 2 && <span className="stone white-stone" />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================= VIEW 5: MEMORY MATCH ================= */}
      {activeGame === "memorymatch" && (
        <div className="game-board-arena memory-arena">
          <div className="board-top-controls">
            <div className="turn-indicator">
              <span className={`turn-status ${memoryTurn === "player" ? "player" : "companion"}`}>
                {memoryTurn === "player" ? "● 轮到你翻牌" : `○ 轮到${companionName}翻牌中…`}
              </span>
            </div>
            <div className="board-action-btns">
              <button className="board-ctrl-btn" onClick={initMemoryMatch} title="重新洗牌">
                ↻ 重新洗牌
              </button>
            </div>
          </div>

          <div className="memory-score-bar">
            <div className="score-pill player">你的得分: <strong>{playerScore}</strong> 对</div>
            <div className="score-pill remaining">剩余 <strong>{Math.max(0, 8 - playerScore - companionScore)}</strong> 对</div>
            <div className="score-pill companion">{companionName}得分: <strong>{companionScore}</strong> 对</div>
          </div>

          <div className="memory-cards-grid">
            {memoryCards.map((card, idx) => {
              const isFlipped = flippedIndices.includes(idx) || card.matched;
              return (
                <div
                  key={card.id}
                  className={`memory-card-item ${isFlipped ? "flipped" : ""} ${card.matched ? "matched" : ""}`}
                  onClick={() => handleMemoryCardClick(idx)}
                >
                  <div className="card-inner">
                    <div className="card-back">🌸</div>
                    <div className="card-front">
                      <span className="card-icon">{card.icon}</span>
                      <span className="card-name">{card.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= VIEW 6: MIND MATCH QUIZ ================= */}
      {activeGame === "mindmatch" && quizList.length > 0 && (
        <div className="quiz-arena">
          <div className="quiz-progress-bar">
            <div className="quiz-progress-fill" style={{ width: `${((quizIdx + 1) / quizList.length) * 100}%` }} />
          </div>

          <div className="quiz-card-box">
            <div className="quiz-index-pill">
              第 {quizIdx + 1} / {quizList.length} 题
            </div>
            <h3 className="quiz-question-title">{quizList[quizIdx].question}</h3>

            <div className="quiz-options-list">
              {(["A", "B"] as const).map((option) => {
                const reveal = getQuizOptionReveal(quizList[quizIdx], selectedOpt, option);
                return (
                  <button
                    key={option}
                    className={`quiz-option-btn reveal-${reveal.state}`}
                    onClick={() => handleQuizSelect(option)}
                    disabled={selectedOpt !== null}
                  >
                    <span className="opt-letter">{option}</span>
                    <span className="opt-text">{option === "A" ? quizList[quizIdx].optionA : quizList[quizIdx].optionB}</span>
                    {reveal.label && <span className={`match-tag ${reveal.state}`}>{reveal.label.replace("妹妹", companionName)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ================= SETTLEMENT RESULT MODAL ================= */}
      {settlement && (
        <div className="modal-mask game-result-mask">
          <div className="modal game-settlement-modal">
            <div className="settlement-icon">
              {settlement.result === "win" ? "🏆" : settlement.result === "lose" ? "🌸" : "🤝"}
            </div>
            <div className="modal-title">
              {settlement.result === "win"
                ? "🎉 对局胜利！"
                : settlement.result === "lose"
                ? `🌸 ${companionName}获得胜利！`
                : "🤝 势均力敌·平局！"}
            </div>
            <p className="settlement-desc">{settlement.title} 对局已圆满结束</p>

            <div className="settlement-reward-box">
              <div className="reward-item">
                <span className="r-label">亲密度</span>
                <strong className="r-val" style={{ color: "#e0245e" }}>+{settlement.affinityGain}</strong>
              </div>
              <div className="reward-item">
                <span className="r-label">妹妹心情</span>
                <strong className="r-val" style={{ color: "#db2777" }}>+{settlement.moodGain}</strong>
              </div>
              <div className="reward-item">
                <span className="r-label">获得心愿星</span>
                <strong className="r-val" style={{ color: "#d97706" }}>+{settlement.pointsGain} ✦</strong>
              </div>
            </div>

            <div className="settlement-memory-hint">
              ✨ 本次对弈经历已自动珍藏至【我们的回忆手账】中
            </div>

            <div className="settlement-btn-row">
              <button
                className="settlement-btn primary"
                onClick={() => {
                  setSettlement(null);
                  if (activeGame === "gomoku") initGomoku(boardSize);
                  else if (activeGame === "tictactoe") initTicTacToe();
                  else if (activeGame === "xiangqi") initXiangqi();
                  else if (activeGame === "go") initGo(goState.size);
                  else if (activeGame === "memorymatch") initMemoryMatch();
                  else initMindMatch();
                }}
              >
                再来一局 🔁
              </button>
              <button
                className="settlement-btn secondary"
                onClick={() => {
                  setSettlement(null);
                  setActiveGame("lobby");
                }}
              >
                返回大厅 🏠
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

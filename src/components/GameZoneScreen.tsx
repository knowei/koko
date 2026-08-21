import { useState } from "react";
import { useStore } from "@/store/companionStore";
import { Avatar } from "@/components/Avatar";
import { EXPRESSION_MAP } from "@/lib/messageParser";
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
import { getRandomQuiz, type QuizQuestion } from "@/game/mindMatch";

interface GameZoneScreenProps {
  onBack?: () => void;
}

type ActiveGame = "lobby" | "gomoku" | "tictactoe" | "mindmatch";

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

  // Gomoku & TicTacToe States
  const [boardSize, setBoardSize] = useState<number>(15);
  const [grid, setGrid] = useState<BoardCell[][]>(() => createEmptyBoard(15).grid);
  const [history, setHistory] = useState<GomokuMove[]>([]);
  const [lastMove, setLastMove] = useState<GomokuMove | null>(null);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1); // 1: Player (Black), 2: Companion (White)
  const [winner, setWinner] = useState<GameWinner>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [difficulty, setDifficulty] = useState<"smart" | "easy">("smart");

  // Companion Commentary state
  const [bubbleText, setBubbleText] = useState<string>(
    () => `（认真擦干净棋盘）${userNickname}，今天想和我玩哪种游戏呀？`
  );
  const [bubbleExpr, setBubbleExpr] = useState<"smile" | "blush" | "shy" | "pout" | "surprised">("smile");

  // Mind Match Quiz States
  const [quizList, setQuizList] = useState<QuizQuestion[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<"A" | "B" | null>(null);
  const [quizCompleted, setQuizCompleted] = useState(false);

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

  // Start a new Gomoku game
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

  // Start Tic-Tac-Toe
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

  // Start Mind Match Quiz
  const initMindMatch = () => {
    const questions = getRandomQuiz(5);
    setQuizList(questions);
    setQuizIdx(0);
    setMatchedCount(0);
    setSelectedOpt(null);
    setQuizCompleted(false);
    setActiveGame("mindmatch");
    setCompanionSpeech(`（托着下巴期待地看着你）来测测我们之间有多心有灵犀吧！凭第一感觉选哦~`, "shy");
  };

  // Handle Player Drop Stone in Gomoku / TicTacToe
  const handlePlayerMove = (r: number, c: number) => {
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
      void handleGameSettlement(gameType, "draw", "棋盘下满，平分秋色");
      return;
    }

    // Switch to AI turn
    setCurrentTurn(2);
    setIsAiThinking(true);

    // Dynamic reaction based on player move
    if (Math.random() < 0.35) {
      const comm = getCompanionCommentary("player_move", companionName, userNickname);
      setCompanionSpeech(comm.text, comm.expr);
    }

    // Simulate cute thinking delay
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

  // Undo move (悔棋)
  const handleUndo = () => {
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

  // Handle Mind Match Option Selection
  const handleQuizSelect = (option: "A" | "B") => {
    if (selectedOpt !== null || quizCompleted) return;
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
        setQuizCompleted(true);
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

  // Settlement execution
  const handleGameSettlement = async (
    gameType: "gomoku" | "tictactoe" | "mindmatch",
    result: "win" | "lose" | "draw",
    detail: string
  ) => {
    const res = await finishGameMatch(gameType, result, detail);
    const gameTitles = {
      gomoku: "经典五子棋",
      tictactoe: "萌趣井字棋",
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

          <div className="game-cards-grid">
            {/* Game 1: Gomoku */}
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

            {/* Game 2: Tic Tac Toe */}
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

            {/* Game 3: Mind Match */}
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
          </div>
        </div>
      )}

      {/* ================= VIEW 2 & 3: GOMOKU & TIC-TAC-TOE ================= */}
      {(activeGame === "gomoku" || activeGame === "tictactoe") && (
        <div className="game-board-arena">
          {/* Controls Bar */}
          <div className="board-top-controls">
            <div className="turn-indicator">
              {winner !== null ? (
                <span className="turn-status finished">对局结束</span>
              ) : isAiThinking ? (
                <span className="turn-status thinking">💭 {companionName}正在认真思考中…</span>
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
                    onClick={handleUndo}
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

          {/* Board Grid Render */}
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
                        onClick={() => handlePlayerMove(r, c)}
                        role="button"
                        tabIndex={0}
                        aria-label={`第 ${r + 1} 行第 ${c + 1} 列${cell === 1 ? "，黑子" : cell === 2 ? "，白子" : "，空位"}`}
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

      {/* ================= VIEW 4: MIND MATCH QUIZ ================= */}
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
              <button
                className={`quiz-option-btn ${selectedOpt === "A" ? "selected" : ""} ${
                  selectedOpt && quizList[quizIdx].companionChoice === "A" ? "matched" : ""
                }`}
                onClick={() => handleQuizSelect("A")}
                disabled={selectedOpt !== null}
              >
                <span className="opt-letter">A</span>
                <span className="opt-text">{quizList[quizIdx].optionA}</span>
                {selectedOpt && quizList[quizIdx].companionChoice === "A" && (
                  <span className="match-tag">💖 {companionName}也选这个！</span>
                )}
              </button>

              <button
                className={`quiz-option-btn ${selectedOpt === "B" ? "selected" : ""} ${
                  selectedOpt && quizList[quizIdx].companionChoice === "B" ? "matched" : ""
                }`}
                onClick={() => handleQuizSelect("B")}
                disabled={selectedOpt !== null}
              >
                <span className="opt-letter">B</span>
                <span className="opt-text">{quizList[quizIdx].optionB}</span>
                {selectedOpt && quizList[quizIdx].companionChoice === "B" && (
                  <span className="match-tag">💖 {companionName}也选这个！</span>
                )}
              </button>
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

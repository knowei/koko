import { useState } from "react";
import { useStore, type StickyNote } from "@/store/companionStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_OPTIONS: Array<{ key: StickyNote["color"]; label: string; bg: string }> = [
  { key: "pink", label: "甜心粉", bg: "#fce7f3" },
  { key: "yellow", label: "暖阳黄", bg: "#fef9c3" },
  { key: "green", label: "薄荷绿", bg: "#dcfce7" },
  { key: "purple", label: "薰衣紫", bg: "#f3e8ff" },
  { key: "blue", label: "晴空蓝", bg: "#e0f2fe" },
];

export function StickyNotesModal({ isOpen, onClose }: Props) {
  const profile = useStore((s) => s.profile);
  const companionName = profile.name || "妹妹";
  const userNickname = profile.userNickname || "哥哥";
  const stickyNotes = useStore((s) => s.stickyNotes);
  const addStickyNote = useStore((s) => s.addStickyNote);
  const updateStickyNote = useStore((s) => s.updateStickyNote);
  const deleteStickyNote = useStore((s) => s.deleteStickyNote);
  const addTodoToNote = useStore((s) => s.addTodoToNote);
  const toggleTodoItem = useStore((s) => s.toggleTodoItem);
  const deleteTodoItem = useStore((s) => s.deleteTodoItem);

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newColor, setNewColor] = useState<StickyNote["color"]>("pink");

  const [activeTodoInputNoteId, setActiveTodoInputNoteId] = useState<string | null>(null);
  const [newTodoText, setNewTodoText] = useState("");

  if (!isOpen) return null;

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() && !newContent.trim()) return;
    addStickyNote(newTitle.trim() || "随手记", newContent.trim(), newColor);
    setNewTitle("");
    setNewContent("");
    setIsCreating(false);
  };

  const handleAddTodo = (noteId: string) => {
    if (!newTodoText.trim()) return;
    addTodoToNote(noteId, newTodoText.trim());
    setNewTodoText("");
    setActiveTodoInputNoteId(null);
  };

  const totalTodos = stickyNotes.reduce((acc, n) => acc + n.todos.length, 0);
  const completedTodos = stickyNotes.reduce((acc, n) => acc + n.todos.filter((t) => t.done).length, 0);

  return (
    <div className="sticky-modal-overlay">
      <div className="sticky-modal-card">
        <header className="sticky-modal-header">
          <div className="sticky-header-title">
            <span className="sticky-icon">📌</span>
            <div>
              <h3>随手便签与待办清单</h3>
              <p className="sticky-subtitle">
                记录突发灵感与小目标，{companionName}陪{userNickname}一件一件认真完成~
              </p>
            </div>
          </div>
          <div className="sticky-header-actions">
            <button
              className="sticky-add-btn"
              onClick={() => setIsCreating(!isCreating)}
            >
              {isCreating ? "✕ 取消新建" : "＋ 新建便签"}
            </button>
            <button className="focus-close-btn" onClick={onClose}>✕</button>
          </div>
        </header>

        {/* Progress Bar */}
        {totalTodos > 0 && (
          <div className="sticky-todos-summary">
            <span>
              已完成 <strong>{completedTodos}</strong> / {totalTodos} 个小目标
            </span>
            <div className="sticky-progress-track">
              <div
                className="sticky-progress-fill"
                style={{ width: `${(completedTodos / totalTodos) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Create Note Form */}
        {isCreating && (
          <form className="sticky-create-form" onSubmit={handleCreateNote}>
            <h4>✨ 新建彩色便签</h4>
            <input
              type="text"
              placeholder="便签标题（如：今天的工作目标 / 灵感速记）"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="sticky-input"
              maxLength={40}
              autoFocus
            />
            <textarea
              placeholder="记录具体细节或备忘内容..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="sticky-textarea"
              rows={3}
            />
            <div className="sticky-color-picker">
              <span>选择颜色：</span>
              <div className="color-palette">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`color-dot ${newColor === c.key ? "selected" : ""}`}
                    style={{ backgroundColor: c.bg }}
                    onClick={() => setNewColor(c.key)}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="sticky-form-footer">
              <button type="submit" className="sticky-submit-btn">
                📌 贴在桌面
              </button>
            </div>
          </form>
        )}

        {/* Sticky Notes Grid */}
        <div className="sticky-notes-grid">
          {stickyNotes.length === 0 ? (
            <div className="sticky-empty-state">
              <span className="empty-icon">📝</span>
              <p>暂无便签，点击右上角「＋ 新建便签」贴上第一张吧！</p>
            </div>
          ) : (
            stickyNotes.map((note) => (
              <div key={note.id} className={`sticky-note-card note-color-${note.color}`}>
                <div className="note-card-header">
                  <h4 className="note-title">{note.title}</h4>
                  <div className="note-actions">
                    <button
                      className="note-pin-btn"
                      onClick={() => updateStickyNote(note.id, { pinned: !note.pinned })}
                      title={note.pinned ? "取消置顶" : "置顶便签"}
                    >
                      {note.pinned ? "📍" : "📌"}
                    </button>
                    <button
                      className="note-delete-btn"
                      onClick={() => deleteStickyNote(note.id)}
                      title="删除便签"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {note.content && (
                  <p className="note-body-text">{note.content}</p>
                )}

                {/* Todo Sub-tasks */}
                <div className="note-todos-section">
                  <div className="todos-header">
                    <span>待办打卡 ({note.todos.filter((t) => t.done).length}/{note.todos.length})</span>
                    <button
                      className="add-subtask-btn"
                      onClick={() => setActiveTodoInputNoteId(activeTodoInputNoteId === note.id ? null : note.id)}
                    >
                      ＋ 待办
                    </button>
                  </div>

                  {activeTodoInputNoteId === note.id && (
                    <div className="new-todo-row">
                      <input
                        type="text"
                        placeholder="添加待办（如：写完汇报）"
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        className="new-todo-input"
                        onKeyDown={(e) => e.key === "Enter" && handleAddTodo(note.id)}
                        autoFocus
                      />
                      <button
                        className="save-todo-btn"
                        onClick={() => handleAddTodo(note.id)}
                      >
                        ✓
                      </button>
                    </div>
                  )}

                  <ul className="note-todos-list">
                    {note.todos.map((todo) => (
                      <li key={todo.id} className={`todo-item ${todo.done ? "done" : ""}`}>
                        <label className="todo-checkbox-label">
                          <input
                            type="checkbox"
                            checked={todo.done}
                            onChange={() => toggleTodoItem(note.id, todo.id)}
                          />
                          <span className="todo-text">{todo.text}</span>
                        </label>
                        <button
                          className="todo-del-btn"
                          onClick={() => deleteTodoItem(note.id, todo.id)}
                          title="删除此项"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="note-footer">
                  <span className="note-time">
                    {new Date(note.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type StickyNote } from "@/store/companionStore";

const COLOR_LABELS: Record<StickyNote["color"], string> = {
  pink: "甜心粉",
  yellow: "暖阳黄",
  green: "薄荷绿",
  purple: "薰衣紫",
  blue: "晴空蓝",
};

const DESKTOP_THEMES = [
  { key: "pink", label: "甜心粉" },
  { key: "cream", label: "奶油杏" },
  { key: "mint", label: "薄荷绿" },
  { key: "sky", label: "晴空蓝" },
  { key: "lavender", label: "薰衣紫" },
  { key: "charcoal", label: "夜色灰" },
] as const;
type DesktopTheme = typeof DESKTOP_THEMES[number]["key"];

export function StickyDesktopWidget() {
  const stickyNotes = useStore((state) => state.stickyNotes);
  const toggleTodoItem = useStore((state) => state.toggleTodoItem);
  const addTodoToNote = useStore((state) => state.addTodoToNote);
  const [expanded, setExpanded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [todoText, setTodoText] = useState("");
  const [theme, setTheme] = useState<DesktopTheme>(() => {
    const saved = localStorage.getItem("koko-sticky-desktop-theme");
    return DESKTOP_THEMES.some((item) => item.key === saved) ? saved as DesktopTheme : "pink";
  });
  const collapseTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("sticky-window-mode");
    document.body.classList.add("sticky-window-mode");
    return () => {
      document.documentElement.classList.remove("sticky-window-mode");
      document.body.classList.remove("sticky-window-mode");
    };
  }, []);

  useEffect(() => window.electronAPI?.onStickyReset?.(() => {
    setExpanded(false);
    setLocked(false);
  }), []);

  const notes = useMemo(
    () => [...stickyNotes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt),
    [stickyNotes],
  );
  const note = notes[Math.min(activeIndex, Math.max(0, notes.length - 1))];

  const setWindowExpanded = (next: boolean) => {
    setExpanded(next);
    window.electronAPI?.setStickyExpanded?.(next);
  };

  const handleMouseEnter = () => {
    window.clearTimeout(collapseTimer.current);
    setWindowExpanded(true);
  };

  const handleMouseLeave = () => {
    if (locked) return;
    collapseTimer.current = window.setTimeout(() => setWindowExpanded(false), 700);
  };

  const addTodo = () => {
    if (!note || !todoText.trim()) return;
    addTodoToNote(note.id, todoText.trim());
    setTodoText("");
  };

  const changeTheme = (nextTheme: DesktopTheme) => {
    setTheme(nextTheme);
    localStorage.setItem("koko-sticky-desktop-theme", nextTheme);
  };

  return (
    <div
      className={`sticky-desktop-root sticky-theme-${theme} ${expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <button className="sticky-edge-tab" onMouseEnter={handleMouseEnter} onClick={() => setWindowExpanded(true)} title="展开桌面便签">
        <span>📌</span>
        <strong>便签</strong>
      </button>
      <section className={`sticky-desktop-card note-color-${note?.color || "pink"}`} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <header className="sticky-desktop-head">
            <div>
              <span className="sticky-desktop-kicker">{note ? COLOR_LABELS[note.color] : "可可便签"}</span>
              <h2>{note?.title || "还没有便签"}</h2>
            </div>
            <div className="sticky-desktop-actions">
              <select value={theme} onChange={(event) => changeTheme(event.target.value as DesktopTheme)} title="切换便签主题">
                {DESKTOP_THEMES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <button onClick={() => setLocked((value) => !value)} title={locked ? "恢复自动收起" : "固定展开"}>{locked ? "🔒" : "🔓"}</button>
              <button onClick={() => window.electronAPI?.hideStickyWindow?.()} title="隐藏桌面便签">×</button>
            </div>
          </header>

            {note ? (
              <>
                {note.reminderEnabled && note.reminderDate && <div className="sticky-desktop-reminder">🔔 {note.reminderDate} · 可可会提醒</div>}
                {note.content && <p className="sticky-desktop-content">{note.content}</p>}
              <div className="sticky-desktop-todos">
                {note.todos.length === 0 && <p className="sticky-desktop-empty">还没有待办，随手记下一件吧。</p>}
                {note.todos.map((todo) => (
                  <label key={todo.id} className={todo.done ? "is-done" : ""}>
                    <input type="checkbox" checked={todo.done} onChange={() => toggleTodoItem(note.id, todo.id)} />
                    <span>{todo.text}</span>
                  </label>
                ))}
              </div>
              <div className="sticky-desktop-add">
                <input
                  value={todoText}
                  onChange={(event) => setTodoText(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addTodo()}
                  placeholder="添加一个小待办…"
                  maxLength={80}
                />
                <button onClick={addTodo}>＋</button>
              </div>
            </>
          ) : (
            <button className="sticky-desktop-create" onClick={() => window.electronAPI?.openStickyManager?.()}>
              去创建第一张便签
            </button>
          )}

          <footer className="sticky-desktop-footer">
            <div className="sticky-desktop-pager">
              <button disabled={notes.length < 2} onClick={() => setActiveIndex((activeIndex - 1 + notes.length) % notes.length)}>‹</button>
              <span>{notes.length ? `${Math.min(activeIndex + 1, notes.length)} / ${notes.length}` : "0 / 0"}</span>
              <button disabled={notes.length < 2} onClick={() => setActiveIndex((activeIndex + 1) % notes.length)}>›</button>
            </div>
            <button className="sticky-desktop-manage" onClick={() => window.electronAPI?.openStickyManager?.()}>查看全部</button>
          </footer>
      </section>
    </div>
  );
}

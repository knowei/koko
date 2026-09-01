import React, { useState, useMemo, useRef } from "react";
import { useStore } from "@/store/companionStore";
import {
  LORE_CATEGORY_META,
  type LoreCategory,
  type LoreEntry,
} from "@/data/lorebook";
import {
  exportToSillyTavernJSON,
  importFromSillyTavernJSON,
} from "@/lib/lorebookIO";
import { useConfirmDialog } from "@/components/ConfirmDialog";

interface LorebookModalProps {
  open: boolean;
  onClose: () => void;
}

export const LorebookModal: React.FC<LorebookModalProps> = ({ open, onClose }) => {
  const confirmDialog = useConfirmDialog();
  const lorebook = useStore((s) => s.lorebook || []);
  const addLoreEntry = useStore((s) => s.addLoreEntry);
  const updateLoreEntry = useStore((s) => s.updateLoreEntry);
  const deleteLoreEntry = useStore((s) => s.deleteLoreEntry);
  const toggleLoreEntry = useStore((s) => s.toggleLoreEntry);
  const resetLorebook = useStore((s) => s.resetLorebook);
  const importLorebookEntries = useStore((s) => s.importLorebookEntries);

  const [activeTab, setActiveTab] = useState<LoreCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingEntry, setEditingEntry] = useState<LoreEntry | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State for Create/Edit
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<LoreCategory>("memory");
  const [formKeys, setFormKeys] = useState("");
  const [formSecondaryKeys, setFormSecondaryKeys] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formConstant, setFormConstant] = useState(false);
  const [formPriority, setFormPriority] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (text: string, type: "success" | "error" = "success") => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const filteredEntries = useMemo(() => {
    return lorebook.filter((entry) => {
      if (activeTab !== "all" && entry.category !== activeTab) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.content.toLowerCase().includes(q) ||
        entry.keys.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [lorebook, activeTab, searchQuery]);

  if (!open) return null;

  const openCreateModal = () => {
    setFormTitle("");
    setFormCategory("memory");
    setFormKeys("");
    setFormSecondaryKeys("");
    setFormContent("");
    setFormConstant(false);
    setFormPriority(50);
    setEditingEntry(null);
    setIsCreating(true);
  };

  const openEditModal = (entry: LoreEntry) => {
    setEditingEntry(entry);
    setFormTitle(entry.title);
    setFormCategory(entry.category);
    setFormKeys(entry.keys.join(", "));
    setFormSecondaryKeys((entry.secondaryKeys || []).join(", "));
    setFormContent(entry.content);
    setFormConstant(Boolean(entry.constant));
    setFormPriority(entry.priority ?? 50);
    setIsCreating(true);
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const title = formTitle.trim();
    const content = formContent.trim();
    if (!title || !content) {
      showFeedback("标题与设定内容不能为空", "error");
      return;
    }

    const keys = formKeys
      .split(/[,，\n]/)
      .map((k) => k.trim())
      .filter(Boolean);

    const secondaryKeys = formSecondaryKeys
      .split(/[,，\n]/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (!formConstant && keys.length === 0) {
      showFeedback("非常驻词条至少需要填写一个触发主关键词", "error");
      return;
    }

    if (editingEntry) {
      updateLoreEntry(editingEntry.id, {
        title,
        category: formCategory,
        keys: keys.length > 0 ? keys : [title],
        secondaryKeys: secondaryKeys.length > 0 ? secondaryKeys : undefined,
        content,
        constant: formConstant,
        priority: Number(formPriority) || 50,
      });
      showFeedback(`已更新词条《${title}》`);
    } else {
      addLoreEntry({
        title,
        category: formCategory,
        keys: keys.length > 0 ? keys : [title],
        secondaryKeys: secondaryKeys.length > 0 ? secondaryKeys : undefined,
        content,
        enabled: true,
        constant: formConstant,
        priority: Number(formPriority) || 50,
      });
      showFeedback(`已新建词条《${title}》`);
    }

    setIsCreating(false);
    setEditingEntry(null);
  };

  const handleExportJSON = () => {
    try {
      const jsonStr = exportToSillyTavernJSON(lorebook);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `koko_lorebook_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showFeedback("已成功导出酒馆标准世界书 JSON！");
    } catch (err) {
      showFeedback("导出失败，请重试", "error");
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result || "");
        const entries = importFromSillyTavernJSON(text);
        const count = importLorebookEntries(entries);
        showFeedback(`成功导入 ${count} 条世界书词条！`);
      } catch (err) {
        showFeedback(err instanceof Error ? err.message : "导入失败", "error");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleDeleteEntry = async (entry: LoreEntry) => {
    const confirmed = await confirmDialog({
      title: "删除这条世界书设定？",
      description: `《${entry.title}》删除后将不再参与聊天提示词。`,
      confirmLabel: "确认删除",
      tone: "danger",
    });
    if (!confirmed) return;
    deleteLoreEntry(entry.id);
    showFeedback(`已删除词条《${entry.title}》`);
  };

  const handleResetLorebook = async () => {
    const confirmed = await confirmDialog({
      title: "恢复默认世界书？",
      description: "所有自定义词条和修改都会被清除，并恢复为初始预置设定。",
      confirmLabel: "恢复默认",
      tone: "danger",
    });
    if (!confirmed) return;
    resetLorebook();
    showFeedback("已成功重置为默认世界书！");
  };

  return (
    <div className="modal-mask confirm-dialog-mask" onClick={onClose}>
      <div className="lorebook-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="lorebook-header">
          <div className="lorebook-brand">
            <div className="lorebook-brand-icon">📖</div>
            <div>
              <h2 className="lorebook-brand-title">专属世界书 · 深度设定库</h2>
              <p className="lorebook-brand-desc">
                智能关键词按需唤醒 · 兼容酒馆 (SillyTavern) 格式 · 0 Token 平时静默
              </p>
            </div>
          </div>

          <div className="lorebook-top-actions">
            <button className="lorebook-btn-primary" onClick={openCreateModal}>
              <span>➕</span> 新建设定
            </button>

            <button
              className="lorebook-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              title="导入酒馆标准世界书 JSON"
            >
              📥 导入
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />

            <button
              className="lorebook-btn-secondary"
              onClick={handleExportJSON}
              title="导出为酒馆标准世界书 JSON"
            >
              📤 导出
            </button>

            <button className="lorebook-btn-close" onClick={onClose} title="关闭">
              ✕
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            style={{
              padding: "9px 20px",
              background: feedbackMsg.type === "success" ? "#ecfdf5" : "#fef2f2",
              color: feedbackMsg.type === "success" ? "#065f46" : "#991b1b",
              fontSize: "12.5px",
              fontWeight: "600",
              textAlign: "center",
              borderBottom: "1px solid #f0ccd6",
            }}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* Filter Bar & Search */}
        <div className="lorebook-filter-bar">
          <div className="lorebook-tabs-scroll">
            <button
              className={`lorebook-tab-chip ${activeTab === "all" ? "active" : ""}`}
              style={{ background: activeTab === "all" ? "#ec4899" : "#ffffff" }}
              onClick={() => setActiveTab("all")}
            >
              全部 ({lorebook.length})
            </button>

            {(Object.keys(LORE_CATEGORY_META) as LoreCategory[]).map((cat) => {
              const meta = LORE_CATEGORY_META[cat];
              const count = lorebook.filter((e) => e.category === cat).length;
              const isSelected = activeTab === cat;
              return (
                <button
                  key={cat}
                  className={`lorebook-tab-chip ${isSelected ? "active" : ""}`}
                  style={{ background: isSelected ? meta.color : "#ffffff" }}
                  onClick={() => setActiveTab(cat)}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                  <span style={{ opacity: 0.8, fontSize: "11px" }}>({count})</span>
                </button>
              );
            })}
          </div>

          <div className="lorebook-search-wrap" style={{ position: "relative", minWidth: "180px", flex: 1, maxWidth: "260px" }}>
            <span style={{ position: "absolute", left: "9px", top: "7px", fontSize: "12px", opacity: 0.6 }}>🔍</span>
            <input
              type="text"
              placeholder="搜索设定、触发词..."
              className="lorebook-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Entries List Area */}
        <div className="lorebook-entries-grid">
          {filteredEntries.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                padding: "50px 20px",
                textAlign: "center",
                color: "#a07c8a",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "10px" }}>🍃</div>
              <div style={{ fontSize: "14px", fontWeight: "700" }}>没有找到符合条件的世界设定</div>
              <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.8 }}>
                点击右上角“➕ 新建设定”或“📥 导入”添加更多回忆与世界设定吧！
              </div>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const meta = LORE_CATEGORY_META[entry.category] || LORE_CATEGORY_META.custom;
              return (
                <div key={entry.id} className={`lorebook-card ${!entry.enabled ? "disabled" : ""}`}>
                  {/* Card Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "3px 8px",
                          borderRadius: "8px",
                          background: `${meta.color}15`,
                          color: meta.color,
                          fontWeight: "700",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          flexShrink: 0,
                        }}
                      >
                        {meta.icon} {meta.label}
                      </span>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "14px",
                          color: "#3e242d",
                          fontWeight: "700",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.title}
                      </h4>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                      {entry.constant && (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "6px",
                            background: "#ecfdf5",
                            color: "#059669",
                            fontWeight: "700",
                          }}
                        >
                          ⚡ 常驻
                        </span>
                      )}

                      <button
                        onClick={() => toggleLoreEntry(entry.id)}
                        title={entry.enabled ? "点击禁用该设定" : "点击启用该设定"}
                        style={{
                          border: "none",
                          background: entry.enabled ? "#10b981" : "#d1d5db",
                          color: "#fff",
                          width: "36px",
                          height: "20px",
                          borderRadius: "12px",
                          fontSize: "10px",
                          fontWeight: "700",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: entry.enabled ? "flex-end" : "flex-start",
                          padding: "2px",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <span
                          style={{
                            width: "16px",
                            height: "16px",
                            borderRadius: "50%",
                            background: "#fff",
                            display: "block",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                          }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Trigger Keywords */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center" }}>
                    <span style={{ fontSize: "10.5px", color: "#9c7684", marginRight: "2px" }}>🔑 触发词:</span>
                    {entry.keys.map((k, i) => (
                      <span key={i} className="lorebook-tag-primary">
                        {k}
                      </span>
                    ))}
                    {(entry.secondaryKeys || []).map((sk, i) => (
                      <span key={`sec-${i}`} className="lorebook-tag-secondary">
                        + {sk}
                      </span>
                    ))}
                  </div>

                  {/* Content Preview */}
                  <p className="lorebook-content-box">{entry.content}</p>

                  {/* Card Footer Actions */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "11px",
                      color: "#b08d9a",
                      borderTop: "1px solid #f9ebef",
                      paddingTop: "6px",
                    }}
                  >
                    <span>权重: {entry.priority ?? 50}</span>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        onClick={() => openEditModal(entry)}
                        style={{
                          border: "none",
                          background: "none",
                          color: "#ec4899",
                          fontWeight: "600",
                          fontSize: "12px",
                          cursor: "pointer",
                          padding: "2px 4px",
                        }}
                      >
                        ✏️ 编辑
                      </button>
                      <button
                        onClick={() => void handleDeleteEntry(entry)}
                        style={{
                          border: "none",
                          background: "none",
                          color: "#9ca3af",
                          fontSize: "12px",
                          cursor: "pointer",
                          padding: "2px 4px",
                        }}
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & Reset */}
        <div
          className="lorebook-footer"
          style={{
            padding: "11px 22px",
            borderTop: "1px solid #f3d7df",
            background: "#fffafb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "12px",
            color: "#9e7784",
          }}
        >
          <span>共 {lorebook.length} 条设定（已激活 {lorebook.filter((e) => e.enabled).length} 条）</span>
          <button
            onClick={() => void handleResetLorebook()}
            style={{
              border: "none",
              background: "none",
              color: "#9e7784",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: "11.5px",
            }}
          >
            🔄 恢复默认预置设定
          </button>
        </div>
      </div>

      {/* Create / Edit Modal Sub-dialog */}
      {isCreating && (
        <div
          className="modal-mask confirm-dialog-mask lorebook-editor-mask"
          style={{ zIndex: 300 }}
          onClick={() => setIsCreating(false)}
        >
          <div
            className="confirm-dialog lorebook-editor-dialog"
            style={{ width: "min(560px, 94vw)", padding: "22px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#3f252e", fontWeight: "700" }}>
              {editingEntry ? "✏️ 编辑世界书词条" : "➕ 新建世界书词条"}
            </h3>

            <form onSubmit={handleSaveEntry} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Title & Category */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "11.5px", fontWeight: "700", color: "#6a4350" }}>词条名称</label>
                  <input
                    type="text"
                    required
                    placeholder="如：摩天轮告白之夜"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #ebd0d8",
                      fontSize: "13px",
                      marginTop: "4px",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "11.5px", fontWeight: "700", color: "#6a4350" }}>分类</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as LoreCategory)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      border: "1px solid #ebd0d8",
                      fontSize: "13px",
                      marginTop: "4px",
                      background: "#fff",
                    }}
                  >
                    {(Object.keys(LORE_CATEGORY_META) as LoreCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {LORE_CATEGORY_META[cat].icon} {LORE_CATEGORY_META[cat].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Constant Mode Checkbox */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  background: "#fdf2f6",
                  borderRadius: "8px",
                }}
              >
                <input
                  type="checkbox"
                  id="formConstant"
                  checked={formConstant}
                  onChange={(e) => setFormConstant(e.target.checked)}
                />
                <label htmlFor="formConstant" style={{ fontSize: "12px", color: "#7a4658", cursor: "pointer" }}>
                  <strong>常驻激活</strong>（无论是否提到关键词，该设定都会常驻注入 AI 提示词）
                </label>
              </div>

              {/* Trigger Keys */}
              {!formConstant && (
                <>
                  <div>
                    <label style={{ fontSize: "11.5px", fontWeight: "700", color: "#6a4350" }}>
                      🔑 主触发关键词（逗号或回车分隔，任一命中即触发）
                    </label>
                    <input
                      type="text"
                      placeholder="如：摩天轮, 告白, 烟火, 定情"
                      value={formKeys}
                      onChange={(e) => setFormKeys(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #ebd0d8",
                        fontSize: "13px",
                        marginTop: "4px",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11.5px", fontWeight: "700", color: "#6a4350" }}>
                      🎯 次级过滤词（可选，需与主关键词同时出现才触发）
                    </label>
                    <input
                      type="text"
                      placeholder="如：顶端, 秘密（留空表示不需要次级条件）"
                      value={formSecondaryKeys}
                      onChange={(e) => setFormSecondaryKeys(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        border: "1px solid #ebd0d8",
                        fontSize: "13px",
                        marginTop: "4px",
                      }}
                    />
                  </div>
                </>
              )}

              {/* Content */}
              <div>
                <label style={{ fontSize: "11.5px", fontWeight: "700", color: "#6a4350" }}>
                  📝 注入给 AI 的具体设定与知识内容
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="详细描述该设定的具体细节、历史经过、可可的心情反应或行为准则..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: "1px solid #ebd0d8",
                    fontSize: "12.5px",
                    lineHeight: "1.6",
                    marginTop: "4px",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Priority */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <label style={{ fontSize: "11.5px", fontWeight: "700", color: "#6a4350" }}>排序权重 (1-100):</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formPriority}
                  onChange={(e) => setFormPriority(Number(e.target.value))}
                  style={{
                    width: "80px",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #ebd0d8",
                    fontSize: "12px",
                  }}
                />
                <span style={{ fontSize: "11px", color: "#a07c8a" }}>数值越高越优先注入给 AI</span>
              </div>

              {/* Modal Buttons */}
              <div className="lorebook-editor-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "10px",
                    border: "1px solid #ebd0d8",
                    background: "#fff",
                    color: "#6b4553",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "8px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: "linear-gradient(135deg, #ec4899, #e11d48)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(236, 72, 153, 0.25)",
                  }}
                >
                  {editingEntry ? "保存修改" : "确认添加"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import { useState, useEffect } from "react";
import { useStore } from "@/store/companionStore";
import { Avatar } from "@/components/Avatar";
import { apiUrl } from "@/lib/api";
import { useConfirmDialog } from "@/components/ConfirmDialog";

interface AccountModalProps {
  onClose: () => void;
}

type AuthTab = "login" | "register" | "forgot";

interface AccountData {
  user: { id: string; email: string; created_at: string };
  points: number;
  checkInStreak: number;
  lastCheckIn: string | null;
}

export function AccountModal({ onClose }: AccountModalProps) {
  const confirmDialog = useConfirmDialog();
  const profile = useStore((s) => s.profile);
  const activeSkin = useStore((s) => s.activeSkin);
  const exportSave = useStore((s) => s.exportSave);
  const importSave = useStore((s) => s.importSave);
  const syncWallet = useStore((s) => s.syncWallet);
  const clearWallet = useStore((s) => s.clearWallet);

  const [token, setToken] = useState(() => localStorage.getItem("koko-account-token") || "");
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "info" | "error" | "success"; text: string } | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [cloudUpdatedAt, setCloudUpdatedAt] = useState<string | null>(null);

  const accountRequest = async (path: string, init: RequestInit = {}) => {
    const currentToken = localStorage.getItem("koko-account-token") || "";
    const response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        ...init.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };

  const fetchAccountDetails = async () => {
    if (!token) return;
    try {
      const data = (await accountRequest("/api/account")) as AccountData;
      setAccountData(data);
      // Fetch cloud save info
      try {
        const saveInfo = await accountRequest("/api/cloud-save");
        if (saveInfo?.updatedAt) {
          const date = new Date(saveInfo.updatedAt);
          setCloudUpdatedAt(date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
        }
      } catch {
        setCloudUpdatedAt(null);
      }
    } catch {
      // Token might be expired
      setAccountData(null);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchAccountDetails();
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const emailTrimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailTrimmed)) {
      setNotice({ type: "error", text: "请输入格式正确的邮箱地址。" });
      return;
    }

    if (password.length < 8) {
      setNotice({ type: "error", text: "密码长度至少需要 8 位字符。" });
      return;
    }

    if (tab === "register" || tab === "forgot") {
      if (password !== confirmPassword) {
        setNotice({ type: "error", text: "两次输入的密码不一致，请仔细检查。" });
        return;
      }
    }

    if ((tab === "register" || tab === "forgot") && !/^\d{6}$/.test(verificationCode)) {
      setNotice({ type: "error", text: "请输入邮件中的 6 位验证码。" });
      return;
    }

    setLoading(true);
    try {
      if (tab === "login") {
        const res = await accountRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: emailTrimmed, code: verificationCode, password }),
        });
        localStorage.setItem("koko-account-token", res.token);
        setToken(res.token);
        await syncWallet();
        setPassword("");
        setNotice({ type: "success", text: "登录成功，已开启专属云端同步！" });
      } else if (tab === "register") {
        const res = await accountRequest("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ email: emailTrimmed, password }),
        });
        localStorage.setItem("koko-account-token", res.token);
        setToken(res.token);
        await syncWallet();
        setPassword("");
        setConfirmPassword("");
        setNotice({ type: "success", text: "🎉 注册成功！已为您送上 50 心愿星新手礼！" });
      } else if (tab === "forgot") {
        const res = await accountRequest("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ email: emailTrimmed, code: verificationCode, newPassword: password }),
        });
        setNotice({ type: "success", text: res.message || "密码重置成功，请使用新密码登录。" });
        setTab("login");
        setPassword("");
        setConfirmPassword("");
        setVerificationCode("");
        setVerificationCode("");
      }
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  const sendVerificationCode = async () => {
    const emailTrimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(emailTrimmed)) {
      setNotice({ type: "error", text: "请先输入格式正确的注册邮箱。" });
      return;
    }
    setNotice(null);
    setSendingCode(true);
    try {
      const path = tab === "register" ? "/api/auth/register/code" : "/api/auth/password-reset/code";
      const res = await accountRequest(path, {
        method: "POST",
        body: JSON.stringify({ email: emailTrimmed }),
      });
      setNotice({ type: "success", text: res.message || "验证码已发送，请检查邮箱。" });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "验证码发送失败。" });
    } finally {
      setSendingCode(false);
    }
  };

  const uploadCloud = async () => {
    setNotice(null);
    setLoading(true);
    try {
      await accountRequest("/api/cloud-save", {
        method: "PUT",
        body: JSON.stringify({ payload: exportSave() }),
      });
      const nowStr = new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      setCloudUpdatedAt(nowStr);
      setNotice({ type: "success", text: "✨ 本地存档已成功备份至云端！" });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "云存档上传失败。" });
    } finally {
      setLoading(false);
    }
  };

  const downloadCloud = async () => {
    const confirmed = await confirmDialog({
      title: "恢复云端存档？",
      description: "当前设备上的聊天与好感度进度将被覆盖，但会保留模型 API Key 配置。",
      confirmLabel: "确认恢复",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    setNotice(null);
    setLoading(true);
    try {
      const data = await accountRequest("/api/cloud-save");
      const err = importSave(data.payload);
      if (err) {
        setNotice({ type: "error", text: err });
      } else {
        setNotice({ type: "success", text: "🎉 云存档已成功恢复并同步至当前设备！" });
      }
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "云存档恢复失败。" });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const confirmed = await confirmDialog({
      title: "退出当前账号？",
      description: "本地聊天仍会保留，但云端备份与跨设备同步将暂停。",
      confirmLabel: "退出登录",
      tone: "danger",
    });
    if (!confirmed) return;
    localStorage.removeItem("koko-account-token");
    setToken("");
    setAccountData(null);
    clearWallet();
    setNotice({ type: "info", text: "已安全退出当前账号。" });
  };

  return (
    <div className="modal-mask account-mask" onClick={onClose}>
      <div className="modal account-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="account-modal-header">
          <div className="account-header-left">
            <div className="account-header-icon">👤</div>
            <div>
              <div className="account-modal-title">可可账号中心</div>
              <div className="account-modal-subtitle">
                {token ? "已开启专属云空间与记忆漫游" : "登录后开启云端记忆同步与跨设备无缝漫游"}
              </div>
            </div>
          </div>
          <button className="account-close-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        {/* Notice alert */}
        {notice && (
          <div className={`account-alert ${notice.type}`}>
            <span className="alert-icon">
              {notice.type === "success" ? "✓" : notice.type === "error" ? "!" : "ℹ"}
            </span>
            <span>{notice.text}</span>
          </div>
        )}

        {/* Logged in view */}
        {token ? (
          <div className="account-logged-view">
            {/* User Profile Card */}
            <div className="user-profile-card">
              <div className="user-profile-top">
                <Avatar name={profile.name} skin={activeSkin} size={52} />
                <div className="user-profile-info">
                  <div className="user-email-text">{accountData?.user.email || "已登录用户"}</div>
                  <div className="user-tag-row">
                    <span className="user-status-pill">● 账号在线</span>
                    {accountData?.checkInStreak ? (
                      <span className="streak-pill">🔥 连签 {accountData.checkInStreak} 天</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="user-stats-grid">
                <div className="stat-card">
                  <span className="stat-label">心愿星余额</span>
                  <span className="stat-value">🌟 {accountData?.points ?? "..."}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">云端备份状态</span>
                  <span className="stat-value">{cloudUpdatedAt ? cloudUpdatedAt : "未备份"}</span>
                </div>
              </div>
            </div>

            {/* Cloud Save Card */}
            <div className="account-section-card">
              <div className="card-heading">
                <span className="card-icon">☁️</span>
                <div>
                  <div className="card-title">云端记忆与存档</div>
                  <div className="card-desc">自动加密保存好感度、对话记忆与专属相册（不包含模型 API Key）</div>
                </div>
              </div>

              <div className="cloud-btn-row">
                <button
                  type="button"
                  className="account-primary-btn"
                  onClick={uploadCloud}
                  disabled={loading}
                >
                  {loading ? "同步中…" : "☁️ 上传当前进度到云端"}
                </button>
                <button
                  type="button"
                  className="account-outline-btn"
                  onClick={downloadCloud}
                  disabled={loading}
                >
                  📥 从云端恢复到本机
                </button>
              </div>
            </div>

            {/* Account Settings / Logout */}
            <div className="account-footer-actions">
              <button
                type="button"
                className="account-danger-link"
                onClick={() => void handleLogout()}
              >
                退出登录
              </button>
            </div>
          </div>
        ) : (
          /* Not logged in view */
          <div className="account-auth-view">
            {/* Tabs */}
            <div className="account-tabs">
              <button
                type="button"
                className={`account-tab ${tab === "login" ? "active" : ""}`}
                onClick={() => { setTab("login"); setNotice(null); }}
              >
                账号登录
              </button>
              <button
                type="button"
                className={`account-tab ${tab === "register" ? "active" : ""}`}
                onClick={() => { setTab("register"); setNotice(null); }}
              >
                注册新账号
              </button>
              <button
                type="button"
                className={`account-tab ${tab === "forgot" ? "active" : ""}`}
                onClick={() => { setTab("forgot"); setNotice(null); }}
              >
                找回密码
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="account-form">
              <div className="form-group">
                <label className="form-label">
                  <span>✉️ 邮箱地址</span>
                </label>
                <input
                  type="email"
                  className="account-input"
                  placeholder="请输入您的常用邮箱（如 name@example.com）"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              {(tab === "register" || tab === "forgot") && (
                <div className="form-group">
                  <label className="form-label">
                    <span>🔢 邮箱验证码</span>
                  </label>
                  <div className="verification-code-row">
                    <input
                      type="text"
                      className="account-input"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="请输入 6 位验证码"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                    />
                    <button
                      type="button"
                      className="account-outline-btn verification-code-btn"
                      onClick={() => void sendVerificationCode()}
                      disabled={sendingCode}
                    >
                      {sendingCode ? "发送中…" : "发送验证码"}
                    </button>
                  </div>
                  <div className="form-hint">验证码 10 分钟内有效，请勿转发给他人。</div>
                </div>
              )}

              <div className="form-group">
                <div className="form-label-row">
                  <label className="form-label">
                    <span>🔒 {tab === "forgot" ? "新登录密码（至少 8 位）" : "登录密码（至少 8 位）"}</span>
                  </label>
                  {tab === "login" && (
                    <button
                      type="button"
                      className="forgot-link"
                      onClick={() => { setTab("forgot"); setNotice(null); }}
                    >
                      忘记密码？
                    </button>
                  )}
                </div>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    className="account-input password-input"
                    placeholder={tab === "forgot" ? "请输入新的登录密码" : "请输入密码（至少 8 位）"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="pwd-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
              </div>

              {(tab === "register" || tab === "forgot") && (
                <div className="form-group">
                  <label className="form-label">
                    <span>🔒 确认{tab === "forgot" ? "新密码" : "密码"}</span>
                  </label>
                  <div className="password-input-wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className="account-input password-input"
                      placeholder="请再次输入新密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="pwd-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      title={showConfirmPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="account-primary-submit-btn"
                disabled={loading}
              >
                {loading
                  ? "请稍候…"
                  : tab === "login"
                    ? "立即登录 / 开启陪伴"
                    : tab === "register"
                      ? "注册并领取 50 心愿星"
                      : "立即重置密码"}
              </button>

              {tab === "register" && (
                <div className="account-perks-box">
                  <div className="perk-item">🎁 注册即赠 <strong>50 心愿星</strong> 专属见面礼</div>
                  <div className="perk-item">☁️ 跨设备无缝漫游，对话记忆与好感度永久云备份</div>
                </div>
              )}

              {tab === "forgot" && (
                <div className="switch-auth-link-row">
                  <span>想起来密码了？</span>
                  <button
                    type="button"
                    className="switch-link-btn"
                    onClick={() => { setTab("login"); setNotice(null); }}
                  >
                    返回登录
                  </button>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

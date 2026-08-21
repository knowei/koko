import { create } from "zustand";
import { persist } from "zustand/middleware";
import { analyzeDiary, analyzeMemory, streamChat, type ChatMsg, type ProviderCfg } from "@/lib/chat";
import { DEFAULT_TTS_SETTINGS, type TTSSettings, ttsPlayer } from "@/lib/tts";
import { extractTagsAndClean, detectExpression, type ExpressionType } from "@/lib/messageParser";
import {
  DEFAULT_PERSONALITY, DEFAULT_PROFILE, GIFTS, MILESTONES, OUTINGS, SHOP_PRODUCTS,
  type CompanionMemory, type CompanionProfile, type MemoryKind, type PersonalityTraits, type RandomEvent, type ReplyStyle, type WeatherInfo,
} from "@/data/persona";

import { apiUrl } from "@/lib/api";

export interface StoredMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
  kind?: "chat" | "event" | "milestone" | "experience" | "hidden";
  hiddenPrompt?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const dateStr = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const todayStr = () => dateStr();
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const accountToken = () => localStorage.getItem("koko-account-token") || "";
async function accountRequest(path: string, init: RequestInit = {}) {
  const token = accountToken();
  if (!token) throw new Error("请先登录后使用心愿星功能。");
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data as Record<string, any>;
}
const hash = (text: string) => [...text].reduce((n, ch) => ((n * 31 + ch.charCodeAt(0)) >>> 0), 2166136261);
const addTraits = (base: PersonalityTraits, changes?: Partial<PersonalityTraits>): PersonalityTraits => ({
  gentle: clamp(base.gentle + (changes?.gentle ?? 0)),
  clingy: clamp(base.clingy + (changes?.clingy ?? 0)),
  tsundere: clamp(base.tsundere + (changes?.tsundere ?? 0)),
  possessive: clamp(base.possessive + (changes?.possessive ?? 0)),
});

export function preferredOuting(affinity: number, profileName: string) {
  const eligible = OUTINGS.filter((outing) => affinity >= outing.minAffinity);
  return eligible[hash(`${todayStr()}:outing-wish:${profileName}`) % eligible.length];
}

export interface PointEntry { id: string; amount: number; reason: string; ts: number }
export interface DiaryEntry { date: string; title: string; content: string; updatedAt: number; emotion?: string; carryover?: string; sealed?: boolean }
export interface Agreement {
  id: string;
  text: string;
  dueDate: string | null;
  status: "pending" | "completed" | "cancelled";
  createdAt: number;
  completedAt?: number;
  lastRemindedDate?: string;
}
export interface Experience {
  id: string;
  title: string;
  detail: string;
  kind: "agreement" | "outing" | "gift" | "event";
  ts: number;
}

const KEEP_RECENT = 14;

function evolvePersonality(current: PersonalityTraits, text: string): PersonalityTraits {
  const next = { ...current };
  const bump = (key: keyof PersonalityTraits, amount: number) => { next[key] = clamp(next[key] + amount); };
  if (/(谢谢|辛苦|难过|累|抱抱|安慰|温柔|晚安)/.test(text)) bump("gentle", 2);
  if (/(想你|陪我|别走|一起|喜欢|可爱|妹妹)/.test(text)) bump("clingy", 2);
  if (/(笨|傻|吐槽|嘴硬|哼|才不|逗你)/.test(text)) bump("tsundere", 2);
  if (/(别人|女朋友|约会|吃醋|只要你|不许|属于)/.test(text)) bump("possessive", 2);
  return next;
}

function extractMemories(text: string): Array<{ text: string; kind: MemoryKind }> {
  const rules: Array<[MemoryKind, RegExp, (value: string) => string]> = [
    ["name", /(?:我叫|我的名字是)\s*([^，。！？\s]{1,12})/, (v) => `用户的名字是${v}`],
    ["preference", /我(?:很|最|比较)?喜欢\s*([^，。！？]{1,30})/, (v) => `用户喜欢${v}`],
    ["preference", /我(?:不喜欢|害怕|怕)\s*([^，。！？]{1,30})/, (v) => `用户不喜欢或害怕${v}`],
    ["habit", /我(?:每天|经常|习惯)\s*([^，。！？]{1,30})/, (v) => `用户经常${v}`],
    ["important", /((?:明天|后天|下周|这个月)[^，。！？]{1,40})/, (v) => `用户提到重要安排：${v}`],
  ];
  return rules.flatMap(([kind, pattern, format]) => {
    const match = text.match(pattern);
    return match ? [{ kind, text: format(match[1].trim()) }] : [];
  });
}

function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateStr(date);
}

function extractAgreement(text: string): Omit<Agreement, "id" | "createdAt"> | null {
  if (!/(提醒我|别忘了|答应|约好|下次一起|一起.*(?:去|看|吃|玩|做)|明天|后天|下周)/.test(text)) return null;
  const cleaned = text.replace(/^(?:那|我们|好呀|好啊|行|嗯|嗯嗯)[，,、\s]*/u, "").trim().slice(0, 80);
  if (cleaned.length < 3) return null;
  const dueDate = /后天/.test(cleaned) ? dateAfter(2) : /明天/.test(cleaned) ? dateAfter(1) : /下周/.test(cleaned) ? dateAfter(7) : null;
  return { text: cleaned, dueDate, status: "pending" };
}

function keywordScore(candidate: string, query: string): number {
  const words = query.replace(/[，。！？、,.!?\s]/g, "").match(/.{1,2}/g) ?? [];
  return words.reduce((score, word) => score + (word.length > 1 && candidate.includes(word) ? 2 : 0), 0);
}

interface State {
  messages: StoredMsg[];
  affinity: number;
  mood: number;
  provider: ProviderCfg;
  lastCheckIn: string | null;
  lastGiftDate: string | null;
  giftsToday: number;
  personality: PersonalityTraits;
  lastOutingDate: string | null;
  replyStyle: ReplyStyle;
  points: number;
  pointLedger: PointEntry[];
  checkInStreak: number;
  inventory: Record<string, number>;
  unlockedSkins: string[];
  activeSkin: string;
  previewSkin: string | null;
  pendingEvent: RandomEvent | null;
  pendingEventInstanceId: string | null;
  eventDate: string | null;
  eventsToday: number;
  eventAttemptsToday: number;
  firstChatDate: string | null;
  profile: CompanionProfile;
  weather: WeatherInfo | null;
  adultMode: boolean;
  memories: CompanionMemory[];
  unlockedMilestones: string[];
  lastActiveAt: number | null;
  lastProactiveAt: number | null;
  diaries: DiaryEntry[];
  agreements: Agreement[];
  experiences: Experience[];
  rollingSummary: string;
  lastAnalyzedMessageCount: number;
  analyzingMemory: boolean;
  analyzingDiary: boolean;
  lastDiaryAnalyzedCount: number;
  lastDiaryAnalyzedDate: string | null;
  streaming: boolean;
  error: string | null;
  ttsSettings: TTSSettings;
  currentlySpeakingId: string | null;
  currentExpression: ExpressionType;
  expressionExpiry: number;

  setProvider: (cfg: ProviderCfg) => void;
  setReplyStyle: (style: ReplyStyle) => void;
  setProfile: (profile: CompanionProfile) => void;
  setWeather: (weather: WeatherInfo | null) => void;
  setAdultMode: (enabled: boolean) => void;
  setPreviewSkin: (skin: string | null) => void;
  setExpression: (expr: ExpressionType, durationMs?: number) => void;
  setTtsSettings: (settings: Partial<TTSSettings>) => void;
  playMessageAudio: (messageId: string) => Promise<void>;
  speakDirectText: (text: string) => Promise<void>;
  stopAudio: () => void;
  quickAction: (actionType: "pat" | "water" | "praise" | "miss") => Promise<void>;
  addMemory: (text: string, kind?: MemoryKind) => void;
  removeMemory: (id: string) => void;
  removeDiary: (date: string) => void;
  removeExperience: (id: string) => void;
  addAgreement: (text: string, dueDate?: string | null) => void;
  updateAgreementStatus: (id: string, status: Agreement["status"]) => void;
  snoozeAgreement: (id: string) => void;
  checkAgreementReminders: () => void;
  refreshMemoryAnalysis: () => Promise<void>;
  refreshDiaryAnalysis: () => Promise<void>;
  greetOnReturn: () => void;
  proactivePing: () => void;
  markActive: () => void;
  exportSave: () => Record<string, unknown>;
  importSave: (data: unknown) => string | null;
  send: (text: string) => Promise<void>;
  syncWallet: () => Promise<void>;
  clearWallet: () => void;
  dailyCheckIn: () => Promise<string | null>;
  giveGift: (id: string) => Promise<string | null>;
  goOut: (id: string) => string | null;
  buyProduct: (id: string) => Promise<string>;
  equipSkin: (id: string) => string;
  maybeTriggerEvent: (source: "checkin" | "chat" | "outing") => Promise<void>;
  chooseEvent: (choiceId: string) => Promise<string | null>;
  dismissEvent: () => void;
  tapTopic: (label: string) => void;
  resetMemory: () => void;
  clearError: () => void;
  _runTurn: (reward?: { affinity: number; mood: number }) => Promise<void>;
}

function earlierDigest(msgs: StoredMsg[]): string {
  if (msgs.length <= KEEP_RECENT) return "";
  const older = msgs.slice(0, msgs.length - KEEP_RECENT);
  const text = older
    .map((m) => `${m.role === "user" ? "用户" : "可可"}：${m.content}`)
    .join("  ");
  return text.length > 500 ? "…" + text.slice(text.length - 500) : text;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      messages: [],
      affinity: 5,
      mood: 60,
      provider: { mode: "default" },
      lastCheckIn: null,
      lastGiftDate: null,
      giftsToday: 0,
      personality: DEFAULT_PERSONALITY,
      lastOutingDate: null,
      replyStyle: "immersive",
      points: 50,
      pointLedger: [{ id: "welcome", amount: 50, reason: "初次见面礼", ts: Date.now() }],
      checkInStreak: 0,
      inventory: {},
      unlockedSkins: ["blue"],
      activeSkin: "blue",
      previewSkin: null,
      pendingEvent: null,
      pendingEventInstanceId: null,
      eventDate: null,
      eventsToday: 0,
      eventAttemptsToday: 0,
      firstChatDate: null,
      profile: DEFAULT_PROFILE,
      weather: null,
      adultMode: false,
      memories: [],
      unlockedMilestones: [],
      lastActiveAt: null,
      lastProactiveAt: null,
      diaries: [],
      agreements: [],
      experiences: [],
      rollingSummary: "",
      lastAnalyzedMessageCount: 0,
      analyzingMemory: false,
      analyzingDiary: false,
      lastDiaryAnalyzedCount: 0,
      lastDiaryAnalyzedDate: null,
      streaming: false,
      error: null,
      ttsSettings: DEFAULT_TTS_SETTINGS,
      currentlySpeakingId: null,
      currentExpression: "normal" as ExpressionType,
      expressionExpiry: 0,

      setProvider: (cfg) => set({ provider: cfg }),
      setReplyStyle: (replyStyle) => set({ replyStyle }),
      setProfile: (profile) => set({ profile: { ...profile, age: Math.max(18, Math.min(99, profile.age)) } }),
      setPreviewSkin: (previewSkin) => set({ previewSkin }),
      setExpression: (expr, durationMs = 8000) => {
        const expiry = Date.now() + durationMs;
        set({ currentExpression: expr, expressionExpiry: expiry });
        setTimeout(() => {
          if (get().expressionExpiry <= Date.now()) {
            set({ currentExpression: "normal" });
          }
        }, durationMs);
      },
      setTtsSettings: (patch) => set((s) => ({ ttsSettings: { ...s.ttsSettings, ...patch } })),
      playMessageAudio: async (messageId) => {
        const state = get();
        const msg = state.messages.find((m) => m.id === messageId);
        if (!msg || !msg.content.trim()) return;
        await ttsPlayer.play({
          messageId,
          text: msg.content,
          settings: state.ttsSettings,
          mood: state.mood,
          hour: new Date().getHours(),
        });
      },
      speakDirectText: async (text: string) => {
        const state = get();
        if (!text || !text.trim()) return;
        await ttsPlayer.play({
          messageId: `direct-${Date.now()}`,
          text,
          settings: state.ttsSettings,
          mood: state.mood,
          hour: new Date().getHours(),
        });
      },
      stopAudio: () => {
        ttsPlayer.stop();
      },
      quickAction: async (actionType) => {
        if (get().streaming) return;
        const profile = get().profile;
        const actions: Record<string, { label: string; hidden: string; affinity: number; mood: number; trait: Partial<PersonalityTraits> }> = {
          pat: {
            label: `（轻轻摸了摸${profile.name}的头）`,
            hidden: `用户伸手温柔地揉了揉你的头发。请根据你现在的性格和心情，做出软萌害羞或开心的真实反应。`,
            affinity: 2, mood: 5, trait: { gentle: 2, clingy: 1 }
          },
          water: {
            label: `（递给${profile.name}一杯温热的水）`,
            hidden: `用户贴心地递给你一杯温水。请开心地接过并向对方表达感谢。`,
            affinity: 1, mood: 4, trait: { gentle: 2 }
          },
          praise: {
            label: `（笑着夸奖）“${profile.name}今天也超级可爱呢。”`,
            hidden: `用户认真地夸奖你今天超级可爱。请根据你现在的性格做出害羞、傲娇或开心黏人的反应。`,
            affinity: 3, mood: 8, trait: { clingy: 2, tsundere: 1 }
          },
          miss: {
            label: `（伸手轻轻抱了抱${profile.name}）`,
            hidden: `用户伸手轻轻抱住了你，告诉你他很在乎你。请给出最温暖、贴心且有依恋感的回应。`,
            affinity: 4, mood: 9, trait: { clingy: 3, possessive: 1 }
          },
        };
        const act = actions[actionType];
        if (!act) return;
        set((s) => ({
          lastActiveAt: Date.now(),
          mood: clamp(s.mood + act.mood),
          affinity: clamp(s.affinity + act.affinity),
          personality: addTraits(s.personality, act.trait),
          messages: [
            ...s.messages,
            { id: uid(), role: "user", content: act.label, hiddenPrompt: act.hidden, ts: Date.now(), kind: "chat" },
          ],
        }));
        await get()._runTurn();
        get().maybeTriggerEvent("chat");
      },
      setWeather: (weather) => set({ weather }),
      setAdultMode: (adultMode) => set({ adultMode }),
      syncWallet: async () => {
        if (!accountToken()) {
          set({ points: 0, inventory: {}, unlockedSkins: ["blue"], activeSkin: "blue", lastCheckIn: null, checkInStreak: 0 });
          return;
        }
        try {
          const data = await accountRequest("/api/account");
          const serverSkins = Array.isArray(data.assets) ? data.assets
            .filter((asset: unknown): asset is string => typeof asset === "string" && asset.startsWith("skin:"))
            .map((asset: string) => asset.slice(5)) : [];
          set({
            points: Number(data.points) || 0,
            inventory: data.inventory && typeof data.inventory === "object" ? data.inventory : {},
            unlockedSkins: ["blue", ...serverSkins.filter((skin: string) => skin !== "blue")],
            lastCheckIn: typeof data.lastCheckIn === "string" ? data.lastCheckIn : null,
            checkInStreak: Number(data.checkInStreak) || 0,
            pendingEvent: data.pendingEvent?.event || null,
            pendingEventInstanceId: typeof data.pendingEvent?.instanceId === "string" ? data.pendingEvent.instanceId : null,
          });
        } catch {
          // Login state and errors are shown in settings; chatting remains available.
        }
      },
      clearWallet: () => set({ points: 0, inventory: {}, unlockedSkins: ["blue"], activeSkin: "blue", lastCheckIn: null, checkInStreak: 0, pendingEvent: null, pendingEventInstanceId: null }),
      addMemory: (text, kind = "important") => {
        const value = text.trim();
        if (!value) return;
        set((s) => s.memories.some((item) => item.text === value) ? s : ({ memories: [...s.memories, { id: uid(), text: value, kind, ts: Date.now() }].slice(-50) }));
      },
      removeMemory: (id) => set((s) => ({ memories: s.memories.filter((item) => item.id !== id) })),
      removeDiary: (date) => set((s) => ({ diaries: s.diaries.filter((item) => item.date !== date) })),
      removeExperience: (id) => set((s) => ({ experiences: s.experiences.filter((item) => item.id !== id) })),
      addAgreement: (text, dueDate = null) => {
        const value = text.trim().slice(0, 80);
        if (!value) return;
        const agreement: Agreement = { id: uid(), text: value, dueDate, status: "pending", createdAt: Date.now() };
        set((s) => s.agreements.some((item) => item.status === "pending" && item.text === value) ? s : ({
          agreements: [...s.agreements, agreement].slice(-50),
        }));
      },
      updateAgreementStatus: (id, status) => set((s) => {
        const target = s.agreements.find((item) => item.id === id);
        if (!target || target.status === status) return s;
        const agreements = s.agreements.map((item) => item.id === id
          ? { ...item, status, completedAt: status === "completed" ? Date.now() : item.completedAt }
          : item);
        if (status !== "completed") return { agreements };
        const experienceText = `共同完成约定：${target.text}`;
        const experienceMemory: CompanionMemory = { id: uid(), text: experienceText, kind: "important", ts: Date.now() };
        const experience: Experience = { id: uid(), title: "兑现了约定", detail: target.text, kind: "agreement", ts: Date.now() };
        const today = todayStr();
        const existing = s.diaries.find((entry) => entry.date === today);
        const diary: DiaryEntry = existing
          ? { ...existing, content: `${existing.content}\n\n今天我们完成了约定：${target.text}`, updatedAt: Date.now() }
          : { date: today, title: `${today} · 和${s.profile.userNickname}的一天`, content: `今天我们完成了约定：${target.text}\n\n我想把这一点点兑现的心意认真记下来。`, updatedAt: Date.now() };
        return {
          agreements,
          memories: s.memories.some((item) => item.text === experienceText) ? s.memories : [...s.memories, experienceMemory].slice(-50),
          experiences: [...s.experiences, experience].slice(-100),
          messages: [...s.messages, { id: uid(), role: "assistant", content: `🎞️ ${experience.title}\n${experience.detail}`, ts: Date.now(), kind: "experience" }],
          diaries: [...s.diaries.filter((entry) => entry.date !== today), diary].slice(-90),
        };
      }),
      snoozeAgreement: (id) => set((s) => ({
        agreements: s.agreements.map((agreement) => agreement.id === id && agreement.status === "pending"
          ? { ...agreement, dueDate: dateAfter(1), lastRemindedDate: undefined }
          : agreement),
      })),
      checkAgreementReminders: () => {
        const state = get();
        if (state.streaming) return;
        const today = todayStr();
        const due = state.agreements
          .filter((agreement) => agreement.status === "pending" && agreement.dueDate && agreement.dueDate <= today && agreement.lastRemindedDate !== today)
          .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
        if (!due) return;
        const overdue = due.dueDate! < today;
        set((s) => ({
          agreements: s.agreements.map((agreement) => agreement.id === due.id ? { ...agreement, lastRemindedDate: today } : agreement),
          messages: [...s.messages, {
            id: uid(), role: "user", content: "", ts: Date.now(), kind: "hidden",
            hiddenPrompt: overdue
              ? `你们约好的“${due.text}”已经过了预计日期。温和自然地问一句是否完成、需要改到明天或取消，不要责备，不要重复解释系统。`
              : `今天是你们约好的“${due.text}”的预计日期。像亲近的妹妹一样自然提醒一句，并询问完成了还是要改到明天。`,
          }],
        }));
        void get()._runTurn();
      },
      refreshMemoryAnalysis: async () => {
        const state = get();
        if (state.analyzingMemory) return;
        const chatMessages = state.messages
          .filter((message) => message.kind === "chat" && message.content.trim())
          .map((message) => ({ role: message.role, content: message.content }));
        if (!chatMessages.length) return;
        set({ analyzingMemory: true });
        try {
          const result = await analyzeMemory({
            previousSummary: state.rollingSummary,
            messages: chatMessages.slice(-24),
            provider: state.provider,
            today: todayStr(),
          });
          if (!result.available) {
            set({ analyzingMemory: false, lastAnalyzedMessageCount: chatMessages.length });
            return;
          }
          set((current) => {
            const newMemories = (result.memories ?? [])
              .filter((item) => !current.memories.some((memory) => memory.text === item.text))
              .map((item) => ({ ...item, id: uid(), ts: Date.now() }));
            const newAgreements = (result.agreements ?? [])
              .filter((item) => !current.agreements.some((agreement) => agreement.status === "pending" && agreement.text === item.text))
              .map((item) => ({ ...item, id: uid(), status: "pending" as const, createdAt: Date.now() }));
            return {
              analyzingMemory: false,
              lastAnalyzedMessageCount: chatMessages.length,
              rollingSummary: result.summary?.trim() || current.rollingSummary,
              memories: [...current.memories, ...newMemories].slice(-50),
              agreements: [...current.agreements, ...newAgreements].slice(-50),
            };
          });
        } catch {
          set({ analyzingMemory: false });
        }
      },
      refreshDiaryAnalysis: async () => {
        const state = get();
        if (state.analyzingDiary) return;
        const today = todayStr();
        const todayMessages = state.messages.filter((message) => message.kind === "chat" && message.content.trim() && dateStr(new Date(message.ts)) === today);
        if (!todayMessages.some((message) => message.role === "user")) return;
        set({ analyzingDiary: true });
        try {
          const result = await analyzeDiary({
            date: today,
            profile: { name: state.profile.name, userNickname: state.profile.userNickname },
            messages: todayMessages.map((message) => ({ role: message.role, content: message.content })),
            experiences: state.experiences.filter((item) => dateStr(new Date(item.ts)) === today).map((item) => ({ title: item.title, detail: item.detail, kind: item.kind })),
            agreements: state.agreements.filter((item) => dateStr(new Date(item.createdAt)) === today || (item.completedAt && dateStr(new Date(item.completedAt)) === today)).map((item) => ({ text: item.text, status: item.status, dueDate: item.dueDate })),
            provider: state.provider,
          });
          set((current) => {
            const sealed = current.diaries.map((entry) => entry.date < today ? { ...entry, sealed: true } : entry);
            if (!result.available || !result.content) return { analyzingDiary: false, lastDiaryAnalyzedCount: todayMessages.length, lastDiaryAnalyzedDate: today, diaries: sealed };
            const diary: DiaryEntry = {
              date: today,
              title: result.title || `${today} · 和${current.profile.userNickname}的一天`,
              content: result.content,
              emotion: result.emotion,
              carryover: result.carryover,
              sealed: false,
              updatedAt: Date.now(),
            };
            return { analyzingDiary: false, lastDiaryAnalyzedCount: todayMessages.length, lastDiaryAnalyzedDate: today, diaries: [...sealed.filter((entry) => entry.date !== today), diary].slice(-90) };
          });
        } catch {
          set({ analyzingDiary: false });
        }
      },
      markActive: () => set({ lastActiveAt: Date.now() }),
      greetOnReturn: () => {
        const state = get();
        const now = Date.now();
        const gap = state.lastActiveAt ? now - state.lastActiveAt : 0;
        set({ lastActiveAt: now });
        if (!state.lastActiveAt || gap < 2 * 60 * 60_000 || state.streaming) return;
        const hint = gap >= 24 * 60 * 60_000
          ? "用户隔了一天以上才回来。自然表达想念和关心，不要责怪。"
          : "用户离开了几个小时后回来。像家人一样自然打招呼并问问刚才在忙什么。";
        set((s) => ({ messages: [...s.messages, { id: uid(), role: "user", content: "", hiddenPrompt: hint, ts: now, kind: "hidden" }] }));
        void get()._runTurn();
      },
      proactivePing: () => {
        const state = get();
        const now = Date.now();
        if (state.streaming || (state.lastProactiveAt && now - state.lastProactiveAt < 30 * 60_000)) return;
        set((s) => ({
          lastProactiveAt: now,
          messages: [...s.messages, {
            id: uid(), role: "user", content: "", ts: now, kind: "hidden",
            hiddenPrompt: "用户安静了一会儿。结合你此刻的作息、天气和最近聊天，主动说一句自然简短的话；不要说自己在执行任务。",
          }],
        }));
        void get()._runTurn();
      },
      exportSave: () => {
        const s = get();
        const { provider: _provider, streaming: _streaming, error: _error, ...save } = s;
        return { version: 1, exportedAt: Date.now(), state: {
          messages: save.messages, affinity: save.affinity, mood: save.mood, personality: save.personality,
          replyStyle: save.replyStyle, points: save.points, pointLedger: save.pointLedger,
          inventory: save.inventory, unlockedSkins: save.unlockedSkins, activeSkin: save.activeSkin,
          lastCheckIn: save.lastCheckIn, lastGiftDate: save.lastGiftDate, giftsToday: save.giftsToday,
          checkInStreak: save.checkInStreak, lastOutingDate: save.lastOutingDate,
          eventDate: save.eventDate, eventsToday: save.eventsToday,
          eventAttemptsToday: save.eventAttemptsToday, firstChatDate: save.firstChatDate,
          profile: save.profile, weather: save.weather, adultMode: save.adultMode,
          memories: save.memories, unlockedMilestones: save.unlockedMilestones,
          diaries: save.diaries,
          agreements: save.agreements,
          experiences: save.experiences,
          rollingSummary: save.rollingSummary,
          lastAnalyzedMessageCount: save.lastAnalyzedMessageCount,
          lastDiaryAnalyzedCount: save.lastDiaryAnalyzedCount,
          lastDiaryAnalyzedDate: save.lastDiaryAnalyzedDate,
        } };
      },
      importSave: (data) => {
        if (!data || typeof data !== "object") return "存档格式无效";
        const root = data as { version?: number; state?: Partial<State> };
        if (root.version !== 1 || !root.state || !Array.isArray(root.state.messages)) return "不支持的存档版本";
        const current = get();
        const incoming = root.state;
        set({
          messages: incoming.messages ?? current.messages,
          affinity: typeof incoming.affinity === "number" ? clamp(incoming.affinity) : current.affinity,
          mood: typeof incoming.mood === "number" ? clamp(incoming.mood) : current.mood,
          personality: incoming.personality ?? current.personality,
          replyStyle: incoming.replyStyle ?? current.replyStyle,
          points: typeof incoming.points === "number" ? Math.max(0, incoming.points) : current.points,
          pointLedger: Array.isArray(incoming.pointLedger) ? incoming.pointLedger : current.pointLedger,
          inventory: incoming.inventory ?? current.inventory,
          unlockedSkins: Array.isArray(incoming.unlockedSkins) ? incoming.unlockedSkins : current.unlockedSkins,
          activeSkin: incoming.activeSkin ?? current.activeSkin,
          lastCheckIn: incoming.lastCheckIn ?? null, lastGiftDate: incoming.lastGiftDate ?? null,
          giftsToday: incoming.giftsToday ?? 0, checkInStreak: incoming.checkInStreak ?? 0,
          lastOutingDate: incoming.lastOutingDate ?? null, pendingEvent: current.pendingEvent,
          pendingEventInstanceId: current.pendingEventInstanceId,
          eventDate: incoming.eventDate ?? null, eventsToday: incoming.eventsToday ?? 0,
          eventAttemptsToday: incoming.eventAttemptsToday ?? 0, firstChatDate: incoming.firstChatDate ?? null,
          profile: incoming.profile ?? current.profile, weather: incoming.weather ?? null,
          adultMode: incoming.adultMode === true,
          memories: Array.isArray(incoming.memories) ? incoming.memories : [],
          unlockedMilestones: Array.isArray(incoming.unlockedMilestones) ? incoming.unlockedMilestones : [],
          diaries: Array.isArray(incoming.diaries) ? incoming.diaries : [],
          agreements: Array.isArray(incoming.agreements) ? incoming.agreements : [],
          experiences: Array.isArray(incoming.experiences) ? incoming.experiences : [],
          rollingSummary: typeof incoming.rollingSummary === "string" ? incoming.rollingSummary.slice(0, 900) : "",
          lastAnalyzedMessageCount: typeof incoming.lastAnalyzedMessageCount === "number" ? Math.max(0, incoming.lastAnalyzedMessageCount) : 0,
          analyzingMemory: false,
          analyzingDiary: false,
          lastDiaryAnalyzedCount: typeof incoming.lastDiaryAnalyzedCount === "number" ? Math.max(0, incoming.lastDiaryAnalyzedCount) : 0,
          lastDiaryAnalyzedDate: typeof incoming.lastDiaryAnalyzedDate === "string" ? incoming.lastDiaryAnalyzedDate : null,
          provider: current.provider, streaming: false, error: null,
        });
        return null;
      },
      clearError: () => set({ error: null }),

      tapTopic: (label) => {
        if (get().streaming) return;
        set((s) => ({
          mood: clamp(s.mood + 1),
          messages: [
            ...s.messages,
            { id: uid(), role: "user", content: `我想跟你聊聊「${label}」`, ts: Date.now(), kind: "event" },
          ],
        }));
        void get()._runTurn();
      },

      dailyCheckIn: async () => {
        const current = get();
        if (current.lastCheckIn === todayStr()) return "今天已经签到过了。";
        if (current.streaming) return "等可可说完再签到吧。";
        let data: Record<string, any>;
        try { data = await accountRequest("/api/rewards/check-in", { method: "POST" }); }
        catch (error) { return error instanceof Error ? error.message : "签到失败。"; }
        const earned = Number(data.amount) || 0;
        const streak = Number(data.streak) || 1;
        const hasBonus = earned > 10;
        set((s) => ({
          lastCheckIn: String(data.lastCheckIn),
          checkInStreak: streak,
          points: Number(data.points) || 0,
          pointLedger: [...s.pointLedger, { id: uid(), amount: earned, reason: hasBonus ? `签到 ${streak} 天（含连续奖励）` : "每日签到", ts: Date.now() }].slice(-100),
          messages: [
            ...s.messages,
            { id: uid(), role: "user", content: `今日签到，获得 ${earned} 心愿星 ✦`, ts: Date.now(), kind: "event" },
          ],
        }));
        void get()._runTurn({ affinity: 2, mood: 10 }).then(() => get().maybeTriggerEvent("checkin"));
        return null;
      },

      giveGift: async (id) => {
        const gift = GIFTS.find((g) => g.id === id);
        if (!gift) return null;
        if (get().streaming) return "等我把话说完再送嘛~";
        const t = todayStr();
        const s = get();
        if ((s.inventory[id] ?? 0) <= 0) return `背包里没有${gift.name}，先去商城兑换吧~`;
        const giftsToday = s.lastGiftDate === t ? s.giftsToday : 0;
        if (giftsToday >= 3) return "今天已经收到好多礼物啦，明天再宠我好不好~";
        let data: Record<string, any>;
        try { data = await accountRequest("/api/inventory/use", { method: "POST", body: JSON.stringify({ itemId: id }) }); }
        catch (error) { return error instanceof Error ? error.message : "赠送失败。"; }
        set({
          lastGiftDate: t,
          giftsToday: giftsToday + 1,
          inventory: { ...s.inventory, [id]: Number(data.quantity) || 0 },
          experiences: [...s.experiences, { id: uid(), title: `送给${s.profile.name}一份礼物`, detail: `${gift.emoji} ${gift.name}`, kind: "gift" as const, ts: Date.now() }].slice(-100),
          messages: [
            ...s.messages,
            {
              id: uid(),
              role: "user",
              content: `我送了你一份${gift.name}${gift.emoji}`,
              ts: Date.now(),
              kind: "event",
            },
          ],
        });
        void get()._runTurn({ affinity: gift.affinity, mood: gift.mood });
        return null;
      },

      goOut: (id) => {
        const outing = OUTINGS.find((item) => item.id === id);
        if (!outing) return null;
        const state = get();
        if (state.streaming) return "等可可说完再出门嘛~";
        if (state.affinity < outing.minAffinity) return `亲密度 ${outing.minAffinity} 才能解锁哦`;
        const today = todayStr();
        if (state.lastOutingDate === today) return "今天已经一起出过门啦，明天再去别的地方吧~";
        const wished = preferredOuting(state.affinity, state.profile.name);
        const matchedWish = wished.id === outing.id;
        const affinityReward = matchedWish ? outing.affinity * 2 : outing.affinity;
        set({
          lastOutingDate: today,
          experiences: [...state.experiences, {
            id: uid(), title: `一起去了${outing.name}`, detail: matchedWish ? "选中了她今天最想去的地方，心有灵犀。" : outing.prompt,
            kind: "outing" as const, ts: Date.now(),
          }].slice(-100),
          messages: [...state.messages, {
            id: uid(), role: "user", ts: Date.now(), kind: "event",
            content: `今天和可可去了${outing.name}${outing.emoji}${matchedWish ? ` · 心有灵犀，好感奖励 ×2（+${affinityReward}）` : ""}`,
            hiddenPrompt: `今天和哥哥去了${outing.name}。${matchedWish ? "这正是你今天最想去的地方，表现出惊喜和心有灵犀的开心。" : ""}${outing.prompt}。直接以可可的口吻回应，不要解释任务。`,
          }],
        });
        void get()._runTurn({ affinity: affinityReward, mood: outing.mood }).then(() => get().maybeTriggerEvent("outing"));
        return null;
      },

      buyProduct: async (id) => {
        const product = SHOP_PRODUCTS.find((item) => item.id === id);
        if (!product) return "商品不存在";
        if (product.available === false) return "这件皮肤还在制作中";
        if (product.type === "skin" && get().unlockedSkins.includes(product.refId)) return "这套衣服已经拥有啦";
        let data: Record<string, any>;
        try { data = await accountRequest("/api/assets/purchase", { method: "POST", body: JSON.stringify({ productId: id }) }); }
        catch (error) { return error instanceof Error ? error.message : "兑换失败。"; }
        set((s) => ({
          points: Number(data.points) || 0,
          pointLedger: [...s.pointLedger, { id: uid(), amount: -product.price, reason: `兑换${product.name}`, ts: Date.now() }].slice(-100),
          inventory: product.type === "gift" ? { ...s.inventory, [product.refId]: Number(data.quantity) || 0 } : s.inventory,
          unlockedSkins: product.type === "skin" ? [...s.unlockedSkins, product.refId] : s.unlockedSkins,
        }));
        return `兑换成功：${product.name}`;
      },

      equipSkin: (id) => {
        if (!get().unlockedSkins.includes(id)) return "还没有解锁这套衣服";
        set({ activeSkin: id });
        return id === "green" ? "可可换上了薄荷绿裙" : "可可换回了浅蓝裙";
      },

      maybeTriggerEvent: async (source) => {
        const state = get();
        if (state.pendingEvent || !accountToken()) return;
        try {
          const data = await accountRequest("/api/events/trigger", { method: "POST", body: JSON.stringify({ source, affinity: state.affinity }) });
          set((current) => ({
            eventDate: todayStr(),
            eventAttemptsToday: Number(data.attempts) || current.eventAttemptsToday,
            firstChatDate: source === "chat" ? todayStr() : current.firstChatDate,
            pendingEvent: data.triggered && data.event ? data.event as RandomEvent : null,
            pendingEventInstanceId: data.triggered && typeof data.instanceId === "string" ? data.instanceId : null,
          }));
        } catch {
          // A reward event failure must not interrupt chatting or outings.
        }
      },

      chooseEvent: async (choiceId) => {
        const state = get();
        const event = state.pendingEvent;
        const choice = event?.choices.find((item) => item.id === choiceId);
        if (!event || !choice) return "事件选项不存在。";
        let data: Record<string, any>;
        if (!state.pendingEventInstanceId) return "这个事件还没有服务端凭证，请刷新后重试。";
        try { data = await accountRequest("/api/rewards/event", { method: "POST", body: JSON.stringify({ instanceId: state.pendingEventInstanceId, eventId: event.id, choiceId }) }); }
        catch (error) { return error instanceof Error ? error.message : "奖励领取失败。"; }
        const reward = Number(data.amount) || 0;
        const affinity = clamp(state.affinity + choice.affinity);
        const unlocked = MILESTONES.filter((item) => affinity >= item.affinity && !state.unlockedMilestones.includes(item.id));
        set((s) => ({
          pendingEvent: null,
          pendingEventInstanceId: null,
          eventsToday: (s.eventDate === todayStr() ? s.eventsToday : 0) + 1,
          points: Number(data.points) || 0,
          affinity,
          mood: clamp(s.mood + choice.mood),
          personality: addTraits(s.personality, choice.personality),
          pointLedger: [...s.pointLedger, { id: uid(), amount: reward, reason: `事件：${event.title}`, ts: Date.now() }].slice(-100),
          unlockedMilestones: [...s.unlockedMilestones, ...unlocked.map((item) => item.id)],
          experiences: [...s.experiences, { id: uid(), title: event.title, detail: choice.result, kind: "event" as const, ts: Date.now() }].slice(-100),
          messages: [...s.messages, {
            id: uid(), role: "user", ts: Date.now(), kind: "event",
            content: `${event.emoji} ${event.title} · ${choice.result} · 获得 ${reward} 心愿星`,
            hiddenPrompt: `刚刚发生了“${event.title}”：${choice.result}。请以可可的口吻自然回应这段经历。`,
          }, ...unlocked.map((item) => ({ id: uid(), role: "assistant" as const, content: item.text, ts: Date.now(), kind: "milestone" as const }))],
        }));
        void get()._runTurn();
        return null;
      },
      dismissEvent: () => set({ pendingEvent: null, pendingEventInstanceId: null }),

      resetMemory: () =>
        set({
          messages: [], affinity: 5, mood: 60, personality: DEFAULT_PERSONALITY,
          lastCheckIn: null, lastGiftDate: null, giftsToday: 0, lastOutingDate: null,
          pendingEvent: null, pendingEventInstanceId: null, eventDate: null, eventsToday: 0, eventAttemptsToday: 0, firstChatDate: null,
          adultMode: false, memories: [], unlockedMilestones: [], diaries: [], agreements: [], experiences: [], rollingSummary: "", lastAnalyzedMessageCount: 0, analyzingMemory: false, analyzingDiary: false, lastDiaryAnalyzedCount: 0, lastDiaryAnalyzedDate: null, lastProactiveAt: null,
        }),

      send: async (text) => {
        const trimmed = text.trim();
        if (!trimmed || get().streaming) return;
        const extracted = extractMemories(trimmed);
        const agreement = extractAgreement(trimmed);
        set((s) => ({
          personality: evolvePersonality(s.personality, trimmed),
          lastActiveAt: Date.now(),
          memories: [...s.memories, ...extracted
            .filter((candidate) => !s.memories.some((item) => item.text === candidate.text))
            .map((candidate) => ({ ...candidate, id: uid(), ts: Date.now() }))].slice(-50),
          agreements: agreement && !s.agreements.some((item) => item.status === "pending" && item.text === agreement.text)
            ? [...s.agreements, { ...agreement, id: uid(), createdAt: Date.now() }].slice(-50)
            : s.agreements,
          messages: [
            ...s.messages,
            { id: uid(), role: "user", content: trimmed, ts: Date.now(), kind: "chat" },
          ],
        }));
        await get()._runTurn({ affinity: 1, mood: 2 });
        get().maybeTriggerEvent("chat");
      },

      _runTurn: async (reward) => {
        if (get().streaming) return;
        const assistantId = uid();
        set((s) => ({
          error: null,
          streaming: true,
          messages: [
            ...s.messages,
            { id: assistantId, role: "assistant", content: "", ts: Date.now(), kind: "chat" },
          ],
        }));

        const state = get();
        const history = state.messages.filter((m) => m.id !== assistantId && (m.content.trim() !== "" || Boolean(m.hiddenPrompt)));
        const recent = history.slice(-KEEP_RECENT);
        const apiMessages: ChatMsg[] = recent.map((m) => ({ role: m.role, content: m.hiddenPrompt ?? m.content }));
        const lastUserText = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
        const relevantMemories = [...state.memories]
          .sort((a, b) => keywordScore(b.text, lastUserText) - keywordScore(a.text, lastUserText) || b.ts - a.ts)
          .slice(0, 5);
        const experienceMemories: CompanionMemory[] = [...state.experiences]
          .sort((a, b) => keywordScore(`${b.title}${b.detail}`, lastUserText) - keywordScore(`${a.title}${a.detail}`, lastUserText) || b.ts - a.ts)
          .slice(0, 2)
          .map((item) => ({ id: `experience-${item.id}`, kind: "important", ts: item.ts, text: `你们的共同经历：${item.title}；${item.detail}` }));
        const diaryMemories: CompanionMemory[] = [...state.diaries]
          .filter((entry) => entry.date < todayStr())
          .sort((a, b) => keywordScore(`${b.title}${b.content}`, lastUserText) - keywordScore(`${a.title}${a.content}`, lastUserText) || b.date.localeCompare(a.date))
          .slice(0, 2)
          .map((entry) => ({
            id: `diary-${entry.date}`, kind: "important", ts: entry.updatedAt,
            text: `过去的关系日记（${entry.date}，情绪：${entry.emotion || "未记录"}）：${entry.content.slice(0, 180)}${entry.carryover ? `；可自然延续：${entry.carryover}` : ""}`,
          }));
        const pendingAgreements = state.agreements.filter((item) => item.status === "pending");
        const agreementMemories: CompanionMemory[] = pendingAgreements
          .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
          .slice(0, 3)
          .map((item) => ({ id: `agreement-${item.id}`, kind: "important", ts: item.createdAt, text: `你们的待完成约定：${item.text}${item.dueDate ? `（预计 ${item.dueDate}）` : ""}` }));
        await streamChat(
          { context: {
            affinity: state.affinity, mood: state.mood, earlierDigest: state.rollingSummary || earlierDigest(history),
            personality: state.personality, replyStyle: state.replyStyle, hour: new Date().getHours(),
            profile: state.profile, weather: state.weather, adultMode: state.adultMode, memories: [...relevantMemories, ...experienceMemories, ...diaryMemories, ...agreementMemories],
          }, messages: apiMessages, provider: state.provider },
          {
            onDelta: (t) =>
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + t } : m,
                ),
              })),
            onDone: () => {
              if (!get().streaming) return;
              const curState = get();
              const finalMsg = curState.messages.find((m) => m.id === assistantId);
              const rawContent = finalMsg?.content || "";
              const { cleanedText, expression, moodDelta, affinityDelta } = extractTagsAndClean(rawContent);
              const detectedExpr = detectExpression(cleanedText, expression);

              if (detectedExpr && detectedExpr !== "normal") {
                get().setExpression(detectedExpr, 8000);
              }

              set((s) => {
                let affinity = reward ? clamp(s.affinity + reward.affinity) : s.affinity;
                if (affinityDelta) affinity = clamp(affinity + affinityDelta);
                let mood = reward ? clamp(s.mood + reward.mood) : s.mood;
                if (moodDelta) mood = clamp(mood + moodDelta);

                const unlocked = MILESTONES.filter((item) => affinity >= item.affinity && !s.unlockedMilestones.includes(item.id));
                const today = todayStr();
                const updatedMessages = s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: cleanedText } : m,
                );
                const todayMessages = updatedMessages.filter((message) => message.kind === "chat" && message.content.trim() && dateStr(new Date(message.ts)) === today);
                const snippets = todayMessages
                  .slice(-6)
                  .map((message) => `${message.role === "user" ? s.profile.userNickname : s.profile.name}：“${message.content.replace(/\s+/g, " ").slice(0, 70)}”`);
                const feeling = mood >= 70 ? "今天和你说话时，我心里暖暖的，也很开心。"
                  : mood < 35 ? "今天的心情有点低落，不过能和你说说话让我安心了一些。"
                    : affinity >= 50 ? "我们越来越有默契了，我想把这些普通的小事也认真记下来。"
                      : "今天又多了解了你一点，希望明天也能继续聊。";
                const diary: DiaryEntry = {
                  date: today, title: `${today} · 和${s.profile.userNickname}的一天`,
                  content: `${snippets.join("\n")}\n\n${feeling}`,
                  updatedAt: Date.now(),
                };
                return {
                  streaming: false,
                  affinity,
                  mood,
                  unlockedMilestones: [...s.unlockedMilestones, ...unlocked.map((item) => item.id)],
                  messages: [...updatedMessages, ...unlocked.map((item) => ({
                    id: uid(), role: "assistant" as const, content: item.text, ts: Date.now(), kind: "milestone" as const,
                    hiddenPrompt: item.title,
                  }))],
                  diaries: todayMessages.some((message) => message.role === "user") && !s.diaries.some((item) => item.date === today && item.emotion)
                    ? [...s.diaries.filter((item) => item.date !== today), diary].slice(-90)
                    : s.diaries,
                };
              });
              const afterTurn = get();
              if (afterTurn.ttsSettings.enabled && afterTurn.ttsSettings.autoPlay) {
                void afterTurn.playMessageAudio(assistantId);
              }
              const chatCount = afterTurn.messages.filter((message) => message.kind === "chat" && message.content.trim()).length;
              if (chatCount >= afterTurn.lastAnalyzedMessageCount + 8) void afterTurn.refreshMemoryAnalysis();
              const today = todayStr();
              const todayChatCount = afterTurn.messages.filter((message) => message.kind === "chat" && message.content.trim() && dateStr(new Date(message.ts)) === today).length;
              const diaryBase = afterTurn.lastDiaryAnalyzedDate === today ? afterTurn.lastDiaryAnalyzedCount : 0;
              if (todayChatCount >= Math.max(6, diaryBase + 6)) void afterTurn.refreshDiaryAnalysis();
            },
            onError: (message) =>
              set((s) => ({
                streaming: false,
                error: message,
                messages: s.messages.map((m) =>
                  m.id === assistantId && m.content === ""
                    ? { ...m, content: "（呜…好像没连上，检查一下设置里的供应商配置好吗？）" }
                    : m,
                ),
              })),
          },
        );
      },
    }),
    {
      // Keep the existing key so current users retain their conversations after the rename.
      name: "ai-companion-xiaonuan",
      partialize: (s) => ({
        messages: s.messages,
        affinity: s.affinity,
        mood: s.mood,
        provider: s.provider,
        ttsSettings: s.ttsSettings,
        lastCheckIn: s.lastCheckIn,
        lastGiftDate: s.lastGiftDate,
        giftsToday: s.giftsToday,
        personality: s.personality,
        lastOutingDate: s.lastOutingDate,
        replyStyle: s.replyStyle,
        points: s.points,
        pointLedger: s.pointLedger,
        checkInStreak: s.checkInStreak,
        inventory: s.inventory,
        unlockedSkins: s.unlockedSkins,
        activeSkin: s.activeSkin,
        pendingEvent: s.pendingEvent,
        pendingEventInstanceId: s.pendingEventInstanceId,
        eventDate: s.eventDate,
        eventsToday: s.eventsToday,
        eventAttemptsToday: s.eventAttemptsToday,
        firstChatDate: s.firstChatDate,
        profile: s.profile,
        weather: s.weather,
        adultMode: s.adultMode,
        memories: s.memories,
        unlockedMilestones: s.unlockedMilestones,
        lastActiveAt: s.lastActiveAt,
        lastProactiveAt: s.lastProactiveAt,
        diaries: s.diaries,
        agreements: s.agreements,
        experiences: s.experiences,
        rollingSummary: s.rollingSummary,
        lastAnalyzedMessageCount: s.lastAnalyzedMessageCount,
        lastDiaryAnalyzedCount: s.lastDiaryAnalyzedCount,
        lastDiaryAnalyzedDate: s.lastDiaryAnalyzedDate,
      }),
    },
  ),
);

// Sync player speaking state with store
ttsPlayer.subscribe((speakingId) => {
  useStore.setState({ currentlySpeakingId: speakingId });
});

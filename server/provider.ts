const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOWED_PROVIDER_HOSTS = new Set(
  (process.env.ALLOWED_PROVIDER_HOSTS || "api.openai.com,api.deepseek.com,dashscope.aliyuncs.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean),
);

export function normalizeBaseURL(input: string): string {
  const value = input.trim().replace(/\/+$/, "");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("接口地址必须以 http:// 或 https:// 开头。");
  if (IS_PRODUCTION && url.protocol !== "https:") throw new Error("生产环境只允许 HTTPS 模型接口。");
  if (IS_PRODUCTION && !ALLOWED_PROVIDER_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`该供应商域名未获服务器允许：${url.hostname}`);
  }
  url.pathname = url.pathname.replace(/\/(models|chat\/completions)\/?$/, "").replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

export function fetchErrorMessage(error: unknown, target: string): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code || cause?.message || error.message;
  if (error.name === "TimeoutError") return `连接供应商超时（10 秒）：${target}`;
  return `无法连接供应商：${detail}。请检查 Base URL、代理或本地服务是否已启动。目标：${target}`;
}

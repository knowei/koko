import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "smtp.qq.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE = (process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
const SMTP_USER = process.env.SMTP_USER?.trim() || "";
const SMTP_AUTH_CODE = process.env.SMTP_AUTH_CODE?.trim() || "";
const SMTP_FROM = process.env.SMTP_FROM?.trim() || (SMTP_USER ? `妹妹陪伴 <${SMTP_USER}>` : "");

export function isEmailConfigured() {
  return Boolean(SMTP_USER && SMTP_AUTH_CODE && SMTP_FROM);
}

export async function sendEmailVerificationCode(
  to: string,
  code: string,
  expiresMinutes: number,
  purpose: "register" | "reset_password",
) {
  if (!isEmailConfigured()) {
    throw new Error("邮件服务尚未配置，请联系管理员。");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_AUTH_CODE },
  });

  const isRegister = purpose === "register";
  const action = isRegister ? "注册账号" : "重置密码";
  await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: `妹妹陪伴 · ${action}验证码`,
    text: `你的${action}验证码是 ${code}，${expiresMinutes} 分钟内有效。若非本人操作，请忽略本邮件。`,
    html: `<div style="font-family:system-ui,sans-serif;color:#4f4145;line-height:1.7">
      <h2 style="color:#e46f98">妹妹陪伴</h2>
      <p>你的${action}验证码是：</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:8px">${code}</p>
      <p>${expiresMinutes} 分钟内有效。若非本人操作，请忽略本邮件。</p>
    </div>`,
  });
}

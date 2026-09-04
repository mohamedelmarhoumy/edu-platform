const bcrypt = require("bcryptjs");
const db = require("../config/db");
const env = require("../config/env");

const OTP_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000)); // كود من 4 أرقام
}

/**
 * إرسال SMS فعلي — استبدل هذه الدالة بتكامل حقيقي مع بوابة SMS
 * (مثال: Vonage / Twilio / بوابة محلية) عند توفر SMS_PROVIDER_API_KEY.
 * في المرحلة الحالية (بدون مزوّد مفعّل) تُطبع الرسالة في الـ log فقط،
 * لتبقى قابلة للاختبار قبل شراء باقة SMS فعلية.
 */
async function sendSms(phone, message) {
  if (!env.sms.apiKey) {
    console.log(`[SMS تجريبي] إلى ${phone}: ${message}`);
    return { simulated: true };
  }
  // TODO: استدعاء API بوابة الـ SMS الحقيقية هنا
  return { simulated: false };
}

async function requestOtp({ phone, teacherId, purpose = "login" }) {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db.query(
    `INSERT INTO otp_codes (phone, teacher_id, code_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [phone, teacherId, codeHash, purpose, expiresAt]
  );

  await sendSms(phone, `كود التفعيل الخاص بك: ${code} — صالح لمدة ${OTP_TTL_MINUTES} دقائق.`);
  return { expiresAt };
}

async function verifyOtp({ phone, teacherId, code }) {
  const { rows } = await db.query(
    `SELECT * FROM otp_codes
     WHERE phone = $1 AND teacher_id = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [phone, teacherId]
  );
  const record = rows[0];
  if (!record) return { ok: false, reason: "no_otp_requested" };
  if (new Date(record.expires_at) < new Date()) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  const match = await bcrypt.compare(code, record.code_hash);
  if (!match) {
    await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [record.id]);
    return { ok: false, reason: "invalid_code" };
  }

  await db.query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [record.id]);
  return { ok: true };
}

module.exports = { requestOtp, verifyOtp };

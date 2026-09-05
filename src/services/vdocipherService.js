// ============================================================
// خدمة التكامل مع VdoCipher
// المرجع: https://www.vdocipher.com/docs/api/  (راجع التوثيق الرسمي
// قبل الإطلاق للتأكد من عدم تغيّر أسماء الحقول، فمزوّدو الفيديو
// يحدّثون واجهاتهم البرمجية من وقت لآخر).
// ============================================================
const axios = require("axios");
const env = require("../config/env");

const client = axios.create({
  baseURL: env.vdocipher.apiBase,
  headers: {
    Authorization: `Apisecret ${env.vdocipher.apiSecret}`,
  },
  timeout: 15000,
});

/**
 * الخطوة 1: طلب رابط رفع فيديو جديد.
 * تُستخدم النتيجة (clientPayload) لرفع الملف الفعلي مباشرة من لوحة
 * تحكم المعلّم إلى تخزين VdoCipher دون المرور عبر سيرفرنا (توفير في
 * استهلاك الشبكة والتخزين المؤقت لدينا).
 */
async function createUploadCredentials({ title, folderId } = {}) {
  const { data } = await client.put("/api/videos", null, {
    params: {
      title,
      ...(folderId ? { folderId } : {}),
    },
  });
  // data = { videoId, clientPayload: { uploadLink, parameters, ... } }
  return data;
}

/**
 * التحقق من حالة معالجة الفيديو (queued / processing / ready / error)
 */
async function getVideoStatus(videoId) {
  const { data } = await client.get(`/api/videos/${videoId}`);
  return data;
}

/**
 * الخطوة 2: توليد رابط تشغيل مؤقت (OTP + playbackInfo) لطالب محدّد،
 * مع تضمين علامة مائية متحركة تعرض اسمه ورقم هاتفه فوق الفيديو.
 *
 * ttlSeconds: مدة صلاحية الرابط (قصيرة عمداً، يُطلب رابط جديد عند
 * كل تشغيل بدلاً من رابط طويل الأمد قابل لإعادة الاستخدام).
 */
async function generatePlaybackToken({ videoId, studentName, studentPhone, ttlSeconds = 300 }) {
  const watermarkText = `${studentName} • ${studentPhone}`;

  // annotate: خاصية VdoCipher للعلامة المائية الديناميكية المتحركة
  // (RTD = Relative To Duration)، تتحرك موضعها عشوائياً كل فترة.
  const annotate = JSON.stringify([
    {
      type: "rtd",
      text: watermarkText,
      alpha: "0.55",
      color: "0xFFFFFF",
      size: "13",
      interval: "4000",
      x: "RANDOMX",
      y: "RANDOMY",
    },
  ]);

  const { data } = await client.post(
    `/api/videos/${videoId}/otp`,
    {
      ttl: ttlSeconds,
      annotate,
      whitelisthref: process.env.ALLOWED_EMBED_DOMAINS || "*", // قيّدها لدومين موقعك في الإنتاج
    }
  );
  // data = { otp, playbackInfo }
  return data;
}

/**
 * حذف فيديو نهائياً من مساحة تخزين VdoCipher
 */
async function deleteVideo(videoId) {
  await client.delete(`/api/videos`, { params: { videos: videoId } });
}

module.exports = {
  createUploadCredentials,
  getVideoStatus,
  generatePlaybackToken,
  deleteVideo,
};

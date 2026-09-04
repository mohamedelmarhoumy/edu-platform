const tokenService = require("../services/tokenService");
const db = require("../config/db");

/**
 * يتحقق من صحة access token فقط (خفيف، بدون استعلام قاعدة بيانات).
 * يُستخدم للـ routes العادية.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "غير مصرّح" });

  try {
    req.user = tokenService.verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "الجلسة منتهية أو غير صالحة" });
  }
}

/**
 * تحقق إضافي "ثقيل" (يستعلم قاعدة البيانات) يُستخدم فقط على مسارات
 * تشغيل الفيديو الحساسة، للتأكد لحظياً أن هذا الطالب لم يتم تسجيل
 * دخوله من جهاز آخر منذ صدور التوكن (مثال: تسجيل دخول من جهاز ثانٍ
 * أثناء استمرار جلسة الأول قبل انتهاء صلاحية الـ access token القصيرة).
 */
async function requireActiveDeviceSession(req, res, next) {
  const deviceFingerprint = req.headers["x-device-fingerprint"];
  if (!deviceFingerprint) return res.status(400).json({ error: "device fingerprint مطلوب" });

  const { rows } = await db.query(
    `SELECT device_fingerprint FROM student_sessions WHERE student_id = $1`,
    [req.user.sub]
  );
  const session = rows[0];
  if (!session || session.device_fingerprint !== deviceFingerprint) {
    return res.status(423).json({ error: "تم تسجيل الدخول من جهاز آخر", code: "SESSION_REVOKED" });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "لا تملك صلاحية الوصول" });
    }
    next();
  };
}

module.exports = { requireAuth, requireActiveDeviceSession, requireRole };

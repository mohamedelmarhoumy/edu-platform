const bcrypt = require("bcryptjs");
const db = require("../config/db");

/**
 * GET /api/setup/status
 * يخبر الفرونت إند: هل يوجد معلّم مسجَّل بالفعل أم لا (لعرض شاشة
 * "إعداد أول حساب" فقط عند الحاجة).
 */
async function getStatus(req, res) {
  const { rows } = await db.query(`SELECT COUNT(*)::int AS count FROM teachers`);
  res.json({ isSetup: rows[0].count > 0 });
}

/**
 * POST /api/setup/bootstrap-teacher
 * body: { name, phone, email, password }
 *
 * يعمل مرة واحدة فقط: إذا كان هناك معلّم واحد على الأقل مسجَّل بالفعل
 * يرفض الطلب فوراً، لمنع أي شخص من إنشاء حساب superadmin إضافي عبر
 * هذا المسار العام بعد الإعداد الأول.
 */
async function bootstrapTeacher(req, res) {
  const { rows: existing } = await db.query(`SELECT COUNT(*)::int AS count FROM teachers`);
  if (existing[0].count > 0) {
    return res.status(403).json({ error: "تم إعداد المنصة بالفعل — استخدم شاشة تسجيل الدخول" });
  }

  const { name, phone, email, password } = req.body;
  if (!name || !phone || !email || !password || password.length < 8) {
    return res.status(400).json({ error: "بيانات ناقصة، أو كلمة المرور أقل من 8 أحرف" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO teachers (name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'superadmin') RETURNING id, name, email, role`,
    [name, phone, email, passwordHash]
  );
  res.status(201).json(rows[0]);
}

module.exports = { getStatus, bootstrapTeacher };

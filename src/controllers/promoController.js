const crypto = require("crypto");
const db = require("../config/db");

function generateCode() {
  return "EDU-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

/**
 * POST /api/admin/promo-codes
 * body: { courseId, accessDays, count }  — يولّد كوداً واحداً أو دفعة أكواد
 */
async function createPromoCodes(req, res) {
  const { courseId, accessDays = 90, count = 1 } = req.body;
  const teacherId = req.user.teacherId;

  const courseRes = await db.query(`SELECT id FROM courses WHERE id = $1 AND teacher_id = $2`, [courseId, teacherId]);
  if (courseRes.rows.length === 0) return res.status(404).json({ error: "الكورس غير موجود" });

  const created = [];
  for (let i = 0; i < Math.min(count, 500); i++) {
    const code = generateCode();
    await db.query(
      `INSERT INTO promo_codes (teacher_id, code, course_id, access_days) VALUES ($1, $2, $3, $4)`,
      [teacherId, code, courseId, accessDays]
    );
    created.push(code);
  }
  res.status(201).json({ codes: created });
}

/**
 * GET /api/admin/promo-codes
 */
async function listPromoCodes(req, res) {
  const { rows } = await db.query(
    `SELECT p.*, c.subject AS course_subject
     FROM promo_codes p JOIN courses c ON c.id = p.course_id
     WHERE p.teacher_id = $1 ORDER BY p.created_at DESC LIMIT 500`,
    [req.user.teacherId]
  );
  res.json(rows);
}

/**
 * POST /api/student/promo-codes/redeem
 * body: { code }  — الطالب يفعّل كوداً فيُسجَّل اشتراكه في الكورس تلقائياً
 */
async function redeemPromoCode(req, res) {
  const { code } = req.body;
  const studentId = req.user.sub;
  const teacherId = req.user.teacherId;

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM promo_codes WHERE code = $1 AND teacher_id = $2 FOR UPDATE`,
      [code, teacherId]
    );
    const promo = rows[0];
    if (!promo) { await client.query("ROLLBACK"); return res.status(404).json({ error: "الكود غير صحيح" }); }
    if (promo.is_used) { await client.query("ROLLBACK"); return res.status(409).json({ error: "تم استخدام هذا الكود من قبل" }); }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + promo.access_days);

    await client.query(
      `INSERT INTO enrollments (student_id, course_id, is_active, expires_at)
       VALUES ($1, $2, TRUE, $3)
       ON CONFLICT (student_id, course_id) DO UPDATE
         SET is_active = TRUE, expires_at = GREATEST(enrollments.expires_at, EXCLUDED.expires_at)`,
      [studentId, promo.course_id, expiresAt]
    );

    await client.query(
      `UPDATE promo_codes SET is_used = TRUE, used_by_student_id = $1, used_at = now() WHERE id = $2`,
      [studentId, promo.id]
    );

    await client.query("COMMIT");
    res.json({ message: "تم تفعيل الاشتراك بنجاح", courseId: promo.course_id, expiresAt });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "حدث خطأ أثناء تفعيل الكود" });
  } finally {
    client.release();
  }
}

module.exports = { createPromoCodes, listPromoCodes, redeemPromoCode };

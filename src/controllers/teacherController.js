const bcrypt = require("bcryptjs");
const db = require("../config/db");

/**
 * POST /api/superadmin/teachers
 * (متاح فقط لدور superadmin) — إنشاء حساب معلّم جديد على نفس المنصة.
 * هذا هو أساس دعم "أكثر من معلّم" مستقبلاً: كل معلّم جديد يحصل على
 * مساحته الخاصة بالكامل (كورساته، طلابه، أكواده) دون أي تداخل، لأن
 * كل الجداول الأساسية مرتبطة بـ teacher_id منذ التصميم الأول.
 */
async function createTeacher(req, res) {
  const { name, phone, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  const { rows } = await db.query(
    `INSERT INTO teachers (name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'teacher') RETURNING id, name, phone, email, role, created_at`,
    [name, phone, email, passwordHash]
  );
  res.status(201).json(rows[0]);
}

async function listTeachers(req, res) {
  const { rows } = await db.query(
    `SELECT id, name, phone, email, role, is_active, created_at FROM teachers ORDER BY created_at DESC`
  );
  res.json(rows);
}

async function setTeacherActive(req, res) {
  const { teacherId } = req.params;
  const { isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE teachers SET is_active = $1 WHERE id = $2 RETURNING id, name, is_active`,
    [isActive, teacherId]
  );
  if (!rows[0]) return res.status(404).json({ error: "المعلّم غير موجود" });
  res.json(rows[0]);
}

module.exports = { createTeacher, listTeachers, setTeacherActive };

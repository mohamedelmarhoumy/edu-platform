const db = require("../config/db");

async function listStudents(req, res) {
  const { rows } = await db.query(
    `SELECT s.*, d.device_fingerprint, d.device_label, d.bound_at
     FROM students s LEFT JOIN student_devices d ON d.student_id = s.id
     WHERE s.teacher_id = $1 ORDER BY s.created_at DESC`,
    [req.user.teacherId]
  );
  res.json(rows);
}

async function setStudentActive(req, res) {
  const { studentId } = req.params;
  const { isActive } = req.body;
  const { rows } = await db.query(
    `UPDATE students SET is_active = $1 WHERE id = $2 AND teacher_id = $3 RETURNING *`,
    [isActive, studentId, req.user.teacherId]
  );
  if (!rows[0]) return res.status(404).json({ error: "الطالب غير موجود" });

  // إيقاف الاشتراك يُنهي أيضاً أي جلسة نشطة فوراً (يُطرد من كل الأجهزة)
  if (!isActive) {
    await db.query(`DELETE FROM student_sessions WHERE student_id = $1`, [studentId]);
  }
  res.json(rows[0]);
}

/**
 * فكّ ربط جهاز الطالب — يسمح له بتسجيل الدخول من جهاز جديد.
 */
async function resetStudentDevice(req, res) {
  const { studentId } = req.params;
  const owns = await db.query(`SELECT id FROM students WHERE id = $1 AND teacher_id = $2`, [studentId, req.user.teacherId]);
  if (owns.rows.length === 0) return res.status(404).json({ error: "الطالب غير موجود" });

  await db.query(`DELETE FROM student_devices WHERE student_id = $1`, [studentId]);
  await db.query(`DELETE FROM student_sessions WHERE student_id = $1`, [studentId]);
  res.json({ message: "تم فكّ ربط الجهاز، يمكن للطالب الدخول من جهاز جديد الآن" });
}

async function setEnrollment(req, res) {
  const { studentId } = req.params;
  const { courseId, isActive = true, expiresAt = null } = req.body;

  const owns = await db.query(`SELECT id FROM students WHERE id = $1 AND teacher_id = $2`, [studentId, req.user.teacherId]);
  if (owns.rows.length === 0) return res.status(404).json({ error: "الطالب غير موجود" });

  const { rows } = await db.query(
    `INSERT INTO enrollments (student_id, course_id, is_active, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, course_id) DO UPDATE SET is_active = $3, expires_at = $4
     RETURNING *`,
    [studentId, courseId, isActive, expiresAt]
  );
  res.json(rows[0]);
}

module.exports = { listStudents, setStudentActive, resetStudentDevice, setEnrollment };

const db = require("../config/db");

/* ---------- لوحة تحكم المعلّم: إدارة المحتوى ---------- */

async function createCourse(req, res) {
  const { subject, stage, description } = req.body;
  const { rows } = await db.query(
    `INSERT INTO courses (teacher_id, subject, stage, description) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.teacherId, subject, stage, description || null]
  );
  res.status(201).json(rows[0]);
}

async function listMyCourses(req, res) {
  const { rows } = await db.query(`SELECT * FROM courses WHERE teacher_id = $1 ORDER BY created_at DESC`, [req.user.teacherId]);
  res.json(rows);
}

async function publishCourse(req, res) {
  const { rows } = await db.query(
    `UPDATE courses SET is_published = TRUE WHERE id = $1 AND teacher_id = $2 RETURNING *`,
    [req.params.courseId, req.user.teacherId]
  );
  if (!rows[0]) return res.status(404).json({ error: "الكورس غير موجود" });
  res.json(rows[0]);
}

async function createUnit(req, res) {
  const { courseId } = req.params;
  const { title, sortOrder = 0 } = req.body;
  const owns = await db.query(`SELECT id FROM courses WHERE id = $1 AND teacher_id = $2`, [courseId, req.user.teacherId]);
  if (owns.rows.length === 0) return res.status(404).json({ error: "الكورس غير موجود" });

  const { rows } = await db.query(
    `INSERT INTO units (course_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *`,
    [courseId, title, sortOrder]
  );
  res.status(201).json(rows[0]);
}

async function createLesson(req, res) {
  const { unitId } = req.params;
  const { title, maxViews, accessDays, sortOrder = 0 } = req.body;

  const owns = await db.query(
    `SELECT u.id FROM units u JOIN courses c ON c.id = u.course_id WHERE u.id = $1 AND c.teacher_id = $2`,
    [unitId, req.user.teacherId]
  );
  if (owns.rows.length === 0) return res.status(404).json({ error: "الوحدة غير موجودة" });

  const { rows } = await db.query(
    `INSERT INTO lessons (unit_id, title, max_views, access_days, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [unitId, title, maxViews || null, accessDays || null, sortOrder]
  );
  res.status(201).json(rows[0]);
}

async function addLessonAttachment(req, res) {
  const { lessonId } = req.params;
  const { fileUrl, fileName, allowDownload = true } = req.body;
  const { rows } = await db.query(
    `INSERT INTO lesson_attachments (lesson_id, file_url, file_name, allow_download)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [lessonId, fileUrl, fileName, allowDownload]
  );
  res.status(201).json(rows[0]);
}

/* ---------- عرض المحتوى للطالب ---------- */

async function getMyEnrolledCourses(req, res) {
  const studentId = req.user.sub;
  const { rows: courses } = await db.query(
    `SELECT c.* FROM courses c
     JOIN enrollments e ON e.course_id = c.id
     WHERE e.student_id = $1 AND e.is_active = TRUE
       AND (e.expires_at IS NULL OR e.expires_at > now())`,
    [studentId]
  );

  for (const course of courses) {
    const { rows: units } = await db.query(`SELECT * FROM units WHERE course_id = $1 ORDER BY sort_order`, [course.id]);
    for (const unit of units) {
      const { rows: lessons } = await db.query(
        `SELECT l.*, COALESCE(v.completed, FALSE) AS watched, COALESCE(v.view_count, 0) AS view_count
         FROM lessons l
         LEFT JOIN lesson_views v ON v.lesson_id = l.id AND v.student_id = $2
         WHERE l.unit_id = $1 ORDER BY l.sort_order`,
        [unit.id, studentId]
      );
      unit.lessons = lessons;
    }
    course.units = units;
  }
  res.json(courses);
}

module.exports = {
  createCourse, listMyCourses, publishCourse, createUnit, createLesson,
  addLessonAttachment, getMyEnrolledCourses,
};

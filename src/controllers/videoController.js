const db = require("../config/db");
const vdocipher = require("../services/vdocipherService");

/**
 * POST /api/admin/lessons/:lessonId/upload-credentials
 * (لوحة تحكم المعلّم) — يطلب من VdoCipher رابط رفع مباشر، ويعيده
 * للمتصفح ليرفع ملف الفيديو مباشرة دون المرور بسيرفرنا.
 */
async function getUploadCredentials(req, res) {
  const { lessonId } = req.params;
  const lessonRes = await db.query(
    `SELECT l.*, u.course_id, c.teacher_id
     FROM lessons l JOIN units u ON u.id = l.unit_id JOIN courses c ON c.id = u.course_id
     WHERE l.id = $1`,
    [lessonId]
  );
  const lesson = lessonRes.rows[0];
  if (!lesson) return res.status(404).json({ error: "الدرس غير موجود" });
  if (lesson.teacher_id !== req.user.teacherId) return res.status(403).json({ error: "لا تملك صلاحية" });

  const credentials = await vdocipher.createUploadCredentials({ title: lesson.title });

  // خزّن معرّف الفيديو فوراً؛ حالته ستكون "processing" حتى ينتهي الرفع والمعالجة
  await db.query(`UPDATE lessons SET vdocipher_video_id = $1 WHERE id = $2`, [credentials.videoId, lessonId]);

  res.json(credentials); // { videoId, clientPayload: { uploadLink, parameters } }
}

/**
 * GET /api/admin/lessons/:lessonId/video-status
 */
async function getVideoStatus(req, res) {
  const { rows } = await db.query(`SELECT vdocipher_video_id FROM lessons WHERE id = $1`, [req.params.lessonId]);
  const videoId = rows[0]?.vdocipher_video_id;
  if (!videoId) return res.status(404).json({ error: "لم يُرفع فيديو لهذا الدرس بعد" });
  const status = await vdocipher.getVideoStatus(videoId);
  res.json(status);
}

/**
 * POST /api/lessons/:lessonId/playback
 * (الطالب) — يتحقق من الاشتراك، الحد الأقصى للمشاهدات، وصلاحية
 * الوصول، ثم يولّد رابط تشغيل مؤقت محمي بعلامة مائية باسم الطالب.
 */
async function getPlaybackToken(req, res) {
  const { lessonId } = req.params;
  const studentId = req.user.sub;

  const lessonRes = await db.query(
    `SELECT l.*, u.course_id
     FROM lessons l JOIN units u ON u.id = l.unit_id
     WHERE l.id = $1`,
    [lessonId]
  );
  const lesson = lessonRes.rows[0];
  if (!lesson || !lesson.vdocipher_video_id) return res.status(404).json({ error: "الفيديو غير متاح" });

  // 1) تحقق من الاشتراك الفعّال في الكورس
  const enrollRes = await db.query(
    `SELECT * FROM enrollments
     WHERE student_id = $1 AND course_id = $2 AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > now())`,
    [studentId, lesson.course_id]
  );
  if (enrollRes.rows.length === 0) {
    return res.status(403).json({ error: "لا يوجد اشتراك فعّال في هذا الكورس" });
  }

  // 2) تحقق من الحد الأقصى لعدد المشاهدات (إن وُجد)
  const viewRes = await db.query(
    `SELECT * FROM lesson_views WHERE student_id = $1 AND lesson_id = $2`,
    [studentId, lessonId]
  );
  const view = viewRes.rows[0];
  if (lesson.max_views && view && view.view_count >= lesson.max_views) {
    return res.status(403).json({ error: "تم استنفاد عدد مرات المشاهدة المسموح بها لهذا الدرس" });
  }

  // 3) تحقق من انتهاء صلاحية الدرس منذ أول مشاهدة (إن وُجدت صلاحية محددة)
  if (lesson.access_days && view?.first_viewed_at) {
    const deadline = new Date(view.first_viewed_at);
    deadline.setDate(deadline.getDate() + lesson.access_days);
    if (deadline < new Date()) {
      return res.status(403).json({ error: "انتهت صلاحية مشاهدة هذا الدرس" });
    }
  }

  const studentRes = await db.query(`SELECT name, phone FROM students WHERE id = $1`, [studentId]);
  const student = studentRes.rows[0];

  const { otp, playbackInfo } = await vdocipher.generatePlaybackToken({
    videoId: lesson.vdocipher_video_id,
    studentName: student.name,
    studentPhone: student.phone,
    ttlSeconds: 300,
  });

  // تحديث عدّاد المشاهدات + سجل التتبع الأمني
  if (view) {
    await db.query(
      `UPDATE lesson_views SET view_count = view_count + 1, last_viewed_at = now() WHERE id = $1`,
      [view.id]
    );
  } else {
    await db.query(
      `INSERT INTO lesson_views (student_id, lesson_id, view_count, first_viewed_at, last_viewed_at)
       VALUES ($1, $2, 1, now(), now())`,
      [studentId, lessonId]
    );
  }
  await db.query(
    `INSERT INTO playback_logs (student_id, lesson_id, ip_address, device_fingerprint)
     VALUES ($1, $2, $3, $4)`,
    [studentId, lessonId, req.ip, req.headers["x-device-fingerprint"] || null]
  );

  res.json({ otp, playbackInfo });
}

module.exports = { getUploadCredentials, getVideoStatus, getPlaybackToken };

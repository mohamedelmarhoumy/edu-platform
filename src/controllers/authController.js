const db = require("../config/db");
const otpService = require("../services/otpService");
const tokenService = require("../services/tokenService");
const bcrypt = require("bcryptjs");

const SESSION_TTL_DAYS = 30;

/**
 * POST /api/auth/otp/request
 * body: { phone, name, teacherId }
 */
async function requestOtp(req, res) {
  const { phone, name, teacherId } = req.body;
  if (!phone || !teacherId) return res.status(400).json({ error: "الهاتف ومعرّف المعلّم مطلوبان" });

  // تأكد من وجود الطالب أو أنشئه (باسم مبدئي — يمكن تعديله لاحقاً في البروفايل)
  const existing = await db.query(
    `SELECT id, is_active FROM students WHERE teacher_id = $1 AND phone = $2`,
    [teacherId, phone]
  );

  if (existing.rows.length === 0) {
    if (!name) return res.status(400).json({ error: "الاسم مطلوب عند أول تسجيل" });
    await db.query(
      `INSERT INTO students (teacher_id, phone, name) VALUES ($1, $2, $3)`,
      [teacherId, phone, name]
    );
  } else if (!existing.rows[0].is_active) {
    return res.status(403).json({ error: "هذا الحساب موقوف. تواصل مع المعلّم." });
  }

  const { expiresAt } = await otpService.requestOtp({ phone, teacherId, purpose: "login" });
  res.json({ message: "تم إرسال كود التفعيل", expiresAt });
}

/**
 * POST /api/auth/otp/verify
 * body: { phone, teacherId, code, deviceFingerprint, deviceLabel }
 *
 * ينفّذ قاعدة "جهاز واحد لكل حساب": إذا كان هناك جهاز مربوط مسبقاً
 * ومختلف عن الجهاز الحالي، يُرفض الدخول ويُطلب فكّ الربط أولاً
 * (من الدعم الفني أو ذاتياً بحد أقصى مرات محدود — منطق قابل للتوسعة).
 */
async function verifyOtp(req, res) {
  const { phone, teacherId, code, deviceFingerprint, deviceLabel } = req.body;
  if (!phone || !teacherId || !code || !deviceFingerprint) {
    return res.status(400).json({ error: "بيانات ناقصة" });
  }

  const result = await otpService.verifyOtp({ phone, teacherId, code });
  if (!result.ok) {
    const messages = {
      no_otp_requested: "لم يتم طلب كود لهذا الرقم",
      expired: "انتهت صلاحية الكود، اطلب كوداً جديداً",
      too_many_attempts: "عدد محاولات كبير، اطلب كوداً جديداً",
      invalid_code: "الكود غير صحيح",
    };
    return res.status(400).json({ error: messages[result.reason] || "فشل التحقق" });
  }

  const studentRes = await db.query(
    `SELECT * FROM students WHERE teacher_id = $1 AND phone = $2`,
    [teacherId, phone]
  );
  const student = studentRes.rows[0];
  if (!student) return res.status(404).json({ error: "الحساب غير موجود" });

  // --- منطق ربط الجهاز (Device Binding) ---
  const deviceRes = await db.query(`SELECT * FROM student_devices WHERE student_id = $1`, [student.id]);
  const boundDevice = deviceRes.rows[0];

  if (boundDevice && boundDevice.device_fingerprint !== deviceFingerprint) {
    return res.status(423).json({
      error: "الحساب مرتبط بجهاز آخر بالفعل",
      code: "DEVICE_MISMATCH",
      hint: "تواصل مع الدعم الفني لفكّ الربط، أو استخدم مسار /auth/device/request-reset",
    });
  }

  if (!boundDevice) {
    await db.query(
      `INSERT INTO student_devices (student_id, device_fingerprint, device_label) VALUES ($1, $2, $3)`,
      [student.id, deviceFingerprint, deviceLabel || null]
    );
  } else {
    await db.query(`UPDATE student_devices SET last_seen_at = now() WHERE student_id = $1`, [student.id]);
  }

  // --- منطق الجلسة الواحدة (Single Active Session) ---
  const accessToken = tokenService.signAccessToken({ sub: student.id, role: "student", teacherId });
  const refreshToken = tokenService.signRefreshToken({ sub: student.id, role: "student", teacherId });
  const refreshHash = tokenService.hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO student_sessions (student_id, refresh_token_hash, device_fingerprint, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (student_id) DO UPDATE
       SET refresh_token_hash = EXCLUDED.refresh_token_hash,
           device_fingerprint = EXCLUDED.device_fingerprint,
           ip_address = EXCLUDED.ip_address,
           expires_at = EXCLUDED.expires_at,
           created_at = now()`,
    [student.id, refreshHash, deviceFingerprint, req.ip, expiresAt]
  );
  // ملاحظة: student_sessions.student_id UNIQUE، لذلك تسجيل دخول جديد
  // يستبدل الجلسة القديمة تلقائياً — أي جهاز يحمل التوكن القديم سيُرفض
  // في أول طلب لاحق (راجع middleware/auth.js).

  res.json({
    accessToken,
    refreshToken,
    student: { id: student.id, name: student.name, phone: student.phone },
  });
}

/**
 * POST /api/auth/refresh
 */
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "refreshToken مطلوب" });

  let payload;
  try {
    payload = tokenService.verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: "جلسة غير صالحة" });
  }

  const sessionRes = await db.query(`SELECT * FROM student_sessions WHERE student_id = $1`, [payload.sub]);
  const session = sessionRes.rows[0];
  const incomingHash = tokenService.hashToken(refreshToken);

  if (!session || session.refresh_token_hash !== incomingHash) {
    // التوكن لا يطابق آخر جلسة مسجّلة — على الأرجح جهاز آخر سجّل دخول لاحقاً
    return res.status(401).json({ error: "تم تسجيل الدخول من جهاز آخر، سجّل الدخول مجدداً", code: "SESSION_REVOKED" });
  }

  const accessToken = tokenService.signAccessToken({ sub: payload.sub, role: "student", teacherId: payload.teacherId });
  res.json({ accessToken });
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  await db.query(`DELETE FROM student_sessions WHERE student_id = $1`, [req.user.sub]);
  res.json({ message: "تم تسجيل الخروج" });
}

/**
 * POST /api/auth/teacher/login  (لوحة تحكم المعلّم)
 * body: { email, password }
 */
async function teacherLogin(req, res) {
  const { email, password } = req.body;
  const { rows } = await db.query(`SELECT * FROM teachers WHERE email = $1 AND is_active = TRUE`, [email]);
  const teacher = rows[0];
  if (!teacher) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

  const match = await bcrypt.compare(password, teacher.password_hash);
  if (!match) return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });

  const accessToken = tokenService.signAccessToken({ sub: teacher.id, role: teacher.role, teacherId: teacher.id });
  res.json({ accessToken, teacher: { id: teacher.id, name: teacher.name, role: teacher.role } });
}

module.exports = { requestOtp, verifyOtp, refresh, logout, teacherLogin };

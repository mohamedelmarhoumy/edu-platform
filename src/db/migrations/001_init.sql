-- ============================================================
-- المخطط الأولي لقاعدة البيانات
-- مبني من البداية ليدعم أكثر من معلّم (Multi-Teacher) على نفس
-- المنصة: كل كورس/طالب/كود تفعيل مرتبط بـ teacher_id، بحيث
-- يمكن مستقبلاً فتح المنصة لمعلمين آخرين دون إعادة هيكلة الجداول.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- المعلّمون / أصحاب المحتوى (كل معلّم = مستأجر منطقي Tenant)
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'teacher', -- teacher | superadmin
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الطلاب (كل طالب مرتبط بمعلّم واحد يمثّل الجهة التي اشترك عندها)
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, phone)
);

-- أكواد التحقق المؤقتة (OTP) لتسجيل الدخول
CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) NOT NULL,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'login', -- login | register
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempts SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone_teacher ON otp_codes (phone, teacher_id);

-- الجهاز الوحيد المسموح به لكل طالب (Device Binding)
CREATE TABLE student_devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_label VARCHAR(150),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- جلسات الدخول النشطة (لمنع أكثر من جلسة متزامنة لكل طالب)
CREATE TABLE student_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- الكورسات (مادة)
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  subject VARCHAR(150) NOT NULL,
  stage VARCHAR(150) NOT NULL, -- المرحلة الدراسية
  description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الوحدات
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

-- الدروس
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  vdocipher_video_id VARCHAR(100), -- المعرف الراجع من VdoCipher بعد الرفع
  duration_seconds INT,
  max_views INT, -- NULL = بلا حد أقصى
  access_days INT, -- عدد أيام صلاحية المشاهدة بعد أول تشغيل، NULL = بلا حد
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ملفات مرفقة بالدرس (PDF واجبات/ملخصات)
CREATE TABLE lesson_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  allow_download BOOLEAN NOT NULL DEFAULT TRUE
);

-- اشتراك الطالب في كورس معيّن
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

-- تتبّع مشاهدة كل درس (لعدد المرات المسموح بها ونسبة الإنجاز)
CREATE TABLE lesson_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  view_count INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  UNIQUE (student_id, lesson_id)
);

-- سجل كل عملية توليد رابط تشغيل (Audit Log) — لأغراض المراجعة الأمنية
CREATE TABLE playback_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  ip_address VARCHAR(64),
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- بنك الأسئلة
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL, -- ["اختيار 1", "اختيار 2", ...]
  correct_index SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- الاختبارات
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  time_limit_seconds INT,
  pass_score_percent SMALLINT NOT NULL DEFAULT 50,
  max_attempts INT NOT NULL DEFAULT 1,
  show_answers_after_submit BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE quiz_questions (
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (quiz_id, question_id)
);

CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answers JSONB NOT NULL, -- { question_id: chosen_index }
  score_percent NUMERIC(5,2) NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- أكواد التفعيل (Promo / Activation Codes)
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  code VARCHAR(30) UNIQUE NOT NULL,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  access_days INT NOT NULL DEFAULT 90,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by_student_id UUID REFERENCES students(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- المدفوعات (تُملأ عند ربط بوابة الدفع في مرحلة لاحقة)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL, -- paymob | fawry | promo_code
  amount NUMERIC(10,2),
  currency VARCHAR(10) DEFAULT 'EGP',
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | success | failed | refunded
  provider_reference VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_courses_teacher ON courses (teacher_id);
CREATE INDEX idx_students_teacher ON students (teacher_id);
CREATE INDEX idx_promo_teacher ON promo_codes (teacher_id);

// تشغيل: node src/db/seedTeacher.js "اسم المعلّم" "01000000000" "email@example.com" "كلمة_مرور_قوية"
require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../config/db");

async function main() {
  const [name, phone, email, password] = process.argv.slice(2);
  if (!name || !phone || !email || !password) {
    console.log('الاستخدام: node seedTeacher.js "الاسم" "الهاتف" "البريد" "كلمة المرور"');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO teachers (name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'superadmin') RETURNING id, name, email`,
    [name, phone, email, passwordHash]
  );
  console.log("تم إنشاء حساب المعلّم:", rows[0]);
  console.log("احتفظ بهذا المعرّف (id) — سيُستخدم كـ teacherId في تسجيل دخول الطلاب.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// تشغيل: npm run migrate
// يقرأ كل ملفات .sql داخل db/migrations بالترتيب الأبجدي وينفّذها.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    for (const file of files) {
      console.log(`تنفيذ: ${file}`);
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query(sql);
    }
    console.log("تم تنفيذ كل الترحيلات بنجاح.");
  } catch (err) {
    console.error("فشل الترحيل:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();

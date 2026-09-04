const { Pool } = require("pg");
const env = require("./env");

const pool = new Pool({ connectionString: env.databaseUrl });

pool.on("error", (err) => {
  console.error("خطأ غير متوقع في اتصال قاعدة البيانات:", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

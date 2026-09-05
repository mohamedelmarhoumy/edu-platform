require("express-async-errors"); // يجعل أخطاء الدوال async داخل المتحكمات تصل تلقائياً لمعالج الأخطاء
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const setupRoutes = require("./routes/setupRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const superadminRoutes = require("./routes/superadminRoutes");

const app = express();

app.use(cors()); // في الإنتاج: قيّد origin لدومين موقعك وتطبيقك فقط
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/setup", setupRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/superadmin", superadminRoutes);

// معالج أخطاء موحّد
app.use((err, req, res, next) => {
  console.error(err);
  // إن كان الخطأ راجعاً من استدعاء VdoCipher، رسالته الحقيقية مفيدة
  // للتشخيص الفوري من الواجهة نفسها بدل الاضطرار لمراجعة الـ Logs كل مرة.
  const vdoMessage = err.response?.data?.message || err.response?.data?.error;
  res.status(err.status || err.response?.status || 500).json({
    error: vdoMessage ? `خطأ من VdoCipher: ${vdoMessage}` : "حدث خطأ في الخادم",
    detail: process.env.NODE_ENV === "development" ? (err.response?.data || err.message) : undefined,
  });
});

app.use((req, res) => res.status(404).json({ error: "المسار غير موجود" }));

module.exports = app;

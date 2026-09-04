require("express-async-errors"); // يجعل أخطاء الدوال async داخل المتحكمات تصل تلقائياً لمعالج الأخطاء
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const superadminRoutes = require("./routes/superadminRoutes");

const app = express();

app.use(cors()); // في الإنتاج: قيّد origin لدومين موقعك وتطبيقك فقط
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/superadmin", superadminRoutes);

// معالج أخطاء موحّد
app.use((err, req, res, next) => {
  console.error(err);
  const vdoError = err.response?.data;
  res.status(err.status || 500).json({
    error: "حدث خطأ في الخادم",
    detail: process.env.NODE_ENV === "development" ? (vdoError || err.message) : undefined,
  });
});

app.use((req, res) => res.status(404).json({ error: "المسار غير موجود" }));

module.exports = app;

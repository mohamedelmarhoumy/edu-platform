require("dotenv").config();

function required(name) {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === "production") {
    throw new Error(`متغيّر البيئة المطلوب غير موجود: ${name}`);
  }
  return v;
}

module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: "15m",
    refreshTtl: "30d",
  },
  vdocipher: {
    apiSecret: required("VDOCIPHER_API_SECRET"),
    apiBase: process.env.VDOCIPHER_API_BASE || "https://dev.vdocipher.com",
  },
  sms: {
    apiKey: process.env.SMS_PROVIDER_API_KEY || "",
    senderId: process.env.SMS_PROVIDER_SENDER_ID || "EduPlatform",
  },
};

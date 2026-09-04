const express = require("express");
const rateLimit = require("express-rate-limit");
const auth = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: { error: "محاولات كثيرة، حاول لاحقاً" } });

router.post("/otp/request", otpLimiter, auth.requestOtp);
router.post("/otp/verify", otpLimiter, auth.verifyOtp);
router.post("/refresh", auth.refresh);
router.post("/logout", requireAuth, auth.logout);
router.post("/teacher/login", auth.teacherLogin);

module.exports = router;

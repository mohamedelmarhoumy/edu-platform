const express = require("express");
const { requireAuth, requireActiveDeviceSession, requireRole } = require("../middleware/auth");
const courseController = require("../controllers/courseController");
const videoController = require("../controllers/videoController");
const promoController = require("../controllers/promoController");
const quizController = require("../controllers/quizController");

const router = express.Router();
router.use(requireAuth, requireRole("student"));

router.get("/courses", courseController.getMyEnrolledCourses);

router.post("/lessons/:lessonId/playback", requireActiveDeviceSession, videoController.getPlaybackToken);

router.post("/promo-codes/redeem", promoController.redeemPromoCode);

router.get("/quizzes/:quizId", quizController.getQuizForStudent);
router.post("/quizzes/:quizId/submit", quizController.submitQuizAttempt);

module.exports = router;

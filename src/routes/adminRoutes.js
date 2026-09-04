const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const courseController = require("../controllers/courseController");
const videoController = require("../controllers/videoController");
const promoController = require("../controllers/promoController");
const studentController = require("../controllers/studentController");
const quizController = require("../controllers/quizController");

const router = express.Router();
router.use(requireAuth, requireRole("teacher", "superadmin"));

// المحتوى
router.post("/courses", courseController.createCourse);
router.get("/courses", courseController.listMyCourses);
router.post("/courses/:courseId/publish", courseController.publishCourse);
router.post("/courses/:courseId/units", courseController.createUnit);
router.post("/units/:unitId/lessons", courseController.createLesson);
router.post("/lessons/:lessonId/attachments", courseController.addLessonAttachment);

// الفيديو / VdoCipher
router.post("/lessons/:lessonId/upload-credentials", videoController.getUploadCredentials);
router.get("/lessons/:lessonId/video-status", videoController.getVideoStatus);

// الطلاب
router.get("/students", studentController.listStudents);
router.patch("/students/:studentId/active", studentController.setStudentActive);
router.post("/students/:studentId/reset-device", studentController.resetStudentDevice);
router.post("/students/:studentId/enrollment", studentController.setEnrollment);

// أكواد التفعيل
router.post("/promo-codes", promoController.createPromoCodes);
router.get("/promo-codes", promoController.listPromoCodes);

// بنك الأسئلة والاختبارات
router.post("/questions", quizController.createQuestion);
router.post("/quizzes", quizController.createQuiz);

module.exports = router;

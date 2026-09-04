const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const teacherController = require("../controllers/teacherController");

const router = express.Router();
router.use(requireAuth, requireRole("superadmin"));

router.post("/teachers", teacherController.createTeacher);
router.get("/teachers", teacherController.listTeachers);
router.patch("/teachers/:teacherId/active", teacherController.setTeacherActive);

module.exports = router;

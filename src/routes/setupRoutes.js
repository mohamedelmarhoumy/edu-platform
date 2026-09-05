const express = require("express");
const setupController = require("../controllers/setupController");

const router = express.Router();

router.get("/status", setupController.getStatus);
router.post("/bootstrap-teacher", setupController.bootstrapTeacher);

module.exports = router;

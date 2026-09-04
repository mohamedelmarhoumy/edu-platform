const db = require("../config/db");

/* ---------- المعلّم: بنك الأسئلة والاختبارات ---------- */

async function createQuestion(req, res) {
  const { prompt, options, correctIndex, courseId } = req.body;
  const { rows } = await db.query(
    `INSERT INTO questions (teacher_id, course_id, prompt, options, correct_index)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.user.teacherId, courseId || null, prompt, JSON.stringify(options), correctIndex]
  );
  res.status(201).json(rows[0]);
}

async function createQuiz(req, res) {
  const { lessonId, title, timeLimitSeconds, passScorePercent = 50, maxAttempts = 1, questionIds } = req.body;

  const { rows } = await db.query(
    `INSERT INTO quizzes (lesson_id, title, time_limit_seconds, pass_score_percent, max_attempts)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [lessonId || null, title, timeLimitSeconds || null, passScorePercent, maxAttempts]
  );
  const quiz = rows[0];

  for (let i = 0; i < questionIds.length; i++) {
    await db.query(
      `INSERT INTO quiz_questions (quiz_id, question_id, sort_order) VALUES ($1, $2, $3)`,
      [quiz.id, questionIds[i], i]
    );
  }
  res.status(201).json(quiz);
}

/* ---------- الطالب: أداء الاختبار ---------- */

async function getQuizForStudent(req, res) {
  const { quizId } = req.params;
  const { rows: quizRows } = await db.query(`SELECT * FROM quizzes WHERE id = $1`, [quizId]);
  const quiz = quizRows[0];
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود" });

  const { rows: attempts } = await db.query(
    `SELECT COUNT(*) FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2`,
    [quizId, req.user.sub]
  );
  if (Number(attempts[0].count) >= quiz.max_attempts) {
    return res.status(403).json({ error: "استنفدت عدد المحاولات المسموح بها" });
  }

  // لا تُرسل الإجابة الصحيحة قبل التسليم
  const { rows: questions } = await db.query(
    `SELECT q.id, q.prompt, q.options
     FROM quiz_questions qq JOIN questions q ON q.id = qq.question_id
     WHERE qq.quiz_id = $1 ORDER BY qq.sort_order`,
    [quizId]
  );
  res.json({ ...quiz, questions });
}

async function submitQuizAttempt(req, res) {
  const { quizId } = req.params;
  const { answers } = req.body; // { questionId: chosenIndex }
  const studentId = req.user.sub;

  const { rows: quizRows } = await db.query(`SELECT * FROM quizzes WHERE id = $1`, [quizId]);
  const quiz = quizRows[0];
  if (!quiz) return res.status(404).json({ error: "الاختبار غير موجود" });

  const { rows: questions } = await db.query(
    `SELECT q.id, q.correct_index
     FROM quiz_questions qq JOIN questions q ON q.id = qq.question_id
     WHERE qq.quiz_id = $1`,
    [quizId]
  );

  let correctCount = 0;
  for (const q of questions) {
    if (answers[q.id] === q.correct_index) correctCount++;
  }
  const scorePercent = questions.length ? (correctCount / questions.length) * 100 : 0;

  const { rows } = await db.query(
    `INSERT INTO quiz_attempts (quiz_id, student_id, answers, score_percent)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [quizId, studentId, JSON.stringify(answers), scorePercent]
  );

  res.status(201).json({
    scorePercent,
    passed: scorePercent >= quiz.pass_score_percent,
    correctAnswers: quiz.show_answers_after_submit
      ? Object.fromEntries(questions.map((q) => [q.id, q.correct_index]))
      : undefined,
    attemptId: rows[0].id,
  });
}

module.exports = { createQuestion, createQuiz, getQuizForStudent, submitQuizAttempt };

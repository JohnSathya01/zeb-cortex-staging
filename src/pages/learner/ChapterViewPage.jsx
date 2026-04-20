import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import MarkdownRenderer from '../../components/MarkdownRenderer.jsx';
import PageLoader from '../../components/PageLoader.jsx';
import AssessmentCard from '../../components/AssessmentCard.jsx';
import ExerciseCard from '../../components/ExerciseCard.jsx';
import ChatWidget from '../../components/ChatWidget.jsx';
import '../../styles/pages.css';

export default function ChapterViewPage() {
  const { courseId, chapterId } = useParams();
  const { user } = useAuth();
  const { getCourseById, getProgress, getAssessments, submitAssessment, submitExercise, markChapterComplete, getAssignments, getReviewerForAssignment } = useData();
  const navigate = useNavigate();

  const [chapter, setChapter] = useState(null);
  const [sortedChapters, setSortedChapters] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  // Assessment state
  const [answers, setAnswers] = useState({});
  const [assessmentSubmitted, setAssessmentSubmitted] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessmentError, setAssessmentError] = useState(null);

  // Exercise submissions from progress
  const [exerciseSubmissions, setExerciseSubmissions] = useState({});

  // Chapter completion
  const [chapterCompleted, setChapterCompleted] = useState(false);

  // Reviewer
  const [reviewer, setReviewer] = useState(null);
  const [assignmentId, setAssignmentId] = useState(null);

  useEffect(() => {
    if (user && courseId && chapterId) loadChapter();
  }, [user, courseId, chapterId]);

  async function loadChapter() {
    try {
      const course = await getCourseById(courseId);
      const ch = course.chapters.find((c) => c.id === chapterId);
      if (!ch) { setLoading(false); return; }
      setChapter(ch);

      const sorted = [...course.chapters].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      setSortedChapters(sorted);

      // Load assessments from RTDB and convert to array format for AssessmentCard
      const rtdbAssessments = await getAssessments(courseId, chapterId);
      const converted = rtdbAssessments.map((a) => ({
        id: a.id,
        question: a.question,
        options: Object.entries(a.options).map(([optId, opt]) => ({
          id: optId,
          text: opt.text,
          isCorrect: opt.isCorrect,
        })),
      }));
      setAssessments(converted);

      const prog = await getProgress(user.uid, courseId);
      setProgress(prog);
      setCompletedIds(prog.completedChapterIds || []);

      // Restore assessment results if already submitted
      if (prog.assessmentResults[chapterId]) {
        setAssessmentSubmitted(true);
        setAssessmentResult(prog.assessmentResults[chapterId]);
        setAnswers(prog.assessmentResults[chapterId].answers || {});
      }

      // Restore exercise submissions
      const subs = {};
      for (const ex of ch.exercises) {
        if (prog.exerciseSubmissions[ex.id]) {
          subs[ex.id] = prog.exerciseSubmissions[ex.id];
        }
      }
      setExerciseSubmissions(subs);

      // Check if already completed
      setChapterCompleted(prog.completedChapterIds.includes(chapterId));

      // Fetch reviewer if assigned
      try {
        const allAssignments = await getAssignments({ learnerId: user.uid, courseId });
        if (allAssignments.length > 0) {
          setAssignmentId(allAssignments[0].id);
          const reviewerProfile = await getReviewerForAssignment(allAssignments[0].id);
          setReviewer(reviewerProfile);
        }
      } catch {
        // No reviewer or fetch failed
      }
    } catch {
      // handle error
    } finally {
      setLoading(false);
    }
  }

  function handleSelectAnswer(assessmentId, optionId) {
    setAnswers((prev) => ({ ...prev, [assessmentId]: optionId }));
  }

  async function handleSubmitAssessments() {
    setAssessmentError(null);
    // Validate all questions answered
    const allAnswered = assessments.every((a) => answers[a.id]);
    if (!allAnswered) {
      setAssessmentError('Please answer all questions before submitting.');
      return;
    }

    try {
      const result = await submitAssessment(user.uid, chapterId, answers);
      setAssessmentResult(result);
      setAssessmentSubmitted(true);
      await checkChapterCompletion(true, exerciseSubmissions);
    } catch {
      setAssessmentError('Failed to submit assessment.');
    }
  }

  async function handleSubmitExercise(exerciseId, text) {
    try {
      const submission = await submitExercise(user.uid, chapterId, exerciseId, text);
      const updatedSubs = { ...exerciseSubmissions, [exerciseId]: submission };
      setExerciseSubmissions(updatedSubs);
      await checkChapterCompletion(assessmentSubmitted, updatedSubs);
    } catch {
      // handle error
    }
  }

  async function checkChapterCompletion(assessmentsComplete, currentExerciseSubs) {
    if (!chapter) return;
    const hasAssessments = assessments.length > 0;
    const hasExercises = chapter.exercises.length > 0;

    const assessmentsDone = !hasAssessments || assessmentsComplete;
    const exercisesDone = !hasExercises || chapter.exercises.every((ex) => currentExerciseSubs[ex.id]);

    if (assessmentsDone && exercisesDone && !chapterCompleted) {
      try {
        await markChapterComplete(user.uid, courseId, chapterId);
        setChapterCompleted(true);
      } catch {
        // handle error
      }
    }
  }

  if (loading) return <PageLoader />;
  if (!chapter) return <div className="empty-state">Chapter not found.</div>;

  const hasAssessments = assessments.length > 0;
  const hasExercises = chapter.exercises.length > 0;

  return (
    <div className="chapter-view">
      <div className="chapter-view-header">
        <Link to={`/learner/course/${courseId}`} className="back-link">
          ← Back to Course
        </Link>
        <h1>{chapter.title}</h1>
      </div>

      {/* Content Body */}
      <MarkdownRenderer content={chapter.contentBody} />

      {/* Assessments Section */}
      {hasAssessments && (
        <div className="chapter-section">
          <h2>Assessments</h2>

          {assessmentError && (
            <div className="assessment-error">{assessmentError}</div>
          )}

          {assessments.map((assessment) => (
            <AssessmentCard
              key={assessment.id}
              assessment={assessment}
              selectedAnswer={answers[assessment.id]}
              onSelect={handleSelectAnswer}
              submitted={assessmentSubmitted}
              disabled={assessmentSubmitted}
            />
          ))}

          {!assessmentSubmitted && (
            <button className="btn btn-primary" onClick={handleSubmitAssessments}>
              Submit Assessments
            </button>
          )}

          {assessmentResult && (
            <div className="assessment-score">
              Score: {assessmentResult.score} / {assessmentResult.total}
            </div>
          )}
        </div>
      )}

      {/* Exercises Section */}
      {hasExercises && (
        <div className="chapter-section">
          <h2>Exercises</h2>
          {chapter.exercises.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              submission={exerciseSubmissions[exercise.id]}
              onSubmit={handleSubmitExercise}
            />
          ))}
        </div>
      )}

      {/* Chapter Completion Banner */}
      {chapterCompleted && (
        <div className="chapter-complete-banner">
          ✓ Chapter completed!
        </div>
      )}

      {/* Previous / Next Chapter Navigation */}
      {sortedChapters.length > 0 && (() => {
        const currentIndex = sortedChapters.findIndex((ch) => ch.id === chapterId);
        const prevChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
        const nextChapter = currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1] : null;
        const canGoPrev = prevChapter && (completedIds.includes(prevChapter.id) || prevChapter.id === chapterId);
        const canGoNext = nextChapter && (chapterCompleted || completedIds.includes(nextChapter.id));

        return (
          <div className="chapter-nav">
            {prevChapter ? (
              <button
                className="btn btn-secondary chapter-nav-btn"
                onClick={() => navigate(`/learner/course/${courseId}/chapter/${prevChapter.id}`)}
              >
                ← {prevChapter.title}
              </button>
            ) : <div />}
            {nextChapter ? (
              <button
                className={`btn chapter-nav-btn ${canGoNext ? 'btn-primary' : 'btn-secondary'}`}
                disabled={!canGoNext}
                onClick={() => navigate(`/learner/course/${courseId}/chapter/${nextChapter.id}`)}
              >
                {nextChapter.title} →
              </button>
            ) : <div />}
          </div>
        );
      })()}

      {/* Chat Widget */}
      <ChatWidget assignmentId={assignmentId} reviewer={reviewer} learnerName={user?.name || ''} />
    </div>
  );
}

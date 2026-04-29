import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WORKER_URL = import.meta.env.VITE_MAILER_URL;

async function workerAuthCreate(email, password, displayName) {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(`${WORKER_URL}/auth/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to create Firebase Auth user');
  return data.uid;
}

async function workerAuthDelete(uid) {
  if (!WORKER_URL) throw new Error('VITE_MAILER_URL not configured');
  const res = await fetch(`${WORKER_URL}/auth/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Failed to delete Firebase Auth user');
}
import { ref, get, set, push, remove, update, child, onValue } from 'firebase/database';
import { database } from '../firebase.js';
import { encryptField, decryptField } from '../utils/encryption.js';
import { useAuth } from './AuthContext.jsx';
import { createNotification as createNotificationRecord } from '../models/index.js';
import {
  initCourses,
  getCourses as getCoursesFromData,
  getCourseById as getCourseByIdFromData,
  createCourseRecord as createCourseRecordFromData,
  updateCourse as updateCourseFromData,
  deleteCourse as deleteCourseFromData,
  addChaptersToCourse as addChaptersFromData,
  reorderChapters as reorderChaptersFromData,
} from '../store/courseData.js';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user, isAuthenticated, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      let cancelled = false;
      initCourses()
        .then(() => {
          if (!cancelled && mountedRef.current) {
            setLoading(false);
          }
        })
        .catch((err) => {
          console.warn('Failed to initialize courses:', err);
          if (!cancelled && mountedRef.current) {
            setLoading(false);
          }
        });
      return () => { cancelled = true; };
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const handlePermissionDenied = useCallback((error) => {
    if (error?.message?.includes('PERMISSION_DENIED') || error?.code === 'PERMISSION_DENIED') {
      logout();
    }
  }, [logout]);

  // ── Audit Log ──

  async function logAudit(action, detail, targetId = null) {
    try {
      const actor = userRef.current;
      const entry = {
        actorId: actor?.uid || 'unknown',
        actorName: actor?.name || 'Unknown',
        action,
        detail,
        targetId: targetId || null,
        timestamp: new Date().toISOString(),
      };
      const newRef = push(ref(database, 'auditLogs'));
      await set(newRef, entry);
    } catch {
      // Audit log is best-effort; never block the primary operation
    }
  }

  const getAuditLogs = useCallback(async (limitCount = 200) => {
    try {
      const snapshot = await get(ref(database, 'auditLogs'));
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      const logs = Object.entries(data).map(([id, entry]) => ({ id, ...entry }));
      logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return logs.slice(0, limitCount);
    } catch (error) {
      handlePermissionDenied(error);
      return [];
    }
  }, [handlePermissionDenied]);

  // ── Users ──

  const getUsers = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'users'));
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      return Object.entries(data).map(([uid, profile]) => ({ id: uid, uid, ...profile }));
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const getUserById = useCallback(async (id) => {
    try {
      const snapshot = await get(ref(database, `users/${id}`));
      if (!snapshot.exists()) throw { error: 'Not found' };
      return { id, uid: id, ...snapshot.val() };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const createUserRecord = useCallback(async (data) => {
    try {
      // Create Firebase Auth account via Worker (gets real UID back)
      const uid = await workerAuthCreate(data.email, data.password, data.name);

      // Write RTDB profile under the real Auth UID
      const profile = { name: data.name, email: data.email, role: data.role, mustChangePassword: true };
      if (data.specialisation) profile.specialisation = data.specialisation;
      await set(ref(database, `users/${uid}`), profile);

      logAudit('create_user', `Created user "${data.name}" with role "${data.role}"`, uid);
      return { id: uid, uid, ...profile };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const updateUser = useCallback(async (id, data) => {
    try {
      const updates = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.email !== undefined) updates.email = data.email;
      if (data.role !== undefined) updates.role = data.role;
      await update(ref(database, `users/${id}`), updates);
      const snapshot = await get(ref(database, `users/${id}`));
      const updated = snapshot.val();
      logAudit('update_user', `Updated user "${updated?.name || id}"`, id);
      return { id, uid: id, ...updated };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteUser = useCallback(async (id) => {
    try {
      const snap = await get(ref(database, `users/${id}`));
      const name = snap.exists() ? snap.val().name : id;

      // Remove RTDB profile
      await remove(ref(database, `users/${id}`));

      // Delete Firebase Auth account via Worker (best-effort — don't block if it fails)
      workerAuthDelete(id).catch((err) => {
        console.warn('Auth delete failed (manual cleanup may be needed):', err.message);
      });

      logAudit('delete_user', `Deleted user "${name}"`, id);
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // ── Courses (in-memory from markdown) ──

  const getCourses = useCallback(async () => {
    return Promise.resolve(getCoursesFromData());
  }, []);

  const getCourseById = useCallback(async (id) => {
    const course = getCourseByIdFromData(id);
    if (!course) throw { error: 'Not found' };
    return Promise.resolve(course);
  }, []);

  const createCourseRecord = useCallback(async (data) => {
    return Promise.resolve(createCourseRecordFromData(data));
  }, []);

  const updateCourse = useCallback(async (id, data) => {
    const result = updateCourseFromData(id, data);
    if (!result) throw { error: 'Not found' };
    return Promise.resolve(result);
  }, []);

  const deleteCourse = useCallback(async (id) => {
    const result = deleteCourseFromData(id);
    if (!result) throw { error: 'Not found' };
    return Promise.resolve();
  }, []);

  const addChaptersToCourse = useCallback(async (courseId, chapters) => {
    const result = addChaptersFromData(courseId, chapters);
    if (!result) throw { error: 'Not found' };
    return Promise.resolve(result);
  }, []);

  const reorderChapters = useCallback(async (courseId, orderedIds) => {
    const result = reorderChaptersFromData(courseId, orderedIds);
    if (!result) throw { error: 'Not found' };
    return Promise.resolve(result);
  }, []);

  // ── Assignments ──

  const getAssignments = useCallback(async (filters = {}) => {
    try {
      const snapshot = await get(ref(database, 'assignments'));
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      let result = Object.entries(data).map(([id, a]) => ({ id, ...a }));
      if (filters.learnerId) result = result.filter((a) => a.learnerId === filters.learnerId);
      if (filters.courseId) result = result.filter((a) => a.courseId === filters.courseId);
      if (filters.status) result = result.filter((a) => a.status === filters.status);
      return result;
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const createAssignmentRecord = useCallback(async (learnerId, courseId, targetCompletionDate = null) => {
    try {
      // Check for duplicates
      const snapshot = await get(ref(database, 'assignments'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const duplicate = Object.values(data).find(
          (a) => a.learnerId === learnerId && a.courseId === courseId
        );
        if (duplicate) {
          throw { error: 'Course already assigned to this learner' };
        }
      }
      const newRef = push(ref(database, 'assignments'));
      const assignment = {
        learnerId,
        courseId,
        status: 'not_started',
        targetCompletionDate: targetCompletionDate || null,
        assignedAt: new Date().toISOString(),
      };
      await set(newRef, assignment);

      // Auto-fix: if this new learner was a reviewer for others in the same course,
      // reassign those to the default reviewer (Sivasaran Sekaran)
      const existingData = snapshot.exists() ? snapshot.val() : {};
      const conflicting = Object.entries(existingData).filter(
        ([, a]) => a.courseId === courseId && a.reviewerId === learnerId
      );
      if (conflicting.length > 0) {
        // Find Sivasaran's UID
        const usersSnap = await get(ref(database, 'users'));
        let defaultReviewerUid = null;
        if (usersSnap.exists()) {
          const usersData = usersSnap.val();
          const siva = Object.entries(usersData).find(
            ([, u]) => u.email && u.email.toLowerCase() === 'sivasaran.sekaran@zeb.co'
          );
          if (siva) defaultReviewerUid = siva[0];
        }
        for (const [aId, a] of conflicting) {
          // Remove old reviewer access
          await remove(ref(database, `reviewerAccess/${a.learnerId}/${learnerId}`));
          if (defaultReviewerUid && defaultReviewerUid !== a.learnerId) {
            await update(ref(database, `assignments/${aId}`), { reviewerId: defaultReviewerUid });
            await set(ref(database, `reviewerAccess/${a.learnerId}/${defaultReviewerUid}`), true);
            logAudit('auto_reassign_reviewer', `Auto-reassigned reviewer from ${learnerId} to Sivasaran Sekaran for assignment ${aId} (learner became same-course peer)`, aId);
          } else {
            await update(ref(database, `assignments/${aId}`), { reviewerId: null });
            logAudit('auto_remove_reviewer', `Auto-removed reviewer ${learnerId} from assignment ${aId} (learner became same-course peer)`, aId);
          }
        }
      }

      // Resolve names for audit log (best-effort)
      const [learnerSnap] = await Promise.all([get(ref(database, `users/${learnerId}`))]);
      const learnerName = learnerSnap.exists() ? learnerSnap.val().name : learnerId;
      const courses = getCoursesFromData();
      const course = courses.find((c) => c.id === courseId);
      const courseName = course ? course.title : courseId;
      const deadlineNote = targetCompletionDate ? ` (deadline: ${targetCompletionDate})` : '';
      logAudit('assign_course', `Assigned "${courseName}" to ${learnerName}${deadlineNote}`, newRef.key);
      return { id: newRef.key, ...assignment };
    } catch (error) {
      if (error?.error) throw error;
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // ── Cohorts ──

  const getCohorts = useCallback(async () => {
    try {
      const snapshot = await get(ref(database, 'cohorts'));
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      return Object.entries(data).map(([id, c]) => ({
        id,
        ...c,
        members: c.members ? Object.keys(c.members) : [],
      }));
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const createCohort = useCallback(async ({ name, description, memberIds = [] }) => {
    try {
      const newRef = push(ref(database, 'cohorts'));
      const members = {};
      memberIds.forEach((uid) => { members[uid] = true; });
      const cohort = { name, description: description || '', members, createdAt: new Date().toISOString() };
      await set(newRef, cohort);
      logAudit('create_cohort', `Created cohort "${name}" with ${memberIds.length} member(s)`, newRef.key);
      return { id: newRef.key, ...cohort, members: memberIds };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const updateCohort = useCallback(async (cohortId, { name, description, memberIds }) => {
    try {
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (memberIds !== undefined) {
        const members = {};
        memberIds.forEach((uid) => { members[uid] = true; });
        updates.members = members;
      }
      await update(ref(database, `cohorts/${cohortId}`), updates);
      logAudit('update_cohort', `Updated cohort "${name || cohortId}"`, cohortId);
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteCohort = useCallback(async (cohortId) => {
    try {
      const snap = await get(ref(database, `cohorts/${cohortId}`));
      const cohortName = snap.exists() ? snap.val().name : cohortId;
      await remove(ref(database, `cohorts/${cohortId}`));
      logAudit('delete_cohort', `Deleted cohort "${cohortName}"`, cohortId);
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteAssignment = useCallback(async (id) => {
    try {
      const snap = await get(ref(database, `assignments/${id}`));
      let detail = `Removed assignment ${id}`;
      if (snap.exists()) {
        const a = snap.val();
        const [learnerSnap] = await Promise.all([get(ref(database, `users/${a.learnerId}`))]);
        const learnerName = learnerSnap.exists() ? learnerSnap.val().name : a.learnerId;
        const courses = getCoursesFromData();
        const course = courses.find((c) => c.id === a.courseId);
        const courseName = course ? course.title : a.courseId;
        detail = `Unassigned "${courseName}" from ${learnerName}`;
      }
      await remove(ref(database, `assignments/${id}`));
      logAudit('unassign_course', detail, id);
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // ── Progress ──

  const getProgress = useCallback(async (learnerId, courseId) => {
    try {
      const snapshot = await get(ref(database, `progress/${learnerId}/${courseId}`));
      if (!snapshot.exists()) {
        return {
          learnerId,
          courseId,
          completedChapterIds: [],
          assessmentResults: {},
          exerciseSubmissions: {},
        };
      }
      const data = snapshot.val();
      const record = {
        learnerId,
        courseId,
        completedChapterIds: data.completedChapterIds || [],
        assessmentResults: {},
        exerciseSubmissions: {},
      };
      // Decrypt assessment results
      if (data.assessmentResults) {
        for (const [chId, result] of Object.entries(data.assessmentResults)) {
          record.assessmentResults[chId] = {
            answers: result.answers ? decryptField(result.answers) : {},
            score: result.score !== undefined ? decryptField(result.score) : 0,
            total: result.total,
            submittedAt: result.submittedAt,
          };
        }
      }
      // Decrypt exercise submissions
      if (data.exerciseSubmissions) {
        for (const [exId, sub] of Object.entries(data.exerciseSubmissions)) {
          record.exerciseSubmissions[exId] = {
            text: sub.text ? decryptField(sub.text) : '',
            submittedAt: sub.submittedAt,
          };
        }
      }
      return record;
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // Fetch progress via worker (admin access) — used by reviewers who can't read other learners' progress directly
  const getProgressAsReviewer = useCallback(async (learnerId, courseId) => {
    try {
      const res = await fetch(`${WORKER_URL}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerId, courseId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to fetch progress');
      const data = json.data;
      if (!data) return { learnerId, courseId, completedChapterIds: [], assessmentResults: {}, exerciseSubmissions: {} };
      const record = {
        learnerId, courseId,
        completedChapterIds: data.completedChapterIds || [],
        assessmentResults: {},
        exerciseSubmissions: {},
      };
      if (data.assessmentResults) {
        for (const [chId, result] of Object.entries(data.assessmentResults)) {
          record.assessmentResults[chId] = {
            answers: result.answers ? decryptField(result.answers) : {},
            score: result.score !== undefined ? decryptField(result.score) : 0,
            total: result.total,
            submittedAt: result.submittedAt,
          };
        }
      }
      if (data.exerciseSubmissions) {
        for (const [exId, sub] of Object.entries(data.exerciseSubmissions)) {
          record.exerciseSubmissions[exId] = {
            text: sub.text ? decryptField(sub.text) : '',
            submittedAt: sub.submittedAt,
            aiReview: sub.aiReview || null,
          };
        }
      }
      return record;
    } catch (error) {
      throw error;
    }
  }, []);

  const markChapterComplete = useCallback(async (learnerId, courseId, chapterId) => {
    try {
      const progressRef = ref(database, `progress/${learnerId}/${courseId}`);
      const snapshot = await get(progressRef);
      let completedChapterIds = [];
      let existingData = {};
      if (snapshot.exists()) {
        existingData = snapshot.val();
        completedChapterIds = existingData.completedChapterIds || [];
      }
      if (!completedChapterIds.includes(chapterId)) {
        completedChapterIds.push(chapterId);
      }
      await update(progressRef, { completedChapterIds });

      // Check if all chapters are done and update assignment status
      const courses = getCoursesFromData();
      const course = courses.find((c) => c.id === courseId);
      if (course) {
        const allDone = course.chapters.every((ch) => completedChapterIds.includes(ch.id));
        const assignmentsSnap = await get(ref(database, 'assignments'));
        if (assignmentsSnap.exists()) {
          const assignments = assignmentsSnap.val();
          for (const [aId, a] of Object.entries(assignments)) {
            if (a.learnerId === learnerId && a.courseId === courseId) {
              if (allDone) {
                await update(ref(database, `assignments/${aId}`), { status: 'completed' });
                // Notify reviewer for final feedback
                if (a.reviewerId) {
                  const learnerSnap2 = await get(ref(database, `users/${learnerId}`));
                  const lName = learnerSnap2.exists() ? learnerSnap2.val().name : 'A learner';
                  const cName = course ? course.title : courseId;
                  await sendNotification(a.reviewerId, {
                    type: 'course_completed_final_feedback',
                    message: `${lName} completed ${cName}. Please schedule a meeting and submit final feedback.`,
                    metadata: { learnerId, courseId, assignmentId: aId },
                  });
                  try {
                    const { sendCourseCompletedEmail } = await import('../services/emailService.js');
                    await sendCourseCompletedEmail({ learnerId, courseId, reviewerId: a.reviewerId });
                  } catch { /* email best-effort */ }
                }
              } else if (a.status === 'not_started') {
                await update(ref(database, `assignments/${aId}`), { status: 'in_progress' });
              }
              break;
            }
          }
        }
      }

      // Notify reviewer about chapter completion
      const chapterCourse = courses.find((c) => c.id === courseId);
      const chapterObj = chapterCourse?.chapters.find((ch) => ch.id === chapterId);
      const chapterTitle = chapterObj ? chapterObj.title : 'a chapter';
      await notifyReviewerForActivity(learnerId, courseId, {
        type: 'chapter_completed',
        messageBuilder: (learnerName, courseName) =>
          `${learnerName} completed "${chapterTitle}" in ${courseName}`,
        metadata: { chapterId },
      });
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const submitAssessment = useCallback(async (learnerId, chapterId, answers) => {
    try {
      // Find the courseId for this chapter
      const courses = getCoursesFromData();
      let courseId = null;
      for (const course of courses) {
        const ch = course.chapters.find((c) => c.id === chapterId);
        if (ch) { courseId = course.id; break; }
      }
      if (!courseId) throw { error: 'Not found' };

      // Fetch assessment questions from RTDB
      const assessSnap = await get(ref(database, `assessments/${courseId}/${chapterId}`));
      if (!assessSnap.exists()) throw { error: 'No assessments found' };
      const assessData = assessSnap.val();
      const assessments = Object.entries(assessData).map(([id, item]) => ({
        id,
        question: item.question,
        options: item.options || {},
      }));
      if (assessments.length === 0) throw { error: 'No assessments found' };

      // Score answers against RTDB questions
      let score = 0;
      const total = assessments.length;
      for (const assessment of assessments) {
        const selectedOptionId = answers[assessment.id];
        const correctOption = Object.entries(assessment.options)
          .find(([, opt]) => opt.isCorrect);
        if (correctOption && selectedOptionId === correctOption[0]) {
          score += 1;
        }
      }

      const result = {
        answers: encryptField(answers),
        score: encryptField(score),
        total,
        submittedAt: new Date().toISOString(),
      };

      await set(
        ref(database, `progress/${learnerId}/${courseId}/assessmentResults/${chapterId}`),
        result
      );

      // Notify reviewer about assessment submission
      const assessCourse = courses.find((c) => c.id === courseId);
      const assessChapter = assessCourse?.chapters.find((ch) => ch.id === chapterId);
      const assessChapterTitle = assessChapter ? assessChapter.title : 'a chapter';
      await notifyReviewerForActivity(learnerId, courseId, {
        type: 'assessment_submitted',
        messageBuilder: (learnerName, courseName) =>
          `${learnerName} submitted an assessment for "${assessChapterTitle}" in ${courseName}`,
        metadata: { chapterId },
      });

      return { answers, score, total, submittedAt: result.submittedAt };
    } catch (error) {
      if (error?.error) throw error;
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const submitExercise = useCallback(async (learnerId, chapterId, exerciseId, text) => {
    if (!text || !text.trim()) {
      throw { error: 'Exercise submission cannot be empty' };
    }
    try {
      // Find the chapter to get courseId
      const courses = getCoursesFromData();
      let chapter = null;
      let courseId = null;
      for (const course of courses) {
        chapter = course.chapters.find((ch) => ch.id === chapterId);
        if (chapter) { courseId = course.id; break; }
      }
      if (!chapter) throw { error: 'Not found' };

      const submission = {
        text: encryptField(text),
        submittedAt: new Date().toISOString(),
      };

      await set(
        ref(database, `progress/${learnerId}/${courseId}/exerciseSubmissions/${exerciseId}`),
        submission
      );

      // Notify reviewer about exercise submission
      const exChapter = chapter;
      const exercise = exChapter?.exercises?.find((ex) => ex.id === exerciseId);
      const exerciseTitle = exercise ? exercise.title : 'an exercise';
      await notifyReviewerForActivity(learnerId, courseId, {
        type: 'exercise_submitted',
        messageBuilder: (learnerName, courseName) =>
          `${learnerName} submitted "${exerciseTitle}" in ${courseName}`,
        metadata: { exerciseId, chapterId },
      });

      return { text, submittedAt: submission.submittedAt };
    } catch (error) {
      if (error?.error) throw error;
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // ── Reviewer Feedback ──

  const getReviewerFeedback = useCallback(async (assignmentId) => {
    try {
      const snapshot = await get(ref(database, `reviewerFeedback/${assignmentId}`));
      if (!snapshot.exists()) return { weekly: {}, final: null };
      const data = snapshot.val();
      return { weekly: data.weekly || {}, final: data.final || null };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const submitWeeklyFeedback = useCallback(async (assignmentId, weekId, scores) => {
    try {
      const feedbackRef = ref(database, `reviewerFeedback/${assignmentId}/weekly/${weekId}`);
      const existing = await get(feedbackRef);
      if (existing.exists() && existing.val().overridden) {
        throw { error: 'Feedback has already been overridden and is now locked.' };
      }
      const isOverride = existing.exists();
      const record = {
        attitude: scores.attitude,
        communication: scores.communication,
        business: scores.business,
        technology: scores.technology,
        submittedAt: new Date().toISOString(),
        overridden: isOverride,
        aiSuggested: scores.aiSuggested || null,
        feedbackTexts: scores.feedbackTexts || null,
      };
      await set(feedbackRef, record);
      return record;
    } catch (error) {
      if (error?.error) throw error;
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const submitFinalFeedback = useCallback(async (assignmentId, scores) => {
    try {
      const feedbackRef = ref(database, `reviewerFeedback/${assignmentId}/final`);
      const existing = await get(feedbackRef);
      if (existing.exists() && existing.val().overridden) {
        throw { error: 'Final feedback has already been overridden and is now locked.' };
      }
      const isOverride = existing.exists();
      const record = {
        attitude: scores.attitude,
        communication: scores.communication,
        business: scores.business,
        technology: scores.technology,
        submittedAt: new Date().toISOString(),
        overridden: isOverride,
        aiSuggested: scores.aiSuggested || null,
        feedbackTexts: scores.feedbackTexts || null,
      };
      await set(feedbackRef, record);
      return record;
    } catch (error) {
      if (error?.error) throw error;
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const getAIFeedbackScores = useCallback(async (assignmentId, learnerId, courseId, feedbackText) => {
    try {
      const res = await fetch(`${WORKER_URL}/ai/feedback-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, learnerId, courseId, feedbackText }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      return json.scores;
    } catch {
      return { attitude: 5, communication: 5, business: 5, technology: 5 };
    }
  }, []);

  // ── Course Points ──

  const calculateCoursePoints = useCallback(async (userId, courseId, totalChapters, assignmentId, sendEmail = false) => {
    try {
      const res = await fetch(`${WORKER_URL}/points/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, courseId, totalChapters, assignmentId, sendEmail }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Failed to calculate points');
      return json;
    } catch (err) {
      console.error('calculateCoursePoints worker failed:', err.message || err);
      // Fallback: read cached points from Firebase directly
      try {
        const snapshot = await get(ref(database, `coursePoints/${userId}/${courseId}`));
        if (snapshot.exists()) return { ok: true, ...snapshot.val() };
      } catch {
        // Firebase read also failed
      }
      return null;
    }
  }, []);

  const getCoursePoints = useCallback(async (userId, courseId) => {
    try {
      const res = await fetch(`${WORKER_URL}/points/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, courseId }),
      });
      const json = await res.json();
      if (!json.ok) return null;
      return json.points;
    } catch {
      return null;
    }
  }, []);

  const getAtRiskLearners = useCallback(async () => {
    try {
      const res = await fetch(`${WORKER_URL}/points/at-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!json.ok) return [];
      return json.atRisk || [];
    } catch {
      return [];
    }
  }, []);

  // Saves AI-generated review alongside an exercise submission (silent — never blocks UX)
  const saveExerciseAIReview = useCallback(async (learnerId, courseId, exerciseId, aiReview) => {
    try {
      await update(
        ref(database, `progress/${learnerId}/${courseId}/exerciseSubmissions/${exerciseId}`),
        { aiReview }
      );
    } catch {
      // Non-critical — ignore silently
    }
  }, []);

  // ── Assessments (RTDB) ──

  const getAssessments = useCallback(async (courseId, chapterId) => {
    try {
      const snapshot = await get(ref(database, `assessments/${courseId}/${chapterId}`));
      if (!snapshot.exists()) return [];
      const data = snapshot.val();
      return Object.entries(data).map(([id, item]) => ({
        id,
        question: item.question,
        options: item.options || {},
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const saveAssessment = useCallback(async (courseId, chapterId, assessmentData) => {
    try {
      const now = new Date().toISOString();
      let id = assessmentData.id;
      let record;

      if (!id) {
        const newRef = push(ref(database, `assessments/${courseId}/${chapterId}`));
        id = newRef.key;
        record = {
          id,
          question: assessmentData.question,
          options: assessmentData.options,
          createdAt: now,
          updatedAt: now,
        };
        await set(newRef, record);
      } else {
        record = {
          id,
          question: assessmentData.question,
          options: assessmentData.options,
          updatedAt: now,
        };
        if (assessmentData.createdAt) {
          record.createdAt = assessmentData.createdAt;
        }
        await update(ref(database, `assessments/${courseId}/${chapterId}/${id}`), record);
      }

      return record;
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteAssessment = useCallback(async (courseId, chapterId, assessmentId) => {
    try {
      await remove(ref(database, `assessments/${courseId}/${chapterId}/${assessmentId}`));
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // ── Exercises (Firebase-managed, UI-created) ──

  const getExercises = useCallback(async (courseId, chapterId) => {
    try {
      const snapshot = await get(ref(database, `exercises/${courseId}/${chapterId}`));
      if (!snapshot.exists()) return [];
      return Object.entries(snapshot.val())
        .map(([id, ex]) => ({ id, ...ex }))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    } catch (error) {
      handlePermissionDenied(error);
      return [];
    }
  }, [handlePermissionDenied]);

  const saveExercise = useCallback(async (courseId, chapterId, exerciseData) => {
    try {
      const now = new Date().toISOString();
      const isNew = !exerciseData.id;
      const payload = {
        title: exerciseData.title || 'Exercise',
        prompt: exerciseData.prompt || '',
        pattern: exerciseData.pattern || null,
        flags: exerciseData.flags || 'i',
        hint: exerciseData.hint || '',
        explanation: exerciseData.explanation || '',
        order: exerciseData.order ?? 0,
        updatedAt: now,
      };
      if (isNew) {
        payload.createdAt = now;
        const newRef = push(ref(database, `exercises/${courseId}/${chapterId}`));
        await set(newRef, payload);
        return { id: newRef.key, ...payload };
      } else {
        await update(ref(database, `exercises/${courseId}/${chapterId}/${exerciseData.id}`), payload);
        return { id: exerciseData.id, ...payload };
      }
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteExercise = useCallback(async (courseId, chapterId, exerciseId) => {
    try {
      await remove(ref(database, `exercises/${courseId}/${chapterId}/${exerciseId}`));
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // Legacy alias kept so nothing else breaks
  const getExerciseRules = useCallback(async () => ({}), []);
  const saveExerciseRule = useCallback(async () => {}, []);

  // ── Timeline ──

  const setTimeline = useCallback(async (assignmentId, targetDate) => {
    try {
      await update(ref(database, `assignments/${assignmentId}`), {
        targetCompletionDate: targetDate,
      });
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const updateTimeline = useCallback(async (assignmentId, targetDate) => {
    return setTimeline(assignmentId, targetDate);
  }, [setTimeline]);

  // ── Notifications ──

  async function sendNotification(userId, { type, message, metadata = {} }) {
    try {
      const record = createNotificationRecord({ type, message, metadata });
      const newRef = push(ref(database, `notifications/${userId}`));
      await set(newRef, record);
      return { id: newRef.key, ...record };
    } catch (error) {
      console.error('Failed to send notification:', error);
      // Notifications are best-effort; don't block primary operations
    }
  }

  // Helper: look up reviewer for a learner+course and notify them
  async function notifyReviewerForActivity(learnerId, courseId, { type, messageBuilder, metadata }) {
    try {
      const assignmentsSnap = await get(ref(database, 'assignments'));
      if (!assignmentsSnap.exists()) return;
      const assignments = assignmentsSnap.val();
      let reviewerId = null;
      for (const [, a] of Object.entries(assignments)) {
        if (a.learnerId === learnerId && a.courseId === courseId && a.reviewerId) {
          reviewerId = a.reviewerId;
          break;
        }
      }
      if (!reviewerId) return;

      const learnerSnap = await get(ref(database, `users/${learnerId}`));
      const learnerName = learnerSnap.exists() ? learnerSnap.val().name : 'A learner';

      const courses = getCoursesFromData();
      const course = courses.find((c) => c.id === courseId);
      const courseName = course ? course.title : 'a course';

      const message = messageBuilder(learnerName, courseName);
      await sendNotification(reviewerId, { type, message, metadata: { learnerId, courseId, ...metadata } });
    } catch (error) {
      console.error('Failed to notify reviewer:', error);
    }
  }

  const assignReviewer = useCallback(async (assignmentId, reviewerUid) => {
    try {
      // Read the assignment to get learnerId and courseId
      const assignSnap = await get(ref(database, `assignments/${assignmentId}`));
      if (!assignSnap.exists()) throw new Error('Assignment not found');
      const assignment = assignSnap.val();

      // Defensive check: reviewer cannot be the learner
      if (reviewerUid && reviewerUid === assignment.learnerId) {
        throw new Error('Cannot assign learner as their own reviewer');
      }

      // Block if the proposed reviewer is also a learner in the same course
      if (reviewerUid) {
        const allAssignmentsSnap = await get(ref(database, 'assignments'));
        if (allAssignmentsSnap.exists()) {
          const allAssignments = Object.values(allAssignmentsSnap.val());
          const isLearnerInSameCourse = allAssignments.some(
            (a) => a.learnerId === reviewerUid && a.courseId === assignment.courseId
          );
          if (isLearnerInSameCourse) {
            throw new Error(
              'Cannot assign a learner from the same course as a reviewer.'
            );
          }
        }
      }

      if (reviewerUid) {
        // Clear old reviewer's access if there was one
        if (assignment.reviewerId && assignment.reviewerId !== reviewerUid) {
          await remove(ref(database, `reviewerAccess/${assignment.learnerId}/${assignment.reviewerId}`));
        }
        await update(ref(database, `assignments/${assignmentId}`), { reviewerId: reviewerUid });
        await set(ref(database, `reviewerAccess/${assignment.learnerId}/${reviewerUid}`), true);

        // Create notifications for both parties
        const [learnerSnap, reviewerSnap] = await Promise.all([
          get(ref(database, `users/${assignment.learnerId}`)),
          get(ref(database, `users/${reviewerUid}`)),
        ]);
        const learnerName = learnerSnap.exists() ? learnerSnap.val().name : 'A learner';
        const reviewerName = reviewerSnap.exists() ? reviewerSnap.val().name : 'A reviewer';

        const courses = getCoursesFromData();
        const course = courses.find((c) => c.id === assignment.courseId);
        const courseName = course ? course.title : 'a course';

        const meta = { assignmentId, courseId: assignment.courseId, learnerId: assignment.learnerId, reviewerId: reviewerUid };

        await Promise.all([
          sendNotification(assignment.learnerId, {
            type: 'reviewer_assigned',
            message: `${reviewerName} has been assigned as your reviewer for ${courseName}`,
            metadata: meta,
          }),
          sendNotification(reviewerUid, {
            type: 'reviewer_assigned',
            message: `You have been assigned as a reviewer for ${learnerName} in ${courseName}`,
            metadata: meta,
          }),
        ]);
        logAudit('assign_reviewer', `Assigned ${reviewerName} as reviewer for ${learnerName} in "${courseName}"`, assignmentId);
      } else {
        // Clear reviewer and revoke access
        if (assignment.reviewerId) {
          await remove(ref(database, `reviewerAccess/${assignment.learnerId}/${assignment.reviewerId}`));
        }
        await update(ref(database, `assignments/${assignmentId}`), { reviewerId: null });
        logAudit('remove_reviewer', `Removed reviewer from assignment for "${assignment.courseId}"`, assignmentId);
      }
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const getReviewerForAssignment = useCallback(async (assignmentId) => {
    try {
      const assignSnap = await get(ref(database, `assignments/${assignmentId}`));
      if (!assignSnap.exists()) return null;
      const assignment = assignSnap.val();
      if (!assignment.reviewerId) return null;

      const reviewerSnap = await get(ref(database, `users/${assignment.reviewerId}`));
      if (!reviewerSnap.exists()) return null;
      const profile = reviewerSnap.val();
      return { uid: assignment.reviewerId, name: profile.name, email: profile.email };
    } catch (error) {
      handlePermissionDenied(error);
      return null;
    }
  }, [handlePermissionDenied]);

  const subscribeToNotifications = useCallback((userId, callback) => {
    const notifRef = ref(database, `notifications/${userId}`);
    const unsubscribe = onValue(notifRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const data = snapshot.val();
      const notifications = Object.entries(data).map(([id, n]) => ({ id, ...n }));
      notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      callback(notifications);
    });
    return unsubscribe;
  }, []);

  const markNotificationRead = useCallback(async (userId, notificationId) => {
    try {
      await update(ref(database, `notifications/${userId}/${notificationId}`), { read: true });
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const markAllNotificationsRead = useCallback(async (userId) => {
    try {
      const snapshot = await get(ref(database, `notifications/${userId}`));
      if (!snapshot.exists()) return;
      const data = snapshot.val();
      const updates = {};
      for (const [id, n] of Object.entries(data)) {
        if (!n.read) {
          updates[`${id}/read`] = true;
        }
      }
      if (Object.keys(updates).length > 0) {
        await update(ref(database, `notifications/${userId}`), updates);
      }
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  // ── Chat ──

  async function sendChatMessage(assignmentId, text) {
    if (!user) throw new Error('User must be authenticated to send messages');
    if (!assignmentId) throw new Error('assignmentId is required');

    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (!trimmed) throw new Error('Message text cannot be empty');
    if (trimmed.length > 2000) throw new Error('Message text cannot exceed 2000 characters');

    if (!user.uid || typeof user.uid !== 'string') {
      throw new Error('senderId must be a non-empty string matching the authenticated user');
    }
    if (!user.name || typeof user.name !== 'string' || !user.name.trim()) {
      throw new Error('senderName must be a non-empty string');
    }

    const createdAt = new Date().toISOString();
    // Validate ISO 8601 format
    if (isNaN(Date.parse(createdAt))) {
      throw new Error('createdAt must be a valid ISO 8601 timestamp');
    }

    const message = {
      senderId: user.uid,
      senderName: user.name,
      text: trimmed,
      createdAt,
    };

    try {
      const chatRef = ref(database, `chats/${assignmentId}`);
      const newMsgRef = push(chatRef);
      await set(newMsgRef, message);

      // Notify the other party about the new message
      try {
        const assignSnap = await get(ref(database, `assignments/${assignmentId}`));
        if (assignSnap.exists()) {
          const assignment = assignSnap.val();
          const recipientId = user.uid === assignment.learnerId
            ? assignment.reviewerId
            : assignment.learnerId;
          if (recipientId) {
            await sendNotification(recipientId, {
              type: 'new_chat_message',
              message: `${user.name}: "${trimmed.length > 60 ? trimmed.substring(0, 60) + '...' : trimmed}"`,
              metadata: { assignmentId, senderId: user.uid },
            });
          }
        }
      } catch {
        // notification is best-effort
      }

      return { id: newMsgRef.key, ...message };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }

  function subscribeToChatMessages(assignmentId, callback) {
    const chatRef = ref(database, `chats/${assignmentId}`);
    const unsubscribe = onValue(chatRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const data = snapshot.val();
      const messages = Object.entries(data)
        .map(([id, msg]) => ({ id, ...msg }))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      callback(messages);
    });
    return unsubscribe;
  }

  async function getReviewerConversations(reviewerUid) {
    try {
      const assignments = await getAssignments();
      const filtered = assignments.filter((a) => a.reviewerId === reviewerUid);

      const conversations = [];
      for (const assignment of filtered) {
        let learnerName = 'Unknown Learner';
        try {
          const learner = await getUserById(assignment.learnerId);
          learnerName = learner.name || 'Unknown Learner';
        } catch {
          // fallback
        }

        let courseName = 'Unknown Course';
        try {
          const course = await getCourseById(assignment.courseId);
          courseName = course?.title || 'Unknown Course';
        } catch {
          // fallback
        }

        conversations.push({
          assignmentId: assignment.id,
          learnerId: assignment.learnerId,
          learnerName,
          courseId: assignment.courseId,
          courseName,
        });
      }
      return conversations;
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }

  const value = {
    loading,
    // Users
    getUsers,
    getUserById,
    createUserRecord,
    updateUser,
    deleteUser,
    // Courses
    getCourses,
    getCourseById,
    createCourseRecord,
    updateCourse,
    deleteCourse,
    addChaptersToCourse,
    reorderChapters,
    // Assignments
    getAssignments,
    createAssignmentRecord,
    deleteAssignment,
    // Progress
    getProgress,
    getProgressAsReviewer,
    markChapterComplete,
    submitAssessment,
    submitExercise,
    saveExerciseAIReview,
    // Assessments
    getAssessments,
    saveAssessment,
    deleteAssessment,
    // Timeline
    setTimeline,
    updateTimeline,
    // Course Points
    calculateCoursePoints,
    getCoursePoints,
    getAtRiskLearners,
    // Reviewer Feedback
    getReviewerFeedback,
    submitWeeklyFeedback,
    submitFinalFeedback,
    getAIFeedbackScores,
    // Cohorts
    getCohorts,
    createCohort,
    updateCohort,
    deleteCohort,
    // Exercises
    getExercises,
    saveExercise,
    deleteExercise,
    getExerciseRules,
    saveExerciseRule,
    // Audit Log
    getAuditLogs,
    logAudit,
    // Reviewer
    assignReviewer,
    getReviewerForAssignment,
    // Notifications
    sendNotification,
    subscribeToNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    // Chat
    sendChatMessage,
    subscribeToChatMessages,
    getReviewerConversations,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

export default DataContext;

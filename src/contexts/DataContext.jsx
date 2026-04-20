import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ref, get, set, push, remove, update, child, onValue } from 'firebase/database';
import { database } from '../firebase.js';
import { encryptField, decryptField } from '../utils/encryption.js';
import { useAuth } from './AuthContext.jsx';
import { createNotification as createNotificationRecord } from '../models/index.js';
import {
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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const handlePermissionDenied = useCallback((error) => {
    if (error?.message?.includes('PERMISSION_DENIED') || error?.code === 'PERMISSION_DENIED') {
      logout();
    }
  }, [logout]);

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
      const newRef = push(ref(database, 'users'));
      const key = newRef.key;
      const profile = {
        name: data.name,
        email: data.email,
        role: data.role,
        pendingAuth: true,
      };
      if (data.password) {
        profile.encryptedPassword = encryptField(data.password);
      }
      await set(newRef, profile);
      return { id: key, uid: key, ...profile };
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
      return { id, uid: id, ...snapshot.val() };
    } catch (error) {
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteUser = useCallback(async (id) => {
    try {
      await remove(ref(database, `users/${id}`));
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

  const createAssignmentRecord = useCallback(async (learnerId, courseId) => {
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
        targetCompletionDate: null,
        assignedAt: new Date().toISOString(),
      };
      await set(newRef, assignment);
      return { id: newRef.key, ...assignment };
    } catch (error) {
      if (error?.error) throw error; // re-throw our own errors
      handlePermissionDenied(error);
      throw error;
    }
  }, [handlePermissionDenied]);

  const deleteAssignment = useCallback(async (id) => {
    try {
      await remove(ref(database, `assignments/${id}`));
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

      // Check for circular reviewer assignment: block if the proposed reviewer
      // is already a learner in the same course and the current learner is their reviewer
      if (reviewerUid) {
        const allAssignmentsSnap = await get(ref(database, 'assignments'));
        if (allAssignmentsSnap.exists()) {
          const allAssignments = Object.values(allAssignmentsSnap.val());
          const isCircular = allAssignments.some(
            (a) =>
              a.learnerId === reviewerUid &&
              a.courseId === assignment.courseId &&
              a.reviewerId === assignment.learnerId
          );
          if (isCircular) {
            throw new Error(
              'Circular reviewer assignment: this reviewer is already being reviewed by the learner in the same course.'
            );
          }
        }
      }

      if (reviewerUid) {
        await update(ref(database, `assignments/${assignmentId}`), { reviewerId: reviewerUid });

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
      } else {
        // Clear reviewer
        await update(ref(database, `assignments/${assignmentId}`), { reviewerId: null });
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
    markChapterComplete,
    submitAssessment,
    submitExercise,
    // Assessments
    getAssessments,
    saveAssessment,
    deleteAssessment,
    // Timeline
    setTimeline,
    updateTimeline,
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

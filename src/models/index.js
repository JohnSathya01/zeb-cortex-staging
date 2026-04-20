/**
 * UUID generator utility using crypto.randomUUID with fallback counter.
 */
let _counter = 0;
export function generateId() {
  try {
    return crypto.randomUUID();
  } catch {
    _counter += 1;
    return `id-${Date.now()}-${_counter}`;
  }
}

/**
 * @typedef {"leadership" | "learner"} UserRole
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} password
 * @property {UserRole} role
 */

/**
 * Creates a new User object.
 * @param {Object} data
 * @param {string} data.name
 * @param {string} data.email
 * @param {string} data.password
 * @param {UserRole} data.role
 * @returns {User}
 */
export function createUser({ name, email, password, role }) {
  return {
    id: generateId(),
    name,
    email,
    password,
    role,
  };
}

/**
 * @typedef {Object} Option
 * @property {string} id
 * @property {string} text
 * @property {boolean} isCorrect
 */

/**
 * @typedef {Object} Assessment
 * @property {string} id
 * @property {string} chapterId
 * @property {string} question
 * @property {Option[]} options
 */

/**
 * Creates a new Assessment object.
 * @param {Object} data
 * @param {string} data.chapterId
 * @param {string} data.question
 * @param {Array<{text: string, isCorrect: boolean}>} data.options
 * @returns {Assessment}
 */
export function createAssessment({ chapterId, question, options }) {
  return {
    id: generateId(),
    chapterId,
    question,
    options: options.map((opt) => ({
      id: generateId(),
      text: opt.text,
      isCorrect: opt.isCorrect,
    })),
  };
}

/**
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} chapterId
 * @property {string} title
 * @property {string} instructions
 * @property {"text"} submissionType
 */

/**
 * Creates a new Exercise object.
 * @param {Object} data
 * @param {string} data.chapterId
 * @param {string} data.title
 * @param {string} data.instructions
 * @param {string} [data.submissionType="text"]
 * @returns {Exercise}
 */
export function createExercise({ chapterId, title, instructions, submissionType = 'text' }) {
  return {
    id: generateId(),
    chapterId,
    title,
    instructions,
    submissionType,
  };
}

/**
 * @typedef {Object} Chapter
 * @property {string} id
 * @property {string} courseId
 * @property {number} sequenceOrder
 * @property {string} title
 * @property {string} contentBody
 * @property {Assessment[]} assessments
 * @property {Exercise[]} exercises
 */

/**
 * Creates a new Chapter object.
 * @param {Object} data
 * @param {string} data.courseId
 * @param {number} data.sequenceOrder
 * @param {string} data.title
 * @param {string} data.contentBody
 * @param {Assessment[]} [data.assessments=[]]
 * @param {Exercise[]} [data.exercises=[]]
 * @returns {Chapter}
 */
export function createChapter({ courseId, sequenceOrder, title, contentBody, assessments = [], exercises = [] }) {
  return {
    id: generateId(),
    courseId,
    sequenceOrder,
    title,
    contentBody,
    assessments,
    exercises,
  };
}

/**
 * @typedef {Object} Course
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {Chapter[]} chapters
 * @property {string} createdAt
 */

/**
 * Creates a new Course object.
 * @param {Object} data
 * @param {string} data.title
 * @param {string} data.description
 * @param {Chapter[]} [data.chapters=[]]
 * @returns {Course}
 */
export function createCourse({ title, description, chapters = [] }) {
  return {
    id: generateId(),
    title,
    description,
    chapters,
    createdAt: new Date().toISOString(),
  };
}

/**
 * @typedef {"not_started" | "in_progress" | "completed"} AssignmentStatus
 */

/**
 * @typedef {Object} Assignment
 * @property {string} id
 * @property {string} learnerId
 * @property {string} courseId
 * @property {AssignmentStatus} status
 * @property {string|null} targetCompletionDate
 * @property {string} assignedAt
 */

/**
 * Creates a new Assignment object.
 * @param {Object} data
 * @param {string} data.learnerId
 * @param {string} data.courseId
 * @param {AssignmentStatus} [data.status="not_started"]
 * @param {string|null} [data.targetCompletionDate=null]
 * @returns {Assignment}
 */
export function createAssignment({ learnerId, courseId, status = 'not_started', targetCompletionDate = null }) {
  return {
    id: generateId(),
    learnerId,
    courseId,
    status,
    targetCompletionDate,
    assignedAt: new Date().toISOString(),
  };
}

/**
 * @typedef {Object} AssessmentResult
 * @property {Object<string, string>} answers - assessmentId → selected option id
 * @property {number} score
 * @property {number} total
 * @property {string} submittedAt
 */

/**
 * @typedef {Object} ExerciseSubmission
 * @property {string} text
 * @property {string} submittedAt
 */

/**
 * @typedef {Object} ProgressRecord
 * @property {string} learnerId
 * @property {string} courseId
 * @property {string[]} completedChapterIds
 * @property {Object<string, AssessmentResult>} assessmentResults - chapterId → result
 * @property {Object<string, ExerciseSubmission>} exerciseSubmissions - exerciseId → submission
 */

/**
 * Creates a new ProgressRecord object.
 * @param {Object} data
 * @param {string} data.learnerId
 * @param {string} data.courseId
 * @param {string[]} [data.completedChapterIds=[]]
 * @param {Object<string, AssessmentResult>} [data.assessmentResults={}]
 * @param {Object<string, ExerciseSubmission>} [data.exerciseSubmissions={}]
 * @returns {ProgressRecord}
 */
export function createProgressRecord({ learnerId, courseId, completedChapterIds = [], assessmentResults = {}, exerciseSubmissions = {} }) {
  return {
    learnerId,
    courseId,
    completedChapterIds,
    assessmentResults,
    exerciseSubmissions,
  };
}

/**
 * @typedef {Object} Notification
 * @property {string} id
 * @property {string} type
 * @property {string} message
 * @property {boolean} read
 * @property {string} createdAt
 * @property {Object} metadata
 */

/**
 * Creates a new Notification object.
 * @param {Object} data
 * @param {string} data.type
 * @param {string} data.message
 * @param {Object} [data.metadata={}]
 * @returns {Notification}
 */
export function createNotification({ type, message, metadata = {} }) {
  return {
    type,
    message,
    read: false,
    createdAt: new Date().toISOString(),
    metadata,
  };
}

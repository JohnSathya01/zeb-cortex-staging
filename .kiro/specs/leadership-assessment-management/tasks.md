# Implementation Plan: Leadership Assessment Management

## Overview

Migrate assessment questions from hardcoded `courseData.js` to Firebase RTDB, then build two leadership capabilities: an answer viewer for reviewing learner submissions and an editor for managing questions at runtime. Implementation proceeds bottom-up — data layer and utilities first, then UI components, then wiring and refactoring existing flows.

## Tasks

- [x] 1. Add assessment CRUD functions to DataContext
  - [x] 1.1 Implement `getAssessments(courseId, chapterId)` in `src/contexts/DataContext.jsx`
    - Read from RTDB path `assessments/{courseId}/{chapterId}`
    - Convert RTDB snapshot to an array of Assessment_Question objects with `id`, `question`, `options`, `createdAt`, `updatedAt`
    - Return `[]` when no data exists at the path
    - Expose via the DataContext provider value
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Implement `saveAssessment(courseId, chapterId, assessmentData)` in `src/contexts/DataContext.jsx`
    - If `assessmentData.id` is absent, generate a new ID via `push()` and write to `assessments/{courseId}/{chapterId}/{newId}`
    - If `assessmentData.id` exists, update the record at `assessments/{courseId}/{chapterId}/{id}`
    - Set `updatedAt` to current ISO timestamp on every save; set `createdAt` only on new records
    - Return the saved Assessment_Question object
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.3 Implement `deleteAssessment(courseId, chapterId, assessmentId)` in `src/contexts/DataContext.jsx`
    - Remove the record at `assessments/{courseId}/{chapterId}/{assessmentId}` from RTDB
    - Do not modify any learner progress data
    - _Requirements: 3.1, 3.2_

- [-] 2. Create assessment utility functions
  - [x] 2.1 Create `src/utils/assessmentUtils.js` with `validateAssessment(data)`
    - Return `{ valid: true, errors: [] }` when all rules pass
    - Reject empty/whitespace-only `question` field
    - Reject fewer than 2 options
    - Reject any option with empty/whitespace-only text
    - Reject if not exactly one option has `isCorrect: true`
    - Return `{ valid: false, errors: [...] }` with descriptive messages
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 2.2 Write property test for `validateAssessment`
    - **Property 3: Validation biconditional — valid iff all rules pass**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

  - [x] 2.3 Implement `buildAnswerReview(assessmentQuestions, assessmentResult)` in `src/utils/assessmentUtils.js`
    - Return one Answer_Review entry per input question
    - Set `isCorrect: true` iff learner's `selectedOptionId` equals the correct `optionId`
    - Set `selectedOptionId` to `null` and `isCorrect` to `false` when no answer exists for a question
    - Show "(deleted option)" when a learner's answer references a non-existent option
    - Output array length must equal input questions array length
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 2.4 Write property test for `buildAnswerReview` — output length
    - **Property 1: Answer review output length equals input questions length**
    - **Validates: Requirements 5.1**

  - [ ]* 2.5 Write property test for `buildAnswerReview` — correctness biconditional
    - **Property 2: Answer review correctness is a biconditional on option match**
    - **Validates: Requirements 5.2, 5.3**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update Firebase RTDB security rules
  - [x] 4.1 Add assessment path rules to `database.rules.json`
    - Allow read on `assessments/` for all authenticated users
    - Allow write on `assessments/{courseId}/{chapterId}` only for users with `leadership` role
    - _Requirements: 11.1, 11.2, 11.3_

- [ ] 5. Create the migration script
  - [x] 5.1 Create `scripts/migrateAssessments.mjs`
    - Read all courses and chapters from `courseData.js`
    - For each chapter with assessments, convert options from array format to object format keyed by option ID
    - Write to RTDB at `assessments/{courseId}/{chapterId}/{questionId}` with `createdAt` and `updatedAt` timestamps
    - Follow the pattern established by existing `scripts/seed.mjs`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 5.2 Write property test for migration fidelity
    - **Property 5: Migration fidelity — hardcoded data preserved in RTDB**
    - **Validates: Requirements 9.2, 9.4**

- [ ] 6. Create QuestionForm component
  - [x] 6.1 Create `src/components/QuestionForm.jsx`
    - Accept `question` prop (null for new question mode) and `onSave`/`onCancel` callbacks
    - Render question text input field
    - Render dynamic option list with add/remove capability
    - Render radio button per option to mark exactly one correct answer
    - Run `validateAssessment()` on submit; display inline errors if invalid, call `onSave` if valid
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 7. Create AssessmentEditorPage
  - [x] 7.1 Create `src/pages/leadership/AssessmentEditorPage.jsx`
    - Route: `/leadership/courses/:courseId/chapters/:chapterId/assessments`
    - Load existing Assessment_Questions via `getAssessments()` on mount
    - Display question list with Edit and Delete actions per question
    - "Add Question" button opens QuestionForm in creation mode
    - "Edit" opens QuestionForm pre-populated with question data
    - "Delete" removes question after confirmation via `deleteAssessment()` and refreshes list
    - Show empty state with "Add Question" prompt when no questions exist
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.2 Write unit tests for AssessmentEditorPage
    - Test question list rendering, add/edit/delete flows, and empty state
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Register assessment editor route in App.jsx
  - [x] 8.1 Update `src/App.jsx` to add the assessment editor route
    - Add route `/leadership/courses/:courseId/chapters/:chapterId/assessments` pointing to `AssessmentEditorPage`
    - Wrap with `RequireAuth` and `RequireRole` for leadership access
    - _Requirements: 7.1, 11.2_

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create AssessmentAnswerViewer component
  - [x] 10.1 Create `src/components/AssessmentAnswerViewer.jsx`
    - Accept `learnerId`, `courseId`, `chapterId`, and `onClose` props
    - Fetch decrypted Assessment_Result via `getProgress()` and Assessment_Questions via `getAssessments()`
    - Use `buildAnswerReview()` to compute the answer review data
    - Render per-question review showing question text, learner's answer, correct answer, and visual correct/incorrect indicator
    - Display "No assessment questions found for this chapter" when questions array is empty
    - Provide a close button that calls `onClose`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 10.2 Write unit tests for AssessmentAnswerViewer
    - Test rendering with correct/incorrect answers, missing data, and empty questions
    - _Requirements: 6.1, 6.3, 6.4_

- [x] 11. Update ProgressMonitoringPage with "View Answers" button
  - [x] 11.1 Update `src/pages/leadership/ProgressMonitoringPage.jsx`
    - Add a "View Answers" button on each learner's chapter row that has assessment results
    - On click, open AssessmentAnswerViewer modal with the learner's `learnerId`, `courseId`, and `chapterId`
    - _Requirements: 6.1, 6.2_

- [ ] 12. Refactor submitAssessment to score against RTDB
  - [x] 12.1 Update `submitAssessment` in `src/contexts/DataContext.jsx`
    - Fetch Assessment_Questions from RTDB via `getAssessments()` instead of using hardcoded `courseData.js`
    - Score answers by comparing each selected option against the correct option from RTDB questions
    - Return error if no Assessment_Questions exist in RTDB for the chapter
    - Encrypt answers and score, persist Assessment_Result to learner's progress path (existing pattern)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 12.2 Write property test for scoring correctness
    - **Property 7: Scoring correctness — score equals count of correct matches**
    - **Validates: Requirement 10.2**

- [ ] 13. Update learner ChapterViewPage to load assessments from RTDB
  - [x] 13.1 Update `src/pages/learner/ChapterViewPage.jsx`
    - Replace hardcoded assessment loading from `courseData.js` with `getAssessments(courseId, chapterId)` from DataContext
    - Ensure the assessment-taking UI continues to work with the RTDB data format (object-keyed options)
    - _Requirements: 1.1, 10.1_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The migration script (task 5) should be run once before testing the RTDB-dependent features

# Requirements Document

## Introduction

This document defines the requirements for the Leadership Assessment Management feature of the Zeb DeepCortex learning platform. The feature enables leadership users to (1) view detailed per-question assessment answers for any learner, and (2) manage (add, edit, delete) assessment questions for any course chapter at runtime. Assessment question definitions are migrated from hardcoded `courseData.js` to Firebase Realtime Database, allowing leadership to modify them without code changes.

## Glossary

- **System**: The Zeb DeepCortex learning platform web application
- **Leadership_User**: An authenticated user with the `leadership` role in Firebase RTDB
- **Learner**: An authenticated user with the `learner` role who takes assessments
- **Assessment_Question**: A multiple-choice question stored at `assessments/{courseId}/{chapterId}/{questionId}` in RTDB, containing question text, options, and a correct answer marker
- **Assessment_Result**: A learner's encrypted submission stored at `progress/{learnerId}/{courseId}/assessmentResults/{chapterId}`, containing selected answers, score, and total
- **Answer_Review**: A computed client-side object that cross-references an Assessment_Question with a learner's selected answer to determine correctness
- **DataContext**: The React context provider that mediates all reads and writes to Firebase RTDB
- **Assessment_Answer_Viewer**: The UI component that displays a learner's per-question assessment answers with correct/incorrect indicators
- **Assessment_Editor**: The UI page that allows leadership to list, add, edit, and delete Assessment_Questions for a course chapter
- **Question_Form**: A reusable form component for creating or editing a single Assessment_Question
- **Validator**: The client-side validation logic that checks Assessment_Question structure before saving
- **Migration_Script**: A one-time Node.js script that seeds RTDB with existing hardcoded assessment data from `courseData.js`
- **RTDB**: Firebase Realtime Database

## Requirements

### Requirement 1: Retrieve Assessment Questions from RTDB

**User Story:** As a user of the platform, I want assessment questions to be loaded from Firebase RTDB, so that leadership can manage them at runtime without code changes.

#### Acceptance Criteria

1. WHEN DataContext receives a `getAssessments(courseId, chapterId)` call, THE DataContext SHALL read from the RTDB path `assessments/{courseId}/{chapterId}` and return an array of Assessment_Question objects
2. WHEN no Assessment_Questions exist at the requested RTDB path, THE DataContext SHALL return an empty array
3. THE DataContext SHALL return each Assessment_Question with its `id`, `question`, `options`, `createdAt`, and `updatedAt` fields intact

### Requirement 2: Save Assessment Questions to RTDB

**User Story:** As a Leadership_User, I want to create and update assessment questions, so that I can keep course assessments current and relevant.

#### Acceptance Criteria

1. WHEN a Leadership_User submits a new Assessment_Question via `saveAssessment(courseId, chapterId, assessmentData)` without an `id` field, THE DataContext SHALL generate a new ID and write the question to `assessments/{courseId}/{chapterId}/{newId}`
2. WHEN a Leadership_User submits an Assessment_Question with an existing `id`, THE DataContext SHALL update the record at `assessments/{courseId}/{chapterId}/{id}`
3. WHEN an Assessment_Question is saved, THE DataContext SHALL set the `updatedAt` field to the current timestamp
4. WHEN an Assessment_Question is newly created, THE DataContext SHALL set both `createdAt` and `updatedAt` to the current timestamp

### Requirement 3: Delete Assessment Questions from RTDB

**User Story:** As a Leadership_User, I want to delete assessment questions, so that I can remove outdated or incorrect questions.

#### Acceptance Criteria

1. WHEN a Leadership_User calls `deleteAssessment(courseId, chapterId, assessmentId)`, THE DataContext SHALL remove the record at `assessments/{courseId}/{chapterId}/{assessmentId}` from RTDB
2. WHEN an Assessment_Question is deleted, THE DataContext SHALL leave all existing learner Assessment_Results unchanged

### Requirement 4: Validate Assessment Question Structure

**User Story:** As a Leadership_User, I want the system to validate my assessment questions before saving, so that I cannot create malformed questions.

#### Acceptance Criteria

1. WHEN an Assessment_Question has an empty or whitespace-only `question` field, THE Validator SHALL reject it with an error message indicating the question text is required
2. WHEN an Assessment_Question has fewer than 2 options, THE Validator SHALL reject it with an error message indicating at least 2 options are required
3. WHEN an Assessment_Question has an option with empty or whitespace-only text, THE Validator SHALL reject it with an error message identifying the invalid option
4. WHEN an Assessment_Question does not have exactly one option marked `isCorrect: true`, THE Validator SHALL reject it with an error message indicating exactly one correct answer is required
5. WHEN an Assessment_Question passes all validation checks, THE Validator SHALL return a valid result with no errors

### Requirement 5: Build Answer Review from Questions and Results

**User Story:** As a Leadership_User, I want to see each learner's answers matched against the correct answers, so that I can understand their performance per question.

#### Acceptance Criteria

1. WHEN `buildAnswerReview(assessmentQuestions, assessmentResult)` is called, THE System SHALL return one Answer_Review entry per Assessment_Question in the input array
2. WHEN a learner's selected option matches the correct option for a question, THE System SHALL set `isCorrect` to `true` on that Answer_Review entry
3. WHEN a learner's selected option does not match the correct option, THE System SHALL set `isCorrect` to `false` on that Answer_Review entry
4. WHEN a learner has no recorded answer for a question, THE System SHALL set `selectedOptionId` to `null` and `isCorrect` to `false`
5. WHEN a learner's answer references an option that no longer exists, THE System SHALL display "(deleted option)" as the selected option text

### Requirement 6: Display Learner Assessment Answers

**User Story:** As a Leadership_User, I want to view a learner's assessment answers for a specific chapter, so that I can review their understanding of the material.

#### Acceptance Criteria

1. WHEN a Leadership_User clicks "View Answers" for a learner's chapter on the Progress Monitoring page, THE Assessment_Answer_Viewer SHALL open displaying the learner's per-question answers
2. WHEN the Assessment_Answer_Viewer loads, THE Assessment_Answer_Viewer SHALL fetch the learner's decrypted Assessment_Result via `getProgress()` and the Assessment_Questions via `getAssessments()`
3. WHEN displaying each question, THE Assessment_Answer_Viewer SHALL show the question text, the learner's selected answer, the correct answer, and a visual correct/incorrect indicator
4. WHEN no Assessment_Questions exist for the chapter, THE Assessment_Answer_Viewer SHALL display a "No assessment questions found for this chapter" message
5. WHEN the Assessment_Answer_Viewer is open, THE Assessment_Answer_Viewer SHALL provide a close action that returns the user to the Progress Monitoring page

### Requirement 7: Manage Assessment Questions via Editor

**User Story:** As a Leadership_User, I want a dedicated page to manage assessment questions for each chapter, so that I can add, edit, and delete questions through a form interface.

#### Acceptance Criteria

1. WHEN a Leadership_User navigates to the Assessment_Editor for a course chapter, THE Assessment_Editor SHALL load and display all existing Assessment_Questions for that chapter
2. WHEN a Leadership_User clicks "Add Question", THE Assessment_Editor SHALL display the Question_Form in creation mode
3. WHEN a Leadership_User clicks "Edit" on an existing question, THE Assessment_Editor SHALL display the Question_Form pre-populated with that question's data
4. WHEN a Leadership_User clicks "Delete" on an existing question, THE Assessment_Editor SHALL remove the question after confirmation and refresh the list
5. WHEN no Assessment_Questions exist for the chapter, THE Assessment_Editor SHALL display an empty state with an "Add Question" prompt

### Requirement 8: Question Form Input and Validation

**User Story:** As a Leadership_User, I want a form to create and edit assessment questions with multiple-choice options, so that I can define questions with a clear correct answer.

#### Acceptance Criteria

1. THE Question_Form SHALL provide an input field for the question text
2. THE Question_Form SHALL provide a dynamic list of option inputs where options can be added and removed
3. THE Question_Form SHALL provide a radio button per option to mark exactly one option as correct
4. WHEN a Leadership_User submits the Question_Form with invalid data, THE Question_Form SHALL display inline validation errors and prevent saving
5. WHEN a Leadership_User submits the Question_Form with valid data, THE Question_Form SHALL call the `onSave` callback with the question data

### Requirement 9: Migrate Hardcoded Assessments to RTDB

**User Story:** As a developer, I want a migration script to seed Firebase RTDB with existing hardcoded assessment data, so that the transition from `courseData.js` to RTDB is seamless.

#### Acceptance Criteria

1. WHEN the Migration_Script runs, THE Migration_Script SHALL read all assessment data from `courseData.js` and write it to RTDB at `assessments/{courseId}/{chapterId}/{questionId}`
2. WHEN writing to RTDB, THE Migration_Script SHALL convert the options array format from `courseData.js` into the options object format keyed by option ID
3. WHEN the Migration_Script completes, THE Migration_Script SHALL have written assessment data for every chapter that has assessments in `courseData.js`
4. FOR ALL chapters with hardcoded assessments, THE Migration_Script SHALL preserve the question text, option texts, and correct-answer markings in the RTDB records

### Requirement 10: Score Assessments Against RTDB Questions

**User Story:** As a Learner, I want my assessment submissions to be scored against the current questions in RTDB, so that my results reflect the latest question definitions.

#### Acceptance Criteria

1. WHEN a Learner submits an assessment, THE DataContext SHALL fetch the Assessment_Questions from RTDB for the relevant chapter
2. WHEN scoring, THE DataContext SHALL compare each selected answer against the correct option from the RTDB Assessment_Questions
3. WHEN scoring is complete, THE DataContext SHALL encrypt the answers and score, then persist the Assessment_Result to the learner's progress path in RTDB
4. IF no Assessment_Questions exist in RTDB for the submitted chapter, THEN THE DataContext SHALL return an error

### Requirement 11: Enforce RTDB Security Rules for Assessments

**User Story:** As a system administrator, I want Firebase security rules to protect assessment data, so that only authorized users can modify questions.

#### Acceptance Criteria

1. WHILE a user is authenticated, THE RTDB SHALL allow read access to the `assessments/` path
2. WHILE a user has the `leadership` role, THE RTDB SHALL allow write access to `assessments/{courseId}/{chapterId}` paths
3. WHILE a user does not have the `leadership` role, THE RTDB SHALL deny write access to the `assessments/` path
4. IF a non-leadership user attempts to write to the `assessments/` path, THEN THE DataContext SHALL handle the permission denied error and trigger logout

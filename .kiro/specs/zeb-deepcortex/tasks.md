# Implementation Plan: Zeb DeepCortex

## Overview

Incremental build of a React (Vite + JSX) learning platform with in-memory mock store, markdown-based course content, role-based auth, leadership management views, and learner progression views. Each task builds on the previous, wiring components together progressively.

## Tasks

- [x] 1. Project setup and dependencies
  - Install runtime dependencies: `react-router-dom`, `react-markdown`, `remark-gfm`, `react-syntax-highlighter`
  - Install dev dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `fast-check`
  - Configure Vitest in `vite.config.js` (test environment: jsdom)
  - Create `src/setupTests.js` importing `@testing-library/jest-dom`
  - _Requirements: 13.7, 13.8_

- [x] 2. Data models, mock store, and markdown parser
  - [x] 2.1 Create data model type definitions and constants
    - Create `src/models/index.js` exporting JSDoc-typed factory functions or shape constants for User, Course, Chapter, Assessment, Exercise, Assignment, ProgressRecord
    - Include UUID generator utility (`crypto.randomUUID()` or simple counter)
    - _Requirements: 2.2, 3.2, 5.2_

  - [x] 2.2 Implement markdown parser
    - Create `src/utils/markdownParser.js` with `parseMarkdownFile(markdownString)` that extracts title, contentBody, assessments (question, options with isCorrect), and exercises (title, instructions, submissionType)
    - Create `validateMarkdownStructure(parsed)` that checks: at least one heading, each assessment has ≥2 options, each assessment has a correct answer
    - Use the convention-based block format from the design (## Assessment, ## Exercise sections)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.8, 4.9_

  - [ ]* 2.3 Write property tests for markdown parser
    - **Property 9: Markdown parser extracts title and content body**
    - **Property 10: Markdown parser extracts assessments and exercises**
    - **Property 12: Invalid upload rejection**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.8, 4.9**

  - [x] 2.4 Implement course template generator
    - Create `src/utils/courseTemplate.js` with `generateCourseTemplate()` returning a markdown string with sample title, content body, assessment block, exercise block, and inline annotations
    - _Requirements: 14.2, 14.3, 14.4, 14.5, 14.6_

  - [ ]* 2.5 Write property test for course template
    - **Property 11: Markdown parser round trip for template**
    - **Validates: Requirements 3.2, 14.2, 14.3, 14.4, 14.5**

  - [x] 2.6 Implement mock store API
    - Create `src/store/mockStore.js` exposing all promise-based functions: user CRUD, course CRUD, chapter management, assignments, progress tracking, assessment submission, exercise submission, timeline, authenticate
    - All functions return Promises; data stored in module-level variables
    - Implement duplicate assignment prevention, empty exercise rejection, chapter completion logic, course completion detection
    - _Requirements: 13.6, 13.7, 13.8, 2.2, 2.3, 2.4, 3.3, 3.4, 3.5, 3.6, 5.2, 5.3, 5.4_

  - [ ]* 2.7 Write property tests for mock store
    - **Property 6: User CRUD round trip**
    - **Property 7: User deletion removes from store**
    - **Property 17: Assignment creation with initial status**
    - **Property 18: Duplicate assignment prevention**
    - **Property 19: Assignment deletion removes record**
    - **Property 24: Assessment evaluation correctness**
    - **Property 25: Exercise submission round trip**
    - **Property 26: Empty exercise submission rejected**
    - **Property 27: Timeline persistence round trip**
    - **Property 31: Mock store functions return promises**
    - **Property 32: Mock store in-memory persistence**
    - **Validates: Requirements 2.2, 2.3, 2.4, 5.2, 5.3, 5.4, 8.3, 8.4, 9.3, 9.4, 9.5, 10.2, 10.5, 13.6, 13.7**

  - [x] 2.8 Implement seed data module
    - Create `src/store/seedData.js` that imports the 3 markdown files from `Courses/Chapters/` via Vite `?raw` import
    - Parse each file with `parseMarkdownFile`, programmatically inject 3 assessment questions per chapter and 1 exercise for chapters 1 and 3
    - Create seed course "Neural Machine Translation" with 3 chapters in sequence order
    - Create 3 Leadership users and 10 Learner accounts
    - Create assignments with varied statuses (not started, in progress, completed) with partial progress records
    - Export an `initializeMockStore()` function that populates the mock store
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 3. Checkpoint — Data layer verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Auth module and routing
  - [x] 4.1 Implement AuthContext
    - Create `src/contexts/AuthContext.jsx` with React context + useReducer
    - Provide `user`, `isAuthenticated`, `login(email, password)`, `logout()`
    - `login` calls `mockStore.authenticate()`, stores user on success
    - `logout` clears user state
    - _Requirements: 1.1_

  - [ ]* 4.2 Write property tests for auth
    - **Property 1: Valid credentials authenticate and store session**
    - **Property 3: Invalid credentials produce error**
    - **Validates: Requirements 1.1, 1.4**

  - [x] 4.3 Implement route guards
    - Create `src/components/RequireAuth.jsx` — redirects to `/login` if not authenticated
    - Create `src/components/RequireRole.jsx` — redirects to role-appropriate dashboard if role mismatch
    - _Requirements: 1.5, 1.6, 1.7_

  - [ ]* 4.4 Write property tests for routing guards
    - **Property 4: Unauthenticated access redirects to login**
    - **Property 5: Role mismatch redirects to own dashboard**
    - **Validates: Requirements 1.5, 1.6, 1.7**

  - [x] 4.5 Implement DataContext
    - Create `src/contexts/DataContext.jsx` with React context wrapping mock store API
    - On mount, call `initializeMockStore()` to seed data
    - Expose store functions to consuming components
    - _Requirements: 13.6_

  - [x] 4.6 Set up router and app shell
    - Create `src/App.jsx` with `BrowserRouter`, route definitions for all paths per design routing structure
    - Wrap with `AuthProvider` and `DataProvider`
    - Include catch-all 404 route
    - _Requirements: 1.2, 1.3, 12.3_

  - [ ]* 4.7 Write property test for role-based routing
    - **Property 2: Role-based routing after login**
    - **Validates: Requirements 1.2, 1.3**

- [x] 5. Layout components and login page
  - [x] 5.1 Implement LoginPage
    - Create `src/pages/LoginPage.jsx` with email/password form, calls `login()` from AuthContext, displays inline error on failure, redirects on success
    - _Requirements: 1.1, 1.4_

  - [x] 5.2 Implement LeadershipLayout
    - Create `src/layouts/LeadershipLayout.jsx` with sidebar (Dashboard, User Management, Course Management, Course Assignment, Progress Monitoring), header with user name/role, logout button, `<Outlet />`
    - _Requirements: 12.1, 12.4, 12.5_

  - [x] 5.3 Implement LearnerLayout
    - Create `src/layouts/LearnerLayout.jsx` with sidebar (Dashboard/My Courses, Profile), header with user name/role, logout button, `<Outlet />`
    - _Requirements: 12.2, 12.4, 12.5_

- [x] 6. Shared components
  - [x] 6.1 Implement MarkdownRenderer
    - Create `src/components/MarkdownRenderer.jsx` wrapping `react-markdown` with `remark-gfm`, custom renderers for headings, code blocks (react-syntax-highlighter), tables, inline formatting, lists
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 6.2 Write property test for markdown rendering
    - **Property 30: Markdown rendering produces correct HTML elements**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5**

  - [x] 6.3 Implement AssessmentCard
    - Create `src/components/AssessmentCard.jsx` — renders question, radio options, selection indicator, correct/incorrect feedback after submission
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.4 Implement ExerciseCard
    - Create `src/components/ExerciseCard.jsx` — renders title, instructions, text area, submit button (enabled when non-empty), confirmation + submitted text + timestamp after submission
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 6.5 Implement TimelinePicker and OverdueIndicator
    - Create `src/components/TimelinePicker.jsx` — date input for setting/updating target completion date
    - Create `src/components/OverdueIndicator.jsx` — visual badge when current date exceeds planned completion and course not completed
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [ ]* 6.6 Write property test for overdue detection
    - **Property 28: Overdue detection**
    - **Validates: Requirements 10.4, 11.4**

- [x] 7. Checkpoint — Shared components and auth verification
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Leadership views
  - [x] 8.1 Implement UserManagementPage
    - Create `src/pages/leadership/UserManagementPage.jsx` — table of learners (name, email, role, assigned course count), create/edit forms with validation (required fields: name, email, role), delete with confirmation dialog
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 8.2 Write property test for user form validation
    - **Property 8: User form validation rejects missing required fields**
    - **Validates: Requirements 2.5**

  - [x] 8.3 Implement CourseManagementPage
    - Create `src/pages/leadership/CourseManagementPage.jsx` — list courses (title, chapter count, actions), upload `.md` files (validate extension + structure), prompt for title/description on new course, append chapters to existing course, reorder chapters, delete course with confirmation, edit title/description, download template button
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 14.1, 14.7_

  - [ ]* 8.4 Write property tests for course chapter management
    - **Property 13: Course chapter sequencing from file names**
    - **Property 14: Appending chapters preserves and extends sequence**
    - **Property 15: Chapter reordering updates sequence**
    - **Property 16: Course deletion removes course and chapters**
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6**

  - [x] 8.5 Implement CourseAssignmentPage
    - Create `src/pages/leadership/CourseAssignmentPage.jsx` — side-by-side lists of courses and learners, assign/unassign, show assignment status, duplicate assignment message
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 8.6 Implement ProgressMonitoringPage
    - Create `src/pages/leadership/ProgressMonitoringPage.jsx` — summary table (learner, courses, progress %, timeline status), drill-down into chapter-wise completion/scores/submissions, filters by course/learner/status
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 8.7 Write property test for progress filtering
    - **Property 29: Progress filtering**
    - **Validates: Requirements 11.5**

- [x] 9. Learner views
  - [x] 9.1 Implement LearnerDashboardPage
    - Create `src/pages/learner/LearnerDashboardPage.jsx` — cards for assigned courses (title, description, progress %, timeline status, overdue indicator), click navigates to course detail, no catalog/search
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 9.2 Write property test for learner dashboard
    - **Property 20: Learner dashboard shows only assigned courses**
    - **Validates: Requirements 6.1**

  - [x] 9.3 Implement CourseDetailPage
    - Create `src/pages/learner/CourseDetailPage.jsx` — ordered chapter list, completed chapters accessible, first incomplete accessible, subsequent locked (visually disabled), timeline prompt if no date set
    - _Requirements: 7.1, 7.2, 7.3, 10.1_

  - [ ]* 9.4 Write property tests for sequential progression
    - **Property 21: Sequential chapter access control**
    - **Property 22: Chapter completion unlocks next**
    - **Property 23: Course completion when all chapters done**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**

  - [x] 9.5 Implement ChapterViewPage
    - Create `src/pages/learner/ChapterViewPage.jsx` — renders MarkdownRenderer for content body, AssessmentCard components for each assessment, ExerciseCard components for each exercise, handles assessment submission (all questions required), exercise submission, chapter completion logic (all assessments + exercises submitted)
    - _Requirements: 4.5, 4.6, 4.7, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 10. Checkpoint — All views wired
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Integration wiring and final polish
  - [x] 11.1 Wire all routes in App.jsx
    - Connect all page components to their routes, wrap leadership routes with `RequireAuth` + `RequireRole role="leadership"`, wrap learner routes with `RequireAuth` + `RequireRole role="learner"`, verify navigation between all views
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7, 12.3_

  - [x] 11.2 Wire LeadershipLayout dashboard landing
    - Create `src/pages/leadership/LeadershipDashboardPage.jsx` — summary view with quick links to User Management, Course Management, Course Assignment, Progress Monitoring
    - _Requirements: 12.1_

  - [x] 11.3 Wire LearnerLayout profile placeholder
    - Create `src/pages/learner/ProfilePage.jsx` — displays current user info (name, email, role)
    - _Requirements: 12.2_

  - [ ]* 11.4 Write integration tests for key flows
    - Test login → leadership dashboard → user management flow
    - Test login → learner dashboard → course detail → chapter view flow
    - Test assessment submission and exercise submission within chapter view
    - _Requirements: 1.1, 1.2, 1.3, 6.4, 7.4, 8.3, 9.3_

- [x] 12. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 32 correctness properties from the design document
- All data is in-memory; no backend or database setup required
- Seed data comes from actual markdown files in `Courses/Chapters/` via Vite `?raw` import

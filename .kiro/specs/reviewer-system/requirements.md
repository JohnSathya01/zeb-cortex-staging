# Requirements Document

## Introduction

This feature adds a Reviewer System to the DeepCortex learning platform. A reviewer is not a new role — any existing user (learner or leadership) can be assigned as a reviewer for a specific learner-course pair. Leadership users assign reviewers through the Course Assignment page. Learners see a floating contact card for their assigned reviewer while viewing chapters. The feature also introduces an in-app notification system that alerts users about reviewer assignments, chapter completions, assessment submissions, and exercise submissions. All data is stored in Firebase Realtime Database under existing security patterns.

## Glossary

- **Platform**: The Zeb DeepCortex React single-page application built with Vite
- **Leadership_User**: A user with the "leadership" role who can manage assignments, reviewers, and view all data
- **Learner_User**: A user with the "learner" role who views courses, completes chapters, and interacts with their assigned reviewer contact card
- **Reviewer**: An existing user (Learner_User or Leadership_User) assigned by a Leadership_User to support a specific Learner_User for a specific course assignment
- **Reviewer_Assignment**: The association between a Reviewer and a learner-course assignment, stored as a `reviewerId` field on the assignment record in the Realtime_Database
- **Reviewer_Contact_Card**: A floating popup on the Chapter View page that displays the assigned Reviewer's name, email, and a welcome message
- **Notification**: A record stored in the Realtime_Database at `notifications/{userId}/{notificationId}` containing type, message, read status, creation timestamp, and metadata
- **Notification_Bell**: A bell icon in the application header that displays the count of unread Notifications and opens a dropdown list of Notifications when clicked
- **Data_Context**: The React context provider (`DataContext.jsx`) that exposes data operations via the `useData()` hook
- **Realtime_Database**: The Firebase Realtime Database instance used for persistent JSON data storage
- **Course_Assignment_Page**: The existing leadership page (`CourseAssignmentPage.jsx`) where Leadership_Users assign courses to learners
- **Chapter_View_Page**: The existing learner page (`ChapterViewPage.jsx`) where Learner_Users read chapter content, complete assessments, and submit exercises
- **Security_Rules**: Firebase Realtime Database security rules defined in `database.rules.json`

## Requirements

### Requirement 1: Reviewer Assignment by Leadership

**User Story:** As a leadership user, I want to assign a reviewer to each learner-course assignment, so that every learner has a designated point of contact for course-related questions.

#### Acceptance Criteria

1. WHEN a Leadership_User views the Course_Assignment_Page with a course selected, THE Platform SHALL display a "Reviewer" column in the learner assignment table for each assigned learner
2. WHEN a Leadership_User clicks the reviewer selector for an assigned learner, THE Platform SHALL display a dropdown listing all users (both Learner_Users and Leadership_Users) as potential reviewers
3. THE Platform SHALL exclude the assigned learner from the reviewer dropdown for that learner's own assignment
4. WHEN a Leadership_User selects a user from the reviewer dropdown, THE Data_Context SHALL write the selected user's UID as the `reviewerId` field on the corresponding assignment record in the Realtime_Database
5. WHEN a Leadership_User clears the reviewer selection, THE Data_Context SHALL remove the `reviewerId` field from the corresponding assignment record in the Realtime_Database
6. THE Platform SHALL display the currently assigned reviewer's name in the reviewer column for each assignment that has a `reviewerId`


### Requirement 2: Reviewer Contact Card on Chapter View

**User Story:** As a learner, I want to see my assigned reviewer's contact information while studying a chapter, so that I know who to reach out to when I have doubts.

#### Acceptance Criteria

1. WHEN a Learner_User opens the Chapter_View_Page for a course that has a Reviewer_Assignment, THE Platform SHALL display a floating Reviewer_Contact_Card button on the right side of the page
2. WHEN the Learner_User clicks the Reviewer_Contact_Card button, THE Platform SHALL expand the card to show the Reviewer's name, the Reviewer's email, and a welcome message reading "Hey [learner name], let me know if you have any doubts. I'm the reviewer assigned to you."
3. WHEN the Learner_User clicks the Reviewer_Contact_Card button again or clicks a close control, THE Platform SHALL collapse the card back to the floating button
4. WHILE the Chapter_View_Page loads, THE Data_Context SHALL fetch the `reviewerId` from the learner's assignment record and resolve the Reviewer's profile (name and email) from the Realtime_Database
5. IF the learner's assignment for the current course has no `reviewerId`, THEN THE Platform SHALL hide the Reviewer_Contact_Card button entirely
6. THE Reviewer_Contact_Card SHALL be positioned as a fixed floating element that does not obstruct the chapter content or navigation controls

### Requirement 3: Reviewer Assignment Management

**User Story:** As a leadership user, I want to view and change reviewer assignments across all learner-course pairs, so that I can manage reviewer workload and reassign reviewers when needed.

#### Acceptance Criteria

1. WHEN a Leadership_User changes the reviewer for an existing assignment, THE Data_Context SHALL update the `reviewerId` field on the assignment record in the Realtime_Database
2. WHEN a Leadership_User views the Course_Assignment_Page, THE Platform SHALL show the current reviewer name for each assigned learner-course pair that has a Reviewer_Assignment
3. THE Platform SHALL allow a Leadership_User to reassign a different reviewer to an assignment that already has a Reviewer_Assignment by selecting a new user from the reviewer dropdown
4. WHEN a Leadership_User unassigns a course from a learner, THE Platform SHALL remove the entire assignment record including the `reviewerId` from the Realtime_Database

### Requirement 4: Notification Creation on Reviewer Assignment

**User Story:** As a user, I want to be notified when a reviewer is assigned to a learner-course pair, so that both the learner and the reviewer are aware of the assignment.

#### Acceptance Criteria

1. WHEN a Leadership_User assigns a Reviewer to a learner-course pair, THE Data_Context SHALL create a Notification for the Learner_User with type "reviewer_assigned" and a message identifying the Reviewer's name and the course name
2. WHEN a Leadership_User assigns a Reviewer to a learner-course pair, THE Data_Context SHALL create a Notification for the Reviewer with type "reviewer_assigned" and a message identifying the Learner_User's name and the course name
3. THE Data_Context SHALL store each Notification in the Realtime_Database at `notifications/{userId}/{notificationId}` with fields: type, message, read (default false), createdAt (ISO timestamp), and metadata (containing relevant IDs)
4. WHEN a Leadership_User changes the reviewer for an existing assignment, THE Data_Context SHALL create Notifications for the newly assigned Reviewer and the Learner_User about the change

### Requirement 5: Notification Creation on Learner Activity

**User Story:** As a leadership user and reviewer, I want to be notified when a learner completes a chapter, submits an assessment, or submits an exercise, so that I can track learner progress in real time.

#### Acceptance Criteria

1. WHEN a Learner_User completes a chapter, THE Data_Context SHALL create a Notification for the assigned Reviewer (if one exists for that course assignment) with type "chapter_completed" and a message identifying the Learner_User's name, the course name, and the chapter title
2. WHEN a Learner_User submits an assessment, THE Data_Context SHALL create a Notification for the assigned Reviewer (if one exists for that course assignment) with type "assessment_submitted" and a message identifying the Learner_User's name, the course name, and the chapter title
3. WHEN a Learner_User submits an exercise, THE Data_Context SHALL create a Notification for the assigned Reviewer (if one exists for that course assignment) with type "exercise_submitted" and a message identifying the Learner_User's name, the course name, and the exercise title
4. THE Data_Context SHALL store each activity Notification in the Realtime_Database at `notifications/{userId}/{notificationId}` with fields: type, message, read (default false), createdAt (ISO timestamp), and metadata (containing learnerId, courseId, and chapterId or exerciseId)
5. IF no Reviewer is assigned to the learner's course assignment, THEN THE Data_Context SHALL skip Notification creation for that activity event

### Requirement 6: Notification Bell and Dropdown

**User Story:** As a user, I want to see a notification bell in the header with an unread count and a dropdown list of notifications, so that I can stay informed about relevant events.

#### Acceptance Criteria

1. THE Platform SHALL display a Notification_Bell icon in the top header bar of both the Leadership and Learner layouts, positioned to the left of the user info section
2. THE Notification_Bell SHALL display a badge with the count of unread Notifications for the currently authenticated user
3. IF the unread Notification count is zero, THEN THE Notification_Bell SHALL display the bell icon without a badge
4. WHEN the user clicks the Notification_Bell, THE Platform SHALL display a dropdown panel listing the user's Notifications sorted by createdAt in descending order (newest first)
5. THE Notification dropdown SHALL display each Notification's message and a relative timestamp (e.g., "2 minutes ago", "1 hour ago")
6. THE Notification dropdown SHALL visually distinguish unread Notifications from read Notifications using a different background color or visual indicator
7. WHEN the user clicks the Notification_Bell again or clicks outside the dropdown, THE Platform SHALL close the dropdown panel

### Requirement 7: Notification Read Status Management

**User Story:** As a user, I want to mark notifications as read, so that I can track which notifications I have already reviewed.

#### Acceptance Criteria

1. WHEN a user clicks on an individual Notification in the dropdown, THE Data_Context SHALL update that Notification's `read` field to `true` in the Realtime_Database
2. THE Platform SHALL provide a "Mark all as read" action in the Notification dropdown header
3. WHEN a user clicks "Mark all as read", THE Data_Context SHALL update the `read` field to `true` for all of the user's unread Notifications in the Realtime_Database
4. WHEN a Notification's `read` field is updated to `true`, THE Notification_Bell badge count SHALL decrease accordingly without requiring a page refresh

### Requirement 8: Firebase Security Rules for Reviewer and Notification Data

**User Story:** As a platform administrator, I want Firebase security rules that protect reviewer assignment data and notification data, so that users can only access data they are authorized to see.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow authenticated Leadership_Users to write the `reviewerId` field on any assignment record
2. THE Security_Rules SHALL allow authenticated users to read assignment records (preserving the existing read rule)
3. THE Security_Rules SHALL allow authenticated users to read and write only their own Notification records at `notifications/{userId}`
4. THE Security_Rules SHALL deny unauthenticated requests to the `notifications` path
5. THE Security_Rules SHALL allow authenticated Leadership_Users to write Notification records for any user (to support creating notifications for learners and reviewers)

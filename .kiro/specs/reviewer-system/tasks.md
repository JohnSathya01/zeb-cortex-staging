# Implementation Plan: Reviewer System

## Overview

This plan implements the Reviewer System in incremental steps: data model and utility foundations first, then DataContext functions, then UI components, then wiring everything together. Each step builds on the previous one so there is no orphaned code. The implementation language is JavaScript (JSX) matching the existing Vite + React codebase.

## Tasks

- [x] 1. Add Notification model and time utility
  - [x] 1.1 Add `createNotification` factory function to `src/models/index.js`
    - Add JSDoc typedef for Notification (id, type, message, read, createdAt, metadata)
    - Implement `createNotification({ type, message, metadata })` using `generateId()`, defaulting `read` to `false` and `createdAt` to `new Date().toISOString()`
    - _Requirements: 4.3, 5.4_

  - [ ]* 1.2 Write property test for Notification structure invariant
    - **Property 4: Notification structure invariant**
    - Use fast-check to generate arbitrary type strings, message strings, and metadata objects
    - Assert every created notification has all required fields with correct types and defaults
    - Create test file at `src/__tests__/unit/notificationModel.property.test.js`
    - **Validates: Requirements 4.3, 5.4**

  - [x] 1.3 Create `src/utils/timeUtils.js` with `getRelativeTime(isoString)` function
    - Return human-readable relative timestamps: "just now", "X minutes ago", "X hours ago", "X days ago"
    - Handle edge cases: future timestamps, invalid strings
    - _Requirements: 6.5_

  - [ ]* 1.4 Write property test for relative timestamp rendering
    - **Property 9: Notification rendering includes message and relative timestamp**
    - Use fast-check to generate ISO timestamps within a reasonable range
    - Assert `getRelativeTime` always returns a non-empty string
    - Create test file at `src/__tests__/unit/timeUtils.property.test.js`
    - **Validates: Requirements 6.5**

- [x] 2. Implement DataContext reviewer and notification functions
  - [x] 2.1 Add `createNotification(userId, { type, message, metadata })` to DataContext
    - Push a new notification record to `notifications/{userId}/{notificationId}` in Firebase RTDB
    - Use the `createNotification` model factory to build the record
    - _Requirements: 4.3, 5.4_

  - [x] 2.2 Add `assignReviewer(assignmentId, reviewerUid)` to DataContext
    - Write `reviewerId` to `assignments/{assignmentId}` when `reviewerUid` is provided
    - Remove `reviewerId` from the assignment when `reviewerUid` is null
    - Add defensive check: reject if `reviewerUid` equals the assignment's `learnerId`
    - After writing, create notifications for both the learner and the reviewer (type `reviewer_assigned`) with course name and counterpart name in the message
    - Skip notifications when clearing the reviewer (null)
    - _Requirements: 1.4, 1.5, 3.1, 4.1, 4.2, 4.4_

  - [ ]* 2.3 Write property test for reviewer assignment round-trip
    - **Property 1: Reviewer assignment round-trip**
    - Use fast-check to generate assignment IDs and user UIDs
    - Assert that writing a reviewerId and reading it back returns the same value; writing null returns null/undefined
    - Create test file at `src/__tests__/unit/assignReviewer.property.test.js`
    - **Validates: Requirements 1.4, 1.5, 3.1**

  - [ ]* 2.4 Write property test for dual notification on reviewer assignment
    - **Property 3: Reviewer assignment creates notifications for both parties**
    - Assert that `assignReviewer` creates exactly two `reviewer_assigned` notifications (one for learner, one for reviewer) with correct messages
    - Create test file at `src/__tests__/unit/assignReviewerNotifications.property.test.js`
    - **Validates: Requirements 4.1, 4.2, 4.4**

  - [x] 2.5 Add `getReviewerForAssignment(assignmentId)` to DataContext
    - Read the `reviewerId` from the assignment record
    - If `reviewerId` exists, resolve the reviewer's user profile (name, email) from `users/{reviewerId}`
    - Return `null` if no reviewer is assigned or if profile resolution fails
    - _Requirements: 2.4, 2.5_

  - [x] 2.6 Add `subscribeToNotifications(userId, callback)` to DataContext
    - Set up a Firebase `onValue` listener on `notifications/{userId}`
    - Parse snapshot into an array of notification objects, sorted by `createdAt` descending
    - Return an unsubscribe function
    - _Requirements: 6.2, 6.4_

  - [x] 2.7 Add `markNotificationRead(userId, notificationId)` and `markAllNotificationsRead(userId)` to DataContext
    - `markNotificationRead`: set `read: true` on `notifications/{userId}/{notificationId}`
    - `markAllNotificationsRead`: iterate all notifications for the user and set `read: true` on each unread one
    - _Requirements: 7.1, 7.3_

  - [ ]* 2.8 Write property test for mark single notification as read
    - **Property 10: Mark single notification as read**
    - Assert marking one notification read sets only that notification's `read` to `true`, leaving others unchanged
    - Create test file at `src/__tests__/unit/markNotificationRead.property.test.js`
    - **Validates: Requirements 7.1**

  - [ ]* 2.9 Write property test for mark all notifications as read
    - **Property 11: Mark all notifications as read**
    - Assert that after `markAllNotificationsRead`, every notification for the user has `read === true`
    - Create test file at `src/__tests__/unit/markAllNotificationsRead.property.test.js`
    - **Validates: Requirements 7.3**

  - [x] 2.10 Extend `markChapterComplete` to create reviewer notification
    - After existing chapter completion logic, look up the assignment's `reviewerId`
    - If a reviewer exists, call `createNotification` for the reviewer with type `chapter_completed`, including learner name, course name, and chapter title in the message
    - If no reviewer, skip notification creation
    - _Requirements: 5.1, 5.5_

  - [x] 2.11 Extend `submitAssessment` to create reviewer notification
    - After existing assessment submission logic, look up the assignment's `reviewerId`
    - If a reviewer exists, call `createNotification` for the reviewer with type `assessment_submitted`, including learner name, course name, and chapter title in the message
    - If no reviewer, skip notification creation
    - _Requirements: 5.2, 5.5_

  - [x] 2.12 Extend `submitExercise` to create reviewer notification
    - After existing exercise submission logic, look up the assignment's `reviewerId`
    - If a reviewer exists, call `createNotification` for the reviewer with type `exercise_submitted`, including learner name, course name, and exercise title in the message
    - If no reviewer, skip notification creation
    - _Requirements: 5.3, 5.5_

  - [ ]* 2.13 Write property test for activity notification creation
    - **Property 5: Activity events create reviewer notifications**
    - Assert that for each activity type, when a reviewer is assigned, a notification of the correct type is created for the reviewer with the learner's name and course name in the message
    - Create test file at `src/__tests__/unit/activityNotifications.property.test.js`
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [ ]* 2.14 Write property test for no notification without reviewer
    - **Property 6: No notification when no reviewer assigned**
    - Assert that when no `reviewerId` exists on the assignment, no notification is created for any activity event
    - Create test file at `src/__tests__/unit/noReviewerNoNotification.property.test.js`
    - **Validates: Requirements 5.5**

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Build notification UI components
  - [x] 4.1 Create `src/components/NotificationDropdown.jsx`
    - Accept props: `notifications`, `onMarkRead(notificationId)`, `onMarkAllRead()`, `onClose()`
    - Render notifications sorted by `createdAt` descending (newest first)
    - Display each notification's message and relative timestamp using `getRelativeTime`
    - Visually distinguish unread notifications (highlighted background) from read ones
    - Show "Mark all as read" button in the dropdown header
    - Show "No notifications yet." empty state when list is empty
    - _Requirements: 6.4, 6.5, 6.6, 7.2_

  - [ ]* 4.2 Write property test for notification sort order
    - **Property 8: Notifications sorted descending by createdAt**
    - Use fast-check to generate arrays of notification objects with random `createdAt` timestamps
    - Assert the rendered order is always descending by `createdAt`
    - Create test file at `src/__tests__/unit/notificationSort.property.test.js`
    - **Validates: Requirements 6.4**

  - [ ]* 4.3 Write property test for unread count accuracy
    - **Property 7: Unread count equals number of unread notifications**
    - Use fast-check to generate arrays of notifications with random `read` boolean values
    - Assert the computed unread count equals the number of notifications where `read === false`
    - Create test file at `src/__tests__/unit/unreadCount.property.test.js`
    - **Validates: Requirements 6.2, 6.3, 7.4**

  - [x] 4.4 Create `src/components/NotificationBell.jsx`
    - Use `useAuth()` to get current user and `useData().subscribeToNotifications` to listen for notifications
    - Display a bell icon with an unread count badge; hide badge when count is 0
    - Toggle `NotificationDropdown` on click
    - Close dropdown on outside click (useRef + useEffect click-outside pattern)
    - Wire `onMarkRead` to `markNotificationRead` and `onMarkAllRead` to `markAllNotificationsRead` from DataContext
    - _Requirements: 6.1, 6.2, 6.3, 6.7, 7.1, 7.2, 7.3, 7.4_

  - [x] 4.5 Create `src/components/ReviewerContactCard.jsx`
    - Accept props: `reviewer` ({ name, email }), `learnerName` (string)
    - Render as a fixed-position floating button on the right side of the page
    - On click, expand to show reviewer name, email, and message: "Hey [learnerName], let me know if you have any doubts. I'm the reviewer assigned to you."
    - Collapse on second click or close button
    - Hidden entirely when `reviewer` is null/undefined
    - Position must not obstruct chapter content or navigation
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 5. Integrate components into existing pages and layouts
  - [x] 5.1 Update `src/pages/leadership/CourseAssignmentPage.jsx` with reviewer column
    - Add a "Reviewer" column to the learner assignment table
    - Render a `<select>` dropdown for each assigned learner, populated with all users except the learner themselves
    - On selection change, call `assignReviewer(assignmentId, reviewerUid)` from DataContext
    - On clearing selection (empty value), call `assignReviewer(assignmentId, null)`
    - Display the current reviewer's name for assignments that have a `reviewerId`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.2, 3.3, 3.4_

  - [ ]* 5.2 Write property test for self-exclusion from reviewer dropdown
    - **Property 2: Self-exclusion from reviewer dropdown**
    - Use fast-check to generate a learner UID and a set of user objects
    - Assert the filtered reviewer list excludes the learner and has length equal to total users minus one
    - Create test file at `src/__tests__/unit/reviewerDropdownFilter.property.test.js`
    - **Validates: Requirements 1.3**

  - [x] 5.3 Update `src/pages/learner/ChapterViewPage.jsx` with ReviewerContactCard
    - After loading the assignment, call `getReviewerForAssignment` to fetch reviewer profile
    - Render `<ReviewerContactCard>` when a reviewer is assigned, passing reviewer profile and learner name
    - Hide the card when no reviewer is assigned
    - _Requirements: 2.1, 2.4, 2.5_

  - [x] 5.4 Add NotificationBell to `src/layouts/LeadershipLayout.jsx`
    - Import and render `<NotificationBell />` in the `<header className="top-header">` section, before the `.user-info` div
    - _Requirements: 6.1_

  - [x] 5.5 Add NotificationBell to `src/layouts/LearnerLayout.jsx`
    - Import and render `<NotificationBell />` in the `<header className="top-header">` section, before the `.user-info` div
    - _Requirements: 6.1_

- [x] 6. Update Firebase security rules
  - [x] 6.1 Add notification security rules to `database.rules.json`
    - Add `notifications` path with `$userId` child rules
    - `.read`: allow only if `auth != null && auth.uid === $userId`
    - `.write`: allow if `auth != null && (auth.uid === $userId || root.child('users').child(auth.uid).child('role').val() === 'leadership')`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 6.2 Write property test for notification access control
    - **Property 12: Notification access restricted to own records**
    - Assert that for two distinct users A and B, user A can read/write `notifications/A` but cannot read/write `notifications/B` (unless A is leadership, in which case write to B is allowed)
    - Create test file at `src/__tests__/unit/notificationSecurityRules.property.test.js`
    - **Validates: Requirements 8.3**

- [x] 7. Add component styles
  - [x] 7.1 Add CSS styles for NotificationBell, NotificationDropdown, and ReviewerContactCard
    - Add styles to `src/styles/components.css` for: notification bell icon and badge, dropdown panel positioning and scrollable list, unread vs read notification styling, ReviewerContactCard floating button and expanded card
    - Ensure the floating card does not obstruct chapter content
    - _Requirements: 2.6, 6.1, 6.6_

- [x] 8. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check (already installed) with 100 iterations minimum
- Checkpoints ensure incremental validation
- All new DataContext functions are exposed via the `useData()` hook

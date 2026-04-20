# Requirements Document

## Introduction

This feature adds real-time chat between learners and their assigned reviewers on the DeepCortex learning platform. It replaces the existing static `ReviewerContactCard` with a live chat widget on the learner's Chapter View page. Reviewers and leadership users access a dedicated Chat List page from the sidebar to view and respond to all their active learner conversations. Messages are stored in Firebase Realtime Database at `chats/{assignmentId}/{messageId}` and delivered in real-time using `onValue` listeners. Each chat thread is scoped to a learner-course-reviewer assignment.

## Glossary

- **Platform**: The Zeb DeepCortex React single-page application built with Vite
- **Learner_User**: A user with the "learner" role who views courses, completes chapters, and chats with their assigned reviewer
- **Leadership_User**: A user with the "leadership" role who can manage assignments, reviewers, and view all data
- **Reviewer**: An existing user assigned to support a specific Learner_User for a specific course assignment
- **Chat_Widget**: A floating, collapsible chat component on the Chapter_View_Page that allows the Learner_User to send and receive messages with the assigned Reviewer
- **Chat_Panel**: A reusable message thread and input component used by both the Chat_Widget and the Chat_List_Page
- **Chat_List_Page**: A page accessible to Reviewers and Leadership_Users from the sidebar, displaying all active learner conversations and allowing message responses
- **Chat_Message**: A record stored in the Realtime_Database at `chats/{assignmentId}/{messageId}` containing senderId, senderName, text, and createdAt fields
- **Data_Context**: The React context provider (`DataContext.jsx`) that exposes data operations via the `useData()` hook
- **Realtime_Database**: The Firebase Realtime Database instance used for persistent JSON data storage
- **Chapter_View_Page**: The existing learner page (`ChapterViewPage.jsx`) where Learner_Users read chapter content
- **Assignment_Record**: A record in the Realtime_Database at `assignments/{assignmentId}` linking a Learner_User, a course, and a Reviewer
- **Security_Rules**: Firebase Realtime Database security rules defined in `database.rules.json`

## Requirements

### Requirement 1: Learner Chat Widget

**User Story:** As a learner, I want to chat with my assigned reviewer directly from the chapter view, so that I can ask questions and get help without leaving the course content.

#### Acceptance Criteria

1. WHEN a Learner_User opens the Chapter_View_Page for a course that has an Assignment_Record with a `reviewerId`, THE Platform SHALL display a Chat_Widget toggle button on the page
2. WHEN the Learner_User clicks the Chat_Widget toggle button, THE Platform SHALL expand the Chat_Widget to display the Chat_Panel with the message thread and an input field
3. WHEN the Learner_User clicks the Chat_Widget toggle button again or a close control, THE Platform SHALL collapse the Chat_Widget back to the toggle button
4. IF the Learner_User's Assignment_Record for the current course has no `reviewerId`, THEN THE Platform SHALL hide the Chat_Widget entirely
5. THE Chat_Widget SHALL display the Reviewer's name in the Chat_Panel header when expanded

### Requirement 2: Sending Chat Messages

**User Story:** As a learner or reviewer, I want to send messages in a chat thread, so that I can communicate with the other party about course-related topics.

#### Acceptance Criteria

1. WHEN an authenticated user submits a non-empty message through the Chat_Panel, THE Data_Context SHALL create a new Chat_Message at `chats/{assignmentId}/{messageId}` in the Realtime_Database
2. THE Data_Context SHALL populate each Chat_Message with the authenticated user's UID as `senderId`, the authenticated user's display name as `senderName`, the trimmed message text as `text`, and the current ISO 8601 timestamp as `createdAt`
3. WHEN a user submits a message, THE Chat_Panel SHALL clear the input field after the message is sent
4. IF a user submits a message containing only whitespace characters, THEN THE Data_Context SHALL reject the message and the Chat_Panel SHALL retain the current state
5. THE Data_Context SHALL enforce a maximum message length of 2000 characters after trimming

### Requirement 3: Real-Time Message Delivery

**User Story:** As a learner or reviewer, I want to see new messages appear in real time, so that the conversation feels immediate and responsive.

#### Acceptance Criteria

1. WHEN the Chat_Widget is expanded or a conversation is selected on the Chat_List_Page, THE Data_Context SHALL attach an `onValue` listener to `chats/{assignmentId}` in the Realtime_Database
2. WHEN a new Chat_Message is pushed to `chats/{assignmentId}`, THE Data_Context SHALL invoke the listener callback with the updated message list for all active subscribers on that path
3. THE Data_Context SHALL deliver messages to the callback sorted in ascending order by `createdAt`
4. WHEN the Chat_Widget is collapsed or the Chat_List_Page conversation is deselected, THE Data_Context SHALL detach the `onValue` listener to stop receiving updates
5. WHEN the listener is first attached, THE Data_Context SHALL invoke the callback immediately with the current messages or an empty array if no messages exist

### Requirement 4: Chat Panel Display

**User Story:** As a learner or reviewer, I want messages displayed clearly with sender alignment and timestamps, so that I can follow the conversation easily.

#### Acceptance Criteria

1. THE Chat_Panel SHALL render messages sent by the current user aligned to the right side of the message list
2. THE Chat_Panel SHALL render messages sent by the other party aligned to the left side of the message list
3. THE Chat_Panel SHALL display a timestamp for each Chat_Message
4. THE Chat_Panel SHALL display the sender's name for each Chat_Message
5. WHEN a new message is added to the thread, THE Chat_Panel SHALL auto-scroll to the most recent message
6. WHEN the message thread contains no messages, THE Chat_Panel SHALL display an empty state indicator

### Requirement 5: Reviewer Conversation List

**User Story:** As a reviewer, I want to see all my active learner conversations in one place, so that I can manage and respond to multiple learners efficiently.

#### Acceptance Criteria

1. WHEN a Reviewer or Leadership_User navigates to the Chat_List_Page, THE Data_Context SHALL fetch all Assignment_Records where `reviewerId` matches the current user's UID
2. THE Chat_List_Page SHALL display a list of conversations showing the Learner_User's name and the course name for each Assignment_Record
3. WHEN the Reviewer selects a conversation from the list, THE Chat_List_Page SHALL display the Chat_Panel for that conversation's assignment
4. THE Chat_List_Page SHALL display a last message preview for each conversation in the list
5. WHEN no Assignment_Records exist for the current user, THE Chat_List_Page SHALL display an empty state message

### Requirement 6: Conversation Data Resolution

**User Story:** As a reviewer, I want to see learner names and course names in my conversation list, so that I can identify each conversation at a glance.

#### Acceptance Criteria

1. THE Data_Context SHALL resolve each Learner_User's display name from the Realtime_Database `users` node for every Assignment_Record returned by the conversation query
2. THE Data_Context SHALL resolve each course title from the course data for every Assignment_Record returned by the conversation query
3. IF a Learner_User's profile cannot be resolved, THEN THE Data_Context SHALL use "Unknown Learner" as the fallback display name
4. IF a course title cannot be resolved, THEN THE Data_Context SHALL use "Unknown Course" as the fallback display name
5. THE Data_Context SHALL return exactly one conversation entry per Assignment_Record with no duplicates

### Requirement 7: Chat Message Validation

**User Story:** As a platform administrator, I want chat messages to be validated before storage, so that data integrity is maintained in the database.

#### Acceptance Criteria

1. THE Data_Context SHALL validate that `senderId` is a non-empty string matching the authenticated user's UID before writing a Chat_Message
2. THE Data_Context SHALL validate that `senderName` is a non-empty string before writing a Chat_Message
3. THE Data_Context SHALL validate that `text` is a non-empty string after trimming and does not exceed 2000 characters before writing a Chat_Message
4. THE Data_Context SHALL validate that `createdAt` is a valid ISO 8601 timestamp string before writing a Chat_Message
5. IF any validation check fails, THEN THE Data_Context SHALL reject the message and return a descriptive error

### Requirement 8: Chat Security Rules

**User Story:** As a platform administrator, I want Firebase security rules that restrict chat access to authorized participants, so that conversations remain private between the learner and reviewer.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow authenticated users to read `chats/{assignmentId}` only if the user's UID matches the `learnerId` or `reviewerId` on the corresponding Assignment_Record, or the user has the "leadership" role
2. THE Security_Rules SHALL allow authenticated users to write to `chats/{assignmentId}` only if the user's UID matches the `learnerId` or `reviewerId` on the corresponding Assignment_Record
3. THE Security_Rules SHALL deny unauthenticated requests to the `chats` path
4. THE Security_Rules SHALL allow Leadership_Users to read any `chats/{assignmentId}` path for oversight purposes
5. THE Security_Rules SHALL prevent Leadership_Users from writing to `chats/{assignmentId}` unless the Leadership_User is the assigned Reviewer on that Assignment_Record

### Requirement 9: Chat Error Handling

**User Story:** As a learner or reviewer, I want clear feedback when something goes wrong with chat, so that I understand the issue and can take corrective action.

#### Acceptance Criteria

1. IF a message send operation fails due to a network error or permission denial, THEN THE Chat_Panel SHALL display an inline error message below the input field
2. IF a message send operation fails, THEN THE Chat_Panel SHALL retain the message text in the input field so the user can retry
3. IF the `onValue` listener receives a permission denied error, THEN THE Data_Context SHALL handle the error consistent with the existing permission denied pattern in the Platform
4. WHEN the Chapter_View_Page loads and the Learner_User has no Assignment_Record with a `reviewerId` for the current course, THE Platform SHALL render the Chapter_View_Page without the Chat_Widget and without displaying an error

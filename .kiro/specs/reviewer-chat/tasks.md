# Implementation Plan: Reviewer Chat

## Overview

Implement real-time chat between learners and reviewers by adding DataContext functions, creating ChatPanel and ChatWidget components, building a ChatListPage for reviewers, updating routing and sidebar, adding Firebase security rules, and removing the old ReviewerContactCard.

## Tasks

- [x] 1. Add chat data functions to DataContext
  - [x] 1.1 Implement `sendChatMessage(assignmentId, text)` in `src/contexts/DataContext.jsx`
    - Validate text is non-empty after trimming and ≤ 2000 characters
    - Validate senderId matches authenticated user's UID and senderName is non-empty
    - Build message object with `senderId`, `senderName`, `text`, `createdAt` (ISO 8601)
    - Push message to `chats/{assignmentId}` using Firebase `push` and `set`
    - Return descriptive error if any validation fails
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 1.2 Implement `subscribeToChatMessages(assignmentId, callback)` in `src/contexts/DataContext.jsx`
    - Attach `onValue` listener to `chats/{assignmentId}`
    - On snapshot, convert to array of message objects sorted ascending by `createdAt`
    - Invoke callback immediately with current messages or empty array
    - Return unsubscribe function that detaches the listener
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.3 Implement `getReviewerConversations(reviewerUid)` in `src/contexts/DataContext.jsx`
    - Fetch assignments where `reviewerId === reviewerUid`
    - Resolve learner display name from `users` node, fallback to "Unknown Learner"
    - Resolve course title from course data, fallback to "Unknown Course"
    - Return one entry per assignment with `assignmentId`, `learnerId`, `learnerName`, `courseId`, `courseName`
    - _Requirements: 5.1, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 1.4 Expose `sendChatMessage`, `subscribeToChatMessages`, and `getReviewerConversations` from the DataContext provider value
    - _Requirements: 2.1, 3.1, 5.1_

  - [ ]* 1.5 Write property test: message construction integrity
    - **Property 1: Message construction integrity**
    - For any valid text (1–2000 chars after trim) and authenticated user, `sendChatMessage` produces a message with correct `senderId`, `senderName`, trimmed `text`, and valid ISO 8601 `createdAt`
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 1.6 Write property test: message text validation
    - **Property 2: Message text validation**
    - For any string input, `sendChatMessage` accepts iff trimmed string is non-empty and ≤ 2000 chars; rejects whitespace-only and over-length strings
    - **Validates: Requirements 2.4, 2.5, 7.3**

  - [ ]* 1.7 Write property test: message ordering
    - **Property 3: Message ordering**
    - For any set of messages with distinct `createdAt` values, `subscribeToChatMessages` delivers them sorted ascending by `createdAt`
    - **Validates: Requirement 3.3**

  - [ ]* 1.8 Write property test: conversation query correctness
    - **Property 6: Conversation query correctness**
    - For any set of assignments and a given `reviewerUid`, `getReviewerConversations` returns exactly the subset where `reviewerId === reviewerUid` with no duplicates
    - **Validates: Requirements 5.1, 6.5**

  - [ ]* 1.9 Write property test: conversation data resolution
    - **Property 7: Conversation data resolution**
    - For any conversation entry, resolved `learnerName` and `courseName` are present, falling back to "Unknown Learner" / "Unknown Course" when resolution fails
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 1.10 Write property test: full message field validation
    - **Property 8: Full message field validation**
    - For any message where `senderId` doesn't match auth UID, or `senderName` is empty, or `createdAt` is invalid ISO 8601, `sendChatMessage` rejects with a descriptive error
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5**

- [x] 2. Checkpoint - Ensure DataContext functions work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create ChatPanel component
  - [x] 3.1 Create `src/components/ChatPanel.jsx`
    - Accept props: `messages`, `currentUserId`, `onSend`, `headerLabel`, optional `onClose`
    - Render message list with right-alignment for own messages, left-alignment for others
    - Display sender name and timestamp for each message
    - Text input with send button; disable send when input is empty/whitespace
    - Clear input after successful send; retain input and show inline error on failure
    - Auto-scroll to most recent message when new messages arrive
    - Show empty state when no messages exist
    - _Requirements: 2.3, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2_

  - [ ]* 3.2 Write property test: message alignment
    - **Property 4: Message alignment**
    - For any message, it is right-aligned if `senderId === currentUserId`, left-aligned otherwise
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 3.3 Write property test: message display completeness
    - **Property 5: Message display completeness**
    - For any rendered message, the output contains the message's timestamp and sender name
    - **Validates: Requirements 4.3, 4.4**

- [x] 4. Create ChatWidget component
  - [x] 4.1 Create `src/components/ChatWidget.jsx`
    - Accept props: `assignmentId`, `reviewer`, `learnerName`
    - Toggle between collapsed (button) and expanded (ChatPanel) states
    - Subscribe to messages via `subscribeToChatMessages` only when expanded; unsubscribe on collapse/unmount
    - Send messages via `sendChatMessage`
    - Display reviewer name in ChatPanel header
    - Return `null` if no `reviewer` or `assignmentId`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.4, 9.3, 9.4_

- [x] 5. Create ChatListPage for reviewers
  - [x] 5.1 Create `src/pages/leadership/ChatListPage.jsx`
    - Fetch conversations via `getReviewerConversations` on mount
    - Display conversation list with learner name, course name, and last message preview
    - On conversation selection, display ChatPanel with real-time subscription
    - Unsubscribe from previous conversation when selecting a new one
    - Show empty state when no conversations exist
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2_

- [x] 6. Add CSS styles for chat components
  - Add chat-related styles to `src/styles/components.css`
    - Styles for `.chat-widget-wrapper`, `.chat-widget-toggle`, `.chat-widget-expanded`
    - Styles for `.chat-panel`, `.chat-messages`, `.chat-message`, `.chat-message.own`, `.chat-input-area`
    - Styles for `.chat-list-page`, `.chat-conversations`, `.chat-thread`, `.empty-state`
    - _Requirements: 4.1, 4.2_

- [x] 7. Checkpoint - Ensure chat components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integrate chat into existing pages and routing
  - [x] 8.1 Update `src/pages/learner/ChapterViewPage.jsx`
    - Replace `ReviewerContactCard` import and usage with `ChatWidget`
    - Pass `assignmentId`, `reviewer`, and `learnerName` props to ChatWidget
    - _Requirements: 1.1, 1.4, 9.4_

  - [x] 8.2 Add `/leadership/chats` route in `src/App.jsx`
    - Import `ChatListPage`
    - Add route under the leadership layout routes
    - _Requirements: 5.1_

  - [x] 8.3 Add "Chats" nav item to `src/layouts/LeadershipLayout.jsx`
    - Add `{ to: '/leadership/chats', label: 'Chats', icon: '💬' }` to the `navItems` array
    - _Requirements: 5.1_

- [x] 9. Update Firebase security rules
  - [x] 9.1 Add chat security rules to `database.rules.json`
    - Allow read on `chats/$assignmentId` if user is the learner, reviewer, or has leadership role
    - Allow write on `chats/$assignmentId` only if user is the learner or reviewer on the assignment
    - Deny unauthenticated access to the `chats` path
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 10. Remove old ReviewerContactCard component
  - [x] 10.1 Delete `src/components/ReviewerContactCard.jsx`
    - Verify no remaining imports reference this component
    - _Requirements: 1.1_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The implementation language is JavaScript/JSX (React), matching the existing codebase

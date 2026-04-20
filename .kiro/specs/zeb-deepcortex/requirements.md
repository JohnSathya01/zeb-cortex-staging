# Requirements Document

## Introduction

Zeb DeepCortex is an enterprise-grade internal learning and capability development platform. It provides centrally governed, role-based, structured training aligned with business objectives. The platform operates on a dual-role architecture: a Leadership (admin) layer for managing users, courses, and monitoring progress, and a Learner layer for consuming assigned courses with enforced sequential progression, assessments, and practical exercises. Course content is authored as markdown files and uploaded by Leadership users; the platform parses these files to extract chapter content, assessments, and exercises. There is no backend database — all data is held in an in-memory mock store seeded from actual markdown course files. This requirements document covers a React front-end prototype (Vite + React JSX); backend integration will follow later.

## Glossary

- **Platform**: The Zeb DeepCortex web application running as a Vite + React single-page application
- **Leadership_User**: An administrative user with full control over user management, course management, and progress monitoring
- **Learner**: An end-user who consumes courses assigned to them by Leadership_User
- **Course**: A structured learning unit consisting of ordered Chapters, created and managed by Leadership_User
- **Chapter**: A sequential subdivision of a Course containing learning content, assessments, and optional exercises
- **Assessment**: A set of multiple-choice questions embedded within a Chapter to validate knowledge retention
- **Exercise**: A practical task within a Chapter requiring the Learner to submit work for evaluation
- **Learning_Path**: The set of Courses assigned to a specific Learner by Leadership_User
- **Timeline**: A Learner-defined schedule specifying intended completion dates for an assigned Course
- **Progress_Tracker**: The component that records and displays completion status at Course and Chapter levels
- **Auth_Module**: The component responsible for authentication and role-based routing
- **Router**: The client-side routing component that controls navigation and role-based access to views
- **Markdown_File**: A `.md` file containing structured course chapter content including headings, body text, assessments, and exercises in a defined format
- **Markdown_Parser**: The component responsible for reading and parsing Markdown_File content into structured Chapter data (content, assessments, exercises)
- **Course_Template**: A downloadable `.md` template file that demonstrates the expected format for authoring course content
- **Course_Outline**: An HTML or structured file listing all Chapters in a Course with their sequence order (e.g., `translation_doc_outline.html`)
- **Mock_Store**: The in-memory data layer providing mock data for the prototype, seeded from Markdown_Files in the Courses folder (to be replaced by a backend API later)

## Requirements

### Requirement 1: Role-Based Authentication

**User Story:** As a user, I want to log in and be routed to the correct dashboard based on my role, so that I see only the functionality relevant to my responsibilities.

#### Acceptance Criteria

1. WHEN a user provides valid credentials, THE Auth_Module SHALL authenticate the user and store the session in client-side state
2. WHEN a Leadership_User logs in successfully, THE Router SHALL navigate to the Leadership dashboard
3. WHEN a Learner logs in successfully, THE Router SHALL navigate to the Learner dashboard
4. IF a user provides invalid credentials, THEN THE Auth_Module SHALL display an inline error message indicating authentication failure
5. WHEN an unauthenticated user attempts to access a protected route, THE Router SHALL redirect the user to the login page
6. WHEN a Learner attempts to access a Leadership route, THE Router SHALL redirect the Learner to the Learner dashboard
7. WHEN a Leadership_User attempts to access a Learner route, THE Router SHALL redirect the Leadership_User to the Leadership dashboard

### Requirement 2: Leadership User Management

**User Story:** As a Leadership_User, I want to create, view, update, and delete Learner profiles, so that I can govern platform access and assign users to appropriate training.

#### Acceptance Criteria

1. THE Platform SHALL display a user management view accessible only to Leadership_User accounts
2. WHEN a Leadership_User submits a new user form with valid data (name, email, role), THE Mock_Store SHALL create a new user record and THE Platform SHALL display the new user in the user list
3. WHEN a Leadership_User edits an existing user profile, THE Mock_Store SHALL update the user record and THE Platform SHALL reflect the changes in the user list
4. WHEN a Leadership_User deletes a user, THE Platform SHALL prompt for confirmation before THE Mock_Store removes the user record
5. IF a Leadership_User submits a user form with missing required fields, THEN THE Platform SHALL display validation errors next to each invalid field
6. THE Platform SHALL display the user list in a paginated or scrollable table showing name, email, role, and assigned course count

### Requirement 3: Course Lifecycle Management via Markdown Upload

**User Story:** As a Leadership_User, I want to create courses by uploading markdown files, so that I can author structured learning content using a familiar text format without manual form entry.

#### Acceptance Criteria

1. THE Platform SHALL display a course management view accessible only to Leadership_User accounts
2. WHEN a Leadership_User uploads one or more Markdown_Files, THE Markdown_Parser SHALL parse each file into a Chapter with content body, assessments, and exercises
3. WHEN a Leadership_User uploads a set of Markdown_Files for a new Course, THE Platform SHALL prompt for a Course title and description, and THE Mock_Store SHALL persist the Course with the parsed Chapters in sequence order derived from the file names
4. WHEN a Leadership_User uploads additional Markdown_Files to an existing Course, THE Mock_Store SHALL append the parsed Chapters to the Course in sequence order
5. WHEN a Leadership_User reorders Chapters within a Course, THE Mock_Store SHALL update the sequence order for all affected Chapters
6. WHEN a Leadership_User deletes a Course, THE Platform SHALL prompt for confirmation before THE Mock_Store removes the Course and all associated Chapters
7. WHEN a Leadership_User edits a Course title or description, THE Mock_Store SHALL update the Course record and THE Platform SHALL reflect the changes
8. IF a Leadership_User uploads a file that is not a valid `.md` file, THEN THE Platform SHALL display a validation error indicating only markdown files are accepted
9. IF a Leadership_User uploads a Markdown_File that does not conform to the expected template structure, THEN THE Platform SHALL display a descriptive parsing error identifying the structural issue

### Requirement 4: Markdown-Based Chapter Content, Assessments, and Exercises

**User Story:** As a Leadership_User, I want to define chapter content, multiple-choice assessments, and practical exercises within markdown files, so that all course material is authored in a single portable format and rendered as interactive elements on the learner-facing site.

#### Acceptance Criteria

1. WHEN the Markdown_Parser processes a Markdown_File, THE Markdown_Parser SHALL extract the chapter title from the top-level heading
2. WHEN the Markdown_Parser processes a Markdown_File, THE Markdown_Parser SHALL extract the content body from all standard markdown elements (headings, paragraphs, code blocks, tables, lists, bold, italic)
3. WHEN the Markdown_Parser encounters an assessment block in a Markdown_File, THE Markdown_Parser SHALL extract each multiple-choice question with its question text, answer options, and correct answer indicator
4. WHEN the Markdown_Parser encounters an exercise block in a Markdown_File, THE Markdown_Parser SHALL extract the exercise title, instructions, and expected submission type
5. WHEN a Learner views a Chapter, THE Platform SHALL render the parsed markdown content body as formatted HTML with proper styling for headings, code blocks, tables, and inline formatting
6. WHEN a Chapter contains parsed assessments, THE Platform SHALL render each assessment as an interactive multiple-choice form after the content body
7. WHEN a Chapter contains parsed exercises, THE Platform SHALL render each exercise as an interactive submission form with title, instructions, and a text input area after the assessments section
8. IF a Markdown_File contains an assessment block with fewer than two answer options, THEN THE Markdown_Parser SHALL report a validation error requiring at least two options
9. IF a Markdown_File contains an assessment block without a correct answer indicator, THEN THE Markdown_Parser SHALL report a validation error requiring a correct answer selection

### Requirement 5: Course Assignment

**User Story:** As a Leadership_User, I want to assign courses to specific learners, so that each learner receives training aligned with their role and responsibilities.

#### Acceptance Criteria

1. WHEN a Leadership_User opens the course assignment view, THE Platform SHALL display a list of available Courses and a list of Learners
2. WHEN a Leadership_User assigns a Course to a Learner, THE Mock_Store SHALL create an assignment record linking the Learner to the Course with a status of "not started"
3. WHEN a Leadership_User removes a Course assignment from a Learner, THE Mock_Store SHALL delete the assignment record
4. IF a Leadership_User attempts to assign a Course already assigned to a Learner, THEN THE Platform SHALL display a message indicating the Course is already assigned
5. THE Platform SHALL display the current assignment status (not started, in progress, completed) next to each Learner-Course pair

### Requirement 6: Learner Dashboard and Assigned Courses

**User Story:** As a Learner, I want to see only the courses assigned to me upon login, so that I focus on training aligned with my responsibilities.

#### Acceptance Criteria

1. WHEN a Learner navigates to the dashboard, THE Platform SHALL display only the Courses assigned to that Learner by Leadership_User
2. THE Platform SHALL display each assigned Course with its title, description, progress percentage, and timeline status
3. THE Platform SHALL NOT display a course catalog, search functionality, or self-enrollment options to the Learner
4. WHEN a Learner selects an assigned Course, THE Router SHALL navigate to the Course detail view showing the list of Chapters

### Requirement 7: Sequential Chapter Progression

**User Story:** As a Learner, I want to progress through course chapters in order, so that I build knowledge in a logical sequence.

#### Acceptance Criteria

1. WHEN a Learner opens a Course, THE Platform SHALL display all Chapters in their defined sequence order
2. THE Platform SHALL enable access only to the first incomplete Chapter and all previously completed Chapters
3. WHILE a Learner has not completed the current Chapter, THE Platform SHALL disable navigation to subsequent Chapters
4. WHEN a Learner completes all assessments and exercises in a Chapter, THE Progress_Tracker SHALL mark the Chapter as completed and THE Platform SHALL unlock the next Chapter
5. WHEN a Learner completes all Chapters in a Course, THE Progress_Tracker SHALL mark the Course as completed

### Requirement 8: Assessment Taking

**User Story:** As a Learner, I want to answer multiple-choice questions within each chapter, so that I can validate my understanding of the material.

#### Acceptance Criteria

1. WHEN a Learner opens a Chapter, THE Platform SHALL display all assessment questions for that Chapter after the content body
2. WHEN a Learner selects an answer for a question, THE Platform SHALL visually indicate the selected option
3. WHEN a Learner submits assessment answers, THE Platform SHALL evaluate each answer against the correct answer and display results with correct/incorrect indicators
4. THE Platform SHALL display the Learner's score as a count of correct answers out of total questions
5. IF a Learner submits an assessment without answering all questions, THEN THE Platform SHALL display a message prompting the Learner to answer all questions before submission

### Requirement 9: Exercise Submission

**User Story:** As a Learner, I want to submit practical exercises within chapters, so that I can demonstrate applied understanding of the material.

#### Acceptance Criteria

1. WHEN a Chapter contains exercises, THE Platform SHALL display each exercise with its title and instructions after the assessments section
2. WHEN a Learner enters a text submission for an exercise, THE Platform SHALL enable a submit button
3. WHEN a Learner submits an exercise, THE Mock_Store SHALL persist the submission text and timestamp, and THE Platform SHALL display a confirmation message
4. WHILE an exercise has been submitted, THE Platform SHALL display the submitted text and submission timestamp
5. IF a Learner attempts to submit an exercise with an empty submission, THEN THE Platform SHALL display a validation error requiring content

### Requirement 10: Learner Timeline Planning

**User Story:** As a Learner, I want to set my intended completion timeline for each assigned course, so that I can plan my learning schedule and track my adherence.

#### Acceptance Criteria

1. WHEN a Learner opens an assigned Course that has no timeline set, THE Platform SHALL prompt the Learner to set a target completion date
2. WHEN a Learner sets a target completion date, THE Mock_Store SHALL persist the date with the assignment record
3. THE Platform SHALL display the planned completion date alongside actual progress on the Learner dashboard
4. WHILE the current date exceeds the planned completion date and the Course is not completed, THE Platform SHALL display a visual overdue indicator on the Course card
5. WHEN a Learner updates the target completion date, THE Mock_Store SHALL update the stored date

### Requirement 11: Leadership Progress Monitoring

**User Story:** As a Leadership_User, I want to monitor learner progress at course and chapter levels, so that I can identify learning gaps and ensure training effectiveness.

#### Acceptance Criteria

1. THE Platform SHALL display a progress monitoring dashboard accessible only to Leadership_User accounts
2. THE Platform SHALL display a summary table showing each Learner with their assigned Courses, overall progress percentage, and timeline adherence status
3. WHEN a Leadership_User selects a Learner-Course pair, THE Platform SHALL display chapter-wise completion status, assessment scores, and exercise submission status
4. WHILE a Learner's actual progress is behind the planned timeline, THE Progress_Tracker SHALL flag the Learner-Course pair as "behind schedule"
5. THE Platform SHALL allow Leadership_User to filter the progress view by Course, by Learner, or by status (on track, behind schedule, completed)

### Requirement 12: Navigation and Layout

**User Story:** As a user, I want a consistent navigation structure, so that I can efficiently move between platform sections.

#### Acceptance Criteria

1. THE Platform SHALL display a persistent sidebar navigation for Leadership_User with links to Dashboard, User Management, Course Management, Course Assignment, and Progress Monitoring
2. THE Platform SHALL display a persistent sidebar navigation for Learner with links to Dashboard (My Courses) and Profile
3. WHEN a user clicks a navigation link, THE Router SHALL navigate to the corresponding view without a full page reload
4. THE Platform SHALL display the current user's name and role in the navigation header
5. WHEN a user clicks the logout action, THE Auth_Module SHALL clear the session and THE Router SHALL navigate to the login page

### Requirement 13: Mock Data Layer Seeded from Markdown Files

**User Story:** As a developer, I want the mock data layer to load seed data from the actual markdown course files in the Courses folder, so that the prototype demonstrates real content without a backend or database.

#### Acceptance Criteria

1. THE Mock_Store SHALL provide seed data including at least 3 Leadership_User accounts and 10 Learner accounts
2. WHEN the Platform initializes, THE Markdown_Parser SHALL read the Markdown_Files from the `Courses/Chapters/` folder and parse them into structured Chapter data
3. WHEN the Platform initializes, THE Mock_Store SHALL construct a seed Course titled "Neural Machine Translation" using the parsed Chapters in sequence order derived from file names (chapter-01 through chapter-13)
4. THE Mock_Store SHALL provide seed data including assessments and exercises parsed from the Markdown_Files (at least 3 assessment questions per Chapter and at least 1 exercise per Course)
5. THE Mock_Store SHALL provide seed data including course assignments with varied progress states (not started, in progress, completed)
6. THE Mock_Store SHALL persist all data changes in-memory during a browser session using React state or context
7. THE Mock_Store SHALL expose a consistent API-like interface (functions returning promises) so that future backend integration requires minimal refactoring
8. THE Mock_Store SHALL NOT depend on any external database or backend service for data storage


### Requirement 14: Course Content Markdown Template

**User Story:** As a Leadership_User, I want to download a template markdown file that shows the expected format for course content, so that I can author new chapters with correctly structured content, assessments, and exercises.

#### Acceptance Criteria

1. THE Platform SHALL provide a downloadable Course_Template file in `.md` format from the course management view
2. THE Course_Template SHALL include a sample chapter title section using a top-level markdown heading
3. THE Course_Template SHALL include a sample content body section demonstrating supported markdown elements (headings, paragraphs, code blocks, tables, lists, bold, italic)
4. THE Course_Template SHALL include a sample assessment block demonstrating the structured format for defining multiple-choice questions with question text, answer options, and correct answer indicator
5. THE Course_Template SHALL include a sample exercise block demonstrating the structured format for defining exercise title, instructions, and expected submission type
6. THE Course_Template SHALL include inline comments or annotations explaining each section and the expected format rules
7. WHEN a Leadership_User clicks the download template action, THE Platform SHALL trigger a browser file download of the Course_Template file

### Requirement 15: Markdown Content Rendering

**User Story:** As a Learner, I want course content parsed from markdown files to be displayed in a well-formatted, readable layout, so that I can focus on learning without visual distractions.

#### Acceptance Criteria

1. WHEN the Platform renders parsed markdown content, THE Platform SHALL convert markdown headings into styled HTML headings with appropriate hierarchy
2. WHEN the Platform renders parsed markdown content, THE Platform SHALL display code blocks with syntax highlighting and a monospace font
3. WHEN the Platform renders parsed markdown content, THE Platform SHALL display tables with borders, header styling, and alternating row shading
4. WHEN the Platform renders parsed markdown content, THE Platform SHALL display inline formatting (bold, italic, inline code) with appropriate visual styling
5. WHEN the Platform renders parsed markdown content, THE Platform SHALL display ordered and unordered lists with proper indentation and markers

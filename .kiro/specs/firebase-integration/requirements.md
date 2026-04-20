# Requirements Document

## Introduction

This feature replaces the in-memory mock store in the Zeb DeepCortex React learning platform with Firebase services. The migration covers authentication (Firebase Auth with email/password), persistent data storage (Firebase Realtime Database), client-side encryption of sensitive data, and proper security rules. The existing `useAuth()` and `useData()` hook interfaces are preserved so that page components require minimal changes. All user emails migrate from the @deepcortex.com domain to @zeb.co. No separate backend server is introduced; all operations use the Firebase client SDK directly, with Firebase Cloud Functions only if strictly necessary.

## Glossary

- **Platform**: The Zeb DeepCortex React single-page application built with Vite
- **Firebase_Auth**: The Firebase Authentication service used for email/password sign-in
- **Realtime_Database**: The Firebase Realtime Database instance used for persistent JSON data storage
- **Encryption_Module**: A client-side module that encrypts and decrypts sensitive data using AES before writing to or reading from the Realtime_Database
- **Security_Rules**: Firebase Realtime Database security rules that enforce per-user data access control
- **Auth_Context**: The React context provider (`AuthContext.jsx`) that exposes authentication state and actions via the `useAuth()` hook
- **Data_Context**: The React context provider (`DataContext.jsx`) that exposes data operations via the `useData()` hook
- **Firebase_Config**: Environment-variable-driven configuration object containing the Firebase project credentials (apiKey, authDomain, databaseURL, projectId, etc.)
- **Leadership_User**: A user with the "leadership" role who can view and manage all learners and assignments
- **Learner_User**: A user with the "learner" role who can view and interact with their own assignments and progress
- **Seed_Script**: A utility script or Firebase-compatible mechanism that creates initial users in Firebase_Auth and populates initial data in the Realtime_Database
- **Mock_Store**: The existing in-memory data store (`mockStore.js` and `seedData.js`) to be fully removed

## Requirements

### Requirement 1: Firebase Project Configuration

**User Story:** As a developer, I want Firebase SDK configuration managed through environment variables, so that credentials are not hardcoded and different environments can use different Firebase projects.

#### Acceptance Criteria

1. THE Platform SHALL initialize the Firebase SDK v9+ using modular imports for tree-shaking
2. THE Firebase_Config SHALL load all Firebase credentials (apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId) from environment variables or a dedicated configuration file
3. THE Platform SHALL export a single initialized Firebase app instance, an Auth instance, and a Database instance for use across the application
4. IF a required Firebase configuration value is missing, THEN THE Platform SHALL throw a descriptive error during initialization identifying the missing value

### Requirement 2: Firebase Authentication

**User Story:** As a user, I want to sign in with my @zeb.co email and password using Firebase Authentication, so that my identity is securely verified by a production-grade auth service.

#### Acceptance Criteria

1. THE Auth_Context SHALL use Firebase_Auth `signInWithEmailAndPassword` for login instead of the mock `authenticate` function
2. THE Auth_Context SHALL use Firebase_Auth `signOut` for logout
3. THE Auth_Context SHALL subscribe to Firebase_Auth `onAuthStateChanged` to persist authentication state across page refreshes and browser tabs
4. WHEN a user signs in successfully, THE Auth_Context SHALL retrieve the user profile (name, role) from the Realtime_Database and include the profile in the auth state
5. IF Firebase_Auth returns an authentication error, THEN THE Auth_Context SHALL return a user-friendly error message to the calling component
6. THE Auth_Context SHALL expose the same `useAuth()` hook interface (`user`, `isAuthenticated`, `login`, `logout`) so that existing page components require no changes to their auth consumption
7. WHILE the Auth_Context is resolving the initial `onAuthStateChanged` callback, THE Platform SHALL display a loading state instead of redirecting to the login page

### Requirement 3: Email Domain Migration

**User Story:** As a platform administrator, I want all user accounts to use @zeb.co email addresses instead of @deepcortex.com, so that the platform reflects the correct organizational domain.

#### Acceptance Criteria

1. THE Seed_Script SHALL create all initial user accounts in Firebase_Auth with @zeb.co email addresses
2. THE Seed_Script SHALL store all user profile records in the Realtime_Database with @zeb.co email addresses
3. THE Platform SHALL contain no references to the @deepcortex.com domain in source code, seed data, or configuration

### Requirement 4: Firebase Realtime Database Data Storage

**User Story:** As a developer, I want all user-level data (assignments, progress, assessment results, exercise submissions, timelines) stored in Firebase Realtime Database, so that data persists across sessions and devices.

#### Acceptance Criteria

1. THE Data_Context SHALL read and write user profile data to the Realtime_Database at a structured path (e.g., `users/{uid}`)
2. THE Data_Context SHALL read and write assignment records to the Realtime_Database at a structured path (e.g., `assignments/{assignmentId}`)
3. THE Data_Context SHALL read and write progress records (completed chapters, assessment results, exercise submissions) to the Realtime_Database at a structured path (e.g., `progress/{learnerId}/{courseId}`)
4. THE Data_Context SHALL read and write timeline data (target completion dates) as part of assignment records in the Realtime_Database
5. THE Data_Context SHALL expose the same `useData()` hook interface so that existing page components require no changes to their data consumption
6. WHEN a data write operation fails, THE Data_Context SHALL return a descriptive error to the calling component
7. THE Platform SHALL continue to load course content (chapters, assessments, exercises) from bundled markdown files, not from the Realtime_Database

### Requirement 5: Client-Side Data Encryption

**User Story:** As a platform administrator, I want sensitive user data encrypted before it is written to the Realtime Database, so that data cannot be read in plaintext via browser dev tools, network inspection, or direct database access.

#### Acceptance Criteria

1. THE Encryption_Module SHALL encrypt sensitive data fields (assessment answers, exercise submission text, scores) using AES encryption before writing to the Realtime_Database
2. THE Encryption_Module SHALL decrypt encrypted data fields after reading from the Realtime_Database before returning data to consuming components
3. THE Encryption_Module SHALL derive the encryption key from a shared secret or application-level key, not from individual user tokens (to allow leadership users to decrypt learner data)
4. THE Encryption_Module SHALL use the Web Crypto API or a lightweight library (e.g., crypto-js) for AES encryption and decryption
5. IF decryption fails due to a corrupted or tampered value, THEN THE Encryption_Module SHALL return a descriptive error instead of returning malformed data
6. THE Encryption_Module SHALL store the encryption key in an environment variable, not hardcoded in source code

### Requirement 6: Firebase Security Rules

**User Story:** As a platform administrator, I want Firebase Realtime Database security rules that enforce data access boundaries, so that users can only access data they are authorized to see.

#### Acceptance Criteria

1. THE Security_Rules SHALL allow authenticated Learner_User accounts to read and write only their own data under their user-specific paths
2. THE Security_Rules SHALL allow authenticated Leadership_User accounts to read all user data and all assignment and progress records
3. THE Security_Rules SHALL allow authenticated Leadership_User accounts to write assignment records (create and delete assignments for any learner)
4. THE Security_Rules SHALL deny all read and write access to unauthenticated requests
5. THE Security_Rules SHALL be defined in a `database.rules.json` file in the project root, deployable via the Firebase CLI

### Requirement 7: Mock Store Removal

**User Story:** As a developer, I want the mock store completely removed from the codebase, so that there is a single source of truth for data and no dead code remains.

#### Acceptance Criteria

1. THE Platform SHALL remove the `src/store/mockStore.js` file entirely
2. THE Platform SHALL remove the `src/store/seedData.js` file entirely
3. THE Platform SHALL contain no import statements referencing `mockStore.js` or `seedData.js`
4. THE Platform SHALL contain no calls to `initializeMockStore`, `initializeStore`, or `resetStore`

### Requirement 8: Initial Data Seeding

**User Story:** As a developer, I want a seeding mechanism that populates Firebase Auth and Realtime Database with initial users and data, so that the platform has usable data for development and demonstration.

#### Acceptance Criteria

1. THE Seed_Script SHALL create 3 Leadership_User accounts in Firebase_Auth with @zeb.co emails and the "leadership" role stored in the Realtime_Database
2. THE Seed_Script SHALL create 10 Learner_User accounts in Firebase_Auth with @zeb.co emails and the "learner" role stored in the Realtime_Database
3. THE Seed_Script SHALL create assignment records in the Realtime_Database matching the existing seed data distribution (3 completed, 3 in-progress, 4 not-started)
4. THE Seed_Script SHALL create progress records in the Realtime_Database for learners with completed and in-progress assignments, including assessment results and exercise submissions
5. THE Seed_Script SHALL encrypt sensitive seed data fields using the Encryption_Module before writing to the Realtime_Database
6. THE Seed_Script SHALL be runnable as a standalone Node.js script using the Firebase Admin SDK (separate from the client application)

### Requirement 9: Auth-Gated Data Loading

**User Story:** As a user, I want the application to load my data only after I am authenticated, so that data operations do not fail due to missing auth context.

#### Acceptance Criteria

1. THE Data_Context SHALL initialize data listeners only after Firebase_Auth confirms the user is authenticated
2. WHEN the user logs out, THE Data_Context SHALL detach all active Realtime_Database listeners and clear cached data from application state
3. IF a Realtime_Database read operation is rejected due to insufficient permissions, THEN THE Data_Context SHALL log the user out and redirect to the login page

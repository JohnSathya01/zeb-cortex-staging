# Implementation Plan: Firebase Integration

## Overview

Migrate the Zeb DeepCortex platform from the in-memory mock store to Firebase services. The implementation proceeds bottom-up: dependencies and utilities first, then auth, then data layer, then cleanup. The `useAuth()` and `useData()` hook interfaces are preserved so page components need no changes.

## Tasks

- [x] 1. Install dependencies and create environment configuration
  - [x] 1.1 Install `firebase` and `crypto-js` npm packages
    - Run `npm install firebase crypto-js`
    - _Requirements: 1.1, 5.4_

  - [x] 1.2 Create `.env` file with Firebase and encryption environment variables
    - Add all `VITE_FIREBASE_*` variables for the `zeb-poc` project
    - Add `VITE_ENCRYPTION_KEY` with a generated AES key
    - Add `.env` to `.gitignore` if not already present
    - _Requirements: 1.2, 5.6_

- [ ] 2. Create Firebase configuration module and encryption utility
  - [x] 2.1 Create `src/firebase.js` — Firebase SDK initialization with env var validation
    - Import `initializeApp`, `getAuth`, `getDatabase` from Firebase SDK v9+ modular imports
    - Validate required config keys (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID`) and throw descriptive error if any are missing
    - Export `app`, `auth`, and `database` instances
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 2.2 Write property test for Firebase config validation (Property 1)
    - **Property 1: Missing Firebase config throws descriptive error**
    - Use `fc.subarray` of required key names to generate subsets of missing keys
    - Verify that initialization throws an error whose message contains the name of each missing key
    - **Validates: Requirements 1.4**

  - [x] 2.3 Create `src/utils/encryption.js` — AES encrypt/decrypt using crypto-js
    - Implement `encryptField(value)` that AES-encrypts strings/JSON values using `VITE_ENCRYPTION_KEY`
    - Implement `decryptField(ciphertext)` that decrypts and parses JSON if applicable
    - Handle null/undefined passthrough, throw descriptive error on decryption failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 2.4 Write property test for encryption round-trip (Property 3)
    - **Property 3: Encryption round-trip preserves data**
    - Use `fc.string({ minLength: 1 })` to generate random strings
    - Verify `decryptField(encryptField(input))` equals original input
    - Verify encrypted ciphertext differs from plaintext
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 2.5 Write property test for corrupted ciphertext (Property 4)
    - **Property 4: Corrupted ciphertext produces a descriptive error**
    - Use `fc.string()` to generate random non-ciphertext strings
    - Verify `decryptField` throws an error with a non-empty message
    - **Validates: Requirements 5.5**

- [x] 3. Checkpoint — Verify foundation modules
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Refactor AuthContext to use Firebase Auth
  - [x] 4.1 Rewrite `src/contexts/AuthContext.jsx` to use Firebase Auth
    - Replace `authenticate` import with Firebase Auth imports (`signInWithEmailAndPassword`, `signOut`, `onAuthStateChanged`)
    - Subscribe to `onAuthStateChanged` on mount; fetch user profile from RTDB `users/{uid}` on auth state change
    - Implement `login(email, password)` using `signInWithEmailAndPassword`, map Firebase error codes to user-friendly messages
    - Implement `logout()` using Firebase `signOut`
    - Add `loading` state (true until initial `onAuthStateChanged` resolves) to prevent login page flash
    - Preserve `useAuth()` return shape: `{ user, isAuthenticated, loading, login, logout }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 4.2 Write property test for auth error mapping (Property 2)
    - **Property 2: Auth error codes map to user-friendly messages**
    - Use `fc.constantFrom` with known Firebase auth error codes
    - Verify mapped messages are non-empty strings that do not contain the raw `auth/` prefix
    - **Validates: Requirements 2.5**

  - [x] 4.3 Update `src/App.jsx` to handle the new `loading` state from AuthContext
    - Show a loading indicator while `loading` is true instead of rendering routes
    - _Requirements: 2.7_

- [ ] 5. Refactor DataContext to use Firebase Realtime Database
  - [x] 5.1 Rewrite `src/contexts/DataContext.jsx` to use Firebase RTDB
    - Remove all imports from `mockStore.js` and `seedData.js`
    - Import `ref`, `get`, `set`, `push`, `remove`, `onValue` from `firebase/database`
    - Import `encryptField` and `decryptField` from `src/utils/encryption.js`
    - Initialize RTDB listeners only after `useAuth()` confirms authentication
    - On logout, detach all active RTDB listeners and clear cached state
    - If a read is rejected with `PERMISSION_DENIED`, log the user out and redirect to login
    - Implement all data functions (`getUsers`, `getUserById`, `createUserRecord`, `updateUser`, `deleteUser`, `getAssignments`, `createAssignmentRecord`, `deleteAssignment`, `getProgress`, `markChapterComplete`, `submitAssessment`, `submitExercise`, `setTimeline`, `updateTimeline`) using RTDB paths defined in the design (`users/{uid}`, `assignments/{id}`, `progress/{learnerId}/{courseId}`)
    - Encrypt sensitive fields (assessment answers, scores, exercise submission text) before writes; decrypt after reads
    - Preserve `useData()` return shape so page components require no changes
    - Course content continues to load from bundled markdown files (no RTDB involvement)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 9.1, 9.2, 9.3_

  - [ ]* 5.2 Write property test for user profile round-trip (Property 5)
    - **Property 5: User profile data round-trip**
    - Generate random user profile objects with `fc.record({ name: fc.string(), email: fc.string(), role: fc.constantFrom('leadership', 'learner') })`
    - Verify write to `users/{uid}` and read back produces equal object
    - **Validates: Requirements 4.1**

  - [ ]* 5.3 Write property test for assignment data round-trip (Property 6)
    - **Property 6: Assignment data round-trip**
    - Generate random assignment objects with required fields
    - Verify write to `assignments/{id}` and read back produces equal object
    - **Validates: Requirements 4.2, 4.4**

  - [ ]* 5.4 Write property test for progress data round-trip with encryption (Property 7)
    - **Property 7: Progress data round-trip with encryption**
    - Generate random progress records with assessment results and exercise submissions
    - Verify write through DataContext (encrypts) and read back (decrypts) produces equal record
    - Verify raw RTDB values for encrypted fields differ from plaintext
    - **Validates: Requirements 4.3, 5.1, 5.2**

- [x] 6. Checkpoint — Verify auth and data layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Create Firebase security rules
  - [x] 7.1 Create `database.rules.json` in the project root
    - Define rules for `users/{uid}`: learner reads/writes own data, leadership reads all
    - Define rules for `assignments/{assignmentId}`: learner reads own assignments, leadership reads/writes all
    - Define rules for `progress/{learnerId}`: learner reads/writes own progress, leadership reads all
    - Deny all access to unauthenticated requests
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 7.2 Write property test for learner data isolation (Property 8)
    - **Property 8: Learner data isolation**
    - Generate pairs of learner UIDs with `fc.tuple(fc.uuid(), fc.uuid())`
    - Verify learner A can access own data but is denied access to learner B's data
    - Requires Firebase Emulator Suite
    - **Validates: Requirements 6.1**

  - [ ]* 7.3 Write property test for leadership read access (Property 9)
    - **Property 9: Leadership read access**
    - Generate leadership UID and random data paths
    - Verify leadership user is granted read access to all paths and write access to assignments
    - Requires Firebase Emulator Suite
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 7.4 Write property test for unauthenticated access denied (Property 10)
    - **Property 10: Unauthenticated access denied**
    - Generate random data paths with `fc.constantFrom`
    - Verify unauthenticated requests are denied both read and write access
    - Requires Firebase Emulator Suite
    - **Validates: Requirements 6.4**

- [ ] 8. Create seed script
  - [x] 8.1 Create `scripts/seed.mjs` — standalone Node.js seed script using Firebase Admin SDK
    - Import Firebase Admin SDK (`firebase-admin`) and the encryption module
    - Create 3 leadership user accounts in Firebase Auth with @zeb.co emails
    - Create 10 learner user accounts in Firebase Auth with @zeb.co emails
    - Write user profiles to `users/{uid}` in RTDB with name, email, and role
    - Create assignment records matching existing distribution: 3 completed, 3 in-progress, 4 not-started
    - Create progress records for learners with completed/in-progress assignments, including encrypted assessment results and exercise submissions
    - Handle existing users gracefully (skip or update)
    - Use `GOOGLE_APPLICATION_CREDENTIALS` and `ENCRYPTION_KEY` env vars
    - _Requirements: 3.1, 3.2, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 9. Remove mock store and update imports
  - [x] 9.1 Delete `src/store/mockStore.js` and `src/store/seedData.js`
    - _Requirements: 7.1, 7.2_

  - [x] 9.2 Remove all imports and references to `mockStore.js`, `seedData.js`, `initializeMockStore`, `initializeStore`, and `resetStore` across the codebase
    - Update or remove `src/__tests__/unit/mockStore.test.js`
    - Update or remove `src/__tests__/unit/seedData.test.js`
    - Update `src/__tests__/unit/auth.test.jsx` to use Firebase Auth mocks instead of mock store
    - Update `src/__tests__/unit/routeGuards.test.jsx` to use Firebase Auth mocks instead of mock store
    - Verify no source file contains `@deepcortex.com` references
    - _Requirements: 7.3, 7.4, 3.3_

- [x] 10. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests for security rules (Properties 8, 9, 10) require the Firebase Emulator Suite
- Checkpoints ensure incremental validation
- Page components should not need changes since `useAuth()` and `useData()` interfaces are preserved

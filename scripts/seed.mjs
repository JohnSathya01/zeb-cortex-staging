#!/usr/bin/env node

/**
 * Seed script for Zeb DeepCortex Firebase backend.
 *
 * Creates user accounts in Firebase Auth and populates RTDB with
 * user profiles, assignments, and progress records.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json ENCRYPTION_KEY=<key> node scripts/seed.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import CryptoJS from 'crypto-js';
import { readFileSync } from 'fs';

// ── Config ──

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS env var is required');
  process.exit(1);
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.error('ERROR: ENCRYPTION_KEY env var is required');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
});

const auth = getAuth(app);
const db = getDatabase(app);

// ── Encryption helpers (Node.js context) ──

function encryptField(value) {
  if (value === null || value === undefined) return value;
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString();
}

// ── Seed data ──

const PASSWORD = 'password123';

const leadershipUsers = [
  { name: 'Sarah Chen', email: 'sarah.chen@zeb.co' },
  { name: 'Marcus Rivera', email: 'marcus.rivera@zeb.co' },
  { name: 'Priya Sharma', email: 'priya.sharma@zeb.co' },
];

const learnerUsers = [
  { name: 'Alex Johnson', email: 'alex.johnson@zeb.co' },
  { name: 'Maria Garcia', email: 'maria.garcia@zeb.co' },
  { name: 'James Wilson', email: 'james.wilson@zeb.co' },
  { name: 'Emily Davis', email: 'emily.davis@zeb.co' },
  { name: 'David Kim', email: 'david.kim@zeb.co' },
  { name: 'Sofia Martinez', email: 'sofia.martinez@zeb.co' },
  { name: 'Liam Brown', email: 'liam.brown@zeb.co' },
  { name: 'Olivia Taylor', email: 'olivia.taylor@zeb.co' },
  { name: 'Noah Anderson', email: 'noah.anderson@zeb.co' },
  { name: 'Ava Thomas', email: 'ava.thomas@zeb.co' },
];

// ── Helpers ──

async function createOrGetUser(email, password, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    console.log(`  ✓ User exists: ${email} (${existing.uid})`);
    return existing.uid;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email,
        password,
        displayName,
      });
      console.log(`  + Created user: ${email} (${created.uid})`);
      return created.uid;
    }
    throw error;
  }
}

// ── Main ──

async function seed() {
  console.log('🌱 Starting seed...\n');

  // 1. Create leadership users
  console.log('Creating leadership users...');
  const leaderUids = [];
  for (const u of leadershipUsers) {
    const uid = await createOrGetUser(u.email, PASSWORD, u.name);
    leaderUids.push(uid);
    await db.ref(`users/${uid}`).set({ name: u.name, email: u.email, role: 'leadership' });
  }

  // 2. Create learner users
  console.log('\nCreating learner users...');
  const learnerUids = [];
  for (const u of learnerUsers) {
    const uid = await createOrGetUser(u.email, PASSWORD, u.name);
    learnerUids.push(uid);
    await db.ref(`users/${uid}`).set({ name: u.name, email: u.email, role: 'learner' });
  }

  // 3. Create assignments
  // We use a fixed courseId since courses are loaded from markdown in the client
  const courseId = 'nmt-course-001';
  console.log('\nCreating assignments...');

  const assignmentRefs = [];

  // Learners 0-2: completed
  for (let i = 0; i < 3; i++) {
    const aRef = db.ref('assignments').push();
    const assignment = {
      learnerId: learnerUids[i],
      courseId,
      status: 'completed',
      targetCompletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      assignedAt: new Date().toISOString(),
    };
    await aRef.set(assignment);
    assignmentRefs.push({ id: aRef.key, ...assignment });
    console.log(`  + Assignment (completed): ${learnerUsers[i].name}`);
  }

  // Learners 3-5: in_progress
  for (let i = 3; i < 6; i++) {
    const aRef = db.ref('assignments').push();
    const assignment = {
      learnerId: learnerUids[i],
      courseId,
      status: 'in_progress',
      targetCompletionDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      assignedAt: new Date().toISOString(),
    };
    await aRef.set(assignment);
    assignmentRefs.push({ id: aRef.key, ...assignment });
    console.log(`  + Assignment (in_progress): ${learnerUsers[i].name}`);
  }

  // Learners 6-9: not_started
  for (let i = 6; i < 10; i++) {
    const aRef = db.ref('assignments').push();
    const assignment = {
      learnerId: learnerUids[i],
      courseId,
      status: 'not_started',
      targetCompletionDate: null,
      assignedAt: new Date().toISOString(),
    };
    await aRef.set(assignment);
    assignmentRefs.push({ id: aRef.key, ...assignment });
    console.log(`  + Assignment (not_started): ${learnerUsers[i].name}`);
  }

  // 4. Create progress records
  console.log('\nCreating progress records...');

  // We generate placeholder chapter IDs for progress records.
  // In the real app, chapter IDs are generated at parse time from markdown.
  // The seed script creates progress data that demonstrates the structure.
  const chapterIds = Array.from({ length: 13 }, (_, i) => `chapter-${String(i + 1).padStart(2, '0')}`);
  const assessmentIds = chapterIds.map((_, i) =>
    Array.from({ length: 3 }, (_, j) => `assessment-ch${i + 1}-q${j + 1}`)
  );
  const exerciseChapterIndices = [0, 2, 4, 6, 8, 10, 12];
  const exerciseIds = exerciseChapterIndices.map((i) => `exercise-ch${i + 1}`);

  // Completed learners (0-2): all 13 chapters done
  for (let i = 0; i < 3; i++) {
    const progressData = {
      completedChapterIds: chapterIds,
      assessmentResults: {},
      exerciseSubmissions: {},
    };

    for (let c = 0; c < 13; c++) {
      const answers = {};
      for (const aId of assessmentIds[c]) {
        answers[aId] = `correct-option-${aId}`;
      }
      progressData.assessmentResults[chapterIds[c]] = {
        answers: encryptField(answers),
        score: encryptField(3),
        total: 3,
        submittedAt: new Date().toISOString(),
      };
    }

    for (let e = 0; e < exerciseIds.length; e++) {
      progressData.exerciseSubmissions[exerciseIds[e]] = {
        text: encryptField(`Completed exercise submission for chapter ${exerciseChapterIndices[e] + 1}`),
        submittedAt: new Date().toISOString(),
      };
    }

    await db.ref(`progress/${learnerUids[i]}/${courseId}`).set(progressData);
    console.log(`  + Progress (completed): ${learnerUsers[i].name}`);
  }

  // In-progress learners (3-5): first 4 chapters done
  for (let i = 3; i < 6; i++) {
    const completedChapters = chapterIds.slice(0, 4);
    const progressData = {
      completedChapterIds: completedChapters,
      assessmentResults: {},
      exerciseSubmissions: {},
    };

    for (let c = 0; c < 4; c++) {
      const answers = {};
      for (const aId of assessmentIds[c]) {
        answers[aId] = `correct-option-${aId}`;
      }
      progressData.assessmentResults[chapterIds[c]] = {
        answers: encryptField(answers),
        score: encryptField(3),
        total: 3,
        submittedAt: new Date().toISOString(),
      };
    }

    // Exercises for completed odd chapters (indices 0, 2)
    for (const idx of [0, 2]) {
      const eIdx = exerciseChapterIndices.indexOf(idx);
      if (eIdx !== -1) {
        progressData.exerciseSubmissions[exerciseIds[eIdx]] = {
          text: encryptField(`In-progress submission for chapter ${idx + 1}`),
          submittedAt: new Date().toISOString(),
        };
      }
    }

    await db.ref(`progress/${learnerUids[i]}/${courseId}`).set(progressData);
    console.log(`  + Progress (in_progress): ${learnerUsers[i].name}`);
  }

  console.log('\n✅ Seed complete!');
  console.log(`   ${leadershipUsers.length} leadership users`);
  console.log(`   ${learnerUsers.length} learner users`);
  console.log(`   ${assignmentRefs.length} assignments`);
  console.log(`   6 progress records`);

  process.exit(0);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

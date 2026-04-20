#!/usr/bin/env node

/**
 * Reseed script — removes all existing users and data, then creates only the 3 specified users.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json ENCRYPTION_KEY=<key> node scripts/reseed.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync } from 'fs';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) { console.error('ERROR: ENCRYPTION_KEY required'); process.exit(1); }

function encryptField(value) {
  if (value === null || value === undefined) return value;
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString();
}

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS required'); process.exit(1); }

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`,
});

const auth = getAuth(app);
const db = getDatabase(app);

const PASSWORD = 'password123';

const users = [
  { name: 'Sivasaran Sekaran', email: 'sivasaran.sekaran@zeb.co', role: 'leadership' },
  { name: 'John Sathya', email: 'john.sathya@zeb.co', role: 'leadership' },
  { name: 'Learner Test', email: 'learnertest@zeb.co', role: 'learner' },
];

async function deleteAllUsers() {
  console.log('Deleting all existing Firebase Auth users...');
  let pageToken;
  let count = 0;
  do {
    const result = await auth.listUsers(1000, pageToken);
    const uids = result.users.map((u) => u.uid);
    if (uids.length > 0) {
      await auth.deleteUsers(uids);
      count += uids.length;
    }
    pageToken = result.pageToken;
  } while (pageToken);
  console.log(`  Deleted ${count} users`);
}

async function clearDatabase() {
  console.log('Clearing Realtime Database...');
  await db.ref('/').remove();
  console.log('  Database cleared');
}

async function createUser(email, password, displayName) {
  try {
    const existing = await auth.getUserByEmail(email);
    console.log(`  ✓ Exists: ${email} (${existing.uid})`);
    return existing.uid;
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const created = await auth.createUser({ email, password, displayName });
      console.log(`  + Created: ${email} (${created.uid})`);
      return created.uid;
    }
    throw e;
  }
}

async function seed() {
  console.log('🧹 Cleaning up...\n');
  await deleteAllUsers();
  await clearDatabase();

  console.log('\n🌱 Creating 3 users...\n');
  const uids = {};
  for (const u of users) {
    const uid = await createUser(u.email, PASSWORD, u.name);
    await db.ref(`users/${uid}`).set({ name: u.name, email: u.email, role: u.role });
    uids[u.email] = uid;
  }

  const learnerUid = uids['learnertest@zeb.co'];
  const courseId = 'nmt-course-001';

  // Create assignment for the learner — in_progress with 4 chapters done
  console.log('\n📋 Creating assignment for learner...');
  const aRef = db.ref('assignments').push();
  await aRef.set({
    learnerId: learnerUid,
    courseId,
    status: 'in_progress',
    targetCompletionDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    assignedAt: new Date().toISOString(),
  });
  console.log(`  + Assignment created (in_progress)`);

  // Create progress record — first 4 chapters completed with encrypted data
  console.log('\n📊 Creating progress record...');
  const chapterIds = Array.from({ length: 13 }, (_, i) => `chapter-${String(i + 1).padStart(2, '0')}`);
  const completedChapters = chapterIds.slice(0, 4);

  const progressData = {
    completedChapterIds: completedChapters,
    assessmentResults: {},
    exerciseSubmissions: {},
  };

  for (let c = 0; c < 4; c++) {
    const assessmentIds = Array.from({ length: 3 }, (_, j) => `assessment-ch${c + 1}-q${j + 1}`);
    const answers = {};
    for (const aId of assessmentIds) {
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
  const exerciseIds = ['exercise-ch1', 'exercise-ch3'];
  for (const exId of exerciseIds) {
    progressData.exerciseSubmissions[exId] = {
      text: encryptField(`Completed exercise submission`),
      submittedAt: new Date().toISOString(),
    };
  }

  await db.ref(`progress/${learnerUid}/${courseId}`).set(progressData);
  console.log(`  + Progress record created (4/13 chapters completed)`);

  console.log('\n✅ Done! 3 users + assignment + progress created:');
  console.log('   Leadership: sivasaran.sekaran@zeb.co / password123');
  console.log('   Leadership: john.sathya@zeb.co / password123');
  console.log('   Learner:    learnertest@zeb.co / password123 (assigned NMT course, 4 chapters done)');
  process.exit(0);
}

seed().catch((e) => { console.error('Failed:', e); process.exit(1); });

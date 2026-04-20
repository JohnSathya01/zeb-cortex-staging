#!/usr/bin/env node

/**
 * Cleanup script: Removes Firebase Auth accounts for users deleted from the app.
 * Compares Auth users against RTDB profiles — if an Auth user has no RTDB profile, deletes them.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/cleanupUsers.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync } from 'fs';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS required'); process.exit(1); }

const sa = JSON.parse(readFileSync(credPath, 'utf8'));
const app = initializeApp({ credential: cert(sa), databaseURL: `https://${sa.project_id}-default-rtdb.firebaseio.com` });
const auth = getAuth(app);
const db = getDatabase(app);

async function cleanup() {
  console.log('🧹 Cleaning up orphaned Firebase Auth accounts...\n');

  // Get all RTDB user UIDs
  const snap = await db.ref('users').get();
  const rtdbUids = new Set(snap.exists() ? Object.keys(snap.val()) : []);

  // List all Auth users
  let pageToken;
  let cleaned = 0;
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const authUser of result.users) {
      if (!rtdbUids.has(authUser.uid)) {
        await auth.deleteUser(authUser.uid);
        console.log(`  - Deleted: ${authUser.email} (${authUser.uid})`);
        cleaned++;
      } else {
        console.log(`  ✓ Kept: ${authUser.email}`);
      }
    }
    pageToken = result.pageToken;
  } while (pageToken);

  console.log(`\n✅ Cleaned up ${cleaned} orphaned account(s).`);
  process.exit(0);
}

cleanup().catch((e) => { console.error('Cleanup failed:', e); process.exit(1); });

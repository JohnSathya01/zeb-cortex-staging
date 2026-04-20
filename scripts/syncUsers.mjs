#!/usr/bin/env node

/**
 * Sync script: Creates Firebase Auth accounts for users added via the UI.
 * Reads users with `pendingAuth: true` from RTDB, creates their Auth accounts,
 * then removes the pendingAuth flag and encryptedPassword.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json ENCRYPTION_KEY=<key> node scripts/syncUsers.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync } from 'fs';
import CryptoJS from 'crypto-js';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) { console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS required'); process.exit(1); }
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || (() => {
  // Fallback: read from .env file directly to avoid shell escaping issues
  try {
    const envContent = readFileSync('.env', 'utf8');
    const match = envContent.match(/VITE_ENCRYPTION_KEY=(.+)/);
    return match ? match[1].trim() : null;
  } catch { return null; }
})();
if (!ENCRYPTION_KEY) { console.error('ERROR: ENCRYPTION_KEY required'); process.exit(1); }

function decryptField(ciphertext) {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

const sa = JSON.parse(readFileSync(credPath, 'utf8'));
const app = initializeApp({ credential: cert(sa), databaseURL: `https://${sa.project_id}-default-rtdb.firebaseio.com` });
const auth = getAuth(app);
const db = getDatabase(app);

async function sync() {
  console.log('🔄 Syncing pending users to Firebase Auth...\n');

  const snap = await db.ref('users').get();
  if (!snap.exists()) { console.log('No users found.'); process.exit(0); }

  const users = snap.val();
  let synced = 0;

  for (const [rtdbKey, profile] of Object.entries(users)) {
    if (!profile.pendingAuth) continue;

    const email = profile.email;
    let password = 'password123'; // default fallback
    if (profile.encryptedPassword) {
      try {
        const decrypted = decryptField(profile.encryptedPassword);
        if (decrypted && decrypted.length >= 6) password = decrypted;
      } catch {
        console.log(`    Using default password (decryption failed)`);
      }
    }
    const displayName = profile.name;

    try {
      // Check if auth account already exists
      try {
        const existing = await auth.getUserByEmail(email);
        console.log(`  ✓ Auth exists: ${email} (${existing.uid})`);
        // Move profile to the correct UID key
        if (existing.uid !== rtdbKey) {
          await db.ref(`users/${existing.uid}`).set({ name: profile.name, email: profile.email, role: profile.role });
          await db.ref(`users/${rtdbKey}`).remove();
          console.log(`    Moved profile from ${rtdbKey} to ${existing.uid}`);
        } else {
          await db.ref(`users/${rtdbKey}`).update({ pendingAuth: null, encryptedPassword: null });
        }
        synced++;
        continue;
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }

      // Create new auth account
      const created = await auth.createUser({ email, password, displayName });
      console.log(`  + Created: ${email} (${created.uid})`);

      // Move profile to the Firebase Auth UID key
      await db.ref(`users/${created.uid}`).set({ name: profile.name, email: profile.email, role: profile.role });
      if (created.uid !== rtdbKey) {
        await db.ref(`users/${rtdbKey}`).remove();
        console.log(`    Moved profile from ${rtdbKey} to ${created.uid}`);
      }
      synced++;
    } catch (err) {
      console.error(`  ✗ Failed: ${email} — ${err.message}`);
    }
  }

  console.log(`\n✅ Synced ${synced} user(s).`);
  process.exit(0);
}

sync().catch((e) => { console.error('Sync failed:', e); process.exit(1); });

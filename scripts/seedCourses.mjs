#!/usr/bin/env node

/**
 * Lightweight course seeder for Zeb DeepCortex.
 *
 * Scans the Courses/ directory, discovers all .md chapter files,
 * and writes courseConfigs to Firebase RTDB.
 *
 * Does NOT touch users, assignments, or progress — only courseConfigs.
 *
 * Usage (PowerShell):
 *
 *   # Emulator mode:
 *   $env:USE_EMULATORS="true"; node scripts/seedCourses.mjs
 *
 *   # Production mode (requires serviceAccountKey.json in project root):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"; node scripts/seedCourses.mjs
 *
 * Usage (Bash):
 *
 *   # Emulator mode:
 *   USE_EMULATORS=true node scripts/seedCourses.mjs
 *
 *   # Production mode:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/seedCourses.mjs
 *
 * Notes:
 *   - This does a FULL OVERWRITE of the courseConfigs node in RTDB
 *   - If a folder has a course.json, title and description are read from it
 *   - Otherwise, title is derived from the folder name (kebab-case → Title Case)
 *   - Files named COURSE_OUTLINE.md and README.md are excluded
 *   - Course IDs follow the format: {folder-name}-auto
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ── Config ──

const USE_EMULATORS = process.env.USE_EMULATORS === 'false';
const EXCLUDED_FILES = ['COURSE_OUTLINE.md', 'README.md'];

let app;

if (USE_EMULATORS) {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
  app = initializeApp({
    projectId: 'zeb-poc',
    databaseURL: 'https://zeb-poc-default-rtdb.firebaseio.com/',
  });
  console.log('🔧 Using Firebase Emulators\n');
} else {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) {
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS env var is required');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
  app = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: 'https://zeb-poc-default-rtdb.firebaseio.com',
  });
}

const db = getDatabase(app);

// ── Main ──

async function seedCourses() {
  console.log('📚 Scanning Courses/ directory...\n');

  const coursesDir = join(process.cwd(), 'Courses');
  const courseConfigs = {};

  const folders = readdirSync(coursesDir).filter((f) =>
    statSync(join(coursesDir, f)).isDirectory()
  );

  for (const folder of folders) {
    const folderPath = join(coursesDir, folder);
    const mdFiles = readdirSync(folderPath)
      .filter((f) => f.endsWith('.md') && !EXCLUDED_FILES.includes(f))
      .sort();

    if (mdFiles.length === 0) {
      console.log(`  ⏭ ${folder}: no .md files, skipping`);
      continue;
    }

    const courseId = `${folder}-auto`;

    // Read course.json for metadata if it exists
    let title = folder.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    let description = '';

    try {
      const courseJson = JSON.parse(readFileSync(join(folderPath, 'course.json'), 'utf8'));
      if (courseJson.title) title = courseJson.title;
      if (courseJson.description) description = courseJson.description;
    } catch {
      // No course.json — use derived title
    }

    courseConfigs[courseId] = {
      title,
      description,
      chapterFiles: mdFiles.map((f) => ({
        path: `Courses/${folder}/${f}`,
        multiChapter: false,
      })),
      createdAt: new Date().toISOString(),
    };

    console.log(`  ✓ ${courseId}: "${title}" (${mdFiles.length} chapters)`);
  }

  if (Object.keys(courseConfigs).length === 0) {
    console.log('\nNo courses found. Nothing to seed.');
    process.exit(0);
  }

  console.log(`\nWriting ${Object.keys(courseConfigs).length} course(s) to RTDB...`);
  await db.ref('courseConfigs').set(courseConfigs);
  console.log('✅ courseConfigs seeded successfully!');

  process.exit(0);
}

seedCourses().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

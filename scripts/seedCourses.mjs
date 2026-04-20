#!/usr/bin/env node

/**
 * Course seeder — reads courses.json manifest and writes courseConfigs to Firebase RTDB.
 *
 * To add a new course:
 *   1. Add a folder under Courses/ with chapter .md files
 *   2. Add an entry to courses.json (id, title, description, path)
 *   3. Run this seeder to update RTDB
 *   4. Push to repo and rebuild
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/seedCourses.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credPath) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS env var is required');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: 'https://zeb-poc-default-rtdb.firebaseio.com',
});
const db = getDatabase(app);

const EXCLUDED_FILES = ['COURSE_OUTLINE.md', 'README.md'];

async function seedCourses() {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'courses.json'), 'utf8'));

  console.log(`📚 Seeding ${manifest.courses.length} course(s) from courses.json...\n`);

  const courseConfigs = {};

  for (const course of manifest.courses) {
    const folderPath = join(process.cwd(), course.path);

    let mdFiles;
    try {
      mdFiles = readdirSync(folderPath)
        .filter((f) => f.endsWith('.md') && !EXCLUDED_FILES.includes(f))
        .sort();
    } catch {
      console.warn(`  ⚠ Path not found: ${course.path} — skipping`);
      continue;
    }

    if (mdFiles.length === 0) {
      console.warn(`  ⚠ No .md files in ${course.path} — skipping`);
      continue;
    }

    courseConfigs[course.id] = {
      title: course.title,
      description: course.description || '',
      chapterFiles: mdFiles.map((f) => ({
        path: `${course.path}/${f}`,
        multiChapter: false,
      })),
      updatedAt: new Date().toISOString(),
    };

    console.log(`  ✓ ${course.id}: "${course.title}" (${mdFiles.length} chapters)`);
  }

  if (Object.keys(courseConfigs).length === 0) {
    console.log('\nNo courses found. Nothing to seed.');
    process.exit(0);
  }

  console.log(`\nWriting to RTDB...`);
  await db.ref('courseConfigs').set(courseConfigs);
  console.log('✅ courseConfigs seeded successfully!');

  process.exit(0);
}

seedCourses().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

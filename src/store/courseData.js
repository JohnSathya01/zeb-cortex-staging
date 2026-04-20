import { ref, get, set } from 'firebase/database';
import { database } from '../firebase.js';

import { parseMarkdownFile, parseMultiChapterFile } from '../utils/markdownParser.js';
import {
  createCourse,
  createChapter,
} from '../models/index.js';

/**
 * Auto-discover all .md files under Courses/ at build time using Vite's import.meta.glob.
 * No manual imports needed — just drop .md files into Courses/{folder}/ and rebuild.
 *
 * Keys are like: "../../Courses/neural-machine-translation/chapter-01-introduction-to-nmt.md"
 * We normalize them to: "Courses/neural-machine-translation/chapter-01-introduction-to-nmt.md"
 */
const rawModules = import.meta.glob('../../Courses/**/*.md', { eager: true, query: '?raw', import: 'default' });

// Files to exclude from course content (not chapters)
const EXCLUDED_FILES = ['COURSE_OUTLINE.md', 'README.md'];

const bundledImports = {};
for (const [rawPath, content] of Object.entries(rawModules)) {
  const normalized = rawPath.replace(/^.*?Courses\//, 'Courses/');
  const fileName = normalized.split('/').pop();
  if (EXCLUDED_FILES.includes(fileName)) continue;
  bundledImports[normalized] = content;
}

// Module-level course cache
let _courses = [];

/**
 * Derives course configs from bundledImports by grouping files by their
 * parent folder under Courses/. Each folder becomes a course.
 */
function deriveConfigsFromBundledImports() {
  const courseMap = {};

  for (const path of Object.keys(bundledImports)) {
    const parts = path.split('/');
    if (parts.length < 3 || parts[0] !== 'Courses') continue;
    const folder = parts[1];

    if (!courseMap[folder]) {
      courseMap[folder] = [];
    }
    courseMap[folder].push(path);
  }

  const configs = {};
  for (const [folder, paths] of Object.entries(courseMap)) {
    const sortedPaths = [...paths].sort();
    const courseId = `${folder}-auto`;
    const title = folder
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    configs[courseId] = {
      title,
      description: '',
      chapterFiles: sortedPaths.map((p) => ({
        path: p,
        multiChapter: false,
      })),
      createdAt: new Date().toISOString(),
    };
  }

  return configs;
}

/**
 * Auto-registers bundled courses in RTDB if courseConfigs is empty.
 * Also adds any new bundled folders not yet in RTDB.
 */
async function autoRegisterCourses(existingConfigs) {
  const derived = deriveConfigsFromBundledImports();

  if (!existingConfigs || Object.keys(existingConfigs).length === 0) {
    try {
      await set(ref(database, 'courseConfigs'), derived);
      console.log('Auto-registered bundled courses in RTDB');
      return derived;
    } catch (err) {
      console.warn('Failed to auto-register courses:', err);
      return derived;
    }
  }

  // Collect all paths already covered by existing configs
  const existingPaths = new Set();
  for (const config of Object.values(existingConfigs)) {
    for (const fileRef of config.chapterFiles || []) {
      existingPaths.add(fileRef.path);
    }
  }

  let hasNew = false;
  const merged = { ...existingConfigs };
  for (const [courseId, config] of Object.entries(derived)) {
    const hasUncoveredFiles = config.chapterFiles.some((f) => !existingPaths.has(f.path));
    if (hasUncoveredFiles && !merged[courseId]) {
      merged[courseId] = config;
      hasNew = true;
    }
  }

  if (hasNew) {
    try {
      await set(ref(database, 'courseConfigs'), merged);
      console.log('Auto-registered new bundled courses in RTDB');
    } catch (err) {
      console.warn('Failed to auto-register new courses:', err);
    }
    return merged;
  }

  return existingConfigs;
}

/**
 * Fetches course configs from RTDB and builds Course objects
 * using bundled markdown content. Auto-registers bundled courses
 * if courseConfigs is empty or missing.
 */
export async function initCourses() {
  let snapshot;
  try {
    snapshot = await get(ref(database, 'courseConfigs'));
  } catch (err) {
    console.warn('Failed to read courseConfigs from RTDB:', err);
    _courses = [];
    return _courses;
  }

  const existingConfigs = snapshot.exists() ? snapshot.val() : null;
  const configs = await autoRegisterCourses(existingConfigs);

  if (!configs || Object.keys(configs).length === 0) {
    _courses = [];
    return _courses;
  }

  const courses = [];

  for (const [courseId, config] of Object.entries(configs)) {
    const chapters = [];
    let sequenceOrder = 1;

    for (const fileRef of config.chapterFiles || []) {
      const rawContent = bundledImports[fileRef.path];
      if (!rawContent) {
        console.warn(`Bundled import not found for path: ${fileRef.path}`);
        continue;
      }

      let parsedChapters;
      if (fileRef.multiChapter) {
        parsedChapters = parseMultiChapterFile(rawContent);
      } else {
        parsedChapters = [parseMarkdownFile(rawContent)];
      }

      for (const parsed of parsedChapters) {
        const chapterId = `${courseId}-ch-${String(sequenceOrder).padStart(2, '0')}`;
        chapters.push({
          id: chapterId,
          courseId,
          sequenceOrder,
          title: parsed.title,
          contentBody: parsed.contentBody,
          assessments: parsed.assessments.map((a, qi) => ({
            id: `${chapterId}-assess-${qi + 1}`,
            chapterId,
            question: a.question,
            options: a.options.map((opt, oi) => ({
              id: `${chapterId}-opt-${qi + 1}-${oi}`,
              text: opt.text,
              isCorrect: opt.isCorrect,
            })),
          })),
          exercises: parsed.exercises.map((e, ei) => ({
            id: `${chapterId}-ex-${ei + 1}`,
            chapterId,
            title: e.title,
            instructions: e.instructions,
            submissionType: e.submissionType,
          })),
        });
        sequenceOrder++;
      }
    }

    courses.push({
      id: courseId,
      title: config.title,
      description: config.description || '',
      chapters,
      createdAt: config.createdAt || new Date().toISOString(),
    });
  }

  _courses = courses;
  return _courses;
}

export function getCourses() {
  return [..._courses];
}

export function getCourseById(id) {
  const course = _courses.find((c) => c.id === id);
  return course ? { ...course } : null;
}

export function createCourseRecord(data) {
  const course = createCourse(data);
  _courses.push(course);
  return { ...course };
}

export function updateCourse(id, data) {
  const idx = _courses.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  _courses[idx] = { ..._courses[idx], ...data, id };
  return { ..._courses[idx] };
}

export function deleteCourse(id) {
  const idx = _courses.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  _courses.splice(idx, 1);
  return true;
}

export function addChaptersToCourse(courseId, chapters) {
  const idx = _courses.findIndex((c) => c.id === courseId);
  if (idx === -1) return null;
  const course = _courses[idx];
  const startOrder = course.chapters.length + 1;
  const newChapters = chapters.map((ch, i) =>
    createChapter({ ...ch, courseId, sequenceOrder: startOrder + i })
  );
  course.chapters = [...course.chapters, ...newChapters];
  return { ...course };
}

export function reorderChapters(courseId, orderedIds) {
  const idx = _courses.findIndex((c) => c.id === courseId);
  if (idx === -1) return null;
  const course = _courses[idx];
  const chapterMap = new Map(course.chapters.map((ch) => [ch.id, ch]));
  course.chapters = orderedIds.map((id, i) => ({
    ...chapterMap.get(id),
    sequenceOrder: i + 1,
  }));
  return { ...course };
}

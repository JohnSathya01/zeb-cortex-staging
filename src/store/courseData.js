import { parseMarkdownFile, parseMultiChapterFile } from '../utils/markdownParser.js';
import coursesManifest from '../../courses.json';

/**
 * Courses are defined in /courses.json and content lives in /Courses/** as markdown.
 * Vite bundles all markdown files at build time — no runtime file system access needed.
 * To add a new course: add a folder under Courses/, add an entry to courses.json, rebuild.
 */
const rawModules = import.meta.glob('../../Courses/**/*.md', { eager: true, query: '?raw', import: 'default' });

const EXCLUDED_FILES = ['COURSE_OUTLINE.md', 'README.md'];

// Normalize Vite glob keys → "Courses/folder/file.md"
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
 * Builds course configs from courses.json manifest.
 * Each course's chapter files are discovered from bundledImports by matching the course path.
 */
function deriveConfigsFromManifest() {
  const configs = {};

  for (const course of coursesManifest.courses) {
    const prefix = course.path + '/'; // e.g. "Courses/neural-machine-translation/"
    const chapterFiles = Object.keys(bundledImports)
      .filter((p) => p.startsWith(prefix))
      .sort()
      .map((p) => ({ path: p, multiChapter: false }));

    if (chapterFiles.length === 0) {
      console.warn(`No markdown files found for course "${course.id}" at path "${course.path}"`);
      continue;
    }

    configs[course.id] = {
      title: course.title,
      description: course.description || '',
      chapterFiles,
    };
  }

  return configs;
}

/**
 * Loads all courses from the manifest + bundled markdown files.
 * No Firebase read needed — content is bundled at build time.
 */
export async function initCourses() {
  const configs = deriveConfigsFromManifest();

  if (Object.keys(configs).length === 0) {
    _courses = [];
    return _courses;
  }

  const courses = [];

  for (const [courseId, config] of Object.entries(configs)) {
    const chapters = [];
    let sequenceOrder = 1;

    for (const fileRef of config.chapterFiles) {
      const rawContent = bundledImports[fileRef.path];
      if (!rawContent) {
        console.warn(`Bundled content missing for: ${fileRef.path}`);
        continue;
      }

      const parsedChapters = fileRef.multiChapter
        ? parseMultiChapterFile(rawContent)
        : [parseMarkdownFile(rawContent)];

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
      description: config.description,
      chapters,
      createdAt: new Date().toISOString(),
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

// These are kept so DataContext imports don't break,
// but courses are repo-managed — UI cannot create/edit/delete them.
export function createCourseRecord() { return null; }
export function updateCourse() { return null; }
export function deleteCourse() { return false; }
export function addChaptersToCourse() { return null; }
export function reorderChapters() { return null; }

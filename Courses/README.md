# Adding a New Course to DeepCortex

## Folder Structure

Each course lives in its own folder under `Courses/`:

```
Courses/
├── neural-machine-translation/    ← existing course
├── your-new-course/               ← your new course
└── README.md                      ← this file
```

## Step-by-Step Guide

### 1. Create a course folder

Create a new folder with a kebab-case name:
```
Courses/my-new-course/
```

### 2. Create `course.json`

Add a `course.json` file with the course metadata:
```json
{
  "id": "my-new-course-001",
  "title": "My New Course Title",
  "description": "A brief description of what this course covers."
}
```

The `id` must be unique across all courses and should be a simple kebab-case string.

### 3. Add chapter markdown files

Create one `.md` file per chapter, named with a numeric prefix for ordering:
```
chapter-01-topic-name.md
chapter-02-another-topic.md
chapter-03-third-topic.md
```

Each chapter file should follow this format:

```markdown
# Chapter Title

Your chapter content goes here. Use standard markdown:
- Headings (##, ###)
- Paragraphs
- Code blocks
- Tables
- Lists
- Bold, italic, inline code

## Assessment

### Q1: Your question here?
- [ ] Wrong answer
- [x] Correct answer
- [ ] Another wrong answer

### Q2: Another question?
- [x] Correct
- [ ] Wrong

## Exercise

### Exercise 1: Exercise Title
Instructions for the exercise go here.
**Submission Type:** text
```

The `## Assessment` and `## Exercise` sections are optional. If you don't include them, assessments can be added later via the leadership Assessment Editor in the app.

### 4. Register the course in the app

Edit `src/store/courseData.js` and add your new course:

1. Import the chapter files at the top:
```js
import newCh01 from '../../Courses/my-new-course/chapter-01-topic.md?raw';
import newCh02 from '../../Courses/my-new-course/chapter-02-topic.md?raw';
```

2. Add a new `buildCourse` function or extend the existing one to include your course.

3. Update the `ensureCourses()` function to return both courses.

### 5. Migrate assessments to Firebase

If your chapters include `## Assessment` blocks, run the migration script to seed them into Firebase RTDB:
```bash
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/migrateAssessments.mjs
```

Or add assessments directly via the leadership Assessment Editor in the app.

### 6. Build and deploy

```bash
npm run build
npx firebase-tools deploy --only hosting --project zeb-poc
```

### 7. Assign the course

Log in as leadership, go to Course Assignment, and assign the new course to learners.

## Chapter Template

Download the chapter template from the app (Course Management → Download Template) or use the format shown above.

## Tips

- Keep chapter files focused on a single topic
- Use the `chapter-NN-` prefix for automatic ordering
- Assessment questions need at least 2 options with exactly 1 correct
- Exercise submission type is always "text" for now
- Course content is bundled into the app at build time — changes require a rebuild and redeploy

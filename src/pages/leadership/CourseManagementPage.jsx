import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import { parseMarkdownFile, validateMarkdownStructure } from '../../utils/markdownParser.js';
import { generateCourseTemplate } from '../../utils/courseTemplate.js';
import '../../styles/pages.css';

export default function CourseManagementPage() {
  const {
    getCourses,
    createCourseRecord,
    updateCourse,
    deleteCourse,
    addChaptersToCourse,
    reorderChapters,
  } = useData();

  const [courses, setCourses] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createFiles, setCreateFiles] = useState([]);
  const [createErrors, setCreateErrors] = useState([]);
  const [createFieldErrors, setCreateFieldErrors] = useState({});

  const [addChaptersCourseId, setAddChaptersCourseId] = useState(null);
  const [addFiles, setAddFiles] = useState([]);
  const [addErrors, setAddErrors] = useState([]);

  const [expandedCourseId, setExpandedCourseId] = useState(null);

  const [editCourse, setEditCourse] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    const c = await getCourses();
    setCourses(c);
  }

  // ── Template download ──

  function handleDownloadTemplate() {
    const template = generateCourseTemplate();
    const blob = new Blob([template], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'course-chapter-template.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── File reading + validation helpers ──

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsText(file);
    });
  }

  async function parseAndValidateFiles(files) {
    const errors = [];
    const chapters = [];

    for (const file of files) {
      if (!file.name.endsWith('.md')) {
        errors.push(`"${file.name}": Only .md files are accepted.`);
        continue;
      }

      const text = await readFileAsText(file);
      const parsed = parseMarkdownFile(text);
      const validation = validateMarkdownStructure(parsed);

      if (!validation.valid) {
        errors.push(`"${file.name}": ${validation.errors.join('; ')}`);
        continue;
      }

      chapters.push({ ...parsed, fileName: file.name });
    }

    // Sort by file name to derive sequence order
    chapters.sort((a, b) => a.fileName.localeCompare(b.fileName));

    return { chapters, errors };
  }

  // ── Create course ──

  function openCreateForm() {
    setCreateTitle('');
    setCreateDescription('');
    setCreateFiles([]);
    setCreateErrors([]);
    setCreateFieldErrors({});
    setShowCreateForm(true);
  }

  function closeCreateForm() {
    setShowCreateForm(false);
    setCreateFiles([]);
    setCreateErrors([]);
    setCreateFieldErrors({});
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    const fieldErrors = {};
    if (!createTitle.trim()) fieldErrors.title = 'Title is required';
    if (!createDescription.trim()) fieldErrors.description = 'Description is required';
    if (createFiles.length === 0) fieldErrors.files = 'At least one .md file is required';

    if (Object.keys(fieldErrors).length > 0) {
      setCreateFieldErrors(fieldErrors);
      return;
    }

    const { chapters, errors } = await parseAndValidateFiles(createFiles);
    if (errors.length > 0) {
      setCreateErrors(errors);
      return;
    }

    const course = await createCourseRecord({
      title: createTitle.trim(),
      description: createDescription.trim(),
      chapters: [],
    });

    await addChaptersToCourse(course.id, chapters);
    closeCreateForm();
    await loadCourses();
  }

  // ── Add chapters to existing course ──

  function openAddChapters(courseId) {
    setAddChaptersCourseId(courseId);
    setAddFiles([]);
    setAddErrors([]);
  }

  function closeAddChapters() {
    setAddChaptersCourseId(null);
    setAddFiles([]);
    setAddErrors([]);
  }

  async function handleAddChaptersSubmit(e) {
    e.preventDefault();
    if (addFiles.length === 0) return;

    const { chapters, errors } = await parseAndValidateFiles(addFiles);
    if (errors.length > 0) {
      setAddErrors(errors);
      return;
    }

    await addChaptersToCourse(addChaptersCourseId, chapters);
    closeAddChapters();
    await loadCourses();
  }

  // ── Reorder chapters ──

  async function moveChapter(courseId, chapterIndex, direction) {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const sorted = [...course.chapters].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const swapIndex = chapterIndex + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;

    [sorted[chapterIndex], sorted[swapIndex]] = [sorted[swapIndex], sorted[chapterIndex]];
    const orderedIds = sorted.map((ch) => ch.id);

    await reorderChapters(courseId, orderedIds);
    await loadCourses();
  }

  // ── Edit course ──

  function openEditForm(course) {
    setEditCourse(course);
    setEditTitle(course.title);
    setEditDescription(course.description || '');
  }

  function closeEditForm() {
    setEditCourse(null);
    setEditTitle('');
    setEditDescription('');
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editTitle.trim()) return;

    await updateCourse(editCourse.id, {
      title: editTitle.trim(),
      description: editDescription.trim(),
    });
    closeEditForm();
    await loadCourses();
  }

  // ── Delete course ──

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    await deleteCourse(deleteTarget.id);
    setDeleteTarget(null);
    if (expandedCourseId === deleteTarget.id) setExpandedCourseId(null);
    await loadCourses();
  }

  // ── Render ──

  return (
    <div>
      <div className="page-header">
        <h1>Course Management</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
            Download Template
          </button>
          <button className="btn btn-primary" onClick={openCreateForm}>
            Create Course
          </button>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="empty-state">No courses found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Chapters</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => {
              const sorted = [...course.chapters].sort(
                (a, b) => a.sequenceOrder - b.sequenceOrder
              );
              const isExpanded = expandedCourseId === course.id;

              return (
                <tr key={course.id} style={{ verticalAlign: 'top' }}>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ marginRight: '8px' }}
                      onClick={() =>
                        setExpandedCourseId(isExpanded ? null : course.id)
                      }
                    >
                      {isExpanded ? '▾' : '▸'}
                    </button>
                    {course.title}
                  </td>
                  <td>{course.chapters.length}</td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openAddChapters(course.id)}
                      >
                        Add Chapters
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEditForm(course)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(course)}
                      >
                        Delete
                      </button>
                    </div>
                    {/* Expanded chapter list */}
                    {isExpanded && sorted.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        {sorted.map((ch, idx) => (
                          <div
                            key={ch.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 0',
                              fontSize: '13px',
                            }}
                          >
                            <span style={{ minWidth: '24px', color: '#6b7280' }}>
                              {ch.sequenceOrder}.
                            </span>
                            <span style={{ flex: 1 }}>{ch.title || `Chapter ${ch.sequenceOrder}`}</span>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={idx === 0}
                              onClick={() => moveChapter(course.id, idx, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={idx === sorted.length - 1}
                              onClick={() => moveChapter(course.id, idx, 1)}
                            >
                              ↓
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() =>
                                navigate(
                                  `/leadership/courses/${course.id}/chapters/${ch.id}/assessments`
                                )
                              }
                            >
                              Edit Assessments
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Create Course Modal */}
      {showCreateForm && (
        <div className="form-overlay" onClick={closeCreateForm}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Course</h2>
            <form onSubmit={handleCreateSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="course-title">Title</label>
                <input
                  id="course-title"
                  type="text"
                  className={createFieldErrors.title ? 'input-error' : ''}
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                />
                {createFieldErrors.title && (
                  <div className="field-error">{createFieldErrors.title}</div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="course-description">Description</label>
                <input
                  id="course-description"
                  type="text"
                  className={createFieldErrors.description ? 'input-error' : ''}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
                {createFieldErrors.description && (
                  <div className="field-error">{createFieldErrors.description}</div>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="course-files">Upload Chapters (.md)</label>
                <input
                  id="course-files"
                  type="file"
                  accept=".md"
                  multiple
                  onChange={(e) => setCreateFiles(Array.from(e.target.files))}
                />
                {createFieldErrors.files && (
                  <div className="field-error">{createFieldErrors.files}</div>
                )}
              </div>
              {createErrors.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  {createErrors.map((err, i) => (
                    <div key={i} className="field-error">{err}</div>
                  ))}
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeCreateForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Chapters Modal */}
      {addChaptersCourseId && (
        <div className="form-overlay" onClick={closeAddChapters}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Chapters</h2>
            <form onSubmit={handleAddChaptersSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="add-chapter-files">Upload Chapters (.md)</label>
                <input
                  id="add-chapter-files"
                  type="file"
                  accept=".md"
                  multiple
                  onChange={(e) => setAddFiles(Array.from(e.target.files))}
                />
              </div>
              {addErrors.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  {addErrors.map((err, i) => (
                    <div key={i} className="field-error">{err}</div>
                  ))}
                </div>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeAddChapters}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Upload
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editCourse && (
        <div className="form-overlay" onClick={closeEditForm}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Course</h2>
            <form onSubmit={handleEditSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="edit-course-title">Title</label>
                <input
                  id="edit-course-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-course-description">Description</label>
                <input
                  id="edit-course-description"
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeEditForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>
              Are you sure you want to delete <strong>{deleteTarget.title}</strong>?
            </p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../contexts/DataContext.jsx';
import '../../styles/pages.css';

export default function CourseManagementPage() {
  const { getCourses } = useData();
  const [courses, setCourses] = useState([]);
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getCourses().then(setCourses);
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Course Management</h1>
        <span style={{ fontSize: '13px', color: '#6b7280', fontStyle: 'italic' }}>
          Courses are managed via the repository
        </span>
      </div>

      {courses.length === 0 ? (
        <div className="empty-state">No courses found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Description</th>
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
                    <strong>{course.title}</strong>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', marginLeft: '32px' }}>
                      ID: {course.id}
                    </div>
                  </td>
                  <td style={{ fontSize: '13px', color: '#6b7280', maxWidth: '260px' }}>
                    {course.description || '—'}
                  </td>
                  <td>{course.chapters.length}</td>
                  <td>
                    {/* Expanded chapter list */}
                    {isExpanded && sorted.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        {sorted.map((ch) => (
                          <div
                            key={ch.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
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
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import '../../styles/pages.css';

const EMPTY_FORM = { name: '', description: '' };

export default function CohortManagementPage() {
  const { getCohorts, getUsers, createCohort, updateCohort, deleteCohort } = useData();

  const [cohorts, setCohorts] = useState([]);
  const [learners, setLearners] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCohort, setEditingCohort] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [c, u] = await Promise.all([getCohorts(), getUsers()]);
    setCohorts(c);
    setLearners(u.filter((u) => u.role === 'learner'));
  }

  function openAddForm() {
    setEditingCohort(null);
    setFormData(EMPTY_FORM);
    setSelectedMembers([]);
    setErrors({});
    setShowForm(true);
  }

  function openEditForm(cohort) {
    setEditingCohort(cohort);
    setFormData({ name: cohort.name, description: cohort.description || '' });
    setSelectedMembers(cohort.members || []);
    setErrors({});
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCohort(null);
    setFormData(EMPTY_FORM);
    setSelectedMembers([]);
    setErrors({});
  }

  function toggleMember(uid) {
    setSelectedMembers((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }

  function validate() {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Cohort name is required';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    if (editingCohort) {
      await updateCohort(editingCohort.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        memberIds: selectedMembers,
      });
    } else {
      await createCohort({
        name: formData.name.trim(),
        description: formData.description.trim(),
        memberIds: selectedMembers,
      });
    }

    closeForm();
    await loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteCohort(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  }

  function getLearnerName(uid) {
    const l = learners.find((l) => l.id === uid);
    return l ? l.name : uid;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Cohort Management</h1>
        <button className="btn btn-primary" onClick={openAddForm}>Create Cohort</button>
      </div>

      {cohorts.length === 0 ? (
        <div className="empty-state">No cohorts yet. Create one to group learners.</div>
      ) : (
        <div className="cohort-grid">
          {cohorts.map((cohort) => {
            const isExpanded = expandedId === cohort.id;
            return (
              <div key={cohort.id} className="cohort-card">
                <div className="cohort-card-header">
                  <div>
                    <div className="cohort-name">{cohort.name}</div>
                    {cohort.description && (
                      <div className="cohort-desc">{cohort.description}</div>
                    )}
                  </div>
                  <div className="cohort-actions">
                    <span className="cohort-count">{cohort.members.length} learners</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditForm(cohort)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(cohort)}>Delete</button>
                  </div>
                </div>

                {cohort.members.length > 0 && (
                  <>
                    <button
                      className="cohort-toggle-btn"
                      onClick={() => setExpandedId(isExpanded ? null : cohort.id)}
                    >
                      {isExpanded ? 'Hide members' : 'Show members'}
                    </button>
                    {isExpanded && (
                      <div className="cohort-members">
                        {cohort.members.map((uid) => (
                          <span key={uid} className="cohort-member-pill">{getLearnerName(uid)}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="form-overlay" onClick={closeForm}>
          <div className="form-modal cohort-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingCohort ? 'Edit Cohort' : 'Create Cohort'}</h2>
            <form onSubmit={handleSubmit} noValidate>

              <div className="form-group">
                <label htmlFor="cohort-name">Cohort Name</label>
                <input
                  id="cohort-name"
                  type="text"
                  placeholder="e.g. Batch Jan 2026"
                  className={errors.name ? 'input-error' : ''}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                {errors.name && <div className="field-error">{errors.name}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="cohort-desc">Description (optional)</label>
                <input
                  id="cohort-desc"
                  type="text"
                  placeholder="e.g. First batch of ML engineers"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Members</label>
                {learners.length === 0 ? (
                  <div className="empty-state" style={{ padding: '12px 0' }}>No learners available.</div>
                ) : (
                  <div className="cohort-member-list">
                    {learners.map((l) => {
                      const checked = selectedMembers.includes(l.id);
                      return (
                        <label key={l.id} className={`cohort-member-row${checked ? ' checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMember(l.id)}
                          />
                          <span className="cohort-member-name">{l.name}</span>
                          <span className="cohort-member-spec">{l.specialisation || '—'}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="cohort-selected-count">
                  {selectedMembers.length} selected
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingCohort ? 'Save Changes' : 'Create Cohort'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="confirm-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Delete cohort <strong>{deleteTarget.name}</strong>?</p>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

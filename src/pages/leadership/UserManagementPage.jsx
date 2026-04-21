import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext.jsx';
import { sendWelcomeEmail } from '../../services/emailService.js';
import '../../styles/pages.css';

const SPECIALISATIONS = [
  'Model Building/Finetuning',
  'Machine Learning',
  'AI Platform Engineering',
];

const EMPTY_FORM = { name: '', email: '', password: '', role: 'learner', specialisation: SPECIALISATIONS[0] };

export default function UserManagementPage() {
  const { getUsers, getAssignments, createUserRecord, updateUser, deleteUser, logAudit } = useData();

  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [emailStatus, setEmailStatus] = useState({}); // { [userId]: 'sending'|'sent'|'error' }
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [u, a] = await Promise.all([getUsers(), getAssignments()]);
    setUsers(u);
    setAssignments(a);
  }

  function getAssignedCourseCount(userId) {
    return assignments.filter((a) => a.learnerId === userId).length;
  }

  function openAddForm() {
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  }

  function openEditForm(user) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      specialisation: user.specialisation || SPECIALISATIONS[0],
    });
    setErrors({});
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingUser(null);
    setFormData(EMPTY_FORM);
    setErrors({});
  }

  function validate() {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.email.trim()) errs.email = 'Email is required';
    if (!editingUser && !formData.password.trim()) errs.password = 'Password is required';
    if (!editingUser && formData.password.trim().length < 6) errs.password = 'Password must be at least 6 characters';
    if (!formData.role) errs.role = 'Role is required';
    if (!formData.specialisation) errs.specialisation = 'Specialisation is required';
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    if (editingUser) {
      await updateUser(editingUser.id, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        role: formData.role,
        specialisation: formData.specialisation,
      });
    } else {
      await createUserRecord({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password.trim(),
        role: formData.role,
        specialisation: formData.specialisation,
      });

      // Auto-send welcome email to new user
      const name = formData.name.trim();
      const email = formData.email.trim();
      sendWelcomeEmail({ toEmail: email, toName: name })
        .then(() => logAudit('send_email', `Auto: welcome email sent to ${name} <${email}>`))
        .catch(() => {});
    }

    closeForm();
    await loadData();
  }

  async function handleSendWelcome(user) {
    setEmailStatus((prev) => ({ ...prev, [user.id]: 'sending' }));
    try {
      await sendWelcomeEmail({ toEmail: user.email, toName: user.name });
      logAudit('send_email', `Welcome email sent to ${user.name} <${user.email}>`, user.id);
      setEmailStatus((prev) => ({ ...prev, [user.id]: 'sent' }));
      setTimeout(() => setEmailStatus((prev) => { const n = { ...prev }; delete n[user.id]; return n; }), 3000);
    } catch {
      setEmailStatus((prev) => ({ ...prev, [user.id]: 'error' }));
      setTimeout(() => setEmailStatus((prev) => { const n = { ...prev }; delete n[user.id]; return n; }), 3000);
    }
  }

  function confirmDelete(user) { setDeleteTarget(user); }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteUser(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  }

  return (
    <div>
      <div className="page-header">
        <h1>User Management</h1>
        <button className="btn btn-primary" onClick={openAddForm}>Add User</button>
      </div>

      {users.length === 0 ? (
        <div className="empty-state">No users found.</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Specialisation</th>
              <th>Assigned Courses</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td style={{ textTransform: 'capitalize' }}>{user.role}</td>
                <td>{user.specialisation || '—'}</td>
                <td>{getAssignedCourseCount(user.id)}</td>
                <td>
                  <div className="actions-cell">
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditForm(user)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(user)}>Delete</button>
                    {user.email && (
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={emailStatus[user.id] === 'sending'}
                        onClick={() => handleSendWelcome(user)}
                        title="Send welcome email"
                        style={{
                          color: emailStatus[user.id] === 'sent' ? '#16a34a' : emailStatus[user.id] === 'error' ? '#dc2626' : undefined
                        }}
                      >
                        {emailStatus[user.id] === 'sending' ? '...' : emailStatus[user.id] === 'sent' ? '✓ Sent' : emailStatus[user.id] === 'error' ? '✕ Failed' : '✉ Welcome'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="form-overlay" onClick={closeForm}>
          <div className="form-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
            <form onSubmit={handleSubmit} noValidate>

              <div className="form-group">
                <label htmlFor="user-name">Name</label>
                <input id="user-name" type="text"
                  className={errors.name ? 'input-error' : ''}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                {errors.name && <div className="field-error">{errors.name}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="user-email">Email</label>
                <input id="user-email" type="email"
                  className={errors.email ? 'input-error' : ''}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                {errors.email && <div className="field-error">{errors.email}</div>}
              </div>

              {!editingUser && (
                <div className="form-group">
                  <label htmlFor="user-password">Password</label>
                  <input id="user-password" type="password"
                    className={errors.password ? 'input-error' : ''}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 6 characters" />
                  {errors.password && <div className="field-error">{errors.password}</div>}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="user-role">Role</label>
                <select id="user-role"
                  className={errors.role ? 'input-error' : ''}
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="learner">Learner</option>
                  <option value="leadership">Leadership</option>
                </select>
                {errors.role && <div className="field-error">{errors.role}</div>}
              </div>

              <div className="form-group">
                <label htmlFor="user-specialisation">Specialisation</label>
                <select id="user-specialisation"
                  className={errors.specialisation ? 'input-error' : ''}
                  value={formData.specialisation}
                  onChange={(e) => setFormData({ ...formData, specialisation: e.target.value })}>
                  {SPECIALISATIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.specialisation && <div className="field-error">{errors.specialisation}</div>}
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Save Changes' : 'Create User'}
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
            <p>Are you sure you want to delete <strong>{deleteTarget.name}</strong>?</p>
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

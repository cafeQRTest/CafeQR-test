// pages/owner/staff.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useRestaurant } from '../../context/RestaurantContext';
import { getSupabase } from '../../services/supabase';

export default function StaffPage() {
  const { restaurant, role, loading } = useRestaurant();
  const router = useRouter();
  const supabase = getSupabase();

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Only admins allowed here
  useEffect(() => {
    if (loading) return;
    if (!restaurant) return;
    if (role !== 'admin') {
      setError('You do not have permission to manage staff on this restaurant.');
    }
  }, [restaurant, role, loading]);

  async function load() {
    if (!restaurant?.id) return;
    setBusy(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('restaurant_staff')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setError(e.message || 'Failed to load staff');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (restaurant?.id && role === 'admin') load();
  }, [restaurant?.id, role]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const clean = email.trim().toLowerCase();
      const { error } = await supabase.from('restaurant_staff').upsert(
        {
          restaurant_id: restaurant.id,
          staff_email: clean,
          role: newRole,
        },
        { onConflict: 'restaurant_id,staff_email' }
      );
      if (error) throw error;
      setEmail('');
      setNewRole('staff');
      setInfo('Saved staff member.');
      await load();
    } catch (e) {
      setError(e.message || 'Failed to save staff');
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(id, roleValue) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const { error } = await supabase
        .from('restaurant_staff')
        .update({ role: roleValue })
        .eq('id', id);
      if (error) throw error;
      setInfo('Updated role.');
      await load();
    } catch (e) {
      setError(e.message || 'Failed to update role');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this staff access?')) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const { error } = await supabase
        .from('restaurant_staff')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setInfo('Removed staff.');
      await load();
    } catch (e) {
      setError(e.message || 'Failed to remove staff');
    } finally {
      setBusy(false);
    }
  }

  if (role !== 'admin') {
    return (
      <div style={{ padding: 24, color: '#b91c1c' }}>
        You do not have permission to access this page.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginBottom: 12 }}>Team & Access</h2>
      <p style={{ fontSize: 13, color: '#4b5563' }}>
        Add managers and staff by email. They can sign in with their own CafeQR
        account and will get access based on the role you set here.
      </p>

      <form
        onSubmit={handleAdd}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          margin: '16px 0',
          alignItems: 'center',
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="staff@example.com"
          style={{ flex: 2, minWidth: 220, padding: 8, fontSize: 14 }}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          style={{ flex: 1, minWidth: 120, padding: 8, fontSize: 14 }}
        >
          <option value="manager">Manager</option>
          <option value="staff">Staff / Waiter</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            background: '#2563eb',
            color: '#fff',
            borderRadius: 6,
            border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Add / Update'}
        </button>
      </form>

      {error && (
        <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}
      {info && (
        <div style={{ marginBottom: 12, color: '#166534', fontSize: 13 }}>
          {info}
        </div>
      )}

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
          background: '#fff',
        }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>
              Email
            </th>
            <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e5e7eb' }}>
              Role
            </th>
            <th style={{ width: 80, padding: 8, borderBottom: '1px solid #e5e7eb' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                {row.staff_email}
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                <select
                  value={row.role}
                  onChange={(e) => handleRoleChange(row.id, e.target.value)}
                  style={{ padding: 4, fontSize: 13 }}
                >
                  <option value="manager">Manager</option>
                  <option value="staff">Staff</option>
                </select>
              </td>
              <td style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                <button
                  type="button"
                  onClick={() => handleDelete(row.id)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    background: '#fee2e2',
                    color: '#b91c1c',
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} style={{ padding: 12, fontSize: 13, color: '#6b7280' }}>
                No staff added yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

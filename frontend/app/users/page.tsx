'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout';
import { useMe } from '../hooks/useApi';
import {
  AdminUser,
  UserRole,
  listUsers,
  createUser,
  updateUser,
} from '../api/admin';
import { UserPlusIcon, KeyIcon } from '@heroicons/react/24/outline';

export default function UsersPage() {
  const { me, isMaster, isLoading: meLoading } = useMe();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-user form
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setUsers(await listUsers());
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMaster) refresh();
  }, [isMaster]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFormError(null);
    try {
      await createUser({ username, email, password, role });
      setUsername(''); setEmail(''); setPassword(''); setRole('STAFF');
      await refresh();
    } catch (e: any) {
      setFormError(e?.response?.data?.message || e?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (u: AdminUser) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await refresh();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to update user');
    }
  };

  const handleRoleChange = async (u: AdminUser, newRole: UserRole) => {
    if (newRole === u.role) return;
    try {
      await updateUser(u.id, { role: newRole });
      await refresh();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to change role');
    }
  };

  const handleResetPassword = async (u: AdminUser) => {
    const pw = prompt(`Set a new password for ${u.username} (min 6 chars):`);
    if (!pw) return;
    try {
      await updateUser(u.id, { password: pw });
      alert('Password updated.');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to reset password');
    }
  };

  if (!meLoading && !isMaster) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto mt-16 glass-card rounded-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-white mb-2">Access restricted</h1>
          <p className="text-white/40 text-sm">Only master accounts can manage users.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Users</h1>
          <p className="text-white/30 text-sm mt-1">Create and manage admin accounts. Every action is recorded in the Activity Log.</p>
        </div>

        {/* Add user */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlusIcon className="h-5 w-5 text-orange-400" />
            <h2 className="text-sm font-medium text-white/70 uppercase tracking-wider">Add Admin</h2>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Name</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required
                className="glass-input w-full rounded-lg p-2 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="glass-input w-full rounded-lg p-2 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Password</label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                className="glass-input w-full rounded-lg p-2 text-sm" placeholder="min 6 chars" />
            </div>
            <div>
              <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}
                className="glass-input w-full rounded-lg p-2 text-sm">
                <option value="STAFF">Staff</option>
                <option value="MASTER">Master</option>
              </select>
            </div>
            <button type="submit" disabled={creating}
              className="btn-glow px-3 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg transition-all duration-300 disabled:opacity-50">
              {creating ? 'Adding…' : 'Add User'}
            </button>
          </form>
          {formError && <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">{formError}</div>}
          <p className="mt-3 text-[11px] text-white/25">
            <span className="text-white/40 font-medium">Staff</span> can create/edit bookings and take payments.
            <span className="text-white/40 font-medium"> Master</span> can also delete, change prices, and manage users.
          </p>
        </div>

        {/* User list */}
        <div className="glass-card rounded-xl p-5">
          <h2 className="text-sm font-medium text-white/70 uppercase tracking-wider mb-4">All Accounts</h2>
          {loading ? (
            <div className="text-white/30 text-sm py-8 text-center">Loading…</div>
          ) : error ? (
            <div className="text-red-400 text-sm py-8 text-center">{error}</div>
          ) : (
            <div className="overflow-x-auto scrollbar-sleek">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = me && u.id === me.id;
                    return (
                      <tr key={u.id} className="border-b border-white/[0.03] last:border-0">
                        <td className="py-3 pr-4 text-white font-medium">
                          {u.username}{isSelf && <span className="text-white/30 text-xs"> (you)</span>}
                        </td>
                        <td className="py-3 pr-4 text-white/50">{u.email}</td>
                        <td className="py-3 pr-4">
                          <select
                            value={u.role}
                            disabled={!!isSelf}
                            onChange={(e) => handleRoleChange(u, e.target.value as UserRole)}
                            className={`glass-input rounded-lg px-2 py-1 text-xs ${isSelf ? 'opacity-40 cursor-not-allowed' : ''}`}
                          >
                            <option value="STAFF">Staff</option>
                            <option value="MASTER">Master</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            u.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                          }`}>
                            {u.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResetPassword(u)}
                              title="Reset password"
                              className="p-1.5 rounded-lg text-white/40 hover:text-orange-300 hover:bg-white/[0.05] transition-all"
                            >
                              <KeyIcon className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              disabled={!!isSelf}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed text-white/40'
                                  : u.is_active
                                  ? 'text-red-400 border border-red-500/20 hover:bg-red-500/10'
                                  : 'text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10'
                              }`}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

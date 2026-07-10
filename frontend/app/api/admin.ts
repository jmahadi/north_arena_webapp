import api from '../utils/axios';

export type UserRole = 'MASTER' | 'STAFF';

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  is_master: boolean;
  created_at: string | null;
}

export const getMe = async (): Promise<AdminUser> => {
  const res = await api.get('/api/me');
  return res.data.user;
};

export const listUsers = async (): Promise<AdminUser[]> => {
  const res = await api.get('/api/users');
  return res.data.users || [];
};

export const createUser = async (data: {
  username: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<AdminUser> => {
  const form = new FormData();
  form.append('username', data.username);
  form.append('email', data.email);
  form.append('password', data.password);
  form.append('role', data.role);
  const res = await api.post('/api/users', form);
  if (res.data.success === false) throw new Error(res.data.message || 'Failed to create user');
  return res.data.user;
};

export const updateUser = async (
  userId: number,
  data: { role?: UserRole; is_active?: boolean; password?: string }
): Promise<AdminUser> => {
  const form = new FormData();
  if (data.role !== undefined) form.append('role', data.role);
  if (data.is_active !== undefined) form.append('is_active', String(data.is_active));
  if (data.password) form.append('password', data.password);
  const res = await api.patch(`/api/users/${userId}`, form);
  if (res.data.success === false) throw new Error(res.data.message || 'Failed to update user');
  return res.data.user;
};

export interface AuditLogRow {
  id: number;
  actor: string;
  user_id: number | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  summary: string | null;
  details: Record<string, any> | string | null;
  created_at: string | null;
}

export interface AuditLogFilters {
  startDate?: string;
  endDate?: string;
  action?: string;       // comma-separated
  entityType?: string;   // comma-separated
  userId?: number;
  limit?: number;
  offset?: number;
}

export interface AuditLogResponse {
  success: boolean;
  logs: AuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

export const getAuditLogs = async (filters: AuditLogFilters = {}): Promise<AuditLogResponse> => {
  const params: Record<string, string | number> = {};
  if (filters.startDate) params.start_date = filters.startDate;
  if (filters.endDate) params.end_date = filters.endDate;
  if (filters.action) params.action = filters.action;
  if (filters.entityType) params.entity_type = filters.entityType;
  if (filters.userId) params.user_id = filters.userId;
  if (filters.limit) params.limit = filters.limit;
  if (filters.offset) params.offset = filters.offset;
  const res = await api.get('/api/audit-logs', { params });
  return res.data;
};

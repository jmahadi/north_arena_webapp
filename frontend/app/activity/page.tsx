'use client';

import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../components/AdminLayout';
import { useMe } from '../hooks/useApi';
import { AuditLogRow, getAuditLogs } from '../api/admin';

const ENTITY_FILTERS = [
  { key: '', label: 'All' },
  { key: 'booking', label: 'Bookings' },
  { key: 'transaction', label: 'Payments' },
  { key: 'slot_price', label: 'Pricing' },
  { key: 'user', label: 'Users' },
  { key: 'auth', label: 'Logins' },
];

// Colour + label per action family.
function actionStyle(action: string): { label: string; cls: string } {
  const [entity, verb] = action.split('.');
  const map: Record<string, string> = {
    create: 'bg-emerald-500/15 text-emerald-400',
    update: 'bg-blue-500/15 text-blue-300',
    delete: 'bg-red-500/15 text-red-400',
    cancel: 'bg-amber-500/15 text-amber-300',
    restore: 'bg-emerald-500/15 text-emerald-400',
    login: 'bg-white/[0.06] text-white/50',
  };
  return { label: `${entity}·${verb || ''}`.replace(/·$/, ''), cls: map[verb] || 'bg-white/[0.06] text-white/50' };
}

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};

const PAGE_SIZE = 50;

export default function ActivityPage() {
  const { isMaster, isLoading: meLoading } = useMe();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityType, setEntityType] = useState('');
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    try {
      setLoading(true);
      const res = await getAuditLogs({
        startDate, endDate,
        entityType: entityType || undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setTotal(res.total);
      setOffset(nextOffset);
      setLogs((prev) => (append ? [...prev, ...res.logs] : res.logs));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, entityType]);

  useEffect(() => {
    if (isMaster) load(0, false);
  }, [isMaster, load]);

  const fmtTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!meLoading && !isMaster) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto mt-16 glass-card rounded-xl p-8 text-center">
          <h1 className="text-xl font-semibold text-white mb-2">Access restricted</h1>
          <p className="text-white/40 text-sm">Only master accounts can view the activity log.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Activity Log</h1>
          <p className="text-white/30 text-sm mt-1">Who did what, and when. {total > 0 && `${total} events in range.`}</p>
        </div>

        {/* Filters */}
        <div className="glass-card rounded-xl p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="glass-input rounded-lg p-2 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="glass-input rounded-lg p-2 text-sm" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ENTITY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setEntityType(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  entityType === f.key
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Log list */}
        <div className="glass-card rounded-xl p-2 sm:p-4">
          {error ? (
            <div className="text-red-400 text-sm py-8 text-center">{error}</div>
          ) : logs.length === 0 && !loading ? (
            <div className="text-white/25 text-sm py-10 text-center">No activity in this range.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {logs.map((log) => {
                const st = actionStyle(log.action);
                const hasDetails = log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0;
                return (
                  <div key={log.id} className="py-3 px-2">
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold ${st.cls}`}>
                        {st.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-white/90">{log.summary || log.action}</div>
                        <div className="text-[11px] text-white/30 mt-0.5">
                          <span className="text-white/50">{log.actor}</span> · {fmtTime(log.created_at)}
                          {hasDetails && (
                            <button
                              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                              className="ml-2 text-orange-400/70 hover:text-orange-300"
                            >
                              {expanded === log.id ? 'hide' : 'details'}
                            </button>
                          )}
                        </div>
                        {hasDetails && expanded === log.id && (
                          <pre className="mt-2 p-2 bg-black/30 rounded-lg text-[10px] text-white/50 overflow-x-auto scrollbar-sleek">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {loading && <div className="text-white/30 text-sm py-4 text-center">Loading…</div>}

          {!loading && logs.length < total && (
            <div className="pt-3 text-center">
              <button
                onClick={() => load(offset + PAGE_SIZE, true)}
                className="px-4 py-2 text-xs font-medium text-orange-400 rounded-lg border border-orange-500/20 hover:bg-orange-500/10 transition-all"
              >
                Load more ({logs.length}/{total})
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

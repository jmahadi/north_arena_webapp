'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import DashboardCard from '../components/DashboardCard';
import { DashboardData } from '../api/auth';
import Link from 'next/link';
import { useDashboard } from '../hooks/useApi';
import {
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  BanknotesIcon,
  PlusIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';
import dynamic from 'next/dynamic';

// Lazy-load recharts - only downloaded when dashboard actually renders data
const LazyAreaChart = dynamic(() => import('recharts').then(mod => mod.AreaChart), { ssr: false });
const LazyArea = dynamic(() => import('recharts').then(mod => mod.Area), { ssr: false });
const LazyXAxis = dynamic(() => import('recharts').then(mod => mod.XAxis), { ssr: false });
const LazyYAxis = dynamic(() => import('recharts').then(mod => mod.YAxis), { ssr: false });
const LazyCartesianGrid = dynamic(() => import('recharts').then(mod => mod.CartesianGrid), { ssr: false });
const LazyTooltip = dynamic(() => import('recharts').then(mod => mod.Tooltip), { ssr: false });
const LazyResponsiveContainer = dynamic(() => import('recharts').then(mod => mod.ResponsiveContainer), { ssr: false });

// Consistent color palette
const COLORS = {
  primary: '#f97316',      // Orange
  primaryLight: '#fb923c',
  success: '#22c55e',      // Green
  successLight: '#4ade80',
  danger: '#ef4444',       // Red
  dangerLight: '#f87171',
  warning: '#f59e0b',      // Amber
  academy: '#a855f7',      // Purple
  gray: {
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
  }
};

// Payment method colors - consistent with app theme
const PAYMENT_COLORS: Record<string, string> = {
  'Cash': '#22c55e',      // Green
  'bKash': '#f97316',     // Orange (matching app theme)
};

export default function DashboardPage() {
  const { data: dashboardData, isLoading, isRefreshing } = useDashboard();
  const router = useRouter();

  const formatCurrency = (amount: number) => `৳${amount.toFixed(0)}`;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label, valuePrefix = '', valueSuffix = '' }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card rounded-lg px-3 py-2 shadow-2xl border border-white/10">
          <p className="text-white/40 text-xs">{label}</p>
          <p className="text-white font-semibold text-sm">
            {valuePrefix}{typeof payload[0].value === 'number' ? payload[0].value.toLocaleString() : payload[0].value}{valueSuffix}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="relative" style={{ width: 80, height: 80 }}>
            <svg className="animate-spin" style={{ width: 80, height: 80 }} viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth={3} />
              <circle cx="25" cy="25" r="22" fill="none" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeDasharray="34.5 103.6" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src="/images/White-Logomark.png"
                alt="Loading"
                className="w-10 h-10 object-contain animate-fade-in-out"
              />
            </div>
          </div>
          <p className="mt-3 text-white/30 text-sm">Loading dashboard...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!dashboardData) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-white/50">Error loading dashboard data</div>
        </div>
      </AdminLayout>
    );
  }

  // Prepare data for charts
  const revenueChartData = dashboardData.daily_revenue.map(d => ({
    date: formatDate(d.date),
    revenue: d.revenue,
  }));

  const bookingsChartData = dashboardData.daily_bookings.map(d => ({
    date: formatDate(d.date),
    bookings: d.bookings,
  }));

  // Payment breakdown for bar chart
  const paymentChartData = dashboardData.payment_breakdown.map(p => ({
    method: p.method,
    amount: p.amount,
    color: PAYMENT_COLORS[p.method] || COLORS.gray[500],
  }));

  return (
    <AdminLayout>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header with Quick Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2 animate-fadeInUp stagger-1">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1 tracking-tight">Dashboard</h2>
            <p className="text-white/30 text-sm">Last 30 days performance overview</p>
          </div>
          <div className="flex gap-3">
            <Link href="/bookings" className="btn-glow bg-orange-600 hover:bg-orange-500 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all duration-300">
              <PlusIcon className="h-4 w-4" />
              New Booking
            </Link>
            <Link href="/financial-journal" className="glass-card hover:bg-white/[0.06] text-white/70 hover:text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium transition-all duration-300">
              <BanknotesIcon className="h-4 w-4" />
              Journal
            </Link>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeInUp stagger-2">
          <DashboardCard
            title="Today"
            value={dashboardData.todays_bookings.toString()}
            icon={<CalendarIcon className="h-5 w-5" />}
          />
          <DashboardCard
            title="This Month"
            value={dashboardData.bookings_this_month.toString()}
            icon={<UserGroupIcon className="h-5 w-5" />}
          />
          <DashboardCard
            title="Revenue (30d)"
            value={formatCurrency(dashboardData.revenue_last_30_days)}
            change={dashboardData.revenue_change}
            icon={<CurrencyDollarIcon className="h-5 w-5" />}
          />
          <DashboardCard
            title="Avg. Value"
            value={formatCurrency(dashboardData.avg_booking_value)}
            icon={<ArrowTrendingUpIcon className="h-5 w-5" />}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fadeInUp stagger-3">
          {/* Revenue Trend */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider">Revenue Trend</h3>
            <div className="h-64">
              <LazyResponsiveContainer width="100%" height="100%">
                <LazyAreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <LazyCartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <LazyXAxis
                    dataKey="date"
                    stroke="transparent"
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={4}
                  />
                  <LazyYAxis
                    stroke="transparent"
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `৳${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                  />
                  <LazyTooltip content={<CustomTooltip valuePrefix="৳" />} />
                  <LazyArea
                    type="monotone"
                    dataKey="revenue"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </LazyAreaChart>
              </LazyResponsiveContainer>
            </div>
          </div>

          {/* Bookings Trend */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider">Booking Trend</h3>
            <div className="h-64">
              <LazyResponsiveContainer width="100%" height="100%">
                <LazyAreaChart data={bookingsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bookingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <LazyCartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <LazyXAxis
                    dataKey="date"
                    stroke="transparent"
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={4}
                  />
                  <LazyYAxis
                    stroke="transparent"
                    tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <LazyTooltip content={<CustomTooltip valueSuffix=" bookings" />} />
                  <LazyArea
                    type="monotone"
                    dataKey="bookings"
                    stroke={COLORS.success}
                    strokeWidth={2}
                    fill="url(#bookingsGradient)"
                  />
                </LazyAreaChart>
              </LazyResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 animate-fadeInUp stagger-4">
          {/* Popular Time Slots */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-6 uppercase tracking-wider">Popular Slots</h3>
            {dashboardData.popular_time_slots.length > 0 ? (
              <div className="space-y-4">
                {dashboardData.popular_time_slots
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map((slot, index) => {
                    const maxCount = Math.max(...dashboardData.popular_time_slots.map(s => s.count));
                    const percentage = maxCount > 0 ? (slot.count / maxCount) * 100 : 0;
                    const compactTime = slot.time_slot
                      .replace(':00', '')
                      .replace(' AM', '')
                      .replace(' PM', '')
                      .replace(' - ', '-') + (slot.time_slot.includes('PM') ? ' PM' : ' AM');
                    return (
                      <div key={index}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-white/40">{compactTime}</span>
                          <span className="text-xs font-semibold text-white">{slot.count}</span>
                        </div>
                        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full animate-progressFill"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                <div className="pt-3 border-t border-white/[0.06]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/25">Total Bookings</span>
                    <span className="text-sm font-semibold text-gradient-orange">
                      {dashboardData.popular_time_slots.reduce((sum, s) => sum + s.count, 0)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-white/25 text-center py-8 text-sm">No data</div>
            )}
          </div>

          {/* Payment Methods */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-6 uppercase tracking-wider">Payments by Method</h3>
            {paymentChartData.length > 0 ? (
              <div className="space-y-5">
                {paymentChartData.map((payment, index) => {
                  const maxAmount = Math.max(...paymentChartData.map(p => p.amount));
                  const percentage = maxAmount > 0 ? (payment.amount / maxAmount) * 100 : 0;
                  return (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-white/50">{payment.method}</span>
                        <span className="text-sm font-semibold text-white">৳{payment.amount.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full animate-progressFill"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: payment.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4 border-t border-white/[0.06]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/25">Total Collected</span>
                    <span className="text-sm font-semibold text-gradient-orange">
                      ৳{paymentChartData.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-white/25 text-center py-8 text-sm">No payment data</div>
            )}
          </div>

          {/* Transaction Status */}
          <div className="glass-card rounded-xl p-6">
            <h3 className="text-sm font-medium text-white/60 mb-6 uppercase tracking-wider">Payment Status</h3>
            {(dashboardData.completed_transactions > 0 || dashboardData.pending_transactions > 0) ? (
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-white/50">Paid</span>
                    <span className="text-sm font-semibold text-emerald-400">{dashboardData.completed_transactions}</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full animate-progressFill"
                      style={{
                        width: `${(dashboardData.completed_transactions / (dashboardData.completed_transactions + dashboardData.pending_transactions)) * 100}%`
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-white/50">Unpaid</span>
                    <span className="text-sm font-semibold text-red-400">{dashboardData.pending_transactions}</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full animate-progressFill"
                      style={{
                        width: `${(dashboardData.pending_transactions / (dashboardData.completed_transactions + dashboardData.pending_transactions)) * 100}%`
                      }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.06]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/25">Total Bookings</span>
                    <span className="text-sm text-white">{dashboardData.completed_transactions + dashboardData.pending_transactions}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-white/25">Collection Rate</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {((dashboardData.completed_transactions / (dashboardData.completed_transactions + dashboardData.pending_transactions)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-white/25 text-center py-8 text-sm">No status data</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="glass-card rounded-xl p-6 animate-fadeInUp stagger-5">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Recent Activity</h3>
            <Link href="/bookings" className="text-orange-400 hover:text-orange-300 text-sm transition-colors font-medium">View All →</Link>
          </div>
          {dashboardData.recent_bookings.length > 0 ? (
            <div className="space-y-1">
              {dashboardData.recent_bookings.slice(0, 5).map((booking, index) => (
                <div key={index} className="flex justify-between items-center py-3 px-3 rounded-lg table-row-hover border-b border-white/[0.03] last:border-0">
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{booking.name}</div>
                    <div className="text-white/30 text-xs">{booking.time_slot}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white/40 text-xs">{new Date(booking.booking_date).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-white/25 text-center py-8 text-sm">No recent activity</div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeInUp stagger-6">
          <div className="glass-card rounded-xl p-4">
            <div className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Total Bookings</div>
            <div className="text-white text-xl font-semibold">{dashboardData.total_bookings}</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Total Revenue</div>
            <div className="text-white text-xl font-semibold">{formatCurrency(dashboardData.total_revenue)}</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-white/25 text-[10px] uppercase tracking-wider mb-1">This Week</div>
            <div className="text-white text-xl font-semibold">{dashboardData.bookings_last_week}</div>
          </div>
          <div className="glass-card rounded-xl p-4">
            <div className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Daily Avg</div>
            <div className="text-white text-xl font-semibold">{dashboardData.avg_bookings_per_day.toFixed(1)}</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

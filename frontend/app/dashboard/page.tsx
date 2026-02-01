'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import DashboardCard from '../components/DashboardCard';
import { fetchDashboardData, DashboardData } from '../api/auth';
import Cookies from 'js-cookie';
import axios from 'axios';
import Link from 'next/link';
import {
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  BanknotesIcon,
  PlusIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

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
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const formatCurrency = (amount: number) => `৳${amount.toFixed(0)}`;
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    } else {
      fetchData();
    }
  }, [router]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchDashboardData();
      setDashboardData(data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label, valuePrefix = '', valueSuffix = '' }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 shadow-lg">
          <p className="text-gray-400 text-xs">{label}</p>
          <p className="text-white font-medium">
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
          <div className="relative" style={{ width: 64, height: 64 }}>
            <svg className="animate-spin" style={{ width: 64, height: 64 }} viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(249, 115, 22, 0.3)" strokeWidth={4} />
              <circle cx="25" cy="25" r="20" fill="none" stroke="#f97316" strokeWidth={4} strokeLinecap="round" strokeDasharray="31.4 94.2" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="animate-pulse" style={{ width: 32, height: 32 }} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" fill="none" />
                <circle cx="12" cy="12" r="3" fill="white" />
              </svg>
            </div>
          </div>
          <p className="mt-3 text-gray-400 text-sm">Loading dashboard...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!dashboardData) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-white">Error loading dashboard data</div>
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

  // Status data for pie chart
  const statusData = [
    { name: 'Completed', value: dashboardData.completed_transactions, color: COLORS.success },
    { name: 'Pending', value: dashboardData.pending_transactions, color: COLORS.danger },
  ];

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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>
            <p className="text-gray-500">Last 30 days performance overview</p>
          </div>
          <div className="flex gap-3">
            <Link href="/bookings" className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-md flex items-center gap-2 transition-all duration-200 hover:shadow-lg">
              <PlusIcon className="h-4 w-4" />
              New Booking
            </Link>
            <Link href="/transactions" className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-all duration-200 hover:shadow-lg">
              <BanknotesIcon className="h-4 w-4" />
              Transaction
            </Link>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard
            title="Today"
            value={dashboardData.todays_bookings.toString()}
            icon={<CalendarIcon className="h-6 w-6 text-primary" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
          <DashboardCard
            title="This Month"
            value={dashboardData.bookings_this_month.toString()}
            icon={<UserGroupIcon className="h-6 w-6 text-success" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
          <DashboardCard
            title="Revenue (30d)"
            value={formatCurrency(dashboardData.revenue_last_30_days)}
            change={dashboardData.revenue_change}
            icon={<CurrencyDollarIcon className="h-6 w-6 text-primary" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
          <DashboardCard
            title="Avg. Value"
            value={formatCurrency(dashboardData.avg_booking_value)}
            icon={<ArrowTrendingUpIcon className="h-6 w-6 text-success" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
        </div>

        {/* Charts Section - Line Charts with Gradient */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Trend - Area Chart */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Revenue Trend (30 Days)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gray[800]} vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke={COLORS.gray[500]}
                    tick={{ fill: COLORS.gray[500], fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.gray[700] }}
                    interval={4}
                  />
                  <YAxis
                    stroke={COLORS.gray[500]}
                    tick={{ fill: COLORS.gray[500], fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `৳${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                  />
                  <Tooltip content={<CustomTooltip valuePrefix="৳" />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={COLORS.primary}
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bookings Trend - Area Chart */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Booking Trend (30 Days)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={bookingsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bookingsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.4}/>
                      <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.gray[800]} vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke={COLORS.gray[500]}
                    tick={{ fill: COLORS.gray[500], fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: COLORS.gray[700] }}
                    interval={4}
                  />
                  <YAxis
                    stroke={COLORS.gray[500]}
                    tick={{ fill: COLORS.gray[500], fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip valueSuffix=" bookings" />} />
                  <Area
                    type="monotone"
                    dataKey="bookings"
                    stroke={COLORS.success}
                    strokeWidth={2}
                    fill="url(#bookingsGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Popular Time Slots - Minimalistic Bars */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-6">Popular Slots</h3>
            {dashboardData.popular_time_slots.length > 0 ? (
              <div className="space-y-4">
                {dashboardData.popular_time_slots
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map((slot, index) => {
                    const maxCount = Math.max(...dashboardData.popular_time_slots.map(s => s.count));
                    const percentage = maxCount > 0 ? (slot.count / maxCount) * 100 : 0;
                    // Compact time format: "9:00 PM - 10:30 PM" -> "9-10:30 PM"
                    const compactTime = slot.time_slot
                      .replace(':00', '')
                      .replace(' AM', '')
                      .replace(' PM', '')
                      .replace(' - ', '-') + (slot.time_slot.includes('PM') ? ' PM' : ' AM');
                    return (
                      <div key={index}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs text-gray-400">{compactTime}</span>
                          <span className="text-xs font-medium text-white">{slot.count}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                {/* Total */}
                <div className="pt-3 border-t border-gray-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Total Bookings</span>
                    <span className="text-sm font-medium text-orange-400">
                      {dashboardData.popular_time_slots.reduce((sum, s) => sum + s.count, 0)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8 text-sm">No data</div>
            )}
          </div>

          {/* Payment Methods - Minimalistic Bars */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-6">Payments by Method</h3>
            {paymentChartData.length > 0 ? (
              <div className="space-y-5">
                {paymentChartData.map((payment, index) => {
                  const maxAmount = Math.max(...paymentChartData.map(p => p.amount));
                  const percentage = maxAmount > 0 ? (payment.amount / maxAmount) * 100 : 0;
                  return (
                    <div key={index}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-gray-400">{payment.method}</span>
                        <span className="text-sm font-medium text-white">৳{payment.amount.toLocaleString()}</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: payment.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Total */}
                <div className="pt-4 border-t border-gray-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Total Collected</span>
                    <span className="text-sm font-medium text-orange-400">
                      ৳{paymentChartData.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8 text-sm">No payment data</div>
            )}
          </div>

          {/* Transaction Status - Minimalistic Bars */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-6">Payment Status</h3>
            {(dashboardData.completed_transactions > 0 || dashboardData.pending_transactions > 0) ? (
              <div className="space-y-5">
                {/* Completed/Paid */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Paid</span>
                    <span className="text-sm font-medium text-green-400">{dashboardData.completed_transactions}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${(dashboardData.completed_transactions / (dashboardData.completed_transactions + dashboardData.pending_transactions)) * 100}%`
                      }}
                    />
                  </div>
                </div>

                {/* Pending/Unpaid */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Unpaid</span>
                    <span className="text-sm font-medium text-red-400">{dashboardData.pending_transactions}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${(dashboardData.pending_transactions / (dashboardData.completed_transactions + dashboardData.pending_transactions)) * 100}%`
                      }}
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="pt-4 border-t border-gray-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Total Bookings</span>
                    <span className="text-sm text-white">{dashboardData.completed_transactions + dashboardData.pending_transactions}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-gray-500">Collection Rate</span>
                    <span className="text-sm text-green-400">
                      {((dashboardData.completed_transactions / (dashboardData.completed_transactions + dashboardData.pending_transactions)) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8 text-sm">No status data</div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-white">Recent Activity</h3>
            <Link href="/bookings" className="text-primary hover:text-primary-light text-sm transition-colors">View All →</Link>
          </div>
          {dashboardData.recent_bookings.length > 0 ? (
            <div className="space-y-3">
              {dashboardData.recent_bookings.slice(0, 5).map((booking, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-800/50 last:border-0">
                  <div className="flex-1">
                    <div className="text-gray-300 text-sm font-medium">{booking.name}</div>
                    <div className="text-gray-500 text-xs">{booking.time_slot}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-400 text-xs">{new Date(booking.booking_date).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-8 text-sm">No recent activity</div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-black/20 border border-gray-800/50 rounded-lg p-4">
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Total Bookings</div>
            <div className="text-white text-xl font-light">{dashboardData.total_bookings}</div>
          </div>
          <div className="bg-black/20 border border-gray-800/50 rounded-lg p-4">
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Total Revenue</div>
            <div className="text-white text-xl font-light">{formatCurrency(dashboardData.total_revenue)}</div>
          </div>
          <div className="bg-black/20 border border-gray-800/50 rounded-lg p-4">
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">This Week</div>
            <div className="text-white text-xl font-light">{dashboardData.bookings_last_week}</div>
          </div>
          <div className="bg-black/20 border border-gray-800/50 rounded-lg p-4">
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Daily Avg</div>
            <div className="text-white text-xl font-light">{dashboardData.avg_bookings_per_day.toFixed(1)}</div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

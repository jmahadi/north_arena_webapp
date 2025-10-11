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
  ChartPieIcon, 
  CalendarIcon, 
  CurrencyDollarIcon, 
  UserGroupIcon,
  ClockIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ArrowTrendingUpIcon
} from '@heroicons/react/24/outline';

const COLORS = ['#f97316', '#10b981', '#ef4444', '#6b7280', '#374151'];

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const formatCurrency = (amount: number) => `৳${amount.toFixed(2)}`;
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

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-white">Loading...</div>
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

  return (
    <AdminLayout>
      <div className="container mx-auto p-4 space-y-6">
        {/* Header with Quick Actions */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>
            <p className="text-gray-500">Arena performance overview</p>
          </div>
          <div className="flex gap-3">
            <Link href="/bookings" className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md flex items-center gap-2 transition-all duration-200 hover:shadow-lg">
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
            icon={<CalendarIcon className="h-6 w-6 text-orange-500" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
          <DashboardCard
            title="This Month"
            value={dashboardData.bookings_this_month.toString()}
            icon={<UserGroupIcon className="h-6 w-6 text-green-500" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
          <DashboardCard
            title="Revenue (30d)"
            value={formatCurrency(dashboardData.revenue_last_30_days)}
            change={dashboardData.revenue_change}
            icon={<CurrencyDollarIcon className="h-6 w-6 text-orange-500" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
          <DashboardCard
            title="Avg. Value"
            value={formatCurrency(dashboardData.avg_booking_value)}
            icon={<ArrowTrendingUpIcon className="h-6 w-6 text-green-500" />}
            bgColor="bg-gray-900/50 border-gray-800"
          />
        </div>

        {/* Charts Section - Minimal visual representations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Trend */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Revenue Trend</h3>
            <div className="space-y-4">
              {dashboardData.daily_revenue.map((day, index) => {
                const maxRevenue = Math.max(...dashboardData.daily_revenue.map(d => d.revenue));
                const percentage = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="text-gray-500 text-xs w-12">{formatDate(day.date)}</span>
                    <div className="flex-1">
                      <div className="w-full bg-gray-800 rounded-sm h-1.5">
                        <div 
                          className="bg-orange-500 h-1.5 rounded-sm transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-gray-300 text-xs w-16 text-right">{formatCurrency(day.revenue)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bookings Trend */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Booking Trend</h3>
            <div className="space-y-4">
              {dashboardData.daily_bookings.map((day, index) => {
                const maxBookings = Math.max(...dashboardData.daily_bookings.map(d => d.bookings));
                const percentage = maxBookings > 0 ? (day.bookings / maxBookings) * 100 : 0;
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="text-gray-500 text-xs w-12">{formatDate(day.date)}</span>
                    <div className="flex-1">
                      <div className="w-full bg-gray-800 rounded-sm h-1.5">
                        <div 
                          className="bg-green-500 h-1.5 rounded-sm transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-gray-300 text-xs w-8 text-right">{day.bookings}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Popular Time Slots */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Popular Slots</h3>
            <div className="space-y-3">
              {dashboardData.popular_time_slots.slice(0, 4).map((slot, index) => {
                const maxCount = Math.max(...dashboardData.popular_time_slots.map(s => s.count));
                const percentage = maxCount > 0 ? (slot.count / maxCount) * 100 : 0;
                return (
                  <div key={slot.time_slot} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-xs">{slot.time_slot}</span>
                      <span className="text-gray-300 text-xs font-medium">{slot.count}</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-sm h-1">
                      <div 
                        className="bg-orange-500 h-1 rounded-sm transition-all duration-500" 
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Methods */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Payments</h3>
            {dashboardData.payment_breakdown.length > 0 ? (
              <div className="space-y-3">
                {dashboardData.payment_breakdown.map((method, index) => {
                  const totalAmount = dashboardData.payment_breakdown.reduce((sum, m) => sum + m.amount, 0);
                  const percentage = totalAmount > 0 ? (method.amount / totalAmount) * 100 : 0;
                  return (
                    <div key={method.method} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-gray-400 text-xs">{method.method}</span>
                        </div>
                        <span className="text-gray-300 text-xs font-medium">{formatCurrency(method.amount)}</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-sm h-1">
                        <div 
                          className="h-1 rounded-sm transition-all duration-500" 
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: COLORS[index % COLORS.length]
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-8 text-sm">No data</div>
            )}
          </div>

          {/* Transaction Status */}
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-4">Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-green-500/10 border border-green-500/20 rounded">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-green-400 text-sm">Completed</span>
                </div>
                <span className="text-green-400 font-medium">{dashboardData.completed_transactions}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-500/10 border border-red-500/20 rounded">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-red-400 text-sm">Pending</span>
                </div>
                <span className="text-red-400 font-medium">{dashboardData.pending_transactions}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-white">Recent Activity</h3>
            <Link href="/bookings" className="text-orange-500 hover:text-orange-400 text-sm transition-colors">View All →</Link>
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
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Total</div>
            <div className="text-white text-xl font-light">{dashboardData.total_bookings}</div>
          </div>
          <div className="bg-black/20 border border-gray-800/50 rounded-lg p-4">
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Revenue</div>
            <div className="text-white text-xl font-light">{formatCurrency(dashboardData.total_revenue)}</div>
          </div>
          <div className="bg-black/20 border border-gray-800/50 rounded-lg p-4">
            <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Week</div>
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
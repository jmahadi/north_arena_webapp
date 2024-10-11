'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardCard from '../components/DashboardCard';
import { fetchDashboardData, logout } from '../api/auth';
import { 
  ChartPieIcon, 
  CalendarIcon, 
  CurrencyDollarIcon, 
  UserGroupIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

interface DashboardData {
  bookings_this_month: number;
  upcoming_bookings: number;
  revenue_this_month: number;
  revenue_change: number;
  avg_bookings_per_day: number;
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching dashboard data...');
        const data = await fetchDashboardData();
        console.log('Dashboard data received:', data);
        setDashboardData(data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };

    fetchData();
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!dashboardData) {
    return <div className="text-white text-center mt-10">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-[#232323]">
      {/* Sidebar */}
      <div className="w-64 bg-[#333333] text-white p-6">
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
        <nav>
          <a href="#" className="block py-2 px-4 rounded hover:bg-[#444444] mb-2">Overview</a>
          <a href="#" className="block py-2 px-4 rounded hover:bg-[#444444] mb-2">Bookings</a>
          <a href="#" className="block py-2 px-4 rounded hover:bg-[#444444] mb-2">Transactions</a>
          <a href="#" className="block py-2 px-4 rounded hover:bg-[#444444] mb-2">Settings</a>
        </nav>
        <button
          onClick={handleLogout}
          className="mt-6 w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#DC6000] hover:bg-[#FF7000] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DC6000]"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
          Logout
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 p-10 overflow-y-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Overview</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard
            title="Bookings This Month"
            value={dashboardData.bookings_this_month}
            icon={<CalendarIcon className="h-8 w-8 text-[#DC6000]" />}
          />
          <DashboardCard
            title="Upcoming Bookings"
            value={dashboardData.upcoming_bookings}
            icon={<UserGroupIcon className="h-8 w-8 text-[#DC6000]" />}
          />
          <DashboardCard
            title="Revenue This Month"
            value={`$${dashboardData.revenue_this_month.toFixed(2)}`}
            change={dashboardData.revenue_change}
            icon={<CurrencyDollarIcon className="h-8 w-8 text-[#DC6000]" />}
          />
          <DashboardCard
            title="Avg. Daily Bookings"
            value={dashboardData.avg_bookings_per_day.toFixed(2)}
            icon={<ChartPieIcon className="h-8 w-8 text-[#DC6000]" />}
          />
        </div>
      </div>
    </div>
  );
}
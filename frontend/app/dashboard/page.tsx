'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import DashboardCard from '../components/DashboardCard';
import { fetchDashboardData } from '../api/auth';
import Cookies from 'js-cookie';
import axios from 'axios';
import { 
  ChartPieIcon, 
  CalendarIcon, 
  CurrencyDollarIcon, 
  UserGroupIcon,
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
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

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
    return <div>Loading...</div>;
  }

  if (!dashboardData) {
    return <div>Error loading dashboard data</div>;
  }


  return (
    <AdminLayout>
      <div className="container mx-auto p-4">
        <h2 className="text-3xl font-bold text-white mb-8">Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DashboardCard
            title="Bookings This Month"
            value={dashboardData.bookings_this_month}
            icon={<CalendarIcon className="h-8 w-8 text-primary" />}
          />
          <DashboardCard
            title="Upcoming Bookings"
            value={dashboardData.upcoming_bookings}
            icon={<UserGroupIcon className="h-8 w-8 text-primary" />}
          />
          <DashboardCard
            title="Revenue This Month"
            value={`$${dashboardData.revenue_this_month.toFixed(2)}`}
            change={dashboardData.revenue_change}
            icon={<CurrencyDollarIcon className="h-8 w-8 text-primary" />}
          />
          <DashboardCard
            title="Avg. Daily Bookings"
            value={dashboardData.avg_bookings_per_day.toFixed(2)}
            icon={<ChartPieIcon className="h-8 w-8 text-primary" />}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
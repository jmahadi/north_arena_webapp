'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import DashboardCard from '../components/DashboardCard';
import { fetchDashboardData, logout } from '../api/auth';
import { 
  ChartPieIcon, 
  CalendarIcon, 
  CurrencyDollarIcon, 
  UserGroupIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState('Overview');
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchDashboardData();
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
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-surface bg-opacity-70 p-4 flex justify-between items-center">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white lg:hidden">
          <Bars3Icon className="h-6 w-6" />
        </button>
        <div className="flex items-center">
          <Image
            src="/images/White-Logomark.png"  // Update this path to your actual icon
            alt="Company Icon"
            width={32}
            height={32}
            className="mr-2"
          />
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        </div>
        <div></div> {/* Empty div for flex spacing */}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`bg-surface bg-opacity-95 w-64 p-6 transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 lg:translate-x-0 lg:static`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Menu</h2>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
          <nav className="space-y-2">
            {['Overview', 'Bookings', 'Transactions', 'Settings'].map((item) => (
              <a
                key={item}
                href="#"
                className={`block py-2 px-4 rounded transition-colors duration-200 ${
                  activeMenu === item ? 'bg-primary text-white' : 'text-white hover:bg-primary hover:bg-opacity-50'
                }`}
                onClick={() => setActiveMenu(item)}
              >
                {item}
              </a>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="mt-6 w-full flex items-center justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
            Logout
          </button>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto">
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
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-surface bg-opacity-70 p-4 text-center text-white text-sm">
        <p>&copy; 2023 Your Company Name. All rights reserved.</p>
        <p>Contact: support@yourcompany.com | Phone: (123) 456-7890</p>
      </footer>
    </div>
  );
}
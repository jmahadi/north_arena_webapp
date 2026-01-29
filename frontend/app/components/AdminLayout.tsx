'use client';

import React, { ReactNode, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { logout } from '../api/auth';
import { 
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="bg-surface bg-opacity-70 p-4 flex justify-between items-center">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white lg:hidden">
          <Bars3Icon className="h-6 w-6" />
        </button>
        <div className="flex items-center">
          <Image
            src="/images/White-Logomark.png"
            alt="Company Icon"
            width={32}
            height={32}
            className="mr-2"
          />
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
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
          <nav className="space-y-1">
            <Link href="/dashboard" className="block py-3 px-4 rounded-md transition-colors duration-200 text-gray-300 hover:bg-orange-600/20 hover:text-white border-l-2 border-transparent hover:border-orange-500">
              Dashboard
            </Link>
            <Link href="/bookings" className="block py-3 px-4 rounded-md transition-colors duration-200 text-gray-300 hover:bg-orange-600/20 hover:text-white border-l-2 border-transparent hover:border-orange-500">
              Bookings
            </Link>
            <Link href="/financial-journal" className="block py-3 px-4 rounded-md transition-colors duration-200 text-gray-300 hover:bg-orange-600/20 hover:text-white border-l-2 border-transparent hover:border-orange-500">
              Financial Journal
            </Link>
            <Link href="/slot-prices" className="block py-3 px-4 rounded-md transition-colors duration-200 text-gray-300 hover:bg-orange-600/20 hover:text-white border-l-2 border-transparent hover:border-orange-500">
              Slots & Prices
            </Link>
          </nav>
          <button
            onClick={handleLogout}
            className="mt-6 w-full flex items-center justify-center py-3 px-4 border border-gray-700 rounded-md text-sm font-medium text-gray-300 bg-gray-800/50 hover:bg-red-600/20 hover:text-red-400 hover:border-red-500/30 transition-colors focus:outline-none"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
            Logout
          </button>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
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
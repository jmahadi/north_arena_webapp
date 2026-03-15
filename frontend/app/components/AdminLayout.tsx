'use client';

import React, { ReactNode, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { logout } from '../api/auth';
import ParticlesBackground from './ParticlesBackground';
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/bookings', label: 'Bookings', icon: CalendarDaysIcon },
  { href: '/financial-journal', label: 'Financial Journal', icon: BanknotesIcon },
  { href: '/slot-prices', label: 'Slots & Prices', icon: CurrencyDollarIcon },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen relative">
      <ParticlesBackground />

      {/* Header */}
      <header className="glass-nav sticky top-0 z-40 px-6 py-3 flex justify-between items-center">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white/70 hover:text-white lg:hidden transition-colors">
          <Bars3Icon className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/20 blur-lg rounded-full" />
            <Image
              src="/images/White-Logomark.png"
              alt="Company Icon"
              width={32}
              height={32}
              className="relative"
            />
          </div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            North <span className="text-gradient-orange">Arena</span>
          </h1>
        </div>
        <div className="text-xs text-white/30 hidden sm:block">Admin Panel</div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden modal-backdrop"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`glass-sidebar w-64 p-5 transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-50 lg:translate-x-0 lg:static`}>
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-sm font-medium text-white/40 uppercase tracking-widest">Navigation</h2>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white/50 hover:text-white transition-colors">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      : 'text-white/50 hover:bg-white/[0.03] hover:text-white/80 border border-transparent'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 transition-colors ${isActive ? 'text-orange-400' : 'text-white/30 group-hover:text-white/60'}`} />
                  <span className="text-sm font-medium">{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-orange-400" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg text-sm font-medium text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 border border-transparent hover:border-red-500/20"
            >
              <ArrowRightOnRectangleIcon className="h-4.5 w-4.5" />
              Logout
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto relative z-10">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer className="glass-nav relative z-10 py-3 px-6 text-center">
        <p className="text-white/20 text-xs">&copy; 2024 North Arena. All rights reserved.</p>
      </footer>
    </div>
  );
}

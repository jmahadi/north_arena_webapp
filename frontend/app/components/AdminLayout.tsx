'use client';

import React, { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { logout } from '../api/auth';
import dynamic from 'next/dynamic';
import {
  ArrowRightOnRectangleIcon,
  HomeIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline';

// Lazy-load the particle animation - not critical for initial page render
const ParticlesBackground = dynamic(() => import('./ParticlesBackground'), {
  ssr: false,
  loading: () => null,
});

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
        <div className="lg:hidden w-6" /> {/* Spacer for mobile layout balance */}
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
        {/* Sidebar - desktop only */}
        <aside className="glass-sidebar w-64 p-5 hidden lg:block">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-sm font-medium text-white/40 uppercase tracking-widest">Navigation</h2>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-200 group ${
                    isActive
                      ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      : 'text-white/50 hover:bg-white/[0.03] hover:text-white/80 border border-transparent'
                  }`}
                >
                  <Icon className={`h-5 w-5 flex-shrink-0 transition-colors ${isActive ? 'text-orange-400' : 'text-white/30 group-hover:text-white/60'}`} />
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
              <ArrowRightOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
              Logout
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-y-auto relative z-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-white/[0.06] flex justify-around items-center py-2 px-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 ${
                isActive ? 'text-orange-400' : 'text-white/40'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label === 'Financial Journal' ? 'Finance' : item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-white/40 hover:text-red-400 transition-all duration-200"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          <span className="text-[10px] font-medium">Logout</span>
        </button>
      </nav>

      {/* Footer - hidden on mobile since we have bottom nav */}
      <footer className="glass-nav relative z-10 py-3 px-6 text-center hidden lg:block">
        <p className="text-white/20 text-xs">&copy; 2024 North Arena. All rights reserved.</p>
      </footer>

      {/* Bottom padding spacer for mobile nav */}
      <div className="h-16 lg:hidden" />
    </div>
  );
}

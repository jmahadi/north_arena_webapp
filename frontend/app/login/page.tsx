'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import LoginForm from '../components/LoginForm';
import ParticlesBackground from '../components/ParticlesBackground';
import { useSearchParams } from 'next/navigation';

const LoginContent = () => {
  // NEW: Added state for session expiration message
  const [message, setMessage] = useState<string | null>(null);

  // NEW: Added searchParams to check for expired session
  const searchParams = useSearchParams();

  // NEW: Added useEffect to check for expired query parameter
  useEffect(() => {
    const expired = searchParams?.get('expired');
    if (expired === 'true') {
      setMessage('Your session has expired. Please login again.');
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative">
      <ParticlesBackground />

      <div className="relative z-10 animate-scaleIn">
        <div className="glass-card rounded-2xl p-8 w-full max-w-sm glow-orange">
          {/* Logo glow effect */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full scale-150" />
              <Image
                src="/images/White-Logomark.png"
                alt="North Arena"
                width={48}
                height={48}
                className="relative"
              />
            </div>
          </div>

          <h2 className="text-xl font-semibold text-center text-white mb-1">
            Welcome Back
          </h2>
          <p className="text-center text-white/30 text-sm mb-6">Sign in to North Arena</p>

         {/* NEW: Added message display for expired sessions */}
         {message && (
            <div className="p-3 mb-4 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              {message}
            </div>
          )}

          <LoginForm />
        </div>
      </div>

      <div className="mt-8 relative z-10 animate-fadeIn" style={{ animationDelay: '0.3s', opacity: 0 }}>
        <Image
          src="/images/White-Full-Logo.png"
          alt="North Arena Logo"
          width={120}
          height={40}
          className="opacity-30"
        />
      </div>
    </div>
  );
};

const LoginPage = () => {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#050508]">
        <div className="relative" style={{ width: 48, height: 48 }}>
          <svg className="animate-spin" style={{ width: 48, height: 48 }} viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth={3} />
            <circle cx="25" cy="25" r="22" fill="none" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeDasharray="34.5 103.6" />
          </svg>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
};

export default LoginPage;

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import LoginForm from '../components/LoginForm';
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="bg-black/40 border border-gray-800 p-6 rounded-lg shadow-lg w-full max-w-sm">
        <h2 className="text-2xl font-semibold text-center text-white mb-4">
          Sign In
        </h2>

       {/* NEW: Added message display for expired sessions */}
       {message && (
          <div className="p-3 mb-3 text-xs text-yellow-300 bg-yellow-900 bg-opacity-30 border border-yellow-800 rounded-lg">
            {message}
          </div>
        )}

        <LoginForm />
      </div>
      <div className="mt-6">
        <Image
          src="/images/White-Full-Logo.png"  // Update this path to your actual logo file
          alt="North Arena Logo"
          width={120}  // Adjust as needed
          height={40}  // Adjust as needed
        />
      </div>
    </div>
  );
};

const LoginPage = () => {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
};

export default LoginPage;

'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import LoginForm from '../components/LoginForm';
import { useSearchParams } from 'next/navigation';

const LoginPage = () => {

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
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="bg-surface p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold text-center text-white mb-6">
          Sign In
        </h2>

       {/* NEW: Added message display for expired sessions */}
       {message && (
          <div className="p-4 mb-4 text-sm text-yellow-300 bg-yellow-900 bg-opacity-30 border border-yellow-800 rounded-lg">
            {message}
          </div>
        )}

        <LoginForm />
      </div>
      <div className="mt-8">
        <Image
          src="/images/White-Full-Logo.png"  // Update this path to your actual logo file
          alt="North Arena Logo"
          width={150}  // Adjust as needed
          height={50}  // Adjust as needed
        />
      </div>
    </div>
  );
};

export default LoginPage;
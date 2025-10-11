'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../api/auth';
import Cookies from 'js-cookie';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  // NEW: Added loading state
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // NEW: Check for saved redirect path
  useEffect(() => {
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');
    if (redirectPath) {
      console.log('User will be redirected to', redirectPath, 'after login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // NEW: Set loading state
    setIsLoading(true);

    try {
      console.log('Attempting login...');
      const data = await login(email, password);
      console.log('Login successful:', data);

      // CHANGED: Updated token expiration to match backend (1 hour = 1/24 days)
      Cookies.set('token', data.access_token, { 
        expires: 1/24,  // 1 hour
        sameSite: 'strict' 
      });
      console.log('Token stored in cookie');
      


      // NEW: Handle redirect after login
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');
      if (redirectPath) {
        sessionStorage.removeItem('redirectAfterLogin');
        console.log('Redirecting to:', redirectPath);
        router.push(redirectPath);
      } else {
        console.log('Redirecting to dashboard...');
        router.push('/dashboard');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.response) {
        setError(`Error ${error.response.status}: ${error.response.data.detail || 'An error occurred'}`);
      } else if (error.request) {
        setError('No response received from server. Please try again.');
      } else {
        setError('An error occurred. Please try again.');
      }
    } finally {
      // NEW: Reset loading state
      setIsLoading(false);
    }

  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300">
          Email
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-[#444444] border border-[#555555] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#DC6000]"
          required
          // NEW: Disable input during loading
          disabled={isLoading}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-300">
          Password
        </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full px-3 py-2 bg-[#444444] border border-[#555555] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[#DC6000]"
          required
          // NEW: Disable input during loading
          disabled={isLoading}          
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#DC6000] hover:bg-[#FF7000] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DC6000]"
        // NEW: Disable input during loading
        disabled={isLoading} 
      >
        {/* NEW: Show loading state in button */}
        {isLoading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
};

export default LoginForm;
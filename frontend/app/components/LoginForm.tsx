'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../api/auth';
import Cookies from 'js-cookie';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const redirectPath = sessionStorage.getItem('redirectAfterLogin');
    if (redirectPath) {
      console.log('User will be redirected to', redirectPath, 'after login');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      console.log('Attempting login...');
      const data = await login(email, password);
      console.log('Login successful:', data);

      Cookies.set('token', data.access_token, {
        expires: 1/24,
        sameSite: 'strict'
      });
      console.log('Token stored in cookie');

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
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
          Email
        </label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="glass-input block w-full px-3 py-2.5 rounded-lg text-sm"
          placeholder="admin@northarena.com"
          required
          disabled={isLoading}
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-white/40 mb-1.5 uppercase tracking-wider">
          Password
        </label>
        <input
          type="password"
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="glass-input block w-full px-3 py-2.5 rounded-lg text-sm"
          placeholder="Enter your password"
          required
          disabled={isLoading}
        />
      </div>
      {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-2">{error}</p>}
      <button
        type="submit"
        className="btn-glow w-full flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium text-white bg-orange-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Signing in...
          </>
        ) : 'Sign In'}
      </button>
    </form>
  );
};

export default LoginForm;

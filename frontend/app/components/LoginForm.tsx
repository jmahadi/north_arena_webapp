'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '../api/auth';
import Cookies from 'js-cookie';

const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      console.log('Attempting login...');
      const data = await login(email, password);
      console.log('Login successful:', data);
      
      Cookies.set('token', data.access_token, { expires: 1 });
      console.log('Token stored in cookie');

      console.log('Redirecting to dashboard...');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.response) {
        setError(`Error ${error.response.status}: ${error.response.data.detail || 'An error occurred'}`);
      } else if (error.request) {
        setError('No response received from server. Please try again.');
      } else {
        setError('An error occurred. Please try again.');
      }
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
        />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#DC6000] hover:bg-[#FF7000] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#DC6000]"
      >
        Sign In
      </button>
    </form>
  );
};

export default LoginForm;
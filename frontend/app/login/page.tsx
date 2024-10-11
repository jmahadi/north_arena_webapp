import React from 'react';
import Image from 'next/image';
import LoginForm from '../components/LoginForm';

const LoginPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="bg-surface p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold text-center text-white mb-6">
          Sign In
        </h2>
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
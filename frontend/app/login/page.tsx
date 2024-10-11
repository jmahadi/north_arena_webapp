import React from 'react';
import LoginForm from '../components/LoginForm';

const LoginPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#232323] bg-opacity-80">
      <div className="bg-[#333333] p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-3xl font-bold text-center text-white mb-6">
          Sign in to your account
        </h2>
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;
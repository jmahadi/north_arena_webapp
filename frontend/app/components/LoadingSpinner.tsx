'use client';

import React from 'react';
import Image from 'next/image';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  text = 'Loading...',
  fullScreen = false
}) => {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-16 h-16',
    large: 'w-24 h-24',
  };

  const containerClasses = fullScreen
    ? 'fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50'
    : 'flex flex-col items-center justify-center p-4';

  return (
    <div className={containerClasses}>
      {/* Logo with pulse animation */}
      <div className={`relative ${sizeClasses[size]}`}>
        {/* Spinning ring */}
        <div className="absolute inset-0 rounded-full border-4 border-orange-500/30 border-t-orange-500 animate-spin"></div>

        {/* Logo in center */}
        <div className="absolute inset-2 flex items-center justify-center">
          <Image
            src="/images/White-Logomark.png"
            alt="North Arena"
            width={size === 'small' ? 24 : size === 'medium' ? 40 : 64}
            height={size === 'small' ? 24 : size === 'medium' ? 40 : 64}
            className="animate-pulse"
          />
        </div>
      </div>

      {/* Loading text */}
      {text && (
        <p className="mt-4 text-gray-400 text-sm animate-pulse">{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;

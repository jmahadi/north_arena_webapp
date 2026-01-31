'use client';

import React from 'react';

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
  const sizeConfig = {
    small: { container: 'w-12 h-12', logo: 'w-6 h-6', border: 'border-2' },
    medium: { container: 'w-20 h-20', logo: 'w-10 h-10', border: 'border-4' },
    large: { container: 'w-28 h-28', logo: 'w-14 h-14', border: 'border-4' },
  };

  const config = sizeConfig[size];

  const containerClasses = fullScreen
    ? 'fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50'
    : 'flex flex-col items-center justify-center p-4';

  return (
    <div className={containerClasses}>
      {/* Spinner container */}
      <div className={`relative ${config.container}`}>
        {/* Spinning ring */}
        <div
          className={`absolute inset-0 rounded-full ${config.border} border-orange-500/30 border-t-orange-500 animate-spin`}
        />

        {/* Logo in center - using img tag for reliability */}
        <div className="absolute inset-0 flex items-center justify-center p-2">
          <img
            src="/images/White-Logomark.png"
            alt="North Arena"
            className={`${config.logo} object-contain animate-pulse`}
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

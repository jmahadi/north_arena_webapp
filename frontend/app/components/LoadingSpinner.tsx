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
    small: { spinner: 40, stroke: 3 },
    medium: { spinner: 64, stroke: 4 },
    large: { spinner: 96, stroke: 5 },
  };

  const config = sizeConfig[size];

  const containerClasses = fullScreen
    ? 'fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50'
    : 'flex flex-col items-center justify-center p-4';

  return (
    <div className={containerClasses}>
      {/* Football/Soccer ball spinner */}
      <div className="relative" style={{ width: config.spinner, height: config.spinner }}>
        {/* Outer spinning ring */}
        <svg
          className="animate-spin"
          style={{ width: config.spinner, height: config.spinner }}
          viewBox="0 0 50 50"
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="rgba(249, 115, 22, 0.3)"
            strokeWidth={config.stroke}
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#f97316"
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray="31.4 94.2"
          />
        </svg>

        {/* Center football icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="animate-pulse"
            style={{ width: config.spinner * 0.5, height: config.spinner * 0.5 }}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Football/Soccer ball */}
            <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" fill="none" />
            <path
              d="M12 2C12 2 14.5 5 14.5 8C14.5 11 12 14 12 14C12 14 9.5 11 9.5 8C9.5 5 12 2 12 2Z"
              stroke="white"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M12 22C12 22 14.5 19 14.5 16C14.5 13 12 10 12 10C12 10 9.5 13 9.5 16C9.5 19 12 22 12 22Z"
              stroke="white"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M2 12C2 12 5 9.5 8 9.5C11 9.5 14 12 14 12C14 12 11 14.5 8 14.5C5 14.5 2 12 2 12Z"
              stroke="white"
              strokeWidth="1"
              fill="none"
            />
            <path
              d="M22 12C22 12 19 9.5 16 9.5C13 9.5 10 12 10 12C10 12 13 14.5 16 14.5C19 14.5 22 12 22 12Z"
              stroke="white"
              strokeWidth="1"
              fill="none"
            />
            <circle cx="12" cy="12" r="3" fill="white" />
          </svg>
        </div>
      </div>

      {/* Loading text */}
      {text && (
        <p className="mt-4 text-gray-400 text-sm font-medium">{text}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;

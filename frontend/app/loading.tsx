'use client';

import React from 'react';
import LoadingSpinner from './components/LoadingSpinner';

export default function Loading() {
  return (
    <LoadingSpinner
      fullScreen={true}
      size="large"
      text="Loading..."
    />
  );
}

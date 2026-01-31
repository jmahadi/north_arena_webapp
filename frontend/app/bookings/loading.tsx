import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

export default function BookingsLoading() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <LoadingSpinner
        size="large"
        text="Loading bookings..."
      />
    </div>
  );
}

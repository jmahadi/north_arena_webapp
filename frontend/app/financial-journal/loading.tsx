'use client';

import React from 'react';
import LoadingSpinner from '../components/LoadingSpinner';

export default function FinancialJournalLoading() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <LoadingSpinner
        size="large"
        text="Loading financial journal..."
      />
    </div>
  );
}

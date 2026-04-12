'use client';

import { SWRConfig } from 'swr';
import React from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,       // Don't refetch when window regains focus
        revalidateIfStale: true,        // Background revalidate stale data
        dedupingInterval: 10000,        // Dedupe identical requests within 10s
        errorRetryCount: 2,             // Retry failed requests twice
        keepPreviousData: true,         // Show stale data while revalidating
      }}
    >
      {children}
    </SWRConfig>
  );
}

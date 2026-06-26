'use client';

import { SWRConfig } from 'swr';
import React from 'react';

// Persist the SWR cache to localStorage. The first time the user opens a page,
// SWR replays the last cached state instantly (zero blank/spinner state) while
// it revalidates in the background. Survives full reloads and tab restores.
//
// Notes:
//   - Bookings and booking-payment-summary endpoints both set Cache-Control:
//     no-store on the backend, so we are NOT serving stale data past a mutation
//     — every mutation handler explicitly awaits a re-fetch before closing.
//     This persistence only helps the *cold-load* experience.
//   - We skip persisting error states to avoid replaying transient network
//     failures on the next visit.
function createLocalStorageProvider() {
  if (typeof window === 'undefined') {
    return new Map();
  }
  const STORAGE_KEY = 'north-arena-swr-cache:v1';
  let initial: Array<[string, any]> = [];
  try {
    initial = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    initial = [];
  }
  const map = new Map(initial);

  const flush = () => {
    try {
      const serializable: Array<[string, any]> = [];
      for (const [key, value] of map.entries()) {
        if (value && typeof value === 'object' && !('error' in value)) {
          serializable.push([key, value]);
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Quota exceeded or storage disabled — drop silently. Worst case is the
      // next cold load has nothing to replay; in-memory cache still works.
    }
  };

  window.addEventListener('beforeunload', flush);
  // Also flush periodically so we don't lose state on a hard crash.
  if (typeof window.setInterval === 'function') {
    window.setInterval(flush, 15000);
  }

  return map;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: createLocalStorageProvider,
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

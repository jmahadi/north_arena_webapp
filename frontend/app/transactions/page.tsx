'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';

const TransactionsContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Check if there's a bookingId in URL params - if so, redirect to bookings page
    // Otherwise redirect to financial journal
    const bookingId = searchParams.get('bookingId');
    if (bookingId) {
      // Redirect to bookings page - users should use the modal now
      router.push('/bookings');
    } else {
      // Redirect to financial journal for general transaction viewing
      router.push('/financial-journal');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Redirecting...</p>
      </div>
    </div>
  );
};

export default function TransactionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <TransactionsContent />
    </Suspense>
  );
}

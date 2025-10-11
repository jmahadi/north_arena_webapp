'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import TransactionForm from '../components/TransactionForm';
import TransactionSummaryTable from '../components/TransactionSummaryTable';
import { 
  addTransaction, 
  updateTransaction, 
  deleteTransaction, 
  getTransactions,
  getTransactionSummaries 
} from '../api/transactions';
import { TransactionType, PaymentMethod, TransactionData } from '../types/transactions';
import Cookies from 'js-cookie';
import { startOfMonth, endOfMonth, format } from 'date-fns';

// Define the internal transaction data type
interface FormTransactionData {
  booking_id?: number;
  transaction_id?: number;
  transaction_type: string;
  payment_method: string;
  amount: number;
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  // Global refresh trigger for the entire page
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // State for booking context from URL parameters
  const [bookingContext, setBookingContext] = useState<{
    bookingId?: number;
    name?: string;
    phone?: string;
    date?: string;
    slot?: string;
  } | null>(null);

  // Fetch transactions with a memoized function for efficiency
  const fetchTransactions = useCallback(async () => {
    console.log("Fetching transactions...");
    setIsLoading(true);
    try {
      const data = await getTransactions(dateRange.startDate, dateRange.endDate);
      setTransactions(data.transactions || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setError('Failed to fetch transactions');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate]);

  // Parse URL parameters for booking context
  useEffect(() => {
    const bookingId = searchParams.get('bookingId');
    const name = searchParams.get('name');
    const phone = searchParams.get('phone');
    const date = searchParams.get('date');
    const slot = searchParams.get('slot');
    
    if (bookingId) {
      setBookingContext({
        bookingId: parseInt(bookingId),
        name: name || undefined,
        phone: phone || undefined,
        date: date || undefined,
        slot: slot || undefined,
      });
    }
  }, [searchParams]);

  // Check auth and initial data load
  useEffect(() => {
    console.log("Initial load or token check");
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    } else {
      fetchTransactions();
    }
  }, [router, fetchTransactions]);

  // Refresh effect that runs when refreshTrigger changes
  useEffect(() => {
    console.log("Refresh triggered:", refreshTrigger);
    if (refreshTrigger > 0) {
      fetchTransactions();
    }
  }, [refreshTrigger, fetchTransactions]);

  // Main form submission handler with optimistic updates
  const handleSubmitTransaction = async (formData: FormTransactionData) => {
    console.log("Form submitted:", formData);
    setIsSubmitting(true);
    setError(null);
    
    try {
      if (formData.transaction_id) {
        // Edit mode
        console.log("Updating transaction:", formData.transaction_id);
        const updateData: Partial<TransactionData> = {
          transaction_type: formData.transaction_type as TransactionType,
          payment_method: formData.payment_method as PaymentMethod,
          amount: formData.amount
        };

        await updateTransaction(formData.transaction_id, updateData);
        console.log("Update successful");
      } else if (formData.booking_id) {
        // Add mode
        console.log("Adding new transaction for booking:", formData.booking_id);
        await addTransaction({
          booking_id: formData.booking_id,
          transaction_type: formData.transaction_type as TransactionType,
          payment_method: formData.payment_method as PaymentMethod,
          amount: formData.amount
        });
        console.log("Add successful");
      }
      
      // Force refresh after operation
      setRefreshTrigger(prev => prev + 1);
      
    } catch (err: any) {
      console.error('Transaction operation failed:', err);
      setError(err.message || 'Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Adapter function for the TransactionSummaryTable prop interface
  const handleUpdateTransactionAdapter = async (transactionId: number, data: any) => {
    console.log("Update adapter called with ID:", transactionId);
    await handleSubmitTransaction({
      transaction_id: transactionId,
      transaction_type: data.transaction_type,
      payment_method: data.payment_method,
      amount: data.amount
    });
  };

  // Delete handler with optimistic updates
  const handleDeleteTransaction = async (transactionId: number) => {
    console.log("Delete handler called for ID:", transactionId);
    try {
      setError(null);
      await deleteTransaction(transactionId);
      console.log("Delete successful");
      
      // Force refresh after deletion
      setRefreshTrigger(prev => prev + 1);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError(err.message || 'Failed to delete transaction');
    }
  };

  const handleDateRangeChange = (newRange: { startDate: string; endDate: string }) => {
    console.log("Date range changed to:", newRange);
    setDateRange(newRange);
  };

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-light text-white">Transactions</h1>
          {bookingContext && (
            <button
              onClick={() => router.push('/bookings')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Bookings</span>
            </button>
          )}
        </div>
        
        {/* Booking Context Banner */}
        {bookingContext && (
          <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <div className="flex items-center space-x-3 mb-2">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-lg font-medium text-orange-400">Managing Payments for Booking</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Customer:</span>
                <span className="text-white ml-2">{bookingContext.name}</span>
              </div>
              <div>
                <span className="text-gray-400">Phone:</span>
                <span className="text-white ml-2">{bookingContext.phone}</span>
              </div>
              <div>
                <span className="text-gray-400">Date:</span>
                <span className="text-white ml-2">{bookingContext.date}</span>
              </div>
              <div>
                <span className="text-gray-400">Time:</span>
                <span className="text-white ml-2">{bookingContext.slot}</span>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}
        
        <TransactionForm 
          onSubmit={handleSubmitTransaction}
          isLoading={isSubmitting}
          prefilledBookingId={bookingContext?.bookingId}
        />
        
        {isLoading && transactions.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center text-white">Loading transactions...</div>
          </div>
        ) : (
          <TransactionSummaryTable 
            onUpdateTransaction={handleUpdateTransactionAdapter}
            onDeleteTransaction={handleDeleteTransaction}
            onDateRangeChange={handleDateRangeChange}
            currentDateRange={dateRange}
            filterByBookingId={bookingContext?.bookingId}
          />
        )}
      </div>
    </AdminLayout>
  );
}
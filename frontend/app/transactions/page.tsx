'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
        <h1 className="text-3xl font-bold mb-6 text-white">Transactions</h1>
        
        {error && (
          <div className="mb-6 p-4 bg-red-500 bg-opacity-20 border border-red-500 rounded-lg text-red-500">
            {error}
          </div>
        )}
        
        <TransactionForm 
          onSubmit={handleSubmitTransaction}
          isLoading={isSubmitting}
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
          />
        )}
      </div>
    </AdminLayout>
  );
}
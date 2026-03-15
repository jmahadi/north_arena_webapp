'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import {
  getFinancialJournal,
  FinancialJournalFilters,
  FinancialJournalTransaction,
} from '../api/transactions';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import Cookies from 'js-cookie';

// Simplified options - only what's needed
const PAYMENT_METHODS = ['CASH', 'BKASH'];
const TRANSACTION_TYPES = ['BOOKING_PAYMENT', 'SLOT_PAYMENT'];

export default function FinancialJournalPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [transactions, setTransactions] = useState<FinancialJournalTransaction[]>([]);
  const [dailyTotals, setDailyTotals] = useState<Record<string, Record<string, number>>>({});
  const [periodTotals, setPeriodTotals] = useState<Record<string, number>>({});
  const [grandTotal, setGrandTotal] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);

  // Filter state
  const [filters, setFilters] = useState<FinancialJournalFilters>({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    paymentMethod: undefined,
    transactionType: undefined,
    bookingType: undefined
  });

  // Multi-select filter state
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>([]);
  const [selectedTransactionTypes, setSelectedTransactionTypes] = useState<string[]>([]);

  // View mode
  const [viewMode, setViewMode] = useState<'all' | 'daily'>('all');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filterParams: FinancialJournalFilters = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        paymentMethod: selectedPaymentMethods.length > 0 ? selectedPaymentMethods.join(',') : undefined,
        transactionType: selectedTransactionTypes.length > 0 ? selectedTransactionTypes.join(',') : undefined,
      };

      const data = await getFinancialJournal(filterParams);
      setTransactions(data.transactions);
      setDailyTotals(data.daily_totals);
      setPeriodTotals(data.period_totals);
      setGrandTotal(data.grand_total);
      setTransactionCount(data.transaction_count);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch financial journal');
    } finally {
      setIsLoading(false);
    }
  }, [filters, selectedPaymentMethods, selectedTransactionTypes]);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    } else {
      fetchData();
    }
  }, [router, fetchData]);

  // Quick date range presets
  const setQuickRange = (preset: 'today' | 'last7' | 'last30' | 'thisMonth') => {
    const today = new Date();
    switch (preset) {
      case 'today':
        setFilters(prev => ({ ...prev, startDate: format(today, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') }));
        break;
      case 'last7':
        setFilters(prev => ({ ...prev, startDate: format(subDays(today, 6), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') }));
        break;
      case 'last30':
        setFilters(prev => ({ ...prev, startDate: format(subDays(today, 29), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') }));
        break;
      case 'thisMonth':
        setFilters(prev => ({ ...prev, startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate: format(endOfMonth(today), 'yyyy-MM-dd') }));
        break;
    }
  };

  // Toggle filter selection
  const toggleFilter = (type: 'payment' | 'transaction', value: string) => {
    if (type === 'payment') {
      setSelectedPaymentMethods(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    } else {
      setSelectedTransactionTypes(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedPaymentMethods([]);
    setSelectedTransactionTypes([]);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Customer', 'Phone', 'Booking Date', 'Slot', 'Type', 'Payment', 'Amount'];
    const csvData = transactions.map(t => [
      format(new Date(t.created_at), 'yyyy-MM-dd'),
      format(new Date(t.created_at), 'HH:mm'),
      t.customer_name,
      t.customer_phone,
      t.booking_date || 'N/A',
      t.time_slot || 'N/A',
      t.transaction_type,
      t.payment_method || (t.transaction_type === 'DISCOUNT' ? 'Discount' : 'Other'),
      t.amount.toFixed(2),
    ]);
    const csvContent = [headers, ...csvData].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `transactions-${filters.startDate}-to-${filters.endDate}.csv`;
    link.click();
  };

  // Group transactions by date for daily view
  const groupedTransactions = transactions.reduce((acc, t) => {
    const date = format(new Date(t.created_at), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(t);
    return acc;
  }, {} as Record<string, FinancialJournalTransaction[]>);

  const hasActiveFilters = selectedPaymentMethods.length > 0 || selectedTransactionTypes.length > 0;

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 animate-fadeInUp stagger-1">
          <h1 className="text-2xl font-bold text-white tracking-tight">Financial Journal</h1>
          <button
            onClick={exportToCSV}
            disabled={transactions.length === 0}
            className="glass-card hover:bg-white/[0.06] disabled:opacity-30 text-white/60 hover:text-white px-4 py-2 text-sm rounded-lg transition-all duration-200 font-medium"
          >
            Export CSV
          </button>
        </div>

        {/* Date Range */}
        <div className="flex flex-wrap items-center gap-2 mb-4 animate-fadeInUp stagger-2">
          {['today', 'last7', 'last30', 'thisMonth'].map((preset) => (
            <button
              key={preset}
              onClick={() => setQuickRange(preset as any)}
              className="px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.06] text-white/40 hover:text-white/70 text-xs rounded-lg transition-all duration-200 border border-white/[0.04] hover:border-white/10"
            >
              {preset === 'today' ? 'Today' : preset === 'last7' ? '7D' : preset === 'last30' ? '30D' : 'Month'}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              className="glass-input px-3 py-1.5 rounded-lg text-sm"
            />
            <span className="text-white/20 text-sm">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              className="glass-input px-3 py-1.5 rounded-lg text-sm"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm animate-fadeInUp stagger-3">
          <div className="flex items-center gap-2">
            <span className="text-white/25 text-xs uppercase tracking-wider">Payment:</span>
            {PAYMENT_METHODS.map(method => (
              <button
                key={method}
                onClick={() => toggleFilter('payment', method)}
                className={`px-3 py-1 rounded-lg transition-all duration-200 text-xs ${
                  selectedPaymentMethods.includes(method)
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'bg-white/[0.03] text-white/30 border border-white/[0.04] hover:bg-white/[0.06] hover:text-white/50'
                }`}
              >
                {method === 'BKASH' ? 'bKash' : 'Cash'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/25 text-xs uppercase tracking-wider">Type:</span>
            {TRANSACTION_TYPES.map(type => (
              <button
                key={type}
                onClick={() => toggleFilter('transaction', type)}
                className={`px-3 py-1 rounded-lg transition-all duration-200 text-xs ${
                  selectedTransactionTypes.includes(type)
                    ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                    : 'bg-white/[0.03] text-white/30 border border-white/[0.04] hover:bg-white/[0.06] hover:text-white/50'
                }`}
              >
                {type === 'BOOKING_PAYMENT' ? 'Booking' : 'Slot'}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-2 py-1 text-white/25 hover:text-white/50 transition-colors text-xs">
              Clear
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 bg-white/[0.02] rounded-lg p-0.5 border border-white/[0.04]">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-md text-xs transition-all duration-200 ${viewMode === 'all' ? 'bg-white/[0.06] text-white' : 'text-white/30'}`}
            >
              List
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1 rounded-md text-xs transition-all duration-200 ${viewMode === 'daily' ? 'bg-white/[0.06] text-white' : 'text-white/30'}`}
            >
              Summary
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative" style={{ width: 80, height: 80 }}>
              <svg className="animate-spin" style={{ width: 80, height: 80 }} viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth={3} />
                <circle cx="25" cy="25" r="22" fill="none" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeDasharray="34.5 103.6" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <img src="/images/White-Logomark.png" alt="Loading" className="w-10 h-10 object-contain animate-fade-in-out" />
              </div>
            </div>
            <p className="mt-3 text-white/30 text-sm">Loading transactions...</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6 animate-fadeInUp stagger-4">
              <div className="glass-card rounded-xl p-4">
                <div className="text-[10px] text-white/25 uppercase tracking-wider">Cash</div>
                <div className="text-xl font-semibold text-white mt-1">৳{(periodTotals.CASH || 0).toLocaleString()}</div>
              </div>
              <div className="glass-card rounded-xl p-4">
                <div className="text-[10px] text-white/25 uppercase tracking-wider">bKash</div>
                <div className="text-xl font-semibold text-white mt-1">৳{(periodTotals.BKASH || 0).toLocaleString()}</div>
              </div>
              <div className="glass-card-glow rounded-xl p-4" style={{ borderColor: 'rgba(249, 115, 22, 0.15)' }}>
                <div className="text-[10px] text-orange-400 uppercase tracking-wider">Total</div>
                <div className="text-xl font-semibold text-gradient-orange mt-1">৳{grandTotal.toLocaleString()}</div>
                <div className="text-[10px] text-white/20 mt-0.5">{transactionCount} transactions</div>
              </div>
            </div>

            {/* Transactions */}
            {viewMode === 'all' ? (
              <div className="glass-card rounded-xl overflow-x-auto animate-fadeInUp stagger-5">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-left text-[10px] font-medium text-white/25 uppercase tracking-wider whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium text-white/25 uppercase tracking-wider whitespace-nowrap">Customer</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium text-white/25 uppercase tracking-wider whitespace-nowrap">Booking</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium text-white/25 uppercase tracking-wider whitespace-nowrap">Payment</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium text-white/25 uppercase tracking-wider whitespace-nowrap">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.03]">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-white/25">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      transactions.map((t) => (
                        <tr key={t.id} className={`table-row-hover ${t.is_cancelled ? 'opacity-40' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm text-white">{format(new Date(t.created_at), 'MMM dd')}</div>
                            <div className="text-xs text-white/20">{format(new Date(t.created_at), 'HH:mm')}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-white">{t.customer_name}</div>
                            <div className="text-xs text-white/20">{t.customer_phone}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm text-white">
                              {t.booking_date ? format(new Date(t.booking_date), 'MMM dd') : '-'}
                            </div>
                            <div className="text-xs text-white/20">{t.time_slot || '-'}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`text-xs font-medium ${
                                t.transaction_type === 'DISCOUNT' || !t.payment_method
                                  ? 'text-orange-300'
                                  : t.payment_method === 'CASH'
                                  ? 'text-white/40'
                                  : 'text-orange-400'
                              }`}
                            >
                              {t.transaction_type === 'DISCOUNT'
                                ? 'Discount'
                                : t.payment_method === 'BKASH'
                                ? 'bKash'
                                : (t.payment_method || 'Other')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="text-white font-semibold">৳{t.amount.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-3 animate-fadeInUp stagger-5">
                {Object.entries(groupedTransactions).length === 0 ? (
                  <div className="glass-card rounded-xl p-8 text-center text-white/25">
                    No transactions found
                  </div>
                ) : (
                  Object.entries(groupedTransactions)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, dateTransactions]) => {
                      const dateTotals = dailyTotals[date] || {};
                      const dayTotal = Object.values(dateTotals).reduce((sum, val) => sum + val, 0);

                      return (
                        <div key={date} className="glass-card rounded-xl overflow-hidden">
                          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                            <div>
                              <div className="text-white font-medium">{format(new Date(date), 'EEEE, MMM dd')}</div>
                              <div className="text-xs text-white/20">{dateTransactions.length} transactions</div>
                            </div>
                            <div className="text-right">
                              <div className="text-gradient-orange font-semibold">৳{dayTotal.toLocaleString()}</div>
                              <div className="text-xs text-white/20">
                                {dateTotals.CASH > 0 && `Cash: ৳${dateTotals.CASH.toLocaleString()}`}
                                {dateTotals.CASH > 0 && dateTotals.BKASH > 0 && ' · '}
                                {dateTotals.BKASH > 0 && `bKash: ৳${dateTotals.BKASH.toLocaleString()}`}
                              </div>
                            </div>
                          </div>
                          <div className="divide-y divide-white/[0.03]">
                            {dateTransactions.map(t => (
                              <div key={t.id} className={`px-4 py-2.5 flex items-center justify-between table-row-hover ${t.is_cancelled ? 'opacity-40' : ''}`}>
                                <div className="flex items-center gap-4">
                                  <div className="text-xs text-white/20 w-12">{format(new Date(t.created_at), 'HH:mm')}</div>
                                  <div>
                                    <div className="text-sm text-white">{t.customer_name}</div>
                                    <div className="text-xs text-white/20">{t.time_slot || '-'}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`text-xs font-medium ${
                                      t.transaction_type === 'DISCOUNT' || !t.payment_method
                                        ? 'text-orange-300'
                                        : t.payment_method === 'CASH'
                                        ? 'text-white/30'
                                        : 'text-orange-400'
                                    }`}
                                  >
                                    {t.transaction_type === 'DISCOUNT'
                                      ? 'Discount'
                                      : t.payment_method === 'BKASH'
                                      ? 'bKash'
                                      : (t.payment_method || 'Other')}
                                  </span>
                                  <span className="text-white font-semibold">৳{t.amount.toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

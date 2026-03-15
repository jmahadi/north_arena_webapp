import React, { useState, useEffect, useCallback } from 'react';
import {
  Transaction,
  TransactionSummary,
  TransactionDetail,
  TransactionStatus,
  TransactionType,
  PaymentMethod
} from '../types/transactions';
import {
  getTransactionSummaries,
  getTransactionDetails,
  updateTransaction as apiUpdateTransaction,
  deleteTransaction as apiDeleteTransaction
} from '../api/transactions';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import TransactionForm from './TransactionForm';



interface TransactionSummaryTableProps {
  onUpdateTransaction: (transactionId: number, data: any) => Promise<void>;
  onDeleteTransaction?: (transactionId: number) => Promise<void>;
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  currentDateRange: { startDate: string; endDate: string };
  filterByBookingId?: number;
}

const TransactionSummaryTable: React.FC<TransactionSummaryTableProps> = ({
  onUpdateTransaction,
  onDeleteTransaction,
  onDateRangeChange,
  currentDateRange,
  filterByBookingId
}) => {
  const [summaries, setSummaries] = useState<TransactionSummary[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionDetails, setTransactionDetails] = useState<Record<number, TransactionDetail[]>>({});
  const [editingTransaction, setEditingTransaction] = useState<TransactionDetail | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const fetchTransactionSummaries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const summariesData = await getTransactionSummaries();
      setSummaries(summariesData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch transaction summaries';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTransactionDetails = useCallback(async (bookingId: number) => {
    try {
      setIsLoading(true);
      const details = await getTransactionDetails(bookingId);
      setTransactionDetails(prev => ({
        ...prev,
        [bookingId]: details
      }));
      return details;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch transaction details';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactionSummaries();
    if (expandedRow !== null) {
      fetchTransactionDetails(expandedRow);
    }
  }, [fetchTransactionSummaries, fetchTransactionDetails, refreshTrigger, currentDateRange, expandedRow]);

  const toggleRowExpansion = async (bookingId: number) => {
    setEditingTransaction(null);
    if (expandedRow === bookingId) {
      setExpandedRow(null);
      return;
    }
    const details = await fetchTransactionDetails(bookingId);
    if (details && details.length > 0) {
      setExpandedRow(bookingId);
    } else {
      setError('No transaction details found for this booking');
    }
  };

  const handleEditClick = (transaction: TransactionDetail) => {
    setEditingTransaction(transaction);
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
  };

  const handleSaveEdit = async (data: any) => {
    try {
      if (data.transaction_id) {
        await apiUpdateTransaction(data.transaction_id, {
          transaction_type: data.transaction_type,
          payment_method: data.payment_method,
          amount: data.amount
        });
        if (expandedRow) {
          await fetchTransactionDetails(expandedRow);
        }
        await fetchTransactionSummaries();
        setEditingTransaction(null);
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      setError('Failed to update transaction. Please try again.');
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    try {
      await apiDeleteTransaction(transactionId);
      if (expandedRow) {
        const details = await fetchTransactionDetails(expandedRow);
        if (details.length === 0) {
          setExpandedRow(null);
        }
      }
      await fetchTransactionSummaries();
      setEditingTransaction(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      setError('Failed to delete transaction. Please try again.');
    }
  };

  const presetRanges = [
    {
      label: 'Today',
      onClick: () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        onDateRangeChange({ startDate: today, endDate: today });
      }
    },
    {
      label: '7D',
      onClick: () => {
        const end = new Date();
        const start = subDays(end, 6);
        onDateRangeChange({
          startDate: format(start, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd')
        });
      }
    },
    {
      label: '30D',
      onClick: () => {
        const end = new Date();
        const start = subDays(end, 29);
        onDateRangeChange({
          startDate: format(start, 'yyyy-MM-dd'),
          endDate: format(end, 'yyyy-MM-dd')
        });
      }
    },
    {
      label: 'Month',
      onClick: () => {
        const now = new Date();
        onDateRangeChange({
          startDate: format(startOfMonth(now), 'yyyy-MM-dd'),
          endDate: format(endOfMonth(now), 'yyyy-MM-dd')
        });
      }
    },
  ];

  const handleDateChange = (startOrEnd: 'startDate' | 'endDate', date: string) => {
    onDateRangeChange({
      ...currentDateRange,
      [startOrEnd]: date
    });
  };

  const getStatusStyle = (status: string) => {
    const normalizedStatus = status?.toString().toUpperCase();
    switch (normalizedStatus) {
      case 'SUCCESSFUL':
        return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
      case 'PARTIAL':
        return 'bg-orange-500/15 text-orange-400 border border-orange-500/20';
      case 'PENDING':
        return 'bg-red-500/15 text-red-400 border border-red-500/20';
      default:
        return 'bg-white/[0.04] text-white/50 border border-white/[0.06]';
    }
  };

  const renderTransactionDetails = (summary: TransactionSummary) => {
    const details = transactionDetails[summary.booking_id];

    if (!details || details.length === 0) {
      return (
        <div className="py-4 px-6 bg-white/[0.02]">
          <p className="text-center text-white/25">No transaction details available</p>
        </div>
      );
    }

    if (editingTransaction && details.some(t => t.id === editingTransaction.id)) {
      return (
        <div className="py-4 px-6 bg-white/[0.02]">
          <div className="max-w-full overflow-x-hidden">
            <TransactionForm
              editingTransaction={editingTransaction}
              onSubmit={handleSaveEdit}
              onDelete={handleDeleteTransaction}
              onCancel={handleCancelEdit}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="py-4 px-6 bg-white/[0.02]">
        <h4 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider">Transaction History</h4>
        <div className="space-y-3">
          {details.map((transaction) => (
            <div key={transaction.id} className="glass-card rounded-lg p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div>
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Date</div>
                    <div className="text-sm text-white/70">
                      {format(new Date(transaction.created_at), 'MMM dd, yyyy')}
                    </div>
                    <div className="text-[10px] text-white/25">
                      {format(new Date(transaction.created_at), 'HH:mm')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Type</div>
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium ${
                      transaction.transaction_type === 'BOOKING_PAYMENT' ? 'bg-red-500/15 text-red-400' :
                      transaction.transaction_type === 'SLOT_PAYMENT' ? 'bg-emerald-500/15 text-emerald-400' :
                      transaction.transaction_type === 'DISCOUNT' ? 'bg-orange-500/15 text-orange-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      {transaction.transaction_type.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Method</div>
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-medium ${
                      transaction.payment_method === 'CASH' ? 'bg-emerald-500/15 text-emerald-400' :
                      transaction.payment_method === 'BKASH' ? 'bg-pink-500/15 text-pink-400' :
                      transaction.payment_method === 'NAGAD' ? 'bg-orange-500/15 text-orange-400' :
                      transaction.payment_method === 'CARD' ? 'bg-blue-500/15 text-blue-400' :
                      transaction.transaction_type === 'DISCOUNT' ? 'bg-orange-500/15 text-orange-400' :
                      'bg-white/[0.04] text-white/50'
                    }`}>
                      {transaction.payment_method || (transaction.transaction_type === 'DISCOUNT' ? 'Discount' : 'Other')}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-right">
                  <div>
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Amount</div>
                    <div className="text-lg font-bold text-white">৳{transaction.amount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">User</div>
                    <div className="text-sm text-white/50">{transaction.creator || "Admin"}</div>
                  </div>
                  <div>
                    <button
                      onClick={() => handleEditClick(transaction)}
                      className="btn-glow w-full bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs transition-all duration-300"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const filteredSummaries = filterByBookingId
    ? summaries.filter(summary => summary.booking_id === filterByBookingId)
    : summaries;

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl">
          {error}
        </div>
      )}

      {filterByBookingId && (
        <div className="glass-card rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-blue-300 text-sm">
              Showing transactions for Booking ID: {filterByBookingId}
            </span>
          </div>
        </div>
      )}

      {!filterByBookingId && (
        <div className="flex flex-wrap items-center gap-4 glass-card p-4 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            {presetRanges.map((range) => (
              <button
                key={range.label}
                onClick={range.onClick}
                className="px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] text-white/40 rounded-lg hover:bg-white/[0.06] hover:text-white/60 transition-all duration-200 text-xs"
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-2 w-full md:w-auto md:ml-auto md:mt-0">
            <input
              type="date"
              value={currentDateRange.startDate}
              onChange={(e) => handleDateChange('startDate', e.target.value)}
              className="glass-input p-2 rounded-lg text-sm"
            />
            <span className="text-white/20 text-sm">to</span>
            <input
              type="date"
              value={currentDateRange.endDate}
              onChange={(e) => handleDateChange('endDate', e.target.value)}
              className="glass-input p-2 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {isLoading && !expandedRow && filteredSummaries.length === 0 ? (
        <div className="text-center text-white/30 py-8">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="w-full">
            {filteredSummaries.length === 0 ? (
              <div className="text-center text-white/30 py-8">
                {filterByBookingId ?
                  'No transaction data found for this booking' :
                  'No transaction data found'
                }
              </div>
            ) : (
              filteredSummaries.map((summary) => (
                <div
                  key={`${summary.booking_date}_${summary.slot}`}
                  className="mb-4 glass-card rounded-xl overflow-hidden"
                >
                  <div className="p-4 border-b border-white/[0.06]">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                      <div className="mb-2 sm:mb-0">
                        <div className="font-medium text-white">{summary.slot}</div>
                        <div className="text-xs text-white/25">
                          {format(new Date(summary.booking_date), 'MMM dd, yyyy')}
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${getStatusStyle(summary.status)}`}>
                        {summary.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <div className="text-[10px] text-white/25 uppercase tracking-wider">Last Transaction</div>
                        <div>
                          {summary.last_payment_date ? (
                            <div className="text-sm text-white/70">{format(new Date(summary.last_payment_date), 'MMM dd, yyyy')}</div>
                          ) : (
                            <div className="text-sm text-white/20">N/A</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/25 uppercase tracking-wider">First Payment</div>
                        <div>
                          {summary.booking_payment_date ? (
                            <div className="text-sm text-white/70">{format(new Date(summary.booking_payment_date), 'MMM dd')}</div>
                          ) : (
                            <div className="text-sm text-white/20">N/A</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <div className="text-[10px] text-white/25 uppercase tracking-wider">Total Paid</div>
                        <div className="text-lg font-semibold text-white">৳{summary.total_paid.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/25 uppercase tracking-wider">Left Over</div>
                        <div className="text-lg font-semibold text-white">৳{summary.leftover.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <button
                        onClick={() => toggleRowExpansion(summary.booking_id)}
                        className="w-full btn-glow bg-orange-600 text-white py-2 rounded-lg transition-all duration-300 text-sm font-medium"
                      >
                        {expandedRow === summary.booking_id ? 'Hide Details' : 'Show Details'}
                      </button>
                    </div>
                  </div>

                  {expandedRow === summary.booking_id && (
                    <div>
                      {isLoading && !transactionDetails[summary.booking_id] ? (
                        <div className="py-4 px-6 bg-white/[0.02] text-center">
                          <div className="text-white/30">Loading details...</div>
                        </div>
                      ) : (
                        renderTransactionDetails(summary)
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionSummaryTable;

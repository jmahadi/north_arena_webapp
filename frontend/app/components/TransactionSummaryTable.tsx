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
import StatusBadge from './StatusBadge';


interface TransactionSummaryTableProps {
  onUpdateTransaction: (transactionId: number, data: any) => Promise<void>;
  onDeleteTransaction?: (transactionId: number) => Promise<void>;
  onDateRangeChange: (range: { startDate: string; endDate: string }) => void;
  currentDateRange: { startDate: string; endDate: string };
}

const TransactionSummaryTable: React.FC<TransactionSummaryTableProps> = ({ 
  onUpdateTransaction,
  onDeleteTransaction,
  onDateRangeChange,
  currentDateRange
}) => {
  const [summaries, setSummaries] = useState<TransactionSummary[]>([]);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionDetails, setTransactionDetails] = useState<Record<number, TransactionDetail[]>>({});
  const [editingTransaction, setEditingTransaction] = useState<TransactionDetail | null>(null);
  // Added for forcing refresh
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Memoize the fetch function to prevent unnecessary re-renders
  const fetchTransactionSummaries = useCallback(async () => {
    console.log("Fetching transaction summaries...");
    setIsLoading(true);
    setError(null);
    try {
      const summariesData = await getTransactionSummaries();
      console.log('Received summaries:', summariesData);
      
      setSummaries(summariesData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch transaction summaries';
      setError(errorMessage);
      console.error('Error in summary fetch:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch transaction details with a memoized function
  const fetchTransactionDetails = useCallback(async (bookingId: number) => {
    console.log(`Fetching details for booking ${bookingId}...`);
    try {
      setIsLoading(true);
      const details = await getTransactionDetails(bookingId);
      console.log('Received details:', details);
      
      setTransactionDetails(prev => ({
        ...prev,
        [bookingId]: details
      }));
      return details;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch transaction details';
      console.error('Error fetching details:', err);
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh effect - run when trigger changes or date range changes
  useEffect(() => {
    console.log("Refresh triggered:", refreshTrigger, "Date range:", currentDateRange);
    fetchTransactionSummaries();
    
    // If a row is expanded, refresh its details too
    if (expandedRow !== null) {
      fetchTransactionDetails(expandedRow);
    }
  }, [fetchTransactionSummaries, fetchTransactionDetails, refreshTrigger, currentDateRange, expandedRow]);

  const toggleRowExpansion = async (bookingId: number) => {
    console.log('Toggling row:', bookingId, 'Current expanded:', expandedRow);
    
    // Close editor if it's open
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

  // Direct API calls rather than using parent component functions
  const handleSaveEdit = async (data: any) => {
    try {
      console.log("Saving edit:", data);
      if (data.transaction_id) {
        // Direct API call
        await apiUpdateTransaction(data.transaction_id, {
          transaction_type: data.transaction_type,
          payment_method: data.payment_method,
          amount: data.amount
        });
        
        // Refresh details immediately
        if (expandedRow) {
          await fetchTransactionDetails(expandedRow);
        }
        
        // Refresh summaries
        await fetchTransactionSummaries();
        
        // Close the editor
        setEditingTransaction(null);
        
        // Force a refresh by incrementing the trigger
        setRefreshTrigger(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to update transaction:', err);
      setError('Failed to update transaction. Please try again.');
    }
  };
  
  // Direct API call to delete
  const handleDeleteTransaction = async (transactionId: number) => {
    try {
      console.log("Deleting transaction:", transactionId);
      // Direct API call
      await apiDeleteTransaction(transactionId);
      
      // Refresh details if a row is expanded
      if (expandedRow) {
        const details = await fetchTransactionDetails(expandedRow);
        if (details.length === 0) {
          // If no transactions left, close the expanded row
          setExpandedRow(null);
        }
      }
      
      // Refresh summaries
      await fetchTransactionSummaries();
      
      // Close the editor
      setEditingTransaction(null);
      
      // Increment refresh trigger
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to delete transaction:', err);
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
      label: 'Last 7 Days',
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
      label: 'Last 30 Days',
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
      label: 'This Month',
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

  // Get style for status badges
  const getStatusStyle = (status: string) => {
    // Normalize status to uppercase for comparison
    const normalizedStatus = status?.toString().toUpperCase();
    console.log('getStatusStyle received status:', status, 'normalized:', normalizedStatus);
    
    switch (normalizedStatus) {
      case 'SUCCESSFUL':
        return {
          backgroundColor: '#059669',
          color: 'white',
          fontWeight: 'bold'
        };
      case 'PARTIAL':
        return {
          backgroundColor: '#f59e0b',
          color: 'black',
          fontWeight: 'bold'
        };
      case 'PENDING':
        return {
          backgroundColor: '#ef4444',
          color: 'white',
          fontWeight: 'bold'
        };
      default:
        return {
          backgroundColor: '#6B7280', 
          color: 'white',
          fontWeight: 'bold'
        };
    }
  };

  const renderTransactionDetails = (summary: TransactionSummary) => {
    console.log('Rendering details for:', summary.booking_id);
    
    const details = transactionDetails[summary.booking_id];
    
    if (!details || details.length === 0) {
      return (
        <div className="py-4 px-6 bg-gray-800">
          <p className="text-center text-gray-400">No transaction details available</p>
        </div>
      );
    }
    
    // If we're editing a transaction, show the form instead of the table
    if (editingTransaction && details.some(t => t.id === editingTransaction.id)) {
      return (
        <div className="py-4 px-6 bg-gray-800">
          {/* Fixed width for mobile view */}
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
  
    // Otherwise show the transaction details table
    return (
      <div className="py-4 px-6 bg-gray-800">
        <h4 className="text-lg font-semibold mb-4 text-white">Transaction History</h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left pb-2">Date</th>
                <th className="text-left pb-2">Type</th>
                <th className="text-left pb-2">Method</th>
                <th className="text-right pb-2">Amount</th>
                <th className="text-left pb-2">User</th>
                <th className="text-center pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {details.map((transaction) => (
                <tr key={transaction.id} className="border-t border-gray-700">
                  <td className="py-2 text-gray-300">
                    {format(new Date(transaction.created_at), 'MMM dd, yyyy HH:mm')}
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      transaction.transaction_type === 'BOOKING_PAYMENT' ? 'bg-blue-500' :
                      transaction.transaction_type === 'SLOT_PAYMENT' ? 'bg-green-500' :
                      transaction.transaction_type === 'DISCOUNT' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}>
                      {transaction.transaction_type}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-1 rounded text-xs ${
                      transaction.payment_method === 'CASH' ? 'bg-green-500' :
                      transaction.payment_method === 'BKASH' ? 'bg-pink-500' :
                      transaction.payment_method === 'NAGAD' ? 'bg-orange-500' :
                      transaction.payment_method === 'CARD' ? 'bg-blue-500' :
                      'bg-purple-500'
                    }`}>
                      {transaction.payment_method}
                    </span>
                  </td>
                  <td className="py-2 text-right text-white">${transaction.amount.toFixed(2)}</td>
                  <td className="py-2 text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis max-w-[100px]">
                    {transaction.creator || "Admin"}
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => handleEditClick(transaction)}
                      className="w-full bg-primary text-white px-2 py-1 rounded text-xs hover:bg-primary-hover"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Main render function
  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 p-4 rounded">
          {error}
        </div>
      )}
      
      {/* Date range controls */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-800 p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-2">
          {presetRanges.map((range) => (
            <button
              key={range.label}
              onClick={range.onClick}
              className="px-3 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition duration-300"
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
            className="p-2 rounded bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={currentDateRange.endDate}
            onChange={(e) => handleDateChange('endDate', e.target.value)}
            className="p-2 rounded bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {isLoading && !expandedRow && summaries.length === 0 ? (
        <div className="text-center text-gray-300 py-8">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          {/* Mobile-friendly table with responsive design */}
          <div className="w-full">
            {summaries.length === 0 ? (
              <div className="text-center text-gray-300 py-8">No transaction data found</div>
            ) : (
              summaries.map((summary) => (
                <div 
                  key={`${summary.booking_date}_${summary.slot}`}
                  className="mb-4 bg-surface bg-opacity-50 rounded-lg overflow-hidden"
                >
                  {/* Summary card */}
                  <div className="p-4 border-b border-gray-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2">
                      <div className="mb-2 sm:mb-0">
                        <div className="font-medium text-white">{summary.slot}</div>
                        <div className="text-xs text-gray-400">
                          {format(new Date(summary.booking_date), 'MMM dd, yyyy')}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {/* Use inline styles for the status badge */}
                        <span 
                          style={getStatusStyle(summary.status)}
                          className="px-2 py-1 rounded-full text-xs font-bold"
                        >
                          {summary.status}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <div className="text-xs text-gray-400">Last Transaction</div>
                        <div>
                          {summary.last_payment_date ? (
                            <div className="text-sm text-white">{format(new Date(summary.last_payment_date), 'MMM dd, yyyy')}</div>
                          ) : (
                            <div className="text-sm text-gray-400">N/A</div>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">First Payment</div>
                        <div>
                          {summary.booking_payment_date ? (
                            <div className="text-sm text-white">{format(new Date(summary.booking_payment_date), 'MMM dd')}</div>
                          ) : (
                            <div className="text-sm text-gray-400">N/A</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-2">
                      <div>
                        <div className="text-xs text-gray-400">Total Paid</div>
                        <div className="text-lg font-semibold text-white">${summary.total_paid.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Left Over</div>
                        <div className="text-lg font-semibold text-white">${summary.leftover.toFixed(2)}</div>
                      </div>
                    </div>
                    
                    {/* Action button at bottom of card */}
                    <div className="mt-3">
                      <button
                        onClick={() => toggleRowExpansion(summary.booking_id)}
                        className="w-full bg-primary text-white py-2 rounded-md hover:bg-primary-hover transition duration-300"
                      >
                        {expandedRow === summary.booking_id ? 'Hide Details' : 'Show Details'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Details section */}
                  {expandedRow === summary.booking_id && (
                    <div>
                      {isLoading && !transactionDetails[summary.booking_id] ? (
                        <div className="py-4 px-6 bg-gray-800 text-center">
                          <div className="text-gray-300">Loading details...</div>
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
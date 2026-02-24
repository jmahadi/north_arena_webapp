import React, { useState, useEffect } from 'react';
import { TransactionType, PaymentMethod, TransactionDetail } from '../types/transactions';
import { getBookingsForDate } from '../api/transactions';

interface TransactionFormProps {
  // Added editingTransaction property for edit mode
  editingTransaction?: TransactionDetail | null;
  // Added isLoading property to disable form during submission
  isLoading?: boolean;
  // Added prefilledBookingId to auto-select booking from URL params
  prefilledBookingId?: number;
  onSubmit: (data: {
    booking_id?: number;
    transaction_id?: number;
    transaction_type: TransactionType;
    payment_method: PaymentMethod | null;
    amount: number;
  }) => void;
  // Added onDelete handler
  onDelete?: (transactionId: number) => Promise<void>;
  // Added onCancel handler
  onCancel?: () => void;
}

const TransactionForm: React.FC<TransactionFormProps> = ({ 
  editingTransaction, 
  isLoading = false,
  prefilledBookingId,
  onSubmit, 
  onDelete,
  onCancel 
}) => {
  const [bookingDate, setBookingDate] = useState('');
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const isNoMethodType = transactionType === 'DISCOUNT' || transactionType === 'OTHER_ADJUSTMENT';

  useEffect(() => {
    if (isNoMethodType) {
      setPaymentMethod('');
    }
  }, [isNoMethodType]);

  // Set form values when in edit mode or with prefilled booking
  useEffect(() => {
    if (editingTransaction) {
      // When in edit mode, we don't need to select a booking as it's already associated
      setTransactionType(editingTransaction.transaction_type as TransactionType);
      setPaymentMethod((editingTransaction.payment_method as PaymentMethod) || '');
      setAmount(editingTransaction.amount.toString());
    } else {
      // Reset form when not in edit mode
      setTransactionType('');
      setPaymentMethod('');
      setAmount('');
      
      // If we have a prefilled booking ID, set it as selected
      if (prefilledBookingId) {
        setSelectedBooking(prefilledBookingId.toString());
      }
    }
  }, [editingTransaction, prefilledBookingId]);

  // Auto-fill booking date when we have a prefilled booking ID
  useEffect(() => {
    if (prefilledBookingId && !editingTransaction) {
      // Extract date from URL parameters (passed from booking page)
      const urlParams = new URLSearchParams(window.location.search);
      const dateFromUrl = urlParams.get('date');
      if (dateFromUrl) {
        setBookingDate(dateFromUrl);
      }
    }
  }, [prefilledBookingId, editingTransaction]);
  
  useEffect(() => {
    if (bookingDate && !editingTransaction) {
      fetchBookingsForDate(bookingDate);
    }
  }, [bookingDate, editingTransaction]);

  const fetchBookingsForDate = async (date: string) => {
    try {
      setIsLoadingBookings(true);
      console.log("Fetching bookings for date:", date);
      const fetchedBookings = await getBookingsForDate(date);
      console.log("Received bookings:", fetchedBookings);
      setBookings(fetchedBookings);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
      setBookings([]);
      setError('Failed to fetch bookings');
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      
      // Different validation and data preparation based on add/edit mode
      if (editingTransaction) {
        // Edit mode - just need the transaction fields
        if (!transactionType || (!isNoMethodType && !paymentMethod) || !amount) {
          setError('Please fill in all fields');
          return;
        }

        await onSubmit({
          transaction_id: editingTransaction.id,
          transaction_type: transactionType as TransactionType,
          payment_method: isNoMethodType ? null : (paymentMethod as PaymentMethod),
          amount: parseFloat(amount)
        });
      } else {
        // Add mode - need booking selection as well
        if (!selectedBooking || !transactionType || (!isNoMethodType && !paymentMethod) || !amount) {
          setError('Please fill in all fields');
          return;
        }

        await onSubmit({
          booking_id: parseInt(selectedBooking),
          transaction_type: transactionType as TransactionType,
          payment_method: isNoMethodType ? null : (paymentMethod as PaymentMethod),
          amount: parseFloat(amount)
        });
      }

      // Reset form on success if we're not in edit mode
      if (!editingTransaction) {
        setBookingDate('');
        setSelectedBooking('');
        setTransactionType('');
        setPaymentMethod('');
        setAmount('');
      }
      
      setError(null);
    } catch (error: any) {
      setError(error.message || 'Failed to submit transaction');
    }
  };

  // New delete handler
  const handleDelete = async () => {
    if (!editingTransaction || !onDelete) return;
    
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        console.log("Deleting transaction:", editingTransaction.id);
        await onDelete(editingTransaction.id);
        // Cancel edit mode after deletion
        if (onCancel) onCancel();
      } catch (error: any) {
        setError(error.message || 'Failed to delete transaction');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-black/40 border border-gray-800 p-6 rounded-lg shadow-lg mb-8">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-4">
        {editingTransaction ? 'Editing Transaction' : 'New Transaction'}
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-500 bg-opacity-20 border border-red-500 rounded text-red-500">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Only show booking selection in add mode */}
        {!editingTransaction && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Booking Date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="w-full p-2 rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors"
                required
                disabled={isLoading || isLoadingBookings}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Select Booking</label>
              <select
                value={selectedBooking}
                onChange={(e) => setSelectedBooking(e.target.value)}
                className="w-full p-2 rounded-md bg-black/20 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors"
                required
                disabled={!bookingDate || isLoading || isLoadingBookings}
              >
                <option value="">Select a booking</option>
                {isLoadingBookings ? (
                  <option value="" disabled>Loading bookings...</option>
                ) : (
                  bookings.map((booking) => (
                    <option key={booking.id} value={booking.id}>
                      {booking.name} - {booking.time_slot}
                    </option>
                  ))
                )}
              </select>
            </div>
          </>
        )}
        
        {/* Transaction fields for both modes */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Transaction Type</label>
          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value as TransactionType)}
            className="w-full p-2 rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            required
            disabled={isLoading}
          >
            <option value="">Select type</option>
            {Object.values(TransactionType).map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full p-2 rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            required={!isNoMethodType}
            disabled={isLoading || isNoMethodType}
          >
            <option value="">Select method</option>
            {Object.values(PaymentMethod).map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full p-2 rounded-md bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-primary"
            required
            step="0.01"
            min="0"
            disabled={isLoading}
          />
        </div>
      </div>
      
      {/* Different button layout based on mode */}
      <div className="mt-6 flex justify-end space-x-2">
        {/* Delete button in edit mode */}
        {editingTransaction && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="mr-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition duration-300 ease-in-out disabled:opacity-50"
            disabled={isLoading}
          >
            Delete Transaction
          </button>
        )}
        
        {/* Cancel button in edit mode */}
        {editingTransaction && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition duration-300 ease-in-out disabled:opacity-50"
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
        
        {/* Submit button (changes text based on mode) */}
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition duration-300 ease-in-out disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : editingTransaction ? 'Update Transaction' : 'Add Transaction'}
        </button>
      </div>
    </form>
  );
};

export default TransactionForm;

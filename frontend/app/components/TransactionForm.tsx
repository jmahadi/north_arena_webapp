import React, { useState, useEffect } from 'react';
import { TransactionType, PaymentMethod, TransactionDetail } from '../types/transactions';
import { getBookingsForDate } from '../api/transactions';

interface TransactionFormProps {
  editingTransaction?: TransactionDetail | null;
  isLoading?: boolean;
  prefilledBookingId?: number;
  onSubmit: (data: {
    booking_id?: number;
    transaction_id?: number;
    transaction_type: TransactionType;
    payment_method: PaymentMethod | null;
    amount: number;
  }) => void;
  onDelete?: (transactionId: number) => Promise<void>;
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

  useEffect(() => {
    if (editingTransaction) {
      setTransactionType(editingTransaction.transaction_type as TransactionType);
      setPaymentMethod((editingTransaction.payment_method as PaymentMethod) || '');
      setAmount(editingTransaction.amount.toString());
    } else {
      setTransactionType('');
      setPaymentMethod('');
      setAmount('');
      if (prefilledBookingId) {
        setSelectedBooking(prefilledBookingId.toString());
      }
    }
  }, [editingTransaction, prefilledBookingId]);

  useEffect(() => {
    if (prefilledBookingId && !editingTransaction) {
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
      const fetchedBookings = await getBookingsForDate(date);
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

      if (editingTransaction) {
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

  const handleDelete = async () => {
    if (!editingTransaction || !onDelete) return;
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await onDelete(editingTransaction.id);
        if (onCancel) onCancel();
      } catch (error: any) {
        setError(error.message || 'Failed to delete transaction');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 rounded-xl mb-8">
      <div className="text-[10px] text-white/30 uppercase tracking-widest mb-4 font-medium">
        {editingTransaction ? 'Editing Transaction' : 'New Transaction'}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!editingTransaction && (
          <>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Booking Date</label>
              <input
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className="glass-input w-full p-2.5 rounded-lg text-sm"
                required
                disabled={isLoading || isLoadingBookings}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Select Booking</label>
              <select
                value={selectedBooking}
                onChange={(e) => setSelectedBooking(e.target.value)}
                className="glass-input w-full p-2.5 rounded-lg text-sm"
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

        <div>
          <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Transaction Type</label>
          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value as TransactionType)}
            className="glass-input w-full p-2.5 rounded-lg text-sm"
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
          <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="glass-input w-full p-2.5 rounded-lg text-sm"
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
          <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="glass-input w-full p-2.5 rounded-lg text-sm"
            required
            step="0.01"
            min="0"
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end space-x-2">
        {editingTransaction && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            className="mr-auto px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/15 transition-all duration-200 text-sm disabled:opacity-50"
            disabled={isLoading}
          >
            Delete
          </button>
        )}
        {editingTransaction && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 glass-card text-white/50 rounded-lg hover:bg-white/[0.06] transition-all duration-200 text-sm disabled:opacity-50"
            disabled={isLoading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="btn-glow px-4 py-2 bg-orange-600 text-white rounded-lg transition-all duration-300 text-sm disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : editingTransaction ? 'Update' : 'Add Transaction'}
        </button>
      </div>
    </form>
  );
};

export default TransactionForm;

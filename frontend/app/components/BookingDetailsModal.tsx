'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import {
  TransactionType,
  PaymentMethod,
  TransactionDetail
} from '../types/transactions';
import {
  getBookingPaymentSummary,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  BookingPaymentSummary
} from '../api/transactions';

interface BookingDetailsModalProps {
  bookingId: number;
  isOpen: boolean;
  onClose: () => void;
  onTransactionUpdate?: () => void;
}

// Simplified payment methods - only Cash and bKash
const PAYMENT_METHODS = ['CASH', 'BKASH'] as const;
const TRANSACTION_TYPES = ['BOOKING_PAYMENT', 'SLOT_PAYMENT'] as const;

const BookingDetailsModal: React.FC<BookingDetailsModalProps> = ({
  bookingId,
  isOpen,
  onClose,
  onTransactionUpdate
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<BookingPaymentSummary | null>(null);

  // Transaction form state
  const [transactionType, setTransactionType] = useState<TransactionType | ''>('SLOT_PAYMENT');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiscountMode, setIsDiscountMode] = useState(false);

  // Edit mode state
  const [editingTransaction, setEditingTransaction] = useState<TransactionDetail | null>(null);

  const fetchPaymentSummary = useCallback(async () => {
    if (!bookingId) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await getBookingPaymentSummary(bookingId);
      setPaymentSummary(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch booking details');
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    if (isOpen && bookingId) {
      fetchPaymentSummary();
    }
  }, [isOpen, bookingId, fetchPaymentSummary]);

  // Reset form when editing transaction changes
  useEffect(() => {
    if (editingTransaction) {
      const isDiscount = editingTransaction.transaction_type === 'DISCOUNT';
      setIsDiscountMode(isDiscount);
      setTransactionType(isDiscount ? 'DISCOUNT' : (editingTransaction.transaction_type as TransactionType));
      setPaymentMethod((editingTransaction.payment_method as PaymentMethod) || '');
      setAmount(editingTransaction.amount.toString());
    } else {
      setTransactionType('SLOT_PAYMENT');
      setPaymentMethod('');
      setAmount('');
      setIsDiscountMode(false);
    }
  }, [editingTransaction]);

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionType || (!isDiscountMode && !paymentMethod) || !amount) {
      setError('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, {
          transaction_type: transactionType as TransactionType,
          payment_method: isDiscountMode ? null : (paymentMethod as PaymentMethod),
          amount: parseFloat(amount)
        });
      } else {
        await addTransaction({
          booking_id: bookingId,
          transaction_type: transactionType as TransactionType,
          payment_method: isDiscountMode ? null : (paymentMethod as PaymentMethod),
          amount: parseFloat(amount)
        });
      }

      await fetchPaymentSummary();
      setTransactionType('SLOT_PAYMENT');
      setPaymentMethod('');
      setAmount('');
      setEditingTransaction(null);
      setIsDiscountMode(false);

      if (onTransactionUpdate) {
        onTransactionUpdate();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    if (!confirm('Delete this payment?')) return;

    try {
      await deleteTransaction(transactionId);
      await fetchPaymentSummary();
      setEditingTransaction(null);
      if (onTransactionUpdate) {
        onTransactionUpdate();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete transaction');
    }
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
    setTransactionType('SLOT_PAYMENT');
    setPaymentMethod('');
    setAmount('');
    setIsDiscountMode(false);
  };

  const handleToggleDiscount = () => {
    if (isSubmitting) return;
    const next = !isDiscountMode;
    setIsDiscountMode(next);
    if (next) {
      setTransactionType('DISCOUNT');
      setPaymentMethod('');
    } else {
      const fallbackType = editingTransaction && editingTransaction.transaction_type !== 'DISCOUNT'
        ? (editingTransaction.transaction_type as TransactionType)
        : 'SLOT_PAYMENT';
      setTransactionType(fallbackType);
    }
  };

  // Auto-fill remaining amount
  const handleAutoFillAmount = () => {
    if (paymentSummary && paymentSummary.summary.leftover > 0) {
      setAmount(paymentSummary.summary.leftover.toString());
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'SUCCESSFUL':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-600/20 text-green-400 border border-green-600/30">PAID</span>;
      case 'PARTIAL':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-orange-600/20 text-orange-400 border border-orange-600/30">PARTIAL</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-600/20 text-red-400 border border-red-600/30">UNPAID</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/70" onClick={onClose} />

        <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            {paymentSummary ? (
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-medium text-white">{paymentSummary.booking.name}</h2>
                  {getStatusBadge(paymentSummary.summary.status)}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(paymentSummary.booking.booking_date), 'MMM dd, yyyy')} · {paymentSummary.booking.time_slot}
                  {paymentSummary.booking.created_by && (
                    <span className="ml-2 text-gray-600">by {paymentSummary.booking.created_by}</span>
                  )}
                </p>
              </div>
            ) : (
              <div className="text-white text-sm">Loading...</div>
            )}
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-gray-500 text-sm">Loading...</div>
              </div>
            ) : error && !paymentSummary ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                {error}
              </div>
            ) : paymentSummary ? (
              <div className="space-y-4">
                {/* Payment Summary */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-800/50 rounded px-2 py-2.5">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Total</div>
                    <div className="text-base font-medium text-white">৳{paymentSummary.summary.total_price.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded px-2 py-2.5">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Paid</div>
                    <div className="text-base font-medium text-green-400">৳{paymentSummary.summary.total_paid.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded px-2 py-2.5">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Due</div>
                    <div className={`text-base font-medium ${paymentSummary.summary.leftover > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      ৳{paymentSummary.summary.leftover.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs">
                    {error}
                  </div>
                )}

                {/* Add Payment Form */}
                <form onSubmit={handleSubmitTransaction} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-400">
                      {editingTransaction ? 'Edit Payment' : 'Add Payment'}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleDiscount}
                      disabled={isSubmitting}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                        isDiscountMode
                          ? 'bg-orange-600/20 text-orange-300 border-orange-600/40'
                          : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
                      }`}
                    >
                      Discount
                    </button>
                  </div>
                  {/* Type Selection - Button Group */}
                  {!isDiscountMode ? (
                    <div className="flex gap-2">
                      <div className="flex rounded overflow-hidden border border-gray-700">
                        {TRANSACTION_TYPES.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTransactionType(type)}
                            disabled={isSubmitting}
                            className={`px-3 py-1.5 text-xs transition-colors ${
                              transactionType === type
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                          >
                            {type === 'BOOKING_PAYMENT' ? 'Booking' : 'Slot'}
                          </button>
                        ))}
                      </div>
                      <div className="flex rounded overflow-hidden border border-gray-700">
                        {PAYMENT_METHODS.map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentMethod(method)}
                            disabled={isSubmitting}
                            className={`px-3 py-1.5 text-xs transition-colors ${
                              paymentMethod === method
                                ? method === 'BKASH' ? 'bg-pink-600 text-white' : 'bg-green-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:text-white'
                            }`}
                          >
                            {method === 'BKASH' ? 'bKash' : 'Cash'}
                          </button>
                        ))}
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Amount"
                          className="w-full px-2 py-1.5 text-sm rounded bg-gray-800 border border-gray-700 text-white focus:border-orange-500 focus:outline-none"
                          required
                          min="0"
                          step="1"
                          disabled={isSubmitting}
                        />
                        {paymentSummary.summary.leftover > 0 && !amount && (
                          <button
                            type="button"
                            onClick={handleAutoFillAmount}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 hover:text-orange-300 bg-gray-800 px-1"
                          >
                            ৳{paymentSummary.summary.leftover}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="px-3 py-1.5 text-xs rounded border border-orange-600/40 bg-orange-600/10 text-orange-300">
                        Discount
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Discount amount"
                          className="w-full px-2 py-1.5 text-sm rounded bg-gray-800 border border-gray-700 text-white focus:border-orange-500 focus:outline-none"
                          required
                          min="0"
                          step="1"
                          disabled={isSubmitting}
                        />
                        {paymentSummary.summary.leftover > 0 && !amount && (
                          <button
                            type="button"
                            onClick={handleAutoFillAmount}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 hover:text-orange-300 bg-gray-800 px-1"
                          >
                            ৳{paymentSummary.summary.leftover}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {editingTransaction && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDeleteTransaction(editingTransaction.id)}
                          className="px-2 py-1 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded hover:bg-red-600/30 transition-colors"
                          disabled={isSubmitting}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-2 py-1 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                          disabled={isSubmitting}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      type="submit"
                      className="ml-auto px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-500 transition-colors disabled:opacity-50"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : editingTransaction ? 'Update' : 'Add Payment'}
                    </button>
                  </div>
                </form>

                {/* Payment History */}
                <div className="pt-3 border-t border-gray-800">
                  <div className="text-xs font-medium text-gray-400 mb-2">Payment History</div>
                  {paymentSummary.transactions.length === 0 ? (
                    <p className="text-gray-500 text-xs text-center py-4">No payments yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {paymentSummary.transactions.map((transaction) => {
                        const isDiscount = transaction.transaction_type === 'DISCOUNT';
                        const isAdjustment = transaction.transaction_type === 'OTHER_ADJUSTMENT';
                        const paymentLabel = isDiscount
                          ? 'Discount'
                          : transaction.payment_method === 'BKASH'
                          ? 'bKash'
                          : transaction.payment_method === 'CASH'
                          ? 'Cash'
                          : (transaction.payment_method || 'Other');
                        const typeLabel = isDiscount
                          ? 'Discount'
                          : isAdjustment
                          ? 'Adjustment'
                          : transaction.transaction_type === 'BOOKING_PAYMENT'
                          ? 'Booking'
                          : 'Slot';

                        return (
                          <div
                            key={transaction.id}
                            onClick={() => setEditingTransaction(transaction)}
                            className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                              editingTransaction?.id === transaction.id
                                ? 'bg-orange-600/10 border border-orange-600/30'
                                : 'bg-gray-800/50 border border-gray-800 hover:border-gray-700'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-medium ${
                                    isDiscount || isAdjustment || !transaction.payment_method
                                      ? 'text-orange-300'
                                      : transaction.payment_method === 'CASH'
                                      ? 'text-gray-300'
                                      : 'text-pink-400'
                                  }`}
                                >
                                  {paymentLabel}
                                </span>
                                <span className="text-[10px] text-gray-600">·</span>
                                <span className="text-[10px] text-gray-500">
                                  {typeLabel}
                                </span>
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {format(new Date(transaction.created_at), 'MMM dd, HH:mm')}
                              </div>
                            </div>
                            <div className="text-sm text-white font-medium">৳{transaction.amount.toLocaleString()}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookingDetailsModal;

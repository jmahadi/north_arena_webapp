'use client';

import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import {
  TransactionType,
  PaymentMethod,
  TransactionDetail
} from '../types/transactions';
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from '../api/transactions';
import { useBookingPaymentSummary, invalidateAll } from '../hooks/useApi';

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
  const [error, setError] = useState<string | null>(null);

  // Transaction form state
  const [transactionType, setTransactionType] = useState<TransactionType | ''>('SLOT_PAYMENT');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiscountMode, setIsDiscountMode] = useState(false);

  // Edit mode state
  const [editingTransaction, setEditingTransaction] = useState<TransactionDetail | null>(null);

  // SWR-powered payment summary (cached per booking, instant on reopen)
  const { paymentSummary, isLoading, refresh: refreshSummary } = useBookingPaymentSummary(bookingId, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

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

      await refreshSummary();
      invalidateAll();  // Refresh dashboard, bookings, journal caches
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
      await refreshSummary();
      invalidateAll();
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
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">PAID</span>;
      case 'PARTIAL':
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">PARTIAL</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/20">UNPAID</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center p-4 pt-10 sm:items-center sm:pt-4">
        <div className="fixed inset-0 bg-black/70 modal-backdrop" onClick={onClose} />

        <div className="relative w-full max-w-md glass-card rounded-2xl shadow-2xl glow-orange animate-scaleIn border-white/[0.08]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            {paymentSummary ? (
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white">{paymentSummary.booking.name}</h2>
                  {getStatusBadge(paymentSummary.summary.status)}
                </div>
                <p className="text-xs text-white/30 mt-0.5">
                  {format(new Date(paymentSummary.booking.booking_date), 'MMM dd, yyyy')} · {paymentSummary.booking.time_slot}
                  {paymentSummary.booking.created_by && (
                    <span className="ml-2 text-white/15">by {paymentSummary.booking.created_by}</span>
                  )}
                </p>
              </div>
            ) : (
              <div className="text-white/50 text-sm">Loading...</div>
            )}
            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-5 max-h-[78vh] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-white/30 text-sm">Loading...</div>
              </div>
            ) : error && !paymentSummary ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            ) : paymentSummary ? (
              <div className="space-y-4">
                {/* Payment Summary */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white/[0.03] rounded-xl px-2 py-3">
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Total</div>
                    <div className="text-base font-semibold text-white mt-0.5">৳{paymentSummary.summary.total_price.toLocaleString()}</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl px-2 py-3">
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Paid</div>
                    <div className="text-base font-semibold text-emerald-400 mt-0.5">৳{paymentSummary.summary.total_paid.toLocaleString()}</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl px-2 py-3">
                    <div className="text-[10px] text-white/25 uppercase tracking-wider">Due</div>
                    <div className={`text-base font-semibold mt-0.5 ${paymentSummary.summary.leftover > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      ৳{paymentSummary.summary.leftover.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                    {error}
                  </div>
                )}

                {/* Add Payment Form */}
                <form onSubmit={handleSubmitTransaction} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                      {editingTransaction ? 'Edit Payment' : 'Add Payment'}
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleDiscount}
                      disabled={isSubmitting}
                      className={`px-2 py-0.5 text-[10px] rounded-md border transition-all duration-200 ${
                        isDiscountMode
                          ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                          : 'bg-white/[0.02] text-white/30 border-white/[0.06] hover:text-white/50'
                      }`}
                    >
                      Discount
                    </button>
                  </div>
                  {/* Type Selection - Button Group */}
                  {!isDiscountMode ? (
                    <div className="flex gap-2">
                      <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
                        {TRANSACTION_TYPES.map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTransactionType(type)}
                            disabled={isSubmitting}
                            className={`px-3 py-1.5 text-xs transition-all duration-200 ${
                              transactionType === type
                                ? 'bg-orange-600 text-white'
                                : 'bg-white/[0.02] text-white/30 hover:text-white/50'
                            }`}
                          >
                            {type === 'BOOKING_PAYMENT' ? 'Booking' : 'Slot'}
                          </button>
                        ))}
                      </div>
                      <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
                        {PAYMENT_METHODS.map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setPaymentMethod(method)}
                            disabled={isSubmitting}
                            className={`px-3 py-1.5 text-xs transition-all duration-200 ${
                              paymentMethod === method
                                ? method === 'BKASH' ? 'bg-pink-600 text-white' : 'bg-emerald-600 text-white'
                                : 'bg-white/[0.02] text-white/30 hover:text-white/50'
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
                          className="glass-input w-full px-2 py-1.5 text-sm rounded-lg"
                          required
                          min="0"
                          step="1"
                          disabled={isSubmitting}
                        />
                        {paymentSummary.summary.leftover > 0 && !amount && (
                          <button
                            type="button"
                            onClick={handleAutoFillAmount}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 hover:text-orange-300 px-1"
                          >
                            ৳{paymentSummary.summary.leftover}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="px-3 py-1.5 text-xs rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300">
                        Discount
                      </div>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Discount amount"
                          className="glass-input w-full px-2 py-1.5 text-sm rounded-lg"
                          required
                          min="0"
                          step="1"
                          disabled={isSubmitting}
                        />
                        {paymentSummary.summary.leftover > 0 && !amount && (
                          <button
                            type="button"
                            onClick={handleAutoFillAmount}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 hover:text-orange-300 px-1"
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
                          className="px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/15 transition-all duration-200"
                          disabled={isSubmitting}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-2 py-1 text-xs bg-white/[0.03] text-white/40 rounded-lg hover:bg-white/[0.06] transition-all duration-200"
                          disabled={isSubmitting}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      type="submit"
                      className="btn-glow ml-auto px-3 py-1 text-xs bg-orange-600 text-white rounded-lg transition-all duration-300 disabled:opacity-50"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : editingTransaction ? 'Update' : 'Add Payment'}
                    </button>
                  </div>
                </form>

                {/* Payment History */}
                <div className="pt-3 border-t border-white/[0.06]">
                  <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Payment History</div>
                  {paymentSummary.transactions.length === 0 ? (
                    <p className="text-white/20 text-xs text-center py-4">No payments yet</p>
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
                            className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                              editingTransaction?.id === transaction.id
                                ? 'bg-orange-500/10 border border-orange-500/20'
                                : 'bg-white/[0.02] border border-white/[0.04] hover:border-white/10 hover:bg-white/[0.04]'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-xs font-medium ${
                                    isDiscount || isAdjustment || !transaction.payment_method
                                      ? 'text-orange-300'
                                      : transaction.payment_method === 'CASH'
                                      ? 'text-white/60'
                                      : 'text-pink-400'
                                  }`}
                                >
                                  {paymentLabel}
                                </span>
                                <span className="text-[10px] text-white/15">·</span>
                                <span className="text-[10px] text-white/25">
                                  {typeLabel}
                                </span>
                              </div>
                              <div className="text-[10px] text-white/20 mt-0.5">
                                {format(new Date(transaction.created_at), 'MMM dd, HH:mm')}
                              </div>
                            </div>
                            <div className="text-sm text-white font-semibold">৳{transaction.amount.toLocaleString()}</div>
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

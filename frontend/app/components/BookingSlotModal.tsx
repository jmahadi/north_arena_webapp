'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { searchCustomers, CustomerSuggestion } from '../api/bookings';
import {
  TransactionType,
  PaymentMethod,
  TransactionDetail,
} from '../types/transactions';
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from '../api/transactions';
import { useBookingPaymentSummary, invalidateAll, useMe } from '../hooks/useApi';

const TIME_SLOTS = [
  '9:30 AM - 11:00 AM',
  '11:00 AM - 12:30 PM',
  '12:30 PM - 2:00 PM',
  '3:00 PM - 4:30 PM',
  '4:30 PM - 6:00 PM',
  '6:00 PM - 7:30 PM',
  '7:30 PM - 9:00 PM',
  '9:00 PM - 10:30 PM',
] as const;

type TimeSlot = typeof TIME_SLOTS[number];

const PAYMENT_METHODS = ['CASH', 'BKASH'] as const;
const TRANSACTION_TYPES = ['BOOKING_PAYMENT', 'SLOT_PAYMENT'] as const;
const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// `/api/booking-payment-summary` returns status.value ("Successful"), while
// `/api/bookings` returns status.name ("SUCCESSFUL"). Normalize so the matrix
// cache always holds the uppercase form regardless of which endpoint the value
// came from.
function normalizeStatus(raw: any): 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null {
  if (!raw) return null;
  const up = String(raw).toUpperCase();
  if (up === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (up === 'PARTIAL') return 'PARTIAL';
  if (up === 'PENDING') return 'PENDING';
  return null;
}

export interface CancelledSlotEntry {
  id: number;
  name: string;
  phone: string;
  booking_type: 'NORMAL' | 'ACADEMY';
  transaction_status?: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;
  total_price: number;
  total_paid: number;
  leftover: number;
  cancelled_at?: string | null;
}

export interface SlotBookingDraft {
  id: number | null;
  name: string;
  phone: string;
  selectedDate: string;
  selectedSlot: TimeSlot | '';
  bookingType: 'NORMAL' | 'ACADEMY';
  academyStartDate: string;
  academyEndDate: string;
  academyDaysOfWeek: string[];
  isBulkBooking: boolean;
  transactionStatus: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null;
  // True when the draft represents an already-cancelled booking (opened from the
  // retained-money overlay) — the form flips to a view/restore mode.
  isCancelled?: boolean;
  // Cancelled-but-paid bookings that also sit on this slot (shown as a banner so
  // a re-booked slot surfaces both its live booking and its cancelled history).
  cancelledOnSlot?: CancelledSlotEntry[];
}

interface BookingSlotModalProps {
  isOpen: boolean;
  draft: SlotBookingDraft;
  onClose: () => void;
  onSubmit: (draft: SlotBookingDraft) => Promise<void>;
  onDelete: (bookingId: number) => Promise<void>;
  onCancel?: (bookingId: number, restore?: boolean) => Promise<void>;
  onOpenCancelled?: (entry: CancelledSlotEntry) => void;
  onStatusChange?: (bookingId: number, status: 'PENDING' | 'PARTIAL' | 'SUCCESSFUL' | null) => void;
  // Must return a promise that resolves once the matrix bookings cache is fully
  // re-fetched. The modal awaits this before clearing the saving state so the
  // user cannot close the dialog onto stale data.
  refreshMatrix?: () => Promise<any>;
}

export default function BookingSlotModal({
  isOpen,
  draft,
  onClose,
  onSubmit,
  onDelete,
  onCancel,
  onOpenCancelled,
  onStatusChange,
  refreshMatrix,
}: BookingSlotModalProps) {
  const [name, setName] = useState(draft.name);
  const [phone, setPhone] = useState(draft.phone);
  const [selectedDate, setSelectedDate] = useState(draft.selectedDate);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | ''>(draft.selectedSlot);
  const [bookingType, setBookingType] = useState<'NORMAL' | 'ACADEMY'>(draft.bookingType);
  const [academyStartDate, setAcademyStartDate] = useState(draft.academyStartDate);
  const [academyEndDate, setAcademyEndDate] = useState(draft.academyEndDate);
  const [academyDaysOfWeek, setAcademyDaysOfWeek] = useState<string[]>(draft.academyDaysOfWeek);
  const [isBulkBooking, setIsBulkBooking] = useState(draft.isBulkBooking);
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Customer name/phone autocomplete
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  // Suppress the search that would otherwise fire right after a pick or reseed.
  const suppressSearchRef = useRef(false);

  // Payment state
  const [transactionType, setTransactionType] = useState<TransactionType | ''>('SLOT_PAYMENT');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [amount, setAmount] = useState('');
  const [isDiscountMode, setIsDiscountMode] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionDetail | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const bookingId = draft.id;
  const { isMaster } = useMe();
  const { paymentSummary, isLoading: isLoadingPayment, refresh: refreshSummary } = useBookingPaymentSummary(
    bookingId,
    isOpen && !!bookingId,
  );

  // Re-seed form fields whenever the draft changes (different slot selected)
  useEffect(() => {
    if (!isOpen) return;
    setName(draft.name);
    setPhone(draft.phone);
    setSelectedDate(draft.selectedDate);
    setSelectedSlot(draft.selectedSlot);
    setBookingType(draft.bookingType);
    setAcademyStartDate(draft.academyStartDate);
    setAcademyEndDate(draft.academyEndDate);
    setAcademyDaysOfWeek(draft.academyDaysOfWeek);
    setIsBulkBooking(draft.isBulkBooking);
    setFormError(null);
    setPaymentError(null);
    setEditingTransaction(null);
    setTransactionType('SLOT_PAYMENT');
    setPaymentMethod('');
    setAmount('');
    setIsDiscountMode(false);
    // Don't pop suggestions from the value we just seeded into the field.
    suppressSearchRef.current = true;
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  }, [draft.id, draft.selectedDate, draft.selectedSlot, isOpen]);

  // Debounced customer type-ahead. Fires ~200ms after the name stops changing.
  useEffect(() => {
    if (!isOpen) return;
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    const term = name.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const handle = setTimeout(async () => {
      const results = await searchCustomers(term);
      // Hide a lone exact match (nothing left to complete).
      const filtered = results.filter(
        (r) => !(results.length === 1 && r.name.toLowerCase() === term.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setActiveSuggestion(-1);
    }, 200);
    return () => clearTimeout(handle);
  }, [name, isOpen]);

  const applySuggestion = (s: CustomerSuggestion) => {
    suppressSearchRef.current = true;
    setName(s.name);
    setPhone(s.phone);
    setShowSuggestions(false);
    setActiveSuggestion(-1);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeSuggestion >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeSuggestion]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, [isOpen]);

  // Sync payment form when editing
  useEffect(() => {
    if (editingTransaction) {
      const isDiscount = editingTransaction.transaction_type === 'DISCOUNT';
      setIsDiscountMode(isDiscount);
      setTransactionType(isDiscount ? 'DISCOUNT' : (editingTransaction.transaction_type as TransactionType));
      setPaymentMethod((editingTransaction.payment_method as PaymentMethod) || '');
      setAmount(editingTransaction.amount.toString());
    }
  }, [editingTransaction]);

  const liveStatus = paymentSummary?.summary?.status ?? draft.transactionStatus;

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingBooking(true);
    setFormError(null);
    try {
      await onSubmit({
        ...draft,
        name,
        phone,
        selectedDate,
        selectedSlot,
        bookingType,
        academyStartDate,
        academyEndDate,
        academyDaysOfWeek,
        isBulkBooking,
      });
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save booking');
    } finally {
      setIsSavingBooking(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!bookingId) return;
    await onDelete(bookingId);
  };

  const isCancelled = !!draft.isCancelled;
  const cancelledOnSlot = draft.cancelledOnSlot || [];

  const handleCancelBooking = async () => {
    if (!bookingId || !onCancel) return;
    await onCancel(bookingId, false);
  };

  const handleRestoreBooking = async () => {
    if (!bookingId || !onCancel) return;
    await onCancel(bookingId, true);
  };

  const handleSubmitTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId) return;
    if (!transactionType || (!isDiscountMode && !paymentMethod) || !amount) {
      setPaymentError('Please fill in all payment fields');
      return;
    }
    setIsSubmittingPayment(true);
    setPaymentError(null);
    try {
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, {
          transaction_type: transactionType as TransactionType,
          payment_method: isDiscountMode ? null : (paymentMethod as PaymentMethod),
          amount: parseFloat(amount),
        });
      } else {
        await addTransaction({
          booking_id: bookingId,
          transaction_type: transactionType as TransactionType,
          payment_method: isDiscountMode ? null : (paymentMethod as PaymentMethod),
          amount: parseFloat(amount),
        });
      }
      // Refresh both stores in parallel and AWAIT both. The matrix cache must
      // settle before we let the user close the modal, otherwise a still-in-
      // flight revalidation can stomp the optimistic patch and leave the icon
      // showing the previous status.
      const [updated] = await Promise.all([
        refreshSummary(),
        refreshMatrix ? refreshMatrix() : Promise.resolve(),
      ]);
      if (onStatusChange && updated && (updated as any).summary) {
        onStatusChange(bookingId, normalizeStatus((updated as any).summary.status));
      }
      // Dashboard/journal caches are background-only; safe to fire-and-forget.
      invalidateAll();
      setTransactionType('SLOT_PAYMENT');
      setPaymentMethod('');
      setAmount('');
      setIsDiscountMode(false);
      setEditingTransaction(null);
    } catch (err: any) {
      setPaymentError(err?.message || 'Failed to save payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    if (!bookingId) return;
    if (!confirm('Delete this payment?')) return;
    try {
      await deleteTransaction(transactionId);
      const [updated] = await Promise.all([
        refreshSummary(),
        refreshMatrix ? refreshMatrix() : Promise.resolve(),
      ]);
      if (onStatusChange && updated && (updated as any).summary) {
        onStatusChange(bookingId, normalizeStatus((updated as any).summary.status));
      } else if (onStatusChange) {
        // No transactions left → trigger deletes the summary row. Reset to null
        // so the matrix icon drops back to the unpaid red dot.
        onStatusChange(bookingId, null);
      }
      invalidateAll();
      setEditingTransaction(null);
    } catch (err: any) {
      setPaymentError(err?.message || 'Failed to delete payment');
    }
  };

  const handleToggleDiscount = () => {
    if (isSubmittingPayment) return;
    const next = !isDiscountMode;
    setIsDiscountMode(next);
    if (next) {
      setTransactionType('DISCOUNT');
      setPaymentMethod('');
    } else {
      setTransactionType('SLOT_PAYMENT');
    }
  };

  const handleAutoFillAmount = () => {
    if (paymentSummary && paymentSummary.summary.leftover > 0) {
      setAmount(paymentSummary.summary.leftover.toString());
    }
  };

  const statusBadge = useMemo(() => {
    const s = liveStatus?.toUpperCase();
    if (s === 'SUCCESSFUL')
      return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">PAID</span>;
    if (s === 'PARTIAL')
      return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/20">PARTIAL</span>;
    if (bookingId)
      return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/20">UNPAID</span>;
    return null;
  }, [liveStatus, bookingId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center p-4 pt-10 sm:items-center sm:pt-4">
        <div className="fixed inset-0 bg-black/70 modal-backdrop" onClick={onClose} />

        <div className="relative w-full max-w-2xl glass-card rounded-2xl shadow-2xl glow-orange animate-scaleIn border-white/[0.08]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">
                  {bookingId ? (name || 'Booking') : 'New Booking'}
                </h2>
                {statusBadge}
                {isCancelled && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
                    CANCELLED
                  </span>
                )}
              </div>
              <p className="text-xs text-white/30 mt-0.5">
                {selectedDate && format(new Date(selectedDate), 'MMM dd, yyyy')}
                {selectedSlot ? ` · ${selectedSlot}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.05]">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Banners span the full width above the two-column body */}
          {(isCancelled || cancelledOnSlot.length > 0) && (
            <div className="px-5 pt-4 space-y-2">
              {isCancelled && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="text-xs text-red-300">
                    This booking is <span className="font-semibold">cancelled</span>. Its payments are kept on the books.
                    You can review/refund below or restore the slot.
                  </div>
                  {onCancel && (
                    <button
                      type="button"
                      onClick={handleRestoreBooking}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium text-emerald-300 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/10 transition-all duration-200"
                    >
                      Restore
                    </button>
                  )}
                </div>
              )}

              {!isCancelled && cancelledOnSlot.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="text-[11px] font-medium text-amber-300/90 uppercase tracking-wider">
                    Cancelled bookings on this slot (money retained)
                  </div>
                  {cancelledOnSlot.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="text-white/70 font-medium line-through truncate">{c.name}</span>
                        <span className="text-white/30"> · </span>
                        <span className="text-emerald-300">৳{c.total_paid.toLocaleString()} paid</span>
                        {c.leftover > 0 && <span className="text-white/30"> · ৳{c.leftover.toLocaleString()} due</span>}
                      </div>
                      {onOpenCancelled && (
                        <button
                          type="button"
                          onClick={() => onOpenCancelled(c)}
                          className="shrink-0 text-amber-300 hover:text-amber-200 underline-offset-2 hover:underline"
                        >
                          View
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-5 max-h-[78vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Booking form */}
            <form onSubmit={handleBookingSubmit} className="space-y-3">
              <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                {bookingId ? 'Edit Booking' : 'Create Booking'}
              </div>

              <div>
                <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBookingType('NORMAL')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      bookingType === 'NORMAL'
                        ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                        : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingType('ACADEMY')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                      bookingType === 'ACADEMY'
                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                        : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                    }`}
                  >
                    Academy
                  </button>
                </div>
              </div>

              {/* Name + Phone share a row on every screen — saves ~50px of
                  vertical space so the payment section sits above the fold
                  on mobile without a scroll. */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    className="glass-input w-full rounded-lg p-2 text-sm"
                    autoComplete="off"
                    required
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <ul className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#15151a] shadow-2xl scrollbar-sleek">
                      {suggestions.map((s, i) => (
                        <li
                          key={`${s.phone}-${i}`}
                          // onMouseDown (not onClick) so it fires before the input's onBlur.
                          onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                          className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 ${
                            i === activeSuggestion ? 'bg-orange-500/15' : 'hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="text-sm text-white truncate">{s.name}</span>
                          <span className="text-xs text-white/40 shrink-0">{s.phone}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="glass-input w-full rounded-lg p-2 text-sm"
                    required
                  />
                </div>
              </div>

              {bookingType === 'NORMAL' ? (
                <>
                  {!bookingId && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isBulkBooking}
                        onChange={(e) => setIsBulkBooking(e.target.checked)}
                        className="accent-orange-500"
                      />
                      <span className="text-xs text-white/50">Bulk (multiple days)</span>
                    </label>
                  )}

                  {isBulkBooking ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Start</label>
                        <input
                          type="date"
                          value={academyStartDate}
                          onChange={(e) => {
                            setAcademyStartDate(e.target.value);
                            setSelectedDate(e.target.value);
                          }}
                          className="glass-input w-full rounded-lg p-2 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">End</label>
                        <input
                          type="date"
                          value={academyEndDate}
                          onChange={(e) => setAcademyEndDate(e.target.value)}
                          min={academyStartDate}
                          className="glass-input w-full rounded-lg p-2 text-sm"
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    // Normal single-day booking: date + slot share one row.
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Date</label>
                        <input
                          type="date"
                          value={selectedDate}
                          onChange={(e) => setSelectedDate(e.target.value)}
                          className="glass-input w-full rounded-lg p-2 text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Time Slot</label>
                        <select
                          value={selectedSlot}
                          onChange={(e) => setSelectedSlot(e.target.value as TimeSlot)}
                          className="glass-input w-full rounded-lg p-2 text-sm"
                          required
                        >
                          <option value="">Select…</option>
                          {TIME_SLOTS.map((slot) => (
                            <option key={slot} value={slot}>{slot}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Academy Start</label>
                    <input
                      type="date"
                      value={academyStartDate}
                      onChange={(e) => {
                        setAcademyStartDate(e.target.value);
                        setSelectedDate(e.target.value);
                      }}
                      className="glass-input w-full rounded-lg p-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Academy End</label>
                    <input
                      type="date"
                      value={academyEndDate}
                      onChange={(e) => setAcademyEndDate(e.target.value)}
                      min={academyStartDate}
                      className="glass-input w-full rounded-lg p-2 text-sm"
                      required
                    />
                  </div>
                </div>
              )}

              {(bookingType === 'ACADEMY' || isBulkBooking) && (
                <div>
                  <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Days of Week</label>
                  <div className="flex flex-wrap gap-1">
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = academyDaysOfWeek.includes(day);
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => {
                            if (isSelected) setAcademyDaysOfWeek(academyDaysOfWeek.filter((d) => d !== day));
                            else setAcademyDaysOfWeek([...academyDaysOfWeek, day]);
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] transition-all duration-150 ${
                            isSelected
                              ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                              : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                          }`}
                        >
                          {day.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time slot is rendered inline next to Date for normal
                  single-day bookings (above). Bulk + academy bookings span
                  multiple days, so the slot picker stays on its own row. */}
              {(bookingType === 'ACADEMY' || isBulkBooking) && (
                <div>
                  <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Time Slot</label>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value as TimeSlot)}
                    className="glass-input w-full rounded-lg p-2 text-sm"
                    required
                  >
                    <option value="">Select a time slot</option>
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              )}

              {formError && (
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {isCancelled ? (
                  // Cancelled view: restoring / deleting only. Editing a cancelled
                  // booking's details isn't offered — restore it first.
                  <>
                    {onCancel && (
                      <button
                        type="button"
                        onClick={handleRestoreBooking}
                        className="btn-glow flex-1 px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-lg transition-all duration-300"
                      >
                        Restore Booking
                      </button>
                    )}
                    {isMaster && (
                      <button
                        type="button"
                        onClick={handleDeleteBooking}
                        className="px-3 py-2 text-xs font-medium text-red-400 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-all duration-200"
                      >
                        Delete
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="submit"
                      disabled={isSavingBooking}
                      className="btn-glow flex-1 px-3 py-2 text-xs font-medium bg-orange-600 text-white rounded-lg transition-all duration-300 disabled:opacity-50"
                    >
                      {isSavingBooking ? 'Saving...' : bookingId ? 'Update Booking' : 'Create Booking'}
                    </button>
                    {bookingId && onCancel && (
                      <button
                        type="button"
                        onClick={handleCancelBooking}
                        className="px-3 py-2 text-xs font-medium text-amber-300 rounded-lg border border-amber-500/25 hover:bg-amber-500/10 transition-all duration-200"
                      >
                        Mark Cancelled
                      </button>
                    )}
                    {bookingId && isMaster && (
                      <button
                        type="button"
                        onClick={handleDeleteBooking}
                        className="px-3 py-2 text-xs font-medium text-red-400 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-all duration-200"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </form>

            {/* Payment side */}
            <div className="space-y-3 md:border-l md:border-white/[0.06] md:pl-5">
              <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                Payment {!bookingId && '· save booking first'}
              </div>

              {!bookingId ? (
                <div className="text-white/30 text-xs py-6 text-center">
                  Save the booking to manage payments.
                </div>
              ) : !paymentSummary ? (
                // Covers both: initial fetch in flight, AND error case where
                // SWR settled with no data. Previously the error case rendered
                // null, leaving just a bare "Payment" header — the modal looked
                // half-broken. Now we always show feedback + an explicit retry.
                <div className="py-6 text-center space-y-2">
                  <div className="text-white/30 text-sm">
                    {isLoadingPayment ? 'Loading payment summary…' : 'Could not load payment summary'}
                  </div>
                  {!isLoadingPayment && (
                    <button
                      type="button"
                      onClick={() => refreshSummary()}
                      className="text-xs text-orange-400 hover:text-orange-300 underline-offset-2 hover:underline"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/[0.03] rounded-xl px-2 py-2.5">
                      <div className="text-[10px] text-white/25 uppercase tracking-wider">Total</div>
                      <div className="text-sm font-semibold text-white mt-0.5">৳{paymentSummary.summary.total_price.toLocaleString()}</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl px-2 py-2.5">
                      <div className="text-[10px] text-white/25 uppercase tracking-wider">Paid</div>
                      <div className="text-sm font-semibold text-emerald-400 mt-0.5">৳{paymentSummary.summary.total_paid.toLocaleString()}</div>
                    </div>
                    <div className="bg-white/[0.03] rounded-xl px-2 py-2.5">
                      <div className="text-[10px] text-white/25 uppercase tracking-wider">Due</div>
                      <div className={`text-sm font-semibold mt-0.5 ${paymentSummary.summary.leftover > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        ৳{paymentSummary.summary.leftover.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Attribution: who created / last edited this booking */}
                  <div className="text-[10px] text-white/30">
                    Booked by <span className="text-white/50">{paymentSummary.booking.created_by || 'Unknown'}</span>
                    {paymentSummary.booking.last_modified_by &&
                      paymentSummary.booking.last_modified_by !== paymentSummary.booking.created_by && (
                        <> · edited by <span className="text-white/50">{paymentSummary.booking.last_modified_by}</span></>
                      )}
                  </div>

                  {paymentError && (
                    <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                      {paymentError}
                    </div>
                  )}

                  <form onSubmit={handleSubmitTransaction} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider">
                        {editingTransaction ? 'Edit Payment' : 'Add Payment'}
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleDiscount}
                        disabled={isSubmittingPayment}
                        className={`px-2 py-0.5 text-[10px] rounded-md border transition-all duration-200 ${
                          isDiscountMode
                            ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                            : 'bg-white/[0.02] text-white/30 border-white/[0.06] hover:text-white/50'
                        }`}
                      >
                        Discount
                      </button>
                    </div>

                    {!isDiscountMode ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex rounded-lg overflow-hidden border border-white/[0.06]">
                          {TRANSACTION_TYPES.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setTransactionType(type)}
                              disabled={isSubmittingPayment}
                              className={`flex-1 px-2 py-1.5 text-xs transition-all duration-200 ${
                                transactionType === type ? 'bg-orange-600 text-white' : 'bg-white/[0.02] text-white/30 hover:text-white/50'
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
                              disabled={isSubmittingPayment}
                              className={`flex-1 px-2 py-1.5 text-xs transition-all duration-200 ${
                                paymentMethod === method
                                  ? method === 'BKASH' ? 'bg-pink-600 text-white' : 'bg-emerald-600 text-white'
                                  : 'bg-white/[0.02] text-white/30 hover:text-white/50'
                              }`}
                            >
                              {method === 'BKASH' ? 'bKash' : 'Cash'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="px-3 py-1.5 text-xs rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-300 inline-block">
                        Discount
                      </div>
                    )}

                    <div className="relative">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Amount"
                        className="glass-input w-full px-2 py-1.5 text-sm rounded-lg"
                        required
                        min="0"
                        step="1"
                        disabled={isSubmittingPayment}
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

                    <div className="flex gap-2 pt-1">
                      {editingTransaction && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDeleteTransaction(editingTransaction.id)}
                            className="px-2 py-1 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/15 transition-all duration-200"
                            disabled={isSubmittingPayment}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTransaction(null)}
                            className="px-2 py-1 text-xs bg-white/[0.03] text-white/40 rounded-lg hover:bg-white/[0.06] transition-all duration-200"
                            disabled={isSubmittingPayment}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      <button
                        type="submit"
                        className="btn-glow ml-auto px-3 py-1 text-xs bg-orange-600 text-white rounded-lg transition-all duration-300 disabled:opacity-50"
                        disabled={isSubmittingPayment}
                      >
                        {isSubmittingPayment ? 'Saving...' : editingTransaction ? 'Update' : 'Add Payment'}
                      </button>
                    </div>
                  </form>

                  <div className="pt-3 border-t border-white/[0.06]">
                    <div className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-2">Payment History</div>
                    {paymentSummary.transactions.length === 0 ? (
                      <p className="text-white/20 text-xs text-center py-3">No payments yet</p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
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
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200 ${
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
                                  <span className="text-[10px] text-white/25">{typeLabel}</span>
                                </div>
                                <div className="text-[10px] text-white/20 mt-0.5">
                                  {format(new Date(transaction.created_at), 'MMM dd, HH:mm')}
                                  {transaction.created_by && <> · by {transaction.created_by}</>}
                                </div>
                              </div>
                              <div className="text-sm text-white font-semibold">৳{transaction.amount.toLocaleString()}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

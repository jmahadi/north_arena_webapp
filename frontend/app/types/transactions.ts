// types/transactions.ts

export enum TransactionType {
  BOOKING_PAYMENT = "BOOKING_PAYMENT",
  SLOT_PAYMENT = "SLOT_PAYMENT",
  DISCOUNT = "DISCOUNT",
  OTHER_ADJUSTMENT = "OTHER_ADJUSTMENT"
}

export enum PaymentMethod {
  CASH = "CASH",
  BKASH = "BKASH",
  NAGAD = "NAGAD",
  CARD = "CARD",
  BANK_TRANSFER = "BANK_TRANSFER"
}

export enum TransactionStatus {
  PENDING = "PENDING",
  SUCCESSFUL = "SUCCESSFUL",
  PARTIAL = "PARTIAL"
}

// Base API response type
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

// Transaction data for creating/updating
export interface TransactionData {
  booking_id: number;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  amount: number;
  created_at?: string; // Optional for frontend, handled by backend
}

// Transaction detail from API
export interface TransactionDetail {
  id: number;
  booking_id: number;
  transaction_type: string; // Using string for flexibility with enum
  payment_method: string;   // Using string for flexibility with enum
  amount: number;
  created_by: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
  creator?: string;         // Added for better display
}

// Transaction from list view
export interface Transaction {
  id: number;
  booking_date: string;
  time_slot: string;
  transaction_type: string;
  payment_method: string;
  amount: number;
  creator: string;
  created_at: string;
}

// Summary of transactions for a booking
export interface TransactionSummary {
  booking_id: number;
  booking_date: string;
  slot: string;
  status: string;         // Using string for flexibility with enum
  total_paid: number;
  leftover: number;
  booking_payment: number;
  slot_payment: number;
  cash_payment: number;
  bkash_payment: number;
  nagad_payment?: number;
  card_payment?: number;
  bank_transfer_payment?: number;
  last_payment_date: string;
  booking_payment_date?: string;
}
import api from '../utils/axios';
import { 
  Transaction,
  TransactionType, 
  PaymentMethod, 
  TransactionDetail,
  TransactionSummary,
  ApiResponse 
} from '../types/transactions';

interface TransactionData {
  booking_id: number;
  transaction_type: TransactionType;
  payment_method: PaymentMethod;
  amount: number;
  // This field is handled by the backend, not required in UI
  created_at?: string;
  
  
}

export const getBookingsForDate = async (date: string) => {
  try {
    const response = await api.get('/bookings_for_date', {
      params: { date }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching bookings for date:', error);
    throw error;
  }
};

export const getTransactions = async (startDate: string, endDate: string): Promise<any> => {
  try {
    const response = await api.get('/transactions_list', {
      params: { start_date: startDate, end_date: endDate }
    });

    // FIXED: Be explicit about success property check
    if (response.data && response.data.success === false) {
      throw new Error('Failed to fetch transactions');
    }


    return response.data;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
};

export const getTransactionDetails = async (bookingId: number): Promise<TransactionDetail[]> => {
  try {
    const response = await api.get<{ success: boolean; transactions: TransactionDetail[] }>('/transaction_details', {
      params: { booking_id: bookingId }
    });
    console.log('Details Response:', response.data); // Debug log
    
    // FIXED: Check for success property only, message might not exist
    if (response.data && response.data.success === false) {
      throw new Error('Failed to fetch transaction details');
    }
    
    return response.data.transactions || [];
  } catch (error: any) {
    // Better error handling
    if (error.response) {
      console.error('Error Response:', error.response.data);
      console.error('Error Status:', error.response.status);
      
      if (error.response.status === 404) {
        return []; // Return empty array for no transactions found
      }
      
      throw new Error(error.response.data?.message || 'Failed to fetch transaction details');
    } else if (error.request) {
      console.error('Error Request:', error.request);
      throw new Error('No response received from server');
    } else {
      console.error('Error:', error.message);
      throw new Error(error.message || 'Error setting up request');
    }
  }
};



export const getTransactionSummaries = async (): Promise<TransactionSummary[]> => {
  try {
    // Define a more specific response type that matches your API response structure
    interface SummaryResponse {
      success: boolean;
      summaries: TransactionSummary[];
      message?: string;
    }
    
    // Use the specific response type directly
    const response = await api.get<SummaryResponse>('/transaction_summaries');
    console.log('Raw API Response:', response.data);
    
    if (response.data && response.data.success === false) {
      throw new Error('Failed to fetch transaction summaries');
    }
    
    // Now TypeScript knows that response.data has a summaries property
    return response.data.summaries || [];
  } catch (error: any) {
    console.error('Error fetching transaction summaries:', error);
    if (error.response) {
      console.error('Error Response:', error.response.data);
    }
    throw new Error(error.message || 'Failed to fetch transaction summaries');
  }
};



// FIXED: Updated to handle form data correctly 
export const updateTransaction = async (
  transactionId: number, 
  data: Partial<TransactionData>
): Promise<ApiResponse> => {
  try {
    console.log('Updating transaction:', transactionId, 'with data:', data);
    
    const formData = new FormData();
    formData.append('transaction_id', transactionId.toString());
    
    // FIXED: Properly check and convert transaction type
    if (data.transaction_type) {
      formData.append('transaction_type', data.transaction_type.toString());
    }
    
    // FIXED: Properly check and convert payment method
    if (data.payment_method) {
      formData.append('payment_method', data.payment_method.toString());
    }
    
    // FIXED: Check for undefined instead of falsy (0 is falsy but valid)
    if (data.amount !== undefined) {
      formData.append('amount', data.amount.toString());
    }

    const response = await api.post<ApiResponse>('/update_transaction', formData);
    console.log('Update response:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('Error updating transaction:', error);
    if (error.response?.data?.detail) {
      const details = error.response.data.detail
        .map((err: any) => `${err.loc.join('.')} - ${err.msg}`)
        .join('; ');
      throw new Error(`Validation error: ${details}`);
    }
    throw error;
  }
};

// ADDED: Delete transaction function
export const deleteTransaction = async (transactionId: number): Promise<ApiResponse> => {
  try {
    const response = await api.delete<ApiResponse>(`/delete_transaction/${transactionId}`);
    return response.data;
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    if (error.response?.data?.detail) {
      const details = error.response.data.detail
        .map((err: any) => `${err.loc.join('.')} - ${err.msg}`)
        .join('; ');
      throw new Error(`Validation error: ${details}`);
    }
    throw error;
  }
};

export const addTransaction = async (data: TransactionData): Promise<ApiResponse> => {
  try {
    // Create FormData object instead of URLSearchParams
    const formData = new FormData();
    formData.append('booking_id', data.booking_id.toString());
    formData.append('transaction_type', data.transaction_type.toString());
    formData.append('payment_method', data.payment_method.toString());
    formData.append('amount', data.amount.toString());
    // Add current timestamp in the required format
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0] + ' ' + 
                         now.toTimeString().split(' ')[0];
    formData.append('created_at', formattedDate);

    const response = await api.post<ApiResponse>('/add_transaction', formData);
    
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.detail) {
      // Format FastAPI validation error
      const details = error.response.data.detail
        .map((err: any) => `${err.loc.join('.')} - ${err.msg}`)
        .join('; ');
      throw new Error(`Validation error: ${details}`);
    }
    throw error;
  }
};
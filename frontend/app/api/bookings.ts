import api from '../utils/axios';

export const fetchBookings = async (startDate: string, endDate: string) => {
  try {
    const response = await api.get('/api/bookings', { params: { start_date: startDate, end_date: endDate } });
    console.log('Bookings data received:', response.data);
    
    // Ensure the booked_by property is present in each booking
    const bookingsData = response.data.bookingsData || {};
    Object.keys(bookingsData).forEach(key => {
      if (!bookingsData[key].booked_by) {
        bookingsData[key].booked_by = 'Unknown'; // Or any default value
      }
    });
    
    return { bookingsData };
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
};

  // UPDATED: Add startDate and endDate parameters to addBooking
  export const addBooking = async (
    name: string,
    phone: string,
    bookingDate: string,
    timeSlot: string,
    startDate?: string,
    endDate?: string,
    bookingType?: 'NORMAL' | 'ACADEMY',
    academyStartDate?: string,
    academyEndDate?: string,
    academyDaysOfWeek?: string[]
  ) => {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('booking_date', bookingDate);
  formData.append('time_slot', timeSlot);

  // Add date range parameters if provided
  if (startDate) formData.append('start_date', startDate);
  if (endDate) formData.append('end_date', endDate);

  // Add booking type parameter
  if (bookingType) {
    formData.append('booking_type', bookingType);
  }

  // Add academy/bulk booking date parameters
  // These are used for both ACADEMY bookings and bulk NORMAL bookings
  if (academyStartDate) formData.append('academy_start_date', academyStartDate);
  if (academyEndDate) formData.append('academy_end_date', academyEndDate);
  if (academyDaysOfWeek && academyDaysOfWeek.length > 0) {
    formData.append('academy_days_of_week', academyDaysOfWeek.join(','));
  }

  try {
    const response = await api.post('/api/add_booking', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('Booking added successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error adding booking:', error);
    throw error;
  }
};

export const updateBooking = async (
  bookingId: number,
  name: string,
  phone: string,
  bookingDate: string,
  timeSlot: string,
  startDate?: string,  // Added optional startDate parameter
  endDate?: string,    // Added optional endDate parameter
  bookingType?: 'NORMAL' | 'ACADEMY',
  academyStartDate?: string,
  academyEndDate?: string,
  academyDaysOfWeek?: string[]
) => {
  const formData = new FormData();
  formData.append('booking_id', bookingId.toString());
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('booking_date', bookingDate);
  formData.append('time_slot', timeSlot);

  // Add date range parameters if provided
  if (startDate) formData.append('start_date', startDate);
  if (endDate) formData.append('end_date', endDate);

  // Add booking type parameter
  if (bookingType) {
    formData.append('booking_type', bookingType);
  }

  // Add academy/bulk booking date parameters
  // These are used for both ACADEMY bookings and bulk NORMAL bookings
  if (academyStartDate) formData.append('academy_start_date', academyStartDate);
  if (academyEndDate) formData.append('academy_end_date', academyEndDate);
  if (academyDaysOfWeek && academyDaysOfWeek.length > 0) {
    formData.append('academy_days_of_week', academyDaysOfWeek.join(','));
  }

  try {
    const response = await api.post('/api/update_booking', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    console.log('Booking updated successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error updating booking:', error);
    throw error;
  }
};

export interface DeleteBookingOptions {
  startDate?: string;
  endDate?: string;
  retainPayments?: boolean;
}

export interface DeleteBookingResponse {
  success: boolean;
  message: string;
  bookingsData: Record<string, any>;
  was_soft_deleted: boolean;
}

export const deleteBooking = async (
  bookingId: number,
  startDate?: string,
  endDate?: string,
  retainPayments: boolean = true
): Promise<DeleteBookingResponse> => {
  // Create params object for date range and retain_payments flag
  const params: Record<string, string | boolean> = {
    retain_payments: retainPayments
  };
  if (startDate) params['start_date'] = startDate;
  if (endDate) params['end_date'] = endDate;

  // Pass params in the request
  const response = await api.delete(`/api/delete_booking/${bookingId}`, { params });
  return response.data;
};

// Helper function to check if booking has transactions before deleting
export const checkBookingHasTransactions = async (bookingId: number): Promise<boolean> => {
  try {
    const response = await api.get('/transaction_details', {
      params: { booking_id: bookingId }
    });
    return response.data.transactions && response.data.transactions.length > 0;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return false;
    }
    throw error;
  }
};
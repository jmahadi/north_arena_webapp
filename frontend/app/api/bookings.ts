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
    endDate?: string
  ) => {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('phone', phone);
  formData.append('booking_date', bookingDate);
  formData.append('time_slot', timeSlot);

  // Add date range parameters if provided
  if (startDate) formData.append('start_date', startDate);
  if (endDate) formData.append('end_date', endDate);

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
  endDate?: string     // Added optional endDate parameter
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

export const deleteBooking = async (bookingId: number, startDate?: string, endDate?: string) => {
  // Create params object for date range
  const params: Record<string, string> = {};
  if (startDate) params['start_date'] = startDate;
  if (endDate) params['end_date'] = endDate;

  // Pass params in the request
  const response = await api.delete(`/api/delete_booking/${bookingId}`, { params });
  return response.data;
};
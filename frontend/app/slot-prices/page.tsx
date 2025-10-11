'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../components/AdminLayout';
import Cookies from 'js-cookie';
import api from '../utils/axios';

interface SlotPrice {
  id: number;
  time_slot: string;
  day_of_week: string;
  price: number;
  start_date: string | null;
  end_date: string | null;
  is_default: boolean;
}

interface SlotPriceForm {
  time_slot: string;
  day_of_week: string;
  price: number;
  duration_type: 'permanent' | 'temporary';
  start_date: string;
  end_date: string;
  is_default: boolean;
}

// Dynamic time slots loaded from backend
let timeSlots: string[] = [];

// Dynamic day/night slot categorization
const getDaySlots = (timeSlots: string[]) => {
  return timeSlots.filter(slot => {
    const startTime = slot.split(' - ')[0];
    const hour = parseInt(startTime.split(':')[0]);
    const ampm = startTime.includes('PM') ? 'PM' : 'AM';
    
    if (ampm === 'AM') return true;
    if (ampm === 'PM' && hour === 12) return true; // 12 PM is noon, day time
    if (ampm === 'PM' && hour < 6) return true;
    return false;
  });
};

const getNightSlots = (timeSlots: string[]) => {
  return timeSlots.filter(slot => {
    const startTime = slot.split(' - ')[0];
    const hour = parseInt(startTime.split(':')[0]);
    const ampm = startTime.includes('PM') ? 'PM' : 'AM';
    
    if (ampm === 'PM' && hour >= 6 && hour !== 12) return true;
    return false;
  });
};

const getDynamicTimeRangeLabel = (timeSlots: string[], type: 'day' | 'night') => {
  const slots = type === 'day' ? getDaySlots(timeSlots) : getNightSlots(timeSlots);
  if (slots.length === 0) return `No ${type} slots`;
  const startTime = slots[0]?.split(' - ')[0];
  const endTime = slots[slots.length - 1]?.split(' - ')[1];
  return `${startTime} - ${endTime}`;
};
const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const weekends = ['SATURDAY', 'SUNDAY'];

const daysOfWeek = [
  { value: 'SUNDAY', label: 'Sunday' },
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' }
];

export default function SlotPricesPage() {
  const [slotPrices, setSlotPrices] = useState<SlotPrice[]>([]);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'add-price' | 'manage-slots' | 'price-summary'>('add-price');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [bulkPrice, setBulkPrice] = useState<string>('');
  const [bulkPriceType, setBulkPriceType] = useState<'weekday-day' | 'weekday-night' | 'weekend-day' | 'weekend-night'>('weekday-day');
  const [bulkDuration, setBulkDuration] = useState<'indefinite' | 'temporary'>('indefinite');
  const [bulkStartDate, setBulkStartDate] = useState<string>('');
  const [bulkEndDate, setBulkEndDate] = useState<string>('');
  const [newSlotTime, setNewSlotTime] = useState<string>('');
  const [newSlotPrice, setNewSlotPrice] = useState<string>('');
  const router = useRouter();

  const [formData, setFormData] = useState<SlotPriceForm>({
    time_slot: '',
    day_of_week: '',
    price: 0,
    duration_type: 'permanent',
    start_date: '',
    end_date: '',
    is_default: true
  });

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
    } else {
      fetchInitialData();
    }
  }, [router]);

  const fetchInitialData = async () => {
    try {
      await Promise.all([
        fetchSlotPrices(),
        fetchAvailableTimeSlots()
      ]);
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  };

  const fetchAvailableTimeSlots = async () => {
    try {
      const response = await api.get('/available_time_slots');
      if (response.data.success) {
        console.log('Available time slots:', response.data.time_slots);
        setAvailableTimeSlots(response.data.time_slots);
        // Update the global timeSlots variable for backward compatibility
        timeSlots = response.data.time_slots;
      }
    } catch (error) {
      console.error('Error fetching available time slots:', error);
      showMessage('error', 'Failed to fetch available time slots');
    }
  };

  const fetchSlotPrices = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/list_slot_prices');
      if (response.data.success) {
        console.log('Fetched slot prices:', response.data.slot_prices);
        setSlotPrices(response.data.slot_prices);
      }
    } catch (error) {
      console.error('Error fetching slot prices:', error);
      showMessage('error', 'Failed to fetch slot prices');
    } finally {
      setIsLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: null, text: '' }), 5000);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = new FormData();
      submitData.append('time_slot', formData.time_slot);
      submitData.append('day_of_week', formData.day_of_week);
      submitData.append('price', formData.price.toString());
      submitData.append('is_default', formData.is_default.toString());
      
      if (formData.duration_type === 'temporary') {
        submitData.append('start_date', formData.start_date);
        submitData.append('end_date', formData.end_date);
      }

      const response = await api.post('/add_update_slot_price', submitData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        showMessage('success', 'Slot price updated successfully!');
        setFormData({
          time_slot: '',
          day_of_week: '',
          price: 0,
          duration_type: 'permanent',
          start_date: '',
          end_date: '',
          is_default: true
        });
        await fetchSlotPrices(); // Refresh data
      }
    } catch (error: any) {
      console.error('Error updating slot price:', error);
      showMessage('error', error.response?.data?.message || 'Failed to update slot price');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this price entry?')) {
      try {
        const response = await api.delete(`/delete_slot_price/${id}`);
        if (response.data.success) {
          showMessage('success', 'Price deleted successfully!');
          await fetchSlotPrices();
        }
      } catch (error: any) {
        showMessage('error', error.response?.data?.message || 'Failed to delete price');
      }
    }
  };

  const handleEdit = (slotPrice: SlotPrice) => {
    setActiveTab('add-price');
    setFormData({
      time_slot: slotPrice.time_slot,
      day_of_week: slotPrice.day_of_week,
      price: slotPrice.price,
      duration_type: slotPrice.start_date && slotPrice.end_date ? 'temporary' : 'permanent',
      start_date: slotPrice.start_date || '',
      end_date: slotPrice.end_date || '',
      is_default: slotPrice.is_default
    });
  };

  const applyBulkPrice = async () => {
    if (!bulkPrice || isNaN(Number(bulkPrice))) {
      showMessage('error', 'Please enter a valid price');
      return;
    }

    if (bulkDuration === 'temporary' && (!bulkStartDate || !bulkEndDate)) {
      showMessage('error', 'Please select start and end dates for temporary pricing');
      return;
    }

    const dayRange = getDynamicTimeRangeLabel(availableTimeSlots, 'day');
    const nightRange = getDynamicTimeRangeLabel(availableTimeSlots, 'night');
    
    const priceTypeLabels = {
      'weekday-day': `Weekday Day (${dayRange})`,
      'weekday-night': `Weekday Night (${nightRange})`, 
      'weekend-day': `Weekend Day (${dayRange})`,
      'weekend-night': `Weekend Night (${nightRange})`
    };

    const durationLabel = bulkDuration === 'indefinite' ? 'indefinitely' : `from ${bulkStartDate} to ${bulkEndDate}`;
    
    if (window.confirm(`Apply price ৳${bulkPrice} to ${priceTypeLabels[bulkPriceType]} ${durationLabel}?`)) {
      try {
        const promises: Promise<any>[] = [];
        
        const targetDays = bulkPriceType.includes('weekday') ? weekdays : weekends;
        const daySlots = getDaySlots(availableTimeSlots);
        const nightSlots = getNightSlots(availableTimeSlots);
        const targetSlots = bulkPriceType.includes('day') ? daySlots : nightSlots;

        console.log('Bulk update - Target days:', targetDays);
        console.log('Bulk update - Target slots:', targetSlots);
        console.log('Day slots:', daySlots);
        console.log('Night slots:', nightSlots);

        targetDays.forEach(day => {
          targetSlots.forEach(slot => {
            const submitData = new FormData();
            submitData.append('time_slot', slot);
            submitData.append('day_of_week', day);
            submitData.append('price', bulkPrice);
            submitData.append('is_default', bulkDuration === 'indefinite' ? 'true' : 'false');
            
            if (bulkDuration === 'temporary') {
              submitData.append('start_date', bulkStartDate);
              submitData.append('end_date', bulkEndDate);
            }
            
            promises.push(
              api.post('/add_update_slot_price', submitData, {
                headers: { 'Content-Type': 'multipart/form-data' }
              })
            );
          });
        });

        await Promise.all(promises);
        showMessage('success', 'Bulk price update completed!');
        setBulkPrice('');
        setBulkStartDate('');
        setBulkEndDate('');
        await Promise.all([
          fetchSlotPrices(),
          fetchAvailableTimeSlots()
        ]); // Refresh data
      } catch (error) {
        showMessage('error', 'Error during bulk update');
      }
    }
  };

  const handleNewSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotTime || !newSlotPrice) {
      showMessage('error', 'Please fill in both time slot and default price');
      return;
    }

    // Add the new slot to all days with the default price
    try {
      const promises: Promise<any>[] = [];
      
      daysOfWeek.forEach(day => {
        const submitData = new FormData();
        submitData.append('time_slot', newSlotTime);
        submitData.append('day_of_week', day.value);
        submitData.append('price', newSlotPrice);
        submitData.append('is_default', 'true');
        
        promises.push(
          api.post('/add_update_slot_price', submitData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        );
      });

      await Promise.all(promises);
      showMessage('success', 'New slot added successfully!');
      setNewSlotTime('');
      setNewSlotPrice('');
      await Promise.all([
        fetchSlotPrices(),
        fetchAvailableTimeSlots()
      ]);
    } catch (error) {
      showMessage('error', 'Error adding new slot');
    }
  };

  const getGroupedPrices = () => {
    const grouped: {
      [key: string]: {
        [day: string]: { day: number; night: number }
      }
    } = {};

    console.log('All slot prices for grouping:', slotPrices);

    // Get dynamic day/night slots
    const daySlots = getDaySlots(availableTimeSlots);
    const nightSlots = getNightSlots(availableTimeSlots);
    
    // Group by day type (weekday/weekend) then by individual days
    const dayTypes = { weekday: weekdays, weekend: weekends };
    
    Object.entries(dayTypes).forEach(([dayType, days]) => {
      grouped[dayType] = {};
      days.forEach(day => {
        const dayPrices = slotPrices.filter(sp => sp.day_of_week === day && daySlots.includes(sp.time_slot));
        const nightPrices = slotPrices.filter(sp => sp.day_of_week === day && nightSlots.includes(sp.time_slot));
        
        console.log(`${day} - Day prices (${daySlots.length} slots):`, dayPrices);
        console.log(`${day} - Night prices (${nightSlots.length} slots):`, nightPrices);
        
        const avgDayPrice = dayPrices.length > 0 ? dayPrices.reduce((sum, sp) => sum + sp.price, 0) / dayPrices.length : 0;
        const avgNightPrice = nightPrices.length > 0 ? nightPrices.reduce((sum, sp) => sum + sp.price, 0) / nightPrices.length : 0;
        
        grouped[dayType][day] = {
          day: avgDayPrice,
          night: avgNightPrice
        };
      });
    });

    console.log('Grouped prices:', grouped);
    return grouped;
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center h-64">
          <div className="text-white">Loading...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-light text-white mb-6">Slots & Prices</h1>
        
        {/* Message Display */}
        {message.type && (
          <div className={`mb-4 p-4 rounded border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-8">
          <nav className="flex space-x-1 p-1 bg-black/20 rounded-lg border border-gray-800">
            {[
              { key: 'add-price', label: 'Price Management' },
              { key: 'manage-slots', label: 'Manage Slots' },
              { key: 'price-summary', label: 'Price Overview' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-orange-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'add-price' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Add/Update Form */}
            <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-6">Add/Update Price</h3>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Time Slot</label>
                  <select
                    value={formData.time_slot}
                    onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                    required
                  >
                    <option value="">Select Time Slot</option>
                    {availableTimeSlots.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Day of Week</label>
                  <select
                    value={formData.day_of_week}
                    onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                    required
                  >
                    <option value="">Select Day</option>
                    {daysOfWeek.map(day => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Price (৳)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                    min="0"
                    step="0.01"
                    placeholder="Enter price"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Price Duration</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="duration_type"
                        value="permanent"
                        checked={formData.duration_type === 'permanent'}
                        onChange={(e) => setFormData({ ...formData, duration_type: e.target.value as any })}
                        className="mr-2"
                      />
                      <span className="text-gray-300">Permanent (Indefinite)</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="duration_type"
                        value="temporary"
                        checked={formData.duration_type === 'temporary'}
                        onChange={(e) => setFormData({ ...formData, duration_type: e.target.value as any })}
                        className="mr-2"
                      />
                      <span className="text-gray-300">Temporary (With End Date)</span>
                    </label>
                  </div>
                </div>

                {formData.duration_type === 'temporary' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
                      <input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="mr-2"
                  />
                  <label className="text-gray-300">Set as Default Price</label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-md transition-all duration-200 hover:shadow-lg"
                >
                  Add/Update Price
                </button>
              </form>
            </div>

            {/* Bulk Pricing */}
            <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-medium text-white mb-6">Bulk Price Update</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Price Type</label>
                  <select
                    value={bulkPriceType}
                    onChange={(e) => setBulkPriceType(e.target.value as any)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                  >
                    <option value="weekday-day">Weekday Day ({getDynamicTimeRangeLabel(availableTimeSlots, 'day')})</option>
                    <option value="weekday-night">Weekday Night ({getDynamicTimeRangeLabel(availableTimeSlots, 'night')})</option>
                    <option value="weekend-day">Weekend Day ({getDynamicTimeRangeLabel(availableTimeSlots, 'day')})</option>
                    <option value="weekend-night">Weekend Night ({getDynamicTimeRangeLabel(availableTimeSlots, 'night')})</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Duration</label>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="bulk_duration"
                        value="indefinite"
                        checked={bulkDuration === 'indefinite'}
                        onChange={(e) => setBulkDuration(e.target.value as any)}
                        className="mr-2"
                      />
                      <span className="text-gray-300">Indefinite</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="bulk_duration"
                        value="temporary"
                        checked={bulkDuration === 'temporary'}
                        onChange={(e) => setBulkDuration(e.target.value as any)}
                        className="mr-2"
                      />
                      <span className="text-gray-300">Temporary</span>
                    </label>
                  </div>
                </div>

                {bulkDuration === 'temporary' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
                      <input
                        type="date"
                        value={bulkStartDate}
                        onChange={(e) => setBulkStartDate(e.target.value)}
                        className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
                      <input
                        type="date"
                        value={bulkEndDate}
                        onChange={(e) => setBulkEndDate(e.target.value)}
                        className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Price (৳)</label>
                  <input
                    type="number"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                    placeholder="Enter price"
                    min="0"
                    step="0.01"
                  />
                </div>

                <button
                  onClick={applyBulkPrice}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-md transition-all duration-200 hover:shadow-lg"
                >
                  Apply Bulk Price
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manage-slots' && (
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-medium text-white mb-6">Manage Time Slots</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-lg font-medium text-white mb-4">Add New Time Slot</h4>
                <form onSubmit={handleNewSlotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Time Slot</label>
                    <input
                      type="text"
                      value={newSlotTime}
                      onChange={(e) => setNewSlotTime(e.target.value)}
                      placeholder="e.g., 10:30 PM - 12:00 AM"
                      className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Default Price (৳)</label>
                    <input
                      type="number"
                      value={newSlotPrice}
                      onChange={(e) => setNewSlotPrice(e.target.value)}
                      placeholder="Default Price"
                      className="w-full bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white focus:border-orange-500 focus:outline-none transition-colors"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-md transition-colors font-medium"
                  >
                    Add New Slot
                  </button>
                </form>
              </div>
              
              <div>
                <h4 className="text-lg font-medium text-white mb-4">Current Time Slots</h4>
                <div className="space-y-2">
                  {availableTimeSlots.map((slot, index) => (
                    <div key={index} className="flex justify-between items-center bg-gray-800/50 p-3 rounded-md border border-gray-700">
                      <span className="text-gray-300 text-sm">{slot}</span>
                      <button className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-3 py-1 rounded-sm text-xs transition-colors">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'price-summary' && (
          <div className="bg-black/40 border border-gray-800 rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-white">Price Overview</h3>
              <button
                onClick={fetchSlotPrices}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors text-sm"
              >
                Refresh
              </button>
            </div>
            
            {/* All Prices Table */}
            <div className="mb-8">
              <h4 className="text-lg font-medium text-orange-400 mb-4">All Current Prices</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Time Slot</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Day</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Price</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Start</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">End</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Type</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotPrices.map((sp) => (
                      <tr key={sp.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="py-3 px-4 text-sm">{sp.time_slot}</td>
                        <td className="py-3 px-4 text-sm">{sp.day_of_week}</td>
                        <td className="py-3 px-4 text-sm font-medium">৳{sp.price}</td>
                        <td className="py-3 px-4 text-sm text-gray-400">{sp.start_date || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-400">{sp.end_date || 'Indefinite'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-sm text-xs ${sp.is_default ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                            {sp.is_default ? 'Default' : 'Custom'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEdit(sp)}
                              className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-sm text-xs transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(sp.id)}
                              className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 px-3 py-1 rounded-sm text-xs transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Improved Hierarchical Overview */}
            <div>
              <h4 className="text-lg font-medium text-orange-400 mb-6">Pricing Hierarchy</h4>
              
              {Object.entries(getGroupedPrices()).map(([dayType, days]) => {
                const daySlots = getDaySlots(availableTimeSlots);
                const nightSlots = getNightSlots(availableTimeSlots);
                
                return (
                  <div key={dayType} className="mb-8 bg-gray-800/20 p-6 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-6">
                      <h5 className="text-xl font-medium text-white capitalize">{dayType}s</h5>
                      <div className="text-sm text-gray-400">
                        Day Slots: {daySlots.length} | Night Slots: {nightSlots.length}
                      </div>
                    </div>
                    
                    {/* Day Time Section */}
                    <div className="mb-6">
                      <h6 className="text-md font-medium text-orange-300 mb-4 flex items-center">
                        <span className="w-3 h-3 bg-yellow-400 rounded-full mr-2"></span>
                        Day Time ({daySlots.length > 0 ? `${daySlots[0]?.split(' - ')[0]} - ${daySlots[daySlots.length-1]?.split(' - ')[1]}` : 'No day slots'})
                      </h6>
                      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {Object.entries(days).map(([day, prices]) => (
                          <div key={`${day}-day`} className="bg-yellow-500/10 p-3 rounded border border-yellow-500/30">
                            <div className="text-center">
                              <div className="text-xs text-yellow-300 font-medium mb-1">{day.slice(0,3).toUpperCase()}</div>
                              <div className="text-sm text-white font-medium">৳{prices.day > 0 ? prices.day.toFixed(0) : 'N/A'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Night Time Section */}
                    <div>
                      <h6 className="text-md font-medium text-blue-300 mb-4 flex items-center">
                        <span className="w-3 h-3 bg-blue-400 rounded-full mr-2"></span>
                        Night Time ({nightSlots.length > 0 ? `${nightSlots[0]?.split(' - ')[0]} - ${nightSlots[nightSlots.length-1]?.split(' - ')[1]}` : 'No night slots'})
                      </h6>
                      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {Object.entries(days).map(([day, prices]) => (
                          <div key={`${day}-night`} className="bg-blue-500/10 p-3 rounded border border-blue-500/30">
                            <div className="text-center">
                              <div className="text-xs text-blue-300 font-medium mb-1">{day.slice(0,3).toUpperCase()}</div>
                              <div className="text-sm text-white font-medium">৳{prices.night > 0 ? prices.night.toFixed(0) : 'N/A'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Quick Stats */}
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-green-500/10 p-4 rounded border border-green-500/30">
                  <div className="text-center">
                    <div className="text-sm text-green-300 mb-1">Total Slots</div>
                    <div className="text-lg text-white font-medium">{availableTimeSlots.length}</div>
                  </div>
                </div>
                <div className="bg-yellow-500/10 p-4 rounded border border-yellow-500/30">
                  <div className="text-center">
                    <div className="text-sm text-yellow-300 mb-1">Day Slots</div>
                    <div className="text-lg text-white font-medium">{getDaySlots(availableTimeSlots).length}</div>
                  </div>
                </div>
                <div className="bg-blue-500/10 p-4 rounded border border-blue-500/30">
                  <div className="text-center">
                    <div className="text-sm text-blue-300 mb-1">Night Slots</div>
                    <div className="text-lg text-white font-medium">{getNightSlots(availableTimeSlots).length}</div>
                  </div>
                </div>
                <div className="bg-purple-500/10 p-4 rounded border border-purple-500/30">
                  <div className="text-center">
                    <div className="text-sm text-purple-300 mb-1">Price Entries</div>
                    <div className="text-lg text-white font-medium">{slotPrices.length}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
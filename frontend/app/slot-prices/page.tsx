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

interface CurrentSlotPrice {
  time_slot: string;
  day_of_week: string;
  price: number | null;
  source: 'NONE' | 'DEFAULT' | 'ACTIVE_TEMPORARY' | 'FALLBACK';
  entry_id: number | null;
  is_default: boolean | null;
  start_date: string | null;
  end_date: string | null;
  candidate_count: number;
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
const dayOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

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
  const [bulkSelectedDays, setBulkSelectedDays] = useState<string[]>(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  const [bulkSession, setBulkSession] = useState<'day' | 'night'>('day');
  const [bulkDuration, setBulkDuration] = useState<'indefinite' | 'temporary'>('indefinite');
  const [bulkStartDate, setBulkStartDate] = useState<string>('');
  const [bulkEndDate, setBulkEndDate] = useState<string>('');
  const [currentPrices, setCurrentPrices] = useState<CurrentSlotPrice[]>([]);
  const [effectiveDaySlots, setEffectiveDaySlots] = useState<string[]>([]);
  const [effectiveNightSlots, setEffectiveNightSlots] = useState<string[]>([]);
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
        fetchAvailableTimeSlots(),
        fetchCurrentSlotPrices()
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

  const fetchCurrentSlotPrices = async () => {
    try {
      const response = await api.get('/current_slot_prices');
      if (response.data.success) {
        setCurrentPrices(response.data.prices || []);
        setEffectiveDaySlots(response.data.day_slots || []);
        setEffectiveNightSlots(response.data.night_slots || []);
      }
    } catch (error) {
      console.error('Error fetching current slot prices:', error);
      showMessage('error', 'Failed to fetch current effective prices');
    }
  };

  const getCurrentPriceEntry = (slot: string, day: string) => {
    return currentPrices.find(p => p.time_slot === slot && p.day_of_week === day);
  };

  const toggleBulkDay = (day: string) => {
    setBulkSelectedDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      }
      return [...prev, day];
    });
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
    if (bulkSelectedDays.length === 0) {
      showMessage('error', 'Please select at least one day');
      return;
    }

    if (bulkDuration === 'temporary' && (!bulkStartDate || !bulkEndDate)) {
      showMessage('error', 'Please select start and end dates for temporary pricing');
      return;
    }

    const durationLabel = bulkDuration === 'indefinite' ? 'indefinitely' : `from ${bulkStartDate} to ${bulkEndDate}`;
    const sessionSlots = bulkSession === 'day' ? getDaySlots(availableTimeSlots) : getNightSlots(availableTimeSlots);
    const selectedDaysLabel = bulkSelectedDays
      .map(day => daysOfWeek.find(d => d.value === day)?.label || day)
      .join(', ');
    if (sessionSlots.length === 0) {
      showMessage('error', `No ${bulkSession} slots found to update`);
      return;
    }

    if (window.confirm(`Apply price ৳${bulkPrice} to ${bulkSession} slots (${sessionSlots.length}) for ${selectedDaysLabel} ${durationLabel}?`)) {
      try {
        const promises: Promise<any>[] = [];

        console.log('Bulk update - Target days:', bulkSelectedDays);
        console.log('Bulk update - Target slots:', sessionSlots);

        bulkSelectedDays.forEach(day => {
          sessionSlots.forEach(slot => {
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

        const results = await Promise.allSettled(promises);
        const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
        const successCount = results.length - failures.length;

        if (failures.length === 0) {
          showMessage('success', 'Bulk price update completed!');
          setBulkPrice('');
          setBulkStartDate('');
          setBulkEndDate('');
        } else {
          const firstError: any = failures[0].reason;
          const errorMessage = firstError?.response?.data?.message || firstError?.message || 'Error during bulk update';
          showMessage('error', `Bulk update: ${successCount} succeeded, ${failures.length} failed. ${errorMessage}`);
        }

        await Promise.all([
          fetchSlotPrices(),
          fetchAvailableTimeSlots(),
          fetchCurrentSlotPrices()
        ]); // Refresh data
      } catch (error: any) {
        console.error('Bulk update error:', error);
        showMessage('error', error.response?.data?.message || 'Error during bulk update');
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

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <div className="relative" style={{ width: 80, height: 80 }}>
            <svg className="animate-spin" style={{ width: 80, height: 80 }} viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="22" fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth={3} />
              <circle cx="25" cy="25" r="22" fill="none" stroke="#f97316" strokeWidth={3} strokeLinecap="round" strokeDasharray="34.5 103.6" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <img src="/images/White-Logomark.png" alt="Loading" className="w-10 h-10 object-contain animate-fade-in-out" />
            </div>
          </div>
          <p className="mt-3 text-gray-400 text-sm">Loading slots & prices...</p>
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
        <div className="mb-8 overflow-x-auto">
          <nav className="flex space-x-1 p-1 bg-black/20 rounded-lg border border-gray-800 min-w-max">
            {[
              { key: 'add-price', label: 'Pricing' },
              { key: 'manage-slots', label: 'Slots' },
              { key: 'price-summary', label: 'Overview' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-2 rounded-md font-medium transition-all duration-200 text-sm whitespace-nowrap ${
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">Session</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkSession('day')}
                      className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                        bulkSession === 'day'
                          ? 'bg-orange-600 text-white border-orange-500'
                          : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                      }`}
                    >
                      Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSession('night')}
                      className={`px-3 py-2 rounded-md border text-sm transition-colors ${
                        bulkSession === 'night'
                          ? 'bg-orange-600 text-white border-orange-500'
                          : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                      }`}
                    >
                      Night
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    Day slots: {getDaySlots(availableTimeSlots).join(', ') || 'None'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Night slots: {getNightSlots(availableTimeSlots).join(', ') || 'None'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Days (Multi-select)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {daysOfWeek.map(day => (
                      <label
                        key={day.value}
                        className="flex items-center gap-2 bg-gray-800/60 border border-gray-700 rounded-md px-2 py-2 text-sm text-gray-200"
                      >
                        <input
                          type="checkbox"
                          checked={bulkSelectedDays.includes(day.value)}
                          onChange={() => toggleBulkDay(day.value)}
                          className="accent-orange-500"
                        />
                        {day.label}
                      </label>
                    ))}
                  </div>
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
                onClick={async () => {
                  await Promise.all([fetchSlotPrices(), fetchCurrentSlotPrices()]);
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors text-sm"
              >
                Refresh
              </button>
            </div>

            <div className="mb-8">
              <h4 className="text-md font-medium text-white mb-4 flex items-center">
                <span className="w-3 h-3 bg-orange-500 rounded mr-2"></span>
                Effective Current Price Matrix
              </h4>
              <div className="mb-3 space-y-1 text-xs text-gray-400">
                <div>Day slots: {(effectiveDaySlots.length > 0 ? effectiveDaySlots : getDaySlots(availableTimeSlots)).join(', ') || 'None'}</div>
                <div>Night slots: {(effectiveNightSlots.length > 0 ? effectiveNightSlots : getNightSlots(availableTimeSlots)).join(', ') || 'None'}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-white text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-800/50">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Time Slot</th>
                      {dayOrder.map(day => (
                        <th key={day} className="text-center py-3 px-3 text-gray-400 font-medium">
                          {daysOfWeek.find(d => d.value === day)?.label.slice(0, 3) || day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availableTimeSlots.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-500">
                          No time slots available.
                        </td>
                      </tr>
                    ) : (
                      availableTimeSlots.map((slot) => (
                        <tr key={slot} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                          <td className="py-3 px-4 font-medium text-gray-300">
                            {slot}
                          </td>
                          {dayOrder.map(day => {
                            const priceEntry = getCurrentPriceEntry(slot, day);
                              return (
                                <td key={day} className="py-3 px-3 text-center">
                                  {priceEntry && priceEntry.price !== null ? (
                                    <span
                                      className={`px-3 py-1 rounded text-sm font-medium ${
                                        priceEntry.source === 'ACTIVE_TEMPORARY'
                                          ? 'bg-orange-600/20 text-orange-300 border border-orange-500/30'
                                          : priceEntry.source === 'DEFAULT'
                                          ? 'bg-gray-700 text-white'
                                          : 'bg-gray-800 text-gray-300 border border-gray-700'
                                      }`}
                                      title={
                                        priceEntry.start_date
                                          ? `${priceEntry.source}: ${priceEntry.start_date} to ${priceEntry.end_date || ''}`
                                          : `${priceEntry.source}`
                                      }
                                    >
                                      ৳{priceEntry.price}
                                    </span>
                                  ) : (
                                    <span className="text-gray-600">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-sm text-gray-400 mb-6">
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-gray-700 text-white text-xs">৳2500</div>
                <span>Default price</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded bg-orange-600/20 text-orange-400 border border-orange-500/30 text-xs">৳3000</div>
                <span>Custom/temporary price</span>
              </div>
              <div className="text-gray-500 text-xs ml-4">Click any price to edit</div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">Total Slots</div>
                  <div className="text-lg text-white font-medium">{availableTimeSlots.length}</div>
                </div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">Day Slots</div>
                  <div className="text-lg text-white font-medium">{getDaySlots(availableTimeSlots).length}</div>
                </div>
              </div>
              <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-1">Night Slots</div>
                  <div className="text-lg text-white font-medium">{getNightSlots(availableTimeSlots).length}</div>
                </div>
              </div>
              <div className="bg-orange-500/10 p-4 rounded border border-orange-500/30">
                <div className="text-center">
                  <div className="text-sm text-orange-400 mb-1">Price Entries</div>
                  <div className="text-lg text-white font-medium">{slotPrices.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

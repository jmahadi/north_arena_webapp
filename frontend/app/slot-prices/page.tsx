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
    if (ampm === 'PM' && hour === 12) return true;
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
        setAvailableTimeSlots(response.data.time_slots);
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
      if (prev.includes(day)) return prev.filter(d => d !== day);
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
        setFormData({ time_slot: '', day_of_week: '', price: 0, duration_type: 'permanent', start_date: '', end_date: '', is_default: true });
        await fetchSlotPrices();
      }
    } catch (error: any) {
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

        await Promise.all([fetchSlotPrices(), fetchAvailableTimeSlots(), fetchCurrentSlotPrices()]);
      } catch (error: any) {
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
      await Promise.all([fetchSlotPrices(), fetchAvailableTimeSlots()]);
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
          <p className="mt-3 text-white/30 text-sm">Loading slots & prices...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold text-white mb-6 tracking-tight animate-fadeInUp">Slots & Prices</h1>

        {/* Message Display */}
        {message.type && (
          <div className={`mb-4 p-4 rounded-xl border animate-scaleIn ${message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-8 overflow-x-auto animate-fadeInUp stagger-1">
          <nav className="flex space-x-1 p-1 bg-white/[0.02] rounded-xl border border-white/[0.04] min-w-max">
            {[
              { key: 'add-price', label: 'Pricing' },
              { key: 'manage-slots', label: 'Slots' },
              { key: 'price-summary', label: 'Overview' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 text-sm whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20'
                    : 'text-white/30 hover:text-white/60 hover:bg-white/[0.03]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'add-price' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeInUp stagger-2">
            {/* Add/Update Form */}
            <div className="glass-card rounded-xl p-6">
              <h3 className="text-sm font-medium text-white/60 mb-6 uppercase tracking-wider">Add/Update Price</h3>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Time Slot</label>
                  <select
                    value={formData.time_slot}
                    onChange={(e) => setFormData({ ...formData, time_slot: e.target.value })}
                    className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                    required
                  >
                    <option value="">Select Time Slot</option>
                    {availableTimeSlots.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Day of Week</label>
                  <select
                    value={formData.day_of_week}
                    onChange={(e) => setFormData({ ...formData, day_of_week: e.target.value })}
                    className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                    required
                  >
                    <option value="">Select Day</option>
                    {daysOfWeek.map(day => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Price (৳)</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                    min="0"
                    step="0.01"
                    placeholder="Enter price"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Price Duration</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, duration_type: 'permanent', is_default: true })}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        formData.duration_type === 'permanent'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                      }`}
                    >
                      Permanent
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, duration_type: 'temporary', is_default: false })}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        formData.duration_type === 'temporary'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                      }`}
                    >
                      Temporary
                    </button>
                  </div>
                </div>

                {formData.duration_type === 'temporary' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Start Date</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">End Date</label>
                      <input
                        type="date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                        className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="accent-orange-500"
                  />
                  <label className="text-white/40 text-sm">Set as Default Price</label>
                </div>

                <button
                  type="submit"
                  className="btn-glow w-full bg-orange-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 text-sm"
                >
                  Add/Update Price
                </button>
              </form>
            </div>

            {/* Bulk Pricing */}
            <div className="glass-card rounded-xl p-6">
              <h3 className="text-sm font-medium text-white/60 mb-6 uppercase tracking-wider">Bulk Price Update</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Session</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkSession('day')}
                      className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        bulkSession === 'day'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                      }`}
                    >
                      Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkSession('night')}
                      className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        bulkSession === 'night'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                      }`}
                    >
                      Night
                    </button>
                  </div>
                  <div className="text-[10px] text-white/20 mt-2">
                    Day: {getDaySlots(availableTimeSlots).join(', ') || 'None'}
                  </div>
                  <div className="text-[10px] text-white/20 mt-1">
                    Night: {getNightSlots(availableTimeSlots).join(', ') || 'None'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Days</label>
                  <div className="grid grid-cols-2 gap-2">
                    {daysOfWeek.map(day => (
                      <label
                        key={day.value}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs cursor-pointer transition-all duration-200 ${
                          bulkSelectedDays.includes(day.value)
                            ? 'bg-orange-500/10 border-orange-500/25 text-orange-300'
                            : 'bg-white/[0.02] border-white/[0.06] text-white/40 hover:bg-white/[0.04]'
                        }`}
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
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Duration</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkDuration('indefinite')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        bulkDuration === 'indefinite'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                      }`}
                    >
                      Indefinite
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkDuration('temporary')}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        bulkDuration === 'temporary'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                          : 'bg-white/[0.02] text-white/40 border border-white/[0.06] hover:bg-white/[0.04]'
                      }`}
                    >
                      Temporary
                    </button>
                  </div>
                </div>

                {bulkDuration === 'temporary' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Start Date</label>
                      <input
                        type="date"
                        value={bulkStartDate}
                        onChange={(e) => setBulkStartDate(e.target.value)}
                        className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">End Date</label>
                      <input
                        type="date"
                        value={bulkEndDate}
                        onChange={(e) => setBulkEndDate(e.target.value)}
                        className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                        required
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Price (৳)</label>
                  <input
                    type="number"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                    placeholder="Enter price"
                    min="0"
                    step="0.01"
                  />
                </div>

                <button
                  onClick={applyBulkPrice}
                  className="btn-glow w-full bg-orange-600 text-white font-medium py-3 px-4 rounded-xl transition-all duration-300 text-sm"
                >
                  Apply Bulk Price
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manage-slots' && (
          <div className="glass-card rounded-xl p-6 animate-fadeInUp">
            <h3 className="text-sm font-medium text-white/60 mb-6 uppercase tracking-wider">Manage Time Slots</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-medium mb-4">Add New Time Slot</h4>
                <form onSubmit={handleNewSlotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Time Slot</label>
                    <input
                      type="text"
                      value={newSlotTime}
                      onChange={(e) => setNewSlotTime(e.target.value)}
                      placeholder="e.g., 10:30 PM - 12:00 AM"
                      className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">Default Price (৳)</label>
                    <input
                      type="number"
                      value={newSlotPrice}
                      onChange={(e) => setNewSlotPrice(e.target.value)}
                      placeholder="Default Price"
                      className="glass-input w-full rounded-lg px-3 py-2.5 text-sm"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-glow w-full bg-orange-600 text-white py-2.5 px-4 rounded-xl transition-all duration-300 font-medium text-sm"
                  >
                    Add New Slot
                  </button>
                </form>
              </div>

              <div>
                <h4 className="text-white font-medium mb-4">Current Time Slots</h4>
                <div className="space-y-2">
                  {availableTimeSlots.map((slot, index) => (
                    <div key={index} className="flex justify-between items-center glass-card p-3 rounded-lg">
                      <span className="text-white/60 text-sm">{slot}</span>
                      <button className="bg-red-500/10 hover:bg-red-500/15 text-red-400 border border-red-500/20 px-3 py-1 rounded-lg text-xs transition-all duration-200">
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
          <div className="glass-card rounded-xl p-6 animate-fadeInUp">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Price Overview</h3>
              <button
                onClick={async () => {
                  await Promise.all([fetchSlotPrices(), fetchCurrentSlotPrices()]);
                }}
                className="glass-card hover:bg-white/[0.06] text-white/50 hover:text-white px-4 py-2 rounded-lg transition-all duration-200 text-sm"
              >
                Refresh
              </button>
            </div>

            <div className="mb-8">
              <h4 className="text-white font-medium mb-4 flex items-center">
                <span className="w-2.5 h-2.5 bg-orange-500 rounded-full mr-2"></span>
                Effective Current Price Matrix
              </h4>
              <div className="mb-3 space-y-1 text-[10px] text-white/20">
                <div>Day slots: {(effectiveDaySlots.length > 0 ? effectiveDaySlots : getDaySlots(availableTimeSlots)).join(', ') || 'None'}</div>
                <div>Night slots: {(effectiveNightSlots.length > 0 ? effectiveNightSlots : getNightSlots(availableTimeSlots)).join(', ') || 'None'}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-white text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-3 px-4 text-white/30 font-medium text-xs uppercase tracking-wider">Time Slot</th>
                      {dayOrder.map(day => (
                        <th key={day} className="text-center py-3 px-3 text-white/30 font-medium text-xs uppercase tracking-wider">
                          {daysOfWeek.find(d => d.value === day)?.label.slice(0, 3) || day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {availableTimeSlots.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-white/20">
                          No time slots available.
                        </td>
                      </tr>
                    ) : (
                      availableTimeSlots.map((slot) => (
                        <tr key={slot} className="border-b border-white/[0.03] table-row-hover">
                          <td className="py-3 px-4 font-medium text-white/50 text-xs">
                            {slot}
                          </td>
                          {dayOrder.map(day => {
                            const priceEntry = getCurrentPriceEntry(slot, day);
                              return (
                                <td key={day} className="py-3 px-3 text-center">
                                  {priceEntry && priceEntry.price !== null ? (
                                    <span
                                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 ${
                                        priceEntry.source === 'ACTIVE_TEMPORARY'
                                          ? 'bg-orange-500/15 text-orange-300 border border-orange-500/20'
                                          : priceEntry.source === 'DEFAULT'
                                          ? 'bg-white/[0.04] text-white/70'
                                          : 'bg-white/[0.02] text-white/40 border border-white/[0.04]'
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
                                    <span className="text-white/10">-</span>
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
            <div className="flex items-center gap-6 text-sm text-white/30 mb-6">
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded-lg bg-white/[0.04] text-white/70 text-[10px]">৳2500</div>
                <span className="text-xs">Default</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-2 py-1 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/20 text-[10px]">৳3000</div>
                <span className="text-xs">Custom/temporary</span>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card rounded-xl p-4">
                <div className="text-center">
                  <div className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Total Slots</div>
                  <div className="text-lg text-white font-semibold">{availableTimeSlots.length}</div>
                </div>
              </div>
              <div className="glass-card rounded-xl p-4">
                <div className="text-center">
                  <div className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Day Slots</div>
                  <div className="text-lg text-white font-semibold">{getDaySlots(availableTimeSlots).length}</div>
                </div>
              </div>
              <div className="glass-card rounded-xl p-4">
                <div className="text-center">
                  <div className="text-[10px] text-white/25 mb-1 uppercase tracking-wider">Night Slots</div>
                  <div className="text-lg text-white font-semibold">{getNightSlots(availableTimeSlots).length}</div>
                </div>
              </div>
              <div className="glass-card-glow rounded-xl p-4" style={{ borderColor: 'rgba(249, 115, 22, 0.15)' }}>
                <div className="text-center">
                  <div className="text-[10px] text-orange-400 mb-1 uppercase tracking-wider">Price Entries</div>
                  <div className="text-lg text-white font-semibold">{slotPrices.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

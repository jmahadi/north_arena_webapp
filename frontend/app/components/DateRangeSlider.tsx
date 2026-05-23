'use client';

import React from 'react';

interface DateRangeSliderProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}

const toISO = (d: Date) => d.toISOString().split('T')[0];
const addDays = (iso: string, days: number) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
};

export default function DateRangeSlider({ startDate, endDate, onChange }: DateRangeSliderProps) {
  const todayISO = toISO(new Date());

  const applyPreset = (offsetStart: number, offsetEnd: number) => {
    onChange(addDays(todayISO, offsetStart), addDays(todayISO, offsetEnd));
  };

  const presets = [
    { label: '±7 days', start: -7, end: 7, primary: true },
    { label: 'Last 7', start: -7, end: 0 },
    { label: 'Next 7', start: 0, end: 7 },
    { label: 'Today', start: 0, end: 0 },
  ];

  return (
    <div className="glass-card rounded-xl px-3 py-2.5 animate-fadeInUp flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.start, p.end)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-all ${
              p.primary
                ? 'bg-orange-500/10 text-orange-300 border-orange-500/20 hover:bg-orange-500/15'
                : 'bg-white/[0.03] text-white/55 border-white/[0.06] hover:bg-white/[0.06] hover:text-white/80'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="glass-input rounded-md text-xs px-2 py-1"
        />
        <span className="text-white/30 text-xs">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="glass-input rounded-md text-xs px-2 py-1"
        />
      </div>
    </div>
  );
}

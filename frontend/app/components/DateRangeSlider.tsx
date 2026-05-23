'use client';

import React, { useRef, useEffect, useMemo } from 'react';

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

const daysBetween = (a: string, b: string) => {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

export default function DateRangeSlider({ startDate, endDate, onChange }: DateRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const todayISO = toISO(new Date());

  // Render a wide band of dates around today to enable dragging both directions.
  const dates = useMemo(() => {
    const list: string[] = [];
    for (let i = -45; i <= 45; i++) {
      list.push(addDays(todayISO, i));
    }
    return list;
  }, [todayISO]);

  // Auto-scroll today into view on mount
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const todayEl = track.querySelector<HTMLElement>('[data-today="1"]');
    if (todayEl) {
      const left = todayEl.offsetLeft - track.clientWidth / 2 + todayEl.clientWidth / 2;
      track.scrollLeft = Math.max(0, left);
    }
  }, []);

  const applyPreset = (offsetStart: number, offsetEnd: number) => {
    onChange(addDays(todayISO, offsetStart), addDays(todayISO, offsetEnd));
  };

  const handlePillClick = (iso: string) => {
    // Re-center range on the clicked date, preserving range width
    const width = Math.max(1, daysBetween(startDate, endDate));
    const half = Math.floor(width / 2);
    onChange(addDays(iso, -half), addDays(iso, width - half));
  };

  const isInRange = (iso: string) => iso >= startDate && iso <= endDate;

  return (
    <div className="glass-card rounded-xl p-3 animate-fadeInUp">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex gap-1.5">
          <button
            onClick={() => applyPreset(-7, 7)}
            className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20 hover:bg-orange-500/15 transition-all"
          >
            ±7 days
          </button>
          <button
            onClick={() => applyPreset(-7, 0)}
            className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06] transition-all"
          >
            Last 7
          </button>
          <button
            onClick={() => applyPreset(0, 7)}
            className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06] transition-all"
          >
            Next 7
          </button>
          <button
            onClick={() => applyPreset(0, 0)}
            className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06] transition-all"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChange(e.target.value, endDate)}
            className="glass-input rounded-md text-xs p-1.5"
          />
          <span className="text-white/30 text-xs">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChange(startDate, e.target.value)}
            className="glass-input rounded-md text-xs p-1.5"
          />
        </div>
      </div>

      <div
        ref={trackRef}
        className="overflow-x-auto scroll-smooth pb-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="flex gap-1 min-w-max">
          {dates.map((iso) => {
            const d = new Date(iso);
            const isToday = iso === todayISO;
            const inRange = isInRange(iso);
            const isEdge = iso === startDate || iso === endDate;
            return (
              <button
                key={iso}
                data-today={isToday ? '1' : undefined}
                onClick={() => handlePillClick(iso)}
                className={`flex-shrink-0 flex flex-col items-center justify-center px-2 py-1.5 rounded-md transition-all duration-150 min-w-[44px] ${
                  isEdge
                    ? 'bg-orange-600 text-white shadow-lg shadow-orange-500/20'
                    : inRange
                    ? 'bg-orange-500/15 text-orange-200 border border-orange-500/20'
                    : isToday
                    ? 'bg-white/[0.06] text-white border border-white/15'
                    : 'bg-white/[0.02] text-white/40 border border-white/[0.04] hover:bg-white/[0.06] hover:text-white/70'
                }`}
              >
                <span className="text-[9px] uppercase tracking-wider opacity-70">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className="text-xs font-semibold">{d.getDate()}</span>
                <span className="text-[8px] opacity-50">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

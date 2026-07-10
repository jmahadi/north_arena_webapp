'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// IMPORTANT: recharts identifies chart children (Area, XAxis, …) by their
// component type at render time. Wrapping each primitive in next/dynamic (as the
// dashboard did before) replaced those types with Next.js loadable wrappers, so
// AreaChart found zero real children and drew an empty canvas — the "trends not
// showing up" bug. Importing recharts statically here and lazy-loading THIS whole
// component (dynamic(() => import('./DashboardCharts'))) keeps the bundle split
// while letting recharts see the genuine child types.

const ORANGE = '#f97316';
const GREEN = '#22c55e';

interface Point {
  date: string;
  value: number;
}

function ChartTooltip({ active, payload, label, prefix = '', suffix = '' }: any) {
  if (active && payload && payload.length) {
    const v = payload[0].value;
    return (
      <div className="glass-card rounded-lg px-3 py-2 shadow-2xl border border-white/10">
        <p className="text-white/40 text-xs">{label}</p>
        <p className="text-white font-semibold text-sm">
          {prefix}
          {typeof v === 'number' ? v.toLocaleString() : v}
          {suffix}
        </p>
      </div>
    );
  }
  return null;
}

interface TrendChartProps {
  data: Point[];
  color: string;
  gradientId: string;
  yTickFormatter?: (value: number) => string;
  tooltipPrefix?: string;
  tooltipSuffix?: string;
}

function TrendChart({
  data,
  color,
  gradientId,
  yTickFormatter,
  tooltipPrefix,
  tooltipSuffix,
}: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="date"
          stroke="transparent"
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval={4}
        />
        <YAxis
          stroke="transparent"
          tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={yTickFormatter}
          width={yTickFormatter ? 40 : 28}
        />
        <Tooltip content={<ChartTooltip prefix={tooltipPrefix} suffix={tooltipSuffix} />} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface DashboardChartsProps {
  revenueData: Point[];
  bookingsData: Point[];
}

export default function DashboardCharts({ revenueData, bookingsData }: DashboardChartsProps) {
  return (
    <>
      <div className="glass-card rounded-xl p-6">
        <h3 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider">Revenue Trend</h3>
        <div className="h-64">
          <TrendChart
            data={revenueData}
            color={ORANGE}
            gradientId="revenueGradient"
            yTickFormatter={(value) => `৳${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`}
            tooltipPrefix="৳"
          />
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <h3 className="text-sm font-medium text-white/60 mb-4 uppercase tracking-wider">Booking Trend</h3>
        <div className="h-64">
          <TrendChart
            data={bookingsData}
            color={GREEN}
            gradientId="bookingsGradient"
            tooltipSuffix=" bookings"
          />
        </div>
      </div>
    </>
  );
}

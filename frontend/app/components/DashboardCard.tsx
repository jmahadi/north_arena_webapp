import React from 'react';
import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

interface DashboardCardProps {
  title: string;
  value: number | string;
  change?: number;
  icon: React.ReactNode;
  subtitle?: string;
  bgColor?: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, change, icon, subtitle, bgColor = "bg-black/40 border-gray-800" }) => {
  return (
    <div className={`${bgColor} border rounded-lg p-6 transition-all duration-200 hover:border-orange-500/50`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{title}</h3>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-2xl font-light text-white">{value}</p>
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1">
          <ArrowTrendingUpIcon className={`h-3 w-3 ${change >= 0 ? 'text-green-500' : 'text-red-500 transform rotate-180'}`} />
          <span className={`text-xs ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {Math.abs(change).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
};

export default DashboardCard;
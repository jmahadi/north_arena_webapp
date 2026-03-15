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

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, change, icon, subtitle }) => {
  return (
    <div className="glass-card-glow rounded-xl p-5 group">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">{title}</h3>
        <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/15 transition-colors">
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <p className="text-2xl font-semibold text-white tracking-tight">{value}</p>
        {subtitle && <span className="text-xs text-white/30">{subtitle}</span>}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          <ArrowTrendingUpIcon className={`h-3 w-3 ${change >= 0 ? 'text-emerald-400' : 'text-red-400 transform rotate-180'}`} />
          <span className={`text-xs font-medium ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {Math.abs(change).toFixed(1)}%
          </span>
          <span className="text-xs text-white/20 ml-1">vs prev</span>
        </div>
      )}
    </div>
  );
};

export default DashboardCard;

import React from 'react';
import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

interface DashboardCardProps {
  title: string;
  value: number | string;
  change?: number;
  icon: React.ReactNode;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, change, icon }) => {
  return (
    <div className="bg-[#333333] rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {icon}
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {change !== undefined && (
        <p className={`text-sm mt-2 ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          <ArrowTrendingUpIcon className={`h-4 w-4 inline ${change >= 0 ? '' : 'transform rotate-180'}`} />
          {Math.abs(change).toFixed(2)}%
        </p>
      )}
    </div>
  );
};

export default DashboardCard;
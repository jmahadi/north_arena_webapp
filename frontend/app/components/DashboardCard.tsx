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
    <div className="bg-surface bg-opacity-65 rounded-lg shadow-lg p-8 transition-all duration-300 hover:scale-105">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <div className="text-primary">{icon}</div>
      </div>
      <p className="text-4xl font-bold text-white mb-4">{value}</p>
      {change !== undefined && (
        <p className={`text-sm flex items-center ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          <ArrowTrendingUpIcon className={`h-4 w-4 mr-1 ${change >= 0 ? '' : 'transform rotate-180'}`} />
          {Math.abs(change).toFixed(2)}%
        </p>
      )}
    </div>
  );
};

export default DashboardCard;
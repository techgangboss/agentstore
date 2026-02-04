import React from 'react';
import { Package, Download, ShoppingCart, DollarSign } from 'lucide-react';

interface MetricsProps {
  totalAgents: number;
  totalInstalls: number;
  totalSales: number;
  totalEarnings: number;
}

export function DashboardMetrics({ totalAgents, totalInstalls, totalSales, totalEarnings }: MetricsProps) {
  const metrics = [
    {
      label: 'Published Agents',
      value: totalAgents.toString(),
      icon: Package,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Total Installs',
      value: totalInstalls.toString(),
      icon: Download,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Total Sales',
      value: totalSales.toString(),
      icon: ShoppingCart,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Total Earnings',
      value: `$${totalEarnings.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-teal-400',
      bgColor: 'bg-teal-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="bg-[#1a1a1a] rounded-xl p-5 border border-white/10"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 ${metric.bgColor} rounded-lg flex items-center justify-center`}>
              <metric.icon className={`w-5 h-5 ${metric.color}`} />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{metric.value}</p>
          <p className="text-sm text-gray-400">{metric.label}</p>
        </div>
      ))}
    </div>
  );
}

import React from 'react';
import { CloudResource, Recommendation } from '../types';

export const KpiCards: React.FC<{
  resources: CloudResource[];
  recommendations: Recommendation[];
  region: string;
}> = ({ resources, recommendations, region }) => {
  const totalSpend = resources.reduce((s, r) => s + r.monthlyCostUsd, 0);
  const potentialSavings = recommendations
    .filter((r) => r.status !== 'REJECTED')
    .reduce((s, r) => s + r.estimatedMonthlySavingsUsd, 0);
  const realizedSavings = recommendations
    .filter((r) => r.status === 'COMPLETED')
    .reduce((s, r) => s + r.estimatedMonthlySavingsUsd, 0);

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Discovered AWS Resources</span>
          <span className="font-mono text-emerald-400">{region}</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-white">{resources.length}</span>
          <span className="text-xs font-mono text-slate-300">Spend: ${totalSpend.toFixed(2)}/mo</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="text-xs text-slate-400">Detected Monthly Waste</div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-amber-400">${potentialSavings.toFixed(2)}/mo</span>
          <span className="text-xs font-mono text-slate-400">${(potentialSavings * 12).toFixed(2)}/yr</span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="text-xs text-slate-400">Realized Monthly Savings</div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-emerald-400">${realizedSavings.toFixed(2)}/mo</span>
          <span className="text-xs font-mono text-slate-300">
            {recommendations.filter((r) => r.status === 'COMPLETED').length} remediated
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Sandbox $5 Budget Alarm</span>
          <span className="font-mono text-emerald-400">OK (&lt;80%)</span>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-white">$1.42 / $5.00</span>
          <span className="text-xs font-mono text-slate-400">28.4%</span>
        </div>
      </div>
    </section>
  );
};

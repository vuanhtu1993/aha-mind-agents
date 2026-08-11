import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/v1/dashboard/metrics')
      .then(res => setMetrics(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading metrics...</div>;
  if (!metrics) return <div className="p-8 text-center text-red-500">Failed to load metrics</div>;

  const cards = [
    { title: 'Total Executions', value: metrics.totalRuns || 0, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-50' },
    { title: 'Success Rate', value: `${(((metrics.successfulRuns || 0) / (metrics.totalRuns || 1)) * 100).toFixed(1)}%`, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
    { title: 'Failed Runs', value: metrics.failedRuns || 0, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
    { title: 'Avg Duration', value: `${((metrics.avgDurationMs || 0) / 1000).toFixed(1)}s`, icon: Clock, color: 'text-orange-500', bg: 'bg-orange-50' },
  ];

  const chartData = [
    { name: 'Total Prompt Tokens', value: metrics.totalPromptTokens || 0 },
    { name: 'Total Completion Tokens', value: metrics.totalCompletionTokens || 0 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">System Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex items-center">
            <div className={`p-4 rounded-full ${c.bg} mr-4`}>
              <c.icon className={`w-6 h-6 ${c.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{c.title}</p>
              <h3 className="text-2xl font-bold text-slate-800">{c.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-8">
        <div className="flex items-center mb-6">
          <Zap className="w-5 h-5 text-amber-500 mr-2" />
          <h3 className="text-lg font-bold text-slate-800">Token Consumption (Gemini)</h3>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{fill: '#64748b'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fill: '#64748b'}} axisLine={false} tickLine={false} />
              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

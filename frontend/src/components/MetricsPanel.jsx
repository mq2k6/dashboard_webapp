import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { Cpu, MemoryStick, Network, Timer, Gauge } from 'lucide-react';
import { useMetricsSocket } from '../hooks/useMetricsSocket';

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function StatCard({ icon: Icon, label, value, sub, chartKey, history, color = '#4fa3ff' }) {
  const chartData = chartKey
    ? history.map((h) => ({ v: chartKey(h) ?? 0 }))
    : null;

  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Icon size={16} />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
      {chartData && chartData.length > 1 && (
        <div className="absolute inset-x-0 bottom-0 h-10 opacity-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <YAxis hide domain={[0, 100]} />
              <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.3} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function MetricsPanel() {
  const { latest, history, connected } = useMetricsSocket();

  if (!connected && !latest) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 text-gray-400 text-sm">
        Connecting to metrics stream…
      </div>
    );
  }

  const host = latest?.host;
  const containers = latest?.containers || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Cpu}
          label="CPU"
          value={`${host?.cpu_percent?.toFixed(1) ?? '—'}%`}
          history={history}
          chartKey={(h) => h.host?.cpu_percent}
          color="#4fa3ff"
        />
        <StatCard
          icon={MemoryStick}
          label="RAM"
          value={`${host?.ram?.percent?.toFixed(1) ?? '—'}%`}
          sub={host?.ram ? `${formatBytes(host.ram.used_bytes)} / ${formatBytes(host.ram.total_bytes)}` : null}
          history={history}
          chartKey={(h) => h.host?.ram?.percent}
          color="#3ddc84"
        />
        <StatCard
          icon={Gauge}
          label="GPU (Intel)"
          value={host?.gpu?.busy_percent != null ? `${host.gpu.busy_percent.toFixed(1)}%` : 'N/A'}
          sub={host?.gpu ? null : 'intel_gpu_top not available'}
          history={history}
          chartKey={(h) => h.host?.gpu?.busy_percent}
          color="#f5c84c"
        />
        <StatCard
          icon={Timer}
          label="Uptime"
          value={host ? formatUptime(host.uptime_seconds) : '—'}
        />
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <Network size={16} />
          <span>Network (cumulative since boot)</span>
        </div>
        <div className="flex gap-6 text-sm">
          <div>↑ Sent: <span className="text-gray-200">{formatBytes(host?.network?.bytes_sent)}</span></div>
          <div>↓ Received: <span className="text-gray-200">{formatBytes(host?.network?.bytes_recv)}</span></div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-sm text-gray-400 mb-3">Per-app usage</div>
        <div className="space-y-2">
          {containers.length === 0 && (
            <div className="text-sm text-gray-500">No running containers detected.</div>
          )}
          {containers.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
              <div className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-gray-500">{c.image}</span>
              </div>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>CPU {c.cpu_percent?.toFixed(1)}%</span>
                <span>RAM {formatBytes(c.mem_usage_bytes)} ({c.mem_percent?.toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

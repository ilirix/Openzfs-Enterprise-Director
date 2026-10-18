import React, { useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Pause,
  Play,
  RefreshCw,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Language, ResourceUsagePoint } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';

interface Props {
  lang: Language;
  onNavigateToArc?: () => void;
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700/80 bg-[#070d1e] px-3 py-2 text-[11px] font-mono shadow-xl min-w-[180px]">
      <div className="text-slate-400 mb-1.5">{label}</div>
      {payload.map((entry) => {
        const isPercent = entry.dataKey === 'cpuPct' || entry.dataKey === 'memoryPct';
        const value = typeof entry.value === 'number' ? entry.value : 0;
        return (
          <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4" style={{ color: entry.color }}>
            <span>{entry.name}</span>
            <span className="font-semibold tabular-nums">
              {isPercent ? `${value.toFixed(0)}%` : value.toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const ResourceUsageChart: React.FC<Props> = ({ lang, onNavigateToArc }) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const [history, setHistory] = useState<ResourceUsagePoint[]>([]);
  const [current, setCurrent] = useState<ResourceUsagePoint | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cpuLimit, setCpuLimit] = useState(() => Number(localStorage.getItem('zfs_threshold_cpu') || 75));

  useEffect(() => {
    const sync = () => setCpuLimit(Number(localStorage.getItem('zfs_threshold_cpu') || 75));
    window.addEventListener('zfs-thresholds', sync);
    return () => window.removeEventListener('zfs-thresholds', sync);
  }, []);

  const fetchData = async () => {
    try {
      const res = await zfsApi.getResourceUsage();
      setCurrent(res.current);
      setHistory(res.history.slice(-36));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(fetchData, 2000);
    return () => clearInterval(timer);
  }, [isPaused]);

  const latest = current || history[history.length - 1];
  const arcSeries = projectArc(history);
  const cpuHot = !!latest && latest.cpuPct >= cpuLimit;
  const projectionName = t('resourceUsage.projection') === 'resourceUsage.projection'
    ? (lang === 'sq' ? 'Parashikim goditjesh' : 'Projected hits')
    : t('resourceUsage.projection');
  const projectionMissName = t('resourceUsage.projectionMiss') === 'resourceUsage.projectionMiss'
    ? (lang === 'sq' ? 'Parashikim humbjesh' : 'Projected misses')
    : t('resourceUsage.projectionMiss');

  return (
    <section className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-sky-950/80 border border-sky-800/50 text-sky-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">{t('resourceUsage.title')}</h2>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">{t('resourceUsage.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className={`text-[10px] font-mono px-2 py-1 rounded border ${isPaused ? 'text-amber-300 border-amber-800/50 bg-amber-950/40' : 'text-emerald-300 border-emerald-800/50 bg-emerald-950/40'}`}>
            {isPaused ? t('resourceUsage.paused') : t('resourceUsage.live')}
          </span>
          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono inline-flex items-center gap-1 cursor-pointer"
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {isPaused ? t('resourceUsage.resume') : t('resourceUsage.pause')}
          </button>
          <button
            type="button"
            onClick={fetchData}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-mono inline-flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            {t('resourceUsage.refresh')}
          </button>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label={t('resourceUsage.cpu')} value={`${latest.cpuPct}%`} hint={t('resourceUsage.host')} tone="text-sky-300" />
          <Metric label={t('resourceUsage.ram')} value={`${latest.memoryPct}%`} hint={`${latest.memoryUsedGb} / ${latest.memoryTotalGb} GB`} tone="text-violet-300" />
          <Metric label={t('resourceUsage.arcHits')} value={latest.arcHits.toLocaleString()} hint={t('resourceUsage.perInterval')} tone="text-emerald-300" />
          <Metric label={t('resourceUsage.arcMisses')} value={latest.arcMisses.toLocaleString()} hint={`${t('resourceUsage.hitRatio')} ${latest.arcHitPct}%`} tone="text-rose-300" />
        </div>
      )}

      {error && (
        <p className="text-[11px] font-mono text-rose-300">{error}</p>
      )}

      {loading && history.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500">
          {t('resourceUsage.loading')}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard
            alert={cpuHot}
            icon={<Cpu className="w-3.5 h-3.5 text-sky-400" />}
            title={t('resourceUsage.cpuRamChart')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="ramFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={24} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={40} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }} />
                <Area type="monotone" dataKey="cpuPct" name={t('resourceUsage.cpu')} stroke="#38bdf8" fill="url(#cpuFill)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="memoryPct" name={t('resourceUsage.ram')} stroke="#a78bfa" fill="url(#ramFill)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            icon={<Database className="w-3.5 h-3.5 text-emerald-400" />}
            title={t('resourceUsage.arcChart')}
            action={onNavigateToArc ? (
              <button type="button" onClick={onNavigateToArc} className="text-[11px] text-sky-400 hover:text-sky-300 font-mono cursor-pointer">
                {t('common.details')}
              </button>
            ) : null}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={arcSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="arcHitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="arcMissFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#fb7185" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={24} />
                <YAxis yAxisId="hits" orientation="left" stroke="#34d399" tick={{ fontSize: 10, fill: '#34d399' }} width={44} tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)} />
                <YAxis yAxisId="misses" orientation="right" stroke="#fb7185" tick={{ fontSize: 10, fill: '#fb7185' }} width={40} tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }} />
                <Area yAxisId="hits" type="monotone" dataKey="arcHits" name={t('resourceUsage.arcHits')} stroke="#34d399" fill="url(#arcHitFill)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Area yAxisId="misses" type="monotone" dataKey="arcMisses" name={t('resourceUsage.arcMisses')} stroke="#fb7185" fill="url(#arcMissFill)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line yAxisId="hits" type="monotone" dataKey="hitProj" name={projectionName} stroke="#6ee7b7" strokeDasharray="5 4" dot={false} connectNulls strokeWidth={2} isAnimationActive={false} />
                <Line yAxisId="misses" type="monotone" dataKey="missProj" name={projectionMissName} stroke="#fda4af" strokeDasharray="5 4" dot={false} connectNulls strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </section>
  );
};

function Metric({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-lg bg-[#070d1c] border border-slate-800/80 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-mono">{label}</div>
      <div className={`text-lg font-semibold font-mono tabular-nums ${tone}`}>{value}</div>
      <div className="text-[10px] text-slate-500 font-mono truncate">{hint}</div>
    </div>
  );
}

type ArcPoint = {
  timeLabel: string;
  arcHits: number | null;
  arcMisses: number | null;
  hitProj: number | null;
  missProj: number | null;
};

function projectArc(history: ResourceUsagePoint[]): ArcPoint[] {
  const series: ArcPoint[] = history.map((point, index) => ({
    timeLabel: point.timeLabel,
    arcHits: point.arcHits,
    arcMisses: point.arcMisses,
    hitProj: index === history.length - 1 ? point.arcHits : null,
    missProj: index === history.length - 1 ? point.arcMisses : null,
  }));
  if (history.length < 4) return series;

  const slopeOf = (values: number[]) => {
    const count = values.length;
    const xMean = (count - 1) / 2;
    const yMean = values.reduce((sum, value) => sum + value, 0) / count;
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      numerator += (index - xMean) * (value - yMean);
      denominator += (index - xMean) ** 2;
    });
    return denominator === 0 ? 0 : numerator / denominator;
  };

  const last = history[history.length - 1];
  const previous = history[history.length - 2];
  const step = Math.max(1000, last.timestamp - previous.timestamp);
  const hitSlope = slopeOf(history.map((point) => point.arcHits));
  const missSlope = slopeOf(history.map((point) => point.arcMisses));

  for (let stepIndex = 1; stepIndex <= 6; stepIndex += 1) {
    const when = new Date(last.timestamp + step * stepIndex);
    series.push({
      timeLabel: when.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      arcHits: null,
      arcMisses: null,
      hitProj: Math.max(0, Math.round(last.arcHits + hitSlope * stepIndex)),
      missProj: Math.max(0, Math.round(last.arcMisses + missSlope * stepIndex)),
    });
  }
  return series;
}

function ChartCard({ icon, title, action, alert, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; alert?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg bg-[#070d1c] border p-3 ${alert ? 'border-rose-500' : 'border-slate-800/70'}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1.5">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      <div className="h-56">{children}</div>
    </div>
  );
}

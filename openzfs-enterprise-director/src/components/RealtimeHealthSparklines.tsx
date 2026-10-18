import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Cpu,
  Layers,
  HardDrive,
  Play,
  Pause,
  Clock,
  TrendingUp,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { TelemetryPoint, Language } from '../types/zfs';
import { zfsApi } from '../services/zfsApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { useRafRender } from '../hooks/useRafRender';
import { telemetryWorkerService } from '../services/telemetryWorkerService';

interface Props {
  lang: Language;
}

interface SparklineCardProps {
  title: string;
  currentValue: string;
  subValue: string;
  minVal: number;
  maxVal: number;
  unit: string;
  data: number[];
  color: string;
  gradientId: string;
  icon: React.ElementType;
}

const SparklineChart: React.FC<{
  data: number[];
  color: string;
  gradientId: string;
  height?: number;
}> = ({ data, color, gradientId, height = 48 }) => {
  if (data.length < 2) {
    return <div className="h-12 flex items-center justify-center text-[10px] text-slate-500 font-mono">Initializing...</div>;
  }

  const width = 240;
  const paddingY = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - paddingY - ((val - min) / range) * (height - paddingY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `M ${points[0]} L ${points.join(' L ')} L ${width},${height} L 0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-12 overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* Area gradient fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      {/* Sparkline stroke */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Focal dot on latest point */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r="3"
          fill={color}
          stroke="#090d16"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
};

export const RealtimeHealthSparklines: React.FC<Props> = ({ lang }) => {
  const { settings } = useAppSettings();
  const isRafActive = settings.gpuOffload && settings.rafEnabled;
  const [history, setHistory] = useRafRender<TelemetryPoint[]>([], isRafActive);

  const [pollingInterval, setPollingInterval] = useState<number>(2000); // 2s default
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const maxBuffer = 24;

  const fetchPoint = async () => {
    try {
      const pt = await zfsApi.getRealtimeTelemetry();
      setHistory((prev) => {
        const next = [...prev, pt];
        if (next.length > maxBuffer) {
          return next.slice(next.length - maxBuffer);
        }
        return next;
      });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      // ignore transient polling errors
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchPoint();
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      fetchPoint();
    }, pollingInterval);
    return () => clearInterval(timer);
  }, [pollingInterval, isPaused]);

  const latest = history[history.length - 1] || {
    cpuPct: 14,
    memoryPct: 38,
    memoryUsedGb: 24.5,
    memoryTotalGb: 64.0,
    arcSizeGb: 32.0,
    arcHitPct: 95.6,
    iopsRead: 3420,
    iopsWrite: 1840,
    totalIops: 5260,
  };

  const cpuData = history.map((h) => h.cpuPct);
  const memData = history.map((h) => h.memoryPct);
  const arcData = history.map((h) => h.arcHitPct);
  const iopsData = history.map((h) => h.totalIops);

  const getMinMax = (arr: number[]) => {
    if (!arr.length) return { min: 0, max: 0 };
    return { min: Math.min(...arr), max: Math.max(...arr) };
  };

  const cpuMinMax = getMinMax(cpuData);
  const memMinMax = getMinMax(memData);
  const arcMinMax = getMinMax(arcData);
  const iopsMinMax = getMinMax(iopsData);

  return (
    <div className="p-5 rounded-xl bg-[#0c1326] border border-slate-800/80 space-y-4">
      {/* Top Telemetry Header & Polling Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Activity className="w-4 h-4 text-emerald-400" />
            {!isPaused && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>{lang === 'sq' ? 'Telemetria e Shendetit ne Kohe Reale' : 'Real-Time Health Telemetry'}</span>
              <span className="text-[10px] text-emerald-400 px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-800/40">
                LIVE
              </span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {lang === 'sq' ? 'Kujtesa ARC · CPU · RAM · I/O Sparklines' : 'ARC Memory · CPU · RAM · I/O Sparklines'} · {lastUpdated || 'Connecting...'}
            </span>
          </div>
        </div>

        {/* Polling Controls (Interval & Pause/Resume) */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 text-[11px] hidden md:inline">
            {lang === 'sq' ? 'Intervali i Leximit:' : 'Polling Interval:'}
          </span>
          <select
            value={pollingInterval}
            onChange={(e) => setPollingInterval(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            <option value={1000}>1s (Ultra-Fast)</option>
            <option value={2000}>2s (Standard)</option>
            <option value={5000}>5s (Low CPU)</option>
          </select>

          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer border ${
              isPaused
                ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-800/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title={isPaused ? (lang === 'sq' ? 'Vazhdo leximin (Resume)' : 'Resume') : (lang === 'sq' ? 'Pusho leximin (Pause)' : 'Pause')}
          >
            {isPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3" />}
            <span>{isPaused ? (lang === 'sq' ? 'Vazhdo' : 'Resume') : (lang === 'sq' ? 'Pusho' : 'Pause')}</span>
          </button>
        </div>
      </div>

      {/* 4 Sparkline Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: CPU Utilization */}
        <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>CPU Utilization</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              Min: {cpuMinMax.min}% · Max: {cpuMinMax.max}%
            </span>
          </div>

          <div className="flex items-baseline justify-between font-mono">
            <div className="text-2xl font-bold text-white tabular-nums">
              {latest.cpuPct}%
            </div>
            <span className="text-[11px] text-sky-400">
              {latest.cpuPct > 70 ? 'High Load' : 'Nominal'}
            </span>
          </div>

          <div className="pt-1">
            <SparklineChart
              data={cpuData}
              color="#38bdf8"
              gradientId="grad-cpu"
            />
          </div>
        </div>

        {/* Card 2: System RAM Memory */}
        <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>System RAM</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {latest.memoryUsedGb} / {latest.memoryTotalGb} GB
            </span>
          </div>

          <div className="flex items-baseline justify-between font-mono">
            <div className="text-2xl font-bold text-indigo-300 tabular-nums">
              {latest.memoryPct}%
            </div>
            <span className="text-[11px] text-slate-400">
              Allocated
            </span>
          </div>

          <div className="pt-1">
            <SparklineChart
              data={memData}
              color="#818cf8"
              gradientId="grad-mem"
            />
          </div>
        </div>

        {/* Card 3: ARC Hit Ratio & Size */}
        <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>ARC Hit Rate</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              ARC: {latest.arcSizeGb} GiB
            </span>
          </div>

          <div className="flex items-baseline justify-between font-mono">
            <div className="text-2xl font-bold text-emerald-400 tabular-nums">
              {latest.arcHitPct}%
            </div>
            <span className="text-[11px] text-emerald-500 font-semibold">
              Ultra-Fast
            </span>
          </div>

          <div className="pt-1">
            <SparklineChart
              data={arcData}
              color="#34d399"
              gradientId="grad-arc"
            />
          </div>
        </div>

        {/* Card 4: ZFS Storage I/O Operations */}
        <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800/90 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-mono flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Storage I/O Ops</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              R: {latest.iopsRead} · W: {latest.iopsWrite}
            </span>
          </div>

          <div className="flex items-baseline justify-between font-mono">
            <div className="text-2xl font-bold text-amber-300 tabular-nums">
              {latest.totalIops.toLocaleString()} <span className="text-xs font-normal text-slate-400">IOPS</span>
            </div>
            <span className="text-[11px] text-amber-400">
              Throughput
            </span>
          </div>

          <div className="pt-1">
            <SparklineChart
              data={iopsData}
              color="#fbbf24"
              gradientId="grad-iops"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

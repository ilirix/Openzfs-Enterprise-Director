import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Zap,
  HardDrive,
  Play,
  Pause,
  RefreshCw,
  TrendingUp,
  Layers,
  Database,
  Sliders,
  Sparkles,
  Info,
  Clock,
  ArrowDownUp,
  Gauge,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { AggregateIoTelemetryPoint, Language, Pool } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { useRafRender } from '../hooks/useRafRender';
import { telemetryWorkerService } from '../services/telemetryWorkerService';

interface Props {
  lang: Language;
  pools?: Pool[];
  onNavigateToPools?: () => void;
}

type ViewMode = 'combined' | 'iops' | 'throughput';

export const AggregateIoChartWidget: React.FC<Props> = ({
  lang,
  pools = [],
  onNavigateToPools,
}) => {
  const t = (k: string) => TRANSLATIONS[lang][k] || k;
  const { settings } = useAppSettings();

  // requestAnimationFrame synchronized chart history & current state
  const isRafActive = settings.gpuOffload && settings.rafEnabled;
  const [history, setHistory] = useRafRender<AggregateIoTelemetryPoint[]>([], isRafActive);
  const [current, setCurrent] = useRafRender<AggregateIoTelemetryPoint | null>(null, isRafActive);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [pollingInterval, setPollingInterval] = useState<number>(2000);
  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Visibility toggle for individual metric lines in Recharts
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});

  const toggleLine = (lineKey: string) => {
    setHiddenLines((prev) => ({
      ...prev,
      [lineKey]: !prev[lineKey],
    }));
  };

  const maxPoints = 30;

  const fetchData = async () => {
    try {
      const res = await zfsApi.getAggregateIoTelemetry();
      if (res && res.current) {
        // Offload mathematical smoothing, moving averages, and percentile stats to Web Worker
        if (settings.gpuOffload && settings.workerOffload) {
          const processed = await telemetryWorkerService.processAggregateIo(
            res.current,
            res.history && res.history.length > 0 ? res.history : history,
            maxPoints
          );
          setCurrent(processed.current);
          setHistory(processed.history);
        } else {
          setCurrent(res.current);
          if (res.history && res.history.length > 0) {
            setHistory(res.history.slice(-maxPoints));
          } else {
            setHistory((prev) => [...prev, res.current].slice(-maxPoints));
          }
        }

        setLastUpdated(res.current.timeLabel || new Date().toLocaleTimeString());
        setError(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Error fetching aggregate I/O telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      fetchData();
    }, pollingInterval);
    return () => clearInterval(interval);
  }, [pollingInterval, isPaused]);

  // Fallback state if still initialising
  const latest = current || history[history.length - 1] || {
    timestamp: Date.now(),
    timeLabel: new Date().toLocaleTimeString(),
    readIops: 0,
    writeIops: 0,
    totalIops: 0,
    readThroughputMb: 0,
    writeThroughputMb: 0,
    totalThroughputMb: 0,
    readLatencyMs: 0,
    writeLatencyMs: 0,
    pools: [],
  };

  // Custom Recharts Tooltip
  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload as AggregateIoTelemetryPoint;
      if (!dataPoint) return null;

      return (
        <div className="bg-[#070d1e] border border-slate-700/80 rounded-xl p-3.5 shadow-md text-xs font-mono min-w-[240px] z-50">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-300">
            <span className="flex items-center gap-1.5 font-sans font-medium text-slate-200">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              {label || dataPoint.timeLabel}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/40">
              ZFS AGGREGATE
            </span>
          </div>

          <div className="py-2.5 space-y-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans font-semibold mb-1">
                IOPS (IO/s)
              </div>
              <div className="flex justify-between items-center text-sky-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                  Read IOPS:
                </span>
                <span className="font-bold">{dataPoint.readIops.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-amber-300 mt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  Write IOPS:
                </span>
                <span className="font-bold">{dataPoint.writeIops.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-slate-200 font-semibold pt-1 border-t border-slate-800/60 mt-1">
                <span>Total IOPS:</span>
                <span>{dataPoint.totalIops.toLocaleString()}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/60">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans font-semibold mb-1">
                Throughput (MB/s)
              </div>
              <div className="flex justify-between items-center text-emerald-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  Read:
                </span>
                <span className="font-bold">{dataPoint.readThroughputMb} MB/s</span>
              </div>
              <div className="flex justify-between items-center text-rose-300 mt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                  Write:
                </span>
                <span className="font-bold">{dataPoint.writeThroughputMb} MB/s</span>
              </div>
              <div className="flex justify-between items-center text-white font-semibold pt-1 border-t border-slate-800/60 mt-1">
                <span>Total Bandwidth:</span>
                <span className="text-emerald-400">{dataPoint.totalThroughputMb} MB/s</span>
              </div>
            </div>

            {dataPoint.pools && dataPoint.pools.length > 0 && (
              <div className="pt-2 border-t border-slate-800/60">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-sans font-semibold mb-1">
                  {lang === 'sq' ? 'Sipas Pooleve' : 'Per-Pool Share'}
                </div>
                {dataPoint.pools.map((p) => (
                  <div key={p.poolName} className="flex justify-between text-[11px] text-slate-300 py-0.5">
                    <span className="text-slate-400 truncate max-w-[120px]">{p.poolName}:</span>
                    <span>
                      {p.totalIops.toLocaleString()} IOPS · {p.totalThroughputMb} MB/s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#0b1224] border border-slate-800/80 shadow-2xl space-y-5">
      {/* Top Header & Real-time Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-500/30 text-sky-400 shadow-inner">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>{t('aggregateIo.title')}</span>
              </h2>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40 inline-block" />
                {t('aggregateIo.live')}
              </span>
              {settings.gpuOffload && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/60 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-sky-400" />
                  <span>rAF + Web Worker</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-sans">
              {t('aggregateIo.subtitle')}
            </p>
          </div>
        </div>

        {/* Action & View Mode Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('combined')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'combined'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('aggregateIo.modeCombined')}
            </button>
            <button
              onClick={() => setViewMode('iops')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'iops'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('aggregateIo.modeIops')}
            </button>
            <button
              onClick={() => setViewMode('throughput')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                viewMode === 'throughput'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('aggregateIo.modeThroughput')}
            </button>
          </div>

          {/* Polling Interval Select */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
            <span className="text-slate-500 text-[11px] hidden sm:inline">
              {t('aggregateIo.pollingInterval')}
            </span>
            <select
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Number(e.target.value))}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer"
            >
              <option value={1000} className="bg-slate-900 text-white">1s</option>
              <option value={2000} className="bg-slate-900 text-white">2s</option>
              <option value={5000} className="bg-slate-900 text-white">5s</option>
            </select>
          </div>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setIsPaused((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer border ${
              isPaused
                ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-800/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3 h-3 text-amber-400" /> : <Pause className="w-3 h-3 text-slate-400" />}
            <span>{isPaused ? (lang === 'sq' ? 'Vazhdo' : 'Resume') : (lang === 'sq' ? 'Ndalo' : 'Pause')}</span>
          </button>

          {/* Manual Refresh */}
          <button
            onClick={fetchData}
            title={lang === 'sq' ? 'Rifresko menjëherë' : 'Refresh immediately'}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Aggregate Metrics Primary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Metric 1: Total Aggregate IOPS */}
        <div className="p-3.5 rounded-xl bg-[#070d1d] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              {t('aggregateIo.totalIops')}
            </span>
            <span className="text-[10px] font-mono text-sky-400">IO/s</span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
              {latest.totalIops.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono mt-1 text-slate-400">
              <span className="text-sky-300">
                <span className="text-slate-500">R:</span> {latest.readIops.toLocaleString()}
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-amber-300">
                <span className="text-slate-500">W:</span> {latest.writeIops.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Total Aggregate Throughput */}
        <div className="p-3.5 rounded-xl bg-[#070d1d] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              {t('aggregateIo.totalThroughput')}
            </span>
            <span className="text-[10px] font-mono text-emerald-400">MB/s</span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 tracking-tight">
              {latest.totalThroughputMb}{' '}
              <span className="text-xs font-normal text-slate-400">
                ({(latest.totalThroughputMb / 1024).toFixed(2)} GB/s)
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono mt-1 text-slate-400">
              <span className="text-emerald-300">
                <span className="text-slate-500">R:</span> {latest.readThroughputMb} MB/s
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-rose-300">
                <span className="text-slate-500">W:</span> {latest.writeThroughputMb} MB/s
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Estimated Latency */}
        <div className="p-3.5 rounded-xl bg-[#070d1d] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-indigo-400" />
              {t('aggregateIo.latency')}
            </span>
            <span className="text-[10px] font-mono text-indigo-400">Response</span>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-300 tracking-tight">
              {latest.readLatencyMs}{' '}
              <span className="text-xs font-normal text-slate-400">ms / avg</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono mt-1 text-slate-400">
              <span className="text-slate-300">
                <span className="text-slate-500">{t('aggregateIo.readLatency')}:</span> {latest.readLatencyMs}ms
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">
                <span className="text-slate-500">{t('aggregateIo.writeLatency')}:</span> {latest.writeLatencyMs}ms
              </span>
            </div>
          </div>
        </div>

        {/* Metric 4: All Pools Aggregated */}
        <div className="p-3.5 rounded-xl bg-[#070d1d] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-purple-400" />
              {t('aggregateIo.allPoolsAggregate')}
            </span>
            {onNavigateToPools && (
              <button
                onClick={onNavigateToPools}
                className="text-[10px] text-sky-400 hover:text-sky-300 cursor-pointer font-sans"
              >
                {lang === 'sq' ? 'Menaxho' : 'Manage'}
              </button>
            )}
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold font-mono text-purple-300 tracking-tight">
              {latest.pools ? latest.pools.length : pools.length || 2} Pools
            </div>
            <div className="text-[11px] font-mono text-slate-400 truncate mt-1">
              {latest.pools && latest.pools.length > 0 ? latest.pools.map((p) => p.poolName).join(' + ') : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Recharts Line Chart Container */}
      <div className="p-4 rounded-xl bg-[#070d1d] border border-slate-800/80 relative">
        {/* Metric Legend Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-800/60 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-500 text-[11px] font-sans">
              {lang === 'sq' ? 'Filtro linjat:' : 'Toggle lines:'}
            </span>

            {/* Read IOPS line toggle */}
            {(viewMode === 'combined' || viewMode === 'iops') && (
              <button
                onClick={() => toggleLine('readIops')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition cursor-pointer ${
                  hiddenLines['readIops']
                    ? 'opacity-40 line-through text-slate-500'
                    : 'text-sky-300 hover:bg-sky-950/40'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-sm shadow-sky-500/50" />
                <span>{t('aggregateIo.readIops')}</span>
              </button>
            )}

            {/* Write IOPS line toggle */}
            {(viewMode === 'combined' || viewMode === 'iops') && (
              <button
                onClick={() => toggleLine('writeIops')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition cursor-pointer ${
                  hiddenLines['writeIops']
                    ? 'opacity-40 line-through text-slate-500'
                    : 'text-amber-300 hover:bg-amber-950/40'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-sm shadow-amber-500/50" />
                <span>{t('aggregateIo.writeIops')}</span>
              </button>
            )}

            {/* Read Throughput line toggle */}
            {(viewMode === 'combined' || viewMode === 'throughput') && (
              <button
                onClick={() => toggleLine('readThroughputMb')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition cursor-pointer ${
                  hiddenLines['readThroughputMb']
                    ? 'opacity-40 line-through text-slate-500'
                    : 'text-emerald-300 hover:bg-emerald-950/40'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50" />
                <span>{t('aggregateIo.readThroughput')}</span>
              </button>
            )}

            {/* Write Throughput line toggle */}
            {(viewMode === 'combined' || viewMode === 'throughput') && (
              <button
                onClick={() => toggleLine('writeThroughputMb')}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition cursor-pointer ${
                  hiddenLines['writeThroughputMb']
                    ? 'opacity-40 line-through text-slate-500'
                    : 'text-rose-300 hover:bg-rose-950/40'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-sm shadow-rose-500/50" />
                <span>{t('aggregateIo.writeThroughput')}</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-500">
            {lang === 'sq' ? 'Mostra aktive:' : 'Active samples:'} {history.length} / {maxPoints} ·{' '}
            <span className="text-slate-400">{lastUpdated}</span>
          </div>
        </div>

        {/* Recharts Area/Line Chart */}
        <div className="w-full h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={history}
              margin={{ top: 10, right: viewMode === 'combined' ? 25 : 10, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.7} />

              <XAxis
                dataKey="timeLabel"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={{ stroke: '#334155' }}
              />

              {/* Left Y Axis for IOPS */}
              {(viewMode === 'combined' || viewMode === 'iops') && (
                <YAxis
                  yAxisId="iopsAxis"
                  stroke="#38bdf8"
                  orientation="left"
                  tick={{ fontSize: 10, fill: '#38bdf8' }}
                  tickLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => `${(val / 1000).toFixed(1)}k`}
                  label={{
                    value: 'IOPS (IO/s)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#38bdf8',
                    fontSize: 10,
                    style: { textAnchor: 'middle' },
                  }}
                />
              )}

              {/* Right Y Axis for Throughput MB/s */}
              {viewMode === 'combined' && (
                <YAxis
                  yAxisId="throughputAxis"
                  stroke="#34d399"
                  orientation="right"
                  tick={{ fontSize: 10, fill: '#34d399' }}
                  tickLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => `${val} MB`}
                  label={{
                    value: 'Throughput (MB/s)',
                    angle: 90,
                    position: 'insideRight',
                    fill: '#34d399',
                    fontSize: 10,
                    style: { textAnchor: 'middle' },
                  }}
                />
              )}

              {/* In Throughput-only mode, put Throughput on left axis */}
              {viewMode === 'throughput' && (
                <YAxis
                  yAxisId="throughputAxis"
                  stroke="#34d399"
                  orientation="left"
                  tick={{ fontSize: 10, fill: '#34d399' }}
                  tickLine={{ stroke: '#334155' }}
                  tickFormatter={(val) => `${val} MB/s`}
                  label={{
                    value: 'Throughput (MB/s)',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#34d399',
                    fontSize: 10,
                    style: { textAnchor: 'middle' },
                  }}
                />
              )}

              <Tooltip content={<CustomChartTooltip />} />

              {/* Line 1: Read IOPS */}
              {(viewMode === 'combined' || viewMode === 'iops') && !hiddenLines['readIops'] && (
                <Line
                  yAxisId="iopsAxis"
                  type="monotone"
                  dataKey="readIops"
                  name={t('aggregateIo.readIops')}
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#38bdf8', stroke: '#0369a1', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}

              {/* Line 2: Write IOPS */}
              {(viewMode === 'combined' || viewMode === 'iops') && !hiddenLines['writeIops'] && (
                <Line
                  yAxisId="iopsAxis"
                  type="monotone"
                  dataKey="writeIops"
                  name={t('aggregateIo.writeIops')}
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#fbbf24', stroke: '#b45309', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}

              {/* Line 3: Read Throughput */}
              {(viewMode === 'combined' || viewMode === 'throughput') && !hiddenLines['readThroughputMb'] && (
                <Line
                  yAxisId="throughputAxis"
                  type="monotone"
                  dataKey="readThroughputMb"
                  name={t('aggregateIo.readThroughput')}
                  stroke="#34d399"
                  strokeWidth={2}
                  strokeDasharray={viewMode === 'combined' ? '4 3' : undefined}
                  dot={false}
                  activeDot={{ r: 5, fill: '#34d399', stroke: '#065f46', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}

              {/* Line 4: Write Throughput */}
              {(viewMode === 'combined' || viewMode === 'throughput') && !hiddenLines['writeThroughputMb'] && (
                <Line
                  yAxisId="throughputAxis"
                  type="monotone"
                  dataKey="writeThroughputMb"
                  name={t('aggregateIo.writeThroughput')}
                  stroke="#f43f5e"
                  strokeWidth={2}
                  strokeDasharray={viewMode === 'combined' ? '4 3' : undefined}
                  dot={false}
                  activeDot={{ r: 5, fill: '#f43f5e', stroke: '#9f1239', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Breakdown: Per-Pool Contribution to Aggregate Stream */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            {t('aggregateIo.poolContribution')}
          </span>
          <span className="text-slate-500 text-[11px] font-mono">
            Copy-on-Write Transaction Aggregation
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
          {(latest.pools || []).map((poolMetric) => {
            const iopsShare = latest.totalIops > 0
              ? Math.round((poolMetric.totalIops / latest.totalIops) * 100)
              : 50;
            const throughputShare = latest.totalThroughputMb > 0
              ? Math.round((poolMetric.totalThroughputMb / latest.totalThroughputMb) * 100)
              : 50;

            const isFlash = poolMetric.poolName.includes('nvme');

            return (
              <div
                key={poolMetric.poolName}
                className="p-3.5 rounded-xl bg-[#070d1e] border border-slate-800/80 hover:border-slate-700 transition space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className={`w-3.5 h-3.5 ${isFlash ? 'text-amber-400' : 'text-sky-400'}`} />
                    <span className="font-bold text-white text-xs">{poolMetric.poolName}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded border ${
                        isFlash
                          ? 'bg-amber-950/60 text-amber-300 border-amber-800/40'
                          : 'bg-sky-950/60 text-sky-300 border-sky-800/40'
                      }`}
                    >
                      {isFlash ? 'All-Flash NVMe' : 'Hybrid RAIDZ2'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-white font-bold">
                      {poolMetric.totalIops.toLocaleString()}{' '}
                      <span className="text-[10px] text-slate-400 font-normal">IOPS</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      ({iopsShare}% of aggregate)
                    </span>
                  </div>
                </div>

                {/* Progress bar of pool's share */}
                <div className="space-y-1">
                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full ${isFlash ? 'bg-amber-500' : 'bg-sky-500'}`}
                      style={{ width: `${iopsShare}%` }}
                      title={`IOPS: ${iopsShare}%`}
                    />
                  </div>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-4 gap-2 pt-1 text-[11px] border-t border-slate-800/60">
                  <div>
                    <span className="text-slate-500 block text-[9px]">Read IOPS</span>
                    <span className="text-sky-300 font-semibold">{poolMetric.readIops.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Write IOPS</span>
                    <span className="text-amber-300 font-semibold">{poolMetric.writeIops.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Read MB/s</span>
                    <span className="text-emerald-300 font-semibold">{poolMetric.readThroughputMb}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">Write MB/s</span>
                    <span className="text-rose-300 font-semibold">{poolMetric.writeThroughputMb}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ZFS Architecture Explanatory Banner */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs text-slate-400 flex items-start gap-2.5 font-sans">
          <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="text-slate-200 font-semibold">
              {lang === 'sq' ? 'Arkitektura e I/O në ZFS:' : 'ZFS I/O Pipeline Architecture:'}
            </span>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {lang === 'sq'
                ? 'Shkrimet sinkrone përshpejtohen përmes SLOG ZIL (NVMe Mirror me PLP) pa bllokuar pool-in, ndërsa shkrimet asinkrone grupohen në Transaction Groups (TXG). Leximet shërbehen me vonesë nën-milisekondëse drejtpërdrejt nga kujtesa RAM (ARC) dhe L2ARC flash cache.'
                : 'Synchronous writes are safely committed through the SLOG ZIL (NVMe Mirror with PLP) without stalling transaction threads, while async payloads batch into Transaction Groups (TXG). Cache read hits are served at sub-millisecond latencies straight from host RAM (ARC) and flash L2ARC.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

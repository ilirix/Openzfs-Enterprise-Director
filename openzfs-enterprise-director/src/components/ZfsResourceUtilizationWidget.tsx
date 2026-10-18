import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  Database,
  Layers,
  Zap,
  Activity,
  HardDrive,
  Play,
  Pause,
  RefreshCw,
  Info,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Flame,
  ArrowUpRight,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ZfsResourceUtilization, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { useRafRender } from '../hooks/useRafRender';
import { telemetryWorkerService } from '../services/telemetryWorkerService';

interface Props {
  lang?: Language;
  onNavigateToArc?: () => void;
}

interface HistoryPoint {
  time: string;
  cpuTotal: number;
  cpuMeta: number;
  cpuData: number;
  arcMetaGb: number;
  arcDataGb: number;
}

export const ZfsResourceUtilizationWidget: React.FC<Props> = ({
  lang = 'sq',
  onNavigateToArc,
}) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const { settings } = useAppSettings();

  const isRafActive = settings.gpuOffload && settings.rafEnabled;
  const [data, setData] = useRafRender<ZfsResourceUtilization | null>(null, isRafActive);
  const [history, setHistory] = useRafRender<HistoryPoint[]>([], isRafActive);

  const [isLive, setIsLive] = useState(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [showArchInfo, setShowArchInfo] = useState(false);
  const [activeMetricTab, setActiveMetricTab] = useState<'all' | 'metadata' | 'data'>('all');

  const isLiveRef = useRef(isLive);
  isLiveRef.current = isLive;

  const fetchUtilization = async () => {
    try {
      setLoading(true);
      const res = await zfsApi.getResourceUtilization();

      if (settings.gpuOffload && settings.workerOffload) {
        const processed = await telemetryWorkerService.processResourceUtilization(res, history);
        setData(processed.data);
      } else {
        setData(res);
      }

      const now = new Date();
      const timeStr = `${now.getMinutes()}:${now.getSeconds().toString().padStart(2, '0')}`;

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: timeStr,
            cpuTotal: res.cpu.totalPct,
            cpuMeta: res.cpu.metadataPct,
            cpuData: res.cpu.dataPct,
            arcMetaGb: res.ram.arcMetadataGb,
            arcDataGb: res.ram.arcDataGb,
          },
        ];
        return next.slice(-20); // Keep last 20 samples
      });
    } catch (err) {
      console.error('Error fetching ZFS resource utilization:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUtilization();
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      if (isLiveRef.current) {
        fetchUtilization();
      }
    }, refreshIntervalSec * 1000);

    return () => clearInterval(interval);
  }, [isLive, refreshIntervalSec]);

  if (!data) {
    return (
      <div className="p-6 rounded-2xl bg-[#0b1224] border border-slate-800/80 shadow-2xl animate-pulse">
        <div className="h-6 w-64 bg-slate-800 rounded mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-44 bg-slate-800/40 rounded-xl" />
          <div className="h-44 bg-slate-800/40 rounded-xl" />
        </div>
      </div>
    );
  }

  const { cpu, ram, ops } = data;

  // CPU percentage calculation
  const cpuMetaShare = cpu.zfsTotalPct > 0 ? Math.round((cpu.metadataPct / cpu.zfsTotalPct) * 100) : 30;
  const cpuDataShare = 100 - cpuMetaShare;

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-[#0b1224] border border-slate-800/80 shadow-2xl space-y-6">
      {/* Top Header & Telemetry Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 via-sky-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                {t('resourceUtil.title')}
              </h2>
              {/* Live Streaming Badge */}
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider border ${
                  isLive
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                    : 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isLive ? 'bg-emerald-400 ring-2 ring-emerald-500/40' : 'bg-amber-400'
                  }`}
                />
                <span>{isLive ? t('resourceUtil.liveStreaming') : t('resourceUtil.paused')}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('resourceUtil.subtitle')}
            </p>
          </div>
        </div>

        {/* Live Controls: Stream Toggle, Interval, TXG Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active TXG Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-400">TXG #{ops.txgNumber}</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                ops.txgState === 'SYNCING'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800/60 ring-1 ring-amber-500/30'
                  : 'bg-sky-950 text-sky-300 border border-sky-800/60'
              }`}
            >
              {ops.txgState}
            </span>
          </div>

          {/* Interval Selector */}
          <div className="flex items-center bg-slate-950 rounded-xl p-1 border border-slate-800 text-[11px] font-mono">
            {[1, 2, 5].map((sec) => (
              <button
                key={sec}
                onClick={() => setRefreshIntervalSec(sec)}
                className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                  refreshIntervalSec === sec
                    ? 'bg-sky-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sec}s
              </button>
            ))}
          </div>

          {/* Play/Pause Button */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`p-2 rounded-xl border text-xs transition cursor-pointer flex items-center gap-1 ${
              isLive
                ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                : 'bg-emerald-950 hover:bg-emerald-900 border-emerald-700 text-emerald-300'
            }`}
            title={isLive ? 'Pauzizo transmetimin live' : 'Fillo transmetimin live'}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          {/* Manual Refresh */}
          <button
            onClick={fetchUtilization}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs transition cursor-pointer disabled:opacity-50"
            title="Rifresko menjehere"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Dual Grid: CPU Utilization & RAM / ARC Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ======================================================== */}
        {/* CARD 1: CPU ALLOCATION (Metadata vs Data) */}
        {/* ======================================================== */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#070d1c] border border-slate-800/90 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-sky-950/80 border border-sky-800/50 text-sky-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{t('resourceUtil.cpuTitle')}</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({cpu.totalPct}% total host)
                  </span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  {lang === 'sq'
                    ? `ZFS konsumon ${cpu.zfsTotalPct}% nga ${cpu.totalPct}% e ngarkesës së CPU`
                    : `ZFS consumes ${cpu.zfsTotalPct}% out of ${cpu.totalPct}% host CPU load`}
                </span>
              </div>
            </div>

            <div className="text-right font-mono">
              <span className="text-xl font-bold text-sky-300">{cpu.zfsTotalPct}%</span>
              <span className="text-[10px] text-slate-500 block uppercase">ZFS Kernel</span>
            </div>
          </div>

          {/* Stacked Segmented CPU Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
                <span>{t('resourceUtil.metadata')}: <strong>{cpu.metadataPct}%</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" />
                <span>{t('resourceUtil.dataOps')}: <strong>{cpu.dataPct}%</strong></span>
              </span>
            </div>

            {/* Segmented Bar */}
            <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden flex shadow-inner">
              {/* Metadata CPU (Purple) */}
              <div
                style={{ width: `${(cpu.metadataPct / 100) * 100}%` }}
                className="bg-purple-500 transition-all duration-500 hover:brightness-125"
                title={`Metadata CPU: ${cpu.metadataPct}% (dnode lookups, AVL/B-Tree indexing, metaslab allocations)`}
              />
              {/* Data Pipeline CPU (Sky) */}
              <div
                style={{ width: `${(cpu.dataPct / 100) * 100}%` }}
                className="bg-sky-400 transition-all duration-500 hover:brightness-125"
                title={`Data CPU: ${cpu.dataPct}% (LZ4 compression, Fletcher4 checksumming, ZIO pipeline)`}
              />
              {/* TXG Sync Threads (Amber) */}
              <div
                style={{ width: `${(cpu.txgSyncPct / 100) * 100}%` }}
                className="bg-amber-400 transition-all duration-500 hover:brightness-125"
                title={`TXG Sync: ${cpu.txgSyncPct}% (txg_sync write flush commits)`}
              />
              {/* Storage IO Wait & IRQ (Rose) */}
              <div
                style={{ width: `${(cpu.storageIoWaitPct / 100) * 100}%` }}
                className="bg-rose-400 transition-all duration-500 hover:brightness-125"
                title={`Storage IO Wait: ${cpu.storageIoWaitPct}% (Controller IRQ & NVMe dispatch)`}
              />
              {/* Other Host Processes (Slate) */}
              <div
                style={{ width: `${(cpu.otherSysPct / 100) * 100}%` }}
                className="bg-slate-700 transition-all duration-500 hover:brightness-125"
                title={`Other System: ${cpu.otherSysPct}% (Host OS & background daemons)`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-0.5">
              <span>0%</span>
              <span className="text-slate-400">Total Host Load: {cpu.totalPct}%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Granular CPU Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-purple-900/40">
              <div className="flex items-center gap-1.5 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.metadata')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{cpu.metadataPct}%</div>
              <span className="text-[10px] text-slate-400 font-sans block truncate">
                SPA & dnodes
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-sky-900/40">
              <div className="flex items-center gap-1.5 text-sky-300">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.dataOps')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{cpu.dataPct}%</div>
              <span className="text-[10px] text-slate-400 font-sans block truncate">
                ZIO & LZ4 / F4
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-amber-900/40">
              <div className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.txgSync')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{cpu.txgSyncPct}%</div>
              <span className="text-[10px] text-slate-400 font-sans block truncate">
                Flushes & commits
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.ioWait')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{cpu.storageIoWaitPct}%</div>
              <span className="text-[10px] text-slate-400 font-sans block truncate">
                NVMe / SAS IRQ
              </span>
            </div>
          </div>

          {/* Mini CPU Sparkline Track */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>{lang === 'sq' ? 'Trendi i CPU në Kohë Reale (20 pika)' : 'Real-Time CPU History (20 ticks)'}</span>
              <span className="text-sky-300">
                Meta: {cpuMetaShare}% vs Data: {cpuDataShare}%
              </span>
            </div>
            {/* SVG Sparkline */}
            <div className="h-10 w-full flex items-end gap-1 pt-1">
              {history.map((pt, i) => {
                const totalH = Math.min(100, Math.max(10, pt.cpuTotal * 3));
                const metaH = Math.min(100, Math.max(4, pt.cpuMeta * 5));
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full group relative">
                    <div
                      style={{ height: `${totalH}%` }}
                      className="w-full bg-sky-500/30 rounded-t-sm flex flex-col justify-end overflow-hidden group-hover:bg-sky-400/50 transition"
                    >
                      <div
                        style={{ height: `${metaH}%` }}
                        className="w-full bg-purple-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CARD 2: RAM & ARC ALLOCATION (Metadata vs Data) */}
        {/* ======================================================== */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#070d1c] border border-slate-800/90 space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800/50 text-emerald-400">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{t('resourceUtil.ramTitle')}</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    ({ram.usedRamGb} / {ram.totalRamGb} GB Total)
                  </span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  {lang === 'sq'
                    ? `ARC: ${ram.arcTotalGb} GB (Synimi c_max: ${ram.arcTargetGb} GB)`
                    : `ARC Cache: ${ram.arcTotalGb} GB (Target c_max: ${ram.arcTargetGb} GB)`}
                </span>
              </div>
            </div>

            {onNavigateToArc && (
              <button
                onClick={onNavigateToArc}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 cursor-pointer"
              >
                <span>Tuner</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Stacked Segmented RAM & ARC Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-purple-400" />
                <span>ARC Meta: <strong>{ram.arcMetadataGb} GB ({ram.arcMetadataPct}%)</strong></span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                <span>ARC Data: <strong>{ram.arcDataGb} GB ({ram.arcDataPct}%)</strong></span>
              </span>
            </div>

            {/* Segmented Bar across Total System RAM */}
            <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden flex shadow-inner">
              {/* ARC Metadata (Purple) */}
              <div
                style={{ width: `${(ram.arcMetadataGb / ram.totalRamGb) * 100}%` }}
                className="bg-purple-500 transition-all duration-500 hover:brightness-125"
                title={`ARC Metadata: ${ram.arcMetadataGb} GB (${ram.arcMetadataPct}% of ARC)`}
              />
              {/* ARC User Data (Emerald) */}
              <div
                style={{ width: `${(ram.arcDataGb / ram.totalRamGb) * 100}%` }}
                className="bg-emerald-400 transition-all duration-500 hover:brightness-125"
                title={`ARC Cached Data: ${ram.arcDataGb} GB (${ram.arcDataPct}% of ARC)`}
              />
              {/* Dirty TXG Buffer (Amber) */}
              <div
                style={{ width: `${((ram.arcDirtyMb / 1024) / ram.totalRamGb) * 100}%` }}
                className="bg-amber-400 transition-all duration-500 hover:brightness-125"
                title={`Dirty TXG Buffer: ${ram.arcDirtyMb} MB (unwritten payload awaiting flush)`}
              />
              {/* System Apps & OS Kernel (Indigo) */}
              <div
                style={{ width: `${(ram.systemAppsGb / ram.totalRamGb) * 100}%` }}
                className="bg-indigo-500 transition-all duration-500 hover:brightness-125"
                title={`Host Apps & Kernel: ${ram.systemAppsGb} GB`}
              />
              {/* Free Headroom (Slate-800) */}
              <div
                style={{ width: `${(ram.freeRamGb / ram.totalRamGb) * 100}%` }}
                className="bg-slate-800 transition-all duration-500 hover:brightness-125"
                title={`Free Memory: ${ram.freeRamGb} GB (Available headroom)`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-0.5">
              <span>0 GB</span>
              <span className="text-slate-400">ARC Target: {ram.arcTargetGb} GB</span>
              <span>{ram.totalRamGb} GB</span>
            </div>
          </div>

          {/* Granular RAM Breakdown Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-purple-900/40">
              <div className="flex items-center gap-1.5 text-purple-300">
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.arcMetadata')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{ram.arcMetadataGb} GB</div>
              <span className="text-[10px] text-purple-400 font-sans block truncate">
                {ram.arcMetadataPct}% of ARC cache
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-emerald-900/40">
              <div className="flex items-center gap-1.5 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.arcData')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{ram.arcDataGb} GB</div>
              <span className="text-[10px] text-emerald-400 font-sans block truncate">
                {ram.arcDataPct}% of ARC cache
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-amber-900/40">
              <div className="flex items-center gap-1.5 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.dirtyBuffer')}</span>
              </div>
              <div className="text-sm font-bold text-white mt-1">{ram.arcDirtyMb} MB</div>
              <span className="text-[10px] text-amber-400 font-sans block truncate">
                Open TXG commit
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[10px] truncate">{t('resourceUtil.freeMemory')}</span>
              </div>
              <div className="text-sm font-bold text-emerald-400 mt-1">{ram.freeRamGb} GB</div>
              <span className="text-[10px] text-slate-400 font-sans block truncate">
                Available RAM
              </span>
            </div>
          </div>

          {/* ARC RAM Ratio Bar & Diagnostic */}
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-[11px]">
                {lang === 'sq' ? 'Kufiri i Metadhenave (arc_meta_limit):' : 'ARC Metadata Limit:'}
              </span>
              <span className="text-purple-300 font-bold">75% max</span>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              Ghost Headers: <span className="text-white font-bold">{ram.arcGhostMb} MB</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* REAL-TIME OPERATIONS & STORAGE PIPELINE METRICS RIBBON */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs font-mono">
        {/* Metric 1: Metadata Operations/sec */}
        <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px]">{t('resourceUtil.metaOpsSec')}</span>
            <Layers className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-purple-300">
            {ops.metadataOpsPerSec.toLocaleString()} <span className="text-xs text-slate-500 font-normal">ops/s</span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans block">
            stat, open, readdir, getattr
          </span>
        </div>

        {/* Metric 2: User Data Payload Ops/sec */}
        <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px]">{t('resourceUtil.dataOpsSec')}</span>
            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-sky-300">
            {ops.dataOpsPerSec.toLocaleString()} <span className="text-xs text-slate-500 font-normal">ops/s</span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans block">
            payload reads & writes ({ops.totalIops.toLocaleString()} total)
          </span>
        </div>

        {/* Metric 3: Inline Compression Efficiency */}
        <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px]">{t('resourceUtil.compressionSavings')}</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-300">
            {ops.compressionRatio}x <span className="text-xs text-emerald-500 font-normal">LZ4</span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans block">
            {ops.compressionSavingsGb.toLocaleString()} GB kursyer në flash/disk
          </span>
        </div>

        {/* Metric 4: Throughput Read / Write Rate */}
        <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px]">{lang === 'sq' ? 'Xhiroja e Shpejtësisë' : 'Throughput Rate'}</span>
            <Activity className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white">
            <span className="text-emerald-400">{ops.throughputReadMbS}</span>
            <span className="text-slate-500 text-xs mx-1">/</span>
            <span className="text-amber-400">{ops.throughputWriteMbS}</span>
            <span className="text-xs text-slate-500 font-normal ml-1">MB/s</span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans block">
            Lexim (ARC) / Shkrim (TXG)
          </span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* COLLAPSIBLE ARCHITECTURAL ENGINEERING ADVISORY */}
      {/* ======================================================== */}
      <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
        <button
          onClick={() => setShowArchInfo(!showArchInfo)}
          className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-400" />
            <span>
              {lang === 'sq'
                ? 'Pse ka rëndësi ndarja e Metatëdhënave (Metadata) nga të Dhënat (Data) në ZFS?'
                : 'Why ZFS Metadata vs Data Resource Separation Matters for Performance'}
            </span>
          </div>
          {showArchInfo ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showArchInfo && (
          <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
            <div className="space-y-1.5">
              <span className="font-bold text-purple-300 font-mono block">
                1. Metatëdhënat (Dnodes, B-Trees & Inodes):
              </span>
              <p className="text-[11px] text-slate-400">
                {lang === 'sq'
                  ? 'Çdo lexim skedari kërkon së pari lundrim në pemën B-Tree dhe strukturën e dnodes. Nëse metatëdhënat evictohen nga RAM (ARC), kjo shkakton latenca diskale deri në 10ms për çdo kërkim skedari. Shtimi i një Special VDEV NVMe ruan metatëdhënat direkt në flash, duke çliruar CPU nga traversal threads.'
                  : 'Every file read requires first traversing B-Trees and dnode structures. If metadata is evicted from RAM, it forces 10ms spinning disk seeks just to find file locations. Adding Special VDEVs keeps metadata pinned to flash, slashing CPU seek overhead.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="font-bold text-sky-300 font-mono block">
                2. Të Dhënat e Përdoruesit & Pipeline ZIO:
              </span>
              <p className="text-[11px] text-slate-400">
                {lang === 'sq'
                  ? 'Operacionet e të dhënave konsumojnë CPU kryesisht në kompresim (algoritmet LZ4 dhe ZSTD) dhe llogaritjen e checksum-eve Fletcher4. Kur ARC mban të dhënat e nxehta (MRU/MFU), leximet arrijnë shpejtësi RAM deri në 12 GB/s me latenca nën-mikrosekond.'
                  : 'Data operations consume CPU predominantly during compression (LZ4/ZSTD) and checksum calculation (Fletcher4). When ARC caches hot working sets, reads achieve memory speeds up to 12 GB/s with sub-microsecond latency.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

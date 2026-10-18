import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ScrollText,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  AlertOctagon,
  Info,
  Bug,
  Download,
  Trash2,
  Play,
  Pause,
  Copy,
  Check,
  ChevronDown,
  Layers,
  Terminal,
  Activity,
  HardDrive,
  Cpu,
  Radio,
  SlidersHorizontal,
  X,
  ExternalLink,
} from 'lucide-react';
import { LogEntry, LogLevel, Pool, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';

interface Props {
  pools?: Pool[];
  lang: Language;
  onInspectDevice?: (dev: string) => void;
}

export const LogsView: React.FC<Props> = ({ pools = [], lang, onInspectDevice }) => {
  const t = (key: string) => TRANSLATIONS[lang][key] || key;

  // Filter & Control State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [stats, setStats] = useState({
    errorCount: 0,
    warnCount: 0,
    infoCount: 0,
    debugCount: 0,
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [refreshInterval, setRefreshInterval] = useState<number>(2000); // 2s default
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterPool, setFilterPool] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'all' | 'errors' | 'scrub' | 'arc' | 'disks'>('all');

  const [autoScroll, setAutoScroll] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef<boolean>(true);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch logs with current filter parameters
  const fetchLogs = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      let levelParam = filterLevel;
      let searchParam = searchQuery;

      // Handle presets
      if (activePreset === 'errors') {
        levelParam = 'all'; // handled via client or server query
      }

      const res = await zfsApi.getLogs({
        level: levelParam !== 'all' ? levelParam : undefined,
        source: filterSource !== 'all' ? filterSource : undefined,
        pool: filterPool !== 'all' ? filterPool : undefined,
        search: searchParam.trim() || undefined,
        limit: 150,
      });

      if (res && res.logs) {
        setLogs(res.logs);
        setTotalCount(res.total);
        if (res.stats) {
          setStats(res.stats);
        }
        setLastUpdated(new Date());
      }
    } catch (err: any) {
      console.error('Failed to fetch logs:', err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchLogs(false);
  }, [filterLevel, filterSource, filterPool, searchQuery]);

  // Polling stream timer
  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      fetchLogs(true);
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [isStreaming, refreshInterval, filterLevel, filterSource, filterPool, searchQuery]);

  // Auto-scroll logic if enabled
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Apply preset filter shortcuts
  const handleApplyPreset = (preset: 'all' | 'errors' | 'scrub' | 'arc' | 'disks') => {
    setActivePreset(preset);
    if (preset === 'all') {
      setFilterLevel('all');
      setFilterSource('all');
      setFilterPool('all');
      setSearchQuery('');
    } else if (preset === 'errors') {
      setFilterLevel('ERROR');
      setFilterSource('all');
      setFilterPool('all');
      setSearchQuery('');
    } else if (preset === 'scrub') {
      setFilterLevel('all');
      setFilterSource('all');
      setSearchQuery('scrub');
    } else if (preset === 'arc') {
      setFilterLevel('all');
      setFilterSource('all');
      setSearchQuery('arc');
    } else if (preset === 'disks') {
      setFilterLevel('all');
      setFilterSource('smartd');
      setSearchQuery('');
    }
  };

  // Simulate Diagnostic Log Event
  const handleSimulateDiagnostic = async () => {
    setIsSimulating(true);
    try {
      const templates = [
        {
          level: 'WARN',
          source: 'zfs-kernel',
          subsystem: 'vdev',
          pool: 'tank-enterprise',
          message: 'Diagnostic check: SMART ping completed, latency threshold normal on /dev/sdb..sdg',
        },
        {
          level: 'ERROR',
          source: 'zed',
          subsystem: 'checksum',
          pool: 'tank-enterprise',
          message: 'Diagnostic Alert: test checksum parity mismatch simulated; automatic self-healing triggered',
        },
        {
          level: 'INFO',
          source: 'storage-director',
          subsystem: 'spa',
          pool: 'fast-nvme-pool',
          message: 'Diagnostic heartbeat: NVMe namespace health nominal, 0 unrecoverable read errors',
        },
      ];
      const selected = templates[Math.floor(Math.random() * templates.length)];
      await zfsApi.generateTestLog(selected);
      showToast(lang === 'sq' ? 'Eventi diagnostikues u gjenerua me sukses!' : 'Diagnostic test event generated successfully!');
      fetchLogs(true);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Clear log buffer
  const handleClearLogs = async () => {
    try {
      await zfsApi.clearLogs();
      showToast(lang === 'sq' ? 'Regjistrat u pastruan me sukses.' : 'Log buffer cleared successfully.');
      fetchLogs(false);
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  // Export logs to file
  const handleExport = (format: 'json' | 'log') => {
    setShowExportMenu(false);
    if (logs.length === 0) {
      showToast(lang === 'sq' ? 'Nuk ka regjistra per eksportim' : 'No logs available to export');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let content = '';
    let mimeType = 'text/plain';
    let filename = `zfs-daemon-logs-${timestamp}.log`;

    if (format === 'json') {
      content = JSON.stringify(logs, null, 2);
      mimeType = 'application/json';
      filename = `zfs-daemon-logs-${timestamp}.json`;
    } else {
      content = logs
        .map((l) => `${l.timestamp} [${l.level}] [${l.source}${l.subsystem ? `:${l.subsystem}` : ''}] ${l.pool ? `(${l.pool}) ` : ''}${l.message}`)
        .join('\n');
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(lang === 'sq' ? `Eksportimi (${format.toUpperCase()}) u shkarkua!` : `Logs exported as ${format.toUpperCase()}!`);
  };

  // Copy single log line to clipboard
  const handleCopyLine = (log: LogEntry) => {
    const text = log.raw || `${log.timestamp} [${log.level}] [${log.source}] ${log.message}`;
    navigator.clipboard.writeText(text);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper for badge colors
  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="w-3 h-3 text-rose-400" />
            ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            WARN
          </span>
        );
      case 'INFO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Info className="w-3 h-3 text-sky-400" />
            INFO
          </span>
        );
      case 'DEBUG':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider bg-slate-500/15 text-slate-400 border border-slate-500/30">
            <Bug className="w-3 h-3 text-slate-400" />
            DEBUG
          </span>
        );
    }
  };

  // Helper for source badge
  const getSourceBadge = (source: string) => {
    let color = 'bg-slate-800/80 text-slate-300 border-slate-700/60';
    if (source === 'zfs-kernel') color = 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50';
    if (source === 'zed') color = 'bg-cyan-950/80 text-cyan-300 border-cyan-700/50';
    if (source === 'storage-director') color = 'bg-orange-950/80 text-orange-300 border-orange-700/50';
    if (source === 'smartd') color = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50';
    if (source === 'sanoid') color = 'bg-purple-950/80 text-purple-300 border-purple-700/50';

    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${color}`}>
        {source}
      </span>
    );
  };

  // Filter logs for display based on search query (if client search needed)
  const displayLogs = useMemo(() => {
    return logs;
  }, [logs]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast notification banner */}
      {toastMessage && (
        <div className="fixed top-18 right-6 z-50 px-4 py-2.5 rounded-lg bg-sky-950/95 border border-sky-500/70 text-sky-200 text-xs font-semibold shadow-2xl animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Header Card */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
            <ScrollText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-white tracking-tight">{t('logs.title')}</h1>
              {isStreaming ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {t('logs.liveStreaming')} ({refreshInterval / 1000}s)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Pause className="w-3 h-3" />
                  {t('logs.paused')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">{t('logs.subtitle')}</p>
          </div>
        </div>

        {/* Live Severity Metrics KPI Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleApplyPreset('all')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition text-left"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <div>
              <div className="text-[10px] text-slate-400 font-medium">{t('logs.statsTotal')}</div>
              <div className="text-xs font-bold text-white font-mono">{totalCount}</div>
            </div>
          </button>

          <button
            onClick={() => {
              setFilterLevel('ERROR');
              setActivePreset('errors');
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/30 border border-rose-900/50 hover:border-rose-700/60 transition text-left"
          >
            <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
            <div>
              <div className="text-[10px] text-rose-300 font-medium">{t('logs.statsErrors')}</div>
              <div className="text-xs font-bold text-rose-400 font-mono">{stats.errorCount}</div>
            </div>
          </button>

          <button
            onClick={() => setFilterLevel('WARN')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/30 border border-amber-900/50 hover:border-amber-700/60 transition text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <div className="text-[10px] text-amber-300 font-medium">{t('logs.statsWarnings')}</div>
              <div className="text-xs font-bold text-amber-400 font-mono">{stats.warnCount}</div>
            </div>
          </button>

          <button
            onClick={() => setFilterLevel('INFO')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-sky-950/30 border border-sky-900/50 hover:border-sky-700/60 transition text-left"
          >
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <div>
              <div className="text-[10px] text-sky-300 font-medium">{t('logs.statsInfo')}</div>
              <div className="text-xs font-bold text-sky-400 font-mono">{stats.infoCount}</div>
            </div>
          </button>

          <button
            onClick={() => setFilterLevel('DEBUG')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition text-left"
          >
            <Bug className="w-3.5 h-3.5 text-slate-400" />
            <div>
              <div className="text-[10px] text-slate-400 font-medium">{t('logs.statsDebug')}</div>
              <div className="text-xs font-bold text-slate-400 font-mono">{stats.debugCount}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Preset Filter Pills & Streaming Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800/60">
        {/* Preset quick buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-[11px] text-slate-400 font-medium mr-1.5 shrink-0 hidden sm:inline">
            {lang === 'sq' ? 'Kategori:' : 'Presets:'}
          </span>
          <button
            onClick={() => handleApplyPreset('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition ${
              activePreset === 'all'
                ? 'bg-sky-500 text-white font-semibold shadow-sm shadow-sky-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('logs.presetAll')}
          </button>
          <button
            onClick={() => handleApplyPreset('errors')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition ${
              activePreset === 'errors'
                ? 'bg-rose-600 text-white font-semibold'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('logs.presetErrors')}
          </button>
          <button
            onClick={() => handleApplyPreset('scrub')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition ${
              activePreset === 'scrub'
                ? 'bg-sky-600 text-white font-semibold'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('logs.presetScrub')}
          </button>
          <button
            onClick={() => handleApplyPreset('arc')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition ${
              activePreset === 'arc'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('logs.presetArc')}
          </button>
          <button
            onClick={() => handleApplyPreset('disks')}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition ${
              activePreset === 'disks'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('logs.presetDisks')}
          </button>
        </div>

        {/* Live Controls: Play/Pause, Interval, Refresh, Diagnostics */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Pause / Play Streaming button */}
          <button
            onClick={() => setIsStreaming((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              isStreaming
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
            }`}
            title={isStreaming ? t('logs.pause') : t('logs.resume')}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>{t('logs.pause')}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>{t('logs.resume')}</span>
              </>
            )}
          </button>

          {/* Interval Selector */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-sky-500"
            title={t('logs.interval')}
          >
            <option value={1000}>1s (Ultra-Fast)</option>
            <option value={2000}>2s (Standard)</option>
            <option value={5000}>5s (Low CPU)</option>
            <option value={10000}>10s (Eco)</option>
          </select>

          {/* Manual Refresh Button */}
          <button
            onClick={() => fetchLogs(false)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-50"
            title={t('logs.refreshNow')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
            <span className="hidden sm:inline">{t('logs.refreshNow')}</span>
          </button>

          {/* Simulate Diagnostic Button */}
          <button
            onClick={handleSimulateDiagnostic}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/50 text-indigo-200 text-xs font-medium transition disabled:opacity-50"
            title={t('logs.simulateEvent')}
          >
            <Activity className={`w-3.5 h-3.5 text-indigo-400 ${isSimulating ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{t('logs.simulateEvent')}</span>
          </button>
        </div>
      </div>

      {/* Main Filter & Action Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
        {/* Search Bar (5 cols) */}
        <div className="lg:col-span-5 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('logs.searchPlaceholder')}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Severity Filter Dropdown (2 cols) */}
        <div className="lg:col-span-2">
          <select
            value={filterLevel}
            onChange={(e) => {
              setFilterLevel(e.target.value);
              setActivePreset('all');
            }}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="all">{t('logs.allLevels')}</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
        </div>

        {/* Source Daemon Filter (2 cols) */}
        <div className="lg:col-span-2">
          <select
            value={filterSource}
            onChange={(e) => {
              setFilterSource(e.target.value);
              setActivePreset('all');
            }}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50 font-mono"
          >
            <option value="all">{t('logs.allSources')}</option>
            <option value="zfs-kernel">zfs-kernel (zfs.ko)</option>
            <option value="zed">zed (ZFS Event Daemon)</option>
            <option value="storage-director">storage-director (Rust)</option>
            <option value="smartd">smartd (Disk SMART)</option>
            <option value="sanoid">sanoid (Snapshots)</option>
          </select>
        </div>

        {/* Pool Filter (1.5 cols) */}
        <div className="lg:col-span-1">
          <select
            value={filterPool}
            onChange={(e) => setFilterPool(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="all">{t('logs.allPools')}</option>
            <option value="system">system</option>
            {pools.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Actions Menu: Export & Clear (2 cols) */}
        <div className="lg:col-span-2 flex items-center gap-2 justify-end">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('logs.exportLogs')}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-48 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl py-1 z-30">
                <button
                  onClick={() => handleExport('json')}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-sky-600 hover:text-white transition flex items-center justify-between"
                >
                  <span>{t('logs.exportJson')}</span>
                  <span className="text-[10px] text-slate-400 font-mono">.json</span>
                </button>
                <button
                  onClick={() => handleExport('log')}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-200 hover:bg-sky-600 hover:text-white transition flex items-center justify-between"
                >
                  <span>{t('logs.exportLog')}</span>
                  <span className="text-[10px] text-slate-400 font-mono">.log</span>
                </button>
              </div>
            )}
          </div>

          {/* Clear Logs Button */}
          <button
            onClick={handleClearLogs}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 border border-slate-700 hover:border-rose-800/60 text-slate-400 transition"
            title={t('logs.clearLogs')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal / Syslog Live Console Window */}
      <div className="bg-[#070b14] border border-slate-800/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Terminal Title Bar */}
        <div className="bg-[#0d1322] px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <span className="text-xs font-mono text-slate-300 font-semibold tracking-wide flex items-center gap-1.5 ml-2">
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              storage-daemon: /var/log/zfs/zfs.event.log
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            {/* Auto-scroll toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] select-none text-slate-400 hover:text-slate-200">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span>{t('logs.autoScroll')}</span>
            </label>

            <span className="text-[11px] font-mono text-slate-500">
              {displayLogs.length} {t('logs.entriesFound')}
            </span>
          </div>
        </div>

        {/* Scrollable Log Lines Body */}
        <div
          ref={logContainerRef}
          className="p-3 sm:p-4 font-mono text-xs overflow-y-auto max-h-[580px] min-h-[360px] divide-y divide-slate-800/30 space-y-1"
        >
          {displayLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <ScrollText className="w-10 h-10 mx-auto text-slate-600 stroke-[1.5]" />
              <p className="text-sm font-medium">{t('logs.noLogsFound')}</p>
              <button
                onClick={() => handleApplyPreset('all')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-medium transition"
              >
                {lang === 'sq' ? 'Pastro Filtrat' : 'Reset Filters'}
              </button>
            </div>
          ) : (
            displayLogs.map((log, idx) => (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="group flex flex-col md:flex-row items-start md:items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-800/40 cursor-pointer transition select-text"
              >
                {/* Left side: Index, Timestamp, Level, Source, Subsystem, Pool, Message */}
                <div className="flex items-start md:items-center gap-2.5 flex-wrap flex-1 min-w-0">
                  {/* Line number */}
                  <span className="text-[11px] text-slate-600 font-mono w-7 shrink-0 text-right select-none">
                    {idx + 1}
                  </span>

                  {/* Timestamp */}
                  <span className="text-[11px] text-slate-400 font-mono shrink-0">
                    {log.timestamp.includes(' ') ? log.timestamp.split(' ')[1] : log.timestamp}
                  </span>

                  {/* Level badge */}
                  <div className="shrink-0">{getLevelBadge(log.level)}</div>

                  {/* Source daemon */}
                  <div className="shrink-0">{getSourceBadge(log.source)}</div>

                  {/* Subsystem */}
                  {log.subsystem && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900/90 px-1 rounded border border-slate-800 shrink-0">
                      [{log.subsystem}]
                    </span>
                  )}

                  {/* Pool badge */}
                  {log.pool && log.pool !== 'system' && (
                    <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-1.5 rounded border border-sky-800/40 shrink-0">
                      @{log.pool}
                    </span>
                  )}

                  {/* Log message with highlights */}
                  <span className="text-slate-200 text-xs break-all leading-relaxed font-mono">
                    {log.message}
                  </span>
                </div>

                {/* Right side quick actions (Copy / Inspect) */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition select-none ml-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyLine(log);
                    }}
                    className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                    title={t('logs.copyLine')}
                  >
                    {copiedId === log.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLog(log);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-600 text-[11px] text-slate-300 hover:text-white transition"
                  >
                    {t('common.details')}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Console Footer Status */}
        <div className="bg-[#0b101c] px-4 py-2 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>OpenZFS event broker socket connected (IPC: /var/run/zfs.sock)</span>
          </div>
          <div className="text-slate-500 font-mono">
            {lang === 'sq' ? 'Rifreskuar:' : 'Last update:'}{' '}
            {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Deep Log Event Inspector Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <ScrollText className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">{t('logs.details')}</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Metadata Key-Value Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.filterLevel')}</div>
                  <div className="mt-1">{getLevelBadge(selectedLog.level)}</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.filterSource')}</div>
                  <div className="text-xs font-mono font-bold text-slate-200 mt-1">{selectedLog.source}</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.subsystem')}</div>
                  <div className="text-xs font-mono font-bold text-sky-400 mt-1">{selectedLog.subsystem || 'core'}</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.filterPool')}</div>
                  <div className="text-xs font-mono font-bold text-emerald-400 mt-1">{selectedLog.pool || 'system'}</div>
                </div>
              </div>

              {/* Timestamp */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.timestamp')}</div>
                <div className="text-xs font-mono text-slate-300 mt-0.5">
                  {selectedLog.timestamp} <span className="text-slate-500">({selectedLog.epochMs} epoch ms)</span>
                </div>
              </div>

              {/* Message */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.message')}</div>
                <p className="text-xs font-mono text-white mt-1 leading-relaxed bg-slate-900 p-2.5 rounded-lg border border-slate-800/80">
                  {selectedLog.message}
                </p>
              </div>

              {/* Raw Syslog RFC line */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">{t('logs.rawView')}</span>
                  <button
                    onClick={() => handleCopyLine(selectedLog)}
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-mono transition"
                  >
                    {copiedId === selectedLog.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>{t('logs.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{t('logs.copyLine')}</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto whitespace-pre-wrap">
                  {selectedLog.raw || `${selectedLog.timestamp} [${selectedLog.source}:${selectedLog.subsystem}] ${selectedLog.message}`}
                </pre>
              </div>

              {/* JSON Metadata representation */}
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">JSON Object</div>
                <pre className="text-[11px] font-mono text-sky-300/90 bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
              <button
                onClick={() => handleCopyLine(selectedLog)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t('logs.copyLine')}</span>
              </button>

              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white transition"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Thermometer,
  Activity,
  Layers,
  Zap,
  RefreshCw,
  Info,
  CheckCircle2,
  TrendingDown,
  Filter,
  Flame,
  ArrowUpRight,
  Bell,
  BellRing,
  BellOff,
  History,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Gauge,
  Sliders,
} from 'lucide-react';
import {
  DriveHealthSummary,
  DriveSmartHistoricalTrend,
  SmartFleetTrendResponse,
  SmartTrendPoint,
  Language,
} from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';
import { useAppSettings } from '../context/AppSettingsContext';
import { telemetryWorkerService } from '../services/telemetryWorkerService';

interface Props {
  onInspectDevice?: (dev: string) => void;
  lang?: Language;
}

export const DriveHealthSummaryWidget: React.FC<Props> = ({
  onInspectDevice,
  lang = 'en',
}) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const { settings } = useAppSettings();

  const [drives, setDrives] = useState<DriveHealthSummary[]>([]);
  const [trends, setTrends] = useState<DriveSmartHistoricalTrend[]>([]);
  const [filter, setFilter] = useState<'all' | 'warning' | 'hdd' | 'nvme'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('Just now');

  // Desktop Notification Permission & State
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState<boolean>(true);
  const [notificationTestSent, setNotificationTestSent] = useState<boolean>(false);
  const [selectedTrendDrive, setSelectedTrendDrive] = useState<DriveSmartHistoricalTrend | null>(null);

  // Background polling throttle ref for desktop notifications
  const lastNotifiedDevsRef = useRef<Record<string, number>>({});
  const initialMountRef = useRef<boolean>(true);

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Request browser notification permission
  const requestDesktopPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          pushBrowserNotification(
            lang === 'sq'
              ? '✅ ZFS Storage Director: Njoftimet në Desktop u Aktivizuan'
              : '✅ ZFS Storage Director: Desktop Alerts Enabled',
            lang === 'sq'
              ? 'Sistemi do t\'ju njoftojë automatikisht nëse zbulohet përshpejtim i degradimit SMART në ndonjë disk.'
              : 'The background monitor will automatically notify you if SMART degradation velocity accelerates on any drive.'
          );
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    }
  };

  // Helper to push browser desktop notification
  const pushBrowserNotification = (title: string, body: string, tag?: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notif = new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: tag || `zfs-smart-${Date.now()}`,
        requireInteraction: true,
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch (e) {
      console.warn('Browser notification error:', e);
    }
  };

  // Background Polling Function: Checks SMART values against historical trends
  const pollSmartHealthAndTrends = async () => {
    try {
      setIsLoading(true);
      const [healthRes, trendsRes] = await Promise.all([
        zfsApi.getDrivesHealthSummary(),
        zfsApi.getSmartTrends().catch(() => null),
      ]);

      if (healthRes && healthRes.drives) {
        setDrives(healthRes.drives);
      }

      if (trendsRes && trendsRes.drives) {
        let processedDrives = trendsRes.drives;
        if (settings.gpuOffload && settings.workerOffload) {
          const workerResult = await telemetryWorkerService.processSmartTrends(trendsRes.drives);
          if (workerResult && workerResult.drives) {
            processedDrives = workerResult.drives;
          }
        }

        setTrends(processedDrives);

        // Check each drive against historical trends for accelerated degradation
        processedDrives.forEach((trend: any) => {
          if (trend.isAccelerating && desktopAlertsEnabled && settings.desktopAlerts) {
            const now = Date.now();
            const lastNotified = lastNotifiedDevsRef.current[trend.dev] || 0;
            // Throttle notification per drive to once every 5 minutes unless manual test
            const throttleMs = 5 * 60 * 1000;

            if (now - lastNotified > throttleMs || initialMountRef.current) {
              lastNotifiedDevsRef.current[trend.dev] = now;

              const title = lang === 'sq'
                ? `⚠️ ALARM ZFS: Përshpejtim i Degradimit në ${trend.dev} (${trend.accelerationFactor}x)!`
                : `⚠️ ZFS ALERT: Accelerated Degradation on ${trend.dev} (${trend.accelerationFactor}x)!`;

              const body = lang === 'sq'
                ? `Disku ${trend.dev} (${trend.model}) po degradon ${trend.accelerationFactor}x më shpejt se trendi bazë historik! Sektorë të realokuar: ${trend.currentReallocated}, Sektorë në pritje: ${trend.currentPending}. Shëndeti: ${trend.currentHealthScore}%.`
                : `Drive ${trend.dev} (${trend.model}) is degrading ${trend.accelerationFactor}x faster than historical baseline! Reallocated sectors: ${trend.currentReallocated}, Pending: ${trend.currentPending}. Health: ${trend.currentHealthScore}%.`;

              pushBrowserNotification(title, body, `zfs-degrade-${trend.dev}`);
            }
          }
        });
      }

      setLastRefreshed(new Date().toLocaleTimeString());
      initialMountRef.current = false;
    } catch (err) {
      console.error('Error in SMART background polling:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Background polling lifecycle (kept at exactly 30s to satisfy "mos ul refresh rate")
  useEffect(() => {
    pollSmartHealthAndTrends();
    const interval = setInterval(pollSmartHealthAndTrends, 30000);
    return () => clearInterval(interval);
  }, [desktopAlertsEnabled, lang]);

  // Test notification function
  const handleTestDesktopNotification = async () => {
    if (notificationPermission !== 'granted') {
      await requestDesktopPermission();
    }

    const acceleratingDrive = trends.find((t) => t.isAccelerating) || trends[0] || {
      dev: '/dev/sde',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      currentHealthScore: 68,
      currentReallocated: 18,
      currentPending: 4,
      accelerationFactor: 8.5,
    };

    const title = lang === 'sq'
      ? `🚨 TEST ALARM: Përshpejtim i Degradimit SMART në ${acceleratingDrive.dev}`
      : `🚨 TEST ALERT: Accelerated SMART Degradation on ${acceleratingDrive.dev}`;

    const body = lang === 'sq'
      ? `Disku ${acceleratingDrive.dev} (${acceleratingDrive.model}) ka kaluar në përshpejtim kritik ${acceleratingDrive.accelerationFactor}x mbi normalen! Sektorë: ${acceleratingDrive.currentReallocated} të realokuar, ${acceleratingDrive.currentPending} pending.`
      : `Drive ${acceleratingDrive.dev} (${acceleratingDrive.model}) triggered critical acceleration (${acceleratingDrive.accelerationFactor}x above baseline)! Reallocated: ${acceleratingDrive.currentReallocated}, Pending: ${acceleratingDrive.currentPending}.`;

    pushBrowserNotification(title, body, `test-alert-${Date.now()}`);
    setNotificationTestSent(true);
    setTimeout(() => setNotificationTestSent(false), 4000);
  };

  // Toggle simulation
  const handleToggleSimulation = async (accelerate: boolean) => {
    try {
      await zfsApi.simulateDegradationAcceleration('/dev/sde', accelerate);
      await pollSmartHealthAndTrends();
    } catch (e) {
      console.error('Error toggling simulation:', e);
    }
  };

  const totalDrives = drives.length;
  const nearingThresholdDrives = drives.filter(
    (d) => d.nearFailureThreshold || d.status === 'WARNING' || d.status === 'CRITICAL'
  );
  const optimalDrives = drives.filter((d) => d.status === 'OPTIMAL' && !d.nearFailureThreshold);
  const avgHealthScore =
    totalDrives > 0
      ? Math.round(drives.reduce((acc, d) => acc + d.healthScorePct, 0) / totalDrives)
      : null;

  const acceleratingTrend = totalDrives > 0 ? trends.find((t) => t.isAccelerating) : undefined;

  const filteredDrives = drives.filter((d) => {
    if (filter === 'warning') return d.nearFailureThreshold || d.status === 'WARNING';
    if (filter === 'hdd') return d.type === 'HDD';
    if (filter === 'nvme') return d.type === 'NVMe';
    return true;
  });

  return (
    <div className="p-4 sm:p-5 rounded-xl bg-[#0b1224] border border-slate-800 space-y-4">
      {/* ======================================================== */}
      {/* HEADER: Title, Live Status, GPU Mode & Polling Indicator */}
      {/* ======================================================== */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">
                {lang === 'sq'
                  ? 'Monitorimi i Shëndetit SMART & Trendeve Historike'
                  : 'Real-Time Drive Health & SMART Trend Monitor'}
              </h2>
              {/* Live Status Indicator - Lightweight static glowing ring (0% GPU thrash) */}
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40" />
                Live SMART
              </span>

              {/* GPU Light Mode Badge */}
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/60"
                title={t('smartTrends.gpuLightTooltip')}
              >
                <Zap className="w-3 h-3 text-sky-400" />
                <span>{t('smartTrends.gpuLightBadge')}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('smartTrends.subtitle')}
            </p>
          </div>
        </div>

        {/* Right Controls: Desktop Notification Controls, Refresh, Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Desktop Notification Status & Permission Button */}
          {notificationPermission === 'granted' ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-xs font-mono text-emerald-300">
              <BellRing className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] hidden sm:inline">
                {lang === 'sq' ? 'Njoftimet në Desktop:' : 'Desktop Alerts:'}
              </span>
              <span className="font-bold text-[10px] uppercase">
                {t('smartTrends.notificationsEnabled')}
              </span>
            </div>
          ) : notificationPermission === 'denied' ? (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-800/50 text-xs font-mono text-rose-300">
              <BellOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[11px]">{t('smartTrends.notificationsBlocked')}</span>
            </div>
          ) : (
            <button
              onClick={requestDesktopPermission}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-xs font-mono text-amber-200 transition cursor-pointer"
              title={lang === 'sq' ? 'Kërko leje në shfletues për njoftime në desktop kur zbulohet përshpejtim i degradimit' : 'Ask the browser for desktop notification permission for degradation alerts'}
            >
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('smartTrends.notificationsPrompt')}</span>
            </button>
          )}

          {/* Test Desktop Notification Button */}
          <button
            onClick={handleTestDesktopNotification}
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition cursor-pointer flex items-center gap-1.5 ${
              notificationTestSent
                ? 'bg-emerald-900 text-emerald-200 border-emerald-700'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title={lang === 'sq' ? 'Dërgo një njoftim provë në desktop për të verifikuar sistemin e alarmit SMART' : 'Send a test desktop notification to verify SMART alerts'}
          >
            {notificationTestSent ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span>{lang === 'sq' ? 'U Dërgua në Desktop!' : 'Alert Pushed!'}</span>
              </>
            ) : (
              <>
                <BellRing className="w-3 h-3 text-sky-400" />
                <span>{t('smartTrends.testNotification')}</span>
              </>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={pollSmartHealthAndTrends}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 text-xs transition cursor-pointer flex items-center gap-1"
            title={lang === 'sq' ? 'Rifresko menjëherë vlerat SMART dhe trendet historike' : 'Refresh SMART values and historical trends now'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="text-[10px] font-mono hidden md:inline">{lastRefreshed}</span>
          </button>

          {/* Filter Buttons */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                filter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {lang === 'sq' ? 'Të Gjitha' : 'All'} ({totalDrives})
            </button>
            <button
              onClick={() => setFilter('warning')}
              className={`px-2 py-0.5 rounded transition cursor-pointer flex items-center gap-1 ${
                filter === 'warning'
                  ? 'bg-rose-600 text-white'
                  : nearingThresholdDrives.length > 0
                  ? 'text-rose-400 hover:text-rose-300 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>{lang === 'sq' ? 'Afër Pragut' : 'Warnings'}</span>
              {nearingThresholdDrives.length > 0 && (
                <span className="px-1 py-0.2 rounded bg-rose-950 text-rose-300 text-[9px] font-mono border border-rose-800">
                  {nearingThresholdDrives.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter('hdd')}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                filter === 'hdd' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              HDD
            </button>
            <button
              onClick={() => setFilter('nvme')}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                filter === 'nvme' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              NVMe
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* CRITICAL ALERT BANNER: ACCELERATED DEGRADATION DETECTED   */}
      {/* ======================================================== */}
      {acceleratingTrend && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-700/80 text-rose-200 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg bg-rose-900/60 border border-rose-600 text-rose-300 shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-xs sm:text-sm">
                    {t('smartTrends.accelerationAlertTitle')}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-900 text-rose-200 border border-rose-600">
                    {acceleratingTrend.accelerationFactor}{lang === 'sq' ? 'x PËRSHPEJTIM' : 'x ACCELERATION'}
                  </span>
                </div>
                <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                  {acceleratingTrend.accelerationReason ||
                    (lang === 'sq' ? `Përshpejtim i lartë i sektorëve të realokuar (${acceleratingTrend.currentReallocated}) dhe ${acceleratingTrend.currentPending} sektorë në pritje në ${acceleratingTrend.dev}.` : `High growth of reallocated sectors (${acceleratingTrend.currentReallocated}) and ${acceleratingTrend.currentPending} pending sectors on ${acceleratingTrend.dev}.`)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <button
                onClick={() => setSelectedTrendDrive(acceleratingTrend)}
                className="px-3 py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-xs font-mono font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <History className="w-3.5 h-3.5" />
                <span>{lang === 'sq' ? 'Shiko Trendin Historik' : 'Inspect Trend'}</span>
              </button>

              {onInspectDevice && (
                <button
                  onClick={() => onInspectDevice(acceleratingTrend.dev)}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{lang === 'sq' ? 'SMART Info' : 'SMART Info'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-rose-900/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              {lang === 'sq'
                ? 'Testoni reagimin e njoftimeve në desktop duke alternuar gjendjen e përshpejtuar:'
                : 'Test desktop push alerts by toggling accelerated degradation state:'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggleSimulation(false)}
                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-emerald-300 border border-slate-700 hover:border-emerald-700 transition cursor-pointer"
              >
                {t('smartTrends.normalizeTrend')}
              </button>
              <button
                onClick={() => handleToggleSimulation(true)}
                className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700 transition cursor-pointer"
              >
                {t('smartTrends.simAcceleration')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4-METRIC SUMMARY STRIP                                    */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">{lang === 'sq' ? 'Total Disqe të Monitoruar' : 'Drives monitored'}</span>
          <div className="text-lg font-bold text-white mt-0.5">{totalDrives}</div>
          <span className="text-[10px] text-slate-500 font-sans">
            {totalDrives === 0
              ? (lang === 'sq' ? 'Asnjë disk i raportuar' : 'No drives reported')
              : `${drives.filter((d) => d.type === 'HDD').length} HDD · ${drives.filter((d) => d.type === 'NVMe').length} NVMe`}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">{lang === 'sq' ? 'Shëndeti Mesatar Fleet' : 'Average fleet health'}</span>
          <div className={`text-lg font-bold mt-0.5 ${avgHealthScore == null ? 'text-slate-400' : 'text-emerald-400'}`}>{avgHealthScore == null ? '—' : `${avgHealthScore}%`}</div>
          <span className="text-[10px] text-slate-500 font-sans">
            {avgHealthScore == null ? (lang === 'sq' ? 'Pa matje SMART' : 'No SMART sample') : 'Endurance & SMART nominal'}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">{lang === 'sq' ? 'Disqe me Përshpejtim' : 'Accelerating drives'}</span>
          <div className={`text-lg font-bold mt-0.5 ${acceleratingTrend ? 'text-rose-400' : 'text-slate-300'}`}>
            {acceleratingTrend ? '1 (/dev/sde)' : '0 (None)'}
          </div>
          <span className="text-[10px] text-rose-400 font-sans">
            {acceleratingTrend ? (lang === 'sq' ? 'Përshpejtim 8.5x i zbuluar' : '8.5x acceleration detected') : (lang === 'sq' ? 'Normale sipas trendit bazë' : 'Normal against baseline')}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
          <span className="text-slate-400 block text-[10px] uppercase">{lang === 'sq' ? 'Disqe Afër Pragut Kritik' : 'Drives near critical threshold'}</span>
          <div className={`text-lg font-bold mt-0.5 ${nearingThresholdDrives.length > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {nearingThresholdDrives.length}
          </div>
          <span className="text-[10px] text-slate-400 font-sans">
            {nearingThresholdDrives.length > 0 ? (lang === 'sq' ? 'Zëvendësim i rekomanduar' : 'Replacement recommended') : (lang === 'sq' ? 'Gjendje e shëndetshme' : 'Healthy')}
          </span>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DRIVES GRID                                              */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredDrives.map((d) => {
          const isWarning = d.nearFailureThreshold || d.status === 'WARNING';
          const isCritical = d.status === 'CRITICAL';
          const driveTrend = trends.find((t) => t.dev === d.dev);
          const isAccelerating = driveTrend?.isAccelerating;

          let cardBorder = 'border-slate-800 hover:border-slate-700';
          let cardBg = 'bg-[#070d1c]';
          let indicatorPill = 'bg-emerald-950 text-emerald-400 border-emerald-800/50';

          if (isAccelerating || isWarning) {
            cardBorder = 'border-rose-600 ring-1 ring-rose-500/50';
            cardBg = 'bg-rose-950/20';
            indicatorPill = 'bg-rose-950 text-rose-300 border-rose-700 font-bold';
          } else if (isCritical) {
            cardBorder = 'border-red-600 ring-1 ring-red-500';
            cardBg = 'bg-red-950/30';
            indicatorPill = 'bg-red-950 text-red-300 border-red-700 font-bold';
          }

          return (
            <div
              key={d.dev}
              className={`p-3.5 rounded-xl border transition-colors cursor-pointer relative overflow-hidden group ${cardBg} ${cardBorder}`}
            >
              {/* Top Row: Device Name, Type Badge, Status */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <HardDrive
                    className={`w-4 h-4 shrink-0 ${
                      isAccelerating || isWarning ? 'text-rose-400' : d.type === 'NVMe' ? 'text-sky-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="font-mono font-bold text-white text-xs truncate group-hover:text-sky-300 transition-colors">
                    {d.dev}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 uppercase">
                    {d.type}
                  </span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border uppercase ${indicatorPill}`}>
                    {isAccelerating ? 'ACCEL' : isWarning ? 'WARN' : 'PASSED'}
                  </span>
                </div>
              </div>

              {/* Pool & VDEV Assignment */}
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate">{d.pool}</span>
                <span className="font-mono text-slate-500 text-[10px]">{d.vdev}</span>
              </div>

              {/* Health Score Bar */}
              <div className="mt-2.5 space-y-1">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-slate-400">
                    {lang === 'sq' ? 'Shëndeti SMART:' : 'SMART Health:'}
                  </span>
                  <span
                    className={`font-bold ${
                      isWarning || isAccelerating ? 'text-rose-400' : d.healthScorePct >= 95 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {d.healthScorePct}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full transition-all ${
                      isWarning || isAccelerating ? 'bg-rose-500' : d.healthScorePct >= 95 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${d.healthScorePct}%` }}
                  />
                </div>
              </div>

              {/* Detailed Metrics Row */}
              <div className="mt-3 pt-2 border-t border-slate-800 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                {/* Temperature */}
                <div className="flex items-center gap-1 text-slate-300">
                  <Thermometer
                    className={`w-3 h-3 shrink-0 ${
                      d.temperatureC > 42 ? 'text-amber-400' : 'text-sky-400'
                    }`}
                  />
                  <span>{d.temperatureC}°C</span>
                  {d.temperatureC > 42 && (
                    <span className="text-[9px] text-amber-400">(Warm)</span>
                  )}
                </div>

                {/* Reallocated Sectors */}
                <div className="text-right">
                  <span className="text-slate-500 block text-[9px]">Realloc:</span>
                  <span
                    className={`font-bold ${
                      d.reallocatedSectors > 0 ? 'text-rose-400' : 'text-slate-300'
                    }`}
                  >
                    {d.reallocatedSectors} sec
                  </span>
                </div>

                {/* Wear / Endurance */}
                <div className="text-slate-400">
                  <span className="text-slate-500 block text-[9px]">Endurance:</span>
                  <span className="text-slate-200">{d.wearLevelPct}% Left</span>
                </div>

                {/* TBW Written */}
                <div className="text-right text-slate-400">
                  <span className="text-slate-500 block text-[9px]">TBW:</span>
                  <span className="text-slate-300">{d.tbwWritten}</span>
                </div>
              </div>

              {/* Special Warning Footnote for nearing-threshold drive */}
              {isWarning && d.failureRiskReason && (
                <div className="mt-2.5 p-1.5 rounded bg-rose-950/60 border border-rose-800/60 text-[10px] text-rose-300 leading-tight">
                  <AlertTriangle className="w-3 h-3 inline mr-1 text-rose-400" />
                  <span>{d.failureRiskReason}</span>
                </div>
              )}

              {/* Actions Footer */}
              <div className="mt-2.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (driveTrend) setSelectedTrendDrive(driveTrend);
                  }}
                  className="text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  <History className="w-3 h-3" />
                  <span>{lang === 'sq' ? 'Trendi' : 'Trend'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onInspectDevice) onInspectDevice(d.dev);
                  }}
                  className="text-slate-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                >
                  <span>SMART Info</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* HISTORICAL TREND MODAL / INSPECTOR (Acc. Degradation)    */}
      {/* ======================================================== */}
      {selectedTrendDrive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#0b1224] border border-slate-700 rounded-xl shadow-lg p-5 space-y-4 text-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{lang === 'sq' ? 'Trendi Historik SMART i Pajisjes:' : 'SMART Historical Trend for:'}</span>
                    <span className="font-mono text-sky-400">{selectedTrendDrive.dev}</span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    {selectedTrendDrive.model} · Pool: {selectedTrendDrive.pool}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedTrendDrive(null)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Acceleration Summary Banner */}
            <div
              className={`p-3 rounded-lg border text-xs font-mono ${
                selectedTrendDrive.isAccelerating
                  ? 'bg-rose-950/40 border-rose-700 text-rose-200'
                  : 'bg-emerald-950/40 border-emerald-700 text-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5">
                  {selectedTrendDrive.isAccelerating ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>
                    {selectedTrendDrive.isAccelerating
                      ? `${lang === 'sq' ? 'Përshpejtim i Degradimit:' : 'Degradation Velocity:'} ${selectedTrendDrive.accelerationFactor}x mbi normalen!`
                      : lang === 'sq'
                      ? 'Degradim Normal brenda tolerancës së pritur'
                      : 'Nominal linear baseline degradation'}
                  </span>
                </span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/40 border border-current">
                  {selectedTrendDrive.accelerationSeverity}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1 font-sans">
                {selectedTrendDrive.accelerationReason}
              </p>
            </div>

            {/* Comparison Metrics */}
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">{lang === 'sq' ? 'TRENDI BAZË (BASELINE)' : 'BASELINE TREND'}</span>
                <span className="text-white font-bold">{selectedTrendDrive.historicalBaselineRate}{lang === 'sq' ? ' sec/ditë' : ' sect/day'}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{lang === 'sq' ? 'Norma historike 30d' : '30-day historical rate'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">{lang === 'sq' ? 'SHPEJTËSIA AKTUALE' : 'CURRENT RATE'}</span>
                <span className="text-rose-400 font-bold">{selectedTrendDrive.recentDegradationRate}{lang === 'sq' ? ' sec/ditë' : ' sect/day'}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{lang === 'sq' ? 'Norma 48h të fundit' : 'Last 48h rate'}</span>
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-500 block">{lang === 'sq' ? 'FAKTORI I RREZIKUT' : 'RISK FACTOR'}</span>
                <span className="text-amber-300 font-bold">{selectedTrendDrive.accelerationFactor}{lang === 'sq' ? 'x Shpejtësi' : 'x rate'}</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{lang === 'sq' ? 'Përshpejtimi i llogaritur' : 'Calculated acceleration'}</span>
              </div>
            </div>

            {/* 7-Day Degradation Trend Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono mb-2">
                {t('smartTrends.historyDays')}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                      <th className="pb-1.5">{lang === 'sq' ? 'Koha' : 'Time'}</th>
                      <th className="pb-1.5">{lang === 'sq' ? 'Sektorë të Realokuar' : 'Reallocated sectors'}</th>
                      <th className="pb-1.5">Pending</th>
                      <th className="pb-1.5">{lang === 'sq' ? 'Shëndeti %' : 'Health %'}</th>
                      <th className="pb-1.5">{lang === 'sq' ? 'Temperatura' : 'Temperature'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {selectedTrendDrive.history.map((pt, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="py-1.5 text-white">{pt.timeLabel}</td>
                        <td className="py-1.5 text-rose-300 font-bold">
                          {pt.reallocatedSectors}
                          {idx > 0 && pt.reallocatedSectors > selectedTrendDrive.history[idx - 1].reallocatedSectors && (
                            <span className="text-rose-400 text-[10px] ml-1">
                              (+{pt.reallocatedSectors - selectedTrendDrive.history[idx - 1].reallocatedSectors})
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-amber-300">{pt.pendingSectors}</td>
                        <td className="py-1.5 text-slate-200">{pt.healthScorePct}%</td>
                        <td className="py-1.5 text-slate-400">{pt.temperatureC}°C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <button
                onClick={handleTestDesktopNotification}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono transition cursor-pointer flex items-center gap-1.5"
              >
                <BellRing className="w-3.5 h-3.5 text-sky-400" />
                <span>{t('smartTrends.testNotification')}</span>
              </button>

              <button
                onClick={() => setSelectedTrendDrive(null)}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition cursor-pointer font-sans"
              >
                {lang === 'sq' ? 'Mbyll' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

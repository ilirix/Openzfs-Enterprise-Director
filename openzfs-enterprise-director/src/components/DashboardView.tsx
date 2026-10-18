import React from 'react';
import {
  HardDrive,
  Cpu,
  ShieldCheck,
  Zap,
  Activity,
  FolderTree,
  Camera,
  Play,
  RotateCw,
  Clock,
  ArrowUpRight,
  Database,
  BarChart3,
  Layers,
  Info,
  Server,
} from 'lucide-react';
import { ZfsState, Pool, Language, DriveHealthSummary } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { ZfsHealthScoreCard } from './ZfsHealthScoreCard';
import { RealtimeHealthSparklines } from './RealtimeHealthSparklines';
import { DriveHealthSummaryWidget } from './DriveHealthSummaryWidget';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ZfsResourceUtilizationWidget } from './ZfsResourceUtilizationWidget';
import { AggregateIoChartWidget } from './AggregateIoChartWidget';
import { ResourceUsageChart } from './ResourceUsageChart';
import { DashboardGrid } from './DashboardGrid';
import { AlertThresholdCard } from './AlertThresholdCard';

interface Props {
  state: ZfsState;
  onNavigate: (tabId: string) => void;
  onScrub: (poolName: string) => void;
  onInspectDevice?: (dev: string) => void;
  onOpenHardwareInfo?: () => void;
  lang?: Language;
}

export const DashboardView: React.FC<Props> = ({
  state,
  onNavigate,
  onScrub,
  onInspectDevice,
  onOpenHardwareInfo,
  lang = 'sq',
}) => {
  const { pools, datasets, snapshots, arc, availableDisks = [] } = state;
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  // Aggregate storage numbers
  const totalDatasets = datasets.length;
  const totalSnapshots = snapshots.length;

  const arcSizeGb = (arc.size / 1024 / 1024 / 1024).toFixed(1);
  const arcMaxGb = (arc.c_max / 1024 / 1024 / 1024).toFixed(1);
  const mruGb = (arc.mru_size / 1024 / 1024 / 1024).toFixed(1);
  const mfuGb = (arc.mfu_size / 1024 / 1024 / 1024).toFixed(1);
  const l2SizeGb = (arc.l2_size / 1024 / 1024 / 1024).toFixed(1);

  // MFU / MRU percentage
  const totalMruMfu = arc.mru_size + arc.mfu_size || 1;
  const mruPct = Math.round((arc.mru_size / totalMruMfu) * 100);
  const mfuPct = 100 - mruPct;

  const drives: DriveHealthSummary[] = state.demoMode === false ? [] : [
    {
      dev: '/dev/sdb',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491021',
      type: 'HDD',
      healthScorePct: 100,
      status: 'OPTIMAL',
      temperatureC: 31,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: false,
      tbwWritten: '184.2 TBW',
      plpSupported: false,
    },
    {
      dev: '/dev/sde',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491027',
      type: 'HDD',
      healthScorePct: 68,
      status: 'WARNING',
      temperatureC: 44,
      tempStatus: 'nominal',
      reallocatedSectors: 18,
      pendingSectors: 4,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: true,
      tbwWritten: '184.2 TBW',
      plpSupported: false,
      isAccelerating: true,
      accelerationFactor: 8.5,
    },
  ];

  return (
    <DashboardGrid>
      <AlertThresholdCard key="alerts" arc={arc} lang={lang} />
      {/* 1. NEW ZFS HEALTH SCORE SUMMARY CARD (Requirement 1) */}
      <ZfsHealthScoreCard
        key="health"
        pools={pools}
        drives={drives}
        onScrub={onScrub}
        onInspectDevice={onInspectDevice}
        lang={lang}
      />

      {/* 2. System Hardware & Peripherals Quick Action Banner (Requirement 3) */}
      {onOpenHardwareInfo && (
        <div key="hardware" className="p-4 rounded-xl bg-[#0a1124] border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-950/80 border border-sky-800/60 text-sky-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white block">
                {t('systemHardware.title')}
              </span>
              <span className="text-[11px] text-slate-400">
                {t('systemHardware.subtitle')}
              </span>
            </div>
          </div>

          <button
            onClick={onOpenHardwareInfo}
            className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-auto shadow-md shadow-sky-950"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{t('systemHardware.btnInspect')}</span>
          </button>
        </div>
      )}

      {/* 4-Stat Primary Strip */}
      <div key="stats" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Storage Pools */}
        <div className="p-4 rounded-xl bg-[#0c1326] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('dashboard.storagePools')}</span>
            <HardDrive className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              {pools.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
              <span className={`w-1.5 h-1.5 rounded-full ${pools.length ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span>
                {pools.length === 0
                  ? (lang === 'sq' ? 'Asnjë pool i importuar' : 'No pools imported')
                  : t('dashboard.poolsStatusOnline')}
              </span>
            </div>
          </div>
        </div>

        {/* Stat 2: ARC Hit Ratio */}
        <div className="p-4 rounded-xl bg-[#0c1326] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('dashboard.arcHitRatio')}</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-400">
              {arc.hit_ratio}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
              <span>{arcSizeGb} GB / {arcMaxGb} GB</span>
              <span className="text-slate-500">RAM</span>
            </div>
          </div>
        </div>

        {/* Stat 3: Filesystems & Volumes */}
        <div className="p-4 rounded-xl bg-[#0c1326] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('dashboard.datasetsZvols')}</span>
            <FolderTree className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              {totalDatasets}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              <span>{t('dashboard.activeCompression')}</span>
            </div>
          </div>
        </div>

        {/* Stat 4: Snapshots */}
        <div className="p-4 rounded-xl bg-[#0c1326] border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>{t('dashboard.cowSnapshots')}</span>
            <Camera className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-300">
              {totalSnapshots}
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              <span>{t('dashboard.cowProtection')}</span>
            </div>
          </div>
        </div>
      </div>

      <ResourceUsageChart key="resources" lang={lang} onNavigateToArc={() => onNavigate('arc')} />

      {/* Real-time CPU & RAM Utilization: ZFS Metadata vs Data Operations */}
      <ZfsResourceUtilizationWidget key="utilization" lang={lang} onNavigateToArc={() => onNavigate('arc')} />

      {/* Aggregate Real-Time IOPS & Throughput Line Chart across all ZFS Pools (Recharts) */}
      <AggregateIoChartWidget
        key="io"
        lang={lang}
        pools={pools}
        onNavigateToPools={() => onNavigate('pools')}
      />

      {/* Real-time Health Telemetry & Polling Sparklines Chart */}
      <RealtimeHealthSparklines key="sparklines" lang={lang} />

      {/* Main Grid: ARC Breakdown & Storage Pools Health */}
      <div key="topology" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: ARC Deep Inspector Widget */}
        <div className="lg:col-span-1 p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold text-white">
                {t('dashboard.arcMemoryBalance')}
              </h2>
            </div>
            <button
              onClick={() => onNavigate('arc')}
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5 cursor-pointer font-mono"
            >
              <span>{t('common.details')}</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {/* ARC RAM Utilization Gauge */}
          <div className="space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{t('dashboard.arcSizeMax')}</span>
              <span className="text-slate-200">
                {arcSizeGb} GB / {arcMaxGb} GB
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full"
                style={{ width: `${arc.c_max > 0 ? Math.min(100, Math.round((arc.size / arc.c_max) * 100)) : 0}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg bg-[#070c18] border border-slate-800/80 p-3">
            <div className="text-xs font-medium text-slate-300 font-mono">{t('dashboard.arcPieTitle')}</div>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">{t('dashboard.arcPieHint')}</p>
            {arc.mru_size + arc.mfu_size > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'MFU', value: arc.mfu_size, gb: mfuGb, pct: mfuPct },
                        { name: 'MRU', value: arc.mru_size, gb: mruGb, pct: mruPct },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={46}
                      outerRadius={68}
                      paddingAngle={2}
                      stroke="#070c18"
                    >
                      <Cell fill="#34d399" />
                      <Cell fill="#38bdf8" />
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as { name: string; gb: string; pct: number };
                        return (
                          <div className="rounded-lg border border-slate-700 bg-[#070d1e] px-3 py-2 text-[11px] font-mono text-slate-200">
                            <div className="font-semibold">{point.name}</div>
                            <div>{point.pct}% · {point.gb} GB</div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 font-mono py-6 text-center">{t('dashboard.arcPieEmpty')}</p>
            )}
          </div>

          {/* MFU vs MRU Division */}
          <div className="p-3 rounded-lg bg-[#070c18] border border-slate-800/80 space-y-2 font-mono">
            <div className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>{t('dashboard.mfuMruSplit')}</span>
              <span className="text-[10px] text-slate-500">{t('dashboard.dualListCache')}</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full flex overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${mfuPct}%` }}
                title={`MFU: ${mfuPct}% (${mfuGb} GB)`}
              />
              <div
                className="bg-sky-500 h-full transition-all"
                style={{ width: `${mruPct}%` }}
                title={`MRU: ${mruPct}% (${mruGb} GB)`}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>MFU: {mfuPct}% ({mfuGb} GB)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span>MRU: {mruPct}% ({mruGb} GB)</span>
              </div>
            </div>
          </div>

          {/* L2ARC Status */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">L2ARC Flash Cache:</span>
            <span className="text-white font-semibold">{l2SizeGb} GB ({arc.l2_hit_ratio}% hit)</span>
          </div>
        </div>

        {/* Right: Storage Pools Status Table */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold text-white">
                {t('dashboard.recentPools')}
              </h2>
            </div>
            <button
              onClick={() => onNavigate('pools')}
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5 cursor-pointer font-mono"
            >
              <span>{t('dashboard.viewAll')}</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="pb-2.5">{t('dashboard.poolName')}</th>
                  <th className="pb-2.5">{t('dashboard.capacity')}</th>
                  <th className="pb-2.5">{t('dashboard.allocation')}</th>
                  <th className="pb-2.5">{t('dashboard.frag')}</th>
                  <th className="pb-2.5">{t('dashboard.health')}</th>
                  <th className="pb-2.5">{t('dashboard.scrubStatus')}</th>
                  <th className="pb-2.5 text-right">{t('dashboard.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {pools.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      {t('dashboard.noPoolsLive')}
                    </td>
                  </tr>
                )}
                {pools.map((p) => (
                  <tr key={p.name} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 font-semibold text-white flex items-center gap-2">
                      <Database className="w-3.5 h-3.5 text-sky-400" />
                      <span>{p.name}</span>
                    </td>
                    <td className="py-3 text-slate-300">{p.size}</td>
                    <td className="py-3 text-slate-300">
                      <span>{p.allocated}</span>
                      <span className="text-slate-500 text-[10px]"> / {p.free}</span>
                    </td>
                    <td className="py-3 text-slate-400">{p.frag}</td>
                    <td className="py-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                        {p.health}
                      </span>
                    </td>
                    <td className="py-3 text-slate-400 text-[11px] max-w-[200px] truncate">
                      {p.scrub_status}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onScrub(p.name)}
                        className="px-2 py-1 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1 font-mono"
                        title="Scrub"
                      >
                        <Play className="w-2.5 h-2.5 text-emerald-400" />
                        {t('dashboard.scrubAction')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Alert / Info banner */}
          <div className="p-3 rounded-lg bg-[#070d1a] border border-slate-800/80 flex items-center justify-between text-xs text-slate-300 font-mono">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {t('dashboard.poolProtectionNote')}
              </span>
            </div>
            <button
              onClick={() => onNavigate('wizard')}
              className="px-2.5 py-1 text-[11px] font-medium text-amber-300 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/40 rounded transition-colors cursor-pointer shrink-0"
            >
              {t('dashboard.createPoolWizard')}
            </button>
          </div>
        </div>
      </div>

      {/* Fleet-Wide Real-Time Drive Health & SMART Thresholds Widget */}
      <DriveHealthSummaryWidget key="drives" onInspectDevice={onInspectDevice} lang={lang} />

      {/* Datasets & Snapshots Quick Highlights */}
      <div key="inventory" className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Datasets List */}
        <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
              {t('dashboard.keyDatasets')}
            </h3>
            <button
              onClick={() => onNavigate('datasets')}
              className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              {t('dashboard.viewAll')} ({datasets.length})
            </button>
          </div>
          <div className="space-y-2">
            {datasets.slice(0, 4).map((d) => (
              <div
                key={d.name}
                className="p-2.5 rounded-lg bg-[#070d1c] border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-white block">{d.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {t('dashboard.mount')}: {d.mountpoint} · {d.compression} ({d.compressratio})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-200 block">{d.used}</span>
                  <span className="text-[10px] text-slate-500">{t('dashboard.record')}: {d.recordsize}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Snapshots List */}
        <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              {t('dashboard.recentSnapshots')}
            </h3>
            <button
              onClick={() => onNavigate('snapshots')}
              className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
            >
              {t('dashboard.manageSnapshots')} ({snapshots.length})
            </button>
          </div>
          <div className="space-y-2">
            {snapshots.slice(0, 4).map((s) => (
              <div
                key={s.name}
                className="p-2.5 rounded-lg bg-[#070d1c] border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-white block">{s.name}</span>
                  <span className="text-[10px] text-slate-500">{t('dashboard.created')}: {s.creation}</span>
                </div>
                <div className="text-right">
                  <span className="text-amber-300 block">{s.used}</span>
                  <span className="text-[10px] text-slate-500">{t('dashboard.refer')}: {s.refer}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardGrid>
  );
};

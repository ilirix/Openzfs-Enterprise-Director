import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Database,
  ArrowRight,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  StopCircle,
  FileCode,
  History,
  Activity,
  Check,
  AlertOctagon,
} from 'lucide-react';
import {
  Pool,
  Dataset,
  Snapshot,
  Language,
  ZSendMigrationRequest,
  ZSendStreamProgress,
  ZSendPhase,
} from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';
import { telemetryWorkerService } from '../services/telemetryWorkerService';
import { useAppSettings } from '../context/AppSettingsContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pools: Pool[];
  datasets?: Dataset[];
  snapshots?: Snapshot[];
  defaultSourcePool?: string;
  defaultSourceDataset?: string;
  lang: Language;
  onMigrationComplete?: () => void;
}

export const ZfsSendMigrationModal: React.FC<Props> = ({
  isOpen,
  onClose,
  pools,
  datasets = [],
  snapshots = [],
  defaultSourcePool,
  defaultSourceDataset,
  lang,
  onMigrationComplete,
}) => {
  const t = (k: string) => TRANSLATIONS[lang]?.[k] || k;
  const { settings } = useAppSettings();

  // Active / Form state
  const [sourcePool, setSourcePool] = useState<string>(defaultSourcePool || pools[0]?.name || '');
  const [sourceDataset, setSourceDataset] = useState<string>(defaultSourceDataset || '');
  const [snapshotName, setSnapshotName] = useState<string>('');
  const [targetPool, setTargetPool] = useState<string>(
    pools.length > 1 ? pools[1].name : pools[0]?.name || ''
  );
  const [targetDatasetName, setTargetDatasetName] = useState<string>('');

  // Flags
  const [rawCompressed, setRawCompressed] = useState(true);
  const [preserveProperties, setPreserveProperties] = useState(true);
  const [forceOverwrite, setForceOverwrite] = useState(true);
  const [isIncremental, setIsIncremental] = useState(false);
  const [baseSnapshot, setBaseSnapshot] = useState('');

  // Active Migration Tracker State
  const [activeMigration, setActiveMigration] = useState<ZSendStreamProgress | null>(null);
  const [migrationHistory, setMigrationHistory] = useState<ZSendStreamProgress[]>([]);
  const [isStarting, setIsStarting] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [workerTelemetryActive, setWorkerTelemetryActive] = useState<boolean>(true);

  // History & active rate smoothing
  const previousRatesRef = useRef<number[]>([]);
  const pollIntervalRef = useRef<any>(null);

  // Available source datasets filtered by sourcePool
  const availableDatasets = datasets.filter(
    (d) => d.name === sourcePool || d.name.startsWith(`${sourcePool}/`)
  );

  // Available snapshots for selected sourceDataset
  const availableSnapshots = snapshots.filter((s) => s.name.startsWith(`${sourceDataset}@`));

  // Initialize defaults on open or change
  useEffect(() => {
    if (defaultSourcePool && pools.some((p) => p.name === defaultSourcePool)) {
      setSourcePool(defaultSourcePool);
    }
    if (defaultSourceDataset) {
      setSourceDataset(defaultSourceDataset);
      const parts = defaultSourceDataset.split('/');
      const leaf = parts.slice(1).join('/');
      setTargetDatasetName(leaf || 'migrated-dataset');
    } else if (availableDatasets[0]) {
      setSourceDataset(availableDatasets[0].name);
      const leaf = availableDatasets[0].name.split('/').slice(1).join('/');
      setTargetDatasetName(leaf || 'migrated-dataset');
    }
  }, [isOpen, defaultSourcePool, defaultSourceDataset]);

  // Keep targetPool different if multiple pools exist
  useEffect(() => {
    const alternativePool = pools.find((p) => p.name !== sourcePool);
    if (alternativePool) {
      setTargetPool(alternativePool.name);
    }
  }, [sourcePool, pools]);

  // Target dataset full path preview
  const fullTargetDataset = targetDatasetName
    ? `${targetPool}/${targetDatasetName.replace(/^\/+/, '')}`
    : `${targetPool}/migrated-data`;

  // Live command preview
  const commandPreview = `zfs send ${rawCompressed ? '-c ' : ''}${preserveProperties ? '-p ' : ''}${
    isIncremental && baseSnapshot ? `-i ${baseSnapshot} ` : ''
  }${snapshotName || `${sourceDataset || 'tank/ds'}@migration-stream`} | zfs receive ${
    forceOverwrite ? '-F ' : ''
  }${fullTargetDataset}`;

  // Poll active migration from server & process stream telemetry with Web Worker
  const pollMigration = async () => {
    try {
      const res = await zfsApi.getActiveZSendMigration();
      setMigrationHistory(res.history || []);

      if (res.activeMigration) {
        let streamData = res.activeMigration;

        // Offload telemetry mathematics, speed averaging and ETA to Web Worker
        if (settings.gpuOffload && settings.workerOffload && telemetryWorkerService.isOffloadEnabled()) {
          try {
            const workerComputed = await telemetryWorkerService.calculateZSendProgress({
              migrationId: streamData.migrationId,
              bytesSent: streamData.bytesSent,
              totalBytes: streamData.totalBytes,
              startedAt: streamData.startedAt,
              lastRateMbS: streamData.currentRateMbS,
              previousRates: previousRatesRef.current,
              status: streamData.status,
            });

            if (workerComputed) {
              streamData = {
                ...streamData,
                progressPct: workerComputed.progressPct,
                averageRateMbS: workerComputed.averageRateMbS,
                estimatedRemainingSeconds: workerComputed.estimatedRemainingSeconds,
                bytesSentFormatted: workerComputed.bytesSentFormatted,
                totalFormatted: workerComputed.totalFormatted,
              };
              if (workerComputed.rateHistory) {
                previousRatesRef.current = workerComputed.rateHistory;
              }
              setWorkerTelemetryActive(true);
            }
          } catch (err) {
            setWorkerTelemetryActive(false);
          }
        }

        setActiveMigration(streamData);

        if (streamData.status === 'COMPLETED') {
          if (onMigrationComplete) onMigrationComplete();
        }
      } else {
        setActiveMigration(null);
      }
    } catch (err) {
      // Keep going
    }
  };

  // Start polling while open
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    pollMigration();
    pollIntervalRef.current = setInterval(pollMigration, 800);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isOpen, settings.gpuOffload, settings.workerOffload]);

  if (!isOpen) return null;

  // Trigger migration
  const handleStartMigration = async () => {
    if (!sourcePool || !sourceDataset || !targetPool || !targetDatasetName) {
      setErrorMsg(
        lang === 'sq'
          ? 'Ju lutem zgjidhni burimin dhe destinacionin përpara migrimit!'
          : 'Please select both source and destination datasets before starting!'
      );
      return;
    }

    if (sourcePool === targetPool && sourceDataset === fullTargetDataset) {
      setErrorMsg(
        lang === 'sq'
          ? 'Burimi dhe destinacioni nuk mund të jenë identikë në të njëjtin pool!'
          : 'Source and target datasets cannot be identical within the same pool!'
      );
      return;
    }

    try {
      setIsStarting(true);
      setErrorMsg(null);
      previousRatesRef.current = [];

      const payload: ZSendMigrationRequest = {
        sourcePool,
        sourceDataset,
        snapshotName: snapshotName || undefined,
        targetPool,
        targetDataset: fullTargetDataset,
        rawCompressed,
        preserveProperties,
        forceOverwrite,
        isIncremental,
        baseSnapshot: isIncremental ? baseSnapshot : undefined,
      };

      const res = await zfsApi.startZSendMigration(payload);
      setActiveMigration(res.migration);
      pollMigration();
    } catch (err: any) {
      setErrorMsg(err.message || 'Deshtoi nisja e migrimit ZFS Z-Send');
    } finally {
      setIsStarting(false);
    }
  };

  // Abort active migration
  const handleAbort = async () => {
    if (!activeMigration) return;
    try {
      setIsAborting(true);
      await zfsApi.abortZSendMigration(activeMigration.migrationId);
      await pollMigration();
    } catch (err: any) {
      setErrorMsg(err.message || 'Deshtoi nderprerja e migrimit');
    } finally {
      setIsAborting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#0c1222] border border-slate-700/80 rounded-2xl shadow-xl flex flex-col overflow-hidden text-slate-100 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#090e1a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-950 border border-indigo-700 text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight font-mono">
                  {lang === 'sq' ? 'Migrimi i të Dhënave me ZFS Z-Send' : 'ZFS Z-Send Stream Migration Engine'}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                  Worker Offloaded
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {lang === 'sq'
                  ? 'Replikim atomik bllok-për-bllok me Fletcher4 Checksum dhe llogaritje në Web Worker'
                  : 'Atomic block-level stream replication with zero-copy pipe and Web Worker telemetry tracking'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Mbyll"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs font-mono">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-rose-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ACTIVE STREAM PROGRESS TRACKER (Requirement 3) */}
          {activeMigration && (
            <div className="p-4 sm:p-5 rounded-xl bg-[#080f22] border-2 border-indigo-500/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      activeMigration.status === 'COMPLETED'
                        ? 'bg-emerald-400'
                        : activeMigration.status === 'ABORTED' || activeMigration.status === 'FAILED'
                        ? 'bg-rose-500'
                        : 'bg-amber-400 ring-2 ring-amber-500/40'
                    }`}
                  />
                  <span className="font-bold text-sm text-white">
                    {lang === 'sq' ? 'Statusi i Transmetimit Z-Send:' : 'Z-Send Stream Status:'}{' '}
                    <span className="text-indigo-400">{activeMigration.status}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {workerTelemetryActive && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      Worker Active
                    </span>
                  )}
                  {activeMigration.status === 'STREAMING_SNAPSHOT' && (
                    <button
                      onClick={handleAbort}
                      disabled={isAborting}
                      className="px-3 py-1 rounded bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <StopCircle className="w-3.5 h-3.5 text-rose-400" />
                      {lang === 'sq' ? 'Ndërprit Migrimin' : 'Abort Stream'}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar & Rate Stats */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-semibold">
                    {activeMigration.sourceDataset} <ArrowRight className="inline w-3 h-3 text-indigo-400" />{' '}
                    {activeMigration.targetDataset}
                  </span>
                  <span className="text-white font-bold text-sm">
                    {activeMigration.progressPct}% ({activeMigration.bytesSentFormatted} /{' '}
                    {activeMigration.totalFormatted})
                  </span>
                </div>

                {/* Bar */}
                <div className="w-full h-3 bg-[#050814] rounded-full overflow-hidden border border-slate-700/80">
                  <div
                    className={`h-full transition-all duration-300 ${
                      activeMigration.status === 'COMPLETED'
                        ? 'bg-emerald-500'
                        : activeMigration.status === 'ABORTED' || activeMigration.status === 'FAILED'
                        ? 'bg-rose-500'
                        : 'bg-gradient-to-r from-indigo-500 to-sky-400'
                    }`}
                    style={{ width: `${Math.min(100, activeMigration.progressPct)}%` }}
                  />
                </div>
              </div>

              {/* Real-time Telemetry Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-2.5 rounded-lg bg-[#050914] border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">{lang === 'sq' ? 'Shpejtësia Rrjedhëse' : 'Current Speed'}</span>
                  <div className="flex items-center gap-1 mt-1 text-sky-400 font-bold text-xs">
                    <Activity className="w-3.5 h-3.5" />
                    <span>{activeMigration.currentRateMbS} MB/s</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#050914] border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">{lang === 'sq' ? 'Koha e Mbetur (ETA)' : 'Estimated Time (ETA)'}</span>
                  <div className="flex items-center gap-1 mt-1 text-amber-300 font-bold text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {activeMigration.status === 'COMPLETED'
                        ? '0s (Mbyllur)'
                        : `${activeMigration.estimatedRemainingSeconds}s`}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#050914] border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">{lang === 'sq' ? 'Koha e Kalimit' : 'Elapsed Time'}</span>
                  <div className="flex items-center gap-1 mt-1 text-slate-200 font-bold text-xs">
                    <span>{activeMigration.elapsedSeconds} sekonda</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#050914] border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">{lang === 'sq' ? 'Checksum Fletcher4' : 'Checksum Fletcher4'}</span>
                  <div className="flex items-center gap-1 mt-1 text-emerald-400 font-bold text-xs">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{activeMigration.checksumMatches ? '100% Validuar' : 'Duke Verifikuar'}</span>
                  </div>
                </div>
              </div>

              {/* CLI Command Info */}
              <div className="p-2.5 rounded-lg bg-[#040712] border border-slate-800/80 text-[11px] text-slate-400 overflow-x-auto">
                <span className="text-indigo-400 font-bold block mb-1">Pipelina CLI e Ekzekutuar:</span>
                <code>{activeMigration.cliCommandExecuted}</code>
              </div>
            </div>
          )}

          {/* MIGRATION CONFIGURATION FORM (If no active migration running or completed) */}
          {(!activeMigration || activeMigration.status === 'COMPLETED' || activeMigration.status === 'ABORTED') && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Config Card */}
                <div className="p-4 rounded-xl bg-[#090f20] border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
                    <Database className="w-3.5 h-3.5" />
                    <span>{lang === 'sq' ? '1. Burimi i të Dhënave (Source)' : '1. Source Dataset & Snapshot'}</span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-slate-400 block text-[10px] mb-1">
                        {lang === 'sq' ? 'Zgjidh Storage Pool Burim:' : 'Source Storage Pool:'}
                      </label>
                      <select
                        value={sourcePool}
                        onChange={(e) => setSourcePool(e.target.value)}
                        className="w-full bg-[#050814] border border-slate-700 rounded-lg p-2 text-white font-mono"
                      >
                        {pools.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} ({p.health} - {p.size})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block text-[10px] mb-1">
                        {lang === 'sq' ? 'Zgjidh Dataset Burim:' : 'Source Dataset:'}
                      </label>
                      <select
                        value={sourceDataset}
                        onChange={(e) => {
                          setSourceDataset(e.target.value);
                          const parts = e.target.value.split('/');
                          const leaf = parts.slice(1).join('/');
                          setTargetDatasetName(leaf || 'migrated-dataset');
                        }}
                        className="w-full bg-[#050814] border border-slate-700 rounded-lg p-2 text-white font-mono"
                      >
                        {availableDatasets.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name} ({d.used})
                          </option>
                        ))}
                        {availableDatasets.length === 0 && (
                          <option value="">{sourcePool}/data (Default)</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block text-[10px] mb-1">
                        {lang === 'sq' ? 'Snapshot (Opcional - bosh krijon automatikisht):' : 'Snapshot (Optional - auto creates if blank):'}
                      </label>
                      <select
                        value={snapshotName}
                        onChange={(e) => setSnapshotName(e.target.value)}
                        className="w-full bg-[#050814] border border-slate-700 rounded-lg p-2 text-white font-mono"
                      >
                        <option value="">{lang === 'sq' ? '-- Krijo Snapshot Atomik të Ri automatikisht --' : '-- Auto-generate atomic snapshot on trigger --'}</option>
                        {availableSnapshots.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name} ({s.creation})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Target Config Card */}
                <div className="p-4 rounded-xl bg-[#090f20] border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sky-400 font-bold uppercase tracking-wider text-[11px]">
                    <Layers className="w-3.5 h-3.5" />
                    <span>{lang === 'sq' ? '2. Destinacioni (Target)' : '2. Target Pool & Destination Path'}</span>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-slate-400 block text-[10px] mb-1">
                        {lang === 'sq' ? 'Zgjidh Storage Pool Destinacion:' : 'Target Storage Pool:'}
                      </label>
                      <select
                        value={targetPool}
                        onChange={(e) => setTargetPool(e.target.value)}
                        className="w-full bg-[#050814] border border-slate-700 rounded-lg p-2 text-white font-mono"
                      >
                        {pools.map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} ({p.health} - Free: {p.free})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block text-[10px] mb-1">
                        {lang === 'sq' ? 'Emri i Dataset-it Destinacion:' : 'Target Dataset Name:'}
                      </label>
                      <input
                        type="text"
                        value={targetDatasetName}
                        onChange={(e) => setTargetDatasetName(e.target.value)}
                        placeholder="appdata-replica"
                        className="w-full bg-[#050814] border border-slate-700 rounded-lg p-2 text-white font-mono"
                      />
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#040712] border border-slate-800 text-[11px]">
                      <span className="text-slate-500 block text-[10px]">{lang === 'sq' ? 'Rruga e plotë në Destinacion:' : 'Full Target Path:'}</span>
                      <span className="text-sky-300 font-bold">{fullTargetDataset}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Z-Send Optimization & Stream Options */}
              <div className="p-4 rounded-xl bg-[#080d1c] border border-slate-800 space-y-3">
                <h3 className="text-slate-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {lang === 'sq' ? 'Parametrat e Transmetimit Z-Send (Performance & Safety)' : 'Stream Optimization & Replication Flags'}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-[#050814] border border-slate-800/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rawCompressed}
                      onChange={(e) => setRawCompressed(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                    />
                    <div>
                      <span className="text-white font-semibold">Raw Compressed Stream (-c)</span>
                      <p className="text-[10px] text-slate-400">
                        {lang === 'sq' ? 'Dërgon blloqet e kompresuara direkt pa dekompresim (2x më i shpejtë)' : 'Sends compressed blocks as-is without CPU decompression overhead'}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-[#050814] border border-slate-800/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preserveProperties}
                      onChange={(e) => setPreserveProperties(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                    />
                    <div>
                      <span className="text-white font-semibold">Preserve Properties (-p)</span>
                      <p className="text-[10px] text-slate-400">
                        {lang === 'sq' ? 'Ruan të gjitha atributet ZFS (compression, recordsize, quota, mountpoint)' : 'Transfers dataset properties and user attributes intact'}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-[#050814] border border-slate-800/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceOverwrite}
                      onChange={(e) => setForceOverwrite(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                    />
                    <div>
                      <span className="text-white font-semibold">Force Overwrite (-F)</span>
                      <p className="text-[10px] text-slate-400">
                        {lang === 'sq' ? 'Rrotullon automatikisht destinacionin nëse ekziston pa ndërprerë punën' : 'Allows rollback of target dataset to match receive stream exactly'}
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2 rounded-lg bg-[#050814] border border-slate-800/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isIncremental}
                      onChange={(e) => setIsIncremental(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-500 focus:ring-0"
                    />
                    <div>
                      <span className="text-white font-semibold">Incremental Stream (-i)</span>
                      <p className="text-[10px] text-slate-400">
                        {lang === 'sq' ? 'Dërgon vetëm ndryshimet (delta) ndërmjet dy snapshots' : 'Transfers only changed delta blocks between base and target snapshot'}
                      </p>
                    </div>
                  </label>
                </div>

                {isIncremental && (
                  <div className="pt-1">
                    <label className="text-slate-400 block text-[10px] mb-1">
                      {lang === 'sq' ? 'Base Snapshot (-i):' : 'Base Snapshot (-i):'}
                    </label>
                    <input
                      type="text"
                      value={baseSnapshot}
                      onChange={(e) => setBaseSnapshot(e.target.value)}
                      placeholder={`${sourceDataset}@baseline`}
                      className="w-full bg-[#050814] border border-slate-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Live CLI Preview */}
              <div className="p-3 rounded-xl bg-[#040712] border border-slate-800 space-y-1.5">
                <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                  {lang === 'sq' ? 'Komanda ZFS që do të ekzekutohet:' : 'Generated Command Preview:'}
                </span>
                <code className="text-xs text-indigo-300 block font-mono bg-[#02050b] p-2 rounded-lg border border-slate-900 overflow-x-auto">
                  {commandPreview}
                </code>
              </div>

              {/* Start Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleStartMigration}
                  disabled={isStarting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold font-mono flex items-center gap-2 shadow-lg shadow-indigo-950 transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {isStarting
                      ? (lang === 'sq' ? 'Duke inicializuar Z-Send...' : 'Starting Stream...')
                      : (lang === 'sq' ? 'Nis Migrimin Z-Send' : 'Start Z-Send Migration')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Migration History / Audit Table */}
          {migrationHistory.length > 0 && (
            <div className="p-4 rounded-xl bg-[#080d1c] border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-slate-300 font-bold text-xs uppercase tracking-wider">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>{lang === 'sq' ? 'Historiku i Migrimeve ZFS Z-Send' : 'Recent Z-Send Migration Logs'}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-[10px]">
                      <th className="pb-2">Burimi</th>
                      <th className="pb-2">Destinacioni</th>
                      <th className="pb-2">Statusi</th>
                      <th className="pb-2">Vëllimi</th>
                      <th className="pb-2">Shpejtësia Mesatare</th>
                      <th className="pb-2">Koha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {migrationHistory.slice(0, 5).map((h) => (
                      <tr key={h.migrationId} className="hover:bg-slate-900/40">
                        <td className="py-2 text-white">{h.sourceDataset}</td>
                        <td className="py-2 text-slate-300">{h.targetDataset}</td>
                        <td className="py-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              h.status === 'COMPLETED'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : h.status === 'ABORTED'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td className="py-2 text-slate-300">{h.totalFormatted}</td>
                        <td className="py-2 text-sky-400">{h.averageRateMbS} MB/s</td>
                        <td className="py-2 text-slate-400">{h.elapsedSeconds}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#090e1a] flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {lang === 'sq'
                ? 'ZFS Z-Send garanton që të dhënat janë bit-për-bit identike.'
                : 'Z-Send guarantees byte-for-byte stream parity.'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

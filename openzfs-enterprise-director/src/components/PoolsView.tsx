import React, { useEffect, useState } from 'react';
import {
  HardDrive,
  Plus,
  Play,
  Square,
  Sparkles,
  Trash2,
  Cpu,
  Layers,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  Info,
  AlertTriangle,
  CheckCircle2,
  Power,
  RotateCcw,
  Calendar,
  AlertOctagon,
  FileJson,
  Send,
} from 'lucide-react';
import { Pool, DiskItem, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { ScrubScheduler } from './ScrubScheduler';
import { ZfsPoolBackupModal } from './ZfsPoolBackupModal';

interface Props {
  pools: Pool[];
  availableDisks: DiskItem[];
  onScrub: (poolName: string, action: 'start' | 'stop' | 'pause') => void;
  onTrim: (poolName: string) => void;
  onAddVdev: (poolName: string, data: { type: string; disks: string[]; desc?: string }) => void;
  onDestroyPool: (poolName: string) => void;
  onOpenWizard: () => void;
  onInspectDevice: (dev: string) => void;
  onDeviceAction?: (pool: string, dev: string, action: 'offline' | 'online' | 'remove' | 'detach') => void;
  lang: Language;
  onOpenZSend?: (sourcePool?: string) => void;
  onPoolImported?: (poolName: string, message: string) => void;
  onRequestDangerConfirm?: (data: {
    type: 'delete_pool' | 'delete_dataset' | 'delete_device' | 'modify_device' | 'modify_property';
    targetName: string;
    details?: string;
    onConfirm: () => void;
  }) => void;
}

export const PoolsView: React.FC<Props> = ({
  pools,
  availableDisks,
  onScrub,
  onTrim,
  onAddVdev,
  onDestroyPool,
  onOpenWizard,
  onInspectDevice,
  onDeviceAction,
  lang,
  onOpenZSend,
  onPoolImported,
  onRequestDangerConfirm,
}) => {
  const [selectedPoolName, setSelectedPoolName] = useState<string>(pools[0]?.name || '');
  const [showAddVdevModal, setShowAddVdevModal] = useState(false);
  const [vdevType, setVdevType] = useState('cache');
  const [selectedDisks, setSelectedDisks] = useState<string[]>([]);
  const [vdevDesc, setVdevDesc] = useState('');
  const [showScrubScheduler, setShowScrubScheduler] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupModalInitialPool, setBackupModalInitialPool] = useState<string | undefined>(undefined);

  const t = (key: string) => TRANSLATIONS[lang][key] || key;
  const currentPool = pools.find((p) => p.name === selectedPoolName) || pools[0];

  useEffect(() => {
    if (!pools.some((pool) => pool.name === selectedPoolName)) {
      setSelectedPoolName(pools[0]?.name || '');
    }
  }, [pools, selectedPoolName]);

  const handleToggleDisk = (dev: string) => {
    setSelectedDisks((prev) =>
      prev.includes(dev) ? prev.filter((d) => d !== dev) : [...prev, dev]
    );
  };

  const handleConfirmAddVdev = () => {
    if (!currentPool || !selectedDisks.length) return;
    const executeAdd = () => {
      onAddVdev(currentPool.name, {
        type: vdevType,
        disks: selectedDisks,
        desc: vdevDesc || `${vdevType.toUpperCase()} Device`,
      });
      setShowAddVdevModal(false);
      setSelectedDisks([]);
      setVdevDesc('');
    };

    if (onRequestDangerConfirm) {
      onRequestDangerConfirm({
        type: 'modify_device',
        targetName: `${currentPool.name} (+${vdevType.toUpperCase()})`,
        details:
          lang === 'sq'
            ? `Shtimi i disqeve (${selectedDisks.join(', ')}) si ${vdevType.toUpperCase()} do te lidhe keto pajisje fizike ne storage pool.`
            : `Adding physical devices (${selectedDisks.join(', ')}) as ${vdevType.toUpperCase()} will permanently attach them to storage pool ${currentPool.name}.`,
        onConfirm: executeAdd,
      });
    } else {
      executeAdd();
    }
  };

  // Modify device status (Offline / Online) with critical warning
  const handleModifyDeviceState = (dev: string, currentStatus: string) => {
    if (!currentPool) return;
    const targetAction = currentStatus === 'OFFLINE' ? 'online' : 'offline';
    const actionLabel = targetAction === 'offline' ? t('device.setOffline') : t('device.setOnline');

    const executeAction = () => {
      onDeviceAction?.(currentPool.name, dev, targetAction);
    };

    if (onRequestDangerConfirm) {
      onRequestDangerConfirm({
        type: 'modify_device',
        targetName: `${dev} (${currentPool.name})`,
        details:
          lang === 'sq'
            ? `Kujdes: Veprimi "${actionLabel}" per pajisjen ${dev} do te modifikoje topologjine dhe gjendjen e paritetit ne pool-in '${currentPool.name}'.`
            : `Warning: Setting ${dev} to ${targetAction.toUpperCase()} in pool '${currentPool.name}' alters redundancy and kernel I/O handling.`,
        onConfirm: executeAction,
      });
    } else {
      executeAction();
    }
  };

  // Delete/Detach device from pool with critical warning
  const handleDeleteDevice = (dev: string, vdevName: string) => {
    if (!currentPool) return;

    const executeDelete = () => {
      onDeviceAction?.(currentPool.name, dev, 'remove');
    };

    if (onRequestDangerConfirm) {
      onRequestDangerConfirm({
        type: 'delete_device',
        targetName: `${dev} [${vdevName}]`,
        details:
          lang === 'sq'
            ? `PARALAJMERIM I RREPTË: Shkeputja e diskut ${dev} do ta heqë këtë pajisje nga pool-i '${currentPool.name}'. Nese pool-i nuk ka disk rezerve, kjo mund te shkaktoje humbje te paritetit!`
            : `CRITICAL WARNING: Detaching disk ${dev} permanently removes it from pool '${currentPool.name}'. If running without spares or parity, this will risk permanent pool damage!`,
        onConfirm: executeDelete,
      });
    } else {
      executeDelete();
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Pool Selector & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0c1326] border border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-sky-950/60 border border-sky-600/30 text-sky-400 shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono">{t('pools.selectPool')}</div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {pools.length === 0 ? (
                <span className="text-xs sm:text-sm font-mono text-slate-400">
                  {lang === 'sq' ? 'Asnjë pool i importuar' : 'No pools imported'}
                </span>
              ) : (
                <select
                  value={selectedPoolName}
                  onChange={(e) => setSelectedPoolName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm font-semibold rounded-md px-3 py-1.5 cursor-pointer focus:outline-none focus:border-sky-500 font-mono"
                >
                  {pools.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.size} - {p.health})
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono">
                ashift={currentPool?.ashift || 12}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onOpenWizard()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('pools.createNew')}</span>
          </button>
          <button
            onClick={() => setShowAddVdevModal(true)}
            className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>{t('pools.addVdev')}</span>
          </button>
          <button
            onClick={() => {
              setBackupModalInitialPool(currentPool?.name);
              setShowBackupModal(true);
            }}
            className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900/70 border border-emerald-700/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            title={lang === 'sq' ? 'Eksporto ose Importo konfigurimet ZFS (Disaster Recovery & Environment Cloning)' : 'Export or import ZFS configurations (disaster recovery & environment cloning)'}
          >
            <FileJson className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lang === 'sq' ? 'Eksporto / Importo JSON (DR)' : 'Export / Import JSON (DR)'}</span>
          </button>
          {onOpenZSend && (
            <button
              onClick={() => onOpenZSend(currentPool?.name)}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-300 bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-700/50 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer font-mono"
              title={lang === 'sq' ? 'Migro të dhënat me ZFS Z-Send' : 'Migrate data with ZFS Z-Send'}
            >
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              <span>{lang === 'sq' ? 'Migro me Z-Send' : 'Z-Send Migration'}</span>
            </button>
          )}
        </div>
      </div>

      {currentPool && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Pool Metrics & Operational Controls */}
          <div className="space-y-6">
            {/* Pool Status Card */}
            <div className="p-4 sm:p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-slate-400">{t('pools.healthCapacity')}</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/40 font-mono">
                  {currentPool.health}
                </span>
              </div>

              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>{t('pools.totalCapacity')}</span>
                  <span className="text-white font-semibold">{currentPool.size}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t('pools.allocatedSpace')}</span>
                  <span className="text-sky-300">{currentPool.allocated}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t('pools.freeSpace')}</span>
                  <span className="text-slate-200">{currentPool.free}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t('pools.fragmentation')}</span>
                  <span className="text-amber-300">{currentPool.frag}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Deduplication:</span>
                  <span className="text-slate-300">{currentPool.dedup}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>{t('pools.ashift')}</span>
                  <span className="text-emerald-400 font-semibold">{currentPool.ashift} (4096B)</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#070c18] border border-slate-800 text-[11px] text-slate-300 space-y-1">
                <span className="text-slate-400 font-semibold block">{t('pools.verificationStatus')}</span>
                <p className="text-slate-300 font-mono text-[10px]">{currentPool.status}</p>
                <p className="text-sky-300 font-mono text-[10px]">{currentPool.scrub_status}</p>
              </div>
            </div>

            {/* Maintenance Actions Card */}
            <div className="p-4 sm:p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3">
              <span className="text-xs font-mono uppercase text-slate-400 block">
                {t('pools.maintenanceOps')}
              </span>

              <div className="grid grid-cols-2 gap-2">
                {currentPool.scrub_active ? (
                  <button
                    onClick={() => onScrub(currentPool.name, 'stop')}
                    className="p-2.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/50 text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>{t('pools.stopScrub')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onScrub(currentPool.name, 'start')}
                    className="p-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{t('pools.startScrub')}</span>
                  </button>
                )}

                <button
                  onClick={() => onTrim(currentPool.name)}
                  className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title={lang === 'sq' ? 'Ekzekuto ZFS TRIM per rikuperim blloqesh SSD/NVMe' : 'Run ZFS TRIM to reclaim SSD/NVMe blocks'}
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>ZFS TRIM</span>
                </button>
              </div>

              {/* Scrub Scheduler Button */}
              <button
                onClick={() => setShowScrubScheduler(true)}
                className="w-full p-2.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/50 text-indigo-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title={lang === 'sq' ? 'Planifiko oraret e perseritura te scrub me Cron dhe dritare kalendarike' : 'Plan recurring scrubs with cron and calendar windows'}
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{lang === 'sq' ? 'Orari i Scrubbing (Cron & Kalendar)' : 'Scrub Scheduler (Cron & Calendar)'}</span>
              </button>

              {/* Export JSON Config for this Pool Button */}
              <button
                onClick={() => {
                  setBackupModalInitialPool(currentPool.name);
                  setShowBackupModal(true);
                }}
                className="w-full p-2.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title={lang === 'sq' ? 'Eksporto konfigurimin dhe metadhenat e ketij pool-i per rikuperim emergjence (Disaster Recovery)' : 'Export this pool\'s configuration and metadata for disaster recovery'}
              >
                <FileJson className="w-3.5 h-3.5 text-emerald-400" />
                <span>{lang === 'sq' ? 'Eksporto Konfigurimin (JSON / DR)' : 'Export Configuration (JSON / DR)'}</span>
              </button>

              {/* Danger Zone: Destroy pool */}
              <div className="pt-2 border-t border-slate-800">
                <button
                  onClick={() => {
                    if (onRequestDangerConfirm) {
                      onRequestDangerConfirm({
                        type: 'delete_pool',
                        targetName: currentPool.name,
                        details: lang === 'sq'
                          ? `Kapaciteti: ${currentPool.size} · E lire: ${currentPool.free} · Ashift: ${currentPool.ashift} · Disqet: ${currentPool.vdevs.map(v => v.disks.join(', ')).join('; ')}`
                          : `Capacity: ${currentPool.size} · Free: ${currentPool.free} · Ashift: ${currentPool.ashift} · Disks: ${currentPool.vdevs.map(v => v.disks.join(', ')).join('; ')}`,
                        onConfirm: () => onDestroyPool(currentPool.name),
                      });
                    } else {
                      onDestroyPool(currentPool.name);
                    }
                  }}
                  className="w-full p-2.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/30 text-rose-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('pools.destroyPool')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Topology Tree of VDEVs & Disks */}
          <div className="lg:col-span-2 p-4 sm:p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-semibold text-white">
                  {t('pools.topologyTitle')}
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {currentPool.vdevs.length} {t('pools.activeVdevs')}
              </span>
            </div>

            {/* VDEVs Render List */}
            <div className="space-y-3">
              {currentPool.vdevs.map((vdev, idx) => {
                const isSpecial = vdev.type === 'special';
                const isLog = vdev.type === 'log';
                const isCache = vdev.type === 'cache';

                let badgeColor = 'bg-sky-950 text-sky-400 border-sky-800/40';
                if (isLog) {
                  badgeColor = 'bg-amber-950 text-amber-400 border-amber-800/40';
                } else if (isCache) {
                  badgeColor = 'bg-emerald-950 text-emerald-400 border-emerald-800/40';
                } else if (isSpecial) {
                  badgeColor = 'bg-purple-950 text-purple-400 border-purple-800/40';
                }

                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}`}>
                          {vdev.type.toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-white font-mono">{vdev.name}</span>
                        {vdev.desc && (
                          <span className="text-[11px] text-slate-400 hidden sm:inline">· {vdev.desc}</span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/30">
                        {vdev.status}
                      </span>
                    </div>

                    {/* Member Disks inside this VDEV */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1 font-mono text-xs">
                      {vdev.disks.map((d, dIdx) => (
                        <div
                          key={dIdx}
                          className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-slate-300 gap-2"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate text-white font-medium">{d}</span>
                          </div>

                          {/* Device Action Buttons with Warnings */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* SMART Info Button */}
                            <button
                              onClick={() => onInspectDevice(d)}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950/80 hover:bg-sky-900 text-sky-400 border border-sky-800/40 cursor-pointer flex items-center gap-0.5 transition-colors"
                              title={(lang === 'sq' ? `Shiko informacionin SMART per ${d}` : `View SMART information for ${d}`)}
                            >
                              <Info className="w-2.5 h-2.5" />
                              <span>Info</span>
                            </button>

                            {/* Modify State Button (Triggers Warning) */}
                            <button
                              onClick={() => handleModifyDeviceState(d, vdev.status)}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-amber-950 hover:text-amber-300 hover:border-amber-700/50 text-slate-300 border border-slate-700 cursor-pointer flex items-center gap-0.5 transition-colors"
                              title={t('device.modifyState')}
                            >
                              <Power className="w-2.5 h-2.5 text-amber-400" />
                              <span className="hidden sm:inline">{lang === 'sq' ? 'Modifiko' : 'Modify'}</span>
                            </button>

                            {/* Detach / Remove Device Button (Triggers Critical Warning) */}
                            <button
                              onClick={() => handleDeleteDevice(d, vdev.name)}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950/50 hover:bg-rose-900/80 text-rose-300 border border-rose-800/40 cursor-pointer flex items-center gap-0.5 transition-colors"
                              title={t('device.removeDevice')}
                            >
                              <Trash2 className="w-2.5 h-2.5 text-rose-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Architecture Explanation Box */}
            <div className="p-3.5 rounded-lg bg-sky-950/20 border border-sky-800/30 text-xs text-slate-300 space-y-1">
              <span className="font-semibold text-sky-400 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                <span>{lang === 'sq' ? 'Keshille Arkitekturale mbi VDEVs:' : 'Architectural VDEV Guidance:'}</span>
              </span>
              <p className="text-slate-300 leading-relaxed">
                {t('pools.vdevAdvice')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add VDEV Modal */}
      {showAddVdevModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-[#0c1222] border border-slate-700 rounded-xl shadow-2xl p-6 space-y-5 text-slate-200">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-sky-400" />
              <span>{t('pools.addVdev')} - '{currentPool?.name}'</span>
            </h3>

            {/* Type selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {lang === 'sq' ? 'Lloji i Pajisjes VDEV:' : 'VDEV Device Type:'}
              </label>
              <select
                value={vdevType}
                onChange={(e) => setVdevType(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
              >
                <option value="cache">cache (L2ARC Secondary Read Cache)</option>
                <option value="log">log (SLOG Separate Intent Log - ZIL)</option>
                <option value="special">{lang === 'sq' ? 'special (Special VDEV per Metadata & Small Blocks)' : 'special (Special VDEV for metadata & small blocks)'}</option>
                <option value="spare">{lang === 'sq' ? 'spare (Hot Spare per zevendesim automatik)' : 'spare (Hot spare for automatic replacement)'}</option>
              </select>
            </div>

            {/* Typology Recommendation for selected VDEV type */}
            {vdevType === 'special' && (
              <div className="p-3 rounded-lg bg-purple-950/40 border border-purple-800/60 text-xs text-purple-200 space-y-1.5">
                <span className="font-bold flex items-center gap-1.5 text-purple-300">
                  <Layers className="w-4 h-4 text-purple-400" />
                  {lang === 'sq' ? 'Rekomandimet sipas Tipologjise (Special DEV):' : 'Workload Typology Rules (Special DEV):'}
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {lang === 'sq'
                    ? '• Databaza & OLTP: special_small_blocks=16K ose 32K ruan indekset B-Tree dhe tabelat e nxehta ne NVMe.'
                    : '• Databases & OLTP: special_small_blocks=16K/32K holds B-Tree index pages directly on NVMe.'}
                  <br />
                  {lang === 'sq'
                    ? '• Virtualizim & VM: special_small_blocks=8K/16K (volblocksize) ruan ZVOL disk headers dhe përshpejton boot storms.'
                    : '• Virtualization & VMs: special_small_blocks=8K/16K stores ZVOL headers, accelerating VM boot storms.'}
                  <br />
                  {lang === 'sq'
                    ? '• Media/NAS: special_small_blocks=0 ruan VETEM metadhenat (dnodes & directory trees), pa konsumuar flash per video.'
                    : '• Media/NAS: special_small_blocks=0 stores ONLY metadata (directory trees), saving flash from large video files.'}
                </p>
                <div className="p-2 rounded bg-rose-950/60 border border-rose-800/60 text-[11px] text-rose-300 font-semibold flex items-center gap-1.5">
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>
                    {lang === 'sq'
                      ? 'KUJDES: Kerkohet MIRROR me redundance te barabarte ose me te larte se vete pool-i! Humbja e Special VDEV shkaterron gjithe pool-in!'
                      : 'CRITICAL: Must be a MIRROR equal to or exceeding pool redundancy! Loss of unmirrored Special VDEV destroys entire pool!'}
                  </span>
                </div>
              </div>
            )}

            {vdevType === 'log' && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 space-y-1.5">
                <span className="font-bold flex items-center gap-1.5 text-amber-300">
                  <Zap className="w-4 h-4 text-amber-400" />
                  {lang === 'sq' ? 'Rekomandimet sipas Tipologjise (SLOG ZIL):' : 'Workload Typology Rules (SLOG ZIL):'}
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {lang === 'sq'
                    ? '• Databaza (PostgreSQL/MySQL): Pershpejton shkrimet sinkrone fsync (COMMIT;) nga 20ms ne <0.1ms.'
                    : '• Databases: Accelerates sync fsync (COMMIT;) transactions from 20ms to <0.1ms.'}
                  <br />
                  {lang === 'sq'
                    ? '• Virtualizim (NFS/iSCSI): Parandalon bllokimin e makinave virtuale gjate shkrimeve sinkrone.'
                    : '• Virtualization: Eliminates VM disk freeze during synchronous datastore write operations.'}
                  <br />
                  {lang === 'sq'
                    ? '• Madhesia e Rekomanduar: 16GB - 64GB (mjaftojne 5 sekonda xhiro transaksionesh). Kerkohet patjeter disqe me Power Loss Protection (PLP)!'
                    : '• Recommended Sizing: 16GB - 64GB (holds ~5s TXG flush). Enterprise NVMe with PLP is strictly required!'}
                </p>
              </div>
            )}

            {vdevType === 'cache' && (
              <div className="p-3 rounded-lg bg-sky-950/40 border border-sky-800/60 text-xs text-sky-200 space-y-1.5">
                <span className="font-bold flex items-center gap-1.5 text-sky-300">
                  <HardDrive className="w-4 h-4 text-sky-400" />
                  {lang === 'sq' ? 'Rekomandimet sipas Tipologjise (L2ARC Cache):' : 'Workload Typology Rules (L2ARC Cache):'}
                </span>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {lang === 'sq'
                    ? '• Virtualizim: Zgjeron keshin e leximit per boot images (Persistent L2ARC mban te dhenat pas reboot).'
                    : '• Virtualization: Extends read cache for shared OS binaries (Persistent L2ARC survives reboot).'}
                  <br />
                  {lang === 'sq'
                    ? '• Databaza: Vendosni l2arc_noprefetch=1 per te shmangur ndotjen e flash-it nga table scans.'
                    : '• Databases: Set l2arc_noprefetch=1 to avoid cache eviction during full table scans.'}
                  <br />
                  {lang === 'sq'
                    ? '• Kujtesa RAM: Cdo 1GB L2ARC kerkon 10-20MB RAM ne ARC per indeksim. Mos lidhni me shume se 5x-10x te RAM-it.'
                    : '• Memory Overhead: 1GB L2ARC needs 10-20MB ARC RAM for headers. Do not exceed 5x-10x total physical RAM.'}
                </p>
              </div>
            )}

            {vdevType === 'spare' && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-emerald-300">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  {lang === 'sq' ? 'Hot Spare Automatik:' : 'Automated Hot Spare:'}
                </span>
                <p className="text-slate-300 text-[11px]">
                  {lang === 'sq'
                    ? 'ZED daemon aktivizon kete disk automatikisht per zevendesim dhe resilver sapo te ndodhe nje gabim I/O.'
                    : 'ZED event daemon automatically attaches this spare and begins resilvering upon drive degradation.'}
                </p>
              </div>
            )}

            {/* Disks selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">
                {lang === 'sq'
                  ? `Zgjidh disqet e lira ne server (${selectedDisks.length} te perzgjedhur):`
                  : `Select free host devices (${selectedDisks.length} selected):`}
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                {availableDisks.length === 0 ? (
                  <p className="text-[11px] text-slate-500 font-mono px-1 py-2">
                    {lang === 'sq'
                      ? 'Asnjë disk i lirë nuk u gjet në këtë host.'
                      : 'No free disks were found on this host.'}
                  </p>
                ) : availableDisks.map((d) => (
                  <div
                    key={d.dev}
                    className="flex items-center justify-between p-2 rounded hover:bg-slate-800/80 text-xs font-mono"
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedDisks.includes(d.dev)}
                        onChange={() => handleToggleDisk(d.dev)}
                        className="rounded border-slate-700 text-sky-500 focus:ring-0"
                      />
                      <span className="text-white font-semibold">{d.dev}</span>
                      <span className="text-slate-400">({d.size} - {d.type})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 hidden sm:inline">{d.model}</span>
                      <button
                        type="button"
                        onClick={() => onInspectDevice(d.dev)}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950/80 hover:bg-sky-900 text-sky-400 border border-sky-800/40 cursor-pointer flex items-center gap-0.5"
                      >
                        <Info className="w-2.5 h-2.5" />
                        <span>Info</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Description note */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">
                {lang === 'sq' ? 'Pershkrim opsional:' : 'Optional Description:'}
              </label>
              <input
                type="text"
                placeholder={lang === 'sq' ? 'psh: Samsung PM9A3 NVMe Cache' : 'e.g.: Samsung PM9A3 NVMe Cache'}
                value={vdevDesc}
                onChange={(e) => setVdevDesc(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddVdevModal(false)}
                className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmAddVdev}
                disabled={!selectedDisks.length}
                className="px-4 py-2 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 cursor-pointer"
              >
                {lang === 'sq' ? 'Shto VDEV ne ZFS' : 'Attach VDEV to ZFS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scrub Scheduler Modal */}
      {showScrubScheduler && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl max-h-[94vh] overflow-y-auto bg-[#090e1d] border border-slate-700/80 rounded-2xl shadow-2xl p-4 sm:p-6">
            <ScrubScheduler
              pools={pools}
              lang={lang}
              isModal={true}
              onClose={() => setShowScrubScheduler(false)}
            />
          </div>
        </div>
      )}

      {/* ZFS Pool Configuration Backup & Import (Disaster Recovery & Environment Cloning) Modal */}
      <ZfsPoolBackupModal
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        pools={pools}
        initialPoolName={backupModalInitialPool}
        availableDisks={availableDisks}
        lang={lang}
        onPoolImported={(name, msg) => {
          onPoolImported?.(name, msg);
          setShowBackupModal(false);
          setSelectedPoolName(name);
        }}
      />
    </div>
  );
};

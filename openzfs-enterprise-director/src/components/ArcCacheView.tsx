import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Zap,
  Sliders,
  Check,
  FileCode,
  HardDrive,
  Copy,
  Info,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Database,
  Server,
  Film,
  Sparkles,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Bookmark,
} from 'lucide-react';
import { ArcStats, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  arc: ArcStats;
  onTuneArc: (params: {
    zfs_arc_max?: number;
    zfs_arc_min?: number;
    l2arc_write_max?: number;
    l2arc_noprefetch?: number;
  }) => void;
  onPersistConf?: (conf: string) => Promise<{ message?: string; backup?: string | null; initrdBackup?: string | null }>;
  lang?: Language;
}

export const ArcCacheView: React.FC<Props> = ({ arc, onTuneArc, onPersistConf, lang = 'sq' }) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  // Convert bytes to GB for easy slider manipulation
  const currentMaxGb = Math.round(arc.c_max / 1024 / 1024 / 1024);
  const currentMinGb = Math.round(arc.c_min / 1024 / 1024 / 1024);
  const currentWriteMaxMb = Math.round(arc.tunables.l2arc_write_max / 1024 / 1024);

  const [arcMaxGb, setArcMaxGb] = useState<number>(currentMaxGb || 64);
  const [arcMinGb, setArcMinGb] = useState<number>(currentMinGb || 8);
  const [l2WriteMb, setL2WriteMb] = useState<number>(currentWriteMaxMb || 250);
  const [l2Prefetch, setL2Prefetch] = useState<number>(arc.tunables.l2arc_noprefetch ?? 0);
  const [applySuccess, setApplySuccess] = useState(false);
  const [copiedConf, setCopiedConf] = useState(false);
  const [persistState, setPersistState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [persistMessage, setPersistMessage] = useState('');
  const [activeProfileTab, setActiveProfileTab] = useState<'db' | 'vm' | 'nas' | 'general'>('db');
  const [presetToast, setPresetToast] = useState<string | null>(null);

  const handleApplyTunables = () => {
    const bytesMax = arcMaxGb * 1024 * 1024 * 1024;
    const bytesMin = arcMinGb * 1024 * 1024 * 1024;
    const bytesWriteMax = l2WriteMb * 1024 * 1024;

    onTuneArc({
      zfs_arc_max: bytesMax,
      zfs_arc_min: bytesMin,
      l2arc_write_max: bytesWriteMax,
      l2arc_noprefetch: l2Prefetch,
    });

    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 3000);
  };

  const handleApplyPreset = (profile: 'db' | 'vm' | 'nas' | 'general') => {
    setActiveProfileTab(profile);
    if (profile === 'db') {
      setArcMaxGb(48); // ~60% of 64-96GB RAM (leaving room for PostgreSQL shared_buffers)
      setArcMinGb(12);
      setL2WriteMb(200); // 200MB/s to avoid wearing SSD
      setL2Prefetch(1); // 1 = don't cache table-scan prefetch, protect flash
    } else if (profile === 'vm') {
      setArcMaxGb(80); // ~75% RAM for VM image libraries and ZVOL block metadata
      setArcMinGb(16);
      setL2WriteMb(400); // 400MB/s fast fill for VM boot storms
      setL2Prefetch(0); // 0 = cache all prefetch reads
    } else if (profile === 'nas') {
      setArcMaxGb(32);
      setArcMinGb(8);
      setL2WriteMb(150);
      setL2Prefetch(0); // 0 = allow streaming file prefetch
    } else {
      setArcMaxGb(64);
      setArcMinGb(10);
      setL2WriteMb(250);
      setL2Prefetch(0);
    }

    setPresetToast(t('typology.presetApplied'));
    setTimeout(() => setPresetToast(null), 3000);
  };

  const modprobeConf = `# OpenZFS Enterprise Director - Persistent Kernel Tunables
# Vendoset ne /etc/modprobe.d/zfs.conf
options zfs zfs_arc_max=${arcMaxGb * 1024 * 1024 * 1024}
options zfs zfs_arc_min=${arcMinGb * 1024 * 1024 * 1024}
options zfs l2arc_write_max=${l2WriteMb * 1024 * 1024}
options zfs l2arc_noprefetch=${l2Prefetch}
`;

  const handleCopyConf = () => {
    navigator.clipboard.writeText(modprobeConf);
    setCopiedConf(true);
    setTimeout(() => setCopiedConf(false), 2000);
  };

  const handlePersistConf = async () => {
    if (!onPersistConf || persistState === 'running') return;
    setPersistState('running');
    setPersistMessage('');
    try {
      const res = await onPersistConf(modprobeConf);
      setPersistState('done');
      setPersistMessage(res.message || (lang === 'sq' ? 'U ruajt.' : 'Saved.'));
    } catch (err: any) {
      setPersistState('error');
      setPersistMessage(err?.message || (lang === 'sq' ? 'Nuk u ruajt.' : 'Save failed.'));
    }
  };

  const arcSizeGb = (arc.size / 1024 / 1024 / 1024).toFixed(2);
  const arcMaxValGb = (arc.c_max / 1024 / 1024 / 1024).toFixed(2);
  const arcMinValGb = (arc.c_min / 1024 / 1024 / 1024).toFixed(2);
  const mruGb = (arc.mru_size / 1024 / 1024 / 1024).toFixed(2);
  const mfuGb = (arc.mfu_size / 1024 / 1024 / 1024).toFixed(2);
  const dataGb = (arc.data_size / 1024 / 1024 / 1024).toFixed(2);
  const metaGb = (arc.metadata_size / 1024 / 1024 / 1024).toFixed(2);
  const l2SizeGb = (arc.l2_size / 1024 / 1024 / 1024).toFixed(2);

  const totalDual = arc.mru_size + arc.mfu_size || 1;
  const mruPct = Math.round((arc.mru_size / totalDual) * 100);
  const mfuPct = 100 - mruPct;

  // Typology Data Profiles
  const typologies = [
    {
      id: 'db' as const,
      icon: Database,
      title: t('typology.dbTitle'),
      desc: t('typology.dbDesc'),
      color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400',
      tag: 'OLTP & SQL',
      specialVdev: {
        topology: '2-way ose 3-way Mirror (Enterprise PLP NVMe)',
        blocks: 'special_small_blocks=16K ose 32K',
        reason:
          lang === 'sq'
            ? 'Te gjitha indekset B-Tree dhe faqet e bazave te te dhenave (PostgreSQL 8K, MySQL 16K) zhvendosen automatikisht ne NVMe flash te dedikuar. Disqet HDD kryesore clirohen teresisht nga kerkimet e rastesishme.'
            : 'All database B-Tree index nodes and small tables (8KB PostgreSQL / 16KB InnoDB) are transparently routed to dedicated NVMe mirror. Main pool HDDs are relieved of random I/O latency.',
      },
      slog: {
        topology: '2-way Mirror (Enterprise PLP NVMe / Optane / Kioxia)',
        sizing: '16GB - 64GB (Ultra-Low Latency Write Log)',
        reason:
          lang === 'sq'
            ? 'Ul latencen e shkrimeve sinkrone fsync (COMMIT;) nga 15-30ms ne nen 0.1ms. Rrit transaksionet ne sekonde (TPS) me mbi 10x pa rrezikuar integritetin.'
            : 'Slashes database fsync (COMMIT;) write latency from 15-30ms down to sub-0.1ms. Increases SQL transactions per second (TPS) by over 10x with zero data loss risk.',
      },
      arc: {
        sizing: lang === 'sq' ? '50% - 60% e RAM-it te serverit' : '50% - 60% of host physical RAM',
        tuning: 'zfs_arc_max=48GB, zfs_arc_min=12GB',
        reason:
          lang === 'sq'
            ? 'Liron hapesire per PostgreSQL shared_buffers ose MySQL innodb_buffer_pool_size pa shkaktuar konkurrence per memorje (Double Buffering).'
            : 'Leaves dedicated space for database buffer pool without memory contention or double buffering overhead.',
      },
      cache: {
        sizing: lang === 'sq' ? '5x deri 8x e RAM-it (NVMe Flash)' : '5x to 8x of RAM capacity',
        tuning: 'l2arc_write_max=200MB/s, l2arc_noprefetch=1',
        reason:
          lang === 'sq'
            ? 'l2arc_noprefetch=1 shmang ndotjen e flash-it nga skanime te medha tabelash (table scans), duke ruajtur keshin vetem per leximet kritike.'
            : 'l2arc_noprefetch=1 prevents cache thrashing caused by full table scans, keeping NVMe flash reserved for high-value reads.',
      },
      presetValues: { arcMax: 48, arcMin: 12, l2Write: 200, l2Prefetch: 1 },
    },
    {
      id: 'vm' as const,
      icon: Server,
      title: t('typology.vmTitle'),
      desc: t('typology.vmDesc'),
      color: 'from-sky-500/20 to-indigo-500/10 border-sky-500/30 text-sky-400',
      tag: 'Hypervisors & ZVOL',
      specialVdev: {
        topology: 'Mirror (2-way ose 3-way) me DWPD >= 3 NVMe',
        blocks: 'special_small_blocks=8K ose 16K (volblocksize=8K)',
        reason:
          lang === 'sq'
            ? 'ZVOL-et e makinave virtuale Proxmox/VMware dhe metadhenat e disqeve qcow2 ruhen drejtperdrejt ne NVMe, duke rritur IOPS me mbi 500% gjate Boot Storms.'
            : 'Virtual machine disk headers and 8KB ZVOL payload blocks are stored on NVMe, speeding VM boot and disk clones by >500%.',
      },
      slog: {
        topology: 'Mirror (2-way) me DWPD >= 3 NVMe me PLP',
        sizing: '32GB - 64GB',
        reason:
          lang === 'sq'
            ? 'Pershpejton shkrimet sinkrone per NFS/iSCSI qe perdoren nga hypervisoret per virtual disks, duke parandaluar bllokimin e I/O te makinave virtuale.'
            : 'Accelerates sync I/O for shared NFS/iSCSI datastores, eliminating VM disk freeze spikes during heavy write operations.',
      },
      arc: {
        sizing: lang === 'sq' ? '70% - 75% e RAM-it te serverit' : '70% - 75% of host physical RAM',
        tuning: 'zfs_arc_max=80GB, zfs_arc_min=16GB',
        reason:
          lang === 'sq'
            ? 'Keshon agresivisht metadhenat dhe faqet e nxehta te makinave virtuale te shume-perdoruesve.'
            : 'Aggressively caches hypervisor filesystem inodes and frequently referenced OS binaries.',
      },
      cache: {
        sizing: lang === 'sq' ? '8x deri 12x te RAM-it (1TB - 2TB NVMe)' : '8x to 12x of RAM (1TB - 2TB fast NVMe)',
        tuning: 'l2arc_write_max=400MB/s, l2arc_noprefetch=0',
        reason:
          lang === 'sq'
            ? 'Persistent L2ARC mban te dhenat ne NVMe edhe pas rindezjes se hostit, duke pershpejtuar nisjen e te gjitha makinave virtuale.'
            : 'Persistent L2ARC keeps boot image blocks cached across host reboots, eliminating morning VM boot storms.',
      },
      presetValues: { arcMax: 80, arcMin: 16, l2Write: 400, l2Prefetch: 0 },
    },
    {
      id: 'nas' as const,
      icon: Film,
      title: t('typology.nasTitle'),
      desc: t('typology.nasDesc'),
      color: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400',
      tag: 'NFS / SMB / 4K Video',
      specialVdev: {
        topology: 'Mirror NVMe (Kosto-efektive, p.sh. 2x 480GB)',
        blocks: 'special_small_blocks=0 ose 4K (VETEM METADATA)',
        reason:
          lang === 'sq'
            ? 'Duke vendosur special_small_blocks=0, Special VDEV mban VETEM metadhenat e skedareve (dnodes & directory trees). Lundrimi ne miliona skedare behet i menjehershem pa shpenzuar flash per video gigabajte.'
            : 'With special_small_blocks=0, the Special VDEV holds ONLY file metadata (dnodes & trees). Searching through millions of files is instantaneous without consuming flash for large multi-GB media files.',
      },
      slog: {
        topology: 'Opsional (vetem per NFS sync shares)',
        sizing: '16GB - 32GB',
        reason:
          lang === 'sq'
            ? 'Per transferime video me SMB (shkrime asinkrone), SLOG nuk perdoret. Nevojitet vetem nese klientet eksportojne permes NFS me sync=always.'
            : 'Standard SMB video file copies are asynchronous and bypass SLOG. Only needed if mounting via NFS with strict sync semantics.',
      },
      arc: {
        sizing: lang === 'sq' ? '50% - 65% e RAM-it te serverit' : '50% - 65% of host physical RAM',
        tuning: 'zfs_arc_max=32GB, zfs_arc_min=8GB',
        reason:
          lang === 'sq'
            ? 'Mjaftueshem per keshim te katalogut te skedareve dhe leximit te segmenteve video.'
            : 'Ample capacity to cache file share metadata and sequential streaming buffers.',
      },
      cache: {
        sizing: lang === 'sq' ? 'Opsional ose 500GB NVMe per Active Projects' : 'Optional or 500GB NVMe for active projects',
        tuning: 'l2arc_write_max=150MB/s, l2arc_noprefetch=0',
        reason:
          lang === 'sq'
            ? 'Per streaming te thjeshte sekuencial 1MB nuk nevojitet L2ARC masiv; rekomandohet me shume per timeline edits te perseritura.'
            : 'Pure sequential streaming bypasses cache cleanly; useful mainly when multiple editors playback identical project clips.',
      },
      presetValues: { arcMax: 32, arcMin: 8, l2Write: 150, l2Prefetch: 0 },
    },
    {
      id: 'general' as const,
      icon: Sparkles,
      title: t('typology.generalTitle'),
      desc: t('typology.generalDesc'),
      color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30 text-purple-400',
      tag: 'Standard Balanced',
      specialVdev: {
        topology: 'Mirror NVMe (2-way)',
        blocks: 'special_small_blocks=4K',
        reason:
          lang === 'sq'
            ? 'Alokon te gjitha metadhenat dhe skedaret e vegjel nen 4KB ne NVMe, duke ofruar balancim perfekt mes konsumimit te flash-it dhe pershpejtimit.'
            : 'Routes metadata and all files under 4KB to NVMe, providing an optimal balance between flash capacity usage and random latency reduction.',
      },
      slog: {
        topology: 'Mirror (2-way) me PLP NVMe',
        sizing: '32GB Flash',
        reason:
          lang === 'sq'
            ? 'Siguron mbrojtje te plote te transaksioneve te sistemit dhe fsync me latence sub-milisekond.'
            : 'Provides comprehensive system write log protection and sub-millisecond sync write completion.',
      },
      arc: {
        sizing: lang === 'sq' ? '60% - 70% e RAM-it te serverit' : '60% - 70% of host physical RAM',
        tuning: 'zfs_arc_max=64GB, zfs_arc_min=10GB',
        reason:
          lang === 'sq'
            ? 'Formula standarde e rekomanduar nga OpenZFS per servera storage multi-tenant.'
            : 'Standard OpenZFS production baseline for mixed enterprise workloads.',
      },
      cache: {
        sizing: lang === 'sq' ? '1TB NVMe Flash' : '1TB NVMe Flash',
        tuning: 'l2arc_write_max=250MB/s, l2arc_noprefetch=0',
        reason:
          lang === 'sq'
            ? 'Ruan jetegjatesine e SSD-se me limitim shkrimi 250MB/s ndersa ofron zgjerim komod te kujteses se leximit.'
            : 'Protects SSD write endurance while providing comfortable read buffer extension.',
      },
      presetValues: { arcMax: 64, arcMin: 10, l2Write: 250, l2Prefetch: 0 },
    },

  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Toast */}
      {presetToast && (
        <div className="fixed top-18 right-6 z-50 px-4 py-2.5 rounded-lg bg-emerald-950/95 border border-emerald-500/70 text-emerald-200 text-xs font-semibold shadow-2xl animate-in fade-in slide-in-from-top-2">
          {presetToast}
        </div>
      )}

      {/* Top Banner */}
      <div className="p-5 rounded-2xl bg-[#0c1326] border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>Linux Kernel ARC Engine (/proc/spl/kstat/zfs/arcstats)</span>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">{t('arc.title')}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{t('arc.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono shadow-sm">
            Hit Ratio: <strong className="text-emerald-400">{arc.hit_ratio}%</strong>
          </span>
          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-mono shadow-sm">
            L2ARC Hit: <strong className="text-sky-400">{arc.l2_hit_ratio}%</strong>
          </span>
        </div>
      </div>

      {/* 4 Telemetry Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">{t('arc.activeRam')}</span>
          <div className="text-xl font-bold font-mono text-white mt-1">{arcSizeGb} GiB</div>
          <span className="text-[11px] text-slate-500 font-mono">
            Tavan c_max: {arcMaxValGb} GiB
          </span>
        </div>

        {/* Metric 2 */}
        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">ARC HITS / MISSES</span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
            {arc.hits.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Misses: {arc.misses.toLocaleString()}
          </span>
        </div>

        {/* Metric 3 */}
        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">DATA VS METADATA</span>
          <div className="text-xl font-bold font-mono text-sky-300 mt-1">{dataGb} GiB</div>
          <span className="text-[11px] text-slate-500 font-mono">
            Metadata: {metaGb} GiB
          </span>
        </div>

        {/* Metric 4 */}
        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">{t('arc.l2arcStatus')}</span>
          <div className="text-xl font-bold font-mono text-indigo-300 mt-1">{l2SizeGb} GiB</div>
          <span className="text-[11px] text-slate-500 font-mono">
            Hits: {arc.l2_hits.toLocaleString()}
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION: WORKLOAD TYPOLOGY RECOMMENDATIONS (SPECIAL DEV, ARC & CACHE) */}
      {/* ============================================================== */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#090f20] border border-indigo-900/40 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>{t('typology.title')}</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-700/50">
                  Engineering Rules
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{t('typology.subtitle')}</p>
            </div>
          </div>

          {/* Quick tab switcher */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {typologies.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveProfileTab(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    activeProfileTab === item.id
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{item.tag}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Typology Full Breakdown Card */}
        {(() => {
          const current = typologies.find((tp) => tp.id === activeProfileTab) || typologies[0];
          const Icon = current.icon;

          return (
            <div className="space-y-4">
              {/* Header of active typology */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl border bg-gradient-to-br ${current.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{current.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{current.desc}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleApplyPreset(current.id)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/20 shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{t('typology.applyPreset')}</span>
                </button>
              </div>

              {/* 4 Pillars: Special DEV, ARC, SLOG ZIL, and L2ARC Cache */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* 1. Special VDEV Recommendation */}
                <div className="p-4 rounded-xl bg-[#060b17] border border-purple-900/40 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-400" />
                      Special DEV
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-400 border border-purple-800/40">
                      METADATA
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Topologjia e Kerkuar:</span>
                      <strong className="text-white font-mono text-xs block mt-0.5">
                        {current.specialVdev.topology}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Parametri ZFS i Madhesise:</span>
                      <code className="text-purple-300 bg-purple-950/80 px-2 py-0.5 rounded font-mono text-[11px] block mt-0.5 border border-purple-800/40 truncate">
                        {current.specialVdev.blocks}
                      </code>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans pt-1 border-t border-slate-800/80">
                      {current.specialVdev.reason}
                    </p>
                  </div>
                </div>

                {/* 2. ARC (RAM) Recommendation */}
                <div className="p-4 rounded-xl bg-[#060b17] border border-emerald-900/40 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-emerald-400" />
                      ARC Cache
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                      RAM L1
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Madhesia e Sugjeruar:</span>
                      <strong className="text-white font-mono text-xs block mt-0.5">
                        {current.arc.sizing}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Vlerat Optimale te Kernelit:</span>
                      <code className="text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded font-mono text-[11px] block mt-0.5 border border-emerald-800/40 truncate">
                        {current.arc.tuning}
                      </code>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans pt-1 border-t border-slate-800/80">
                      {current.arc.reason}
                    </p>
                  </div>
                </div>

                {/* 3. SLOG ZIL (Synchronous Write Accelerator) Recommendation */}
                <div className="p-4 rounded-xl bg-[#060b17] border border-amber-900/40 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      SLOG ZIL Log
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800/40">
                      SYNC WRITE
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Topologjia e Sugjeruar:</span>
                      <strong className="text-white font-mono text-xs block mt-0.5">
                        {current.slog.topology}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Madhesia e Nevojshme:</span>
                      <code className="text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded font-mono text-[11px] block mt-0.5 border border-amber-800/40 truncate">
                        {current.slog.sizing}
                      </code>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans pt-1 border-t border-slate-800/80">
                      {current.slog.reason}
                    </p>
                  </div>
                </div>

                {/* 4. Cache (L2ARC Flash) Recommendation */}
                <div className="p-4 rounded-xl bg-[#060b17] border border-sky-900/40 space-y-3 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-sky-400" />
                      L2ARC Cache
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/80 text-sky-400 border border-sky-800/40">
                      NVMe L2
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Raporti i Madhesise:</span>
                      <strong className="text-white font-mono text-xs block mt-0.5">
                        {current.cache.sizing}
                      </strong>
                    </div>

                    <div>
                      <span className="text-slate-400 block text-[11px]">Shkrimi & Prefetch:</span>
                      <code className="text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded font-mono text-[11px] block mt-0.5 border border-sky-800/40 truncate">
                        {current.cache.tuning}
                      </code>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed font-sans pt-1 border-t border-slate-800/80">
                      {current.cache.reason}
                    </p>
                  </div>
                </div>
              </div>

              {/* Engineering Warnings & Best Practice Boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 flex items-start gap-2.5 text-xs text-rose-300">
                  <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{t('typology.specialWarning')}</p>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 flex items-start gap-2.5 text-xs text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{t('typology.l2arcRamNote')}</p>
                </div>

                <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-900/40 flex items-start gap-2.5 text-xs text-sky-300">
                  <Zap className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{t('typology.slogWarning')}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Deep Dual-List Architecture: MFU vs MRU */}
      <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              Shperndarja Dinamike e Algoritmit: MFU vs MRU
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Megiddo & Modha Self-Tuning Cache
          </span>
        </div>

        {/* Visual Dual Bar */}
        <div className="space-y-2">
          <div className="h-3 w-full bg-slate-800 rounded-full flex overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all"
              style={{ width: `${mfuPct}%` }}
              title={`MFU: ${mfuPct}% (${mfuGb} GiB)`}
            />
            <div
              className="bg-sky-500 h-full transition-all"
              style={{ width: `${mruPct}%` }}
              title={`MRU: ${mruPct}% (${mruGb} GiB)`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono pt-1">
            <div className="p-3 rounded-lg bg-[#070d1c] border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-emerald-400 font-bold">MFU (Most Frequently Used)</span>
                <span className="text-white font-semibold">
                  {mfuGb} GiB ({mfuPct}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">
                {lang === 'sq'
                  ? 'Ruan blloqet që kërkohen me frekuencë më të lartë të vazhdueshme. Mbron të dhënat kritike të mos largohen nga memorja.'
                  : 'Retains persistently frequent blocks. Protects vital working sets and DB pages from eviction.'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#070d1c] border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-sky-400 font-bold">MRU (Most Recently Used)</span>
                <span className="text-white font-semibold">
                  {mruGb} GiB ({mruPct}%)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-sans">
                {lang === 'sq'
                  ? 'Ruan blloqet e lexuara së fundmi. Parandalon që skanime masive të fshijnë faqet e nxehta të databazave.'
                  : 'Caches recently read blocks. Prevents bursty sequential table scans from polluting hot caches.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Tuner Sliders & Kernel Config Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Sliders */}
        <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              Rregullimi i Parametrave ne Kohe Reale (Live Kernel Tuner)
            </h3>
          </div>

          <div className="space-y-4 text-xs">
            {/* ARC Max Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300 font-medium">Kufiri Maksimal ARC (zfs_arc_max):</span>
                <span className="text-sky-400 font-bold">{arcMaxGb} GiB</span>
              </div>
              <input
                type="range"
                min="4"
                max="256"
                step="4"
                value={arcMaxGb}
                onChange={(e) => setArcMaxGb(Number(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block">
                Rekomandohet 50% deri 75% e memories fizike RAM te serverit Linux.
              </span>
            </div>

            {/* ARC Min Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300 font-medium">Dyshemeja Minimale ARC (zfs_arc_min):</span>
                <span className="text-emerald-400 font-bold">{arcMinGb} GiB</span>
              </div>
              <input
                type="range"
                min="2"
                max="64"
                step="2"
                value={arcMinGb}
                onChange={(e) => setArcMinGb(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block">
                Kufiri nen te cilin ZFS nuk do ta tkurre kujtesen pavaresisht kerkesave te tjera.
              </span>
            </div>

            {/* L2ARC Write Max */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300 font-medium">{t('arc.l2WriteMax')}</span>
                <span className="text-amber-400 font-bold">{l2WriteMb} MB/s</span>
              </div>
              <input
                type="range"
                min="10"
                max="1000"
                step="25"
                value={l2WriteMb}
                onChange={(e) => setL2WriteMb(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500 block">
                {t('arc.l2WriteDesc')}
              </span>
            </div>

            {/* L2ARC Prefetch Toggle */}
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium block">
                {t('arc.l2Prefetch')}
              </label>
              <select
                value={l2Prefetch}
                onChange={(e) => setL2Prefetch(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono focus:border-sky-500 focus:outline-none"
              >
                <option value={0}>{t('arc.l2Prefetch0')}</option>
                <option value={1}>{t('arc.l2Prefetch1')}</option>
              </select>
            </div>

            {/* Apply Button */}
            <div className="pt-2 flex items-center justify-between">
              <div>
                {applySuccess && (
                  <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    {t('arc.appliedSuccess')}
                  </span>
                )}
              </div>
              <button
                onClick={handleApplyTunables}
                className="px-5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {t('arc.applyKernel')}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Modprobe.d Generator */}
        <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCode className="w-4 h-4 text-amber-400" />
                {t('arc.persistentConf')}
              </h3>
              <button
                onClick={handleCopyConf}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                {copiedConf ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                {copiedConf ? t('common.copied') : t('common.copy')}
              </button>
            </div>

            <p className="text-xs text-slate-300 mt-3 leading-relaxed">
              {t('arc.persistentDesc')}
            </p>

            <div className="mt-3 p-3 rounded-lg bg-[#050914] border border-slate-800 font-mono text-xs text-emerald-400 whitespace-pre overflow-x-auto">
              {modprobeConf}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/30 text-xs text-slate-300 space-y-2">
            <span className="text-sky-400 font-semibold block">{t('arc.executeShell')}</span>
            <code className="text-slate-200 font-mono block bg-black/40 p-1 rounded">
              sudo update-initramfs -u
            </code>
            <button
              onClick={handlePersistConf}
              disabled={persistState === 'running'}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white cursor-pointer"
            >
              {persistState === 'running'
                ? (lang === 'sq' ? 'Duke bërë backup dhe duke ekzekutuar...' : 'Backing up and running...')
                : (lang === 'sq' ? 'Backup dhe ekzekuto' : 'Back up and run')}
            </button>
            {persistMessage && (
              <p className={persistState === 'error' ? 'text-rose-300' : 'text-emerald-300'}>{persistMessage}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

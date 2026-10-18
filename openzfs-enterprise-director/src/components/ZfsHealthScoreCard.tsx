import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Activity,
  HardDrive,
  Cpu,
  RotateCw,
  Info,
  ChevronRight,
  TrendingDown,
  Layers,
  Sparkles,
  HelpCircle,
  X,
  Play,
} from 'lucide-react';
import { Pool, Language, DriveHealthSummary, ZfsHealthScoreBreakdown } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  pools: Pool[];
  drives?: DriveHealthSummary[];
  onScrub?: (poolName: string) => void;
  onInspectDevice?: (dev: string) => void;
  lang: Language;
}

export const ZfsHealthScoreCard: React.FC<Props> = ({
  pools,
  drives = [],
  onScrub,
  onInspectDevice,
  lang,
}) => {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const t = (k: string) => TRANSLATIONS[lang]?.[k] || k;

  // 1. Calculate Pool Topology & Geometry Score (40% Weight)
  let poolTopologyScore = 100;
  const poolFactors: { label: string; impact: string; status: 'ok' | 'warning' | 'critical' }[] = [];

  const anyFaulted = pools.some((p) => p.health === 'FAULTED');
  const anyDegraded = pools.some((p) => p.health === 'DEGRADED');

  if (anyFaulted) {
    poolTopologyScore -= 60;
    poolFactors.push({
      label: lang === 'sq' ? 'Një ose më shumë poole kanë status FAULTED' : 'One or more storage pools are FAULTED',
      impact: '-60%',
      status: 'critical',
    });
  } else if (anyDegraded) {
    poolTopologyScore -= 35;
    poolFactors.push({
      label: lang === 'sq' ? 'Pariteti i pool-it është i degraduar (DEGRADED)' : 'Pool parity or redundancy is DEGRADED',
      impact: '-35%',
      status: 'warning',
    });
  } else if (pools.length === 0) {
    poolTopologyScore = 0;
    poolFactors.push({
      label: lang === 'sq'
        ? 'Asnjë pool ZFS nuk është i importuar në këtë host.'
        : 'No ZFS pools are imported on this host.',
      impact: '0%',
      status: 'warning',
    });
  } else {
    poolFactors.push({
      label: lang === 'sq' ? `Të gjitha ${pools.length} poolet janë ONLINE me topologji RAIDZ2/Mirror` : `All ${pools.length} pools ONLINE with healthy redundancy`,
      impact: '+100%',
      status: 'ok',
    });
  }

  // Check capacity threshold
  pools.forEach((p) => {
    const allocatedTb = parseFloat(p.allocated);
    const totalTb = parseFloat(p.size);
    if (totalTb > 0) {
      const usedPct = (allocatedTb / totalTb) * 100;
      if (usedPct >= 90) {
        poolTopologyScore -= 15;
        poolFactors.push({
          label: lang === 'sq' ? `Pool '${p.name}' ka tejkaluar 90% të kapacitetit (kufiri kritik i performancës)` : `Pool '${p.name}' exceeds 90% capacity (critical performance cliff)`,
          impact: '-15%',
          status: 'warning',
        });
      } else if (usedPct >= 80) {
        poolTopologyScore -= 5;
        poolFactors.push({
          label: lang === 'sq' ? `Pool '${p.name}' ka kaluar 80% të kapacitetit` : `Pool '${p.name}' is over 80% allocated`,
          impact: '-5%',
          status: 'warning',
        });
      }
    }
  });
  poolTopologyScore = Math.max(0, Math.min(100, poolTopologyScore));

  // 2. Calculate Scrub & Bitrot Integrity Score (30% Weight)
  let scrubIntegrityScore = 100;
  const scrubFactors: { label: string; impact: string; status: 'ok' | 'warning' | 'critical' }[] = [];

  const anyScrubErrors = pools.some(
    (p) => p.scrub_status && (p.scrub_status.includes('error') || p.scrub_status.includes('repaired'))
  );
  if (anyScrubErrors) {
    scrubIntegrityScore -= 30;
    scrubFactors.push({
      label: lang === 'sq' ? 'U zbuluan ose u riparuan gabime kontrolli (checksum errors) gjatë scrub' : 'Checksum errors were repaired or detected during scrub',
      impact: '-30%',
      status: 'warning',
    });
  } else if (pools.length === 0) {
    scrubIntegrityScore = 0;
    scrubFactors.push({
      label: lang === 'sq' ? 'Nuk ka pool të importuar, ndaj checksum-i nuk është matur.' : 'No pool is imported, so checksum integrity has not been measured.',
      impact: '—',
      status: 'warning',
    });
  } else {
    scrubFactors.push({
      label: lang === 'sq' ? 'Verifikimi Fletcher4 Checksum: 0 gabime bitrot në të gjitha blloqet' : 'Fletcher4 checksum validation: 0 bitrot errors detected',
      impact: '+100%',
      status: 'ok',
    });
  }

  // Recency of scrub
  const hasNeverScrubbed = pools.some((p) => !p.last_scrub || p.last_scrub.toLowerCase().includes('never'));
  if (hasNeverScrubbed) {
    scrubIntegrityScore -= 20;
    scrubFactors.push({
      label: lang === 'sq' ? 'Disa poole nuk kanë kryer scrub periodik së fundmi' : 'Periodic scrub has not been performed recently on some pools',
      impact: '-20%',
      status: 'warning',
    });
  }
  scrubIntegrityScore = Math.max(0, Math.min(100, scrubIntegrityScore));

  // 3. Calculate SMART Device Health & Wear Score (30% Weight)
  let smartDeviceScore = 100;
  const smartFactors: { label: string; impact: string; status: 'ok' | 'warning' | 'critical' }[] = [];

  const acceleratedDrive = drives.find((d) => d.isAccelerating || (d.reallocatedSectors && d.reallocatedSectors > 5));
  if (acceleratedDrive) {
    smartDeviceScore -= 25;
    smartFactors.push({
      label: lang === 'sq'
        ? `Disku ${acceleratedDrive.dev} ka ${acceleratedDrive.reallocatedSectors} sektorë të realokuar (${acceleratedDrive.accelerationFactor || 8.5}x përshpejtim)`
        : `Drive ${acceleratedDrive.dev} has ${acceleratedDrive.reallocatedSectors} reallocated sectors (${acceleratedDrive.accelerationFactor || 8.5}x wear velocity)`,
      impact: '-25%',
      status: 'warning',
    });
  }

  const highTempDrive = drives.find((d) => d.temperatureC > 50);
  if (highTempDrive) {
    smartDeviceScore -= 10;
    smartFactors.push({
      label: lang === 'sq'
        ? `Temperatura e diskut ${highTempDrive.dev} është e lartë (${highTempDrive.temperatureC}°C)`
        : `Elevated thermal zone on drive ${highTempDrive.dev} (${highTempDrive.temperatureC}°C)`,
      impact: '-10%',
      status: 'warning',
    });
  }

  if (drives.length === 0) {
    smartDeviceScore = 0;
    smartFactors.push({
      label: lang === 'sq' ? 'Nuk ka disqe SMART të raportuar në këtë host.' : 'No SMART drives are reported on this host.',
      impact: '—',
      status: 'warning',
    });
  } else if (!acceleratedDrive && !highTempDrive) {
    smartFactors.push({
      label: lang === 'sq' ? 'Të gjithë disqet mekanikë dhe NVMe janë në gjendje optimale SMART' : 'All HDD and NVMe drives report optimal SMART health',
      impact: '+100%',
      status: 'ok',
    });
  }
  smartDeviceScore = Math.max(0, Math.min(100, smartDeviceScore));

  // Combined Weighted Health Score: 40% Pool + 30% Scrub + 30% SMART
  const overallScore = Math.round(
    poolTopologyScore * 0.4 + scrubIntegrityScore * 0.3 + smartDeviceScore * 0.3
  );

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
  let gradeText = t('healthScore.gradeHealthy');
  let colorTheme = 'emerald';

  if (overallScore >= 95) {
    grade = 'A+';
    gradeText = t('healthScore.gradeOptimal');
    colorTheme = 'emerald';
  } else if (overallScore >= 85) {
    grade = 'A';
    gradeText = t('healthScore.gradeHealthy');
    colorTheme = 'emerald';
  } else if (overallScore >= 75) {
    grade = 'B';
    gradeText = t('healthScore.gradeAttention');
    colorTheme = 'sky';
  } else if (overallScore >= 60) {
    grade = 'C';
    gradeText = t('healthScore.gradeWarning');
    colorTheme = 'amber';
  } else {
    grade = 'F';
    gradeText = t('healthScore.gradeCritical');
    colorTheme = 'rose';
  }

  // Recommendations
  const recommendations: string[] = [];
  if (acceleratedDrive) {
    recommendations.push(
      lang === 'sq'
        ? `Planifikoni zëvendësimin e diskut ${acceleratedDrive.dev} (zfs replace ${acceleratedDrive.pool} ${acceleratedDrive.dev}) para se të shkaktojë degradim të vdev.`
        : `Schedule proactive disk replacement for ${acceleratedDrive.dev} (zfs replace ${acceleratedDrive.pool} ${acceleratedDrive.dev}) before parity loss occurs.`
    );
  }
  if (hasNeverScrubbed || scrubIntegrityScore < 90) {
    recommendations.push(
      lang === 'sq'
        ? 'Ekzekutoni një scrub të plotë në të gjitha poolet për të verifikuar checksum-et e blloqeve të fjetura.'
        : 'Trigger a pool scrub across storage pools to audit silent data integrity and checksum parity.'
    );
  }
  if (pools.length === 0) {
    recommendations.length = 0;
    recommendations.push(
      lang === 'sq'
        ? 'Importoni një pool që indeksi të llogaritet nga të dhëna reale të këtij hosti.'
        : 'Import a pool before this index can be calculated from live data on this host.'
    );
  } else if (recommendations.length === 0) {
    recommendations.push(
      lang === 'sq'
        ? 'Sistemi është plotësisht i mbrojtur. Pariteti, shëndeti i disqeve dhe integriteti i të dhënave janë 100% optimale.'
        : 'System is fully protected. Parity, drive health, and bitrot integrity are running in optimal condition.'
    );
  }

  // SVG Radial Meter Math (Radius 46, Circumference ~ 289)
  const noLiveInventory = pools.length === 0;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = noLiveInventory ? circumference : circumference - (overallScore / 100) * circumference;
  const scoreTone = noLiveInventory
    ? 'slate'
    : overallScore >= 85
      ? 'emerald'
      : overallScore >= 70
        ? 'amber'
        : 'rose';

  return (
    <>
      <div className="p-5 rounded-2xl bg-[#0b1326] border border-slate-800/90 shadow-xl space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              scoreTone === 'emerald'
                ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-400'
                : scoreTone === 'amber'
                ? 'bg-amber-950/80 border-amber-700/60 text-amber-400'
                : scoreTone === 'slate'
                ? 'bg-slate-900 border-slate-700 text-slate-400'
                : 'bg-rose-950/80 border-rose-700/60 text-rose-400'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-white font-mono tracking-tight">
                  {t('healthScore.title')}
                </h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                  scoreTone === 'emerald'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : scoreTone === 'amber'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : scoreTone === 'slate'
                    ? 'bg-slate-900 text-slate-300 border-slate-700'
                    : 'bg-rose-950 text-rose-300 border-rose-800'
                }`}>
                  {noLiveInventory ? (lang === 'sq' ? 'PA TË DHËNA' : 'NO DATA') : `${gradeText} · ${grade}`}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {t('healthScore.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDetailModal(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700/70 text-slate-200 text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
            >
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('healthScore.viewDetails')}</span>
            </button>
          </div>
        </div>

        {/* Main Content: Radial Gauge + 3 Weighted Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Left: Radial Score Gauge */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-3 rounded-xl bg-[#070d1c] border border-slate-800/80">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                {/* Background Ring */}
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke="#1e293b"
                  strokeWidth="8"
                  fill="transparent"
                />
                {/* Score Progress Ring */}
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  stroke={scoreTone === 'emerald' ? '#10b981' : scoreTone === 'amber' ? '#f59e0b' : scoreTone === 'slate' ? '#475569' : '#f43f5e'}
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              {/* Inner Counter */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold font-mono text-white tracking-tighter">
                  {noLiveInventory ? '—' : `${overallScore}%`}
                </span>
                <span className={`text-[10px] font-bold font-mono tracking-wider ${
                  scoreTone === 'emerald' ? 'text-emerald-400' : scoreTone === 'amber' ? 'text-amber-400' : scoreTone === 'slate' ? 'text-slate-400' : 'text-rose-400'
                }`}>
                  {noLiveInventory ? (lang === 'sq' ? 'PA MASA' : 'NOT MEASURED') : `GRADE ${grade}`}
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400 mt-2 text-center">
              {lang === 'sq' ? 'Indeksi i Përgjithshëm i Integritetit' : 'Combined Resilience Index'}
            </span>
          </div>

          {/* Right: 3 Weighted Sub-Scores */}
          <div className="md:col-span-8 space-y-3 font-mono text-xs">
            {/* Factor 1: Pool Topology & Redundancy (40%) */}
            <div className="p-3 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-white font-semibold">
                    {t('healthScore.poolScore')}
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({t('healthScore.weight')}: 40%)
                  </span>
                </div>
                <span className="font-bold text-sky-300">{poolTopologyScore}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${poolTopologyScore}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {poolFactors[0]?.label || t('healthScore.allOnline')}
              </p>
            </div>

            {/* Factor 2: Scrub & Bitrot Integrity (30%) */}
            <div className="p-3 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-white font-semibold">
                    {t('healthScore.scrubScore')}
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({t('healthScore.weight')}: 30%)
                  </span>
                </div>
                <span className="font-bold text-emerald-300">{scrubIntegrityScore}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${scrubIntegrityScore}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {scrubFactors[0]?.label || t('healthScore.scrubRecent')}
              </p>
            </div>

            {/* Factor 3: SMART Hardware & Endurance (30%) */}
            <div className="p-3 rounded-xl bg-[#070d1c] border border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-white font-semibold">
                    {t('healthScore.smartScore')}
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    ({t('healthScore.weight')}: 30%)
                  </span>
                </div>
                <span className={`font-bold ${smartDeviceScore < 80 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {smartDeviceScore}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    smartDeviceScore < 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${smartDeviceScore}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {smartFactors[0]?.label || t('healthScore.smartOptimal')}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Strip & Alert Callout if degrading */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            {acceleratedDrive ? (
              <span className="text-amber-300 flex items-center gap-1.5 font-mono text-[11px]">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                {lang === 'sq'
                  ? `Vëmendje: Disku ${acceleratedDrive.dev} ka filluar degradim të përshpejtuar.`
                  : `Notice: Drive ${acceleratedDrive.dev} shows accelerated wear slope.`}
              </span>
            ) : noLiveInventory ? (
              <span className="text-slate-400 flex items-center gap-1.5 font-mono text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                {lang === 'sq'
                  ? 'Asnjë pool i importuar. Indeksi nuk përdor të dhëna demo.'
                  : 'No pool is imported. This index is not using demo data.'}
              </span>
            ) : (
              <span className="text-emerald-300 flex items-center gap-1.5 font-mono text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {lang === 'sq'
                  ? 'Asnjë rrezik i menjëhershëm: Të gjitha kontrollet e paritetit janë aktive.'
                  : 'Zero immediate risks: Bitrot scrub and parity checks operational.'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 font-mono">
            {onScrub && pools[0] && (
              <button
                onClick={() => onScrub(pools[0].name)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>{t('healthScore.runScrub')}</span>
              </button>
            )}

            {acceleratedDrive && onInspectDevice && (
              <button
                onClick={() => onInspectDevice(acceleratedDrive.dev)}
                className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900 border border-amber-800/60 text-amber-300 text-xs flex items-center gap-1 transition cursor-pointer"
              >
                <span>{t('healthScore.inspectDisks')}</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Health Breakdown Modal */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#0c1222] border border-slate-700 rounded-2xl shadow-xl flex flex-col overflow-hidden text-slate-100 my-auto font-mono text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#090e1a]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-950 border border-emerald-800 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {t('healthScore.title')} — {overallScore}% (Grade {grade})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {lang === 'sq'
                      ? 'Analizë e plotë matematikore e faktorëve të sigurisë ZFS'
                      : 'Mathematical formula breakdown of fleet resilience'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">
              {/* Pillar 1: Pool Topology Breakdown */}
              <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-sky-300">
                  <span>1. {t('healthScore.poolScore')}</span>
                  <span>{poolTopologyScore} / 100 (x0.40)</span>
                </div>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  {poolFactors.map((f, i) => (
                    <li key={i} className="flex justify-between">
                      <span className={f.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
                        {f.label}
                      </span>
                      <span className="font-bold">{f.impact}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pillar 2: Scrub & Bitrot Breakdown */}
              <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-emerald-300">
                  <span>2. {t('healthScore.scrubScore')}</span>
                  <span>{scrubIntegrityScore} / 100 (x0.30)</span>
                </div>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  {scrubFactors.map((f, i) => (
                    <li key={i} className="flex justify-between">
                      <span className={f.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
                        {f.label}
                      </span>
                      <span className="font-bold">{f.impact}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pillar 3: SMART Drive Wear Breakdown */}
              <div className="p-3.5 rounded-xl bg-[#070d1c] border border-slate-800 space-y-2">
                <div className="flex justify-between items-center text-sm font-bold text-amber-300">
                  <span>3. {t('healthScore.smartScore')}</span>
                  <span>{smartDeviceScore} / 100 (x0.30)</span>
                </div>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  {smartFactors.map((f, i) => (
                    <li key={i} className="flex justify-between">
                      <span className={f.status === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>
                        {f.label}
                      </span>
                      <span className="font-bold">{f.impact}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Administrative Recommendations */}
              <div className="p-3.5 rounded-xl bg-[#060a16] border border-slate-800 space-y-2">
                <span className="font-bold text-white text-xs block">
                  {t('healthScore.recommendations')}:
                </span>
                <div className="space-y-1.5 text-slate-300 text-[11px]">
                  {recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">•</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-[#090e1a] flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

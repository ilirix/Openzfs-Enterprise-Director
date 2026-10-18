import React, { useEffect, useState } from 'react';
import { AlertTriangle, Gauge } from 'lucide-react';
import { Language, ZfsArc } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';

const ARC_KEY = 'zfs_threshold_arc';
const CPU_KEY = 'zfs_threshold_cpu';

function label(lang: Language, key: string, fallback: string) {
  const value = TRANSLATIONS[lang]?.[key];
  return value && value !== key ? value : fallback;
}

export const AlertThresholdCard: React.FC<{ arc: ZfsArc; lang: Language }> = ({ arc, lang }) => {
  const [arcLimit, setArcLimit] = useState(() => Number(localStorage.getItem(ARC_KEY) || 80));
  const [cpuLimit, setCpuLimit] = useState(() => Number(localStorage.getItem(CPU_KEY) || 75));
  const [cpuPct, setCpuPct] = useState(0);

  useEffect(() => {
    localStorage.setItem(ARC_KEY, String(arcLimit));
    localStorage.setItem(CPU_KEY, String(cpuLimit));
    window.dispatchEvent(new Event('zfs-thresholds'));
  }, [arcLimit, cpuLimit]);

  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const sample = await zfsApi.getRealtimeTelemetry();
        if (!cancelled) setCpuPct(Number(sample.cpuPct) || 0);
      } catch {
        if (!cancelled) setCpuPct(0);
      }
    };
    pull();
    const timer = window.setInterval(pull, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const arcPct = arc.c_max > 0 ? Math.round((arc.size / arc.c_max) * 1000) / 10 : 0;
  const arcHot = arcPct >= arcLimit;
  const cpuHot = cpuPct >= cpuLimit;

  return (
    <section className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-sky-300" />
        <h2 className="text-sm font-semibold text-white">
          {label(lang, 'alerts.title', lang === 'sq' ? 'Pragje alarmi' : 'Alert thresholds')}
        </h2>
      </div>
      <p className="text-[11px] text-slate-400">
        {label(
          lang,
          'alerts.hint',
          lang === 'sq'
            ? 'Ruhet në këtë shfletues. Kartat bëhen të kuqe kur vlera e kalon pragun.'
            : 'Saved in this browser. Cards turn red when the live value crosses the limit.',
        )}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Threshold
          name={label(lang, 'alerts.arc', lang === 'sq' ? 'Përdorimi i ARC' : 'ARC usage')}
          value={`${arcPct.toFixed(1)}%`}
          limit={arcLimit}
          hot={arcHot}
          onChange={setArcLimit}
          exceeded={label(lang, 'alerts.exceeded', lang === 'sq' ? 'Mbi prag' : 'Above limit')}
          ok={label(lang, 'alerts.ok', lang === 'sq' ? 'Brenda pragut' : 'Within limit')}
        />
        <Threshold
          name={label(lang, 'alerts.cpu', lang === 'sq' ? 'Ngarkesa e CPU' : 'CPU load')}
          value={`${cpuPct.toFixed(1)}%`}
          limit={cpuLimit}
          hot={cpuHot}
          onChange={setCpuLimit}
          exceeded={label(lang, 'alerts.exceeded', lang === 'sq' ? 'Mbi prag' : 'Above limit')}
          ok={label(lang, 'alerts.ok', lang === 'sq' ? 'Brenda pragut' : 'Within limit')}
        />
      </div>
    </section>
  );
};

function Threshold({
  name,
  value,
  limit,
  hot,
  onChange,
  exceeded,
  ok,
}: {
  name: string;
  value: string;
  limit: number;
  hot: boolean;
  onChange: (value: number) => void;
  exceeded: string;
  ok: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${hot ? 'border-rose-500 bg-rose-950/40' : 'border-slate-800 bg-[#070d1c]'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-400 font-mono">{name}</span>
        {hot && <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />}
      </div>
      <div className={`text-2xl font-semibold font-mono tabular-nums ${hot ? 'text-rose-200' : 'text-white'}`}>{value}</div>
      <div className={`text-[10px] font-mono ${hot ? 'text-rose-300' : 'text-emerald-300'}`}>{hot ? exceeded : ok}</div>
      <label className="mt-2 flex items-center gap-2 text-[10px] font-mono text-slate-400">
        <span>{limit}%</span>
        <input
          type="range"
          min={1}
          max={100}
          value={limit}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-rose-400"
        />
      </label>
    </div>
  );
}

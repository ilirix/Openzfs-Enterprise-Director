import React, { useEffect, useState } from 'react';
import { Package, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Language, SystemPackageInfo } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';

interface Props {
  open: boolean;
  lang: Language;
  packages: SystemPackageInfo[];
  onClose: () => void;
  onInstalled: () => void;
}

export const PackageInstallModal: React.FC<Props> = ({
  open,
  lang,
  packages,
  onClose,
  onInstalled,
}) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [log, setLog] = useState('');

  useEffect(() => {
    setSelected(packages.filter((item) => !item.installed).map((item) => item.id));
    setMessage(null);
    setFailed(false);
    setLog('');
  }, [packages, open]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    setLog('');
    try {
      const jobId = await zfsApi.startPackageInstall(selected);
      for (;;) {
        const job = await zfsApi.getPackageInstall(jobId);
        setLog(job.log);
        if (job.done) {
          if (job.code !== 0) {
            setFailed(true);
            setMessage(t('packages.installFail'));
          } else {
            setMessage(t('packages.installOk'));
            onInstalled();
          }
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    } catch (err: unknown) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : t('packages.installFail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-[#0c1326] shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-800">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-950/70 text-amber-300 border border-amber-800/50">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">{t('packages.title')}</h2>
              <p className="text-[11px] text-slate-400 mt-1">{t('packages.subtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer" aria-label={t('common.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {packages.map((item) => {
            const descKey = `packages.desc.${item.id}`;
            const translated = t(descKey);
            const description = translated === descKey ? item.description : translated;
            return (
            <label
              key={item.id}
              className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${item.installed ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-slate-800 bg-[#070d1c]'} ${item.installed ? '' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={item.installed || selected.includes(item.id)}
                disabled={item.installed || busy}
                onChange={() => toggle(item.id)}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm text-white">
                  {item.label}
                  {item.required && !item.installed && (
                    <span className="text-[10px] font-mono text-amber-300">{t('packages.required')}</span>
                  )}
                  {item.installed && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300">
                      <CheckCircle2 className="w-3 h-3" />
                      {t('packages.installed')}
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-slate-400 mt-0.5">{description}</span>
              </span>
            </label>
            );
          })}
        </div>

        {(busy || log) && (
          <pre className="mx-5 mb-3 max-h-48 overflow-auto rounded-lg bg-black/70 border border-slate-800 p-3 text-[10px] leading-relaxed text-emerald-200/90 font-mono whitespace-pre-wrap">
            {log || (lang === 'sq' ? 'Duke pritur daljen e apt...' : 'Waiting for apt output...')}
          </pre>
        )}

        {message && (
          <div className={`mx-5 mb-2 rounded-lg px-3 py-2 text-[11px] font-mono flex items-start gap-2 ${failed ? 'bg-rose-950/50 text-rose-200' : 'bg-emerald-950/40 text-emerald-200'}`}>
            {failed ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            <span className="break-words">{message}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button type="button" onClick={onClose} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:bg-slate-800 cursor-pointer">
            {t('packages.skip')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || selected.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-40 cursor-pointer"
          >
            {busy ? t('packages.installing') : t('packages.install')}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  X,
  Zap,
  Cpu,
  Layers,
  Activity,
  Check,
  Bell,
  Globe,
  Sliders,
  Gauge,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  HardDrive,
  Info,
} from 'lucide-react';
import { useAppSettings } from '../context/AppSettingsContext';
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from '../i18n/translations';
import { Language } from '../types/zfs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onToggleLang?: () => void;
  onSelectLang?: (lang: Language) => void;
}

type TabType = 'gpu' | 'alerts' | 'general';

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  lang,
  onToggleLang,
  onSelectLang,
}) => {
  const t = (k: string) => TRANSLATIONS[lang]?.[k] || k;
  const { settings, updateSettings, workerStats, pingWorker } = useAppSettings();

  const [activeTab, setActiveTab] = useState<TabType>('gpu');
  const [pingResult, setPingResult] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  if (!isOpen) return null;

  const handlePing = async () => {
    setIsPinging(true);
    try {
      const ms = await pingWorker();
      setPingResult(ms);
      setTimeout(() => setPingResult(null), 4000);
    } catch (e) {
      console.error('Worker ping failed:', e);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0b1224] border border-slate-700 rounded-2xl shadow-xl flex flex-col overflow-hidden text-slate-200 my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-950 border border-sky-800 text-sky-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>{t('settings.title')}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-950 text-sky-300 border border-sky-800">
                  OpenZFS Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('settings.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label={t('settings.saveClose')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-2 gap-2 text-xs font-mono">
          <button
            onClick={() => setActiveTab('gpu')}
            className={`pb-2.5 px-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'gpu'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{t('settings.tabGpu')}</span>
            {settings.gpuOffload && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('alerts')}
            className={`pb-2.5 px-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'alerts'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>{t('settings.tabAlerts')}</span>
          </button>

          <button
            onClick={() => setActiveTab('general')}
            className={`pb-2.5 px-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'general'
                ? 'border-sky-500 text-sky-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{t('settings.tabGeneral')}</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* ======================================================== */}
          {/* TAB 1: GPU-OFFLOAD & PERFORMANCE ENGINE                  */}
          {/* ======================================================== */}
          {activeTab === 'gpu' && (
            <div className="space-y-4">
              {/* Master GPU-Offload Switch Card */}
              <div
                className={`p-4 rounded-xl border transition-colors ${
                  settings.gpuOffload
                    ? 'bg-sky-950/30 border-sky-600/80 ring-1 ring-sky-500/40'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg mt-0.5 ${
                        settings.gpuOffload
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          {t('settings.gpuOffloadTitle')}
                        </h3>
                        <span
                          className={`px-2 py-0.2 rounded text-[10px] font-mono font-bold uppercase border ${
                            settings.gpuOffload
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {settings.gpuOffload ? t('settings.gpuActive') : t('settings.gpuDisabled')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {t('settings.gpuOffloadDesc')}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={settings.gpuOffload}
                      onChange={(e) => updateSettings({ gpuOffload: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>
              </div>

              {/* Granular Engine Controls (rAF, Web Worker, Containment) */}
              <div className="space-y-3">
                {/* Option A: requestAnimationFrame VSync Alignment */}
                <div className="p-3 rounded-lg bg-[#070d1c] border border-slate-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Activity className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        {t('settings.rafTitle')}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                        {t('settings.rafDesc')}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      disabled={!settings.gpuOffload}
                      checked={settings.rafEnabled && settings.gpuOffload}
                      onChange={(e) => updateSettings({ rafEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                {/* Option B: Web Worker Telemetry Offload */}
                <div className="p-3 rounded-lg bg-[#070d1c] border border-slate-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Cpu className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        {t('settings.workerTitle')}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                        {t('settings.workerDesc')}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      disabled={!settings.gpuOffload}
                      checked={settings.workerOffload && settings.gpuOffload}
                      onChange={(e) => updateSettings({ workerOffload: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                {/* Option C: Hardware Paint Containment */}
                <div className="p-3 rounded-lg bg-[#070d1c] border border-slate-800 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Layers className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        {t('settings.paintTitle')}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                        {t('settings.paintDesc')}
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.paintContainment}
                      onChange={(e) => updateSettings({ paintContainment: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
              </div>

              {/* Live Web Worker Telemetry & Profiler Box */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-white font-mono">
                      {t('settings.profilerTitle')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40" />
                    <span className="text-emerald-400 font-bold">
                      {workerStats.workerOnline ? t('settings.workerOnline') : t('settings.workerInline')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="p-2 rounded bg-[#070d1c] border border-slate-800">
                    <span className="text-[10px] text-slate-500 block uppercase">
                      {t('settings.workerJobs')}
                    </span>
                    <span className="text-sm font-bold text-white mt-0.5 block">
                      {workerStats.jobsCount}
                    </span>
                    <span className="text-[9px] text-slate-400">{t('settings.offloadedTasks')}</span>
                  </div>

                  <div className="p-2 rounded bg-[#070d1c] border border-slate-800">
                    <span className="text-[10px] text-slate-500 block uppercase">
                      {t('settings.workerLatency')}
                    </span>
                    <span className="text-sm font-bold text-sky-300 mt-0.5 block">
                      {workerStats.avgProcessingTimeMs} ms
                    </span>
                    <span className="text-[9px] text-slate-400">{t('settings.workerExecution')}</span>
                  </div>

                  <div className="p-2 rounded bg-[#070d1c] border border-slate-800">
                    <span className="text-[10px] text-slate-500 block uppercase">
                      {t('settings.lastJob')}
                    </span>
                    <span className="text-sm font-bold text-emerald-400 mt-0.5 block">
                      {workerStats.lastJobTimeMs} ms
                    </span>
                    <span className="text-[9px] text-slate-400">{t('settings.microBench')}</span>
                  </div>

                  <div className="p-2 rounded bg-[#070d1c] border border-slate-800">
                    <span className="text-[10px] text-slate-500 block uppercase">
                      {t('settings.frameBudget')}
                    </span>
                    <span className="text-sm font-bold text-purple-300 mt-0.5 block">
                      16.6 ms
                    </span>
                    <span className="text-[9px] text-slate-400">{t('settings.fpsTarget')}</span>
                  </div>
                </div>

                {/* Worker Speed Benchmark Button */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={handlePing}
                    disabled={isPinging}
                    className="px-3 py-1.5 rounded-lg bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-200 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                    <span>{t('settings.benchmarkWorker')}</span>
                  </button>

                  {pingResult !== null && (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('settings.pingResult').replace('{ms}', String(pingResult))}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: SMART & DESKTOP ALERTS                            */}
          {/* ======================================================== */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                      {t('settings.smartTitle')}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {t('settings.smartDesc')}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.desktopAlerts}
                      onChange={(e) => updateSettings({ desktopAlerts: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 space-y-2">
                <div className="flex items-center justify-between text-slate-300">
                  <span>{t('settings.pollFreq')}</span>
                  <span className="font-bold text-white">{t('settings.pollEvery')}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>{t('settings.accelFactor')}</span>
                  <span className="font-bold text-rose-400">{t('settings.accelAbove')}</span>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: GENERAL SETTINGS                                  */}
          {/* ======================================================== */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Multi-Language Switcher */}
              <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-sky-400" />
                      <span>{t('settings.languageSelect')}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t('settings.langHint')}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                    {t('settings.langCount').replace('{n}', String(SUPPORTED_LANGUAGES.length))}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {SUPPORTED_LANGUAGES.map((l) => {
                    const isSelected = l.code === lang;
                    return (
                      <button
                        key={l.code}
                        onClick={() => {
                          if (onSelectLang) {
                            onSelectLang(l.code);
                          } else if (onToggleLang) {
                            onToggleLang();
                          }
                        }}
                        className={`p-2.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-sky-950/80 border-sky-500 text-white shadow-md shadow-sky-950'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base">{l.flag}</span>
                          <div className="truncate">
                            <span className="block text-xs font-semibold truncate">{l.native}</span>
                            <span className="block text-[10px] text-slate-500 font-mono">
                              {l.code.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto Open Info Box */}
              <div className="p-4 rounded-xl bg-[#070d1c] border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                    {t('settings.autoOpenTitle')}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('settings.autoOpenDesc')}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={settings.autoOpenInfo}
                    onChange={(e) => updateSettings({ autoOpenInfo: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="text-[11px] font-mono text-slate-500">
            {settings.gpuOffload ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>{t('settings.engineActive')}</span>
              </span>
            ) : (
              <span className="text-slate-400">{t('settings.engineStandard')}</span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs font-sans transition cursor-pointer"
          >
            {t('settings.saveClose')}
          </button>
        </div>
      </div>
    </div>
  );
};

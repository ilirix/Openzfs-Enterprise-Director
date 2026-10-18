import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, BookOpen, Wand2, Globe, Menu, Settings, Zap, Server, ChevronDown, Check } from 'lucide-react';
import { Language } from '../types/zfs';
import { TRANSLATIONS, SUPPORTED_LANGUAGES } from '../i18n/translations';
import { useAppSettings } from '../context/AppSettingsContext';

interface Props {
  activeTab: string;
  onRefresh: () => void;
  loading: boolean;
  onOpenInfo: (tabId: string) => void;
  onLaunchWizard: () => void;
  poolCount: number;
  lang: Language;
  onToggleLang?: () => void;
  onSelectLang?: (lang: Language) => void;
  onToggleMobileMenu?: () => void;
  onOpenSettings: () => void;
  onOpenHardwareInfo?: () => void;
  demoMode?: boolean;
  onToggleDemo?: () => void;
  onOpenPackages?: () => void;
  packagesMissing?: boolean;
}

export const Header: React.FC<Props> = ({
  activeTab,
  onRefresh,
  loading,
  onOpenInfo,
  onLaunchWizard,
  poolCount,
  lang,
  onToggleLang,
  onSelectLang,
  onToggleMobileMenu,
  onOpenSettings,
  onOpenHardwareInfo,
  demoMode = true,
  onToggleDemo,
  onOpenPackages,
  packagesMissing = false,
}) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const { settings } = useAppSettings();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close language menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    if (langMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [langMenuOpen]);

  const currentLangMeta = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  const getTabTitle = (tab: string) => {
    const navKey = `nav.${tab}`;
    const subKey = `nav.${tab}.sub`;
    if (TRANSLATIONS[lang]?.[navKey]) {
      return `${TRANSLATIONS[lang][navKey]} - ${TRANSLATIONS[lang][subKey] || ''}`;
    }
    switch (tab) {
      case 'dashboard':
        return t('dashboard.title');
      case 'pools':
        return t('pools.title');
      case 'datasets':
        return t('datasets.title');
      case 'arc':
        return t('arc.title');
      case 'snapshots':
        return t('snapshots.title');
      case 'wizard':
        return t('wizard.title');
      case 'reports':
        return t('reports.title');
      case 'terminal':
        return t('nav.terminal');
      case 'deployment':
        return t('nav.deployment');
      default:
        return 'OpenZFS Storage Director';
    }
  };

  const handleSelectLanguage = (newLang: Language) => {
    if (onSelectLang) {
      onSelectLang(newLang);
    } else if (onToggleLang) {
      onToggleLang();
    }
    setLangMenuOpen(false);
  };

  return (
    <header className="relative z-30 h-16 px-4 sm:px-6 bg-[#090e1c] border-b border-slate-800/80 flex items-center justify-between gap-3 sm:gap-6 shrink-0">
      {/* Zone 1: Mobile Hamburger & Breadcrumb & Title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <span className="hidden md:inline-block text-xs font-mono text-slate-500 uppercase tracking-wider shrink-0">
          ZFS Node 01
        </span>
        <span className="hidden md:inline-block text-slate-600">/</span>
        <h1 className="text-xs sm:text-sm font-semibold text-white truncate max-w-[160px] sm:max-w-none">
          {getTabTitle(activeTab)}
        </h1>
        <span className="hidden xl:inline-flex text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40 shrink-0">
          {poolCount} {poolCount === 1 ? t('header.poolActive') : t('header.poolsActive')}
        </span>

        {/* Hardware & Peripherals Live Status Header Pill */}
        {onOpenHardwareInfo && (
          <button
            onClick={onOpenHardwareInfo}
            className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-300 bg-sky-950/60 hover:bg-sky-900/70 px-2.5 py-1 rounded-lg border border-sky-800/50 transition cursor-pointer shrink-0"
            title={t('systemHardware.subtitle')}
          >
            <Server className="w-3.5 h-3.5 text-sky-400" />
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t('header.systemHardware')}</span>
          </button>
        )}

        {/* Clickable GPU-Offload Badge */}
        <button
          onClick={onOpenSettings}
          className="hidden 2xl:inline-flex items-center gap-1.5 text-[11px] font-mono text-sky-300 bg-sky-950/80 hover:bg-sky-900/80 px-2.5 py-1 rounded-lg border border-sky-700/60 transition cursor-pointer shrink-0"
          title={t('settings.gpuOffloadDesc')}
        >
          <Zap className="w-3 h-3 text-sky-400" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>
            {settings.gpuOffload ? 'GPU: Active (rAF + Worker)' : 'GPU: Standard'}
          </span>
        </button>
      </div>

      {/* Zone 2: Primary Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {onToggleDemo && (
          <button
            type="button"
            onClick={onToggleDemo}
            className={`px-2.5 py-1.5 text-[11px] font-mono font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
              demoMode
                ? 'text-amber-200 bg-amber-950/70 border-amber-700/70 hover:bg-amber-900/70'
                : 'text-emerald-200 bg-emerald-950/50 border-emerald-800/60 hover:bg-emerald-900/50'
            }`}
            title={demoMode ? t('demo.turnOff') : t('demo.turnOn')}
          >
            {demoMode
              ? (t('demo.statusOn') === 'demo.statusOn' ? (lang === 'sq' ? 'DEMO: NDEZUR' : 'DEMO: ON') : t('demo.statusOn'))
              : (t('demo.statusOff') === 'demo.statusOff' ? 'LIVE' : t('demo.statusOff'))}
          </button>
        )}
        {onOpenPackages && packagesMissing && (
          <button
            type="button"
            onClick={onOpenPackages}
            className="px-2.5 py-1.5 text-[11px] font-mono text-sky-200 bg-sky-950/60 border border-sky-800/60 rounded-lg hover:bg-sky-900/60 cursor-pointer whitespace-nowrap"
          >
            {t('packages.open')}
          </button>
        )}
        {/* Hardware & Peripherals Button for mobile/tablet */}
        {onOpenHardwareInfo && (
          <button
            onClick={onOpenHardwareInfo}
            className="lg:hidden p-2 text-sky-400 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-800/50 rounded-lg transition-colors cursor-pointer shrink-0"
            title={t('systemHardware.title')}
            aria-label={t('systemHardware.title')}
          >
            <Server className="w-4 h-4" />
          </button>
        )}

        {/* Interactive Multi-Language Dropdown Selector */}
        <div className="relative" ref={langMenuRef}>
          <button
            onClick={() => setLangMenuOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors cursor-pointer select-none"
            title={t('settings.languageSelect')}
          >
            <span className="text-sm leading-none">{currentLangMeta.flag}</span>
            <span className="font-mono uppercase font-bold text-[11px] hidden sm:inline">
              {currentLangMeta.code}
            </span>
            <span className="text-[11px] font-sans text-slate-300 hidden md:inline">
              {currentLangMeta.native}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Language Menu Dropdown */}
          {langMenuOpen && (
            <div
              className="absolute right-0 mt-1.5 w-52 bg-[#0c1222] border border-slate-700/90 rounded-xl shadow-2xl py-1 z-50 text-xs font-sans"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                {t('settings.languageSelect')}
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {SUPPORTED_LANGUAGES.map((l) => {
                  const isSelected = l.code === lang;
                  return (
                    <button
                      key={l.code}
                      onClick={() => handleSelectLanguage(l.code)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-800/80 transition-colors cursor-pointer ${
                        isSelected ? 'bg-sky-950/60 text-sky-300 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base">{l.flag}</span>
                        <div>
                          <span className="block text-xs text-white">{l.native}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {l.name} ({l.code.toUpperCase()})
                          </span>
                        </div>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Info Box Trigger Button */}
        <button
          onClick={() => onOpenInfo(activeTab)}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-sky-300 bg-sky-950/60 hover:bg-sky-900/60 border border-sky-800/50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          title={t('header.explainArch')}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('header.explainArch')}</span>
          <span className="sm:hidden">Info</span>
        </button>

        {/* Wizard Trigger */}
        <button
          onClick={onLaunchWizard}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/50 hover:bg-amber-900/50 border border-amber-800/40 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          title={t('header.wizardBtn')}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>{t('header.wizardBtn')}</span>
        </button>

        {/* Settings & GPU-Offload Modal Trigger */}
        <button
          onClick={onOpenSettings}
          className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
          title={t('header.settings')}
          aria-label={t('header.settings')}
        >
          <Settings className="w-4 h-4 text-slate-300 hover:text-sky-400 transition-colors" />
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
          title={t('common.refresh')}
          aria-label={t('common.refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-400' : ''}`} />
        </button>
      </div>
    </header>
  );
};

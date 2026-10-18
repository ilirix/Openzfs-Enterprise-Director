import React from 'react';
import {
  LayoutDashboard,
  HardDrive,
  FolderTree,
  Cpu,
  Camera,
  Wand2,
  BarChart3,
  Terminal,
  FolderArchive,
  Info,
  Power,
  RotateCw,
  Activity,
  Layers,
  Globe,
  X,
  ScrollText,
  Calendar,
  Server,
} from 'lucide-react';
import { ServiceStatus, Language } from '../types/zfs';
import { SshNodeRow } from './NodesView';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  onOpenInfo: (tabId: string) => void;
  serviceStatus?: ServiceStatus;
  isRealZfs: boolean;
  onServiceControl: (action: 'start' | 'stop' | 'restart') => void;
  autoOpenInfo: boolean;
  onToggleAutoOpenInfo: () => void;
  lang: Language;
  onToggleLang: () => void;
  onSelectLang?: (lang: Language) => void;
  onOpenHardwareInfo?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  sshNodes?: SshNodeRow[];
  activeNodeId?: string;
  localNodeName?: string;
  onSelectNode?: (id: string) => Promise<void>;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onSelectTab,
  onOpenInfo,
  serviceStatus,
  isRealZfs,
  onServiceControl,
  autoOpenInfo,
  onToggleAutoOpenInfo,
  lang,
  onToggleLang,
  onOpenHardwareInfo,
  mobileOpen = false,
  onCloseMobile,
  sshNodes = [],
  activeNodeId = 'local',
  localNodeName = 'localhost',
  onSelectNode,
}) => {
  const t = (key: string) => TRANSLATIONS[lang][key] || key;

  const menuItems = [
    {
      id: 'dashboard',
      label: t('nav.dashboard'),
      subtitle: t('nav.dashboard.sub'),
      icon: LayoutDashboard,
    },
    {
      id: 'pools',
      label: t('nav.pools'),
      subtitle: t('nav.pools.sub'),
      icon: HardDrive,
    },
    {
      id: 'datasets',
      label: t('nav.datasets'),
      subtitle: t('nav.datasets.sub'),
      icon: FolderTree,
    },
    {
      id: 'arc',
      label: t('nav.arc'),
      subtitle: t('nav.arc.sub'),
      icon: Cpu,
    },
    {
      id: 'snapshots',
      label: t('nav.snapshots'),
      subtitle: t('nav.snapshots.sub'),
      icon: Camera,
    },
    {
      id: 'wizard',
      label: t('nav.wizard'),
      subtitle: t('nav.wizard.sub'),
      icon: Wand2,
    },
    {
      id: 'reports',
      label: t('nav.reports'),
      subtitle: t('nav.reports.sub'),
      icon: BarChart3,
    },
    {
      id: 'scheduler',
      label: t('nav.scheduler'),
      subtitle: t('nav.scheduler.sub'),
      icon: Calendar,
    },
    {
      id: 'logs',
      label: t('nav.logs'),
      subtitle: t('nav.logs.sub'),
      icon: ScrollText,
    },
    {
      id: 'terminal',
      label: t('nav.terminal'),
      subtitle: t('nav.terminal.sub'),
      icon: Terminal,
    },
    {
      id: 'deployment',
      label: t('nav.deployment'),
      subtitle: t('nav.deployment.sub'),
      icon: FolderArchive,
    },
    {
      id: 'nodes',
      label: lang === 'sq' ? 'Nyjet SSH' : 'SSH nodes',
      subtitle: lang === 'sq' ? 'Lidh dhe menaxho nyje të tjera' : 'Connect and manage other nodes',
      icon: Server,
    },
  ];

  const handleMenuClick = (id: string) => {
    onSelectTab(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
    if (autoOpenInfo) {
      onOpenInfo(id);
    }
  };

  const sidebarContent = (
    <aside className="w-72 bg-[#080d1a] border-r border-slate-800/80 flex flex-col h-full shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/10">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>OpenZFS</span>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800/50">
                  Enterprise
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Linux Storage Director</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Language Switcher Button */}
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-mono text-slate-300 transition-colors cursor-pointer"
              title="Ndrysho Gjuhen / Switch Language"
            >
              <Globe className="w-3 h-3 text-sky-400" />
              <span className="uppercase font-bold">{lang}</span>
            </button>

            {/* Mobile Close Button */}
            {onCloseMobile && (
              <button
                onClick={onCloseMobile}
                className="lg:hidden p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                aria-label="Mbyll menune"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Auto Info Box Banner */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Info className="w-3 h-3 text-sky-400" />
            <span>{t('common.autoInfoBox')}</span>
          </span>
          <button
            onClick={onToggleAutoOpenInfo}
            className={`text-[9px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
              autoOpenInfo
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {autoOpenInfo ? 'Aktiv' : 'Manuale'}
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-800/80">
        <label className="text-[10px] text-slate-500 block mb-1">{lang === 'sq' ? 'Nyja aktive' : 'Active node'}</label>
        <select
          value={activeNodeId}
          onChange={(event) => onSelectNode?.(event.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white font-mono"
        >
          <option value="local">{localNodeName}</option>
          {sshNodes.map((node) => (
            <option key={node.id} value={node.id}>{node.name} · {node.host}</option>
          ))}
        </select>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => handleMenuClick(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-sky-600/15 text-white border border-sky-500/30 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-400'
                  }`}
                />
                <div className="flex-1 min-w-0 pr-5">
                  <div className="text-xs font-medium truncate">{item.label}</div>
                  <div className="text-[9px] text-slate-500 truncate">{item.subtitle}</div>
                </div>
              </button>

              {/* Dedicated Info Box Click Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenInfo(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? 'text-sky-400 hover:bg-sky-900/40'
                    : 'text-slate-600 hover:text-sky-400 hover:bg-slate-800'
                }`}
                title={`Info Box: ${item.label}`}
                aria-label={`Info Box: ${item.label}`}
              >
                <Info className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </nav>

      {/* Service Control & Daemon Status */}
      <div className="p-3 border-t border-slate-800/80 bg-[#060a14]">
        <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1 font-medium">
              <Activity className="w-3 h-3 text-emerald-400" />
              {t('common.daemonStatus')}
            </span>
            <span
              className={`font-mono text-[9px] px-1.5 py-0.2 rounded ${
                serviceStatus?.daemonActive
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                  : 'bg-rose-950 text-rose-400 border border-rose-800/40'
              }`}
            >
              {serviceStatus?.daemonActive ? t('common.online') : t('common.stopped')}
            </span>
          </div>

          <div className="text-slate-400 text-[9px] font-mono flex items-center justify-between">
            <span>PID: {serviceStatus?.pid || 14209}</span>
            <span>Uptime: {serviceStatus?.uptime || '—'}</span>
          </div>

          <div className="text-slate-400 text-[9px] flex items-center justify-between">
            <span>{t('common.engine')}:</span>
            <span className="text-emerald-400 font-mono">
              {serviceStatus?.rustServerAvailable ? 'Rust Axum (Ultra-Fast)' : 'Native'}
            </span>
          </div>

          {/* Quick Script Actions */}
          <div className="pt-1.5 border-t border-slate-800/80 grid grid-cols-3 gap-1">
            <button
              onClick={() => onServiceControl('start')}
              disabled={serviceStatus?.daemonActive}
              className={`py-1 text-[10px] font-medium rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                serviceStatus?.daemonActive
                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                  : 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300'
              }`}
              title="./zfs-mgr.sh start"
            >
              <Power className="w-2.5 h-2.5" />
              {t('common.start')}
            </button>
            <button
              onClick={() => onServiceControl('stop')}
              disabled={!serviceStatus?.daemonActive}
              className={`py-1 text-[10px] font-medium rounded flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                !serviceStatus?.daemonActive
                  ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                  : 'bg-rose-900/60 hover:bg-rose-800 text-rose-300'
              }`}
              title="./zfs-mgr.sh stop"
            >
              <Power className="w-2.5 h-2.5" />
              {t('common.stop')}
            </button>
            <button
              onClick={() => onServiceControl('restart')}
              className="py-1 text-[10px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center gap-0.5 cursor-pointer transition-colors"
              title="./zfs-mgr.sh restart"
            >
              <RotateCw className="w-2.5 h-2.5" />
              {t('common.restart')}
            </button>
          </div>
        </div>

        {/* Quick Hardware Inspector Link */}
        {onOpenHardwareInfo && (
          <button
            onClick={() => {
              onOpenHardwareInfo();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-sky-950/70 hover:bg-sky-900/80 border border-sky-800/50 text-sky-300 text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('header.systemHardware')}</span>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:flex h-full shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile & Tablet Off-Canvas Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Slide-in sidebar */}
          <div className="relative z-10 w-72 h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

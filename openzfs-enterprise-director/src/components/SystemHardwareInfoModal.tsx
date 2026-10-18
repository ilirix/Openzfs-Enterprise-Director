import React, { useState, useEffect } from 'react';
import {
  X,
  Cpu,
  Server,
  HardDrive,
  Layers,
  Thermometer,
  Zap,
  Activity,
  ShieldCheck,
  Check,
  Copy,
  Clock,
  Radio,
  Fan,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { SystemHardwareInfo, PeripheralDevice, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export const SystemHardwareInfoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  lang,
}) => {
  const [hardware, setHardware] = useState<SystemHardwareInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const t = (k: string) => TRANSLATIONS[lang]?.[k] || k;

  const loadHardwareInfo = async () => {
    setLoading(true);
    try {
      const data = await zfsApi.getSystemHardware();
      setHardware(data);
    } catch (err) {
      console.error('Failed to load system hardware info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHardwareInfo();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyJson = () => {
    if (!hardware) return;
    navigator.clipboard.writeText(JSON.stringify(hardware, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const peripherals = hardware?.peripherals || [];
  const filteredPeripherals = filterCategory === 'all'
    ? peripherals
    : peripherals.filter((p) => p.category.toLowerCase() === filterCategory.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[#0c1222] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 my-auto font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-[#090e1a]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-950 border border-sky-800 text-sky-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {t('systemHardware.title')}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
                  PCIe & HBA Bus
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-sans">
                {t('systemHardware.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadHardwareInfo}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title={t('common.refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Section 1: Host System & Kernel Information */}
          <div className="p-4 rounded-xl bg-[#080d1c] border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-sky-400" />
                {lang === 'sq' ? 'Arkitektura e Hostit & Kerneli ZFS' : 'Host Platform & Kernel Environment'}
              </span>
              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                0 ECC Memory Errors
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.hostname')}</span>
                <span className="text-white font-bold">{hardware?.hostname || 'storage-node01'}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.kernel')}</span>
                <span className="text-sky-300 font-bold truncate block">{hardware?.kernelVersion}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.zfsModule')}</span>
                <span className="text-emerald-400 font-bold block">{hardware?.zfsModuleVersion}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.cpu')}</span>
                <span className="text-white font-bold truncate block">{hardware?.cpuModel}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.cores')}</span>
                <span className="text-white font-bold">
                  {hardware?.cpuCores} Cores / {hardware?.cpuThreads} Threads (@ {hardware?.cpuFreqGhz} GHz)
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.loadAvg')}</span>
                <span className="text-amber-300 font-bold">
                  [{hardware?.cpuLoadAvg?.join(', ')}]
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.uptime')}</span>
                <span className="text-slate-200 font-bold">{hardware?.systemUptime}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.memory')}</span>
                <span className="text-white font-bold">
                  {hardware?.totalMemoryGb} GB DDR4 ECC (Free: {hardware?.freeMemoryGb} GB)
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#050814] border border-slate-800/80">
                <span className="text-slate-500 block text-[10px]">{t('systemHardware.motherboard')}</span>
                <span className="text-slate-300 font-bold truncate block">{hardware?.motherboard}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Chassis & Thermal Telemetry Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[#080d1c] border border-slate-800">
              <span className="text-slate-500 block text-[10px]">{t('systemHardware.intakeTemp')}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Thermometer className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-sm font-bold text-white">{hardware?.chassisThermal.intakeTempC}°C</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#080d1c] border border-slate-800">
              <span className="text-slate-500 block text-[10px]">{t('systemHardware.exhaustTemp')}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-sm font-bold text-white">{hardware?.chassisThermal.exhaustTempC}°C</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#080d1c] border border-slate-800">
              <span className="text-slate-500 block text-[10px]">{t('systemHardware.fanSpeed')}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Fan className="w-3.5 h-3.5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
                <span className="text-sm font-bold text-white">{hardware?.chassisThermal.fanRpmAvg} RPM</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#080d1c] border border-slate-800">
              <span className="text-slate-500 block text-[10px]">{t('systemHardware.psuLoad')}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-sm font-bold text-amber-300">{hardware?.chassisThermal.psuLoadWatts} W ({hardware?.chassisThermal.psuEfficiencyPct}% Eff)</span>
              </div>
            </div>
          </div>

          {/* Section 3: Installed Storage Controllers & Peripheral Devices */}
          <div className="p-4 rounded-xl bg-[#080d1c] border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  {t('systemHardware.peripherals')} ({filteredPeripherals.length})
                </span>
              </div>

              {/* Category Filter */}
              <div className="flex flex-wrap gap-1 bg-[#040814] p-1 rounded-lg border border-slate-800">
                {['all', 'hba', 'nvme_switch', 'nic', 'bmc', 'psu'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono transition cursor-pointer ${
                      filterCategory === cat
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Peripherals List */}
            <div className="space-y-3">
              {filteredPeripherals.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl bg-[#050814] border border-slate-800/80 space-y-2 hover:border-slate-700 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-sky-300 border border-slate-700">
                        {p.category}
                      </span>
                      <span className="font-bold text-white text-xs">{p.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.temperatureC && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Thermometer className="w-3 h-3 text-amber-400" />
                          {p.temperatureC}°C
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          p.status === 'ONLINE'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : p.status === 'STANDBY'
                            ? 'bg-sky-950 text-sky-400 border-sky-800'
                            : 'bg-rose-950 text-rose-400 border-rose-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
                    <div>
                      <span className="text-slate-500 block text-[10px]">{t('systemHardware.controller')}:</span>
                      <span className="text-slate-200">{p.model}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">{t('systemHardware.bus')}:</span>
                      <span className="text-slate-200">{p.busInterface}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">{t('systemHardware.linkSpeed')}:</span>
                      <span className="text-emerald-400">{p.linkSpeed}</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 font-sans border-t border-slate-800/60 pt-1.5">
                    {p.details}
                  </p>

                  {p.connectedDevices && p.connectedDevices.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[10px]">
                      <span className="text-slate-500">
                        {lang === 'sq' ? 'Pajisje të Lidhura:' : 'Connected Devices:'}
                      </span>
                      {p.connectedDevices.map((dev, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-mono"
                        >
                          {dev}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#090e1a] flex items-center justify-between">
          <button
            onClick={handleCopyJson}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? t('common.copied') : (lang === 'sq' ? 'Kopjo Telemetrinë JSON' : 'Copy JSON Telemetry')}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  FileJson,
  Download,
  Upload,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  Layers,
  Terminal,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCode,
  FolderArchive,
  Sparkles,
  ArrowRight,
  Database,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Pool, DiskItem, Language, ZfsPoolExportPackage, ZfsMultiPoolExportPackage } from '../types/zfs';
import { zfsApi } from '../services/zfsApi';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pools: Pool[];
  initialPoolName?: string;
  availableDisks?: DiskItem[];
  lang: Language;
  onPoolImported?: (poolName: string, message: string) => void;
}

export const ZfsPoolBackupModal: React.FC<Props> = ({
  isOpen,
  onClose,
  pools,
  initialPoolName,
  availableDisks = [],
  lang,
  onPoolImported,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const t = (key: string) => TRANSLATIONS[lang][key] || key;

  // Export State
  const [exportPoolTarget, setExportPoolTarget] = useState<string>(
    initialPoolName || pools[0]?.name || '__all__'
  );
  const [includeDatasets, setIncludeDatasets] = useState(true);
  const [includeSnapshots, setIncludeSnapshots] = useState(true);
  const [includeSchedules, setIncludeSchedules] = useState(true);
  const [includeCliCommands, setIncludeCliCommands] = useState(true);
  const [exportedData, setExportedData] = useState<any>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyCliSuccess, setCopyCliSuccess] = useState(false);
  const [showCliDrawer, setShowCliDrawer] = useState(true);

  // Import State
  const [importMode, setImportMode] = useState<'disaster_recovery' | 'clone'>('clone');
  const [rawJsonInput, setRawJsonInput] = useState('');
  const [parsedImportConfig, setParsedImportConfig] = useState<any>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [cloneAsName, setCloneAsName] = useState('');
  const [cloneMountPrefix, setCloneMountPrefix] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<any>(null);
  const [showJsonTextarea, setShowJsonTextarea] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset or sync when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialPoolName && pools.some((p) => p.name === initialPoolName)) {
        setExportPoolTarget(initialPoolName);
      } else if (pools.length > 0) {
        setExportPoolTarget(pools[0].name);
      }
      setImportSuccessResult(null);
      setDryRunResult(null);
    }
  }, [isOpen, initialPoolName, pools]);

  // Fetch or generate export whenever target pool or options change
  useEffect(() => {
    if (!isOpen || activeTab !== 'export') return;

    let isSubscribed = true;
    const fetchExport = async () => {
      setExportLoading(true);
      try {
        if (exportPoolTarget === '__all__') {
          const data = await zfsApi.exportAllPoolsConfig();
          if (isSubscribed) {
            setExportedData(data);
          }
        } else {
          const data = await zfsApi.exportPoolConfig(exportPoolTarget);
          if (isSubscribed) {
            // Filter options dynamically on client if toggled off
            const filtered = JSON.parse(JSON.stringify(data));
            if (!includeDatasets) filtered.datasets = [];
            if (!includeSnapshots) filtered.snapshots = [];
            if (!includeSchedules) delete filtered.scrubSchedules;
            if (!includeCliCommands) delete filtered.reconstructedCommands;
            setExportedData(filtered);
          }
        }
      } catch (err: any) {
        console.error('Failed to export pool config:', err);
      } finally {
        if (isSubscribed) setExportLoading(false);
      }
    };

    fetchExport();
    return () => {
      isSubscribed = false;
    };
  }, [isOpen, activeTab, exportPoolTarget, includeDatasets, includeSnapshots, includeSchedules, includeCliCommands]);

  if (!isOpen) return null;

  // Current selected pool details for export view
  const currentPool = pools.find((p) => p.name === exportPoolTarget);

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    if (!exportedData) return;
    navigator.clipboard.writeText(JSON.stringify(exportedData, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  // Copy Reconstructed CLI to clipboard
  const handleCopyCli = () => {
    if (!exportedData?.reconstructedCommands?.importInstruction) return;
    navigator.clipboard.writeText(exportedData.reconstructedCommands.importInstruction);
    setCopyCliSuccess(true);
    setTimeout(() => setCopyCliSuccess(false), 2500);
  };

  // Download JSON file
  const handleDownloadJson = () => {
    if (!exportedData) return;
    const filename =
      exportPoolTarget === '__all__'
        ? `zfs-all-pools-backup-${new Date().toISOString().slice(0, 10)}.json`
        : `zfs-pool-${exportPoolTarget}-config-${new Date().toISOString().slice(0, 10)}.json`;

    const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Parse raw JSON text or uploaded file
  const parseJsonContent = (text: string) => {
    setJsonError(null);
    setDryRunResult(null);
    setImportSuccessResult(null);
    try {
      const parsed = JSON.parse(text);
      let targetPoolObj = parsed.pool || (parsed.pools ? parsed.pools[0]?.pool : null);
      if (!targetPoolObj && parsed.name && parsed.vdevs) {
        targetPoolObj = parsed;
      }

      if (!targetPoolObj || !targetPoolObj.name) {
        setJsonError(
          lang === 'sq'
            ? 'Skedari nuk përmban një konfigurim të vlefshëm ZFS pool (mungon nyja pool.name).'
            : 'File does not contain a valid ZFS pool structure (missing pool.name).'
        );
        setParsedImportConfig(null);
        return;
      }

      setParsedImportConfig(parsed);
      const origName = targetPoolObj.name;
      setCloneAsName(`${origName}-clone`);
      setCloneMountPrefix(`/${origName}-clone`);
    } catch (e: any) {
      setJsonError(
        lang === 'sq'
          ? `Gabim sintakse në skedarin JSON: ${e.message}`
          : `JSON syntax error: ${e.message}`
      );
      setParsedImportConfig(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawJsonInput(content);
      parseJsonContent(content);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawJsonInput(content);
      parseJsonContent(content);
    };
    reader.readAsText(file);
  };

  // Pre-flight Dry Run check
  const handleDryRun = async () => {
    if (!parsedImportConfig) return;
    setImportLoading(true);
    setJsonError(null);
    try {
      const res = await zfsApi.importPoolConfig({
        config: parsedImportConfig,
        mode: importMode,
        cloneAsName: importMode === 'clone' ? cloneAsName : undefined,
        mountpointPrefix: importMode === 'clone' ? cloneMountPrefix : undefined,
        overwrite: overwriteExisting,
        dryRun: true,
      });
      setDryRunResult(res);
    } catch (err: any) {
      setJsonError(err.message || (lang === 'sq' ? 'Deshtoi verifikimi paraprak (Dry Run)' : 'Pre-check (dry run) failed'));
    } finally {
      setImportLoading(false);
    }
  };

  // Execute Import or Clone
  const handleExecuteImport = async () => {
    if (!parsedImportConfig) return;
    setImportLoading(true);
    setJsonError(null);
    try {
      const res = await zfsApi.importPoolConfig({
        config: parsedImportConfig,
        mode: importMode,
        cloneAsName: importMode === 'clone' ? cloneAsName : undefined,
        mountpointPrefix: importMode === 'clone' ? cloneMountPrefix : undefined,
        overwrite: overwriteExisting,
        dryRun: false,
      });

      setImportSuccessResult(res);
      if (onPoolImported) {
        onPoolImported(res.poolName, res.message);
      }
    } catch (err: any) {
      setJsonError(err.message || (lang === 'sq' ? 'Deshtoi importimi i konfigurimit te pool-it' : 'Pool configuration import failed'));
    } finally {
      setImportLoading(false);
    }
  };

  // Extracted preview pool in import tab
  const importTargetPool = parsedImportConfig?.pool || (parsedImportConfig?.pools ? parsedImportConfig.pools[0]?.pool : null) || parsedImportConfig;
  const isTargetPoolExisting = importTargetPool
    ? pools.some((p) => p.name.toLowerCase() === (importMode === 'clone' ? cloneAsName.toLowerCase() : importTargetPool.name?.toLowerCase()))
    : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#0b1220] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#080d19] border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-950/70 border border-sky-500/30 text-sky-400">
              <FileJson className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                {t('poolBackup.modalTitle')}
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
                  JSON v2.2
                </span>
              </h3>
              <p className="text-xs text-slate-400 line-clamp-1">
                {t('poolBackup.modalSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-[#0a0f1d] px-6">
          <button
            onClick={() => {
              setActiveTab('export');
              setImportSuccessResult(null);
            }}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs sm:text-sm cursor-pointer transition-colors ${
              activeTab === 'export'
                ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{t('poolBackup.tabExport')}</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-xs sm:text-sm cursor-pointer transition-colors ${
              activeTab === 'import'
                ? 'border-sky-500 text-sky-400 bg-sky-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>{t('poolBackup.tabImport')}</span>
            {parsedImportConfig && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* ========================================================================= */}
          {/* TAB 1: EXPORT CONFIGURATION */}
          {/* ========================================================================= */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              {/* Top Controls: Pool Selector & Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-[#070c18] border border-slate-800/80">
                {/* Pool Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block font-mono">
                    {t('poolBackup.selectPool')}
                  </label>
                  <select
                    value={exportPoolTarget}
                    onChange={(e) => setExportPoolTarget(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm rounded-lg px-3 py-2 cursor-pointer focus:outline-none focus:border-sky-500 font-mono"
                  >
                    {pools.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.size} - {p.health})
                      </option>
                    ))}
                    <option value="__all__">📦 {t('poolBackup.allPoolsBundle')}</option>
                  </select>

                  {currentPool && exportPoolTarget !== '__all__' && (
                    <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {currentPool.vdevs.length} VDEVs
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/40">
                        ashift={currentPool.ashift}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                        {currentPool.health}
                      </span>
                    </div>
                  )}
                </div>

                {/* Granular Options */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300 block font-mono">
                    {t('poolBackup.exportOptions')}
                  </span>
                  <div className="space-y-1.5 text-xs text-slate-300">
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={includeDatasets}
                        onChange={(e) => setIncludeDatasets(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                      />
                      <span>{t('poolBackup.includeDatasets')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={includeSnapshots}
                        onChange={(e) => setIncludeSnapshots(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                      />
                      <span>{t('poolBackup.includeSnapshots')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={includeSchedules}
                        onChange={(e) => setIncludeSchedules(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                      />
                      <span>{t('poolBackup.includeSchedules')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer hover:text-white">
                      <input
                        type="checkbox"
                        checked={includeCliCommands}
                        onChange={(e) => setIncludeCliCommands(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-0"
                      />
                      <span>{t('poolBackup.includeCommands')}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Download JSON & Copy */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-xs text-slate-400 font-mono">
                  {exportedData ? (
                    <span>
                      {lang === 'sq' ? 'Gati për shkarkim: ' : 'Ready to download: '}<strong className="text-slate-200">{Math.round(JSON.stringify(exportedData).length / 1024 * 10) / 10} KB</strong> JSON
                    </span>
                  ) : (
                    <span>{lang === 'sq' ? 'Duke përgatitur të dhënat e eksportit...' : 'Preparing export data...'}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJson}
                    disabled={!exportedData || exportLoading}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">{t('poolBackup.copied')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>{t('poolBackup.copyJson')}</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadJson}
                    disabled={!exportedData || exportLoading}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t('poolBackup.downloadJson')}</span>
                  </button>
                </div>
              </div>

              {/* Reconstructed CLI Commands Drawer */}
              {exportedData?.reconstructedCommands && (
                <div className="rounded-xl bg-[#060b16] border border-slate-800 overflow-hidden">
                  <div
                    onClick={() => setShowCliDrawer(!showCliDrawer)}
                    className="flex items-center justify-between px-4 py-2.5 bg-slate-900/80 cursor-pointer hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-slate-300">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <span>{t('poolBackup.reconstructedCli')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyCli();
                        }}
                        className="px-2 py-0.5 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono flex items-center gap-1"
                      >
                        {copyCliSuccess ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copyCliSuccess ? 'Copied' : 'Copy Bash'}</span>
                      </button>
                      {showCliDrawer ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>

                  {showCliDrawer && (
                    <div className="p-3 text-[11px] font-mono text-emerald-400/90 bg-[#040810] overflow-x-auto max-h-48 border-t border-slate-800/80 space-y-1">
                      <pre className="whitespace-pre-wrap">{exportedData.reconstructedCommands.importInstruction}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* JSON Live Viewer */}
              <div className="rounded-xl bg-[#040711] border border-slate-800 overflow-hidden">
                <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase text-slate-400">
                    {lang === 'sq' ? 'Struktura e Skedarit JSON (ZFS Backup Specification)' : 'JSON File Structure (ZFS Backup Specification)'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    formatVersion: openzfs-v2.2-export/1.0
                  </span>
                </div>
                <div className="p-4 max-h-72 overflow-auto font-mono text-xs text-sky-300/90 bg-[#030610]">
                  {exportLoading ? (
                    <div className="flex items-center justify-center py-10 text-slate-500 text-xs font-mono">
                      <RotateCcw className="w-4 h-4 animate-spin mr-2" />
                      {lang === 'sq' ? 'Duke gjeneruar paketën JSON...' : 'Generating JSON package...'}
                    </div>
                  ) : exportedData ? (
                    <pre className="whitespace-pre-wrap">{JSON.stringify(exportedData, null, 2)}</pre>
                  ) : (
                    <div className="text-slate-500">{lang === 'sq' ? 'Nuk ka të dhëna për të shfaqur.' : 'No data to show.'}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: IMPORT & DISASTER RECOVERY / ENVIRONMENT CLONING */}
          {/* ========================================================================= */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* Success Notification if just imported */}
              {importSuccessResult && (
                <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-600/50 text-emerald-200 space-y-2 animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span className="text-sm font-semibold">{importSuccessResult.message}</span>
                  </div>
                  <div className="text-xs font-mono text-emerald-300/90 pl-7 space-y-1">
                    <div>{lang === 'sq' ? 'Pool-i:' : 'Pool:'} <strong>{importSuccessResult.poolName}</strong> ({importSuccessResult.summary?.estimatedSize})</div>
                    {lang === 'sq' ? (
                      <div>Hierarkia e krijuar: <strong>{importSuccessResult.datasetsCreated} datasets</strong> dhe të gjitha vetitë ZFS janë aktive.</div>
                    ) : (
                      <div>Hierarchy created: <strong>{importSuccessResult.datasetsCreated} datasets</strong>, all ZFS properties are active.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Error Notification if any */}
              {jsonError && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{jsonError}</span>
                </div>
              )}

              {/* File Dropzone & Upload */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-sky-400 bg-sky-950/40 text-white'
                    : parsedImportConfig
                    ? 'border-emerald-600/60 bg-emerald-950/10 hover:border-emerald-500'
                    : 'border-slate-700 bg-[#070c18] hover:border-slate-500'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center gap-2">
                  {parsedImportConfig ? (
                    <>
                      <div className="p-3 rounded-full bg-emerald-950/80 border border-emerald-600/40 text-emerald-400">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-emerald-300">
                        {t('poolBackup.validJson')}
                      </span>
                      <p className="text-xs text-slate-400 font-mono">
                        {lang === 'sq' ? 'Burimi: Pool' : 'Source: pool'} <strong>{importTargetPool?.name}</strong> · {lang === 'sq' ? 'Madhësia:' : 'Size:'} <strong>{importTargetPool?.size}</strong> · VDEVs: <strong>{importTargetPool?.vdevs?.length || 1}</strong>
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="p-3 rounded-full bg-sky-950/60 border border-sky-600/30 text-sky-400">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-slate-200">
                        {t('poolBackup.dropOrBrowse')}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        {lang === 'sq' ? 'Mbështet paketa të eksportuara nga OpenZFS Enterprise Manager (.json)' : 'Accepts packages exported by OpenZFS Enterprise Manager (.json)'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Toggle manual JSON paste editor */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowJsonTextarea(!showJsonTextarea)}
                  className="text-xs text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 cursor-pointer"
                >
                  <span>{showJsonTextarea ? 'Fshih tekstin JSON' : t('poolBackup.orPasteJson')}</span>
                  {showJsonTextarea ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showJsonTextarea && (
                  <div className="mt-2">
                    <textarea
                      rows={5}
                      value={rawJsonInput}
                      onChange={(e) => {
                        setRawJsonInput(e.target.value);
                        parseJsonContent(e.target.value);
                      }}
                      placeholder={lang === 'sq' ? 'Ngjit përmbajtjen e skedarit JSON këtu...' : 'Paste the JSON file content here...'}
                      className="w-full bg-[#050914] border border-slate-700 rounded-lg p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                )}
              </div>

              {/* Parsed Package Configuration Settings */}
              {parsedImportConfig && (
                <div className="space-y-4 pt-2">
                  {/* Mode Selector Cards */}
                  <div className="space-y-2">
                    <label className="text-xs font-mono font-semibold uppercase text-slate-400 block">
                      {t('poolBackup.importMode')}
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Mode A: Disaster Recovery */}
                      <div
                        onClick={() => setImportMode('disaster_recovery')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          importMode === 'disaster_recovery'
                            ? 'border-rose-500/80 bg-rose-950/20 text-white shadow-lg shadow-rose-950/30'
                            : 'border-slate-800 bg-[#070c18] text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-rose-300">
                          <ShieldCheck className="w-4 h-4 text-rose-400" />
                          <span>{t('poolBackup.modeDr')}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {t('poolBackup.modeDrDesc')}
                        </p>
                      </div>

                      {/* Mode B: Environment Clone */}
                      <div
                        onClick={() => setImportMode('clone')}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          importMode === 'clone'
                            ? 'border-sky-500/80 bg-sky-950/20 text-white shadow-lg shadow-sky-950/30'
                            : 'border-slate-800 bg-[#070c18] text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm text-sky-300">
                          <Layers className="w-4 h-4 text-sky-400" />
                          <span>{t('poolBackup.modeClone')}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {t('poolBackup.modeCloneDesc')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Settings Specific to Clone Mode */}
                  {importMode === 'clone' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#080d1a] border border-slate-800">
                      <div>
                        <label className="text-xs font-mono text-slate-300 block mb-1">
                          {t('poolBackup.clonePoolName')}
                        </label>
                        <input
                          type="text"
                          value={cloneAsName}
                          onChange={(e) => setCloneAsName(e.target.value)}
                          placeholder={lang === 'sq' ? 'p.sh. tank-enterprise-clone' : 'e.g. tank-enterprise-clone'}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-mono text-slate-300 block mb-1">
                          {t('poolBackup.cloneMountPrefix')}
                        </label>
                        <input
                          type="text"
                          value={cloneMountPrefix}
                          onChange={(e) => setCloneMountPrefix(e.target.value)}
                          placeholder={lang === 'sq' ? 'p.sh. /tank-enterprise-clone' : 'e.g. /tank-enterprise-clone'}
                          className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Disaster Recovery Overwrite checkbox if conflict */
                    isTargetPoolExisting && (
                      <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs space-y-2">
                        <div className="flex items-center gap-2 font-semibold">
                          <AlertTriangle className="w-4 h-4 text-amber-400" />
                          <span>{t('poolBackup.conflictWarning')}</span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer text-slate-200">
                          <input
                            type="checkbox"
                            checked={overwriteExisting}
                            onChange={(e) => setOverwriteExisting(e.target.checked)}
                            className="rounded border-amber-700 bg-slate-900 text-amber-500 focus:ring-0"
                          />
                          <span>{t('poolBackup.overwriteExisting')}</span>
                        </label>
                      </div>
                    )
                  )}

                  {/* Pre-flight Dry Run Summary */}
                  {dryRunResult && (
                    <div className="p-4 rounded-xl bg-[#050914] border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-sky-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          {lang === 'sq' ? 'Verifikimi Paraprak (Dry Run): OK' : 'Pre-check (dry run): OK'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Target: {dryRunResult.summary?.targetName}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">VDEVs</span>
                          <span className="text-white font-semibold">{dryRunResult.summary?.vdevCount}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">Datasets</span>
                          <span className="text-sky-300 font-semibold">{dryRunResult.summary?.datasetCount}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">{lang === 'sq' ? 'Disqet' : 'Disks'}</span>
                          <span className="text-emerald-300 font-semibold">{dryRunResult.summary?.diskCount}</span>
                        </div>
                        <div className="p-2 rounded bg-slate-900/80 border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">{lang === 'sq' ? 'Kapaciteti' : 'Capacity'}</span>
                          <span className="text-white font-semibold">{dryRunResult.summary?.estimatedSize}</span>
                        </div>
                      </div>

                      {dryRunResult.summary?.commandPreview && (
                        <div className="pt-2">
                          <span className="text-[10px] font-mono text-slate-400 block mb-1">
                            {lang === 'sq' ? 'Komanda e rikonstruktuar që do të ekzekutohet:' : 'Reconstructed command that will run:'}
                          </span>
                          <div className="p-2 rounded bg-[#030610] text-[11px] font-mono text-emerald-400 overflow-x-auto border border-slate-800">
                            {dryRunResult.summary.commandPreview}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Buttons: Validate (Dry Run) & Execute */}
                  <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDryRun}
                      disabled={importLoading || !parsedImportConfig}
                      className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {importLoading ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5 text-sky-400" />}
                      <span>{t('poolBackup.validateBtn')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExecuteImport}
                      disabled={importLoading || !parsedImportConfig || (isTargetPoolExisting && !overwriteExisting && importMode === 'disaster_recovery')}
                      className={`px-5 py-2 text-xs font-semibold rounded-lg text-white shadow-lg flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 ${
                        importMode === 'disaster_recovery'
                          ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                          : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                      }`}
                    >
                      {importLoading ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          <span>{t('poolBackup.executing')}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>{t('poolBackup.executeImport')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#080d19] border-t border-slate-800 text-xs text-slate-500 font-mono">
          <span>OpenZFS Disaster Recovery & Environment Cloning Engine</span>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-sans transition-colors cursor-pointer"
          >
            {lang === 'sq' ? 'Mbyll (Close)' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

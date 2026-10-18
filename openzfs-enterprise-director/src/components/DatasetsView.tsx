import React, { useState } from 'react';
import {
  FolderTree,
  Plus,
  Settings2,
  Trash2,
  Database,
  Lock,
  Layers,
  Check,
  HardDrive,
  Sliders,
  Info,
} from 'lucide-react';
import { Dataset, Pool, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  datasets: Dataset[];
  pools: Pool[];
  onCreateDataset: (data: Partial<Dataset>) => void;
  onUpdateDataset: (name: string, properties: Record<string, string>) => void;
  onDestroyDataset: (name: string) => void;
  lang?: Language;
  onRequestDangerConfirm?: (data: {
    type: 'delete_pool' | 'delete_dataset' | 'delete_device' | 'modify_device' | 'modify_property';
    targetName: string;
    details?: string;
    onConfirm: () => void;
  }) => void;
}

export const DatasetsView: React.FC<Props> = ({
  datasets,
  pools,
  onCreateDataset,
  onUpdateDataset,
  onDestroyDataset,
  lang = 'sq',
  onRequestDangerConfirm,
}) => {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(datasets[0] || null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const t = (key: string) => TRANSLATIONS[lang][key] || key;

  // Edit form state
  const [editCompression, setEditCompression] = useState('');
  const [editRecordsize, setEditRecordsize] = useState('');
  const [editQuota, setEditQuota] = useState('');
  const [editAtime, setEditAtime] = useState('');
  const [editDedup, setEditDedup] = useState('');
  const [editReadonly, setEditReadonly] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Create form state
  const [newParentPool, setNewParentPool] = useState(pools[0]?.name || '');
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newType, setNewType] = useState<'filesystem' | 'volume'>('filesystem');
  const [newPreset, setNewPreset] = useState('general');
  const [newCompression, setNewCompression] = useState('zstd');
  const [newRecordsize, setNewRecordsize] = useState('128K');
  const [newVolsize, setNewVolsize] = useState('50G');
  const [newQuota, setNewQuota] = useState('none');

  // When selected dataset changes, populate edit fields
  React.useEffect(() => {
    if (!datasets.some((dataset) => dataset.name === selectedDataset?.name)) {
      setSelectedDataset(datasets[0] || null);
    }
    if (!pools.some((pool) => pool.name === newParentPool)) {
      setNewParentPool(pools[0]?.name || '');
    }
  }, [datasets, pools, selectedDataset, newParentPool]);

  React.useEffect(() => {
    if (selectedDataset) {
      setEditCompression(selectedDataset.compression);
      setEditRecordsize(selectedDataset.recordsize);
      setEditQuota(selectedDataset.quota);
      setEditAtime(selectedDataset.atime);
      setEditDedup(selectedDataset.dedup);
      setEditReadonly(selectedDataset.readonly);
    }
  }, [selectedDataset]);

  const handleApplyPreset = (preset: string) => {
    setNewPreset(preset);
    if (preset === 'database') {
      setNewRecordsize('16K');
      setNewCompression('lz4');
    } else if (preset === 'vm') {
      setNewType('volume');
      setNewRecordsize('8K');
      setNewCompression('lz4');
    } else if (preset === 'media') {
      setNewType('filesystem');
      setNewRecordsize('1M');
      setNewCompression('zstd-3');
    } else {
      setNewType('filesystem');
      setNewRecordsize('128K');
      setNewCompression('zstd');
    }
  };

  const handleSaveProperties = () => {
    if (!selectedDataset) return;
    onUpdateDataset(selectedDataset.name, {
      compression: editCompression,
      recordsize: editRecordsize,
      quota: editQuota,
      atime: editAtime,
      dedup: editDedup,
      readonly: editReadonly,
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDatasetName.trim() || !newParentPool) return;

    const fullName = `${newParentPool}/${newDatasetName.trim()}`;
    onCreateDataset({
      name: fullName,
      type: newType,
      compression: newCompression,
      recordsize: newRecordsize,
      quota: newQuota,
      atime: 'off',
      dedup: 'off',
      volsize: newType === 'volume' ? newVolsize : undefined,
    });

    setShowCreateModal(false);
    setNewDatasetName('');
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0c1326] border border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-600/30 text-indigo-400">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono">Hierarkia e Skedareve & Vetimeve</div>
            <h2 className="text-sm font-bold text-white">
              OpenZFS Filesystems & Virtual Volumes (ZVOL)
            </h2>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('datasets.createBtn')}
        </button>
      </div>

      {/* Main 2-Column Split: Dataset Browser + Inline Property Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Datasets List */}
        <div className="lg:col-span-1 p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <span className="text-xs font-semibold uppercase text-slate-400 font-mono">
                {t('datasets.list')} ({datasets.length})
              </span>
              <span className="text-[10px] text-slate-500 font-mono">ZFS Tree</span>
            </div>

            <div className="mt-3 space-y-2 max-h-[550px] overflow-y-auto">
              {datasets.length === 0 && (
                <p className="text-[11px] font-mono text-slate-500 px-1 py-3">
                  {lang === 'sq' ? 'Asnjë dataset live. DEMO është i fikur ose nuk ka pool të importuar.' : 'No live datasets. DEMO is off or no pool is imported.'}
                </p>
              )}
              {datasets.map((d) => {
                const isSelected = selectedDataset?.name === d.name;
                const isVolume = d.type === 'volume';
                return (
                  <button
                    key={d.name}
                    onClick={() => setSelectedDataset(d)}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500/50 text-white'
                        : 'bg-[#070d1c] border-slate-800/80 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono truncate">{d.name}</span>
                      <span
                        className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                          isVolume
                            ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                            : 'bg-indigo-950 text-indigo-400 border border-indigo-800/40'
                        }`}
                      >
                        {d.type}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1.5">
                      <span>Perdorur: {d.used}</span>
                      <span>Comp: {d.compression} ({d.compressratio})</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#070c18] border border-slate-800 text-[11px] text-slate-400">
            <span>Zgjidh nje dataset per te modifikuar vetite ne kohe reale.</span>
          </div>
        </div>

        {/* Right: Property Inspector & Modifier */}
        {selectedDataset ? (
          <div className="lg:col-span-2 p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <div>
                <span className="text-xs text-indigo-400 font-mono font-semibold uppercase">
                  Vetite e Dataset-it
                </span>
                <h3 className="text-base font-bold text-white font-mono mt-0.5">
                  {selectedDataset.name}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">
                  Mount: {selectedDataset.mountpoint}
                </span>
                <button
                  onClick={() => {
                    if (onRequestDangerConfirm) {
                      onRequestDangerConfirm({
                        type: 'delete_dataset',
                        targetName: selectedDataset.name,
                        details: `Mountpoint: ${selectedDataset.mountpoint} · Used: ${selectedDataset.used} · Compression: ${selectedDataset.compression}`,
                        onConfirm: () => onDestroyDataset(selectedDataset.name),
                      });
                    } else {
                      onDestroyDataset(selectedDataset.name);
                    }
                  }}
                  className="p-1.5 text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                  title="Fshi Dataset-in (zfs destroy)"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#070d1c] border border-slate-800">
                <span className="text-slate-500 block text-[10px]">HAPESIRA USED</span>
                <span className="text-white font-bold">{selectedDataset.used}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#070d1c] border border-slate-800">
                <span className="text-slate-500 block text-[10px]">E DISPONUESHME</span>
                <span className="text-slate-300 font-bold">{selectedDataset.avail}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#070d1c] border border-slate-800">
                <span className="text-slate-500 block text-[10px]">RAPORTI I KOMPRESIMIT</span>
                <span className="text-emerald-400 font-bold">{selectedDataset.compressratio}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#070d1c] border border-slate-800">
                <span className="text-slate-500 block text-[10px]">ENKRIPTIMI</span>
                <span className="text-sky-300 font-bold">{selectedDataset.encryption}</span>
              </div>
            </div>

            {/* Editable Properties Grid */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Modifiko Parametrat ZFS (Live Property Tuning)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Compression */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Algoritmi i Kompresimit (compression):</label>
                  <select
                    value={editCompression}
                    onChange={(e) => setEditCompression(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="zstd">zstd (Default - Balancë e lartë raport/CPU)</option>
                    <option value="zstd-3">zstd-3 (Optimizuar per arkiva)</option>
                    <option value="lz4">lz4 (Ultra e shpejtë, kosto zero CPU)</option>
                    <option value="gzip-6">gzip-6 (Kompresim maksimal klasik)</option>
                    <option value="off">off (I çaktivizuar)</option>
                  </select>
                </div>

                {/* Recordsize */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Madhesia e Rekordit (recordsize):</label>
                  <select
                    value={editRecordsize}
                    onChange={(e) => setEditRecordsize(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="8K">8K (Per VM zvols ose MSSQL)</option>
                    <option value="16K">16K (Optimizuar per PostgreSQL & MySQL)</option>
                    <option value="64K">64K (Mesatare per aplikacione web)</option>
                    <option value="128K">128K (Standardi i ZFS per General Storage)</option>
                    <option value="1M">1M (Optimizuar per Video Streaming & Backups)</option>
                  </select>
                </div>

                {/* Quota */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Kuota e Hapesires (quota):</label>
                  <select
                    value={editQuota}
                    onChange={(e) => setEditQuota(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="none">none (Pa kufizim)</option>
                    <option value="100G">100G</option>
                    <option value="500G">500G</option>
                    <option value="1T">1T</option>
                    <option value="2T">2T</option>
                    <option value="5T">5T</option>
                  </select>
                </div>

                {/* atime */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Regjistrimi i Kohes se Leximit (atime):</label>
                  <select
                    value={editAtime}
                    onChange={(e) => setEditAtime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="off">off (Rekomanduar: Kursen I/O shkrimesh)</option>
                    <option value="on">on (Regjistron cdo access time)</option>
                  </select>
                </div>

                {/* dedup */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Deduplication (dedup):</label>
                  <select
                    value={editDedup}
                    onChange={(e) => setEditDedup(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="off">off (I çaktivizuar - Rekomanduar pa 64GB+ RAM)</option>
                    <option value="on">on (Aktiv per cdo bllok)</option>
                    <option value="verify">verify (Aktiv me verifikim bit-me-bit)</option>
                  </select>
                </div>

                {/* readonly */}
                <div className="space-y-1.5">
                  <label className="text-slate-300 font-medium">Vetem per Lexim (readonly):</label>
                  <select
                    value={editReadonly}
                    onChange={(e) => setEditReadonly(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="off">off (I shkrueshem normalisht)</option>
                    <option value="on">on (Bllokohet per shkrime)</option>
                  </select>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <div className="text-xs text-slate-400">
                  {saveSuccess && (
                    <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                      <Check className="w-4 h-4" />
                      Vetite u aplikuan menjehere ne ZFS!
                    </span>
                  )}
                </div>
                <button
                  onClick={handleSaveProperties}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Apliko Ndryshimet ne ZFS
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 p-12 text-center text-slate-500">
            Zgjidh nje dataset nga lista per te pare dhe ndryshuar vetite.
          </div>
        )}
      </div>

      {/* Create Dataset / Volume Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-lg bg-[#0c1222] border border-slate-700 rounded-xl shadow-2xl p-6 space-y-5 text-slate-200"
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-400" />
              {t('datasets.createTitle')}
            </h3>

            {/* Parent Pool */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('datasets.pool')}</label>
              <select
                value={newParentPool}
                onChange={(e) => setNewParentPool(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
              >
                {pools.length === 0 && (
                  <option value="">{lang === 'sq' ? 'Asnjë pool live' : 'No live pools'}</option>
                )}
                {pools.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.free})
                  </option>
                ))}
              </select>
            </div>

            {/* Dataset Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('datasets.newName')}</label>
              <input
                type="text"
                required
                placeholder="dataset-name"
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Workload Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Workload Preset:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('general')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    newPreset === 'general'
                      ? 'bg-indigo-950 border-indigo-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="font-semibold block">General Storage</span>
                  <span className="text-[10px] text-slate-500">recordsize=128K, zstd</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('database')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    newPreset === 'database'
                      ? 'bg-indigo-950 border-indigo-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="font-semibold block">Databases</span>
                  <span className="text-[10px] text-slate-500">Postgres/MySQL 16K, lz4</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('vm')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    newPreset === 'vm'
                      ? 'bg-indigo-950 border-indigo-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="font-semibold block">Virtual Machines</span>
                  <span className="text-[10px] text-slate-500">ZVOL block device, 8K</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPreset('media')}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition-colors ${
                    newPreset === 'media'
                      ? 'bg-indigo-950 border-indigo-500 text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="font-semibold block">Media & Backups</span>
                  <span className="text-[10px] text-slate-500">recordsize=1M, zstd-3</span>
                </button>
              </div>
            </div>

            {/* If volume, ask size */}
            {newType === 'volume' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Volume Size (volsize):</label>
                <input
                  type="text"
                  value={newVolsize}
                  onChange={(e) => setNewVolsize(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  placeholder="e.g.: 100G"
                />
              </div>
            )}

            {/* Submit buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer"
              >
                {t('datasets.submitCreate')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

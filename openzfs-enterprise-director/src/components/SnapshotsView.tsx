import React, { useState } from 'react';
import {
  Camera,
  Plus,
  RotateCcw,
  Copy,
  Trash2,
  Share2,
  Calendar,
  Check,
  HardDrive,
  Info,
  Clock,
  Sparkles,
  Send,
} from 'lucide-react';
import { Snapshot, Dataset, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  snapshots: Snapshot[];
  datasets: Dataset[];
  onCreateSnapshot: (dataset: string, snapName: string) => void;
  onRollback: (name: string) => void;
  onDestroySnapshot: (name: string) => void;
  lang?: Language;
  onOpenZSend?: (sourcePool?: string, sourceDataset?: string, snapName?: string) => void;
  onRequestDangerConfirm?: (data: {
    type: 'delete_pool' | 'delete_dataset' | 'delete_device' | 'modify_device' | 'modify_property';
    targetName: string;
    details?: string;
    onConfirm: () => void;
  }) => void;
}

export const SnapshotsView: React.FC<Props> = ({
  snapshots,
  datasets,
  onCreateSnapshot,
  onRollback,
  onDestroySnapshot,
  lang = 'sq',
  onOpenZSend,
  onRequestDangerConfirm,
}) => {
  const t = (key: string) => TRANSLATIONS[lang][key] || key;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(datasets[0]?.name || '');
  const [snapName, setSnapName] = useState('');
  const [copiedRepl, setCopiedRepl] = useState(false);
  const [filterDataset, setFilterDataset] = useState('all');

  const filteredSnapshots =
    filterDataset === 'all'
      ? snapshots
      : snapshots.filter((s) => s.name.startsWith(filterDataset));

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDataset || !snapName.trim()) return;
    onCreateSnapshot(selectedDataset, snapName.trim());
    setShowCreateModal(false);
    setSnapName('');
  };

  const replicationExample = `zfs send -i ${snapshots[1]?.name || 'pool/data@snap1'} ${snapshots[0]?.name || 'pool/data@snap2'} | ssh backup-server zfs recv remote-pool/data`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#0c1326] border border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-600/30 text-amber-400">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono">Copy-on-Write (CoW) Point-in-Time</div>
            <h2 className="text-sm font-bold text-white">
              Menaxhimi i Snapshot-eve, Klonimeve & Replikimit Inkremental
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dataset Filter */}
          <select
            value={filterDataset}
            onChange={(e) => setFilterDataset(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="all">Te gjithe Datasets ({snapshots.length})</option>
            {datasets.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          {onOpenZSend && (
            <button
              onClick={() => onOpenZSend()}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-950 font-mono"
            >
              <Send className="w-3.5 h-3.5" />
              {t('snapshots.migrateZSend')}
            </button>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('snapshots.create')}
          </button>
        </div>
      </div>

      {/* Snapshots Table Card */}
      <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <span className="text-xs font-semibold uppercase text-slate-400 font-mono">
            {t('snapshots.list')} ({filteredSnapshots.length})
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            Zero Initial Space (CoW Metadata Only)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="pb-2.5">Snapshot Identifier (dataset@snap)</th>
                <th className="pb-2.5">{t('snapshots.usedSpace')}</th>
                <th className="pb-2.5">{t('snapshots.referSpace')}</th>
                <th className="pb-2.5">{t('snapshots.creationDate')}</th>
                <th className="pb-2.5 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredSnapshots.map((s) => (
                <tr key={s.name} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 font-semibold text-white flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{s.name}</span>
                  </td>
                  <td className="py-3 text-amber-300 font-bold">{s.used}</td>
                  <td className="py-3 text-slate-300">{s.refer}</td>
                  <td className="py-3 text-slate-400 text-[11px]">{s.creation}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5 font-sans">
                      {onOpenZSend && (
                        <button
                          onClick={() => {
                            const [ds] = s.name.split('@');
                            const pool = ds?.split('/')[0];
                            onOpenZSend(pool, ds, s.name);
                          }}
                          className="px-2 py-1 text-[10px] rounded bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-800/40 text-indigo-300 flex items-center gap-1 cursor-pointer font-mono"
                          title="Migro kete snapshot me ZFS Z-Send"
                        >
                          <Send className="w-3 h-3 text-indigo-400" />
                          Z-Send
                        </button>
                      )}

                      <button
                        onClick={() => {
                          if (onRequestDangerConfirm) {
                            onRequestDangerConfirm({
                              type: 'modify_property',
                              targetName: s.name,
                              details: lang === 'sq'
                                ? `Rollback do te ktheje dataset-in ne gjendjen e dates ${s.creation}. Te gjitha modifikimet e bera pas kesaj date do te fshihen!`
                                : `Rollback will restore dataset to state from ${s.creation}. All writes since will be permanently lost!`,
                              onConfirm: () => onRollback(s.name),
                            });
                          } else {
                            onRollback(s.name);
                          }
                        }}
                        className="px-2 py-1 text-[10px] rounded bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/40 text-amber-300 flex items-center gap-1 cursor-pointer"
                        title="Kthe dataset-in mbrapsht ne kete moment"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Rollback
                      </button>

                      <button
                        onClick={() => {
                          if (onRequestDangerConfirm) {
                            onRequestDangerConfirm({
                              type: 'delete_dataset',
                              targetName: s.name,
                              details: `Snapshot madhesia: ${s.used} · Refer: ${s.refer}`,
                              onConfirm: () => onDestroySnapshot(s.name),
                            });
                          } else {
                            onDestroySnapshot(s.name);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                        title="Fshi snapshot (zfs destroy)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incremental Replication Assistant */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Share2 className="w-4 h-4 text-sky-400" />
            Replikimi Inkremental (zfs send / zfs recv)
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            ZFS mund te transmetoje vetem diferencat binare mes dy snapshot-eve permes SSH ose rrjetit pa skanuar skedaret:
          </p>
          <div className="p-3 rounded-lg bg-[#050914] border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto relative">
            <span>{replicationExample}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(replicationExample);
                setCopiedRepl(true);
                setTimeout(() => setCopiedRepl(false), 2000);
              }}
              className="absolute top-2 right-2 text-slate-400 hover:text-white cursor-pointer"
            >
              {copiedRepl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          {onOpenZSend && (
            <button
              onClick={() => onOpenZSend()}
              className="w-full py-2 px-3 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/70 border border-indigo-700/60 text-indigo-300 font-mono text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-indigo-400" />
              {lang === 'sq' ? 'Kryej Migrimin me Z-Send në UI (ZFS Send Stream)' : 'Launch Z-Send Migration Stream in UI'}
            </button>
          )}
        </div>

        <div className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            Automatizimi i Politikave (Snapshot Schedule)
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Rekomandimi enterprise eshte perdorimi i skripteve si <code>sanoid</code> ose <code>pyznap</code>:
          </p>
          <div className="space-y-1.5 text-xs font-mono text-slate-300">
            <div className="p-2 rounded bg-[#070d1c] border border-slate-800 flex justify-between">
              <span>Hourly Snapshots:</span>
              <span className="text-emerald-400">Ruaj 24 (Cdo ore)</span>
            </div>
            <div className="p-2 rounded bg-[#070d1c] border border-slate-800 flex justify-between">
              <span>Daily Snapshots:</span>
              <span className="text-emerald-400">Ruaj 7 (Cdo dite ne 00:00)</span>
            </div>
            <div className="p-2 rounded bg-[#070d1c] border border-slate-800 flex justify-between">
              <span>Monthly Snapshots:</span>
              <span className="text-emerald-400">Ruaj 12 (Cdo muaj)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-md bg-[#0c1222] border border-slate-700 rounded-xl shadow-2xl p-6 space-y-4 text-slate-200"
          >
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-400" />
              {t('snapshots.createTitle')}
            </h3>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('snapshots.selectDataset')}</label>
              <select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
              >
                {datasets.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">{t('snapshots.snapNamePlaceholder')}</label>
              <input
                type="text"
                required
                placeholder="snapshot-name"
                value={snapName}
                onChange={(e) => setSnapName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
              />
            </div>

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
                className="px-4 py-2 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium cursor-pointer"
              >
                {t('common.create')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

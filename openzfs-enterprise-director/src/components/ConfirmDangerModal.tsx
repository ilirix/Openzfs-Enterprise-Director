import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, X, Check } from 'lucide-react';
import { Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';

export interface ConfirmDangerData {
  isOpen: boolean;
  type: 'delete_pool' | 'delete_dataset' | 'delete_device' | 'modify_device' | 'modify_property';
  targetName: string;
  onConfirm: () => void;
  details?: string;
}

interface Props {
  data: ConfirmDangerData | null;
  onClose: () => void;
  lang: Language;
}

export const ConfirmDangerModal: React.FC<Props> = ({ data, onClose, lang }) => {
  const [typedInput, setTypedInput] = useState('');
  const t = (key: string) => TRANSLATIONS[lang][key] || key;

  if (!data || !data.isOpen) return null;

  const isConfirmed =
    typedInput.trim().toUpperCase() === 'PO' ||
    typedInput.trim().toUpperCase() === 'YES' ||
    typedInput.trim().toUpperCase() === 'CONFIRM';

  const getWarningText = () => {
    switch (data.type) {
      case 'delete_pool':
        return t('confirm.deletePoolDesc');
      case 'delete_dataset':
        return t('confirm.deleteDatasetDesc');
      case 'delete_device':
        return t('confirm.deleteDeviceDesc');
      case 'modify_device':
      case 'modify_property':
        return t('confirm.modifyDeviceDesc');
      default:
        return 'Ky veprim do te modifikoje konfigurimin e storage-it.';
    }
  };

  const handleExecute = () => {
    if (!isConfirmed) return;
    data.onConfirm();
    setTypedInput('');
    onClose();
  };

  const handleClose = () => {
    setTypedInput('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[#0e111f] border border-rose-600/60 rounded-xl shadow-2xl p-6 space-y-5 text-slate-100 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Warning Badge & Close */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-400 shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-rose-400 block">
                ZFS Safety Guard · Enterprise Confirmation
              </span>
              <h2 className="text-base font-bold text-white mt-0.5">
                {t('confirm.title')}
              </h2>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Mbyll"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Entity Box */}
        <div className="p-3.5 rounded-lg bg-[#070914] border border-rose-900/60 font-mono text-xs space-y-1">
          <div className="text-slate-400 flex items-center justify-between">
            <span>Objekti i Synuar:</span>
            <span className="text-rose-300 font-bold px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800/60">
              {data.targetName}
            </span>
          </div>
          {data.details && (
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
              {data.details}
            </p>
          )}
        </div>

        {/* Warning Description */}
        <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          <p>{getWarningText()}</p>
        </div>

        {/* Type to Confirm Field */}
        <div className="space-y-2">
          <label className="text-xs text-slate-300 font-medium block">
            {t('confirm.typeConfirm')}
          </label>
          <input
            type="text"
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
            placeholder='Shkruaj "PO" ose "CONFIRM"'
            className="w-full bg-[#050711] border border-slate-700 focus:border-rose-500 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none"
            autoFocus
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
          >
            {t('confirm.cancelAction')}
          </button>
          <button
            onClick={handleExecute}
            disabled={!isConfirmed}
            className="px-5 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-rose-950"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t('confirm.confirmAction')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

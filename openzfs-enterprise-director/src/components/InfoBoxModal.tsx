import React from 'react';
import { X, BookOpen, Terminal, CheckCircle2, Cpu, HelpCircle, Copy, Check } from 'lucide-react';
import { InfoBoxTopic, Language } from '../types/zfs';
import { resolveInfoTopic } from '../data/zfsKnowledge.locales';

interface Props {
  topic: InfoBoxTopic | null;
  onClose: () => void;
  lang?: Language;
}

const CHROME = {
  sq: {
    kicker: 'Dokumentacion & Arkitekture ZFS',
    closeLabel: 'Mbyll kutine informative',
    principles: 'Parimet Kryesore Teknike',
    commands: 'Komandat Korresponduese ne Shell Linux',
    copy: 'Kopjo komanden',
    practices: 'Praktikat me te Mira Enterprise',
    note: 'Shenim Arkitektural:',
    hint: 'Kjo dritare hapet automatikisht duke klikuar cdo menu ne panel',
    close: 'Kuptova / Mbyll',
  },
  en: {
    kicker: 'ZFS Documentation & Architecture',
    closeLabel: 'Close the info panel',
    principles: 'Core Technical Principles',
    commands: 'Matching Linux Shell Commands',
    copy: 'Copy command',
    practices: 'Enterprise Best Practices',
    note: 'Architecture note:',
    hint: 'This window opens automatically when you click a menu in the panel',
    close: 'Understood / Close',
  },
  es: {
    kicker: 'Documentación y arquitectura ZFS',
    closeLabel: 'Cerrar el panel de información',
    principles: 'Principios técnicos principales',
    commands: 'Comandos correspondientes en el shell de Linux',
    copy: 'Copiar comando',
    practices: 'Buenas prácticas enterprise',
    note: 'Nota de arquitectura:',
    hint: 'Esta ventana se abre automáticamente al hacer clic en un menú del panel',
    close: 'Entendido / Cerrar',
  },
  de: {
    kicker: 'ZFS-Dokumentation und Architektur',
    closeLabel: 'Infofenster schließen',
    principles: 'Technische Grundprinzipien',
    commands: 'Passende Linux-Shell-Befehle',
    copy: 'Befehl kopieren',
    practices: 'Enterprise-Praxis',
    note: 'Hinweis zur Architektur:',
    hint: 'Dieses Fenster öffnet sich automatisch, wenn Sie ein Menü im Panel anklicken',
    close: 'Verstanden / Schließen',
  },
  fr: {
    kicker: 'Documentation et architecture ZFS',
    closeLabel: 'Fermer le panneau d information',
    principles: 'Principes techniques',
    commands: 'Commandes shell Linux correspondantes',
    copy: 'Copier la commande',
    practices: 'Bonnes pratiques enterprise',
    note: 'Note d architecture :',
    hint: 'Cette fenêtre s ouvre automatiquement quand vous cliquez un menu du panneau',
    close: 'Compris / Fermer',
  },
  zh: {
    kicker: 'ZFS 文档与架构',
    closeLabel: '关闭说明面板',
    principles: '核心技术原理',
    commands: '对应的 Linux Shell 命令',
    copy: '复制命令',
    practices: '企业实践',
    note: '架构说明：',
    hint: '点击面板中的菜单时，此窗口会自动打开',
    close: '知道了 / 关闭',
  },
  hi: {
    kicker: 'ZFS दस्तावेज़ और वास्तुकला',
    closeLabel: 'जानकारी पैनल बंद करें',
    principles: 'मुख्य तकनीकी सिद्धांत',
    commands: 'संगत Linux शेल कमांड',
    copy: 'कमांड कॉपी करें',
    practices: 'एंटरप्राइज अभ्यास',
    note: 'वास्तुकला टिप्पणी:',
    hint: 'पैनल में कोई मेनू क्लिक करने पर यह विंडो अपने आप खुलती है',
    close: 'समझ गया / बंद करें',
  },
  ar: {
    kicker: 'توثيق ZFS وبنيته',
    closeLabel: 'إغلاق لوحة المعلومات',
    principles: 'المبادئ التقنية الأساسية',
    commands: 'أوامر صدفة Linux المقابلة',
    copy: 'نسخ الأمر',
    practices: 'ممارسات المؤسسات',
    note: 'ملاحظة معمارية:',
    hint: 'تفتح هذه النافذة تلقائيا عند النقر على قائمة في اللوحة',
    close: 'مفهوم / إغلاق',
  },
};

export const InfoBoxModal: React.FC<Props> = ({ topic, onClose, lang = 'sq' }) => {
  const [copiedCmd, setCopiedCmd] = React.useState<string | null>(null);
  const ui = CHROME[lang] || CHROME.en;
  const shown = resolveInfoTopic(lang, topic);

  if (!shown) return null;

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl max-h-[90vh] bg-[#0c1222] border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-800 bg-[#090e1a]">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-sky-950/60 border border-sky-500/30 text-sky-400 shrink-0 mt-0.5">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-sky-400 font-semibold font-mono">
                  {ui.kicker}
                </span>
                <span className="text-xs text-slate-500">·</span>
                <span className="text-xs text-slate-400 font-mono">ID: {shown.id}</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white mt-1">
                {shown.title}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {shown.subtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label={ui.closeLabel}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-300">
          {/* Summary Box */}
          <div className="p-4 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-200 leading-relaxed">
            <p>{shown.summary}</p>
          </div>

          {/* Key Concepts */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-sky-400" />
              {ui.principles}
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {shown.keyConcepts.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-lg bg-[#0b1329] border border-slate-800/80 hover:border-slate-700 transition-colors"
                >
                  <span className="text-xs font-bold text-sky-300 block mb-1">
                    {item.label}
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Shell Commands */}
          {shown.shellCommands && shown.shellCommands.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
                <Terminal className="w-4 h-4 text-amber-400" />
                {ui.commands}
              </h3>
              <div className="space-y-2">
                {shown.shellCommands.map((cmd, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-md bg-[#050914] border border-slate-800 font-mono text-xs text-emerald-400 group"
                  >
                    <span className="truncate">{cmd}</span>
                    <button
                      onClick={() => handleCopy(cmd)}
                      className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
                      title={ui.copy}
                    >
                      {copiedCmd === cmd ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Best Practices */}
          {shown.bestPractices && shown.bestPractices.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                {ui.practices}
              </h3>
              <ul className="space-y-2">
                {shown.bestPractices.map((practice, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>{practice}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Architectural Note */}
          <div className="p-3.5 rounded-lg bg-sky-950/30 border border-sky-800/40 text-xs text-sky-200">
            <span className="font-semibold block mb-1">{ui.note}</span>
            <p className="text-slate-300">{shown.architectureNote}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#090e1a] flex items-center justify-between">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{ui.hint}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            {ui.close}
          </button>
        </div>
      </div>
    </div>
  );
};

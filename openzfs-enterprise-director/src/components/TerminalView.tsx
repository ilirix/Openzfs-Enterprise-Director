import React, { useState } from 'react';
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  Cpu,
  HardDrive,
  Trash2,
} from 'lucide-react';

interface Props {
  onExecute: (command: string) => Promise<{ command: string; output: string; exitCode: number }>;
}

export const TerminalView: React.FC<Props> = ({ onExecute }) => {
  const [inputCmd, setInputCmd] = useState('zpool status');
  const [history, setHistory] = useState<Array<{ cmd: string; out: string; time: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const quickCommands = [
    { label: 'zpool status', cmd: 'zpool status' },
    { label: 'zpool list', cmd: 'zpool list' },
    { label: 'zfs list -o space', cmd: 'zfs list -o space' },
    { label: 'arcstat', cmd: 'arcstat' },
    { label: 'zpool iostat -v', cmd: 'zpool iostat -v' },
    { label: 'arc_summary', cmd: 'arc_summary' },
  ];

  const handleRun = async (cmdToRun: string) => {
    if (!cmdToRun.trim() || loading) return;
    setLoading(true);
    try {
      const res = await onExecute(cmdToRun);
      const now = new Date().toLocaleTimeString();
      setHistory((prev) => [
        {
          cmd: res.command,
          out: res.output,
          time: now,
        },
        ...prev,
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        {
          cmd: cmdToRun,
          out: `Error: ${err.message}`,
          time: new Date().toLocaleTimeString(),
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header & Quick Recipe Buttons */}
      <div className="p-5 rounded-xl bg-[#0c1326] border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-600/30 text-emerald-400">
              <TerminalIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-mono">Linux Root Shell Execution Engine</div>
              <h2 className="text-base font-bold text-white">
                Konsola e Integruar e Komandave OpenZFS
              </h2>
            </div>
          </div>
          <button
            onClick={() => setHistory([])}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Pastro Historikun
          </button>
        </div>

        {/* Quick Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-mono">Komanda te Shpejta:</span>
          {quickCommands.map((q) => (
            <button
              key={q.cmd}
              onClick={() => {
                setInputCmd(q.cmd);
                handleRun(q.cmd);
              }}
              className="px-2.5 py-1 text-xs font-mono rounded bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700/80 transition-colors cursor-pointer"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Command Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRun(inputCmd);
          }}
          className="flex items-center gap-2 pt-1"
        >
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-mono text-xs">
              root@zfs-srv:~#
            </span>
            <input
              type="text"
              value={inputCmd}
              onChange={(e) => setInputCmd(e.target.value)}
              className="w-full bg-[#050914] border border-slate-700 rounded-lg pl-36 pr-4 py-2.5 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
              placeholder="shkruaj komanden ZFS psh: zpool status, arcstat, zfs get all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {loading ? 'Duke Ekzekutuar...' : 'Ekzekuto'}
          </button>
        </form>
      </div>

      {/* Terminal History Log */}
      <div className="space-y-4">
        {history.map((item, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-[#050914] border border-slate-800/80 overflow-hidden shadow-xl font-mono text-xs"
          >
            {/* Header bar of entry */}
            <div className="px-4 py-2 bg-[#090f20] border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">$ {item.cmd}</span>
                <span>·</span>
                <span className="text-slate-500">{item.time}</span>
              </div>
              <button
                onClick={() => handleCopy(item.out, idx)}
                className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Kopjo output-in"
              >
                {copiedIdx === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIdx === idx ? 'Kopjuar' : 'Kopjo'}</span>
              </button>
            </div>

            {/* Output Box */}
            <div className="p-4 text-slate-200 whitespace-pre-wrap overflow-x-auto leading-relaxed max-h-96">
              {item.out}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

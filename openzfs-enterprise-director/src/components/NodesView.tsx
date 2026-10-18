import React, { useState } from 'react';
import { Server, Trash2, PlugZap, CheckCircle2 } from 'lucide-react';
import { Language } from '../types/zfs';
import { zfsApi } from '../services/zfsApi';

export type SshNodeRow = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: string;
};

interface Props {
  lang: Language;
  activeId: string;
  localName: string;
  nodes: SshNodeRow[];
  onSelect: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
}

export const NodesView: React.FC<Props> = ({ lang, activeId, localName, nodes, onSelect, onChanged }) => {
  const sq = lang === 'sq';
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('root');
  const [secret, setSecret] = useState('');
  const [auth, setAuth] = useState<'password' | 'key' | 'file'>('key');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const add = async () => {
    setBusy('add');
    setError('');
    setMessage('');
    try {
      const body: { name: string; host: string; port: number; user: string; password?: string; privateKey?: string; identityFile?: string } = {
        name: name.trim(),
        host: host.trim(),
        port: Number(port),
        user: user.trim(),
      };
      if (auth === 'password') body.password = secret;
      if (auth === 'key') body.privateKey = secret;
      if (auth === 'file') body.identityFile = secret.trim();
      const created = await zfsApi.addNode(body);
      setSecret('');
      setMessage(sq ? `Nyja ${created.node.name} u ruajt.` : `Node ${created.node.name} was saved.`);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || (sq ? 'Nyja nuk u shtua.' : 'The node was not added.'));
    } finally {
      setBusy('');
    }
  };

  const test = async (id: string) => {
    setBusy(id);
    setError('');
    setMessage('');
    try {
      const result = await zfsApi.testNode(id);
      setMessage(`${result.hostname}${result.output ? ` — ${result.output}` : ''}`);
    } catch (err: any) {
      setError(err?.message || (sq ? 'Lidhja SSH dështoi.' : 'SSH connection failed.'));
    } finally {
      setBusy('');
    }
  };

  const remove = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await zfsApi.deleteNode(id);
      if (activeId === id) await onSelect('local');
      await onChanged();
    } catch (err: any) {
      setError(err?.message || (sq ? 'Nyja nuk u hoq.' : 'The node was not removed.'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-lg font-bold text-white">{sq ? 'Nyjet SSH' : 'SSH nodes'}</h1>
        <p className="text-xs text-slate-400 mt-1">
          {sq
            ? 'Zgjidh nyjen ku ekzekutohen zpool, zfs dhe lsblk. Kjo makinë mbetet drejtori. Çelësi dhe fjalëkalimi ruhen vetëm në host dhe nuk kthehen në faqe.'
            : 'Choose the node that runs zpool, zfs, and lsblk. This machine stays the director. The key and password stay on the host and are not returned to the page.'}
        </p>
      </div>

      {(message || error) && (
        <div className={`p-3 rounded-lg text-xs ${error ? 'bg-rose-950/40 border border-rose-800/50 text-rose-200' : 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-200'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onSelect('local')}
          className={`p-4 rounded-xl border text-left cursor-pointer ${activeId === 'local' ? 'bg-[#0b162c] border-emerald-500/50' : 'bg-[#0b1224] border-slate-800'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-white flex items-center gap-2"><Server className="w-4 h-4 text-emerald-400" />{localName}</span>
            {activeId === 'local' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">{sq ? 'Kjo nyje, pa SSH.' : 'This node, without SSH.'}</p>
        </button>

        {nodes.map((node) => (
          <div key={node.id} className={`p-4 rounded-xl border ${activeId === node.id ? 'bg-[#0b162c] border-sky-500/50' : 'bg-[#0b1224] border-slate-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{node.name}</div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">{node.user}@{node.host}:{node.port}</div>
                <div className="text-[10px] text-slate-500 mt-1">{node.auth === 'key' ? (sq ? 'çelës SSH' : 'SSH key') : (sq ? 'fjalëkalim' : 'password')}</div>
              </div>
              {activeId === node.id && <CheckCircle2 className="w-4 h-4 text-sky-400" />}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" disabled={busy === node.id} onClick={() => onSelect(node.id)} className="px-2.5 py-1 text-[11px] rounded bg-sky-700 hover:bg-sky-600 text-white cursor-pointer disabled:opacity-50">
                {sq ? 'Menaxho' : 'Manage'}
              </button>
              <button type="button" disabled={busy === node.id} onClick={() => test(node.id)} className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer disabled:opacity-50 flex items-center gap-1">
                <PlugZap className="w-3 h-3" />
                {sq ? 'Provo SSH' : 'Test SSH'}
              </button>
              <button type="button" disabled={busy === node.id} onClick={() => remove(node.id)} className="px-2.5 py-1 text-[11px] rounded bg-rose-950/70 hover:bg-rose-900 text-rose-200 cursor-pointer disabled:opacity-50 flex items-center gap-1">
                <Trash2 className="w-3 h-3" />
                {sq ? 'Hiq' : 'Remove'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <form
        className="p-5 rounded-xl bg-[#0b1224] border border-slate-800/80 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <h2 className="text-sm font-semibold text-white">{sq ? 'Shto nyje' : 'Add a node'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="space-y-1">
            <span className="text-slate-400">{sq ? 'Emri' : 'Name'}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white" />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Host</span>
            <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.1.20" className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">{sq ? 'Përdoruesi' : 'User'}</span>
            <input value={user} onChange={(event) => setUser(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono" />
          </label>
          <label className="space-y-1">
            <span className="text-slate-400">Port</span>
            <input value={port} onChange={(event) => setPort(event.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono" />
          </label>
        </div>
        <label className="block text-xs space-y-1">
          <span className="text-slate-400">{sq ? 'Autentifikimi' : 'Authentication'}</span>
          <select value={auth} onChange={(event) => setAuth(event.target.value as 'password' | 'key' | 'file')} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white">
            <option value="key">{sq ? 'Ngjit çelësin privat' : 'Paste a private key'}</option>
            <option value="file">{sq ? 'Shtegu i çelësit në këtë host' : 'Key path on this host'}</option>
            <option value="password">{sq ? 'Fjalëkalim' : 'Password'}</option>
          </select>
        </label>
        <textarea
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          rows={auth === 'key' ? 6 : 2}
          placeholder={auth === 'file' ? '/root/.ssh/id_ed25519' : auth === 'password' ? (sq ? 'Fjalëkalimi SSH' : 'SSH password') : '-----BEGIN OPENSSH PRIVATE KEY-----'}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
        />
        <button type="submit" disabled={busy === 'add'} className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white cursor-pointer disabled:opacity-50">
          {sq ? 'Ruaj nyjen' : 'Save node'}
        </button>
      </form>
    </div>
  );
};

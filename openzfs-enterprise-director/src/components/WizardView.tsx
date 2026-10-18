import React, { useEffect, useState } from 'react';
import {
  Wand2,
  CheckCircle2,
  HardDrive,
  Cpu,
  Layers,
  ChevronRight,
  ChevronLeft,
  Terminal,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { DiskItem, Pool, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';

interface Props {
  availableDisks: DiskItem[];
  existingPools: Pool[];
  onComplete: (data: {
    name: string;
    ashift: number;
    topology: string;
    disks: string[];
    slogDisks: string[];
    l2arcDisks: string[];
    specialDisks?: string[];
    spareDisks?: string[];
    compression?: string;
    recordsize?: string;
  }) => void | Promise<void>;
  lang?: Language;
}

export const WizardView: React.FC<Props> = ({ availableDisks, existingPools, onComplete, lang = 'sq' }) => {
  const t = (k: string) => TRANSLATIONS[lang]?.[k] || k;
  const [step, setStep] = useState(1);

  // Form State
  const [poolName, setPoolName] = useState('pool-enterprise');
  const [ashift, setAshift] = useState<number>(12);
  const [topology, setTopology] = useState('raidz2');
  const [selectedDisks, setSelectedDisks] = useState<string[]>([]);
  const [enableSlog, setEnableSlog] = useState(false);
  const [selectedSlogDisks, setSelectedSlogDisks] = useState<string[]>([]);
  const [enableL2arc, setEnableL2arc] = useState(false);
  const [selectedL2arcDisks, setSelectedL2arcDisks] = useState<string[]>([]);
  const [enableSpecial, setEnableSpecial] = useState(false);
  const [selectedSpecialDisks, setSelectedSpecialDisks] = useState<string[]>([]);
  const [enableSpare, setEnableSpare] = useState(false);
  const [selectedSpareDisks, setSelectedSpareDisks] = useState<string[]>([]);
  const [compression, setCompression] = useState('zstd');
  const [workload, setWorkload] = useState('general');
  const [isApplied, setIsApplied] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const known = new Set(availableDisks.map((disk) => disk.dev));
    setSelectedDisks((prev) => prev.filter((dev) => known.has(dev)));
    setSelectedSlogDisks((prev) => prev.filter((dev) => known.has(dev)));
    setSelectedL2arcDisks((prev) => prev.filter((dev) => known.has(dev)));
    setSelectedSpecialDisks((prev) => prev.filter((dev) => known.has(dev)));
    setSelectedSpareDisks((prev) => prev.filter((dev) => known.has(dev)));
  }, [availableDisks]);

  const toggleDisk = (dev: string) => {
    setSelectedDisks((prev) =>
      prev.includes(dev) ? prev.filter((d) => d !== dev) : [...prev, dev]
    );
  };

  const sq = lang === 'sq';
  const topologies = [
    {
      id: 'stripe',
      title: 'Stripe',
      desc: sq
        ? 'Pa redundancë. Humbja e një disku humb pool-in. Vetëm për të dhëna që rikuperohen diku tjetër.'
        : 'No redundancy. Losing one disk loses the pool. Only for data that can be rebuilt elsewhere.',
    },
    {
      id: 'mirror',
      title: 'Mirror (2-way)',
      desc: sq
        ? 'Dy kopje. IOPS më i lartë dhe resilver i shkurtër. Minimumi 2 disqe.'
        : 'Two copies. Highest IOPS and the shortest resilver. Minimum 2 disks.',
    },
    {
      id: 'mirror3',
      title: 'Mirror (3-way)',
      desc: sq
        ? 'Tre kopje në të njëjtin vdev. Toleron 2 dështime. Minimumi 3 disqe.'
        : 'Three copies in the same vdev. Survives 2 failures. Minimum 3 disks.',
    },
    {
      id: 'raidz1',
      title: 'RAIDZ1',
      desc: sq
        ? 'Paritet i vetëm, si RAID-5. Toleron 1 disk. Minimumi 3 disqe.'
        : 'Single parity, like RAID-5. Survives 1 disk. Minimum 3 disks.',
    },
    {
      id: 'raidz2',
      title: 'RAIDZ2',
      desc: sq
        ? 'Paritet i dyfishtë. Toleron 2 disqe njëkohësisht. Minimumi 4 disqe.'
        : 'Double parity. Survives 2 disks at once. Minimum 4 disks.',
    },
    {
      id: 'raidz3',
      title: 'RAIDZ3',
      desc: sq
        ? 'Paritet i trefishtë. Toleron 3 disqe. Minimumi 5 disqe.'
        : 'Triple parity. Survives 3 disks. Minimum 5 disks.',
    },
    {
      id: 'draid1',
      title: 'dRAID1',
      desc: sq
        ? 'RAID i shpërndarë me paritet të vetëm dhe spare të integruar. Për vargje të gjera.'
        : 'Distributed RAID with single parity and an integrated spare. For wide arrays.',
    },
    {
      id: 'draid2',
      title: 'dRAID2',
      desc: sq
        ? 'dRAID me paritet të dyfishtë. Resilver më i shpejtë se RAIDZ2 kur ka shumë disqe.'
        : 'Distributed RAID with double parity. Faster resilver than RAIDZ2 on many disks.',
    },
    {
      id: 'draid3',
      title: 'dRAID3',
      desc: sq
        ? 'dRAID me paritet të trefishtë për vargje shumë të gjera.'
        : 'Distributed RAID with triple parity for very wide arrays.',
    },
  ];

  const vdevKeyword =
    topology === 'stripe' ? '' : topology === 'mirror3' ? 'mirror' : topology;

  const logPart = enableSlog && selectedSlogDisks.length
    ? ` log${selectedSlogDisks.length > 1 ? ' mirror' : ''} ${selectedSlogDisks.join(' ')}`
    : '';
  const cachePart = enableL2arc && selectedL2arcDisks.length ? ` cache ${selectedL2arcDisks.join(' ')}` : '';
  const specialPart = enableSpecial && selectedSpecialDisks.length
    ? ` special${selectedSpecialDisks.length > 1 ? ' mirror' : ''} ${selectedSpecialDisks.join(' ')}`
    : '';
  const sparePart = enableSpare && selectedSpareDisks.length ? ` spare ${selectedSpareDisks.join(' ')}` : '';
  const generatedZpoolCommand = `zpool create -o ashift=${ashift} ${poolName}${vdevKeyword ? ` ${vdevKeyword}` : ''} ${selectedDisks.join(' ')}${logPart}${specialPart}${cachePart}${sparePart}`;

  const generatedZfsCommands = [
    `zfs set compression=${compression} ${poolName}`,
    `zfs set atime=off ${poolName}`,
    `zfs set xattr=sa ${poolName}`,
    `zfs set acltype=posixacl ${poolName}`,
  ];

  const minDisks: Record<string, number> = {
    stripe: 1,
    mirror: 2,
    mirror3: 3,
    raidz1: 3,
    raidz2: 4,
    raidz3: 5,
    draid1: 3,
    draid2: 4,
    draid3: 5,
  };
  const requiredDisks = minDisks[topology] ?? 1;
  const recordsize = workload === 'database' ? '16K' : workload === 'vm' ? '8K' : workload === 'media' ? '1M' : '128K';

  const diskKind = (disk: DiskItem) => {
    const blob = `${disk.type} ${disk.model}`.toLowerCase();
    if (blob.includes('system')) return 'system';
    if (blob.includes('virtio')) return 'virtio';
    if (blob.includes('nvme') || blob.includes('ssd')) return 'fast';
    if (blob.includes('hdd')) return 'hdd';
    return 'other';
  };
  const poolMember = (dev: string) => existingPools.some((pool) =>
    (pool.vdevs || []).some((vdev) =>
      (vdev.disks || []).some((member) => {
        if (member === dev) return true;
        if (!member.startsWith(dev)) return false;
        return /^p?\d/.test(member.slice(dev.length));
      })
    )
  );
  const roleOf = (dev: string) => {
    if (selectedDisks.includes(dev)) return 'data';
    if (selectedSlogDisks.includes(dev)) return 'slog';
    if (selectedL2arcDisks.includes(dev)) return 'l2arc';
    if (selectedSpecialDisks.includes(dev)) return 'special';
    if (selectedSpareDisks.includes(dev)) return 'spare';
    return '';
  };
  const claimDisk = (
    dev: string,
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (selected.includes(dev)) {
      setSelected(selected.filter((item) => item !== dev));
      return;
    }
    setSelectedDisks((prev) => prev.filter((item) => item !== dev));
    setSelectedSlogDisks((prev) => prev.filter((item) => item !== dev));
    setSelectedL2arcDisks((prev) => prev.filter((item) => item !== dev));
    setSelectedSpecialDisks((prev) => prev.filter((item) => item !== dev));
    setSelectedSpareDisks((prev) => prev.filter((item) => item !== dev));
    setSelected((prev) => [...prev, dev]);
  };
  const freeDisks = availableDisks.filter((disk) => !poolMember(disk.dev) && diskKind(disk) !== 'system' && !selectedDisks.includes(disk.dev));
  const fastFree = freeDisks.filter((disk) => diskKind(disk) === 'fast');
  const virtioFree = freeDisks.filter((disk) => diskKind(disk) === 'virtio');
  const hddFree = freeDisks.filter((disk) => diskKind(disk) === 'hdd');
  const names = (rows: DiskItem[]) => rows.map((disk) => disk.dev).join(', ');
  const vdevAdvice = [
    selectedDisks.length < requiredDisks
      ? (sq
        ? `${topology} kërkon edhe ${requiredDisks - selectedDisks.length} disk të dhënash para se të shtosh VDEV të tjera.`
        : `${topology} still needs ${requiredDisks - selectedDisks.length} data disk(s) before extra VDEVs.`)
      : (sq
        ? `VDEV i të dhënave është ${topology} me ${selectedDisks.length} disqe. Mos i ripërdor ato për SLOG, cache, special ose spare.`
        : `The data VDEV is ${topology} with ${selectedDisks.length} disk(s). Do not reuse those disks for SLOG, cache, special, or spare.`),
    fastFree.length >= 2
      ? (sq
        ? `SLOG: mirror me ${fastFree[0].dev} dhe ${fastFree[1].dev}. L2ARC, nëse duhet, merr një NVMe/SSD tjetër, jo njërin nga këta.`
        : `SLOG: mirror ${fastFree[0].dev} and ${fastFree[1].dev}. If you add L2ARC, use a different NVMe/SSD.`)
      : fastFree.length === 1
        ? (sq
          ? `Vetëm ${fastFree[0].dev} është NVMe/SSD i lirë. Përdore për SLOG ose për special, jo për të dyja. L2ARC lëre fikur.`
          : `Only ${fastFree[0].dev} is a free NVMe/SSD. Use it for SLOG or special, not both. Leave L2ARC off.`)
        : virtioFree.length
          ? (sq
            ? `Nuk ka NVMe ose SSD të lirë. ${names(virtioFree)} janë VirtIO, pa mbrojtje nga ndërprerja e energjisë. Për një pool prove mund të lihen SLOG, L2ARC dhe special të fikura.`
            : `No free NVMe or SSD. ${names(virtioFree)} are VirtIO disks without power-loss protection. For a test pool, leave SLOG, L2ARC, and special off.`)
          : (sq
            ? `${names(availableDisks.filter((disk) => poolMember(disk.dev))) || 'Asnjë'} është tashmë në një pool. ${names(availableDisks.filter((disk) => diskKind(disk) === 'system')) || 'Asnjë'} është disk sistemi. Nuk ka NVMe ose SSD të lirë për SLOG, L2ARC ose special.`
            : `${names(availableDisks.filter((disk) => poolMember(disk.dev))) || 'None'} already belong to a pool. ${names(availableDisks.filter((disk) => diskKind(disk) === 'system')) || 'None'} is the system disk. No free NVMe or SSD is left for SLOG, L2ARC, or special.`),
    ...(hddFree.length
      ? [sq
        ? `Spare: ${hddFree[0].dev} është HDD dhe mund të qëndrojë si rezervë nëse është i njëjtë me disqet e të dhënave. Mos e përdor si SLOG ose L2ARC.`
        : `Spare: ${hddFree[0].dev} is an HDD and can be a spare if it matches the data disks. Do not use it as SLOG or L2ARC.`]
      : []),
    sq
      ? 'Special VDEV nuk hiqet më vonë. Vendose vetëm si mirror NVMe, me hapësirë për rritjen e metadatave.'
      : 'A special vdev cannot be removed later. Use it only as an NVMe mirror, with room for metadata growth.',
  ];

  const handleApply = async () => {
    setApplyError('');
    setApplying(true);
    try {
      await onComplete({
        name: poolName,
        ashift,
        topology,
        disks: selectedDisks,
        slogDisks: enableSlog ? selectedSlogDisks : [],
        l2arcDisks: enableL2arc ? selectedL2arcDisks : [],
        specialDisks: enableSpecial ? selectedSpecialDisks : [],
        spareDisks: enableSpare ? selectedSpareDisks : [],
        compression,
        recordsize,
      });
      setIsApplied(true);
    } catch (err: any) {
      setIsApplied(false);
      setApplyError(err?.message || (sq ? 'Pool-i nuk u krijua.' : 'The pool was not created.'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Wizard Header */}
      <div className="p-5 rounded-xl bg-[#0c1326] border border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-600/30 text-amber-400">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono">OpenZFS Configuration Wizard</div>
            <h2 className="text-base font-bold text-white">
              {t('wizard.title')}
            </h2>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-400">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                step === s
                  ? 'bg-amber-500 text-black'
                  : step > s
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="p-6 rounded-xl bg-[#0b1224] border border-slate-800/80 min-h-[420px] flex flex-col justify-between space-y-6">
        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <span className="text-xs font-mono uppercase text-amber-400 font-semibold">
                {t('wizard.stepOf').replace('{0}', '1')}
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                {t('wizard.step1Title')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {t('wizard.step1Desc')}
              </p>
            </div>

            <div className="space-y-4 max-w-lg">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">{t('wizard.poolNameLabel')}</label>
                <input
                  type="text"
                  value={poolName}
                  onChange={(e) => setPoolName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                  placeholder={sq ? 'psh: tank-prod, storage-vault' : 'e.g. tank-prod, storage-vault'}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  {t('wizard.ashiftLabel')}
                </label>
                <div className="space-y-2">
                  <label
                    onClick={() => setAshift(12)}
                    className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition-colors ${
                      ashift === 12
                        ? 'bg-amber-950/40 border-amber-500/60 text-white'
                        : 'bg-[#070d1c] border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ashift"
                      checked={ashift === 12}
                      onChange={() => setAshift(12)}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold block font-mono text-amber-300">
                        {sq
                          ? 'ashift=12 (4096 bytes / 4KB) · Rekomanduar'
                          : 'ashift=12 (4096 bytes / 4KB) · Recommended'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {sq
                          ? 'Standardi për 99% të SSD, NVMe dhe disqeve Advanced Format.'
                          : 'The usual choice for 99% of SSDs, NVMe drives, and Advanced Format disks.'}
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setAshift(13)}
                    className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition-colors ${
                      ashift === 13
                        ? 'bg-amber-950/40 border-amber-500/60 text-white'
                        : 'bg-[#070d1c] border-slate-800 text-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ashift"
                      checked={ashift === 13}
                      onChange={() => setAshift(13)}
                      className="mt-0.5 text-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold block font-mono text-slate-200">
                        ashift=13 (8192 bytes / 8KB)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {sq
                          ? 'Për SSD dhe NVMe enterprise me faqe fizike flash 8K.'
                          : 'For enterprise SSD and NVMe drives with 8K physical pages.'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <span className="text-xs font-mono uppercase text-amber-400 font-semibold">
                {t('wizard.stepOf').replace('{0}', '2')}
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                {t('wizard.step2Title')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {t('wizard.step2Desc')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Topology selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  {sq ? 'Lloji i topologjisë VDEV:' : 'VDEV topology:'}
                </label>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {topologies.map((option) => (
                    <label
                      key={option.id}
                      onClick={() => setTopology(option.id)}
                      className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer ${
                        topology === option.id
                          ? 'bg-amber-950/40 border-amber-500/60 text-white'
                          : 'bg-[#070d1c] border-slate-800 text-slate-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="topo"
                        checked={topology === option.id}
                        onChange={() => setTopology(option.id)}
                        className="mt-0.5 text-amber-500"
                      />
                      <div>
                        <span className="text-xs font-bold block">{option.title}</span>
                        <span className="text-[10px] text-slate-400">{option.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Disk Selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">
                  {sq
                    ? `Zgjidh disqet (${selectedDisks.length} të përzgjedhur):`
                    : `Select disks (${selectedDisks.length} selected):`}
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                  {availableDisks.length === 0 ? (
                    <p className="text-[11px] text-slate-500 font-mono px-1 py-2">
                      {lang === 'sq'
                        ? 'Asnjë disk i lirë nuk u gjet në këtë host.'
                        : 'No free disks were found on this host.'}
                    </p>
                  ) : availableDisks.map((d) => (
                    <label
                      key={d.dev}
                      className="flex items-center justify-between p-2 rounded hover:bg-slate-800/80 cursor-pointer text-xs font-mono"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedDisks.includes(d.dev)}
                          onChange={() => toggleDisk(d.dev)}
                          className="rounded border-slate-700 text-amber-500"
                        />
                        <span className="text-white font-semibold">{d.dev}</span>
                        <span className="text-slate-400">({d.size})</span>
                        <span className="text-slate-500 truncate">{d.model}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{d.type}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <span className="text-xs font-mono uppercase text-amber-400 font-semibold">
                {t('wizard.stepOf').replace('{0}', '3')}
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                {t('wizard.step3Title')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {sq
                  ? 'Shtoni disqe të shpejta NVMe për të rritur performancën e shkrimeve sinkrone dhe të leximit.'
                  : 'Add fast NVMe drives to speed up synchronous writes and reads.'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-sky-950/30 border border-sky-800/40 text-[11px] text-slate-300 space-y-1.5">
              <span className="text-sky-300 font-semibold block">
                {sq ? 'Sugjerim për VDEV dhe pajisjen' : 'VDEV and device suggestion'}
              </span>
              {vdevAdvice.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {([
                {
                  id: 'slog',
                  title: 'SLOG (ZIL)',
                  enabled: enableSlog,
                  setEnabled: setEnableSlog,
                  selected: selectedSlogDisks,
                  setSelected: setSelectedSlogDisks,
                  accent: 'border-amber-500/50',
                  hint: sq
                    ? 'Shkrime sinkrone. Dy NVMe me mbrojtje energjie, si mirror. Një disk i vetëm e bën log-un pikë dështimi.'
                    : 'Synchronous writes. Two power-loss-protected NVMe disks, as a mirror. One disk makes the log a single point of failure.',
                },
                {
                  id: 'l2arc',
                  title: 'L2ARC',
                  enabled: enableL2arc,
                  setEnabled: setEnableL2arc,
                  selected: selectedL2arcDisks,
                  setSelected: setSelectedL2arcDisks,
                  accent: 'border-sky-500/50',
                  hint: sq
                    ? 'Kesh leximi. SSD ose NVMe që nuk është SLOG. Nuk ka nevojë për mirror. Lëre fikur nëse nuk ka flash të lirë.'
                    : 'Read cache. An SSD or NVMe that is not the SLOG. No mirror is required. Leave it off when no spare flash exists.',
                },
                {
                  id: 'special',
                  title: 'Special',
                  enabled: enableSpecial,
                  setEnabled: setEnableSpecial,
                  selected: selectedSpecialDisks,
                  setSelected: setSelectedSpecialDisks,
                  accent: 'border-violet-500/50',
                  hint: sq
                    ? 'Metadata dhe blloqe të vogla. Vetëm mirror NVMe. Nuk hiqet pasi krijohet pool-i.'
                    : 'Metadata and small blocks. NVMe mirror only. It cannot be removed after the pool is created.',
                },
                {
                  id: 'spare',
                  title: 'Spare',
                  enabled: enableSpare,
                  setEnabled: setEnableSpare,
                  selected: selectedSpareDisks,
                  setSelected: setSelectedSpareDisks,
                  accent: 'border-emerald-500/50',
                  hint: sq
                    ? 'Disk rezervë i të njëjtit lloj dhe madhësi me disqet e të dhënave. Jo disku i sistemit.'
                    : 'A spare of the same type and size as the data disks. Not the system disk.',
                },
              ] as const).map((role) => (
                <div
                  key={role.id}
                  className={`p-4 rounded-xl border space-y-3 ${role.enabled ? `bg-[#0b162c] ${role.accent}` : 'bg-[#070d1c] border-slate-800'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      {role.id === 'slog' ? <Zap className="w-4 h-4 text-amber-400" /> : <Cpu className="w-4 h-4 text-sky-400" />}
                      {role.title}
                    </span>
                    <input
                      type="checkbox"
                      checked={role.enabled}
                      onChange={(e) => role.setEnabled(e.target.checked)}
                      className="rounded text-amber-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{role.hint}</p>
                  {role.enabled && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {availableDisks.map((disk) => {
                        const kind = diskKind(disk);
                        const member = poolMember(disk.dev);
                        const owner = roleOf(disk.dev);
                        const blocked = kind === 'system' || member || (owner !== '' && owner !== role.id);
                        const reason = kind === 'system'
                          ? (sq ? 'disk sistemi' : 'system disk')
                          : member
                            ? (sq ? 'tashmë në një pool' : 'already in a pool')
                            : owner === 'data'
                              ? (sq ? 'në VDEV e të dhënave' : 'used by the data VDEV')
                              : owner && owner !== role.id
                                ? (sq ? `caktuar te ${owner}` : `assigned to ${owner}`)
                                : kind === 'fast'
                                  ? (sq ? 'i përshtatshëm për flash' : 'suitable for flash')
                                  : kind === 'hdd'
                                    ? (sq ? 'HDD, i përshtatshëm si spare' : 'HDD, suitable as a spare')
                                    : kind === 'virtio'
                                      ? 'VirtIO'
                                      : disk.type;
                        return (
                          <label key={disk.dev} className={`flex items-center justify-between gap-2 text-[11px] font-mono ${blocked ? 'opacity-50' : ''}`}>
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                disabled={blocked}
                                checked={role.selected.includes(disk.dev)}
                                onChange={() => claimDisk(disk.dev, role.selected, role.setSelected)}
                              />
                              <span className="text-white truncate">{disk.dev}</span>
                              <span className="text-slate-500">{disk.size}</span>
                            </span>
                            <span className="text-slate-500 shrink-0">{reason}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <span className="text-xs font-mono uppercase text-amber-400 font-semibold">
                {t('wizard.stepOf').replace('{0}', '4')}
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                {t('wizard.step4Title')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {sq
                  ? 'Konfiguroni parametrat e trashëgueshëm për file-sistemin fillestar të pool-it.'
                  : 'Set the inherited properties for the pool root filesystem.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">
                  {sq ? 'Algoritmi i kompresimit:' : 'Compression algorithm:'}
                </label>
                <select
                  value={compression}
                  onChange={(e) => setCompression(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-amber-500 focus:outline-none"
                >
                  <option value="zstd">{sq ? 'zstd (rekomanduar, raport i lartë)' : 'zstd (recommended, high ratio)'}</option>
                  <option value="lz4">{sq ? 'lz4 (shumë i shpejtë, pak CPU)' : 'lz4 (very fast, little CPU)'}</option>
                  <option value="zstd-3">{sq ? 'zstd-3 (arkivim)' : 'zstd-3 (archival)'}</option>
                  <option value="off">{sq ? 'off (pa kompresim)' : 'off (no compression)'}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">
                  {sq ? 'Qëllimi kryesor:' : 'Primary workload:'}
                </label>
                <select
                  value={workload}
                  onChange={(e) => setWorkload(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-amber-500 focus:outline-none"
                >
                  <option value="general">General Enterprise Storage (128K)</option>
                  <option value="database">PostgreSQL / MySQL Databases (16K)</option>
                  <option value="vm">Virtualization Images & VMs (8K)</option>
                  <option value="media">Video & Backups (1M)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <span className="text-xs font-mono uppercase text-emerald-400 font-semibold">
                {t('wizard.stepOf').replace('{0}', '5')}
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                {t('wizard.step5Title')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {sq
                  ? 'Këto janë komandat që do të zbatohen në këtë host Linux:'
                  : 'These are the commands that will be applied on this Linux host:'}
              </p>
            </div>

            {/* Generated commands */}
            <div className="p-4 rounded-xl bg-[#050914] border border-slate-800 font-mono text-xs space-y-2">
              <span className="text-slate-500 block text-[10px]">
                {sq ? '# 1. Krijimi i storage pool:' : '# 1. Create the storage pool:'}
              </span>
              <div className="text-amber-300 p-2 rounded bg-black/40 overflow-x-auto">
                {generatedZpoolCommand}
              </div>

              <span className="text-slate-500 block text-[10px] pt-1">
                {sq ? '# 2. Optimizimi i parametrave të dataset-it:' : '# 2. Tune the dataset properties:'}
              </span>
              {generatedZfsCommands.map((cmd, idx) => (
                <div key={idx} className="text-emerald-400 pl-2">
                  {cmd}
                </div>
              ))}
            </div>

            {applyError && (
              <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs">
                {applyError}
              </div>
            )}
            {!applyError && selectedDisks.length < requiredDisks && (
              <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs">
                {sq
                  ? `${topology} kërkon të paktën ${requiredDisks} disqe. Janë zgjedhur ${selectedDisks.length}.`
                  : `${topology} needs at least ${requiredDisks} disks. ${selectedDisks.length} selected.`}
              </div>
            )}
            {isApplied && (
              <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {sq
                    ? `Pool '${poolName}' u krijua në ZFS.`
                    : `Pool '${poolName}' was created in ZFS.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-4 py-2 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            {t('wizard.prev')}
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 cursor-pointer"
            >
              {t('wizard.next')}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={isApplied || applying || selectedDisks.length < requiredDisks}
              className="px-6 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isApplied ? (lang === 'sq' ? 'U Aplikua në Sistem' : 'Applied in System') : t('wizard.createPool')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Play,
  Pause,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Layers,
  ChevronLeft,
  ChevronRight,
  Shield,
  Zap,
  Info,
  CalendarDays,
  X,
  AlertOctagon,
} from 'lucide-react';
import { Pool, ScrubSchedule, Language } from '../types/zfs';
import { TRANSLATIONS } from '../i18n/translations';
import { zfsApi } from '../services/zfsApi';

interface Props {
  pools: Pool[];
  lang?: Language;
  onClose?: () => void;
  isModal?: boolean;
}

export const ScrubScheduler: React.FC<Props> = ({
  pools,
  lang = 'sq',
  onClose,
  isModal = false,
}) => {
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;

  const [schedules, setSchedules] = useState<ScrubSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(9); // 0-indexed: 9 = October
  const [selectedCalendarYear, setSelectedCalendarYear] = useState(2026);
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week'>('month');
  const [copiedCode, setCopiedCode] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Form State for creating/editing a Cron scrub schedule
  const [formPool, setFormPool] = useState<string>(pools[0]?.name || '');
  const [formFrequency, setFormFrequency] = useState<'weekly' | 'biweekly' | 'monthly' | 'daily' | 'custom'>('weekly');
  const [formHour, setFormHour] = useState<number>(2);
  const [formMinute, setFormMinute] = useState<number>(0);
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(0); // 0=Sunday
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formCustomCron, setFormCustomCron] = useState<string>('0 2 * * 0');
  const [formMaxDuration, setFormMaxDuration] = useState<number>(6);
  const [formWindowStart, setFormWindowStart] = useState<string>('02:00');
  const [formWindowEnd, setFormWindowEnd] = useState<string>('08:00');
  const [formPriority, setFormPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [formAutoPause, setFormAutoPause] = useState<boolean>(true);
  const [formDescription, setFormDescription] = useState<string>('');

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const loadSchedules = async () => {
    try {
      setIsLoading(true);
      const data = await zfsApi.getScrubSchedules();
      setSchedules(data);
    } catch (err) {
      console.error('Error loading scrub schedules:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  useEffect(() => {
    if (!pools.some((pool) => pool.name === formPool)) {
      setFormPool(pools[0]?.name || '');
    }
  }, [pools, formPool]);

  // Compute cron expression from form selections
  const computedCron = (): string => {
    if (formFrequency === 'custom') return formCustomCron;
    if (formFrequency === 'daily') return `${formMinute} ${formHour} * * *`;
    if (formFrequency === 'weekly') return `${formMinute} ${formHour} * * ${formDayOfWeek}`;
    if (formFrequency === 'biweekly') return `${formMinute} ${formHour} 1,15 * *`;
    if (formFrequency === 'monthly') return `${formMinute} ${formHour} ${formDayOfMonth} * *`;
    return '0 2 * * 0';
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const cronExpr = computedCron();
      const newSchedule: Partial<ScrubSchedule> = {
        poolName: formPool,
        frequency: formFrequency,
        cronExpression: cronExpr,
        hour: formHour,
        minute: formMinute,
        dayOfWeek: formDayOfWeek,
        dayOfMonth: formDayOfMonth,
        enabled: true,
        priority: formPriority,
        maxDurationHours: formMaxDuration,
        maintenanceWindow: {
          startTime: formWindowStart,
          endTime: formWindowEnd,
          days: formFrequency === 'weekly' ? [['Dje', 'Hën', 'Mar', 'Mër', 'Enj', 'Pre', 'Sht'][formDayOfWeek]] : ['Dritare e rregullt'],
        },
        description: formDescription || `ZFS Pool Scrub Cron (${cronExpr})`,
        autoPauseOnHeavyLoad: formAutoPause,
      };

      const res = await zfsApi.saveScrubSchedule(newSchedule);
      setSchedules(res.schedules);
      setShowCreateModal(false);
      showNotice(lang === 'sq' ? 'Orari i scrub-it u ruajt me sukses!' : 'Scrub schedule saved successfully!');
    } catch (err: any) {
      alert(err.message || 'Deshtoi ruajtja');
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const updated = await zfsApi.toggleScrubSchedule(id);
      setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
      showNotice(
        updated.enabled
          ? (lang === 'sq' ? 'Orari u aktivizua!' : 'Schedule enabled!')
          : (lang === 'sq' ? 'Orari u ndalua (paused)!' : 'Schedule paused!')
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(lang === 'sq' ? 'A jeni i sigurt qe deshironi te fshini kete orar scrub-i?' : 'Delete this scrub schedule?')) return;
    try {
      const remaining = await zfsApi.deleteScrubSchedule(id);
      setSchedules(remaining);
      showNotice(lang === 'sq' ? 'Orari u fshi!' : 'Schedule deleted!');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await zfsApi.runScrubSchedule(id);
      showNotice(lang === 'sq' ? 'Scrub u nis menjehere per kete orar!' : 'Scrub started immediately!');
      loadSchedules();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Generate Crontab snippet
  const crontabSnippet = `# /etc/cron.d/zfs-pool-scrub
# Automated OpenZFS Scrub Maintenance Windows
# Generated by OpenZFS Enterprise Director
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

${schedules
  .map(
    (s) =>
      `# ${s.description || s.poolName} (Enabled: ${s.enabled})\n${s.enabled ? s.cronExpression : `# [PAUSED] ${s.cronExpression}`} root /sbin/zpool scrub ${s.poolName}`
  )
  .join('\n\n')}
`;

  // Calendar calculations for October 2026
  const monthNames = lang === 'sq'
    ? ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nentor', 'Dhjetor']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const daysOfWeek = lang === 'sq'
    ? ['E Dje', 'E Hën', 'E Mar', 'E Mër', 'E Enj', 'E Pre', 'E Sht']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Days in selected month
  const totalDaysInMonth = new Date(selectedCalendarYear, selectedCalendarMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(selectedCalendarYear, selectedCalendarMonth, 1).getDay();

  // Helper to check if a day in October 2026 has a scheduled scrub
  const getDaySchedules = (dayNum: number) => {
    const dateObj = new Date(selectedCalendarYear, selectedCalendarMonth, dayNum);
    const dayOfWeek = dateObj.getDay();

    const matches: Array<{ schedule: ScrubSchedule; type: 'scheduled' | 'maintenance' }> = [];
    schedules.forEach((s) => {
      if (!s.enabled) return;
      if (s.frequency === 'daily') {
        matches.push({ schedule: s, type: 'scheduled' });
      } else if (s.frequency === 'weekly' && s.dayOfWeek === dayOfWeek) {
        matches.push({ schedule: s, type: 'scheduled' });
      } else if (s.frequency === 'biweekly' && (dayNum === 1 || dayNum === 15)) {
        matches.push({ schedule: s, type: 'scheduled' });
      } else if (s.frequency === 'monthly' && s.dayOfMonth === dayNum) {
        matches.push({ schedule: s, type: 'scheduled' });
      }
    });
    return matches;
  };

  return (
    <div className={`space-y-6 ${isModal ? '' : 'p-4 sm:p-6 max-w-7xl mx-auto'}`}>
      {/* Toast Notification */}
      {actionNotice && (
        <div className="fixed top-18 right-6 z-50 px-4 py-2.5 rounded-lg bg-emerald-950/95 border border-emerald-500/70 text-emerald-200 text-xs font-semibold shadow-2xl animate-in fade-in slide-in-from-top-2">
          {actionNotice}
        </div>
      )}

      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-[#0c1326] border border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
              <span>cron.d / systemd.timer maintenance director</span>
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              {lang === 'sq' ? 'Planifikuesi i ZFS Scrub & Dritaret e Mirembajtjes' : 'ZFS Scrub Scheduler & Maintenance Windows'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {lang === 'sq'
                ? 'Konfiguro orare te perseritura me sintakse Cron dhe dritare te automatizuara kalendarike per verifikimin e checksum-eve'
                : 'Automate recurring cron jobs and calendar-based maintenance windows for zpool data integrity verification'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{lang === 'sq' ? 'Krijo Orar te Ri (Cron)' : 'New Scrub Schedule'}</span>
          </button>

          {isModal && onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">
            {lang === 'sq' ? 'ORARE TE KONFIGURUARA' : 'CONFIGURED SCHEDULES'}
          </span>
          <div className="text-xl font-bold font-mono text-white mt-1">{schedules.length}</div>
          <span className="text-[11px] text-emerald-400 font-mono">
            {schedules.filter((s) => s.enabled).length} {lang === 'sq' ? 'Aktive' : 'Active'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">
            {lang === 'sq' ? 'DRITARET E PREFERUARA' : 'PREFERRED WINDOW'}
          </span>
          <div className="text-xl font-bold font-mono text-sky-400 mt-1">02:00 - 08:00</div>
          <span className="text-[11px] text-slate-400 font-mono">
            {lang === 'sq' ? 'Trafik i ulet nate (Off-Peak)' : 'Low I/O off-peak hours'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">
            {lang === 'sq' ? 'EKZEKUTIMI I RADHES' : 'NEXT SCHEDULED RUN'}
          </span>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {schedules.find((s) => s.enabled)?.nextRun?.slice(5, 16) || 'None'}
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {schedules.find((s) => s.enabled)?.poolName || 'All Pools'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0b1224] border border-slate-800/80">
          <span className="text-xs text-slate-400 block font-mono">
            {lang === 'sq' ? 'MBROJTJA NGA MBINGARKESA' : 'OVERLOAD PROTECTION'}
          </span>
          <div className="text-xl font-bold font-mono text-emerald-400 mt-1">Auto-Throttle</div>
          <span className="text-[11px] text-slate-400 font-mono">
            {lang === 'sq' ? 'Pauzon nese I/O rritet' : 'Pauses on high tenant load'}
          </span>
        </div>
      </div>

      {/* Main Grid: Calendar Interface & Active Cron Schedules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Interactive Calendar Interface */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-[#0b1224] border border-slate-800/80 space-y-4 shadow-xl">
          {/* Calendar Header with Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-indigo-400" />
              <div>
                <h2 className="text-sm font-bold text-white">
                  {lang === 'sq' ? 'Kalendari i Mirembajtjes ZFS' : 'ZFS Maintenance Calendar'}
                </h2>
                <span className="text-[11px] text-slate-400 font-mono">
                  {monthNames[selectedCalendarMonth]} {selectedCalendarYear}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setCalendarViewMode('month')}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition cursor-pointer ${
                    calendarViewMode === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lang === 'sq' ? 'Muaj' : 'Month'}
                </button>
                <button
                  onClick={() => setCalendarViewMode('week')}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition cursor-pointer ${
                    calendarViewMode === 'week' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lang === 'sq' ? 'Javë' : 'Week'}
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (selectedCalendarMonth === 0) {
                      setSelectedCalendarMonth(11);
                      setSelectedCalendarYear((y) => y - 1);
                    } else {
                      setSelectedCalendarMonth((m) => m - 1);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                  title="Muaji i kaluar"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (selectedCalendarMonth === 11) {
                      setSelectedCalendarMonth(0);
                      setSelectedCalendarYear((y) => y + 1);
                    } else {
                      setSelectedCalendarMonth((m) => m + 1);
                    }
                  }}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                  title="Muaji i ardhshem"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Month Calendar Grid */}
          <div className="space-y-2">
            {/* Day of Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] text-slate-400 uppercase font-semibold">
              {daysOfWeek.map((d, i) => (
                <div key={i} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {/* Empty offset days */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-16 sm:h-20 rounded-lg bg-slate-950/30 border border-slate-900/60 opacity-30" />
              ))}

              {/* Month Days */}
              {Array.from({ length: totalDaysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const isToday = dayNum === 11 && selectedCalendarMonth === 9 && selectedCalendarYear === 2026;
                const dayEvents = getDaySchedules(dayNum);
                const hasScrub = dayEvents.length > 0;

                return (
                  <div
                    key={`day-${dayNum}`}
                    className={`h-16 sm:h-20 p-1.5 rounded-lg border flex flex-col justify-between transition-colors ${
                      isToday
                        ? 'bg-indigo-950/40 border-indigo-500/80 ring-1 ring-indigo-500/50'
                        : hasScrub
                        ? 'bg-slate-900/90 border-slate-700/80 hover:border-indigo-500/60'
                        : 'bg-slate-950/60 border-slate-800/60 hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[11px] font-mono font-bold ${
                          isToday ? 'text-indigo-400' : hasScrub ? 'text-white' : 'text-slate-400'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-mono uppercase px-1 rounded bg-indigo-500 text-white font-bold">
                          SOT
                        </span>
                      )}
                    </div>

                    {/* Events indicator pills */}
                    <div className="space-y-1">
                      {dayEvents.map((evt, idx) => (
                        <div
                          key={idx}
                          className="px-1.5 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-[9px] font-mono text-indigo-300 truncate flex items-center gap-1"
                          title={`${evt.schedule.poolName}: ${evt.schedule.maintenanceWindow.startTime} - ${evt.schedule.maintenanceWindow.endTime}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="truncate">{evt.schedule.poolName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-indigo-600 inline-block" />
                <span>{lang === 'sq' ? 'Dritare e Planifikuar Scrub-i' : 'Scheduled Scrub Window'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" />
                <span>{lang === 'sq' ? 'Integritet 100% OK' : 'Clean Audit Passed'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-indigo-950 border border-indigo-500 inline-block" />
                <span>{lang === 'sq' ? 'Data e Sotme' : 'Current Date'}</span>
              </div>
            </div>

            <span className="font-mono text-[11px] text-slate-500">
              {lang === 'sq' ? 'Koha e serverit: UTC' : 'Host Time: UTC'}
            </span>
          </div>
        </div>

        {/* Right Column (5 cols): Active Cron Jobs & Systemd Timers */}
        <div className="lg:col-span-5 space-y-4">
          {/* Active Schedules List */}
          <div className="p-5 rounded-2xl bg-[#0b1224] border border-slate-800/80 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  {lang === 'sq' ? 'Orare Aktive (Cron Jobs)' : 'Active Cron Jobs'}
                </h3>
              </div>
              <button
                onClick={loadSchedules}
                className="text-slate-400 hover:text-white text-xs flex items-center gap-1 cursor-pointer"
                title="Rifresko"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {schedules.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-xl">
                {lang === 'sq'
                  ? 'Nuk ka orare scrub-i te konfiguruara. Klikoni butonin me lart per te krijuar orarin e pare.'
                  : 'No scrub schedules found. Create your first scheduled job above.'}
              </div>
            ) : (
              <div className="space-y-3">
                {schedules.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      item.enabled
                        ? 'bg-[#070d1c] border-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/40 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white font-mono">{item.poolName}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                              item.enabled
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.enabled ? (lang === 'sq' ? 'Aktiv' : 'Enabled') : (lang === 'sq' ? 'Ndalur' : 'Paused')}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/40 uppercase">
                            {item.frequency}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{item.description}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Run Now */}
                        <button
                          onClick={() => handleRunNow(item.id)}
                          className="p-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-400 border border-emerald-800/40 cursor-pointer"
                          title={lang === 'sq' ? 'Ekzekuto Tani' : 'Run Now'}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        {/* Pause / Resume */}
                        <button
                          onClick={() => handleToggle(item.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                          title={item.enabled ? (lang === 'sq' ? 'Pauzo' : 'Pause') : (lang === 'sq' ? 'Aktivizo' : 'Enable')}
                        >
                          {item.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                        </button>
                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/40 cursor-pointer"
                          title={lang === 'sq' ? 'Fshi' : 'Delete'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 block text-[10px]">CRON SYNTAX:</span>
                        <code className="text-sky-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 inline-block mt-0.5">
                          {item.cronExpression}
                        </code>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">
                          {lang === 'sq' ? 'DRITARE E KOHES:' : 'WINDOW:'}
                        </span>
                        <span className="text-slate-300 font-sans text-xs">
                          {item.maintenanceWindow.startTime} - {item.maintenanceWindow.endTime} (max {item.maxDurationHours}h)
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Crontab & Systemd Preview */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0b1224] border border-slate-800/80 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-semibold">
                <FileCode className="w-4 h-4 text-sky-400" />
                /etc/cron.d/zfs-pool-scrub
              </span>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(crontabSnippet);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1 cursor-pointer transition"
              >
                {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode ? (lang === 'sq' ? 'U kopjua!' : 'Copied!') : (lang === 'sq' ? 'Kopjo' : 'Copy')}</span>
              </button>
            </div>

            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-900 text-slate-300 font-mono text-[10px] sm:text-xs overflow-x-auto leading-relaxed">
              {crontabSnippet}
            </pre>

            <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-800/30 text-[11px] text-slate-400 flex items-start gap-2">
              <Shield className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <p>
                {lang === 'sq'
                  ? 'Kjo skede sinkronizohet automatikisht me demonin zfs-director.sh ne /etc/cron.d/ per te garantuar ekzekutim te pavarur ne nivel OS.'
                  : 'This crontab is auto-synced by the zfs daemon at /etc/cron.d/ for zero-downtime execution without browser dependency.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CREATE SCRUB SCHEDULE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-xl bg-[#0c1222] border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/40">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {lang === 'sq' ? 'Krijo Orar te Ri ZFS Scrub (Cron)' : 'Create ZFS Scrub Schedule (Cron)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {lang === 'sq'
                      ? 'Percakto frekuencen, oren e dites dhe dritaren e mbrojtjes'
                      : 'Define frequency, start hour and maintenance window parameters'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
              {/* Pool Selection */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">
                  {lang === 'sq' ? 'Zgjidh Storage Pool:' : 'Target Storage Pool:'}
                </label>
                <select
                  value={formPool}
                  onChange={(e) => setFormPool(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                >
                  {pools.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.size} - {p.health})
                    </option>
                  ))}
                </select>
              </div>

              {/* Frequency Presets */}
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">
                  {lang === 'sq' ? 'Frekuenca e Perseritjes:' : 'Scrub Frequency:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'weekly', label: lang === 'sq' ? 'Cdo Jave' : 'Weekly' },
                      { id: 'biweekly', label: lang === 'sq' ? 'Cdo 2 Jave' : 'Bi-weekly' },
                      { id: 'monthly', label: lang === 'sq' ? 'Cdo Muaj' : 'Monthly' },
                      { id: 'custom', label: lang === 'sq' ? 'Custom Cron' : 'Custom' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormFrequency(f.id)}
                      className={`p-2 rounded-lg text-xs font-semibold border transition text-center cursor-pointer ${
                        formFrequency === f.id
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frequency-Specific Inputs */}
              {formFrequency === 'weekly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 block mb-1">
                      {lang === 'sq' ? 'Dita e Javes:' : 'Day of Week:'}
                    </label>
                    <select
                      value={formDayOfWeek}
                      onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    >
                      <option value={0}>{lang === 'sq' ? 'E Djele (0)' : 'Sunday (0)'}</option>
                      <option value={1}>{lang === 'sq' ? 'E Hene (1)' : 'Monday (1)'}</option>
                      <option value={5}>{lang === 'sq' ? 'E Premte (5)' : 'Friday (5)'}</option>
                      <option value={6}>{lang === 'sq' ? 'E Shtune (6)' : 'Saturday (6)'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-300 block mb-1">
                      {lang === 'sq' ? 'Ora e Fillimit (00-23):' : 'Start Hour (00-23):'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={formHour}
                      onChange={(e) => setFormHour(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {formFrequency === 'custom' && (
                <div>
                  <label className="text-slate-300 block mb-1">
                    {lang === 'sq' ? 'Sintaksa Standarde 5-Fushore Cron:' : 'Standard 5-Field Cron Expression:'}
                  </label>
                  <input
                    type="text"
                    value={formCustomCron}
                    onChange={(e) => setFormCustomCron(e.target.value)}
                    placeholder="0 2 * * 0"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sky-400 font-mono text-xs"
                  />
                  <span className="text-[10px] text-slate-500 font-mono mt-1 block">
                    minute (0-59) | hour (0-23) | day of month (1-31) | month (1-12) | day of week (0-6)
                  </span>
                </div>
              )}

              {/* Maintenance Window Parameters */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
                <div>
                  <label className="text-slate-300 block mb-1">
                    {lang === 'sq' ? 'Fillimi i Dritares:' : 'Window Start Time:'}
                  </label>
                  <input
                    type="time"
                    value={formWindowStart}
                    onChange={(e) => setFormWindowStart(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">
                    {lang === 'sq' ? 'Perfundimi i Dritares:' : 'Window End Time:'}
                  </label>
                  <input
                    type="time"
                    value={formWindowEnd}
                    onChange={(e) => setFormWindowEnd(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Max Duration & Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 block mb-1">
                    {lang === 'sq' ? 'Kohezgjatja Maksimale (ore):' : 'Max Duration (hours):'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={formMaxDuration}
                    onChange={(e) => setFormMaxDuration(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-300 block mb-1">
                    {lang === 'sq' ? 'Prioriteti i I/O:' : 'I/O Priority:'}
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  >
                    <option value="low">{lang === 'sq' ? 'I Ulet (Background Idle)' : 'Low (Idle)'}</option>
                    <option value="normal">{lang === 'sq' ? 'Normal (Standard)' : 'Normal (Standard)'}</option>
                    <option value="high">{lang === 'sq' ? 'I Larte (Fastest)' : 'High (Fastest)'}</option>
                  </select>
                </div>
              </div>

              {/* Auto pause toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="autoPauseCheck"
                  checked={formAutoPause}
                  onChange={(e) => setFormAutoPause(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="autoPauseCheck" className="text-slate-300 cursor-pointer">
                  {lang === 'sq'
                    ? 'Pauzo automatikisht scrub-in nese CPU/Disk I/O kalon 80% ngarkese'
                    : 'Auto-pause scrub if system CPU or Disk I/O load exceeds 80%'}
                </label>
              </div>

              {/* Live Preview */}
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-400">Generated Expression:</span>
                <span className="text-emerald-400 font-bold">{computedCron()}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                >
                  {lang === 'sq' ? 'Ruaj Orarin e Scrub-it' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

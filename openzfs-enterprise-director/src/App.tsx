/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { InfoBoxModal } from './components/InfoBoxModal';
import { DeviceInfoModal } from './components/DeviceInfoModal';
import { ConfirmDangerModal, ConfirmDangerData } from './components/ConfirmDangerModal';
import { DashboardView } from './components/DashboardView';
import { PoolsView } from './components/PoolsView';
import { DatasetsView } from './components/DatasetsView';
import { ArcCacheView } from './components/ArcCacheView';
import { SnapshotsView } from './components/SnapshotsView';
import { WizardView } from './components/WizardView';
import { ReportsAndTestsView } from './components/ReportsAndTestsView';
import { ScrubScheduler } from './components/ScrubScheduler';
import { LogsView } from './components/LogsView';
import { TerminalView } from './components/TerminalView';
import { DeploymentView } from './components/DeploymentView';
import { NodesView, SshNodeRow } from './components/NodesView';
import { SettingsModal } from './components/SettingsModal';
import { PackageInstallModal } from './components/PackageInstallModal';
import { SystemPackageInfo } from './types/zfs';
import { ZfsSendMigrationModal } from './components/ZfsSendMigrationModal';
import { zfsApi } from './services/zfsApi';
import { ZfsState, InfoBoxTopic, Dataset, DeviceSmartInfo, Language } from './types/zfs';
import { ZFS_KNOWLEDGE_BASE } from './data/zfsKnowledge';
import { Loader2, AlertTriangle } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<ZfsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const languageCodes: Language[] = ['sq', 'en', 'es', 'zh', 'hi', 'fr', 'de', 'ar'];
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('zfs_lang');
    return languageCodes.includes(saved as Language) ? (saved as Language) : 'sq';
  });

  const selectLanguage = (next: Language) => {
    setLang(next);
    localStorage.setItem('zfs_lang', next);
  };

  const toggleLanguage = () => {
    const index = languageCodes.indexOf(lang);
    selectLanguage(languageCodes[(index + 1) % languageCodes.length]);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [sshNodes, setSshNodes] = useState<SshNodeRow[]>([]);
  const [activeNodeId, setActiveNodeId] = useState('local');
  const [localNodeName, setLocalNodeName] = useState('localhost');

  // Mobile / Tablet Drawer State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Info Box state (Satisfies: "Ne web interface kur klikohet me mouse mbi nje menu duhet nje info box qe shfaqet me nje pershkrim te detajuar te funksionalitetit.")
  const [activeInfoTopic, setActiveInfoTopic] = useState<InfoBoxTopic | null>(null);
  const [autoOpenInfo, setAutoOpenInfo] = useState<boolean>(true);

  // Device Info Modal state (Satisfies: "Nga devices duhet te shfaqen edhe infot e device(duke klikuar tek Info)")
  const [selectedDeviceInfo, setSelectedDeviceInfo] = useState<DeviceSmartInfo | null>(null);

  // Critical Danger Confirmation Modal state (Satisfies: "Paralajmero nqf ne modifikohet device dhe kur fshihet devices.")
  const [dangerModalData, setDangerModalData] = useState<ConfirmDangerData | null>(null);

  // Settings Modal state (GPU-Offload, Web Worker, Desktop Alerts)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [systemPackages, setSystemPackages] = useState<SystemPackageInfo[]>([]);

  // ZFS Z-Send Stream Migration Modal state
  const [isZSendModalOpen, setIsZSendModalOpen] = useState(false);
  const [zsendDefaults, setZsendDefaults] = useState<{
    sourcePool?: string;
    sourceDataset?: string;
    snapshotName?: string;
  }>({});

  const handleOpenZSend = (sourcePool?: string, sourceDataset?: string, snapshotName?: string) => {
    setZsendDefaults({ sourcePool, sourceDataset, snapshotName });
    setIsZSendModalOpen(true);
  };

  // Notification / Toast
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const loadZfsState = async () => {
    setLoading(true);
    try {
      const data = await zfsApi.getStatus();
      setState(data);
      if (data.activeNode?.id) setActiveNodeId(data.activeNode.id);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Deshtoi lidhja me sherbimin ZFS');
    } finally {
      setLoading(false);
    }
  };

  const refreshPackages = async (openIfMissing: boolean) => {
    try {
      const res = await zfsApi.getSystemPackages();
      setSystemPackages(res.packages);
      const missing = res.packages.some((item) => !item.installed);
      const dismissed = sessionStorage.getItem('zfs_pkg_prompt') === 'dismissed';
      if (openIfMissing && missing && !dismissed) {
        setPackagesOpen(true);
      }
    } catch (err: any) {
      showNotification(err.message || 'Package check failed');
    }
  };

  const handleToggleDemo = async () => {
    const next = !(state?.demoMode ?? true);
    try {
      await zfsApi.setDemoMode(next);
      localStorage.setItem('zfs_demo', next ? 'on' : 'off');
      await loadZfsState();
      if (!next) {
        sessionStorage.removeItem('zfs_pkg_prompt');
        await refreshPackages(true);
      }
      showNotification(next ? (lang === 'sq' ? 'DEMO u ndez' : 'DEMO turned on') : (lang === 'sq' ? 'DEMO u fik' : 'DEMO turned off'));
    } catch (err: any) {
      showNotification(err.message || 'DEMO toggle failed');
    }
  };

  useEffect(() => {
    const boot = async () => {
      if (localStorage.getItem('zfs_demo') === 'off') {
        try {
          await zfsApi.setDemoMode(false);
        } catch {
          // Status still loads if the toggle endpoint is unavailable.
        }
      }
      await loadZfsState();
      await refreshNodes();
      await refreshPackages(true);
    };
    boot();
  }, []);

  const refreshNodes = async () => {
    try {
      const data = await zfsApi.listNodes();
      setSshNodes(data.nodes);
      setActiveNodeId(data.activeId);
      setLocalNodeName(data.local?.name || 'localhost');
    } catch (err: any) {
      showNotification(err.message || 'Node list failed');
    }
  };

  const handleSelectNode = async (id: string) => {
    await zfsApi.selectNode(id);
    setActiveNodeId(id);
    await loadZfsState();
  };

  const handleOpenInfo = (tabId: string) => {
    const topic = ZFS_KNOWLEDGE_BASE[tabId];
    if (topic) {
      setActiveInfoTopic(topic);
    }
  };

  // Inspect Device handler
  const handleInspectDevice = async (dev: string) => {
    try {
      const info = await zfsApi.getDeviceInfo(dev);
      setSelectedDeviceInfo(info);
    } catch (err: any) {
      showNotification(`Gabim ne marrjen e SMART info: ${err.message}`);
    }
  };

  // Device Action handler (Modify offline/online or Delete/remove)
  const handleDeviceAction = async (
    pool: string,
    dev: string,
    action: 'offline' | 'online' | 'remove' | 'detach'
  ) => {
    try {
      const res = await zfsApi.deviceAction(pool, dev, action);
      showNotification(res.message || `Pajisja ${dev} u procedua me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim me pajisjen: ${err.message}`);
    }
  };

  // Run Benchmark handler
  const handleRunBenchmark = async (poolName: string, testType: string) => {
    const result = await zfsApi.runBenchmark(poolName, testType);
    showNotification(`Testimi perfundoi: ${result.seq_read_mb_s} MB/s Read | ${result.rand_read_iops} IOPS`);
    loadZfsState();
    return result;
  };

  const handleServiceControl = async (action: 'start' | 'stop' | 'restart') => {
    try {
      const res = await zfsApi.controlService(action);
      showNotification(res.message || `Sherbimi u ekzekutua me veprimin: ${action}`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim: ${err.message}`);
    }
  };

  // Pool handlers
  const handleScrub = async (poolName: string, action: 'start' | 'stop' | 'pause' = 'start') => {
    try {
      await zfsApi.scrubPool(poolName, action);
      showNotification(`Scrub ${action} u startua per pool-in ${poolName}!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim scrub: ${err.message}`);
    }
  };

  const handleTrim = async (poolName: string) => {
    try {
      const res = await zfsApi.trimPool(poolName);
      showNotification(res.message || `TRIM u krye me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim TRIM: ${err.message}`);
    }
  };

  const handleAddVdev = async (poolName: string, data: { type: string; disks: string[]; desc?: string }) => {
    try {
      const res = await zfsApi.addVdev(poolName, data);
      showNotification(res.message || `VDEV ${data.type} u shtua me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim ne shtimin e VDEV: ${err.message}`);
    }
  };

  const handleDestroyPool = async (poolName: string) => {
    try {
      const res = await zfsApi.destroyPool(poolName);
      showNotification(res.message || `Pool '${poolName}' u fshi me sukses.`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim ne fshirjen e pool-it: ${err.message}`);
    }
  };

  // Dataset handlers
  const handleCreateDataset = async (data: Partial<Dataset>) => {
    try {
      const res = await zfsApi.createDataset(data);
      showNotification(res.message || `Dataset u krijua me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim: ${err.message}`);
    }
  };

  const handleUpdateDataset = async (name: string, properties: Record<string, string>) => {
    try {
      const res = await zfsApi.updateDataset(name, properties);
      showNotification(res.message || `Vetite u modifikuan me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim: ${err.message}`);
    }
  };

  const handleDestroyDataset = async (name: string) => {
    try {
      const res = await zfsApi.destroyDataset(name);
      showNotification(res.message || `Dataset u fshi me sukses.`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim ne fshirje: ${err.message}`);
    }
  };

  // Snapshot handlers
  const handleCreateSnapshot = async (dataset: string, snapName: string) => {
    try {
      const res = await zfsApi.createSnapshot(dataset, snapName);
      showNotification(res.message || `Snapshot u krijua me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim: ${err.message}`);
    }
  };

  const handleRollback = async (name: string) => {
    try {
      const res = await zfsApi.rollbackSnapshot(name);
      showNotification(res.message || `Rollback u krye me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim rollback: ${err.message}`);
    }
  };

  const handleDestroySnapshot = async (name: string) => {
    try {
      const res = await zfsApi.destroySnapshot(name);
      showNotification(res.message || `Snapshot u fshi.`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim: ${err.message}`);
    }
  };

  // ARC tuning handler
  const handlePersistArc = async (conf: string) => {
    const res = await zfsApi.persistArcConfig(conf);
    showNotification(res.message || 'Persistent ARC config saved.');
    return res;
  };

  const handleTuneArc = async (params: any) => {
    try {
      const res = await zfsApi.tuneArc(params);
      showNotification(res.message || `Parametrat e ARC u aplikuan me sukses!`);
      loadZfsState();
    } catch (err: any) {
      showNotification(`Gabim ne ARC tuning: ${err.message}`);
    }
  };

  // Wizard complete
  const handleWizardComplete = async (data: any) => {
    const res = await zfsApi.createPool(data);
    showNotification(res.message || `Pool '${data.name}' u krijua me sukses!`);
    await loadZfsState();
    setActiveTab('pools');
  };

  if (!state && loading) {
    return (
      <div className="min-h-screen bg-[#090d16] text-white flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" />
        <span className="text-sm font-mono text-slate-400">
          {lang === 'sq' ? 'Duke ngarkuar OpenZFS Enterprise Director...' : 'Loading OpenZFS Enterprise Director...'}
        </span>
      </div>
    );
  }

  if (!state && !loading) {
    return (
      <div className="min-h-screen bg-[#070b14] text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[#0c1326] border border-rose-800/80 rounded-2xl p-6 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-rose-950/80 border border-rose-700/60 text-rose-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white font-mono">
            {lang === 'sq' ? 'Lidhja me OpenZFS Server Dështoi' : 'Connection to OpenZFS Server Failed'}
          </h2>
          <p className="text-xs text-rose-300 font-mono">
            {error || (lang === 'sq' ? 'Nuk mund të lexohet gjendja e pool-eve ZFS.' : 'Unable to query ZFS pool telemetry.')}
          </p>
          <button
            onClick={loadZfsState}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-medium transition cursor-pointer"
          >
            {lang === 'sq' ? 'Riprovo Lidhjen' : 'Retry Connection'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] text-slate-100 select-none">
      {/* Sidebar Navigation (with Mobile / Tablet Drawer) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tabId) => setActiveTab(tabId)}
        onOpenInfo={handleOpenInfo}
        serviceStatus={state?.serviceStatus}
        isRealZfs={state?.isRealZfs ?? false}
        onServiceControl={handleServiceControl}
        autoOpenInfo={autoOpenInfo}
        onToggleAutoOpenInfo={() => setAutoOpenInfo((prev) => !prev)}
        lang={lang}
        onToggleLang={toggleLanguage}
        sshNodes={sshNodes}
        activeNodeId={activeNodeId}
        localNodeName={localNodeName}
        onSelectNode={handleSelectNode}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          activeTab={activeTab}
          onRefresh={loadZfsState}
          loading={loading}
          onOpenInfo={handleOpenInfo}
          onLaunchWizard={() => setActiveTab('wizard')}
          poolCount={state?.pools.length || 0}
          lang={lang}
          onToggleLang={toggleLanguage}
          onSelectLang={selectLanguage}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          demoMode={state?.demoMode !== false}
          onToggleDemo={handleToggleDemo}
          packagesMissing={systemPackages.some((item) => !item.installed)}
          onOpenPackages={() => setPackagesOpen(true)}
        />

        {/* Global Toast Notification */}
        {notification && (
          <div className="absolute top-18 right-6 z-50 px-4 py-2.5 rounded-lg bg-sky-950/95 border border-sky-500/60 text-sky-200 text-xs font-medium shadow-2xl shadow-sky-950 animate-in fade-in slide-in-from-top-2 duration-200">
            {notification}
          </div>
        )}

        {/* Error message banner if any */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Dynamic Viewport */}
        <main className="flex-1 overflow-y-auto">
          {state && (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  state={state}
                  onNavigate={(tab) => {
                    setActiveTab(tab);
                    if (autoOpenInfo) handleOpenInfo(tab);
                  }}
                  onScrub={(p) => handleScrub(p, 'start')}
                  onInspectDevice={handleInspectDevice}
                  lang={lang}
                />
              )}

              {activeTab === 'pools' && (
                <PoolsView
                  pools={state.pools}
                  availableDisks={state.availableDisks}
                  onScrub={handleScrub}
                  onTrim={handleTrim}
                  onAddVdev={handleAddVdev}
                  onDestroyPool={handleDestroyPool}
                  onOpenWizard={() => setActiveTab('wizard')}
                  onInspectDevice={handleInspectDevice}
                  onDeviceAction={handleDeviceAction}
                  lang={lang}
                  onOpenZSend={(pool) => handleOpenZSend(pool)}
                  onPoolImported={(poolName, msg) => {
                    showNotification(msg || `Pool '${poolName}' u importua me sukses!`);
                    loadZfsState();
                  }}
                  onRequestDangerConfirm={(data) => setDangerModalData({ ...data, isOpen: true })}
                />
              )}

              {activeTab === 'datasets' && (
                <DatasetsView
                  datasets={state.datasets}
                  pools={state.pools}
                  onCreateDataset={handleCreateDataset}
                  onUpdateDataset={handleUpdateDataset}
                  onDestroyDataset={handleDestroyDataset}
                  lang={lang}
                  onRequestDangerConfirm={(data) => setDangerModalData({ ...data, isOpen: true })}
                />
              )}

              {activeTab === 'arc' && (
                <ArcCacheView arc={state.arc} onTuneArc={handleTuneArc} onPersistConf={handlePersistArc} lang={lang} />
              )}

              {activeTab === 'snapshots' && (
                <SnapshotsView
                  snapshots={state.snapshots}
                  datasets={state.datasets}
                  onCreateSnapshot={handleCreateSnapshot}
                  onRollback={handleRollback}
                  onDestroySnapshot={handleDestroySnapshot}
                  lang={lang}
                  onOpenZSend={(pool, ds, snap) => handleOpenZSend(pool, ds, snap)}
                  onRequestDangerConfirm={(data) => setDangerModalData({ ...data, isOpen: true })}
                />
              )}

              {activeTab === 'wizard' && (
                <WizardView
                  availableDisks={state.availableDisks}
                  existingPools={state.pools}
                  onComplete={handleWizardComplete}
                  lang={lang}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsAndTestsView
                  pools={state.pools}
                  benchmarks={state.benchmarks || []}
                  reports={state.reports || []}
                  onRunBenchmark={handleRunBenchmark}
                  lang={lang}
                />
              )}

              {activeTab === 'scheduler' && (
                <ScrubScheduler
                  pools={state.pools}
                  lang={lang}
                />
              )}

              {activeTab === 'logs' && (
                <LogsView
                  pools={state.pools}
                  lang={lang}
                  onInspectDevice={handleInspectDevice}
                />
              )}

              {activeTab === 'terminal' && (
                <TerminalView onExecute={zfsApi.executeCommand} />
              )}

              {state.nodeError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs">
                  {state.nodeError}
                </div>
              )}
              {activeTab === 'nodes' && (
                <NodesView
                  lang={lang}
                  activeId={activeNodeId}
                  localName={localNodeName}
                  nodes={sshNodes}
                  onSelect={handleSelectNode}
                  onChanged={refreshNodes}
                />
              )}

              {activeTab === 'deployment' && (
                <DeploymentView
                  onServiceControl={handleServiceControl}
                  serviceRunning={state.serviceStatus?.daemonActive ?? true}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Contextual Architecture & Feature Info Box Modal */}
      <InfoBoxModal topic={activeInfoTopic} lang={lang} onClose={() => setActiveInfoTopic(null)} />

      {/* Device Info & SMART Health Modal */}
      <DeviceInfoModal
        deviceInfo={selectedDeviceInfo}
        onClose={() => setSelectedDeviceInfo(null)}
        lang={lang}
      />

      {/* Critical Storage Action Danger Confirmation Modal */}
      <ConfirmDangerModal
        data={dangerModalData}
        onClose={() => setDangerModalData(null)}
        lang={lang}
      />

      {/* Settings Modal (GPU-Offload, Web Worker telemetry & Desktop Alerts) */}
      <PackageInstallModal
        open={packagesOpen}
        lang={lang}
        packages={systemPackages}
        onClose={() => {
          sessionStorage.setItem('zfs_pkg_prompt', 'dismissed');
          setPackagesOpen(false);
        }}
        onInstalled={() => {
          refreshPackages(false);
          loadZfsState();
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        lang={lang}
        onToggleLang={toggleLanguage}
        onSelectLang={selectLanguage}
      />

      {/* ZFS Z-Send Stream Migration Engine Modal */}
      <ZfsSendMigrationModal
        isOpen={isZSendModalOpen}
        onClose={() => setIsZSendModalOpen(false)}
        pools={state?.pools || []}
        datasets={state?.datasets || []}
        snapshots={state?.snapshots || []}
        defaultSourcePool={zsendDefaults.sourcePool}
        defaultSourceDataset={zsendDefaults.sourceDataset}
        lang={lang}
        onMigrationComplete={() => {
          showNotification(
            lang === 'sq'
              ? 'Migrimi ZFS Z-Send përfundoi me sukses!'
              : 'ZFS Z-Send stream migration completed successfully!'
          );
          loadZfsState();
        }}
      />
    </div>
  );
}

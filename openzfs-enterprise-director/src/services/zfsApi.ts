import {
  ZfsState,
  Pool,
  Dataset,
  Snapshot,
  ArcStats,
  LogEntry,
  LogFilterParams,
  ScrubSchedule,
  PastScrubRecord,
  DriveHealthSummary,
  ZfsResourceUtilization,
  ResourceUsagePoint,
  AggregateIoResponse,
  AggregateIoTelemetryPoint,
  ZfsPoolExportPackage,
  ZfsMultiPoolExportPackage,
  ZfsImportRequest,
  ZfsImportResponse,
  SmartFleetTrendResponse,
  ZSendMigrationRequest,
  ZSendStreamProgress,
  SystemHardwareInfo,
  SystemPackageInfo,
} from '../types/zfs';

export const zfsApi = {
  async setDemoMode(enabled: boolean): Promise<{ demoMode: boolean }> {
    const res = await fetch('/api/system/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi ndryshimi i modalitetit DEMO');
    return json;
  },

  async getSystemPackages(): Promise<{ packages: SystemPackageInfo[]; missing: string[] }> {
    const res = await fetch('/api/system/packages');
    if (!res.ok) throw new Error('Deshtoi kontrolli i paketave');
    return res.json();
  },

  async startPackageInstall(packages: string[]): Promise<string> {
    const res = await fetch('/api/system/packages/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packages }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi nisja e instalimit');
    return json.jobId as string;
  },

  async getPackageInstall(jobId: string): Promise<{ log: string; done: boolean; code: number | null }> {
    const res = await fetch(`/api/system/packages/install/${jobId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi leximi i instalimit');
    return { log: json.log || '', done: Boolean(json.done), code: json.code ?? null };
  },

  async getStatus(): Promise<ZfsState> {
    const res = await fetch('/api/zfs/status', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Deshtoi marrja e statusit ZFS');
    return res.json();
  },

  async createPool(data: {
    name: string;
    ashift: number;
    topology: string;
    disks: string[];
    slogDisks?: string[];
    l2arcDisks?: string[];
    specialDisks?: string[];
    spareDisks?: string[];
    compression?: string;
    recordsize?: string;
  }): Promise<{ status: string; pool: Pool; message: string }> {
    const res = await fetch('/api/zfs/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi krijimi i pool-it');
    return json;
  },

  async scrubPool(name: string, action: 'start' | 'stop' | 'pause'): Promise<any> {
    const res = await fetch(`/api/zfs/pools/${encodeURIComponent(name)}/scrub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi veprimi i scrub');
    return json;
  },

  async trimPool(name: string): Promise<any> {
    const res = await fetch(`/api/zfs/pools/${encodeURIComponent(name)}/trim`, {
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi TRIM i pool-it');
    return json;
  },

  async addVdev(name: string, data: { type: string; disks: string[]; desc?: string }): Promise<any> {
    const res = await fetch(`/api/zfs/pools/${encodeURIComponent(name)}/vdev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi shtimi i VDEV');
    return json;
  },

  async destroyPool(name: string): Promise<any> {
    const res = await fetch(`/api/zfs/pools/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi fshirja e pool-it');
    return json;
  },

  async createDataset(data: Partial<Dataset>): Promise<{ status: string; dataset: Dataset; message: string }> {
    const res = await fetch('/api/zfs/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi krijimi i dataset-it');
    return json;
  },

  async updateDataset(name: string, properties: Record<string, string>): Promise<{ status: string; dataset: Dataset; message: string }> {
    const res = await fetch('/api/zfs/datasets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, properties }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi perditesimi i vetive');
    return json;
  },

  async destroyDataset(name: string): Promise<any> {
    const res = await fetch('/api/zfs/datasets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi fshirja e dataset-it');
    return json;
  },

  async createSnapshot(dataset: string, snapName: string): Promise<any> {
    const res = await fetch('/api/zfs/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset, snapName }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi krijimi i snapshot-it');
    return json;
  },

  async rollbackSnapshot(name: string): Promise<any> {
    const res = await fetch('/api/zfs/snapshots/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi rollback');
    return json;
  },

  async destroySnapshot(name: string): Promise<any> {
    const res = await fetch('/api/zfs/snapshots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi fshirja e snapshot-it');
    return json;
  },

  async tuneArc(params: {
    zfs_arc_max?: number;
    zfs_arc_min?: number;
    l2arc_write_max?: number;
    l2arc_noprefetch?: number;
  }): Promise<{ status: string; arc: ArcStats; modprobeConf: string; message: string }> {
    const res = await fetch('/api/zfs/arc/tune', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi konfigurimi i ARC');
    return json;
  },

  async persistArcConfig(conf: string): Promise<{ status: string; message: string; backup: string | null; initrdBackup: string | null; written: string }> {
    const res = await fetch('/api/zfs/arc/persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conf }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to save the persistent ARC config');
    return json;
  },

  async executeCommand(command: string): Promise<{ command: string; output: string; exitCode: number }> {
    const res = await fetch('/api/zfs/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi ekzekutimi i komandes');
    return json;
  },

  async controlService(action: 'start' | 'stop' | 'restart'): Promise<any> {
    const res = await fetch(`/api/zfs/service/${action}`, {
      method: 'POST',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi kontrolli i sherbimit');
    return json;
  },

  async getPackageInfo(): Promise<{ rootDirectory: string; files: Array<{ path: string; desc: string; type: string }> }> {
    const res = await fetch('/api/zfs/package');
    if (!res.ok) throw new Error('Deshtoi marrja e te dhenave te paketes');
    return res.json();
  },

  async getDeviceInfo(dev: string): Promise<any> {
    const encoded = encodeURIComponent(dev.replace(/\//g, '_'));
    const res = await fetch(`/api/zfs/devices/${encoded}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Deshtoi marrja e informacionit te pajisjes');
    return json.deviceInfo;
  },

  async runBenchmark(pool: string, testType: string): Promise<any> {
    const res = await fetch('/api/zfs/benchmark/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool, testType }),
    });
    if (!res.ok) throw new Error('Deshtoi ekzekutimi i benchmark-ut');
    const json = await res.json();
    return json.result;
  },

  async getResourceUsage(): Promise<{ current: ResourceUsagePoint; history: ResourceUsagePoint[] }> {
    const res = await fetch('/api/zfs/telemetry/resource-usage');
    if (!res.ok) throw new Error('Deshtoi marrja e perdorimit te burimeve');
    const json = await res.json();
    return { current: json.current, history: json.history || [] };
  },

  async getRealtimeTelemetry(): Promise<any> {
    const res = await fetch('/api/zfs/telemetry/realtime');
    if (!res.ok) throw new Error('Deshtoi marrja e telemetrise');
    const json = await res.json();
    return json.point;
  },

  async deviceAction(
    pool: string,
    dev: string,
    action: 'offline' | 'online' | 'remove' | 'detach'
  ): Promise<{ status: string; message: string; pool: any }> {
    const res = await fetch('/api/zfs/devices/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pool, dev, action }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Deshtoi veprimi me pajisjen');
    return json;
  },

  async getLogs(params: LogFilterParams = {}): Promise<{
    logs: LogEntry[];
    total: number;
    stats: { errorCount: number; warnCount: number; infoCount: number; debugCount: number };
  }> {
    const searchParams = new URLSearchParams();
    if (params.level && params.level !== 'all') searchParams.set('level', params.level);
    if (params.source && params.source !== 'all') searchParams.set('source', params.source);
    if (params.pool && params.pool !== 'all') searchParams.set('pool', params.pool);
    if (params.search) searchParams.set('search', params.search);
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.since) searchParams.set('since', String(params.since));

    const url = `/api/zfs/logs${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Deshtoi marrja e regjistrave te sistemit');
    return res.json();
  },

  async clearLogs(): Promise<{ status: string; message: string }> {
    const res = await fetch('/api/zfs/logs/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Deshtoi pastrimi i regjistrave');
    return res.json();
  },

  async generateTestLog(data: { level?: string; message?: string; source?: string; pool?: string }): Promise<any> {
    const res = await fetch('/api/zfs/logs/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Deshtoi krijimi i test event-it');
    return res.json();
  },

  async getScrubSchedules(): Promise<ScrubSchedule[]> {
    const res = await fetch('/api/zfs/scrub-schedules');
    if (!res.ok) throw new Error('Deshtoi marrja e orareve te scrub-it');
    const data = await res.json();
    return data.schedules;
  },

  async saveScrubSchedule(schedule: Partial<ScrubSchedule>): Promise<{ schedule: ScrubSchedule; schedules: ScrubSchedule[] }> {
    const res = await fetch('/api/zfs/scrub-schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schedule),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Deshtoi ruajtja e orarit te scrub-it');
    }
    return res.json();
  },

  async deleteScrubSchedule(id: string): Promise<ScrubSchedule[]> {
    const res = await fetch(`/api/zfs/scrub-schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Deshtoi fshirja e orarit te scrub-it');
    const data = await res.json();
    return data.schedules;
  },

  async toggleScrubSchedule(id: string): Promise<ScrubSchedule> {
    const res = await fetch(`/api/zfs/scrub-schedules/${id}/toggle`, { method: 'POST' });
    if (!res.ok) throw new Error('Deshtoi ndryshimi i statusit te orarit');
    const data = await res.json();
    return data.schedule;
  },

  async runScrubSchedule(id: string): Promise<any> {
    const res = await fetch(`/api/zfs/scrub-schedules/${id}/run`, { method: 'POST' });
    if (!res.ok) throw new Error('Deshtoi nisja e menjehershme e scrub-it');
    return res.json();
  },

  async getScrubHistory(pool?: string): Promise<PastScrubRecord[]> {
    const url = pool && pool !== 'all' ? `/api/zfs/scrub-history?pool=${encodeURIComponent(pool)}` : '/api/zfs/scrub-history';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Deshtoi marrja e historikut te scrub-it');
    const data = await res.json();
    return data.history;
  },

  async getDrivesHealthSummary(): Promise<{
    totalDrives: number;
    optimalCount: number;
    warningCount: number;
    criticalCount: number;
    nearThresholdCount: number;
    drives: DriveHealthSummary[];
  }> {
    const res = await fetch('/api/zfs/drives/health-summary');
    if (!res.ok) throw new Error('Deshtoi marrja e permbledhjes se shendetit te disqeve');
    return res.json();
  },

  async getResourceUtilization(): Promise<ZfsResourceUtilization> {
    const res = await fetch('/api/zfs/telemetry/resource-utilization');
    if (!res.ok) throw new Error('Deshtoi marrja e perdorimit te CPU & RAM per ZFS');
    const data = await res.json();
    return data.data;
  },

  async getAggregateIoTelemetry(): Promise<AggregateIoResponse> {
    const res = await fetch('/api/zfs/telemetry/aggregate-io');
    if (!res.ok) throw new Error('Deshtoi marrja e telemetrise se agreguar te IOPS & Throughput');
    return res.json();
  },

  async exportPoolConfig(poolName: string): Promise<ZfsPoolExportPackage> {
    const res = await fetch(`/api/zfs/pools/${encodeURIComponent(poolName)}/export`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Deshtoi eksportimi i konfigurimit per '${poolName}'`);
    }
    return res.json();
  },

  async exportAllPoolsConfig(): Promise<ZfsMultiPoolExportPackage> {
    const res = await fetch('/api/zfs/pools/export-all');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Deshtoi eksportimi i paketave te te gjitha pooleve');
    }
    return res.json();
  },

  async importPoolConfig(data: ZfsImportRequest): Promise<ZfsImportResponse> {
    const res = await fetch('/api/zfs/pools/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Deshtoi importimi i konfigurimit te pool-it');
    }
    return result;
  },

  async getSmartTrends(): Promise<SmartFleetTrendResponse> {
    const res = await fetch('/api/zfs/drives/smart-trends');
    if (!res.ok) throw new Error('Deshtoi marrja e trendeve historike SMART');
    return res.json();
  },

  async simulateDegradationAcceleration(dev?: string, accelerate?: boolean): Promise<{ status: string; message: string; drive: any }> {
    const res = await fetch('/api/zfs/drives/simulate-acceleration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dev, accelerate }),
    });
    if (!res.ok) throw new Error('Deshtoi simulimi i degradimit te pershpejtuar SMART');
    return res.json();
  },

  async startZSendMigration(
    data: ZSendMigrationRequest
  ): Promise<{ status: string; message: string; migration: ZSendStreamProgress }> {
    const res = await fetch('/api/zfs/zsend/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || 'Deshtoi nisja e migrimit ZFS Z-Send');
    }
    return result;
  },

  async getActiveZSendMigration(): Promise<{
    activeMigration: ZSendStreamProgress | null;
    history: ZSendStreamProgress[];
  }> {
    const res = await fetch('/api/zfs/zsend/active');
    if (!res.ok) throw new Error('Deshtoi marrja e statusit aktiv te Z-Send');
    return res.json();
  },

  async getZSendStatus(migrationId: string): Promise<{ migration: ZSendStreamProgress }> {
    const res = await fetch(`/api/zfs/zsend/status/${encodeURIComponent(migrationId)}`);
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Migrimi Z-Send nuk u gjet');
    return result;
  },

  async abortZSendMigration(migrationId: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`/api/zfs/zsend/abort/${encodeURIComponent(migrationId)}`, {
      method: 'POST',
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || 'Deshtoi nderprerja e migrimit Z-Send');
    return result;
  },

  async listNodes(): Promise<{ activeId: string; local: { id: string; name: string; host: string }; nodes: Array<{ id: string; name: string; host: string; port: number; user: string; auth: string; hasPassword: boolean; hasKey: boolean }> }> {
    const res = await fetch('/api/nodes');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to list nodes');
    return json;
  },

  async addNode(body: { name: string; host: string; port: number; user: string; password?: string; privateKey?: string; identityFile?: string }): Promise<{ node: { id: string; name: string; host: string } }> {
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to add node');
    return json;
  },

  async deleteNode(id: string): Promise<void> {
    const res = await fetch(`/api/nodes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to remove node');
  },

  async testNode(id: string): Promise<{ hostname: string; output: string }> {
    const res = await fetch(`/api/nodes/${encodeURIComponent(id)}/test`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'SSH connection failed');
    return json;
  },

  async selectNode(id: string): Promise<void> {
    const res = await fetch('/api/nodes/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to select node');
  },

  async getSystemHardware(): Promise<SystemHardwareInfo> {
    const res = await fetch('/api/zfs/system/hardware');
    if (!res.ok) throw new Error('Deshtoi marrja e telemetrise se harduerit dhe periferikeve');
    const data = await res.json();
    return data.hardware;
  },
};



export interface Vdev {
  type: string;
  name: string;
  status: string;
  disks: string[];
  desc?: string;
  capacity?: string;
}

export interface Pool {
  name: string;
  guid: string;
  health: string;
  size: string;
  allocated: string;
  free: string;
  frag: string;
  dedup: string;
  ashift: number;
  status: string;
  scrub_status: string;
  scrub_active: boolean;
  last_scrub: string;
  vdevs: Vdev[];
}

export interface Dataset {
  name: string;
  type: 'filesystem' | 'volume';
  mountpoint: string;
  used: string;
  avail: string;
  refer: string;
  compression: string;
  compressratio: string;
  recordsize: string;
  atime: string;
  dedup: string;
  quota: string;
  encryption: string;
  readonly: string;
  volsize?: string;
  volblocksize?: string;
}

export interface Snapshot {
  name: string;
  used: string;
  refer: string;
  creation: string;
}

export interface ArcStats {
  size: number;
  c_max: number;
  c_min: number;
  hits: number;
  misses: number;
  hit_ratio: number;
  mru_size: number;
  mfu_size: number;
  data_size: number;
  metadata_size: number;
  l2_size: number;
  l2_hits: number;
  l2_misses: number;
  l2_hit_ratio: number;
  tunables: {
    zfs_arc_max: number;
    zfs_arc_min: number;
    l2arc_write_max: number;
    l2arc_noprefetch: number;
    zfs_arc_sys_free: number;
  };
}

export interface DiskItem {
  dev: string;
  size: string;
  type: string;
  model: string;
  serial: string;
}

export interface DeviceSmartInfo {
  dev: string;
  model: string;
  serial: string;
  firmware: string;
  bus_type: string;
  capacity: string;
  sector_size: number | null;
  smart_status: string;
  smart_available?: boolean;
  smart_note?: string;
  requested?: string;
  temperature_c: number | null;
  power_on_hours: number | null;
  wear_level_pct: number | null;
  tbw_written: string;
  trim_supported: boolean | null;
  plp_supported: boolean | null;
  rotation_rate: string;
  partitions: string[];
  reallocated_sectors?: number | null;
  pending_sectors?: number | null;
  health_score_pct?: number | null;
  history?: SmartTrendPoint[];
}

export interface BenchmarkResult {
  id: string;
  pool: string;
  test_type: string;
  seq_read_mb_s: number;
  seq_write_mb_s: number;
  rand_read_iops: number;
  rand_write_iops: number;
  avg_latency_ms: number;
  arc_hit_pct: number;
  timestamp: string;
}

export interface ReportItem {
  id: string;
  title: string;
  type: 'scrub' | 'capacity' | 'benchmark' | 'audit';
  date: string;
  status: 'nominal' | 'warning' | 'optimal';
  summary: string;
  details: Record<string, string>;
}

export interface TelemetryPoint {
  timestamp: number;
  cpuPct: number;
  memoryPct: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  arcSizeGb: number;
  arcHitPct: number;
  iopsRead: number;
  iopsWrite: number;
  totalIops: number;
}

export interface ResourceUsagePoint {
  timestamp: number;
  timeLabel: string;
  cpuPct: number;
  memoryPct: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  arcHits: number;
  arcMisses: number;
  arcHitPct: number;
}

export interface ServiceStatus {
  daemonActive: boolean;
  pid: number;
  kernelModuleLoaded: boolean;
  uptime: string;
  installedPath: string;
  rustServerAvailable: boolean;
}

export interface SystemPackageInfo {
  id: string;
  label: string;
  description: string;
  required: boolean;
  installed: boolean;
  bins: string[];
}

export interface ZfsState {
  status: string;
  demoMode?: boolean;
  runtime?: string;
  isRealZfs: boolean;
  pools: Pool[];
  datasets: Dataset[];
  snapshots: Snapshot[];
  arc: ArcStats;
  availableDisks: DiskItem[];
  serviceStatus: ServiceStatus;
  benchmarks: BenchmarkResult[];
  reports: ReportItem[];
  nodeError?: string;
  activeNode?: { id: string; name: string; host: string; via: 'local' | 'ssh' };
}

export interface InfoBoxTopic {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  keyConcepts: { label: string; description: string }[];
  shellCommands: string[];
  bestPractices: string[];
  architectureNote: string;
}

export type Language = 'sq' | 'en' | 'es' | 'zh' | 'hi' | 'fr' | 'de' | 'ar';

export interface HealthScoreFactor {
  label: string;
  impact: string;
  status: 'ok' | 'warning' | 'critical';
}

export interface ZfsHealthScoreBreakdown {
  overallScore: number; // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'OPTIMAL' | 'GOOD' | 'ATTENTION' | 'WARNING' | 'CRITICAL';
  poolTopologyScore: number; // 0-100 (40% weight)
  scrubIntegrityScore: number; // 0-100 (30% weight)
  smartDeviceScore: number; // 0-100 (30% weight)
  poolFactors: HealthScoreFactor[];
  scrubFactors: HealthScoreFactor[];
  smartFactors: HealthScoreFactor[];
  recommendations: string[];
}

export interface PeripheralDevice {
  id: string;
  name: string;
  category: 'HBA' | 'NVMe_Switch' | 'NIC' | 'BMC' | 'PSU' | 'FAN' | 'PCIe';
  model: string;
  busInterface: string;
  linkSpeed: string;
  firmwareVersion: string;
  temperatureC?: number;
  status: 'ONLINE' | 'STANDBY' | 'WARNING' | 'CRITICAL';
  details: string;
  connectedDevices?: string[];
}

export interface SystemHardwareInfo {
  hostname: string;
  kernelVersion: string;
  zfsModuleVersion: string;
  osDistribution: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  cpuThreads: number;
  cpuFreqGhz: number;
  cpuLoadAvg: [number, number, number];
  systemUptime: string;
  totalMemoryGb: number;
  freeMemoryGb: number;
  eccErrors: number;
  motherboard: string;
  ipmiStatus: string;
  peripherals: PeripheralDevice[];
  chassisThermal: {
    intakeTempC: number;
    exhaustTempC: number;
    fanRpmAvg: number;
    psuLoadWatts: number;
    psuEfficiencyPct: number;
  };
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogSource = 'all' | 'zfs-kernel' | 'zed' | 'storage-director' | 'smartd' | 'sanoid' | 'system';

export interface LogEntry {
  id: string;
  timestamp: string;
  epochMs: number;
  level: LogLevel;
  source: string;
  subsystem?: string;
  pool?: string;
  message: string;
  raw?: string;
}

export interface LogFilterParams {
  level?: string;
  source?: string;
  pool?: string;
  search?: string;
  limit?: number;
  since?: number;
}

export type ScrubFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface ScrubSchedule {
  id: string;
  poolName: string;
  frequency: ScrubFrequency;
  cronExpression: string;
  dayOfWeek?: number; // 0=Sunday, 6=Saturday
  dayOfMonth?: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  enabled: boolean;
  priority: 'low' | 'normal' | 'high';
  maxDurationHours: number;
  maintenanceWindow: {
    startTime: string; // "02:00"
    endTime: string; // "06:00"
    days: string[]; // ["Sun", "Sat"]
  };
  nextRun: string;
  lastRun?: string;
  lastStatus?: 'SUCCESS' | 'WARNING' | 'FAILED' | 'SKIPPED' | 'NEVER';
  description?: string;
  autoPauseOnHeavyLoad?: boolean;
}

export interface PastScrubRecord {
  id: string;
  poolName: string;
  date: string;
  durationMinutes: number;
  durationFormatted: string;
  dataScrubbedTb: number;
  rateMbS: number;
  checksumErrors: number;
  readErrors: number;
  writeErrors: number;
  repairedBytes: number;
  status: 'COMPLETED' | 'WARNING' | 'DEGRADED';
  degradationRiskPct: number; // 0-100%
  hardwareNote?: string;
}

export interface SmartTrendPoint {
  timestamp: number;
  timeLabel: string;
  reallocatedSectors: number;
  pendingSectors: number;
  healthScorePct: number;
  temperatureC: number;
  wearLevelPct: number;
}

export interface DriveSmartHistoricalTrend {
  dev: string;
  model: string;
  serial: string;
  pool: string;
  vdev: string;
  type: 'NVMe' | 'HDD' | 'SSD';
  currentHealthScore: number;
  currentReallocated: number;
  currentPending: number;
  currentTemp: number;
  historicalBaselineRate: number; // e.g., baseline degradation slope
  recentDegradationRate: number; // current degradation rate
  accelerationFactor: number; // e.g. 4.5x above baseline
  isAccelerating: boolean;
  accelerationSeverity: 'NORMAL' | 'ELEVATED' | 'CRITICAL';
  accelerationReason?: string;
  history: SmartTrendPoint[];
  lastChecked: number;
}

export interface SmartFleetTrendResponse {
  timestamp: number;
  drives: DriveSmartHistoricalTrend[];
  acceleratingDrivesCount: number;
  totalMonitoredDrives: number;
  fleetStatus: 'HEALTHY' | 'WARNING_ACCELERATION' | 'CRITICAL';
}

export interface DriveHealthSummary {
  dev: string;
  pool: string;
  vdev: string;
  model: string;
  serial: string;
  type: 'NVMe' | 'HDD' | 'SSD';
  healthScorePct: number; // 0-100%
  status: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
  temperatureC: number;
  tempStatus: 'nominal' | 'warning' | 'critical';
  reallocatedSectors: number;
  pendingSectors: number;
  powerOnHours: number;
  wearLevelPct: number; // remaining endurance (100% = new, < 10% = nearing threshold)
  nearFailureThreshold: boolean;
  failureRiskReason?: string;
  tbwWritten: string;
  plpSupported: boolean;
  isAccelerating?: boolean;
  accelerationFactor?: number;
  historicalTrend?: SmartTrendPoint[];
}

export interface ZfsCpuBreakdown {
  totalPct: number;
  zfsTotalPct: number;
  metadataPct: number; // SPA, dnodes, B-tree traversing
  dataPct: number; // ZIO pipeline, compression (LZ4/ZSTD), checksumming (Fletcher4)
  txgSyncPct: number; // txg_sync commit threads
  storageIoWaitPct: number; // NVMe / SAS queue & interrupts
  otherSysPct: number; // OS & system daemons
}

export interface ZfsRamBreakdown {
  totalRamBytes: number;
  totalRamGb: number;
  usedRamBytes: number;
  usedRamGb: number;
  freeRamGb: number;
  arcTotalBytes: number;
  arcTotalGb: number;
  arcTargetGb: number;
  arcMetadataBytes: number;
  arcMetadataGb: number;
  arcMetadataPct: number; // % of ARC used for metadata
  arcDataBytes: number;
  arcDataGb: number;
  arcDataPct: number; // % of ARC used for user data
  arcDirtyBytes: number;
  arcDirtyMb: number; // Dirty unwritten TXG payload
  arcGhostBytes: number;
  arcGhostMb: number;
  systemAppsGb: number;
  kernelOverheadGb: number;
}

export interface ZfsActiveOps {
  metadataOpsPerSec: number;
  dataOpsPerSec: number;
  totalIops: number;
  txgNumber: number;
  txgState: 'OPEN' | 'QUIESCING' | 'WAITING' | 'SYNCING';
  compressionRatio: number;
  compressionSavingsGb: number;
  throughputReadMbS: number;
  throughputWriteMbS: number;
}

export interface ZfsResourceUtilization {
  timestamp: number;
  cpu: ZfsCpuBreakdown;
  ram: ZfsRamBreakdown;
  ops: ZfsActiveOps;
}

export interface PoolIoMetric {
  poolName: string;
  readIops: number;
  writeIops: number;
  totalIops: number;
  readThroughputMb: number;
  writeThroughputMb: number;
  totalThroughputMb: number;
}

export interface AggregateIoTelemetryPoint {
  timestamp: number;
  timeLabel: string;
  readIops: number;
  writeIops: number;
  totalIops: number;
  readThroughputMb: number;
  writeThroughputMb: number;
  totalThroughputMb: number;
  readLatencyMs: number;
  writeLatencyMs: number;
  pools: PoolIoMetric[];
}

export interface AggregateIoResponse {
  current: AggregateIoTelemetryPoint;
  history: AggregateIoTelemetryPoint[];
}

export interface ZfsPoolProperties {
  autoexpand?: string;
  autoreplace?: string;
  failmode?: string;
  dedup?: string;
  delegation?: string;
  listsnapshots?: string;
  multihost?: string;
  ashift: number;
}

export interface ZfsPoolExportPackage {
  formatVersion: 'openzfs-v2.2-export/1.0';
  exportedAt: string;
  systemMetadata: {
    hostname: string;
    os: string;
    kernel: string;
    zfsVersion: string;
    generator: string;
  };
  pool: {
    name: string;
    guid: string;
    health: string;
    size: string;
    allocated?: string;
    free?: string;
    frag?: string;
    dedup?: string;
    ashift: number;
    status: string;
    properties: ZfsPoolProperties;
    vdevs: Vdev[];
  };
  datasets: Dataset[];
  snapshots: Snapshot[];
  scrubSchedules?: any[];
  reconstructedCommands: {
    zpoolCreate: string;
    zfsDatasets: string[];
    importInstruction: string;
  };
}

export interface ZfsMultiPoolExportPackage {
  formatVersion: 'openzfs-v2.2-export/1.0';
  exportedAt: string;
  systemMetadata: {
    hostname: string;
    os: string;
    kernel: string;
    zfsVersion: string;
    generator: string;
  };
  pools: ZfsPoolExportPackage[];
}

export interface ZfsImportRequest {
  config: ZfsPoolExportPackage | ZfsMultiPoolExportPackage | any;
  mode: 'disaster_recovery' | 'clone';
  cloneAsName?: string;
  mountpointPrefix?: string;
  dryRun?: boolean;
  overwrite?: boolean;
  selectedDisks?: string[];
}

export interface ZfsImportResponse {
  valid: boolean;
  status: 'success' | 'warning' | 'error';
  message: string;
  poolName: string;
  summary?: {
    originalName: string;
    targetName: string;
    mode: 'disaster_recovery' | 'clone';
    vdevCount: number;
    datasetCount: number;
    diskCount: number;
    estimatedSize: string;
    commandPreview: string;
  };
  warnings?: string[];
  pool?: Pool;
  datasetsCreated?: number;
}

export type ZSendPhase =
  | 'QUEUED'
  | 'INITIALIZING'
  | 'STREAMING_SNAPSHOT'
  | 'VERIFYING_CHECKSUM'
  | 'FINALIZING_RECEIVE'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export interface ZSendMigrationRequest {
  sourcePool: string;
  sourceDataset: string;
  snapshotName?: string;
  targetPool: string;
  targetDataset: string;
  isIncremental?: boolean;
  baseSnapshot?: string;
  rawCompressed?: boolean;
  forceOverwrite?: boolean;
  preserveProperties?: boolean;
}

export interface ZSendStreamProgress {
  migrationId: string;
  sourcePool: string;
  sourceDataset: string;
  snapshotName: string;
  targetPool: string;
  targetDataset: string;
  status: ZSendPhase;
  totalBytes: number;
  totalFormatted: string;
  bytesSent: number;
  bytesSentFormatted: string;
  progressPct: number;
  currentRateMbS: number;
  averageRateMbS: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number;
  checksumMatches: boolean;
  startedAt: number;
  completedAt?: number;
  cliCommandExecuted: string;
  error?: string;
}

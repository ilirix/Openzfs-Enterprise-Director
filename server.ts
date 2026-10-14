import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec, execFile, execFileSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const STATE_FILE = path.join(__dirname, 'linux_package', 'python_cli', 'zfs_state.json');
const DEMO_FLAG_PATH = path.join(__dirname, 'linux_package', 'python_cli', 'demo_mode.json');

function readDemoFlag(): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(DEMO_FLAG_PATH, 'utf8'));
    if (typeof raw.enabled === 'boolean') return raw.enabled;
  } catch {
    /* first boot stays in demo until the operator turns it off */
  }
  return true;
}

function writeDemoFlag(enabled: boolean) {
  try {
    fs.writeFileSync(DEMO_FLAG_PATH, JSON.stringify({ enabled }, null, 2));
  } catch (err) {
    console.error('Could not persist demo mode:', err);
  }
}

let demoMode = readDemoFlag();

type SshNode = {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: 'key' | 'password';
  identityFile: string;
  password: string;
};

const NODE_DIR = '/var/lib/zfs-director';
const NODE_FILE = path.join(NODE_DIR, 'nodes.json');
const NODE_KEY_DIR = path.join(NODE_DIR, 'keys');
let sshNodes: SshNode[] = [];
let activeNodeId = 'local';

function managingRemote(): boolean {
  return activeNodeId !== 'local' && sshNodes.some((node) => node.id === activeNodeId);
}

function useRealHost(): boolean {
  return !demoMode || managingRemote();
}

function activeSshNode(): SshNode | null {
  if (!managingRemote()) return null;
  return sshNodes.find((node) => node.id === activeNodeId) || null;
}

function loadSshNodes() {
  try {
    const raw = JSON.parse(fs.readFileSync(NODE_FILE, 'utf8'));
    sshNodes = Array.isArray(raw.nodes) ? raw.nodes.filter((node: SshNode) => node && node.id && node.host && node.user) : [];
    activeNodeId = raw.activeId === 'local' || sshNodes.some((node) => node.id === raw.activeId) ? raw.activeId : 'local';
  } catch {
    sshNodes = [];
    activeNodeId = 'local';
  }
}

function saveSshNodes() {
  fs.mkdirSync(NODE_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(NODE_KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(NODE_FILE, JSON.stringify({
    activeId: activeNodeId,
    nodes: sshNodes,
  }, null, 2), { mode: 0o600 });
}

function publicNode(node: SshNode) {
  return {
    id: node.id,
    name: node.name,
    host: node.host,
    port: node.port,
    user: node.user,
    auth: node.auth,
    hasPassword: Boolean(node.password),
    hasKey: Boolean(node.identityFile),
  };
}

function validNodeHost(host: string): boolean {
  if (host.length > 253 || /[\s@]/.test(host)) return false;
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(host)) return host.split('.').every((part) => Number(part) <= 255);
  return /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(host);
}

function ensureAskpass(): string {
  const file = path.join(NODE_DIR, 'askpass.sh');
  fs.mkdirSync(NODE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, '#!/bin/sh\nprintf \'%s\\n\' "$ZFS_DIRECTOR_SSH_PASS"\n', { mode: 0o700 });
  return file;
}

function sshArgv(node: SshNode, command: string): string[] {
  const args = [
    '-p', String(node.port),
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=8',
    '-o', 'IdentitiesOnly=yes',
  ];
  if (node.auth === 'key' && node.identityFile) {
    args.push('-o', 'BatchMode=yes', '-i', node.identityFile);
  } else {
    args.push('-o', 'PubkeyAuthentication=no', '-o', 'PreferredAuthentications=password,keyboard-interactive');
  }
  args.push(`${node.user}@${node.host}`, command);
  return args;
}

function sshEnv(node: SshNode): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (node.auth === 'password' && node.password) {
    env.SSH_ASKPASS = ensureAskpass();
    env.SSH_ASKPASS_REQUIRE = 'force';
    env.DISPLAY = 'none';
    env.ZFS_DIRECTOR_SSH_PASS = node.password;
  }
  return env;
}

function runSsh(node: SshNode, command: string, timeout = 20000): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile('ssh', sshArgv(node, command), { timeout, env: sshEnv(node), maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || (error && typeof (error as NodeJS.ErrnoException).code !== 'number' ? error.message : ''),
        code: error && typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
          ? (error as NodeJS.ErrnoException & { code: number }).code
          : error ? 1 : 0,
      });
    });
  });
}

loadSshNodes();

type InstallJob = {
  id: string;
  log: string;
  done: boolean;
  code: number | null;
  packages: string[];
};

const installJobs = new Map<string, InstallJob>();

const PACKAGE_CATALOG = [
  {
    id: 'zfsutils-linux',
    bins: ['zpool'],
    label: 'OpenZFS (zfsutils-linux)',
    description: 'zpool dhe zfs për pool-e, dataset-e dhe ARC reale',
    required: true,
  },
  {
    id: 'smartmontools',
    bins: ['smartctl'],
    label: 'smartmontools',
    description: 'SMART për temperaturën dhe shëndetin e disqeve',
    required: false,
  },
  {
    id: 'nvme-cli',
    bins: ['nvme'],
    label: 'nvme-cli',
    description: 'Diagnostikim i disqeve NVMe',
    required: false,
  },
  {
    id: 'python3',
    bins: ['python3'],
    label: 'Python 3',
    description: 'CLI zfs_manager.py dhe wizard-i në terminal',
    required: false,
  },
] as const;

app.use(express.json());

// Helper to run bash commands
function runShell(command: string, timeout = 10000): Promise<{ stdout: string; stderr: string; code: number }> {
  const node = activeSshNode();
  if (node) return runSsh(node, command, timeout);
  return new Promise((resolve) => {
    exec(command, { timeout }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout || '',
        stderr: stderr || (error ? error.message : ''),
        code: error && error.code ? error.code : 0,
      });
    });
  });
}

// Initial Simulated State if real ZFS is not present
const defaultState = {
  pools: [
    {
      name: 'tank-enterprise',
      guid: '1839201948201',
      health: 'ONLINE',
      size: '16.0T',
      allocated: '4.2T',
      free: '11.8T',
      frag: '6%',
      dedup: '1.00x',
      ashift: 12,
      status: 'No known data errors. Scrub completed with 0 errors.',
      scrub_status: 'Scrubbed 4.2TB in 02:45:12, 0 errors, status: COMPLETED',
      scrub_active: false,
      last_scrub: '2026-10-10 03:00:00',
      vdevs: [
        {
          type: 'raidz2',
          name: 'raidz2-0',
          status: 'ONLINE',
          disks: ['/dev/sdb', '/dev/sdc', '/dev/sdd', '/dev/sde', '/dev/sdf', '/dev/sdg'],
          capacity: '12.0T',
        },
        {
          type: 'log',
          name: 'mirror-log-0',
          status: 'ONLINE',
          disks: ['/dev/nvme0n1p1', '/dev/nvme1n1p1'],
          desc: 'SLOG ZIL (NVMe Mirror PLP)',
          capacity: '64G',
        },
        {
          type: 'cache',
          name: 'l2arc-0',
          status: 'ONLINE',
          disks: ['/dev/nvme2n1p1'],
          desc: 'L2ARC Cache (1.6TB NVMe)',
          capacity: '1.6T',
        },
        {
          type: 'special',
          name: 'special-mirror',
          status: 'ONLINE',
          disks: ['/dev/nvme3n1p1', '/dev/nvme4n1p1'],
          desc: 'Special VDEV Metadata (4KB blocks)',
          capacity: '480G',
        },
      ],
    },
    {
      name: 'fast-nvme-pool',
      guid: '9812401829031',
      health: 'ONLINE',
      size: '3.84T',
      allocated: '1.12T',
      free: '2.72T',
      frag: '2%',
      dedup: '1.32x',
      ashift: 12,
      status: 'Optimal I/O pipeline. Scrub running (64.2% done).',
      scrub_status: 'Scrub in progress: 64.2% done, 0 errors, ETA: 00:18:40',
      scrub_active: true,
      last_scrub: '2026-10-11 15:40:00',
      vdevs: [
        {
          type: 'mirror',
          name: 'mirror-0',
          status: 'ONLINE',
          disks: ['/dev/nvme5n1', '/dev/nvme6n1'],
          capacity: '3.84T',
        },
      ],
    },
  ],
  datasets: [
    {
      name: 'tank-enterprise/data',
      type: 'filesystem',
      mountpoint: '/tank-enterprise/data',
      used: '2.8T',
      avail: '11.8T',
      refer: '2.8T',
      compression: 'zstd-3',
      compressratio: '1.84x',
      recordsize: '128K',
      atime: 'off',
      dedup: 'off',
      quota: 'none',
      encryption: 'aes-256-gcm',
      readonly: 'off',
    },
    {
      name: 'tank-enterprise/databases',
      type: 'filesystem',
      mountpoint: '/var/lib/postgresql/data',
      used: '840G',
      avail: '11.8T',
      refer: '840G',
      compression: 'lz4',
      compressratio: '1.42x',
      recordsize: '16K',
      atime: 'off',
      dedup: 'off',
      quota: '2T',
      encryption: 'aes-256-gcm',
      readonly: 'off',
    },
    {
      name: 'tank-enterprise/vm-disks/disk-101',
      type: 'volume',
      mountpoint: '/dev/zvol/tank-enterprise/vm-disks/disk-101',
      used: '120G',
      avail: '11.8T',
      refer: '45G',
      volsize: '100G',
      volblocksize: '8K',
      compression: 'lz4',
      compressratio: '1.65x',
      recordsize: '8K',
      atime: 'off',
      dedup: 'off',
      quota: 'none',
      encryption: 'on',
      readonly: 'off',
    },
    {
      name: 'fast-nvme-pool/app-cache',
      type: 'filesystem',
      mountpoint: '/fast-nvme-pool/app-cache',
      used: '310G',
      avail: '2.72T',
      refer: '310G',
      compression: 'lz4',
      compressratio: '1.20x',
      recordsize: '64K',
      atime: 'off',
      dedup: 'off',
      quota: '500G',
      encryption: 'off',
      readonly: 'off',
    },
  ],
  snapshots: [
    {
      name: 'tank-enterprise/databases@daily-2026-10-11',
      used: '4.2G',
      refer: '838G',
      creation: '2026-10-11 00:00:01',
    },
    {
      name: 'tank-enterprise/data@weekly-2026-10-04',
      used: '18.5G',
      refer: '2.7T',
      creation: '2026-10-04 02:00:00',
    },
    {
      name: 'tank-enterprise/vm-disks/disk-101@snap-pre-upgrade',
      used: '1.1G',
      refer: '45G',
      creation: '2026-10-11 12:30:15',
    },
  ],
  arc: {
    size: 34359738368, // 32 GB
    c_max: 68719476736, // 64 GB
    c_min: 8589934592, // 8 GB
    hits: 184920491,
    misses: 8394819,
    hit_ratio: 95.66,
    mru_size: 18253611008, // ~17 GB
    mfu_size: 16106127360, // ~15 GB
    data_size: 28991029248,
    metadata_size: 5368709120,
    l2_size: 1600000000000, // 1.6 TB
    l2_hits: 28491024,
    l2_misses: 5910294,
    l2_hit_ratio: 82.8,
    tunables: {
      zfs_arc_max: 68719476736,
      zfs_arc_min: 8589934592,
      l2arc_write_max: 262144000, // 250 MB/s
      l2arc_noprefetch: 0,
      zfs_arc_sys_free: 1073741824, // 1 GB
    },
  },
  availableDisks: [
    { dev: '/dev/sdh', size: '4.0T', type: 'HDD', model: 'Seagate Exos X16', serial: 'WNA1K284' },
    { dev: '/dev/sdi', size: '4.0T', type: 'HDD', model: 'Seagate Exos X16', serial: 'WNA1K285' },
    { dev: '/dev/nvme7n1', size: '1.92T', type: 'NVMe', model: 'Samsung PM9A3 PLP', serial: 'S6G9NE0R' },
    { dev: '/dev/nvme8n1', size: '1.92T', type: 'NVMe', model: 'Samsung PM9A3 PLP', serial: 'S6G9NE0S' },
  ],
  benchmarks: [
    {
      id: 'bench-1',
      pool: 'tank-enterprise',
      test_type: 'Mixed Sync Write + ARC Read (Database Sim)',
      seq_read_mb_s: 3420.5,
      seq_write_mb_s: 1840.2,
      rand_read_iops: 185400,
      rand_write_iops: 94200,
      avg_latency_ms: 0.18,
      arc_hit_pct: 97.4,
      timestamp: '2026-10-11 16:30:00',
    },
    {
      id: 'bench-2',
      pool: 'fast-nvme-pool',
      test_type: 'Sequential Streaming (1M Block Size)',
      seq_read_mb_s: 6850.0,
      seq_write_mb_s: 4200.0,
      rand_read_iops: 420000,
      rand_write_iops: 280000,
      avg_latency_ms: 0.08,
      arc_hit_pct: 99.2,
      timestamp: '2026-10-11 14:15:20',
    },
  ],
  reports: [
    {
      id: 'rep-1',
      title: 'Full Pool Scrub Integrity Audit',
      type: 'scrub',
      date: '2026-10-10 05:45:12',
      status: 'nominal',
      summary: 'Verified 4.2TB of user data across 6 drives in RAIDZ2-0. 0 checksum errors, 0 repairs needed.',
      details: {
        'Scrub Duration': '02h 45m 12s',
        'Scrub Rate': '423.8 MB/s',
        'Bit-rot Errors': '0 Bytes',
        'Repaired': '0 Bytes',
      },
    },
    {
      id: 'rep-2',
      title: 'NVMe PLP & SMART Hardware Inspection',
      type: 'audit',
      date: '2026-10-11 08:00:00',
      status: 'optimal',
      summary: 'All Samsung PM9A3 and Seagate Exos drives reported 100% health with 0 bad sectors and normal operating temperatures.',
      details: {
        'Drives Checked': '8 Total (4 NVMe, 4 HDD)',
        'Max Temperature': '34°C (Normal)',
        'Wear Level': '98% Remaining',
        'PLP Status': 'Optimal',
      },
    },
    {
      id: 'rep-3',
      title: 'Weekly Capacity & Compression Efficiency Audit',
      type: 'capacity',
      date: '2026-10-08 23:59:00',
      status: 'optimal',
      summary: 'ZSTD and LZ4 algorithms saved 3.12TB of physical storage space. Net pool allocation at 26.2%.',
      details: {
        'Space Saved': '3.12 TB',
        'Compression Ratio': '1.84x Overall',
        'Allocated Space': '4.2 TB',
        'Free Space': '11.8 TB',
      },
    },
  ],
  serviceStatus: {
    daemonActive: true,
    pid: 14209,
    kernelModuleLoaded: true,
    uptime: '18d 04h 12m',
    installedPath: '/root/zfs-enterprise-suite',
    rustServerAvailable: true,
  },
};

function formatHostUptime(): string {
  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
}

function getState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading state file, using default:', err);
  }
  return defaultState;
}

function saveState(state: any) {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving state file:', err);
  }
}

// Ensure state file exists on startup
if (!fs.existsSync(STATE_FILE)) {
  saveState(defaultState);
}

// -------------------------------------------------------------
// SYSTEM-LEVEL ZFS & STORAGE DAEMON LOGS
// -------------------------------------------------------------
interface ServerLogEntry {
  id: string;
  timestamp: string;
  epochMs: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  source: string;
  subsystem?: string;
  pool?: string;
  message: string;
  raw?: string;
}

const initialSeedLogs: ServerLogEntry[] = [
  {
    id: 'log-1001',
    timestamp: new Date(Date.now() - 3600000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 3600000,
    level: 'INFO',
    source: 'zfs-kernel',
    subsystem: 'spa',
    pool: 'tank-enterprise',
    message: 'SPA initialized: pool tank-enterprise vdevs=4 (raidz2-0, mirror-log-0, l2arc-0, special-mirror)',
    raw: 'Oct 11 16:30:00 storage-node01 kernel: [ZFS:spa] SPA initialized: pool tank-enterprise vdevs=4 ashift=12',
  },
  {
    id: 'log-1002',
    timestamp: new Date(Date.now() - 3400000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 3400000,
    level: 'INFO',
    source: 'zed',
    subsystem: 'daemon',
    pool: 'system',
    message: 'ZED (ZFS Event Daemon) v2.2.4 started: listening to /dev/zfs events via kqueue/epoll',
    raw: 'Oct 11 16:33:20 storage-node01 zed[1042]: ZED (ZFS Event Daemon) v2.2.4 started: listening to /dev/zfs events',
  },
  {
    id: 'log-1003',
    timestamp: new Date(Date.now() - 3100000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 3100000,
    level: 'INFO',
    source: 'smartd',
    subsystem: 'smart',
    pool: 'tank-enterprise',
    message: 'SMART health check OK for 6 SAS enterprise HDDs and 4 NVMe PCIe 4.0 disks. 0 reallocated sectors.',
    raw: 'Oct 11 16:38:20 storage-node01 smartd[890]: Device: /dev/sdb, Temperature 32 C (nominal), self-test: PASSED',
  },
  {
    id: 'log-1004',
    timestamp: new Date(Date.now() - 2800000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 2800000,
    level: 'DEBUG',
    source: 'zfs-kernel',
    subsystem: 'arc',
    pool: 'system',
    message: 'arc_init: c_max=12.0GB, c_min=2.0GB, sysfree=1.5GB, hash_table_buckets=1048576 initialized',
    raw: 'Oct 11 16:43:20 storage-node01 kernel: [ZFS:arc] arc_init: c_max=12884901888 c_min=2147483648 p=6442450944',
  },
  {
    id: 'log-1005',
    timestamp: new Date(Date.now() - 2500000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 2500000,
    level: 'INFO',
    source: 'storage-director',
    subsystem: 'daemon',
    pool: 'system',
    message: 'Rust storage-director telemetry loop active on port 3000. IPC socket connected to OpenZFS kstat.',
    raw: 'Oct 11 16:48:20 storage-node01 storage-director[1284]: [INFO] Rust async worker pool spawned 16 threads',
  },
  {
    id: 'log-1006',
    timestamp: new Date(Date.now() - 2200000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 2200000,
    level: 'WARN',
    source: 'zfs-kernel',
    subsystem: 'vdev',
    pool: 'tank-enterprise',
    message: 'vdev_disk_io: High I/O queue latency observed on /dev/sdg (wait_time=48ms, queue_depth=32). Throttling queue.',
    raw: 'Oct 11 16:53:20 storage-node01 kernel: [ZFS:vdev] vdev_disk_io: /dev/sdg latency spike p99=48ms, auto-rebalance active',
  },
  {
    id: 'log-1007',
    timestamp: new Date(Date.now() - 1900000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 1900000,
    level: 'INFO',
    source: 'zed',
    subsystem: 'scrub',
    pool: 'fast-nvme-pool',
    message: 'eid=189 class=sysevent.fs.zfs.scrub_start pool=fast-nvme-pool vdev=mirror-0 speed=1.2GB/s',
    raw: 'Oct 11 16:58:20 storage-node01 zed[1042]: eid=189 class=sysevent.fs.zfs.scrub_start pool=fast-nvme-pool',
  },
  {
    id: 'log-1008',
    timestamp: new Date(Date.now() - 1600000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 1600000,
    level: 'INFO',
    source: 'sanoid',
    subsystem: 'snapshots',
    pool: 'tank-enterprise',
    message: 'Sanoid policy execution: created snapshot tank-enterprise/databases@hourly-2026-10-11_17-00-00 (size: 42MB)',
    raw: 'Oct 11 17:00:00 storage-node01 sanoid[1450]: [INFO] snapshot tank-enterprise/databases@hourly-2026-10-11_17-00-00 created',
  },
  {
    id: 'log-1009',
    timestamp: new Date(Date.now() - 1300000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 1300000,
    level: 'DEBUG',
    source: 'zfs-kernel',
    subsystem: 'txg',
    pool: 'tank-enterprise',
    message: 'txg_sync: txg 1849210 committed in 12.4ms (dirty_data=48.2MB, zil_flushed=2.1MB)',
    raw: 'Oct 11 17:05:00 storage-node01 kernel: [ZFS:txg] txg_sync: txg 1849210 open->quiesce->sync (12.4ms)',
  },
  {
    id: 'log-1010',
    timestamp: new Date(Date.now() - 1000000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 1000000,
    level: 'WARN',
    source: 'smartd',
    subsystem: 'smart',
    pool: 'tank-enterprise',
    message: 'Drive temperature alert: /dev/sdb temperature reached 41 C (threshold 45 C). Airflow fan ramped to 65%.',
    raw: 'Oct 11 17:10:00 storage-node01 smartd[890]: Device: /dev/sdb, Temperature 41 C (warning threshold 45 C)',
  },
  {
    id: 'log-1011',
    timestamp: new Date(Date.now() - 750000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 750000,
    level: 'INFO',
    source: 'zfs-kernel',
    subsystem: 'trim',
    pool: 'fast-nvme-pool',
    message: 'Auto-TRIM pass completed on /dev/nvme5n1 and /dev/nvme6n1 (reclaimed 32.4 GB unallocated LBAs)',
    raw: 'Oct 11 17:15:00 storage-node01 kernel: [ZFS:trim] trim_thread: completed on pool fast-nvme-pool, 34789212160 bytes trimmed',
  },
  {
    id: 'log-1012',
    timestamp: new Date(Date.now() - 500000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 500000,
    level: 'ERROR',
    source: 'zed',
    subsystem: 'io',
    pool: 'tank-enterprise',
    message: 'eid=195 class=ereport.fs.zfs.checksum pool=tank-enterprise vdev=/dev/sdd offset=0x4a800 (Self-healed via RAIDZ2 parity block)',
    raw: 'Oct 11 17:20:00 storage-node01 zed[1042]: eid=195 class=ereport.fs.zfs.checksum pool=tank-enterprise vdev=/dev/sdd err=0 (repaired)',
  },
  {
    id: 'log-1013',
    timestamp: new Date(Date.now() - 250000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 250000,
    level: 'INFO',
    source: 'zfs-kernel',
    subsystem: 'arc',
    pool: 'system',
    message: 'arc_summary: hit_rate=98.4% (MRU=5.8GB, MFU=4.3GB). L2ARC hit_rate=89.2% (1.6TB NVMe active).',
    raw: 'Oct 11 17:25:00 storage-node01 kernel: [ZFS:arc] arc_summary: hits=12948010 misses=210492 hit_pct=98.4',
  },
  {
    id: 'log-1014',
    timestamp: new Date(Date.now() - 100000).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now() - 100000,
    level: 'DEBUG',
    source: 'storage-director',
    subsystem: 'audit',
    pool: 'system',
    message: 'Heartbeat ping: system loadavg [0.42, 0.38, 0.29], RAM utilization 42%, ARC health optimal',
    raw: 'Oct 11 17:28:00 storage-node01 storage-director[1284]: [DEBUG] Telemetry collector polled in 1.2ms',
  },
];

const systemLogs: ServerLogEntry[] = [...initialSeedLogs];

function addSystemLog(entry: Partial<ServerLogEntry>) {
  const now = Date.now();
  const newEntry: ServerLogEntry = {
    id: `log-${now}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date(now).toISOString().replace('T', ' ').substring(0, 19),
    epochMs: now,
    level: entry.level || 'INFO',
    source: entry.source || 'zfs-kernel',
    subsystem: entry.subsystem || 'core',
    pool: entry.pool || 'tank-enterprise',
    message: entry.message || 'System storage event logged',
    raw: entry.raw || `${new Date(now).toISOString().replace('T', ' ').substring(0, 19)} [${entry.source || 'zfs-kernel'}:${entry.subsystem || 'core'}] ${entry.message || ''}`,
  };

  // Prepend to show latest first
  systemLogs.unshift(newEntry);
  if (systemLogs.length > 500) {
    systemLogs.pop();
  }
  return newEntry;
}

// Background simulation ticker: adds realistic daemon events every 6 seconds
const backgroundEventTemplates = [
  { level: 'INFO', source: 'zfs-kernel', subsystem: 'txg', pool: 'tank-enterprise', msg: () => `txg_sync: txg ${1849200 + Math.floor(Math.random() * 500)} committed in ${(10 + Math.random() * 6).toFixed(1)}ms (${(20 + Math.random() * 30).toFixed(1)} MB dirty)` },
  { level: 'DEBUG', source: 'zfs-kernel', subsystem: 'arc', pool: 'system', msg: () => `arc_evict: evaluated cache pressure; target=${(10.5 + Math.random() * 1.5).toFixed(1)}GB, MRU/MFU balanced` },
  { level: 'INFO', source: 'smartd', subsystem: 'smart', pool: 'tank-enterprise', msg: () => `smartd: Disk poll completed for /dev/sd[b-g] and /dev/nvme[0-6]; all drives operating in nominal temperature range` },
  { level: 'INFO', source: 'zed', subsystem: 'spa', pool: 'fast-nvme-pool', msg: () => `eid=${200 + Math.floor(Math.random() * 800)} class=sysevent.fs.zfs.history_event pool=fast-nvme-pool status=ONLINE` },
  { level: 'DEBUG', source: 'storage-director', subsystem: 'telemetry', pool: 'system', msg: () => `Rust daemon async poll: ARC hit ratio sustained at ${(97.5 + Math.random() * 1.8).toFixed(1)}%` },
  { level: 'INFO', source: 'zfs-kernel', subsystem: 'vdev', pool: 'tank-enterprise', msg: () => `vdev_disk: Flush I/O barrier acknowledged by disk controller /dev/sdb..sdg` },
];

setInterval(() => {
  if (useRealHost()) return;
  const tmpl = backgroundEventTemplates[Math.floor(Math.random() * backgroundEventTemplates.length)];
  addSystemLog({
    level: tmpl.level as any,
    source: tmpl.source,
    subsystem: tmpl.subsystem,
    pool: tmpl.pool,
    message: tmpl.msg(),
  });
}, 6000);

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

async function readLiveInventory() {
  const listed = await runShell('zpool list -H -o name,health,size,alloc,free,frag');
  const stdout = (listed.stdout || '').trim();
  if (listed.code !== 0 || !stdout || /no pools available/i.test(stdout)) {
    return { pools: [] as any[], datasets: [] as any[], snapshots: [] as any[] };
  }
  const pools = [];
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [name, health, size, allocated, free, frag] = line.split('\t');
    const details = await readLivePoolDetails(name);
    pools.push({
      name,
      guid: '',
      health: health || 'ONLINE',
      size: size || '0',
      allocated: allocated || '0',
      free: free || '0',
      frag: frag || '0%',
      dedup: details.dedup,
      ashift: details.ashift,
      status: details.statusText || health || 'ONLINE',
      scrub_status: details.scrubStatus,
      scrub_active: details.scrubActive,
      last_scrub: details.scrubStatus,
      vdevs: details.vdevs,
    });
  }
  const ds = await runShell('zfs list -H -t filesystem,volume -o name,type,mountpoint,used,avail,refer,compression,compressratio,recordsize,atime,dedup,quota');
  const datasets = (ds.code === 0 ? ds.stdout.trim().split('\n').filter(Boolean) : []).map((line) => {
    const [name, type, mountpoint, used, avail, refer, compression, compressratio, recordsize, atime, dedup, quota] = line.split('\t');
    return {
      name,
      type: type === 'volume' ? 'volume' : 'filesystem',
      mountpoint: mountpoint === '-' ? '' : (mountpoint || ''),
      used: used || '0',
      avail: avail || '0',
      refer: refer || '0',
      compression: compression || 'off',
      compressratio: compressratio || '1.00x',
      recordsize: recordsize || '128K',
      atime: atime || 'off',
      dedup: dedup || 'off',
      quota: !quota || quota === '-' ? 'none' : quota,
      encryption: 'off',
      readonly: 'off',
    };
  });
  const snaps = await runShell('zfs list -H -t snapshot -o name,used,refer,creation');
  const snapshots = (snaps.code === 0 ? snaps.stdout.trim().split('\n').filter(Boolean) : []).map((line) => {
    const [name, used, refer, creation] = line.split('\t');
    return { name, used: used || '0', refer: refer || '0', creation: creation || '' };
  });
  return { pools, datasets, snapshots };
}

function parseZpoolStatus(stdout: string) {
  const vdevs: { type: string; name: string; status: string; disks: string[] }[] = [];
  let section = 'data';
  let inConfig = false;
  let poolLineSeen = false;
  let current: { type: string; name: string; status: string; disks: string[] } | null = null;
  for (const raw of stdout.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('errors:')) break;
    if (line.startsWith('NAME') && line.includes('STATE')) {
      inConfig = true;
      continue;
    }
    if (!inConfig) continue;
    const cols = line.split(/\s+/);
    const id = cols[0];
    const state = cols[1] || 'ONLINE';
    if (id === 'logs' || id === 'cache' || id === 'spares' || id === 'special') {
      section = id === 'logs' ? 'log' : id === 'spares' ? 'spare' : id;
      current = null;
      continue;
    }
    if (!poolLineSeen) {
      poolLineSeen = true;
      continue;
    }
    if (id.startsWith('/')) {
      if (!current) {
        current = { type: section, name: section, status: 'ONLINE', disks: [] };
        vdevs.push(current);
      }
      current.disks.push(id);
      continue;
    }
    const type = section === 'data' ? id.replace(/-\d+$/, '') : section;
    current = { type, name: id, status: state, disks: [] };
    vdevs.push(current);
  }
  return vdevs;
}

async function readLivePoolDetails(name: string) {
  const safe = String(name || '').replace(/[^A-Za-z0-9_.-]/g, '');
  const status = await runShell(`zpool status -P ${safe}`);
  const props = await runShell(`zpool get -H -o property,value ashift,dedupratio ${safe}`);
  let ashift = 12;
  let dedup = '1.00x';
  for (const line of props.stdout.split('\n')) {
    const [property, value] = line.split('\t');
    if (property === 'ashift' && Number(value)) ashift = Number(value);
    if (property === 'dedupratio' && value) dedup = value;
  }
  const scan = status.stdout.split('\n').find((line) => line.trim().startsWith('scan:'))?.trim().replace(/^scan:\s*/, '') || '';
  const stateLine = status.stdout.split('\n').find((line) => line.trim().startsWith('state:'))?.trim().replace(/^state:\s*/, '') || '';
  return {
    ashift,
    dedup,
    vdevs: parseZpoolStatus(status.stdout),
    statusText: stateLine,
    scrubStatus: scan,
    scrubActive: /scrub in progress/i.test(scan),
  };
}

const MIN_VDEV_DISKS: Record<string, number> = {
  stripe: 1,
  mirror: 2,
  mirror3: 3,
  raidz: 3,
  raidz1: 3,
  raidz2: 4,
  raidz3: 5,
  draid1: 3,
  draid2: 4,
  draid3: 5,
};

function zpoolKeyword(topology: string): string {
  if (topology === 'stripe') return '';
  if (topology === 'mirror3') return 'mirror';
  if (topology === 'raidz1' || topology === 'raidz') return 'raidz';
  return topology;
}

async function disksAreFree(devs: string[]): Promise<string | null> {
  for (const dev of devs) {
    if (!/^\/dev\/[A-Za-z0-9._-]+$/.test(dev)) {
      return `${dev} is not a disk on this host.`;
    }
    if (managingRemote()) {
      const probe = await runShell(`test -b ${dev}`);
      if (probe.code !== 0) return `${dev} is not a disk on this host.`;
    } else if (!fs.existsSync(dev)) {
      return `${dev} is not a disk on this host.`;
    }
  }
  const listed = await runShell('lsblk -J -o PATH,MOUNTPOINT');
  let devices: any[] = [];
  try {
    devices = JSON.parse(listed.stdout || '{}').blockdevices || [];
  } catch {
    return 'Could not read the disk list.';
  }
  const wanted = new Set(devs);
  const walk = (node: any): string | null => {
    if (node?.path && wanted.has(node.path) && diskHasMount(node)) {
      return `${node.path} is in use by the system and cannot be added to a pool.`;
    }
    if (Array.isArray(node?.children)) {
      for (const child of node.children) {
        const hit = walk(child);
        if (hit) return hit;
      }
    }
    return null;
  };
  for (const device of devices) {
    const hit = walk(device);
    if (hit) return hit;
  }
  return null;
}

// 1. Overall Status
function diskHasMount(node: { mountpoint?: string | null; children?: any[] }): boolean {
  if (node.mountpoint) return true;
  return Array.isArray(node.children) && node.children.some((child) => diskHasMount(child));
}

function busFromSysfs(name: string): string {
  const deviceLink = `/sys/block/${name}/device`;
  try {
    const target = fs.readlinkSync(deviceLink);
    if (target.includes('/nvme')) return 'nvme';
    if (target.includes('/usb')) return 'usb';
    if (target.includes('virtio')) return 'virtio';
    if (target.includes('/ata') || target.includes('-ata-')) return 'sata';
    if (target.includes('sas') || target.includes('end_device')) return 'sas';
    if (target.includes('fc_host') || target.includes('/rport-')) return 'fc';
    if (target.includes('iscsi')) return 'iscsi';
    if (target.includes('/mmc')) return 'mmc';
  } catch {
    /* virtual or unbound devices have no device symlink */
  }
  try {
    return path.basename(fs.readlinkSync(`${deviceLink}/subsystem`));
  } catch {
    return '';
  }
}

function classifyDisk(name: string, tran: string, rota: unknown): string {
  const bus = (tran || busFromSysfs(name) || '').toLowerCase();
  const spinning = rota === true || rota === 1 || rota === '1';
  const flash = rota === false || rota === 0 || rota === '0';
  const media = name.startsWith('nvme') || bus === 'nvme' ? '' : flash ? 'SSD' : spinning ? 'HDD' : '';
  const withMedia = (label: string) => (media ? `${label} ${media}` : label);

  if (name.startsWith('nvme') || bus === 'nvme') return 'NVMe';
  if (bus === 'sata' || bus === 'ata') return withMedia('SATA');
  if (bus === 'sas' || bus === 'scsi' && name.startsWith('sd')) return withMedia(bus === 'sas' ? 'SAS' : 'SCSI');
  if (bus === 'usb') return withMedia('USB');
  if (bus === 'virtio') return 'VirtIO';
  if (bus === 'fc') return withMedia('FC');
  if (bus === 'iscsi') return withMedia('iSCSI');
  if (bus === 'mmc' || name.startsWith('mmcblk')) return 'eMMC';
  if (media) return media;
  return 'Disk';
}

async function readLiveDisks() {
  const listed = await runShell('lsblk -a -J -o NAME,PATH,SIZE,TYPE,TRAN,ROTA,MODEL,SERIAL,MOUNTPOINT,VENDOR');
  if (listed.code !== 0 || !listed.stdout.trim()) return [];
  let parsed: { blockdevices?: any[] };
  try {
    parsed = JSON.parse(listed.stdout);
  } catch {
    return [];
  }
  const devices = Array.isArray(parsed.blockdevices) ? parsed.blockdevices : [];
  const disks = [];
  for (const disk of devices) {
    const kind = String(disk.type || '');
    if (kind !== 'disk') continue;
    const name = String(disk.name || '');
    if (name.startsWith('loop') || name.startsWith('dm-') || name.startsWith('zram') || name.startsWith('ram')) continue;
    const tran = String(disk.tran || '');
    const type = classifyDisk(name, tran, disk.rota);
    const vendor = String(disk.vendor || '').trim();
    const usableVendor = /^0x[0-9a-f]+$/i.test(vendor) ? '' : vendor;
    const modelName = String(disk.model || '').trim();
    const inUse = diskHasMount(disk);
    const model = [usableVendor, modelName].filter(Boolean).join(' ')
      || (type.startsWith('VirtIO') ? 'VirtIO disk' : 'Unknown');
    disks.push({
      dev: String(disk.path || `/dev/${name}`),
      size: String(disk.size || ''),
      type,
      model: inUse ? `${model} · system` : model,
      serial: String(disk.serial || ''),
    });
  }
  return disks;
}

app.get('/api/zfs/status', async (req: Request, res: Response) => {
  const state = getState();
  // Check if real ZFS is available
  const hasZpool = await runShell('which zpool');
  const isReal = hasZpool.code === 0;

  const emptyArc = {
    size: 0,
    c_max: 0,
    c_min: 0,
    hits: 0,
    misses: 0,
    hit_ratio: 0,
    mru_size: 0,
    mfu_size: 0,
    data_size: 0,
    metadata_size: 0,
    l2_size: 0,
    l2_hits: 0,
    l2_misses: 0,
    l2_hit_ratio: 0,
    tunables: {
      zfs_arc_max: 0,
      zfs_arc_min: 0,
      l2arc_write_max: 0,
      l2arc_noprefetch: 0,
      zfs_arc_sys_free: 0,
    },
  };

  const liveArc = { ...emptyArc, tunables: { ...emptyArc.tunables } };
  if (fs.existsSync('/proc/spl/kstat/zfs/arcstats')) {
    try {
      const parsed: Record<string, number> = {};
      for (const line of fs.readFileSync('/proc/spl/kstat/zfs/arcstats', 'utf-8').split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[0] !== 'name' && !Number.isNaN(Number(parts[2]))) {
          parsed[parts[0]] = Number(parts[2]);
        }
      }
      const hits = parsed.hits || 0;
      const misses = parsed.misses || 0;
      const total = hits + misses;
      const l2Hits = parsed.l2_hits || 0;
      const l2Misses = parsed.l2_misses || 0;
      const l2Total = l2Hits + l2Misses;
      liveArc.size = parsed.size || 0;
      liveArc.c_max = parsed.c_max || 0;
      liveArc.c_min = parsed.c_min || 0;
      liveArc.hits = hits;
      liveArc.misses = misses;
      liveArc.hit_ratio = total > 0 ? parseFloat(((hits / total) * 100).toFixed(2)) : 0;
      liveArc.mru_size = parsed.mru_size || 0;
      liveArc.mfu_size = parsed.mfu_size || 0;
      liveArc.data_size = parsed.data_size || 0;
      liveArc.metadata_size = parsed.metadata_size || 0;
      liveArc.l2_size = parsed.l2_size || 0;
      liveArc.l2_hits = l2Hits;
      liveArc.l2_misses = l2Misses;
      liveArc.l2_hit_ratio = l2Total > 0 ? parseFloat(((l2Hits / l2Total) * 100).toFixed(2)) : 0;
    } catch {
      /* keep the zeroed ARC when kstat cannot be read */
    }
  }
  const showDemo = demoMode && !managingRemote();
  const live = showDemo ? null : await readLiveInventory();

  res.json({
    status: 'success',
    demoMode: showDemo,
    runtime: 'node',
    isRealZfs: isReal,
    pools: showDemo ? state.pools : live!.pools,
    datasets: showDemo ? state.datasets : live!.datasets,
    snapshots: showDemo ? state.snapshots : live!.snapshots,
    arc: showDemo ? state.arc : (managingRemote() ? readLiveArc() : liveArc),
    activeNode: activeSshNode()
      ? { id: activeNodeId, name: activeSshNode()!.name, host: activeSshNode()!.host, via: 'ssh' }
      : { id: 'local', name: os.hostname(), host: 'localhost', via: 'local' },
    nodeError: managingRemote() && hasZpool.code !== 0
      ? (hasZpool.stderr || hasZpool.stdout || 'SSH to the selected node failed.').trim()
      : '',
    availableDisks: showDemo ? state.availableDisks : await readLiveDisks(),
    serviceStatus: showDemo
      ? state.serviceStatus
      : { ...state.serviceStatus, uptime: formatHostUptime() },
    benchmarks: showDemo ? (state.benchmarks || defaultState.benchmarks) : [],
    reports: showDemo ? (state.reports || defaultState.reports) : [],
  });
});

async function describePackages() {
  const packages = [];
  for (const item of PACKAGE_CATALOG) {
    let installed = false;
    for (const bin of item.bins) {
      const found = await runShell(`command -v ${bin}`);
      if (found.code === 0 && found.stdout.trim()) {
        installed = true;
        break;
      }
    }
    packages.push({
      id: item.id,
      label: item.label,
      description: item.description,
      required: item.required,
      installed,
      bins: item.bins,
    });
  }
  return packages;
}

app.get('/api/system/packages', async (_req: Request, res: Response) => {
  const packages = await describePackages();
  res.json({
    status: 'success',
    demoMode,
    packages,
    missing: packages.filter((item) => !item.installed).map((item) => item.id),
  });
});

app.post('/api/system/demo', (req: Request, res: Response) => {
  demoMode = req.body?.enabled !== false && req.body?.enabled !== 0;
  if (typeof req.body?.enabled === 'boolean') {
    demoMode = req.body.enabled;
  }
  writeDemoFlag(demoMode);
  if (useRealHost()) {
    resourceUsageHistory.length = 0;
    aggregateIoHistoryBuffer.length = 0;
  }
  res.json({ status: 'success', demoMode });
});

app.get('/api/nodes', (_req: Request, res: Response) => {
  res.json({
    activeId: managingRemote() ? activeNodeId : 'local',
    local: { id: 'local', name: os.hostname(), host: 'localhost', via: 'local' },
    nodes: sshNodes.map(publicNode),
  });
});

app.post('/api/nodes', (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim();
  const host = String(req.body?.host || '').trim();
  const user = String(req.body?.user || '').trim();
  const port = Number(req.body?.port || 22);
  const password = String(req.body?.password || '');
  const privateKey = String(req.body?.privateKey || '');
  const identityFile = String(req.body?.identityFile || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,40}$/.test(name)) {
    return res.status(400).json({ error: 'Node name must be 1-41 letters, numbers, spaces, dot, underscore, or dash.' });
  }
  if (!validNodeHost(host)) return res.status(400).json({ error: 'Host must be a hostname or IPv4 address.' });
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(user)) return res.status(400).json({ error: 'Invalid SSH user.' });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return res.status(400).json({ error: 'SSH port must be 1-65535.' });
  const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let keyPath = '';
  let auth: 'key' | 'password' = 'password';
  if (privateKey.trim()) {
    if (!privateKey.includes('PRIVATE KEY')) return res.status(400).json({ error: 'The pasted text is not a private key.' });
    fs.mkdirSync(NODE_KEY_DIR, { recursive: true, mode: 0o700 });
    keyPath = path.join(NODE_KEY_DIR, id);
    fs.writeFileSync(keyPath, privateKey.endsWith('\n') ? privateKey : `${privateKey}\n`, { mode: 0o600 });
    auth = 'key';
  } else if (identityFile) {
    const real = fs.existsSync(identityFile) ? fs.realpathSync(identityFile) : '';
    const allowed = real.startsWith('/root/.ssh/') || real.startsWith(`${NODE_KEY_DIR}/`);
    if (!allowed) return res.status(400).json({ error: 'Identity file must be under /root/.ssh or the director key directory.' });
    keyPath = real;
    auth = 'key';
  } else if (!password) {
    return res.status(400).json({ error: 'Provide a private key or a password.' });
  }
  const node: SshNode = { id, name, host, port, user, auth, identityFile: keyPath, password: auth === 'password' ? password : '' };
  sshNodes.push(node);
  saveSshNodes();
  return res.json({ status: 'success', node: publicNode(node) });
});

app.delete('/api/nodes/:id', (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const node = sshNodes.find((item) => item.id === id);
  if (!node) return res.status(404).json({ error: 'Node not found.' });
  if (node.identityFile.startsWith(`${NODE_KEY_DIR}/`) && fs.existsSync(node.identityFile)) fs.unlinkSync(node.identityFile);
  sshNodes = sshNodes.filter((item) => item.id !== id);
  if (activeNodeId === id) activeNodeId = 'local';
  saveSshNodes();
  return res.json({ status: 'success', activeId: 'local' });
});

app.post('/api/nodes/:id/test', async (req: Request, res: Response) => {
  const node = sshNodes.find((item) => item.id === req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found.' });
  const probed = await runSsh(node, 'hostname; command -v zpool >/dev/null && zpool list -H -o name,health || echo NO_ZPOOL');
  if (probed.code !== 0) {
    return res.status(400).json({ error: (probed.stderr || probed.stdout || 'SSH connection failed.').trim() });
  }
  const lines = probed.stdout.trim().split('\n').filter(Boolean);
  return res.json({ status: 'success', hostname: lines[0] || node.host, output: lines.slice(1).join('\n') });
});

app.post('/api/nodes/active', (req: Request, res: Response) => {
  const id = String(req.body?.id || 'local');
  if (id !== 'local' && !sshNodes.some((node) => node.id === id)) {
    return res.status(404).json({ error: 'Node not found.' });
  }
  activeNodeId = id;
  saveSshNodes();
  const node = activeSshNode();
  return res.json({
    status: 'success',
    activeId: node ? node.id : 'local',
    active: node ? publicNode(node) : { id: 'local', name: os.hostname(), host: 'localhost', via: 'local' },
  });
});

app.post('/api/system/packages/install', (req: Request, res: Response) => {
  const requested: string[] = Array.isArray(req.body?.packages) ? req.body.packages : [];
  const allowed = new Set(PACKAGE_CATALOG.map((item) => item.id));
  const selected = requested.filter((id) => allowed.has(id as typeof PACKAGE_CATALOG[number]['id']));
  if (selected.length === 0) {
    res.status(400).json({ error: 'Zgjidh të paktën një paketë nga lista.' });
    return;
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const job: InstallJob = {
    id,
    log: `$ apt-get install -y ${selected.join(' ')}\n`,
    done: false,
    code: null,
    packages: selected,
  };
  installJobs.set(id, job);
  const child = spawn('apt-get', ['install', '-y', ...selected], {
    env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
  });
  const append = (chunk: Buffer) => {
    job.log = (job.log + chunk.toString()).slice(-20000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (err) => {
    job.log += `\n${err.message}\n`;
    job.done = true;
    job.code = 1;
  });
  child.on('close', (code) => {
    job.done = true;
    job.code = code ?? 1;
    job.log += `\n[exit ${job.code}]\n`;
  });
  res.json({ status: 'started', jobId: id, packages: selected });
});

app.get('/api/system/packages/install/:id', (req: Request, res: Response) => {
  const job = installJobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Instalimi nuk u gjet.' });
    return;
  }
  res.json({
    status: 'success',
    jobId: job.id,
    log: job.log,
    done: job.done,
    code: job.code,
    packages: job.packages,
  });
});

// System Telemetry & Peripheral Devices Hardware Inspector Endpoint
app.get('/api/zfs/system/hardware', (req: Request, res: Response) => {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'AMD EPYC 7763 64-Core Processor (128 Threads @ 2.45 GHz)';
  const totalMemGb = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const freeMemGb = Math.round(os.freemem() / 1024 / 1024 / 1024);
  const loadAvg = os.loadavg();
  const uptimeStr = formatHostUptime();

  const hardware = {
    hostname: os.hostname() || 'storage-node01.enterprise.corp',
    kernelVersion: `${os.type()} ${os.release()} ${os.arch()}`,
    zfsModuleVersion: 'OpenZFS 2.2.6-1 / spl-2.2.6-1 (Native kmod, ashift=12)',
    osDistribution: 'Ubuntu 24.04.1 LTS (Noble Numbat) / Linux Server Enterprise',
    architecture: os.arch() || 'x86_64',
    cpuModel,
    cpuCores: cpus.length || 64,
    cpuThreads: cpus.length ? cpus.length * 2 : 128,
    cpuFreqGhz: cpus[0]?.speed ? Number((cpus[0].speed / 1000).toFixed(2)) : 2.45,
    cpuLoadAvg: [Number(loadAvg[0].toFixed(2)), Number(loadAvg[1].toFixed(2)), Number(loadAvg[2].toFixed(2))] as [number, number, number],
    systemUptime: uptimeStr,
    totalMemoryGb: totalMemGb > 0 ? totalMemGb : 128,
    freeMemoryGb: freeMemGb > 0 ? freeMemGb : 42,
    eccErrors: 0,
    motherboard: 'Supermicro H12SSL-i Enterprise Serverboard (Socket SP3)',
    ipmiStatus: 'ASPEED AST2500 BMC / IPMI 2.0 (Active, Dedicated OOB Port)',
    peripherals: [
      {
        id: 'hba_01',
        name: 'SAS3 Host Bus Adapter (HBA)',
        category: 'HBA',
        model: 'Broadcom / LSI SAS3008 Fusion-MPT 12GSAS HBA',
        busInterface: 'PCIe 3.0 x8 (Slot 4, 8.0 GT/s)',
        linkSpeed: '12 Gbps per SAS Lane (Direct-Attach)',
        firmwareVersion: 'IT Mode FW 16.00.12.00-IT (BIOS 08.37.00.00)',
        temperatureC: 48,
        status: 'ONLINE',
        details: 'Kontrollori kryesor për vargun e disqeve mekanike dhe SAS SSD me x8 PCIe Gen3 linja të dedikuara.',
        connectedDevices: ['/dev/sdb', '/dev/sdc', '/dev/sdd', '/dev/sde', '/dev/sdf', '/dev/sdg'],
      },
      {
        id: 'nvme_sw_01',
        name: 'PCIe Gen4 NVMe Switch Adapter',
        category: 'NVMe_Switch',
        model: 'Broadcom P411W-32P PCIe 4.0 x16 Host Adapter',
        busInterface: 'PCIe 4.0 x16 (Slot 1, 16.0 GT/s, bifurcated x4/x4/x4/x4)',
        linkSpeed: '64 Gbps aggregate NVMe bandwidth',
        firmwareVersion: 'FW 1.28.00 (PLX PEX88048 Switch ASIC)',
        temperatureC: 43,
        status: 'ONLINE',
        details: 'Ndërlidhje me ultra-shpejtësi të lartë për flash arrays (NVMe U.2/U.3) për SLOG ZIL dhe L2ARC.',
        connectedDevices: ['/dev/nvme0n1', '/dev/nvme1n1', '/dev/nvme2n1', '/dev/nvme3n1', '/dev/nvme4n1', '/dev/nvme5n1'],
      },
      {
        id: 'nic_storage_01',
        name: 'Enterprise 100GbE Storage NIC (RDMA/RoCE)',
        category: 'NIC',
        model: 'NVIDIA Mellanox ConnectX-6 Dx Dual-Port 100GbE QSFP56',
        busInterface: 'PCIe 4.0 x16 (Slot 2)',
        linkSpeed: '100 Gbps Full-Duplex (MTU 9000, RoCE v2)',
        firmwareVersion: 'FW 22.39.1002 (PXE 3.7.0201)',
        temperatureC: 51,
        status: 'ONLINE',
        details: 'Karta e rrjetit për replikim ZFS Z-Send në shpejtësi linje dhe ndarje iSCSI/NFS/NVMe-oF pa CPU overhead.',
        connectedDevices: ['eth0 (Storage Fabric A)', 'eth1 (Storage Fabric B)'],
      },
      {
        id: 'bmc_mgmt_01',
        name: 'Out-of-Band IPMI / BMC Remote Management',
        category: 'BMC',
        model: 'ASPEED AST2500 Server Management Processor',
        busInterface: 'Internal LPC / PCIe Bridge',
        linkSpeed: '1000 Mbps Dedicated Mgmt Port',
        firmwareVersion: 'IPMI FW v3.86 (Redfish REST API v1.11 Enabled)',
        temperatureC: 39,
        status: 'ONLINE',
        details: 'Monitorim harduerik 24/7, telemetri voltazhi, rrotullim i ventilatorëve dhe kontroll i energjisë.',
        connectedDevices: ['Dedicated IPMI Port (MAC: 00:25:90:EA:41:88)'],
      },
      {
        id: 'psu_01',
        name: 'Redundant Power Supply Unit 1 (Primary)',
        category: 'PSU',
        model: 'Supermicro PWS-1K28-PQ 1200W Titanium 80+ Level',
        busInterface: 'PMBus 1.2 (I2C System Bus)',
        linkSpeed: 'Dual Feed A/C Line 230V @ 50Hz',
        firmwareVersion: 'PMBus FW 1.04',
        temperatureC: 38,
        status: 'ONLINE',
        details: 'Furnizuesi kryesor me efikasitet 96%, ngarkesë aktuale 285 Watt.',
      },
      {
        id: 'psu_02',
        name: 'Redundant Power Supply Unit 2 (Hot Standby)',
        category: 'PSU',
        model: 'Supermicro PWS-1K28-PQ 1200W Titanium 80+ Level',
        busInterface: 'PMBus 1.2 (I2C System Bus)',
        linkSpeed: 'Dual Feed B/C Line 230V @ 50Hz',
        firmwareVersion: 'PMBus FW 1.04',
        temperatureC: 36,
        status: 'STANDBY',
        details: 'Furnizuesi sekondar me ndërrim të menjëhershëm (zero downtime failover).',
      },
      {
        id: 'cooling_chassis_01',
        name: 'Chassis Thermal Subsystem & Fan Array',
        category: 'FAN',
        model: '6x Nidec UltraFlo 80mm Hot-Swap PWM Redundant Fans',
        busInterface: 'PWM Controller / Tachometer Bus',
        linkSpeed: 'Automatic Dynamic Thermal Curve',
        firmwareVersion: 'BMC Zone Control v2.1',
        temperatureC: 22,
        status: 'ONLINE',
        details: 'Shpejtësia mesatare 4,350 RPM. Presion pozitiv ajri për ftohjen e disqeve dhe kontrollove HBA.',
      },
    ],
    chassisThermal: {
      intakeTempC: 22,
      exhaustTempC: 31,
      fanRpmAvg: 4350,
      psuLoadWatts: 285,
      psuEfficiencyPct: 96,
    },
  };

  if (useRealHost()) {
    hardware.zfsModuleVersion = 'not loaded';
    hardware.osDistribution = `${os.type()} ${os.release()}`;
    hardware.motherboard = 'unavailable';
    hardware.ipmiStatus = 'unavailable';
    hardware.peripherals = [];
    hardware.cpuThreads = cpus.length;
    hardware.cpuModel = cpus[0]?.model || 'unknown';
    hardware.cpuCores = cpus.length;
    hardware.chassisThermal = {
      intakeTempC: 0,
      exhaustTempC: 0,
      fanRpmAvg: 0,
      psuLoadWatts: 0,
      psuEfficiencyPct: 0,
    };
  }

  res.json({ status: 'success', hardware });
});

// Real-time Health Telemetry Endpoint (Polling for Sparklines)
let prevCpuTimes = { idle: 0, total: 0 };
app.get('/api/zfs/telemetry/realtime', (req: Request, res: Response) => {
  const state = getState();

  // 1. Calculate CPU %
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }
  const idleDelta = idle - prevCpuTimes.idle;
  const totalDelta = total - prevCpuTimes.total;
  prevCpuTimes = { idle, total };

  let cpuPct = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
  if (demoMode && (cpuPct < 3 || cpuPct > 98)) {
    cpuPct = Math.floor(Math.random() * 8) + 14;
  }
  cpuPct = Math.max(0, Math.min(100, cpuPct));

  // 2. Memory %
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;

  // 3. ARC Metrics — invented only while DEMO mode is on
  const arcSizeGb = demoMode ? parseFloat((state.arc.size / 1024 / 1024 / 1024).toFixed(2)) : 0;
  const microJitter = parseFloat(((Math.random() * 0.4) - 0.2).toFixed(2));
  const arcHitPct = demoMode
    ? parseFloat(Math.min(99.9, Math.max(90.0, state.arc.hit_ratio + microJitter)).toFixed(2))
    : 0;

  const iopsRead = demoMode ? Math.floor(Math.random() * 1200) + 3200 : 0;
  const iopsWrite = demoMode ? Math.floor(Math.random() * 600) + 1400 : 0;

  res.json({
    status: 'success',
    point: {
      timestamp: Date.now(),
      cpuPct,
      memoryPct,
      memoryUsedGb: parseFloat((usedMem / (1024 ** 3)).toFixed(2)),
      memoryTotalGb: parseFloat((totalMem / (1024 ** 3)).toFixed(2)),
      arcSizeGb,
      arcHitPct,
      iopsRead,
      iopsWrite,
      totalIops: iopsRead + iopsWrite,
    },
  });
});

// Rolling host + ARC resource usage (CPU %, RAM %, ARC hit/miss deltas)
interface ResourceUsagePoint {
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

const resourceUsageHistory: ResourceUsagePoint[] = [];
let resourceCpuPrev: { idle: number; total: number } | null = null;
let resourceArcPrev: { hits: number; misses: number } | null = null;

function readCpuTimes(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as Record<string, number>)[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function sinceBootCpuPct(): number {
  const { idle, total } = readCpuTimes();
  if (total <= 0) return 12;
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
}

function liveCpuPct(): number {
  const current = readCpuTimes();
  if (!resourceCpuPrev) {
    resourceCpuPrev = current;
    return sinceBootCpuPct();
  }
  const idleDelta = current.idle - resourceCpuPrev.idle;
  const totalDelta = current.total - resourceCpuPrev.total;
  resourceCpuPrev = current;
  if (totalDelta < 50) return sinceBootCpuPct();
  return Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
}

function readCumulativeArc(state: ReturnType<typeof getState>): { hits: number; misses: number; hitPct: number } {
  let hits = state.arc?.hits || 0;
  let misses = state.arc?.misses || 0;
  if (fs.existsSync('/proc/spl/kstat/zfs/arcstats')) {
    try {
      const kstat = fs.readFileSync('/proc/spl/kstat/zfs/arcstats', 'utf-8');
      for (const line of kstat.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3 && parts[0] === 'hits' && !isNaN(Number(parts[2]))) hits = Number(parts[2]);
        if (parts.length >= 3 && parts[0] === 'misses' && !isNaN(Number(parts[2]))) misses = Number(parts[2]);
      }
    } catch {
      // Fall back to the in-memory ARC counters.
    }
  }
  const total = hits + misses;
  const hitPct = total > 0
    ? parseFloat(((hits / total) * 100).toFixed(2))
    : (state.arc?.hit_ratio || 0);
  return { hits, misses, hitPct };
}

function syntheticArcInterval(hitPct: number, swing = 0): { hits: number; misses: number; hitPct: number } {
  const ratio = Math.min(99.2, Math.max(78, hitPct + swing));
  const misses = Math.round(240 + Math.random() * 360 + Math.abs(swing) * 8);
  const hits = Math.round(misses * (ratio / Math.max(0.8, 100 - ratio)));
  const total = hits + misses;
  return {
    hits,
    misses,
    hitPct: total > 0 ? parseFloat(((hits / total) * 100).toFixed(2)) : ratio,
  };
}

function arcInterval(state: ReturnType<typeof getState>, swing = 0): { hits: number; misses: number; hitPct: number } {
  const cumulative = readCumulativeArc(state);
  if (swing !== 0 || !resourceArcPrev) {
    if (swing === 0) resourceArcPrev = { hits: cumulative.hits, misses: cumulative.misses };
    return syntheticArcInterval(cumulative.hitPct, swing);
  }
  const deltaHits = Math.max(0, cumulative.hits - resourceArcPrev.hits);
  const deltaMisses = Math.max(0, cumulative.misses - resourceArcPrev.misses);
  resourceArcPrev = { hits: cumulative.hits, misses: cumulative.misses };
  if (deltaHits === 0 && deltaMisses === 0) {
    return syntheticArcInterval(cumulative.hitPct, (Math.random() * 1.6) - 0.8);
  }
  const total = deltaHits + deltaMisses;
  return {
    hits: deltaHits,
    misses: deltaMisses,
    hitPct: total > 0 ? parseFloat(((deltaHits / total) * 100).toFixed(2)) : cumulative.hitPct,
  };
}

function formatTimeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sampleResourceUsage(targetTimestamp = Date.now(), swing = 0): ResourceUsagePoint {
  const state = getState();
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  const memoryTotalGb = parseFloat((totalMem / (1024 ** 3)).toFixed(2));
  let memoryPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
  let cpuPct = swing === 0 ? liveCpuPct() : sinceBootCpuPct();
  if (swing !== 0) {
    cpuPct = Math.max(1, Math.min(98, Math.round(cpuPct + swing)));
    memoryPct = Math.max(1, Math.min(98, Math.round(memoryPct + swing * 0.35)));
  }
  const arc = arcInterval(state, swing);
  const memoryUsedGb = parseFloat(((memoryTotalGb * memoryPct) / 100).toFixed(2));
  return {
    timestamp: targetTimestamp,
    timeLabel: formatTimeLabel(targetTimestamp),
    cpuPct,
    memoryPct,
    memoryUsedGb,
    memoryTotalGb,
    arcHits: arc.hits,
    arcMisses: arc.misses,
    arcHitPct: arc.hitPct,
  };
}

const resourceSeed = Date.now();
if (demoMode) {
  for (let i = 29; i >= 1; i--) {
    const swing = Math.sin(i / 3.2) * 7;
    resourceUsageHistory.push(sampleResourceUsage(resourceSeed - i * 2000, swing));
  }
  resourceUsageHistory.push(sampleResourceUsage(resourceSeed, 0));
}
resourceCpuPrev = readCpuTimes();

function sampleHostResource(targetTimestamp = Date.now()): ResourceUsagePoint {
  const totalMem = os.totalmem();
  const usedMem = totalMem - os.freemem();
  const memoryTotalGb = parseFloat((totalMem / (1024 ** 3)).toFixed(2));
  const memoryPct = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
  return {
    timestamp: targetTimestamp,
    timeLabel: formatTimeLabel(targetTimestamp),
    cpuPct: liveCpuPct(),
    memoryPct,
    memoryUsedGb: parseFloat((usedMem / (1024 ** 3)).toFixed(2)),
    memoryTotalGb,
    arcHits: 0,
    arcMisses: 0,
    arcHitPct: 0,
  };
}

app.get('/api/zfs/telemetry/resource-usage', (req: Request, res: Response) => {
  const current = demoMode ? sampleResourceUsage() : sampleHostResource();
  resourceUsageHistory.push(current);
  if (resourceUsageHistory.length > 60) {
    resourceUsageHistory.shift();
  }
  res.json({
    status: 'success',
    current,
    history: resourceUsageHistory,
  });
});

// Detailed Real-time ZFS CPU & RAM Utilization Breakdown (Metadata vs Data Operations)
let txgCounter = 482190;
app.get('/api/zfs/telemetry/resource-utilization', (req: Request, res: Response) => {
  if (useRealHost()) {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuPct = liveCpuPct();
    const totalRamGb = parseFloat((totalMem / (1024 ** 3)).toFixed(2));
    const usedRamGb = parseFloat((usedMem / (1024 ** 3)).toFixed(2));
    const freeRamGb = parseFloat((freeMem / (1024 ** 3)).toFixed(2));
    res.json({
      status: 'success',
      demoMode: false,
      data: {
        timestamp: Date.now(),
        cpu: {
          totalPct: cpuPct,
          zfsTotalPct: 0,
          metadataPct: 0,
          dataPct: 0,
          txgSyncPct: 0,
          storageIoWaitPct: 0,
          otherSysPct: cpuPct,
        },
        ram: {
          totalRamBytes: totalMem,
          totalRamGb,
          usedRamBytes: usedMem,
          usedRamGb,
          freeRamGb,
          arcTotalBytes: 0,
          arcTotalGb: 0,
          arcTargetGb: 0,
          arcMetadataBytes: 0,
          arcMetadataGb: 0,
          arcMetadataPct: 0,
          arcDataBytes: 0,
          arcDataGb: 0,
          arcDataPct: 0,
          arcDirtyBytes: 0,
          arcDirtyMb: 0,
          arcGhostBytes: 0,
          arcGhostMb: 0,
          systemAppsGb: usedRamGb,
          kernelOverheadGb: 0,
        },
        ops: {
          metadataOpsPerSec: 0,
          dataOpsPerSec: 0,
          totalIops: 0,
          txgNumber: 0,
          txgState: 'OPEN',
          compressionRatio: 1,
          compressionSavingsGb: 0,
          throughputReadMbS: 0,
          throughputWriteMbS: 0,
        },
      },
    });
    return;
  }
  const state = getState();
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  txgCounter += 1;
  const txgStates: ('OPEN' | 'QUIESCING' | 'WAITING' | 'SYNCING')[] = ['OPEN', 'OPEN', 'QUIESCING', 'SYNCING'];
  const currentTxgState = txgStates[txgCounter % txgStates.length];

  // Dynamic CPU calculation with realistic ZFS metadata vs data separation
  const baseCpu = Math.floor(Math.random() * 6) + 16; // 16% - 22% total host CPU
  const metadataCpuPct = parseFloat(((Math.random() * 2.5) + 4.2).toFixed(1)); // ~4.2% - 6.7% for dnodes, metaslabs, b-tree
  const dataCpuPct = parseFloat(((Math.random() * 4.0) + 7.5).toFixed(1)); // ~7.5% - 11.5% for LZ4 compression & Fletcher4 checksums
  const txgSyncPct = parseFloat((currentTxgState === 'SYNCING' ? ((Math.random() * 2.0) + 2.5) : ((Math.random() * 0.8) + 0.6)).toFixed(1));
  const storageIoWaitPct = parseFloat(((Math.random() * 1.0) + 0.8).toFixed(1));
  const zfsTotalPct = parseFloat((metadataCpuPct + dataCpuPct + txgSyncPct + storageIoWaitPct).toFixed(1));
  const otherSysPct = parseFloat(Math.max(1.5, baseCpu - zfsTotalPct).toFixed(1));
  const totalCpuPct = parseFloat((zfsTotalPct + otherSysPct).toFixed(1));

  // RAM Breakdown: ARC Metadata vs ARC Data blocks
  const arcTotalBytes = state.arc?.size || (18.4 * 1024 * 1024 * 1024);
  const arcTotalGb = parseFloat((arcTotalBytes / (1024 ** 3)).toFixed(2));
  const arcTargetGb = parseFloat(((state.arc?.c_max || (28 * 1024 * 1024 * 1024)) / (1024 ** 3)).toFixed(2));

  // Metadata occupies ~30% of ARC (configurable via zfs_arc_meta_limit_percent)
  const metaRatio = 0.31 + (Math.sin(Date.now() / 10000) * 0.03);
  const arcMetadataBytes = Math.round(arcTotalBytes * metaRatio);
  const arcMetadataGb = parseFloat((arcMetadataBytes / (1024 ** 3)).toFixed(2));
  const arcMetadataPct = Math.round(metaRatio * 100);

  // User Data blocks occupy remaining ARC
  const dataRatio = 1 - metaRatio;
  const arcDataBytes = arcTotalBytes - arcMetadataBytes;
  const arcDataGb = parseFloat((arcDataBytes / (1024 ** 3)).toFixed(2));
  const arcDataPct = 100 - arcMetadataPct;

  // Dirty unwritten TXG payload & ghost list headers
  const arcDirtyMb = Math.round(380 + (Math.random() * 320));
  const arcGhostMb = Math.round(190 + (Math.random() * 80));

  // Memory outside ZFS
  const totalRamGb = parseFloat((totalMem / (1024 ** 3)).toFixed(2));
  const usedRamGb = parseFloat((usedMem / (1024 ** 3)).toFixed(2));
  const freeRamGb = parseFloat((freeMem / (1024 ** 3)).toFixed(2));
  const systemAppsGb = parseFloat(Math.max(2.0, usedRamGb - arcTotalGb).toFixed(2));
  const kernelOverheadGb = parseFloat(((Math.random() * 0.4) + 1.2).toFixed(2));

  // Real-time operations counters
  const metadataOpsPerSec = Math.round(9200 + (Math.random() * 4800)); // stat, getattr, open, lookup
  const dataOpsPerSec = Math.round(3400 + (Math.random() * 2100)); // payload read/write
  const totalIops = metadataOpsPerSec + dataOpsPerSec;

  res.json({
    status: 'success',
    data: {
      timestamp: Date.now(),
      cpu: {
        totalPct: totalCpuPct,
        zfsTotalPct,
        metadataPct: metadataCpuPct,
        dataPct: dataCpuPct,
        txgSyncPct,
        storageIoWaitPct,
        otherSysPct,
      },
      ram: {
        totalRamBytes: totalMem,
        totalRamGb,
        usedRamBytes: usedMem,
        usedRamGb,
        freeRamGb,
        arcTotalBytes,
        arcTotalGb,
        arcTargetGb,
        arcMetadataBytes,
        arcMetadataGb,
        arcMetadataPct,
        arcDataBytes,
        arcDataGb,
        arcDataPct,
        arcDirtyBytes: arcDirtyMb * 1024 * 1024,
        arcDirtyMb,
        arcGhostBytes: arcGhostMb * 1024 * 1024,
        arcGhostMb,
        systemAppsGb,
        kernelOverheadGb,
      },
      ops: {
        metadataOpsPerSec,
        dataOpsPerSec,
        totalIops,
        txgNumber: txgCounter,
        txgState: currentTxgState,
        compressionRatio: 2.14,
        compressionSavingsGb: 4820,
        throughputReadMbS: Math.round(420 + (Math.random() * 180)),
        throughputWriteMbS: Math.round(180 + (Math.random() * 90)),
      },
    },
  });
});

// Aggregate Real-time IOPS & Throughput Telemetry across all ZFS Pools
interface ServerPoolIoMetric {
  poolName: string;
  readIops: number;
  writeIops: number;
  totalIops: number;
  readThroughputMb: number;
  writeThroughputMb: number;
  totalThroughputMb: number;
}

interface ServerAggregateIoPoint {
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
  pools: ServerPoolIoMetric[];
}

const aggregateIoHistoryBuffer: ServerAggregateIoPoint[] = [];

function generateAggregateIoSample(targetTimestamp = Date.now()): ServerAggregateIoPoint {
  const d = new Date(targetTimestamp);
  const timeLabel = d.toTimeString().split(' ')[0];

  // Pool 1: tank-enterprise (Hybrid HDD RAIDZ2 + SLOG NVMe + L2ARC + Special VDEV)
  const tankReadIops = Math.floor(Math.random() * 700) + 2650;
  const tankWriteIops = Math.floor(Math.random() * 450) + 1150;
  const tankReadMb = parseFloat(((Math.random() * 75) + 285).toFixed(1));
  const tankWriteMb = parseFloat(((Math.random() * 55) + 165).toFixed(1));

  // Pool 2: fast-nvme-pool (Enterprise all-flash PCIe NVMe mirror)
  const nvmeReadIops = Math.floor(Math.random() * 1100) + 3950;
  const nvmeWriteIops = Math.floor(Math.random() * 850) + 2150;
  const nvmeReadMb = parseFloat(((Math.random() * 160) + 560).toFixed(1));
  const nvmeWriteMb = parseFloat(((Math.random() * 110) + 390).toFixed(1));

  const pools: ServerPoolIoMetric[] = [
    {
      poolName: 'tank-enterprise',
      readIops: tankReadIops,
      writeIops: tankWriteIops,
      totalIops: tankReadIops + tankWriteIops,
      readThroughputMb: tankReadMb,
      writeThroughputMb: tankWriteMb,
      totalThroughputMb: parseFloat((tankReadMb + tankWriteMb).toFixed(1)),
    },
    {
      poolName: 'fast-nvme-pool',
      readIops: nvmeReadIops,
      writeIops: nvmeWriteIops,
      totalIops: nvmeReadIops + nvmeWriteIops,
      readThroughputMb: nvmeReadMb,
      writeThroughputMb: nvmeWriteMb,
      totalThroughputMb: parseFloat((nvmeReadMb + nvmeWriteMb).toFixed(1)),
    },
  ];

  const totalReadIops = tankReadIops + nvmeReadIops;
  const totalWriteIops = tankWriteIops + nvmeWriteIops;
  const totalReadMb = parseFloat((tankReadMb + nvmeReadMb).toFixed(1));
  const totalWriteMb = parseFloat((tankWriteMb + nvmeWriteMb).toFixed(1));

  const readLatencyMs = parseFloat(((Math.random() * 0.12) + 0.35).toFixed(2));
  const writeLatencyMs = parseFloat(((Math.random() * 0.18) + 0.55).toFixed(2));

  return {
    timestamp: targetTimestamp,
    timeLabel,
    readIops: totalReadIops,
    writeIops: totalWriteIops,
    totalIops: totalReadIops + totalWriteIops,
    readThroughputMb: totalReadMb,
    writeThroughputMb: totalWriteMb,
    totalThroughputMb: parseFloat((totalReadMb + totalWriteMb).toFixed(1)),
    readLatencyMs,
    writeLatencyMs,
    pools,
  };
}

if (demoMode) {
  const initTime = Date.now();
  for (let i = 24; i >= 0; i--) {
    aggregateIoHistoryBuffer.push(generateAggregateIoSample(initTime - i * 2000));
  }
}

app.get('/api/zfs/telemetry/aggregate-io', (req: Request, res: Response) => {
  if (useRealHost()) {
    if (aggregateIoHistoryBuffer.some((point) => point.pools.length > 0)) {
      aggregateIoHistoryBuffer.length = 0;
    }
    const now = Date.now();
    const current = {
      timestamp: now,
      timeLabel: formatTimeLabel(now),
      readIops: 0,
      writeIops: 0,
      totalIops: 0,
      readThroughputMb: 0,
      writeThroughputMb: 0,
      totalThroughputMb: 0,
      readLatencyMs: 0,
      writeLatencyMs: 0,
      pools: [] as ServerPoolIoMetric[],
    };
    aggregateIoHistoryBuffer.push(current);
    if (aggregateIoHistoryBuffer.length > 60) aggregateIoHistoryBuffer.shift();
    res.json({ status: 'success', demoMode: false, current, history: aggregateIoHistoryBuffer });
    return;
  }
  const current = generateAggregateIoSample();
  aggregateIoHistoryBuffer.push(current);
  if (aggregateIoHistoryBuffer.length > 60) {
    aggregateIoHistoryBuffer.shift();
  }
  res.json({
    status: 'success',
    current,
    history: aggregateIoHistoryBuffer,
  });
});

function blockName(devPath: string): string {
  return devPath.replace(/^\/dev\//, '');
}

async function readLiveDeviceInfo(rawDev: string) {
  const cleaned = String(rawDev || '').trim().replace(/_/g, '/');
  const requested = cleaned.startsWith('/dev/') ? cleaned : `/dev/${cleaned.replace(/^\/+/, '')}`;
  if (!/^\/dev\/[A-Za-z0-9]+$/.test(requested)) {
    return { status: 400, error: 'Invalid device path.' };
  }
  const requestedName = blockName(requested);
  const blockExists = managingRemote()
    ? (await runShell(`test -e /sys/class/block/${requestedName}`)).code === 0
    : fs.existsSync(`/sys/class/block/${requestedName}`);
  if (!blockExists) {
    return { status: 404, error: `${requested} is not a block device on this host.` };
  }

  const listed = await runShell(
    `lsblk -J -b -o NAME,PATH,SIZE,TYPE,TRAN,ROTA,MODEL,SERIAL,VENDOR,PKNAME ${requested}`,
  );
  let disk: any = null;
  if (listed.code === 0 && listed.stdout.trim()) {
    try {
      const parsed = JSON.parse(listed.stdout);
      disk = Array.isArray(parsed.blockdevices) ? parsed.blockdevices[0] : null;
    } catch {
      disk = null;
    }
  }
  if (!disk || disk.type !== 'disk') {
    const parent = String(disk?.pkname || '');
    const parentOk = /^[A-Za-z0-9]+$/.test(parent) && (managingRemote()
      ? (await runShell(`test -e /sys/class/block/${parent}`)).code === 0
      : fs.existsSync(`/sys/class/block/${parent}`));
    if (parent && parentOk) {
      const again = await runShell(
        `lsblk -J -b -o NAME,PATH,SIZE,TYPE,TRAN,ROTA,MODEL,SERIAL,VENDOR,PKNAME /dev/${parent}`,
      );
      if (again.code === 0 && again.stdout.trim()) {
        try {
          const parsed = JSON.parse(again.stdout);
          disk = Array.isArray(parsed.blockdevices) ? parsed.blockdevices[0] : disk;
        } catch {
          /* keep the first listing */
        }
      }
    }
  }
  const diskName = String(disk?.name || requestedName);
  const diskPath = String(disk?.path || `/dev/${diskName}`);
  const vendor = String(disk?.vendor || '').trim();
  const usableVendor = /^0x[0-9a-f]+$/i.test(vendor) ? '' : vendor;
  const modelName = String(disk?.model || '').trim();
  const kind = classifyDisk(diskName, String(disk?.tran || ''), disk?.rota);
  const model = [usableVendor, modelName].filter(Boolean).join(' ')
    || (kind.startsWith('VirtIO') ? 'VirtIO disk' : kind);
  const bytes = Number(disk?.size);
  const capacity = Number.isFinite(bytes) && bytes > 0
    ? `${(bytes / (1024 ** 3)).toFixed(2)} GiB`
    : '';
  const partitions = Array.isArray(disk?.children)
    ? disk.children
        .filter((child: any) => child && (child.type === 'part' || child.type === 'md'))
        .map((child: any) => {
          const childBytes = Number(child.size);
          const size = Number.isFinite(childBytes) && childBytes > 0
            ? `${(childBytes / (1024 ** 2)).toFixed(0)} MiB`
            : '';
          return [child.path || `/dev/${child.name}`, size].filter(Boolean).join(' ');
        })
    : [];

  const smart = await runShell(`smartctl -j -a ${diskPath}`, 20000);
  let parsed: any = null;
  try {
    parsed = JSON.parse(smart.stdout || '');
  } catch {
    parsed = null;
  }
  const messages = Array.isArray(parsed?.smartctl?.messages)
    ? parsed.smartctl.messages.map((item: any) => String(item.string || '')).filter(Boolean)
    : [];
  const nvme = parsed?.nvme_smart_health_information_log;
  const ata = Array.isArray(parsed?.ata_smart_attributes?.table) ? parsed.ata_smart_attributes.table : [];
  const ataRaw = (id: number) => {
    const row = ata.find((item: any) => Number(item.id) === id);
    const value = row?.raw?.value;
    return typeof value === 'number' ? value : null;
  };
  const smartPassed = parsed?.smart_status?.passed;
  const hasSmart = smartPassed === true || smartPassed === false || nvme || ata.length > 0;

  const base = {
    dev: diskPath,
    requested,
    model,
    serial: String(disk?.serial || '').trim() || '—',
    firmware: String(parsed?.firmware_version || '').trim() || '—',
    bus_type: kind,
    capacity: capacity || '—',
    sector_size: Number(parsed?.logical_block_size) || null,
    trim_supported: null,
    plp_supported: null,
    rotation_rate: kind.includes('SSD') || kind === 'NVMe' ? 'SSD' : kind.includes('HDD') ? 'HDD' : kind,
    partitions,
    history: [] as unknown[],
  };

  if (!hasSmart) {
    const reason = messages[0] || 'smartctl did not return S.M.A.R.T. attributes for this disk.';
    return {
      status: 200,
      deviceInfo: {
        ...base,
        smart_available: false,
        smart_status: 'NOT AVAILABLE',
        smart_note: reason,
        temperature_c: null,
        power_on_hours: null,
        wear_level_pct: null,
        tbw_written: '—',
        reallocated_sectors: null,
        pending_sectors: null,
        health_score_pct: null,
      },
    };
  }

  const temperature = typeof parsed?.temperature?.current === 'number'
    ? parsed.temperature.current
    : typeof nvme?.temperature === 'number'
      ? nvme.temperature
      : ataRaw(194);
  const powerHours = typeof parsed?.power_on_time?.hours === 'number'
    ? parsed.power_on_time.hours
    : typeof nvme?.power_on_hours === 'number'
      ? nvme.power_on_hours
      : ataRaw(9);
  const wear = typeof nvme?.percentage_used === 'number'
    ? Math.max(0, 100 - nvme.percentage_used)
    : null;
  const tbw = typeof nvme?.data_units_written === 'number'
    ? `${((nvme.data_units_written * 512000) / 1e12).toFixed(2)} TB`
    : '—';

  return {
    status: 200,
    deviceInfo: {
      ...base,
      smart_available: true,
      smart_status: smartPassed === false ? 'FAILED' : smartPassed === true ? 'PASSED' : 'REPORTED',
      smart_note: '',
      temperature_c: temperature,
      power_on_hours: powerHours,
      wear_level_pct: wear,
      tbw_written: tbw,
      reallocated_sectors: ataRaw(5),
      pending_sectors: ataRaw(197),
      health_score_pct: null,
    },
  };
}

// Device SMART & Hardware Info Endpoint
app.get('/api/zfs/devices/:dev', async (req: Request, res: Response) => {
  const rawDev = req.params.dev;
  if (useRealHost()) {
    const live = await readLiveDeviceInfo(rawDev);
    if (live.error) return res.status(live.status).json({ error: live.error });
    return res.json({ status: 'success', deviceInfo: live.deviceInfo });
  }
  const cleanDev = rawDev.replace(/_/g, '/');
  const isNvme = cleanDev.includes('nvme');
  const isSde = cleanDev.endsWith('sde');
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const hourMs = 3600 * 1000;

  const history = isSde
    ? [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 32, wearLevelPct: 100 },
        { timestamp: now - 5 * dayMs, timeLabel: 'D-5', reallocatedSectors: 1, pendingSectors: 0, healthScorePct: 98, temperatureC: 33, wearLevelPct: 100 },
        { timestamp: now - 3 * dayMs, timeLabel: 'D-3', reallocatedSectors: 3, pendingSectors: 1, healthScorePct: 94, temperatureC: 36, wearLevelPct: 100 },
        { timestamp: now - 2 * dayMs, timeLabel: 'D-2', reallocatedSectors: 6, pendingSectors: 2, healthScorePct: 90, temperatureC: 39, wearLevelPct: 100 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 11, pendingSectors: 3, healthScorePct: 82, temperatureC: 41, wearLevelPct: 100 },
        { timestamp: now - 6 * hourMs, timeLabel: '6h ago', reallocatedSectors: 15, pendingSectors: 4, healthScorePct: 74, temperatureC: 43, wearLevelPct: 100 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 18, pendingSectors: 4, healthScorePct: 68, temperatureC: 44, wearLevelPct: 100 },
      ]
    : isNvme
    ? [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 99, temperatureC: 33, wearLevelPct: 99 },
        { timestamp: now - 3 * dayMs, timeLabel: 'D-3', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 99, temperatureC: 34, wearLevelPct: 99 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 98, temperatureC: 35, wearLevelPct: 98 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 98, temperatureC: 34, wearLevelPct: 98 },
      ]
    : [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 30, wearLevelPct: 100 },
        { timestamp: now - 3 * dayMs, timeLabel: 'D-3', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 31, wearLevelPct: 100 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 31, wearLevelPct: 100 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 32, wearLevelPct: 100 },
      ];

  const smartInfo = {
    dev: cleanDev.startsWith('/') ? cleanDev : `/${cleanDev}`,
    model: isNvme ? 'Samsung PM9A3 PLP Enterprise NVMe' : 'Seagate Exos X16 Enterprise 7.2K',
    serial: isNvme ? 'S6G9NE0R810294' : isSde ? 'WNA1K28491027' : 'WNA1K28491024',
    firmware: isNvme ? 'GDC7302Q' : 'SN04',
    bus_type: isNvme ? 'PCIe 4.0 x4 (NVMe 1.4 Direct Direct-Attach)' : 'SATA 3.3 6.0 Gb/s (AHCI)',
    capacity: isNvme ? '1.92 TB (1,920,383,410,176 bytes)' : '4.00 TB (4,000,787,030,016 bytes)',
    sector_size: 4096,
    smart_status: isSde
      ? 'WARNING (18 Reallocated Sectors, 4 Pending - Acceleration Detected)'
      : 'PASSED (Health: 100% Optimal, 0 Reallocated Sectors)',
    temperature_c: isSde ? 44 : isNvme ? 34 : 31,
    power_on_hours: 12480,
    wear_level_pct: isSde ? 100 : isNvme ? 98 : 100,
    tbw_written: isNvme ? '420.5 TBW' : '184.2 TBW',
    trim_supported: true,
    plp_supported: isNvme,
    rotation_rate: isNvme ? 'Solid State (3D TLC V-NAND)' : '7200 RPM Spin Rate',
    reallocated_sectors: isSde ? 18 : 0,
    pending_sectors: isSde ? 4 : 0,
    health_score_pct: isSde ? 68 : 100,
    history,
    partitions: [
      `${cleanDev}p1 (ZFS Pool Member - GUID: 0x6A898E5F)`,
      `${cleanDev}p9 (Solaris Reserved Space - 8.00 MB)`,
    ],
  };

  res.json({ status: 'success', deviceInfo: smartInfo });
});

// Device Action Endpoint (Modify status: offline/online, or Delete/Remove/Detach device from pool)
app.post('/api/zfs/devices/action', async (req: Request, res: Response) => {
  const { pool: poolName, dev, action } = req.body;
  if (useRealHost()) {
    const pool = poolToken(String(poolName || ''));
    const device = devToken(String(dev || ''));
    if (!pool || !device) return res.status(400).json({ error: 'Invalid pool or device.' });
    const cmd = action === 'offline' ? `zpool offline ${pool} ${device}`
      : action === 'online' ? `zpool online ${pool} ${device}`
      : action === 'detach' ? `zpool detach ${pool} ${device}`
      : action === 'remove' ? `zpool remove ${pool} ${device}`
      : '';
    if (!cmd) return res.status(400).json({ error: `Unknown action ${action}` });
    const result = await runShell(cmd, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zpool command failed') });
    return res.json({ status: 'success', message: `${action} applied to ${device} on ${pool}.` });
  }
  const state = getState();
  if (!poolName || !dev || !action) {
    return res.status(400).json({ error: 'Mungon pool, dev ose action' });
  }

  const pool = state.pools.find((p: any) => p.name === poolName);
  if (!pool) return res.status(404).json({ error: `Pool-i '${poolName}' nuk u gjet` });

  if (action === 'offline' || action === 'online') {
    pool.status = `Pajisja ${dev} u modifikua ne ${action.toUpperCase()}. Pool health is monitored.`;
    saveState(state);
    addSystemLog({
      level: action === 'offline' ? 'WARN' : 'INFO',
      source: 'zfs-kernel',
      subsystem: 'vdev',
      pool: poolName,
      message: `vdev state transition: disk ${dev} transitioned to ${action.toUpperCase()} by administrator`,
    });
    return res.json({
      status: 'success',
      message: `Pajisja ${dev} u modifikua ne statusin: ${action.toUpperCase()}`,
      pool,
    });
  }

  if (action === 'remove' || action === 'detach') {
    let removed = false;
    pool.vdevs.forEach((v: any) => {
      const idx = v.disks.indexOf(dev);
      if (idx !== -1) {
        v.disks.splice(idx, 1);
        removed = true;
      }
    });
    pool.vdevs = pool.vdevs.filter((v: any) => v.disks.length > 0);
    saveState(state);
    addSystemLog({
      level: 'WARN',
      source: 'zed',
      subsystem: 'vdev',
      pool: poolName,
      message: `vdev detached: device ${dev} successfully detached from pool ${poolName}`,
    });
    return res.json({
      status: 'success',
      message: `Pajisja ${dev} u hoq/shkeput me sukses nga pool-i '${poolName}'.`,
      pool,
    });
  }

  res.status(400).json({ error: `Veprimi ${action} nuk njihet` });
});

// Live Benchmark execution endpoint
app.post('/api/zfs/benchmark/run', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.status(409).json({ error: 'DEMO is off. This host has no benchmark runner, so no synthetic results are returned.' });
    return;
  }
  const state = getState();
  const { pool = 'tank-enterprise', testType = 'sync_mixed' } = req.body;

  const isFastPool = pool.includes('nvme');
  const newBenchmark = {
    id: `bench-${Date.now()}`,
    pool,
    test_type: testType === 'sync_mixed'
      ? 'Mixed Sync Write + ARC Read (Database Sim)'
      : testType === 'seq_streaming'
      ? 'Sequential Streaming (1M Block Size)'
      : 'Random 4K OLTP IOPS Stress Test',
    seq_read_mb_s: isFastPool ? 6920.4 : 3510.8,
    seq_write_mb_s: isFastPool ? 4310.2 : 1890.5,
    rand_read_iops: isFastPool ? 435000 : 192000,
    rand_write_iops: isFastPool ? 290000 : 96500,
    avg_latency_ms: isFastPool ? 0.07 : 0.17,
    arc_hit_pct: 98.2,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
  };

  if (!state.benchmarks) state.benchmarks = defaultState.benchmarks;
  state.benchmarks.unshift(newBenchmark);
  saveState(state);

  addSystemLog({
    level: 'INFO',
    source: 'storage-director',
    subsystem: 'benchmark',
    pool,
    message: `Storage pipeline benchmark finished for ${pool} (${newBenchmark.test_type}): Seq Read=${newBenchmark.seq_read_mb_s}MB/s, IOPS=${newBenchmark.rand_read_iops}`,
  });

  res.json({ status: 'success', result: newBenchmark });
});

// -------------------------------------------------------------
// SYSTEM-LEVEL ZFS & DAEMON LOGS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/zfs/logs', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.json({
      status: 'success',
      logs: [],
      total: 0,
      bufferSize: 0,
      stats: { errorCount: 0, warnCount: 0, infoCount: 0, debugCount: 0 },
    });
    return;
  }
  const { level, source, pool, search, limit = '100', since } = req.query;

  let filtered = [...systemLogs];

  // Filter by level
  if (level && typeof level === 'string' && level !== 'all') {
    const l = level.toUpperCase();
    filtered = filtered.filter((log) => log.level === l);
  }

  // Filter by source daemon
  if (source && typeof source === 'string' && source !== 'all') {
    filtered = filtered.filter((log) => log.source.toLowerCase() === source.toLowerCase());
  }

  // Filter by pool
  if (pool && typeof pool === 'string' && pool !== 'all') {
    filtered = filtered.filter((log) => log.pool?.toLowerCase() === pool.toLowerCase());
  }

  // Filter by search keyword
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = filtered.filter((log) =>
      log.message.toLowerCase().includes(q) ||
      log.source.toLowerCase().includes(q) ||
      (log.subsystem && log.subsystem.toLowerCase().includes(q)) ||
      (log.pool && log.pool.toLowerCase().includes(q)) ||
      (log.raw && log.raw.toLowerCase().includes(q))
    );
  }

  // Filter by since epoch timestamp
  if (since && typeof since === 'string') {
    const sinceMs = parseInt(since, 10);
    if (!isNaN(sinceMs)) {
      filtered = filtered.filter((log) => log.epochMs > sinceMs);
    }
  }

  // Calculate severity statistics across current active buffer
  const errorCount = systemLogs.filter((l) => l.level === 'ERROR').length;
  const warnCount = systemLogs.filter((l) => l.level === 'WARN').length;
  const infoCount = systemLogs.filter((l) => l.level === 'INFO').length;
  const debugCount = systemLogs.filter((l) => l.level === 'DEBUG').length;

  const maxLimit = Math.min(500, Math.max(10, parseInt(limit as string, 10) || 100));
  const paged = filtered.slice(0, maxLimit);

  res.json({
    status: 'success',
    logs: paged,
    total: filtered.length,
    bufferSize: systemLogs.length,
    stats: {
      errorCount,
      warnCount,
      infoCount,
      debugCount,
    },
  });
});

// Clear log buffer
app.post('/api/zfs/logs/clear', (req: Request, res: Response) => {
  if (useRealHost()) return res.json({ status: 'success', message: 'LIVE mode does not keep a simulated log buffer.' });
  systemLogs.length = 0;
  const entry = addSystemLog({
    level: 'INFO',
    source: 'storage-director',
    subsystem: 'audit',
    pool: 'system',
    message: 'System log buffer cleared by administrator.',
  });

  res.json({ status: 'success', message: 'Log buffer cleared', entry });
});

// Generate diagnostic test log
app.post('/api/zfs/logs/generate', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.status(409).json({ error: 'DEMO is off. Diagnostic events are not simulated.' });
    return;
  }
  const { level = 'WARN', message, source = 'zfs-kernel', pool = 'tank-enterprise' } = req.body;
  const entry = addSystemLog({
    level: (['INFO', 'WARN', 'ERROR', 'DEBUG'].includes(level) ? level : 'WARN') as any,
    source: source || 'zfs-kernel',
    subsystem: 'diag',
    pool: pool || 'tank-enterprise',
    message: message || `Diagnostic test alert triggered: system check on ${pool} (code 0x${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase()})`,
  });

  res.json({ status: 'success', log: entry });
});


// 2. Pools
app.get('/api/zfs/pools', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const live = await readLiveInventory();
    res.json({ pools: live.pools });
    return;
  }
  res.json({ pools: getState().pools });
});

app.post('/api/zfs/pools', async (req: Request, res: Response) => {
  const state = getState();
  const { name, ashift = 12, topology = 'raidz2', disks = [], slogDisks = [], l2arcDisks = [], specialDisks = [], spareDisks = [], compression = 'zstd', recordsize = '128K' } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Emri i pool-it eshte i detyrueshem' });
  }
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(String(name))) {
    return res.status(400).json({ error: 'Pool name must start with a letter and contain only letters, numbers, dot, underscore, or dash.' });
  }

  if (useRealHost()) {
    const dataDisks = Array.isArray(disks) ? disks.map(String) : [];
    const logDisks = Array.isArray(slogDisks) ? slogDisks.map(String) : [];
    const cacheDisks = Array.isArray(l2arcDisks) ? l2arcDisks.map(String) : [];
    const metadataDisks = Array.isArray(specialDisks) ? specialDisks.map(String) : [];
    const spareList = Array.isArray(spareDisks) ? spareDisks.map(String) : [];
    const seen = new Set<string>();
    for (const dev of [...dataDisks, ...logDisks, ...cacheDisks, ...metadataDisks, ...spareList]) {
      if (seen.has(dev)) return res.status(400).json({ error: `${dev} is selected for more than one VDEV.` });
      seen.add(dev);
    }
    const needed = MIN_VDEV_DISKS[topology] ?? 1;
    if (dataDisks.length < needed) {
      return res.status(400).json({ error: `${topology} needs at least ${needed} disks. ${dataDisks.length} selected.` });
    }
    const shift = Number(ashift);
    if (!Number.isInteger(shift) || shift < 9 || shift > 16) {
      return res.status(400).json({ error: 'ashift must be an integer from 9 to 16.' });
    }
    if (!/^(off|lz4|zstd|zstd-[1-9]|gzip|gzip-[1-9])$/.test(String(compression))) {
      return res.status(400).json({ error: 'Unsupported compression value.' });
    }
    if (!/^(512|1K|2K|4K|8K|16K|32K|64K|128K|256K|512K|1M)$/.test(String(recordsize))) {
      return res.status(400).json({ error: 'Unsupported recordsize value.' });
    }
    const busy = await disksAreFree([...dataDisks, ...logDisks, ...cacheDisks, ...metadataDisks, ...spareList]);
    if (busy) return res.status(400).json({ error: busy });
    const exists = await runShell(`zpool list -H -o name ${name}`);
    if (exists.code === 0 && exists.stdout.trim() === name) {
      return res.status(400).json({ error: `Pool '${name}' already exists.` });
    }
    const keyword = zpoolKeyword(String(topology));
    const logPart = logDisks.length ? ` log${logDisks.length > 1 ? ' mirror' : ''} ${logDisks.join(' ')}` : '';
    const cachePart = cacheDisks.length ? ` cache ${cacheDisks.join(' ')}` : '';
    const specialPart = metadataDisks.length ? ` special${metadataDisks.length > 1 ? ' mirror' : ''} ${metadataDisks.join(' ')}` : '';
    const sparePart = spareList.length ? ` spare ${spareList.join(' ')}` : '';
    const created = await runShell(
      `zpool create -o ashift=${shift} -O compression=${compression} -O atime=off -O xattr=sa -O acltype=posixacl -O recordsize=${recordsize} ${name}${keyword ? ` ${keyword}` : ''} ${dataDisks.join(' ')}${logPart}${specialPart}${cachePart}${sparePart}`,
      60000,
    );
    if (created.code !== 0) {
      const detail = (created.stderr || created.stdout || 'zpool create failed').trim();
      return res.status(400).json({ error: detail });
    }
    const live = await readLiveInventory();
    const pool = live.pools.find((item) => item.name === name);
    return res.json({ status: 'success', message: `Pool '${name}' was created.`, pool });
  }

  const existing = state.pools.find((p: any) => p.name === name);
  if (existing) {
    return res.status(400).json({ error: `Pool-i '${name}' ekziston tashme!` });
  }

  const newVdevs: any[] = [
    {
      type: topology,
      name: `${topology}-0`,
      status: 'ONLINE',
      disks: disks.length ? disks : ['/dev/sdh', '/dev/sdi'],
      capacity: '8.0T',
    },
  ];

  if (slogDisks.length > 0) {
    newVdevs.push({
      type: 'log',
      name: 'slog-0',
      status: 'ONLINE',
      disks: slogDisks,
      desc: 'SLOG ZIL Fast Sync Write Device',
      capacity: '64G',
    });
  }

  if (l2arcDisks.length > 0) {
    newVdevs.push({
      type: 'cache',
      name: 'l2arc-cache-0',
      status: 'ONLINE',
      disks: l2arcDisks,
      desc: 'L2ARC Secondary Read Cache',
      capacity: '1.92T',
    });
  }

  if (specialDisks.length > 0) {
    newVdevs.push({
      type: 'special',
      name: 'special-0',
      status: 'ONLINE',
      disks: specialDisks,
      desc: 'Special metadata VDEV',
      capacity: '—',
    });
  }

  if (spareDisks.length > 0) {
    newVdevs.push({
      type: 'spare',
      name: 'spare-0',
      status: 'AVAIL',
      disks: spareDisks,
      desc: 'Hot spare',
      capacity: '—',
    });
  }

  const newPool = {
    name,
    guid: Date.now().toString(),
    health: 'ONLINE',
    size: '8.0T',
    allocated: '480K',
    free: '7.99T',
    frag: '0%',
    dedup: '1.00x',
    ashift,
    status: 'No known data errors. Newly provisioned pool.',
    scrub_status: 'Never scrubbed',
    scrub_active: false,
    last_scrub: 'Never',
    vdevs: newVdevs,
  };

  state.pools.push(newPool);

  // Also create base dataset
  state.datasets.push({
    name: name,
    type: 'filesystem',
    mountpoint: `/${name}`,
    used: '480K',
    avail: '7.99T',
    refer: '96K',
    compression: 'zstd',
    compressratio: '1.00x',
    recordsize: '128K',
    atime: 'off',
    dedup: 'off',
    quota: 'none',
    encryption: 'off',
    readonly: 'off',
  });

  saveState(state);
  res.json({ status: 'success', message: `Pool '${name}' u krijua me sukses!`, pool: newPool });
});

// Scrub start/stop/pause
app.post('/api/zfs/pools/:name/scrub', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = poolToken(String(req.params.name || ''));
    if (!name) return res.status(400).json({ error: 'Invalid pool name.' });
    const action = req.body?.action || 'start';
    const cmd = action === 'pause' ? `zpool scrub -p ${name}` : action === 'stop' ? `zpool scrub -s ${name}` : `zpool scrub ${name}`;
    const result = await runShell(cmd, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zpool scrub failed') });
    return res.json({ status: 'success', message: `Scrub ${action} on ${name}.` });
  }
  const state = getState();
  const pool = state.pools.find((p: any) => p.name === req.params.name);
  if (!pool) return res.status(404).json({ error: 'Pool-i nuk u gjet' });

  const { action = 'start' } = req.body;
  if (action === 'start') {
    pool.scrub_active = true;
    pool.scrub_status = 'Scrub in progress: 2.4% done, 0 errors, ETA: 01:30:00';
    pool.last_scrub = 'Just started';
  } else if (action === 'stop' || action === 'pause') {
    pool.scrub_active = false;
    pool.scrub_status = `Scrub ${action === 'pause' ? 'paused' : 'stopped'} by operator.`;
  }

  saveState(state);
  res.json({ status: 'success', pool });
});

// Trim pool SSDs
app.post('/api/zfs/pools/:name/trim', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = poolToken(String(req.params.name || ''));
    if (!name) return res.status(400).json({ error: 'Invalid pool name.' });
    const result = await runShell(`zpool trim ${name}`, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zpool trim failed') });
    return res.json({ status: 'success', message: `TRIM started for ${name}.` });
  }
  const state = getState();
  const pool = state.pools.find((p: any) => p.name === req.params.name);
  if (!pool) return res.status(404).json({ error: 'Pool-i nuk u gjet' });

  pool.status = 'TRIM command completed for all SSD/NVMe vdevs. LBA reclaimed.';
  saveState(state);
  res.json({ status: 'success', message: `TRIM u krye per ${pool.name}` });
});

// -------------------------------------------------------------
// SCRUB SCHEDULER & CRON MAINTENANCE WINDOWS
// -------------------------------------------------------------
const defaultScrubSchedules = [
  {
    id: 'sched-1',
    poolName: 'tank-enterprise',
    frequency: 'weekly',
    cronExpression: '0 2 * * 0',
    dayOfWeek: 0,
    hour: 2,
    minute: 0,
    enabled: true,
    priority: 'normal',
    maxDurationHours: 6,
    maintenanceWindow: {
      startTime: '02:00',
      endTime: '08:00',
      days: ['Sun'],
    },
    nextRun: '2026-10-18 02:00:00',
    lastRun: '2026-10-11 02:00:00',
    lastStatus: 'SUCCESS',
    description: 'Weekly full integrity scrub for production RAIDZ2 storage array',
    autoPauseOnHeavyLoad: true,
  },
  {
    id: 'sched-2',
    poolName: 'fast-nvme-pool',
    frequency: 'biweekly',
    cronExpression: '0 3 1,15 * *',
    dayOfMonth: 1,
    hour: 3,
    minute: 0,
    enabled: true,
    priority: 'high',
    maxDurationHours: 2,
    maintenanceWindow: {
      startTime: '03:00',
      endTime: '05:00',
      days: ['1st', '15th'],
    },
    nextRun: '2026-10-15 03:00:00',
    lastRun: '2026-10-01 03:00:00',
    lastStatus: 'SUCCESS',
    description: 'Fast NVMe database mirror scrub window during maintenance period',
    autoPauseOnHeavyLoad: false,
  },
];

const defaultScrubHistory = [
  {
    id: 'scrub-h-1',
    poolName: 'tank-enterprise',
    date: '2026-08-03',
    durationMinutes: 142,
    durationFormatted: '02h 22m',
    dataScrubbedTb: 3.8,
    rateMbS: 456.2,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 5,
    hardwareNote: 'Optimal run. All 6 SAS HDDs nominal response times.',
  },
  {
    id: 'scrub-h-2',
    poolName: 'tank-enterprise',
    date: '2026-08-17',
    durationMinutes: 148,
    durationFormatted: '02h 28m',
    dataScrubbedTb: 3.9,
    rateMbS: 449.1,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 6,
    hardwareNote: 'Healthy scrub cycle across RAIDZ2-0.',
  },
  {
    id: 'scrub-h-3',
    poolName: 'tank-enterprise',
    date: '2026-08-31',
    durationMinutes: 154,
    durationFormatted: '02h 34m',
    dataScrubbedTb: 4.0,
    rateMbS: 442.8,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 8,
    hardwareNote: 'Nominal completion, slight capacity increase.',
  },
  {
    id: 'scrub-h-4',
    poolName: 'tank-enterprise',
    date: '2026-09-14',
    durationMinutes: 165,
    durationFormatted: '02h 45m',
    dataScrubbedTb: 4.1,
    rateMbS: 423.8,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 14,
    hardwareNote: 'Mild latency increase detected on /dev/sde during inner cylinder passes.',
  },
  {
    id: 'scrub-h-5',
    poolName: 'tank-enterprise',
    date: '2026-09-28',
    durationMinutes: 188,
    durationFormatted: '03h 08m',
    dataScrubbedTb: 4.1,
    rateMbS: 372.5,
    checksumErrors: 2,
    readErrors: 1,
    writeErrors: 0,
    repairedBytes: 8192,
    status: 'WARNING',
    degradationRiskPct: 48,
    hardwareNote: 'Self-healed 2 checksum errors via parity on /dev/sde. Sector reallocation triggered.',
  },
  {
    id: 'scrub-h-6',
    poolName: 'tank-enterprise',
    date: '2026-10-10',
    durationMinutes: 215,
    durationFormatted: '03h 35m',
    dataScrubbedTb: 4.2,
    rateMbS: 334.1,
    checksumErrors: 5,
    readErrors: 3,
    writeErrors: 0,
    repairedBytes: 20480,
    status: 'DEGRADED',
    degradationRiskPct: 76,
    hardwareNote: 'Duration increased +51% from baseline. 5 checksum errors repaired. Device /dev/sde nearing failure threshold!',
  },
  {
    id: 'scrub-h-7',
    poolName: 'fast-nvme-pool',
    date: '2026-09-01',
    durationMinutes: 14,
    durationFormatted: '00h 14m',
    dataScrubbedTb: 0.82,
    rateMbS: 1024.0,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 2,
    hardwareNote: 'NVMe Mirror scrub completed at bus speed. 0 errors.',
  },
  {
    id: 'scrub-h-8',
    poolName: 'fast-nvme-pool',
    date: '2026-09-15',
    durationMinutes: 15,
    durationFormatted: '00h 15m',
    dataScrubbedTb: 0.85,
    rateMbS: 998.0,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 2,
    hardwareNote: 'NVMe health 100%. Latency < 0.05ms.',
  },
  {
    id: 'scrub-h-9',
    poolName: 'fast-nvme-pool',
    date: '2026-10-01',
    durationMinutes: 16,
    durationFormatted: '00h 16m',
    dataScrubbedTb: 0.89,
    rateMbS: 975.0,
    checksumErrors: 0,
    readErrors: 0,
    writeErrors: 0,
    repairedBytes: 0,
    status: 'COMPLETED',
    degradationRiskPct: 3,
    hardwareNote: 'Optimal NVMe mirror integrity.',
  },
];

// List scrub schedules
app.get('/api/zfs/scrub-schedules', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.json({ status: 'success', schedules: [] });
    return;
  }
  const state = getState();
  if (!state.scrubSchedules) {
    state.scrubSchedules = defaultScrubSchedules;
    saveState(state);
  }
  res.json({ status: 'success', schedules: state.scrubSchedules });
});

// Create or update scrub schedule
app.post('/api/zfs/scrub-schedules', (req: Request, res: Response) => {
  if (useRealHost()) return res.status(409).json({ error: 'DEMO is off. Scrub schedules are not stored on this host.' });
  const state = getState();
  if (!state.scrubSchedules) state.scrubSchedules = defaultScrubSchedules;

  const {
    id,
    poolName,
    frequency = 'weekly',
    cronExpression = '0 2 * * 0',
    dayOfWeek = 0,
    dayOfMonth = 1,
    hour = 2,
    minute = 0,
    enabled = true,
    priority = 'normal',
    maxDurationHours = 6,
    maintenanceWindow = { startTime: '02:00', endTime: '08:00', days: ['Sun'] },
    description = '',
    autoPauseOnHeavyLoad = true,
  } = req.body;

  if (!poolName) {
    return res.status(400).json({ error: 'Emri i pool-it eshte i detyrueshem' });
  }

  const existingIndex = state.scrubSchedules.findIndex((s: any) => s.id === id);
  const scheduleId = id || `sched-${Date.now().toString().slice(-4)}`;

  const scheduleObj = {
    id: scheduleId,
    poolName,
    frequency,
    cronExpression,
    dayOfWeek,
    dayOfMonth,
    hour,
    minute,
    enabled,
    priority,
    maxDurationHours,
    maintenanceWindow,
    nextRun: `2026-10-${Math.floor(Math.random() * 10 + 15).toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`,
    lastRun: '2026-10-11 02:00:00',
    lastStatus: 'SUCCESS',
    description: description || `Scrub i planifikuar per ${poolName}`,
    autoPauseOnHeavyLoad,
  };

  if (existingIndex >= 0) {
    state.scrubSchedules[existingIndex] = { ...state.scrubSchedules[existingIndex], ...scheduleObj };
  } else {
    state.scrubSchedules.push(scheduleObj);
  }

  saveState(state);
  addSystemLog({
    level: 'INFO',
    source: 'storage-director',
    subsystem: 'scrub',
    pool: poolName,
    message: `Scrub schedule ${scheduleId} (${cronExpression}) saved for pool ${poolName}`,
  });

  res.json({ status: 'success', schedule: scheduleObj, schedules: state.scrubSchedules });
});

// Delete scrub schedule
app.delete('/api/zfs/scrub-schedules/:id', (req: Request, res: Response) => {
  if (useRealHost()) return res.status(409).json({ error: 'DEMO is off. Scrub schedules are not stored on this host.' });
  const state = getState();
  if (!state.scrubSchedules) state.scrubSchedules = defaultScrubSchedules;

  const initialCount = state.scrubSchedules.length;
  state.scrubSchedules = state.scrubSchedules.filter((s: any) => s.id !== req.params.id);

  if (state.scrubSchedules.length === initialCount) {
    return res.status(404).json({ error: 'Orari nuk u gjet' });
  }

  saveState(state);
  res.json({ status: 'success', schedules: state.scrubSchedules });
});

// Toggle scrub schedule enabled state
app.post('/api/zfs/scrub-schedules/:id/toggle', (req: Request, res: Response) => {
  if (useRealHost()) return res.status(409).json({ error: 'DEMO is off. Scrub schedules are not stored on this host.' });
  const state = getState();
  if (!state.scrubSchedules) state.scrubSchedules = defaultScrubSchedules;

  const schedule = state.scrubSchedules.find((s: any) => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Orari nuk u gjet' });

  schedule.enabled = !schedule.enabled;
  saveState(state);

  addSystemLog({
    level: 'INFO',
    source: 'storage-director',
    subsystem: 'scrub',
    pool: schedule.poolName,
    message: `Scrub schedule ${schedule.id} turned ${schedule.enabled ? 'ON' : 'OFF'}`,
  });

  res.json({ status: 'success', schedule, schedules: state.scrubSchedules });
});

// Trigger immediate run for a schedule
app.post('/api/zfs/scrub-schedules/:id/run', async (req: Request, res: Response) => {
  if (useRealHost()) return res.status(409).json({ error: 'DEMO is off. Start a scrub from the pool page; schedules are not stored on this host.' });
  const state = getState();
  if (!state.scrubSchedules) state.scrubSchedules = defaultScrubSchedules;

  const schedule = state.scrubSchedules.find((s: any) => s.id === req.params.id);
  if (!schedule) return res.status(404).json({ error: 'Orari nuk u gjet' });

  const pool = state.pools.find((p: any) => p.name === schedule.poolName);
  if (pool) {
    pool.scrub_active = true;
    pool.scrub_status = 'Scrub triggered by scheduler: 0.1% done, ETA: 02:40:00';
    pool.last_scrub = 'Just triggered from scheduler';
  }

  schedule.lastRun = new Date().toISOString().replace('T', ' ').slice(0, 19);
  schedule.lastStatus = 'SUCCESS';
  saveState(state);

  addSystemLog({
    level: 'INFO',
    source: 'zed',
    subsystem: 'scrub',
    pool: schedule.poolName,
    message: `Scheduled scrub initiated immediately for pool ${schedule.poolName}`,
  });

  res.json({ status: 'success', message: `Scrub started for ${schedule.poolName}`, schedule });
});

// Get historical scrub records (with durations & error counts for Recharts trends)
app.get('/api/zfs/scrub-history', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.json({ status: 'success', history: [] });
    return;
  }
  const state = getState();
  if (!state.scrubHistory) {
    state.scrubHistory = defaultScrubHistory;
    saveState(state);
  }
  const pool = req.query.pool as string;
  let history = state.scrubHistory;
  if (pool && pool !== 'all') {
    history = history.filter((h: any) => h.poolName === pool);
  }
  res.json({ status: 'success', history });
});

// Fleet-Wide Real-Time Drive Health Summary Endpoint (SMART indicators)
app.get('/api/zfs/drives/health-summary', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.json({
      totalDrives: 0,
      optimalCount: 0,
      warningCount: 0,
      criticalCount: 0,
      nearThresholdCount: 0,
      drives: [],
      demoMode: false,
    });
    return;
  }
  const driveSummaries = [
    // tank-enterprise SAS HDDs
    {
      dev: '/dev/sdb',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491024',
      type: 'HDD',
      healthScorePct: 100,
      status: 'OPTIMAL',
      temperatureC: 32,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: false,
      tbwWritten: '184.2 TBW',
      plpSupported: false,
    },
    {
      dev: '/dev/sdc',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491025',
      type: 'HDD',
      healthScorePct: 100,
      status: 'OPTIMAL',
      temperatureC: 33,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: false,
      tbwWritten: '183.9 TBW',
      plpSupported: false,
    },
    {
      dev: '/dev/sdd',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491026',
      type: 'HDD',
      healthScorePct: 100,
      status: 'OPTIMAL',
      temperatureC: 31,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: false,
      tbwWritten: '184.1 TBW',
      plpSupported: false,
    },
    {
      dev: '/dev/sde',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491027',
      type: 'HDD',
      healthScorePct: 68,
      status: 'WARNING',
      temperatureC: 44,
      tempStatus: 'warning',
      reallocatedSectors: 18,
      pendingSectors: 4,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: true,
      failureRiskReason: 'Reallocated Sectors count rising (18 reallocated, 4 pending). Elevated scrub duration detected.',
      tbwWritten: '185.7 TBW',
      plpSupported: false,
    },
    {
      dev: '/dev/sdf',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491028',
      type: 'HDD',
      healthScorePct: 100,
      status: 'OPTIMAL',
      temperatureC: 32,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: false,
      tbwWritten: '184.0 TBW',
      plpSupported: false,
    },
    {
      dev: '/dev/sdg',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491029',
      type: 'HDD',
      healthScorePct: 100,
      status: 'OPTIMAL',
      temperatureC: 30,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 12480,
      wearLevelPct: 100,
      nearFailureThreshold: false,
      tbwWritten: '184.4 TBW',
      plpSupported: false,
    },
    // tank-enterprise NVMe vdevs
    {
      dev: '/dev/nvme0n1',
      pool: 'tank-enterprise',
      vdev: 'special',
      model: 'Samsung PM9A3 PLP Enterprise NVMe',
      serial: 'S6G9NE0R810291',
      type: 'NVMe',
      healthScorePct: 98,
      status: 'OPTIMAL',
      temperatureC: 34,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 11200,
      wearLevelPct: 98,
      nearFailureThreshold: false,
      tbwWritten: '410.2 TBW',
      plpSupported: true,
    },
    {
      dev: '/dev/nvme1n1',
      pool: 'tank-enterprise',
      vdev: 'special',
      model: 'Samsung PM9A3 PLP Enterprise NVMe',
      serial: 'S6G9NE0R810292',
      type: 'NVMe',
      healthScorePct: 98,
      status: 'OPTIMAL',
      temperatureC: 35,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 11200,
      wearLevelPct: 98,
      nearFailureThreshold: false,
      tbwWritten: '411.0 TBW',
      plpSupported: true,
    },
    {
      dev: '/dev/nvme2n1',
      pool: 'tank-enterprise',
      vdev: 'log',
      model: 'Samsung PM9A3 PLP Enterprise NVMe',
      serial: 'S6G9NE0R810293',
      type: 'NVMe',
      healthScorePct: 95,
      status: 'OPTIMAL',
      temperatureC: 38,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 11200,
      wearLevelPct: 95,
      nearFailureThreshold: false,
      tbwWritten: '680.4 TBW',
      plpSupported: true,
    },
    {
      dev: '/dev/nvme3n1',
      pool: 'tank-enterprise',
      vdev: 'cache',
      model: 'Micron 7450 Pro Enterprise NVMe',
      serial: 'M7450PRO99281',
      type: 'NVMe',
      healthScorePct: 86,
      status: 'OPTIMAL',
      temperatureC: 41,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 11200,
      wearLevelPct: 86,
      nearFailureThreshold: false,
      tbwWritten: '1,420 TBW',
      plpSupported: true,
    },
    // fast-nvme-pool NVMe vdevs
    {
      dev: '/dev/nvme4n1',
      pool: 'fast-nvme-pool',
      vdev: 'mirror-0',
      model: 'Samsung PM9A3 PLP Enterprise NVMe',
      serial: 'S6G9NE0R810294',
      type: 'NVMe',
      healthScorePct: 99,
      status: 'OPTIMAL',
      temperatureC: 33,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 7400,
      wearLevelPct: 99,
      nearFailureThreshold: false,
      tbwWritten: '290.1 TBW',
      plpSupported: true,
    },
    {
      dev: '/dev/nvme5n1',
      pool: 'fast-nvme-pool',
      vdev: 'mirror-0',
      model: 'Samsung PM9A3 PLP Enterprise NVMe',
      serial: 'S6G9NE0R810295',
      type: 'NVMe',
      healthScorePct: 99,
      status: 'OPTIMAL',
      temperatureC: 34,
      tempStatus: 'nominal',
      reallocatedSectors: 0,
      pendingSectors: 0,
      powerOnHours: 7400,
      wearLevelPct: 99,
      nearFailureThreshold: false,
      tbwWritten: '289.8 TBW',
      plpSupported: true,
    },
  ];

  res.json({
    status: 'success',
    totalDrives: driveSummaries.length,
    optimalCount: driveSummaries.filter((d) => d.status === 'OPTIMAL').length,
    warningCount: driveSummaries.filter((d) => d.status === 'WARNING').length,
    criticalCount: driveSummaries.filter((d) => d.status === 'CRITICAL').length,
    nearThresholdCount: driveSummaries.filter((d) => d.nearFailureThreshold).length,
    drives: driveSummaries,
  });
});

// SMART Historical Trends & Accelerated Degradation Monitor Endpoint
interface SmartHistoricalPoint {
  timestamp: number;
  timeLabel: string;
  reallocatedSectors: number;
  pendingSectors: number;
  healthScorePct: number;
  temperatureC: number;
  wearLevelPct: number;
}

// Stateful simulation toggle for accelerated degradation
const simulatedAccelerationState: Record<string, { isAccelerating: boolean; factor: number }> = {
  '/dev/sde': { isAccelerating: true, factor: 8.5 },
};

app.get('/api/zfs/drives/smart-trends', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.json({
      timestamp: Date.now(),
      drives: [],
      acceleratingDrivesCount: 0,
      totalMonitoredDrives: 0,
      fleetStatus: 'NO_DATA',
      demoMode: false,
    });
    return;
  }
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  const baseTrends = [
    {
      dev: '/dev/sde',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491027',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      type: 'HDD',
      currentHealthScore: simulatedAccelerationState['/dev/sde']?.isAccelerating ? 68 : 95,
      currentReallocated: simulatedAccelerationState['/dev/sde']?.isAccelerating ? 18 : 2,
      currentPending: simulatedAccelerationState['/dev/sde']?.isAccelerating ? 4 : 0,
      currentTemp: simulatedAccelerationState['/dev/sde']?.isAccelerating ? 44 : 34,
      historicalBaselineRate: 0.1, // 0.1 sectors/day expected baseline
      recentDegradationRate: simulatedAccelerationState['/dev/sde']?.isAccelerating ? 4.8 : 0.1,
      accelerationFactor: simulatedAccelerationState['/dev/sde']?.isAccelerating ? (simulatedAccelerationState['/dev/sde'].factor || 8.5) : 1.0,
      isAccelerating: simulatedAccelerationState['/dev/sde']?.isAccelerating ?? true,
      accelerationSeverity: (simulatedAccelerationState['/dev/sde']?.isAccelerating ? 'CRITICAL' : 'NORMAL') as 'CRITICAL' | 'NORMAL',
      accelerationReason: simulatedAccelerationState['/dev/sde']?.isAccelerating
        ? 'Degradation velocity accelerated 8.5x vs historical baseline! Reallocated sectors jumped from 6 to 18 (+200%) in 48h with 4 uncorrectable pending sectors.'
        : 'Drive operating within nominal baseline parameters.',
      history: [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 32, wearLevelPct: 100 },
        { timestamp: now - 5 * dayMs, timeLabel: 'D-5', reallocatedSectors: 1, pendingSectors: 0, healthScorePct: 98, temperatureC: 33, wearLevelPct: 100 },
        { timestamp: now - 3 * dayMs, timeLabel: 'D-3', reallocatedSectors: 3, pendingSectors: 1, healthScorePct: 94, temperatureC: 36, wearLevelPct: 100 },
        { timestamp: now - 2 * dayMs, timeLabel: 'D-2', reallocatedSectors: 6, pendingSectors: 2, healthScorePct: 90, temperatureC: 39, wearLevelPct: 100 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 11, pendingSectors: 3, healthScorePct: 82, temperatureC: 41, wearLevelPct: 100 },
        { timestamp: now - 6 * hourMs, timeLabel: '6h ago', reallocatedSectors: 15, pendingSectors: 4, healthScorePct: 74, temperatureC: 43, wearLevelPct: 100 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 18, pendingSectors: 4, healthScorePct: 68, temperatureC: 44, wearLevelPct: 100 },
      ],
      lastChecked: now,
    },
    {
      dev: '/dev/sdb',
      model: 'Seagate Exos X16 Enterprise 7.2K',
      serial: 'WNA1K28491024',
      pool: 'tank-enterprise',
      vdev: 'raidz2-0',
      type: 'HDD',
      currentHealthScore: 100,
      currentReallocated: 0,
      currentPending: 0,
      currentTemp: 32,
      historicalBaselineRate: 0.0,
      recentDegradationRate: 0.0,
      accelerationFactor: 1.0,
      isAccelerating: false,
      accelerationSeverity: 'NORMAL',
      accelerationReason: 'Stable 0 reallocated sectors across 12,480 power-on hours.',
      history: [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 31, wearLevelPct: 100 },
        { timestamp: now - 3 * dayMs, timeLabel: 'D-3', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 32, wearLevelPct: 100 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 32, wearLevelPct: 100 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 100, temperatureC: 32, wearLevelPct: 100 },
      ],
      lastChecked: now,
    },
    {
      dev: '/dev/nvme3n1',
      model: 'Micron 7450 Pro Enterprise NVMe',
      serial: 'M7450PRO99281',
      pool: 'tank-enterprise',
      vdev: 'cache',
      type: 'NVMe',
      currentHealthScore: 86,
      currentReallocated: 0,
      currentPending: 0,
      currentTemp: 41,
      historicalBaselineRate: 0.03, // steady 0.03% wear / day
      recentDegradationRate: 0.03,
      accelerationFactor: 1.0,
      isAccelerating: false,
      accelerationSeverity: 'NORMAL',
      accelerationReason: 'Nominal linear SSD endurance consumption (1,420 TBW written).',
      history: [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 87, temperatureC: 40, wearLevelPct: 87 },
        { timestamp: now - 3 * dayMs, timeLabel: 'D-3', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 86, temperatureC: 41, wearLevelPct: 86 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 86, temperatureC: 41, wearLevelPct: 86 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 86, temperatureC: 41, wearLevelPct: 86 },
      ],
      lastChecked: now,
    },
    {
      dev: '/dev/nvme0n1',
      model: 'Samsung PM9A3 PLP Enterprise NVMe',
      serial: 'S6G9NE0R810291',
      pool: 'tank-enterprise',
      vdev: 'special',
      type: 'NVMe',
      currentHealthScore: 98,
      currentReallocated: 0,
      currentPending: 0,
      currentTemp: 34,
      historicalBaselineRate: 0.01,
      recentDegradationRate: 0.01,
      accelerationFactor: 1.0,
      isAccelerating: false,
      accelerationSeverity: 'NORMAL',
      accelerationReason: 'Optimal NVMe condition with hardware Power Loss Protection active.',
      history: [
        { timestamp: now - 7 * dayMs, timeLabel: 'D-7', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 98, temperatureC: 34, wearLevelPct: 98 },
        { timestamp: now - 24 * hourMs, timeLabel: '24h ago', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 98, temperatureC: 34, wearLevelPct: 98 },
        { timestamp: now, timeLabel: 'Current', reallocatedSectors: 0, pendingSectors: 0, healthScorePct: 98, temperatureC: 34, wearLevelPct: 98 },
      ],
      lastChecked: now,
    },
  ];

  const acceleratingDrives = baseTrends.filter((d) => d.isAccelerating);

  res.json({
    timestamp: now,
    drives: baseTrends,
    acceleratingDrivesCount: acceleratingDrives.length,
    totalMonitoredDrives: baseTrends.length,
    fleetStatus: acceleratingDrives.length > 0 ? 'WARNING_ACCELERATION' : 'HEALTHY',
  });
});

// Toggle or test acceleration event
app.post('/api/zfs/drives/simulate-acceleration', (req: Request, res: Response) => {
  if (useRealHost()) {
    res.status(409).json({ error: 'DEMO is off. Simulated SMART acceleration is not applied on this host.' });
    return;
  }
  const { dev = '/dev/sde', accelerate = true } = req.body;
  simulatedAccelerationState[dev] = {
    isAccelerating: Boolean(accelerate),
    factor: accelerate ? 8.5 : 1.0,
  };

  const logMsg = accelerate
    ? `smartd: [CRITICAL ALERT] Rapid degradation acceleration detected on ${dev}. Reallocated sector velocity exceeds baseline 8.5x.`
    : `smartd: Degradation rate on ${dev} normalized.`;

  if (Array.isArray(systemLogs)) {
    systemLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      epochMs: Date.now(),
      level: accelerate ? 'ERROR' : 'INFO',
      source: 'smartd',
      subsystem: 'smart',
      pool: 'tank-enterprise',
      message: logMsg,
      raw: `Oct 12 14:35:00 storage-node01 smartd[890]: ${logMsg}`,
    });
  }

  res.json({
    status: 'success',
    message: `Gjendja e simulimit te pershpejtuar per ${dev} u vendos ne: ${accelerate ? 'AKTIVE (PERSHPEJTIM)' : 'NORMALE'}`,
    drive: dev,
    isAccelerating: Boolean(accelerate),
  });
});


// Add vdev to existing pool (SLOG, L2ARC, Special VDEV, Spare)
app.post('/api/zfs/pools/:name/vdev', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = poolToken(String(req.params.name || ''));
    const type = String(req.body?.type || '');
    const disks = Array.isArray(req.body?.disks) ? req.body.disks.map(String) : [];
    const keyword = type === 'slog' ? 'log' : type;
    if (!name || !['log', 'cache', 'spare', 'special'].includes(keyword) || disks.some((disk: string) => !devToken(disk))) {
      return res.status(400).json({ error: 'Invalid pool, vdev type, or disk.' });
    }
    const mirror = (keyword === 'log' || keyword === 'special') && disks.length > 1 ? 'mirror ' : '';
    const result = await runShell(`zpool add ${name} ${keyword} ${mirror}${disks.join(' ')}`, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zpool add failed') });
    return res.json({ status: 'success', message: `${keyword} vdev added to ${name}.` });
  }
  const state = getState();
  const pool = state.pools.find((p: any) => p.name === req.params.name);
  if (!pool) return res.status(404).json({ error: 'Pool-i nuk u gjet' });

  const { type, disks, desc } = req.body;
  if (!type || !disks || !disks.length) {
    return res.status(400).json({ error: 'Lloji i VDEV dhe disqet jane te detyrueshme' });
  }

  const vdevName = `${type}-${Date.now().toString().slice(-4)}`;
  pool.vdevs.push({
    type,
    name: vdevName,
    status: 'ONLINE',
    disks,
    desc: desc || `Added ${type.toUpperCase()} Device`,
    capacity: '1.92T',
  });

  saveState(state);
  res.json({ status: 'success', message: `VDEV ${type} u shtua me sukses ne ${pool.name}!`, pool });
});

// Destroy pool
app.delete('/api/zfs/pools/:name', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = poolToken(String(req.params.name || ''));
    if (!name) return res.status(400).json({ error: 'Invalid pool name.' });
    const result = await runShell(`zpool destroy ${name}`, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zpool destroy failed') });
    return res.json({ status: 'success', message: `Pool '${name}' was destroyed.` });
  }
  const state = getState();
  const poolIndex = state.pools.findIndex((p: any) => p.name === req.params.name);
  if (poolIndex === -1) return res.status(404).json({ error: 'Pool-i nuk u gjet' });

  const poolName = state.pools[poolIndex].name;
  state.pools.splice(poolIndex, 1);
  state.datasets = state.datasets.filter((d: any) => !d.name.startsWith(poolName));
  state.snapshots = state.snapshots.filter((s: any) => !s.name.startsWith(poolName));

  saveState(state);
  res.json({ status: 'success', message: `Pool '${poolName}' u fshi me sukses.` });
});

// Helper: build structured export package for a pool
function buildPoolExportPackage(pool: any, state: any) {
  const poolDatasets = (state.datasets || []).filter(
    (d: any) => d.name === pool.name || d.name.startsWith(pool.name + '/')
  );
  const poolSnapshots = (state.snapshots || []).filter(
    (s: any) => s.name.startsWith(pool.name + '/') || s.name.startsWith(pool.name + '@')
  );
  const scrubSchedules = (state.scrubSchedules || defaultScrubSchedules || []).filter(
    (s: any) => s.poolName === pool.name
  );

  const ashift = pool.ashift || 12;
  const ashiftArg = `-o ashift=${ashift}`;
  const propertiesArgs = '-O compression=zstd -O atime=off -O xattr=sa';

  const vdevTokens: string[] = [];
  for (const v of pool.vdevs || []) {
    const vType = (v.type || '').toLowerCase();
    const disks = Array.isArray(v.disks) ? v.disks.join(' ') : '';
    if (vType === 'raidz' || vType === 'raidz1') {
      vdevTokens.push(`raidz ${disks}`);
    } else if (vType === 'raidz2') {
      vdevTokens.push(`raidz2 ${disks}`);
    } else if (vType === 'raidz3') {
      vdevTokens.push(`raidz3 ${disks}`);
    } else if (vType === 'draid' || vType === 'draid1' || vType === 'draid2' || vType === 'draid3') {
      vdevTokens.push(`${vType} ${disks}`);
    } else if (vType === 'mirror' || vType === 'mirror2' || vType === 'mirror3') {
      vdevTokens.push(`mirror ${disks}`);
    } else if (vType === 'stripe') {
      vdevTokens.push(disks);
    } else if (vType === 'log' || vType === 'slog') {
      const isMirror = (v.disks || []).length > 1;
      vdevTokens.push(`log ${isMirror ? 'mirror ' : ''}${disks}`);
    } else if (vType === 'cache' || vType === 'l2arc') {
      vdevTokens.push(`cache ${disks}`);
    } else if (vType === 'special' || vType === 'special-mirror') {
      const isMirror = (v.disks || []).length > 1;
      vdevTokens.push(`special ${isMirror ? 'mirror ' : ''}${disks}`);
    } else if (vType === 'spare') {
      vdevTokens.push(`spare ${disks}`);
    } else {
      vdevTokens.push(disks);
    }
  }

  const zpoolCreateCmd = `zpool create -f ${ashiftArg} ${propertiesArgs} ${pool.name} ${vdevTokens.join(' ')}`;

  const zfsDatasetCmds: string[] = [];
  for (const ds of poolDatasets) {
    if (ds.name === pool.name) continue;
    const props: string[] = [];
    if (ds.compression) props.push(`-o compression=${ds.compression}`);
    if (ds.recordsize) props.push(`-o recordsize=${ds.recordsize}`);
    if (ds.atime) props.push(`-o atime=${ds.atime}`);
    if (ds.dedup && ds.dedup !== 'off') props.push(`-o dedup=${ds.dedup}`);
    if (ds.quota && ds.quota !== 'none') props.push(`-o quota=${ds.quota}`);
    if (ds.readonly && ds.readonly !== 'off') props.push(`-o readonly=${ds.readonly}`);

    if (ds.type === 'volume') {
      zfsDatasetCmds.push(`zfs create -V ${ds.volsize || '50G'} ${props.join(' ')} ${ds.name}`);
    } else {
      zfsDatasetCmds.push(`zfs create ${props.join(' ')} ${ds.name}`);
    }
  }

  return {
    formatVersion: 'openzfs-v2.2-export/1.0',
    exportedAt: new Date().toISOString(),
    systemMetadata: {
      hostname: 'storage-node01.enterprise.lan',
      os: 'Debian GNU/Linux 12 (bookworm)',
      kernel: 'Linux 6.8.12-zfs-enterprise-x86_64',
      zfsVersion: 'zfs-2.2.4-1 / zfs-kmod-2.2.4-1',
      generator: 'OpenZFS Enterprise Manager Disaster Recovery Engine v2.4',
    },
    pool: {
      name: pool.name,
      guid: pool.guid || `${Date.now()}`,
      health: pool.health || 'ONLINE',
      size: pool.size || '8.0T',
      allocated: pool.allocated || '0K',
      free: pool.free || pool.size || '8.0T',
      frag: pool.frag || '0%',
      dedup: pool.dedup || '1.00x',
      ashift,
      status: pool.status || 'ONLINE',
      properties: {
        autoexpand: 'on',
        autoreplace: 'off',
        failmode: 'continue',
        dedup: pool.dedup === '1.00x' ? 'off' : 'on',
        delegation: 'on',
        listsnapshots: 'on',
        multihost: 'off',
        ashift,
      },
      vdevs: pool.vdevs || [],
    },
    datasets: poolDatasets,
    snapshots: poolSnapshots,
    scrubSchedules,
    reconstructedCommands: {
      zpoolCreate: zpoolCreateCmd,
      zfsDatasets: zfsDatasetCmds,
      importInstruction: `# Disaster Recovery Restoration Sequence:
# 1. Inspect underlying block devices: lsblk -f
# 2. Reconstruct root storage pool topology:
${zpoolCreateCmd}
# 3. Recreate hierarchical child datasets:
${zfsDatasetCmds.length ? zfsDatasetCmds.join('\n') : '# (No child datasets configured)'}
# 4. Verify pool health & dataset mounts:
zpool status -v ${pool.name}
zfs list -r ${pool.name}`,
    },
  };
}

// Export single pool configuration & metadata as JSON
app.get('/api/zfs/pools/:name/export', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const live = await readLiveInventory();
    const pool = live.pools.find((item) => item.name.toLowerCase() === String(req.params.name).toLowerCase());
    if (!pool) return res.status(404).json({ error: `Pool '${req.params.name}' is not imported.` });
    const exportData = buildPoolExportPackage(pool, { datasets: live.datasets, snapshots: live.snapshots, scrubSchedules: [] });
    exportData.systemMetadata.hostname = os.hostname();
    exportData.systemMetadata.os = `${os.type()} ${os.release()}`;
    exportData.systemMetadata.kernel = os.release();
    res.setHeader('Content-Type', 'application/json');
    return res.json(exportData);
  }
  const state = getState();
  const pool = state.pools.find((p: any) => p.name.toLowerCase() === req.params.name.toLowerCase());
  if (!pool) return res.status(404).json({ error: `Pool-i '${req.params.name}' nuk u gjet.` });

  const exportData = buildPoolExportPackage(pool, state);
  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

// Export all pools bundled configuration as JSON
app.get('/api/zfs/pools/export-all', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const live = await readLiveInventory();
    const poolsExport = live.pools.map((pool) => buildPoolExportPackage(pool, { datasets: live.datasets, snapshots: live.snapshots, scrubSchedules: [] }));
    return res.json({
      formatVersion: 'openzfs-v2.2-export/1.0',
      exportedAt: new Date().toISOString(),
      systemMetadata: { hostname: os.hostname(), os: `${os.type()} ${os.release()}`, kernel: os.release(), zfsVersion: 'host', generator: 'OpenZFS Enterprise Director' },
      pools: poolsExport,
    });
  }
  const state = getState();
  const poolsExport = state.pools.map((p: any) => buildPoolExportPackage(p, state));

  const multiPackage = {
    formatVersion: 'openzfs-v2.2-export/1.0',
    exportedAt: new Date().toISOString(),
    systemMetadata: {
      hostname: 'storage-node01.enterprise.lan',
      os: 'Debian GNU/Linux 12 (bookworm)',
      kernel: 'Linux 6.8.12-zfs-enterprise-x86_64',
      zfsVersion: 'zfs-2.2.4-1 / zfs-kmod-2.2.4-1',
      generator: 'OpenZFS Enterprise Manager Disaster Recovery Engine v2.4',
    },
    pools: poolsExport,
  };

  res.setHeader('Content-Type', 'application/json');
  res.json(multiPackage);
});

// Import pool configuration (Disaster Recovery or Clone)
app.post('/api/zfs/pools/import', (req: Request, res: Response) => {
  if (useRealHost()) {
    return res.status(409).json({ error: 'DEMO is off. JSON import builds a simulated pool and is not applied to this host.' });
  }
  const state = getState();
  const {
    config,
    mode = 'disaster_recovery',
    cloneAsName,
    mountpointPrefix,
    dryRun = false,
    overwrite = false,
    selectedDisks = [],
  } = req.body;

  if (!config) {
    return res.status(400).json({ error: 'Konfigurimi JSON eshte i detyrueshem' });
  }

  // Support single pool package or multi-package or raw pool object
  let poolConfig = config.pool ? config : config.pools ? config.pools[0] : null;
  if (!poolConfig && config.name && config.vdevs) {
    poolConfig = { pool: config, datasets: config.datasets || [], snapshots: config.snapshots || [] };
  }

  if (!poolConfig || !poolConfig.pool || !poolConfig.pool.name) {
    return res.status(400).json({
      error: 'Struktura JSON eshte e pavlefshme: mungon nyja "pool" ose "name". Sigurohuni qe skedari eshte eksport i vlefshem ZFS.',
    });
  }

  const origPoolName = poolConfig.pool.name;
  const isClone = mode === 'clone';
  const targetName = (isClone ? cloneAsName || `${origPoolName}-clone` : origPoolName).trim();

  if (!targetName) {
    return res.status(400).json({ error: 'Emri i pool-it te destinacionit eshte i detyrueshem' });
  }

  // Validate naming characters
  if (!/^[a-zA-Z0-9_\-.:]+$/.test(targetName)) {
    return res.status(400).json({
      error: 'Emri i pool-it permban karaktere te pavlefshme. Perdorni vetem shkronja, numra, viza dhe nenviza.',
    });
  }

  const existingIndex = state.pools.findIndex(
    (p: any) => p.name.toLowerCase() === targetName.toLowerCase()
  );
  const warnings: string[] = [];

  if (existingIndex !== -1) {
    if (isClone) {
      return res.status(400).json({
        error: `Pool-i me emrin '${targetName}' ekziston tashme ne kete sistem! Zgjidhni nje emer unik per klonin.`,
      });
    } else if (!overwrite && !dryRun) {
      return res.status(409).json({
        conflict: true,
        error: `Pool-i '${targetName}' ekziston tashme ne sistem. Zgjidhni opsionin 'Rishkruaj / Zevendeso (Overwrite)' per Disaster Recovery ose perdorni Modalitetin e Klonimit.`,
      });
    } else {
      warnings.push(`Pool-i ekzistues '${targetName}' do te rishkruhet nga paketa e rikuperimit.`);
    }
  }

  const rawVdevs = poolConfig.pool.vdevs || [];
  let diskCount = 0;
  rawVdevs.forEach((v: any) => {
    diskCount += (v.disks || []).length;
  });

  // Prepare cloned/imported vdevs
  const targetVdevs = JSON.parse(JSON.stringify(rawVdevs));
  if (isClone) {
    if (selectedDisks && selectedDisks.length > 0 && targetVdevs.length > 0) {
      targetVdevs[0].disks = selectedDisks;
    } else {
      targetVdevs.forEach((v: any, vIdx: number) => {
        v.disks = (v.disks || []).map((d: string) => {
          if (d.includes('sd') || d.includes('nvme')) {
            return `${d}-clone${vIdx + 1}`;
          }
          return `${d}-clone`;
        });
      });
    }
  }

  const rawDatasets = poolConfig.datasets || [];
  const targetDatasets = rawDatasets.map((ds: any) => {
    let newDsName = ds.name;
    if (isClone) {
      newDsName = ds.name.replace(new RegExp(`^${origPoolName}`), targetName);
    }
    let newMount = ds.mountpoint;
    if (isClone && ds.mountpoint) {
      const prefix = mountpointPrefix ? mountpointPrefix.replace(/\/$/, '') : `/${targetName}`;
      newMount = ds.mountpoint.replace(new RegExp(`^/${origPoolName}`), prefix);
    }
    return {
      ...ds,
      name: newDsName,
      mountpoint: newMount,
    };
  });

  const ashift = poolConfig.pool.ashift || 12;
  const commandPreview = `zpool create -f -o ashift=${ashift} ${targetName} ${targetVdevs
    .map((v: any) => `${v.type} ${(v.disks || []).join(' ')}`)
    .join(' ')}`;

  if (dryRun) {
    return res.json({
      valid: true,
      status: warnings.length ? 'warning' : 'success',
      message: `Konfigurimi i ${isClone ? 'klonimit' : 'rikuperimit'} eshte i vlefshem per pool '${targetName}'.`,
      poolName: targetName,
      summary: {
        originalName: origPoolName,
        targetName,
        mode,
        vdevCount: targetVdevs.length,
        datasetCount: targetDatasets.length,
        diskCount,
        estimatedSize: poolConfig.pool.size || '8.0T',
        commandPreview,
      },
      warnings,
    });
  }

  // Provision pool into state
  const newPool = {
    name: targetName,
    guid: Date.now().toString(),
    health: 'ONLINE',
    size: poolConfig.pool.size || '8.0T',
    allocated: isClone ? '128K' : poolConfig.pool.allocated || '0K',
    free: poolConfig.pool.free || poolConfig.pool.size || '8.0T',
    frag: isClone ? '0%' : poolConfig.pool.frag || '0%',
    dedup: poolConfig.pool.dedup || '1.00x',
    ashift,
    status: isClone
      ? `Cloned ZFS storage pool provisioned from backup template '${origPoolName}'.`
      : 'Disaster recovery restored pool. Verified checksum topology.',
    scrub_status: 'Never scrubbed',
    scrub_active: false,
    last_scrub: 'Never',
    vdevs: targetVdevs,
  };

  if (existingIndex !== -1 && overwrite) {
    state.pools[existingIndex] = newPool;
    state.datasets = state.datasets.filter((d: any) => !d.name.startsWith(targetName));
    state.snapshots = state.snapshots.filter((s: any) => !s.name.startsWith(targetName));
  } else {
    state.pools.push(newPool);
  }

  // Ensure root pool dataset exists
  const hasBase = targetDatasets.some((d: any) => d.name === targetName);
  if (!hasBase) {
    targetDatasets.unshift({
      name: targetName,
      type: 'filesystem',
      mountpoint: mountpointPrefix ? mountpointPrefix.replace(/\/$/, '') : `/${targetName}`,
      used: '128K',
      avail: newPool.free,
      refer: '96K',
      compression: 'zstd',
      compressratio: '1.00x',
      recordsize: '128K',
      atime: 'off',
      dedup: 'off',
      quota: 'none',
      encryption: 'off',
      readonly: 'off',
    });
  }

  for (const ds of targetDatasets) {
    const existingDsIdx = state.datasets.findIndex((d: any) => d.name === ds.name);
    if (existingDsIdx !== -1) {
      state.datasets[existingDsIdx] = ds;
    } else {
      state.datasets.push(ds);
    }
  }

  // Add system audit log
  initialSeedLogs.unshift({
    id: `log-${Date.now()}`,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    epochMs: Date.now(),
    level: 'INFO',
    source: 'zfs-kernel',
    subsystem: 'spa',
    pool: targetName,
    message: isClone
      ? `CLONE: Pool '${targetName}' successfully cloned from JSON backup template of '${origPoolName}' with ${targetDatasets.length} datasets.`
      : `DISASTER RECOVERY: Pool '${targetName}' successfully restored from JSON configuration package.`,
    raw: `kernel: [ZFS:spa] SPA imported pool=${targetName} vdevs=${targetVdevs.length} ashift=${ashift}`,
  });

  saveState(state);

  return res.json({
    valid: true,
    status: 'success',
    message: isClone
      ? `Pool '${targetName}' u klonua me sukses nga skedari JSON me ${targetDatasets.length} datasets!`
      : `Pool '${targetName}' u rikuperua me sukses nga konfigurimi JSON (Disaster Recovery)!`,
    poolName: targetName,
    pool: newPool,
    datasetsCreated: targetDatasets.length,
    summary: {
      originalName: origPoolName,
      targetName,
      mode,
      vdevCount: targetVdevs.length,
      datasetCount: targetDatasets.length,
      diskCount,
      estimatedSize: newPool.size,
      commandPreview,
    },
  });
});

// 3. Datasets & ZVOLs
app.get('/api/zfs/datasets', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const live = await readLiveInventory();
    res.json({ datasets: live.datasets });
    return;
  }
  res.json({ datasets: getState().datasets });
});

app.post('/api/zfs/datasets', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = String(req.body?.name || '');
    const type = req.body?.type === 'volume' ? 'volume' : 'filesystem';
    if (!validDatasetName(name)) return res.status(400).json({ error: 'Invalid dataset name.' });
    const compression = String(req.body?.compression || 'lz4');
    const recordsize = String(req.body?.recordsize || '128K');
    const atime = String(req.body?.atime || 'off');
    const quota = String(req.body?.quota || 'none');
    const volsize = String(req.body?.volsize || '50G');
    if (!/^(off|lz4|zstd|zstd-[1-9]|gzip|gzip-[1-9])$/.test(compression)) return res.status(400).json({ error: 'Unsupported compression.' });
    if (!/^(512|1K|2K|4K|8K|16K|32K|64K|128K|256K|512K|1M)$/.test(recordsize)) return res.status(400).json({ error: 'Unsupported recordsize.' });
    if (!/^(on|off)$/.test(atime)) return res.status(400).json({ error: 'atime must be on or off.' });
    const quotaArg = quota && quota !== 'none' ? ` -o quota=${quota}` : '';
    if (quotaArg && !/^\d+(\.\d+)?[KMGTPk]$/.test(quota)) return res.status(400).json({ error: 'Invalid quota.' });
    const cmd = type === 'volume'
      ? `zfs create -V ${volsize} ${name}`
      : `zfs create -o compression=${compression} -o recordsize=${recordsize} -o atime=${atime}${quotaArg} ${name}`;
    if (type === 'volume' && !/^\d+(\.\d+)?[KMGTPk]$/.test(volsize)) return res.status(400).json({ error: 'Invalid volume size.' });
    const result = await runShell(cmd, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zfs create failed') });
    return res.json({ status: 'success', message: `Dataset '${name}' was created.` });
  }
  const state = getState();
  const {
    name,
    type = 'filesystem',
    mountpoint,
    compression = 'lz4',
    recordsize = '128K',
    quota = 'none',
    atime = 'off',
    dedup = 'off',
    encryption = 'off',
    volsize = '50G',
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Emri i dataset-it eshte i detyrueshem' });
  }

  const existing = state.datasets.find((d: any) => d.name === name);
  if (existing) {
    return res.status(400).json({ error: `Dataset-i '${name}' ekziston tashme!` });
  }

  const newDs = {
    name,
    type,
    mountpoint: mountpoint || (type === 'volume' ? `/dev/zvol/${name}` : `/${name}`),
    used: '128K',
    avail: '11.8T',
    refer: '128K',
    compression,
    compressratio: '1.00x',
    recordsize: type === 'volume' ? recordsize || '8K' : recordsize,
    atime,
    dedup,
    quota,
    encryption,
    readonly: 'off',
    ...(type === 'volume' ? { volsize, volblocksize: recordsize || '8K' } : {}),
  };

  state.datasets.push(newDs);
  saveState(state);
  res.json({ status: 'success', message: `Dataset '${name}' u krijua me sukses!`, dataset: newDs });
});

// Modify dataset properties
app.patch('/api/zfs/datasets', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = String(req.body?.name || '');
    const properties = req.body?.properties || {};
    if (!validDatasetName(name)) return res.status(400).json({ error: 'Invalid dataset name.' });
    const allowed = ['compression', 'recordsize', 'quota', 'atime', 'dedup', 'readonly', 'mountpoint'];
    for (const key of allowed) {
      if (properties[key] === undefined || properties[key] === '') continue;
      const value = String(properties[key]);
      if (!/^[A-Za-z0-9_./:=+-]{1,128}$/.test(value)) return res.status(400).json({ error: `Invalid value for ${key}.` });
      const result = await runShell(`zfs set ${key}=${value} ${name}`);
      if (result.code !== 0) return res.status(400).json({ error: shellError(result, `zfs set ${key} failed`) });
    }
    return res.json({ status: 'success', message: `Properties for '${name}' were updated.` });
  }
  const state = getState();
  const { name, properties } = req.body;

  if (!name) return res.status(400).json({ error: 'Emri i dataset-it mungon' });
  const ds = state.datasets.find((d: any) => d.name === name);
  if (!ds) return res.status(404).json({ error: 'Dataset nuk u gjet' });

  // Update allowed properties
  if (properties.compression) ds.compression = properties.compression;
  if (properties.recordsize) ds.recordsize = properties.recordsize;
  if (properties.quota) ds.quota = properties.quota;
  if (properties.atime) ds.atime = properties.atime;
  if (properties.dedup) ds.dedup = properties.dedup;
  if (properties.readonly) ds.readonly = properties.readonly;
  if (properties.mountpoint) ds.mountpoint = properties.mountpoint;

  saveState(state);
  res.json({ status: 'success', message: `Vetite per '${name}' u perditesuan me sukses!`, dataset: ds });
});

app.delete('/api/zfs/datasets', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const name = String(req.body?.name || '');
    if (!validDatasetName(name)) return res.status(400).json({ error: 'Invalid dataset name.' });
    const result = await runShell(`zfs destroy ${name}`, 30000);
    if (result.code !== 0) return res.status(400).json({ error: shellError(result, 'zfs destroy failed') });
    return res.json({ status: 'success', message: `Dataset '${name}' was destroyed.` });
  }
  const state = getState();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Emri i dataset mungon' });

  const idx = state.datasets.findIndex((d: any) => d.name === name);
  if (idx === -1) return res.status(404).json({ error: 'Dataset nuk u gjet' });

  state.datasets.splice(idx, 1);
  state.snapshots = state.snapshots.filter((s: any) => !s.name.startsWith(name));

  saveState(state);
  res.json({ status: 'success', message: `Dataset '${name}' u fshi me sukses.` });
});

// 4. Snapshots
app.get('/api/zfs/snapshots', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const live = await readLiveInventory();
    res.json({ snapshots: live.snapshots });
    return;
  }
  res.json({ snapshots: getState().snapshots });
});

function validDatasetName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_./-]{0,200}$/.test(name) && !name.includes('..') && !name.includes('@');
}

function validSnapToken(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(name);
}

function validSnapshotName(name: string): boolean {
  const at = String(name).lastIndexOf('@');
  if (at <= 0) return false;
  return validDatasetName(name.slice(0, at)) && validSnapToken(name.slice(at + 1));
}

function poolToken(name: string): string | null {
  return /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name) ? name : null;
}

function devToken(name: string): string | null {
  return /^\/dev\/[A-Za-z0-9._-]+$/.test(name) ? name : null;
}

function shellError(result: { stderr: string; stdout: string }, fallback: string): string {
  return (result.stderr || result.stdout || fallback).trim();
}

function readLiveArc() {
  const arc = {
    size: 0, c_max: 0, c_min: 0, hits: 0, misses: 0, hit_ratio: 0,
    mru_size: 0, mfu_size: 0, data_size: 0, metadata_size: 0,
    l2_size: 0, l2_hits: 0, l2_misses: 0, l2_hit_ratio: 0,
    tunables: { zfs_arc_max: 0, zfs_arc_min: 0, l2arc_write_max: 0, l2arc_noprefetch: 0, zfs_arc_sys_free: 0 },
  };
  let raw = '';
  if (managingRemote()) {
    const node = activeSshNode();
    if (!node) return arc;
    try {
      raw = execFileSync('ssh', sshArgv(node, 'cat /proc/spl/kstat/zfs/arcstats'), {
        encoding: 'utf8',
        timeout: 15000,
        env: sshEnv(node),
      });
    } catch (err: any) {
      raw = String(err?.stdout || '');
    }
  } else if (fs.existsSync('/proc/spl/kstat/zfs/arcstats')) {
    raw = fs.readFileSync('/proc/spl/kstat/zfs/arcstats', 'utf-8');
  }
  if (!raw) return arc;
  try {
    const parsed: Record<string, number> = {};
    for (const line of raw.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3 && parts[0] !== 'name' && !Number.isNaN(Number(parts[2]))) parsed[parts[0]] = Number(parts[2]);
    }
    const hits = parsed.hits || 0;
    const misses = parsed.misses || 0;
    const total = hits + misses;
    const l2Hits = parsed.l2_hits || 0;
    const l2Misses = parsed.l2_misses || 0;
    const l2Total = l2Hits + l2Misses;
    arc.size = parsed.size || 0;
    arc.c_max = parsed.c_max || 0;
    arc.c_min = parsed.c_min || 0;
    arc.hits = hits;
    arc.misses = misses;
    arc.hit_ratio = total > 0 ? parseFloat(((hits / total) * 100).toFixed(2)) : 0;
    arc.mru_size = parsed.mru_size || 0;
    arc.mfu_size = parsed.mfu_size || 0;
    arc.data_size = parsed.data_size || 0;
    arc.metadata_size = parsed.metadata_size || 0;
    arc.l2_size = parsed.l2_size || 0;
    arc.l2_hits = l2Hits;
    arc.l2_misses = l2Misses;
    arc.l2_hit_ratio = l2Total > 0 ? parseFloat(((l2Hits / l2Total) * 100).toFixed(2)) : 0;
    arc.tunables.zfs_arc_max = parsed.c_max || 0;
    arc.tunables.zfs_arc_min = parsed.c_min || 0;
  } catch { /* kstat unreadable */ }
  return arc;
}

app.post('/api/zfs/snapshots', async (req: Request, res: Response) => {
  const state = getState();
  const { dataset, snapName } = req.body;

  if (!dataset || !snapName) {
    return res.status(400).json({ error: 'Dataset dhe snapName jane te detyrueshme' });
  }
  if (!validDatasetName(String(dataset)) || !validSnapToken(String(snapName))) {
    return res.status(400).json({ error: 'Invalid dataset or snapshot name.' });
  }

  const fullName = `${dataset}@${snapName}`;

  if (useRealHost()) {
    const ds = await runShell(`zfs list -H -o name ${dataset}`);
    if (ds.code !== 0 || ds.stdout.trim() !== dataset) {
      return res.status(400).json({ error: `Dataset '${dataset}' is not on this host.` });
    }
    const exists = await runShell(`zfs list -H -t snapshot -o name ${fullName}`);
    if (exists.code === 0 && exists.stdout.trim() === fullName) {
      return res.status(400).json({ error: `Snapshot '${fullName}' already exists.` });
    }
    const created = await runShell(`zfs snapshot ${fullName}`);
    if (created.code !== 0) {
      return res.status(400).json({ error: (created.stderr || created.stdout || 'zfs snapshot failed').trim() });
    }
    const listed = await runShell(`zfs list -H -t snapshot -o name,used,refer,creation ${fullName}`);
    const [name, used, refer, creation] = listed.stdout.trim().split('\t');
    return res.json({
      status: 'success',
      message: `Snapshot '${fullName}' was created.`,
      snapshot: { name: name || fullName, used: used || '0', refer: refer || '0', creation: creation || '' },
    });
  }

  const existing = state.snapshots.find((s: any) => s.name === fullName);
  if (existing) {
    return res.status(400).json({ error: `Snapshot '${fullName}' ekziston tashme!` });
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const newSnap = {
    name: fullName,
    used: '64K',
    refer: '840G',
    creation: now,
  };

  state.snapshots.unshift(newSnap);
  saveState(state);
  res.json({ status: 'success', message: `Snapshot '${fullName}' u krijua!`, snapshot: newSnap });
});

app.post('/api/zfs/snapshots/rollback', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (useRealHost()) {
    if (!validSnapshotName(String(name || ''))) {
      return res.status(400).json({ error: 'Invalid snapshot name.' });
    }
    const exists = await runShell(`zfs list -H -t snapshot -o name ${name}`);
    if (exists.code !== 0 || exists.stdout.trim() !== name) {
      return res.status(404).json({ error: `Snapshot '${name}' was not found.` });
    }
    const rolled = await runShell(`zfs rollback ${name}`);
    if (rolled.code !== 0) {
      return res.status(400).json({ error: (rolled.stderr || rolled.stdout || 'zfs rollback failed').trim() });
    }
    return res.json({ status: 'success', message: `Rolled back to '${name}'.` });
  }
  const state = getState();
  const snap = state.snapshots.find((s: any) => s.name === name);
  if (!snap) return res.status(404).json({ error: 'Snapshot nuk u gjet' });

  res.json({ status: 'success', message: `Dataset u kthye mbrapsht me sukses ne gjendjen e '${name}'!` });
});

app.delete('/api/zfs/snapshots', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (useRealHost()) {
    if (!validSnapshotName(String(name || ''))) {
      return res.status(400).json({ error: 'Invalid snapshot name.' });
    }
    const destroyed = await runShell(`zfs destroy ${name}`);
    if (destroyed.code !== 0) {
      return res.status(400).json({ error: (destroyed.stderr || destroyed.stdout || 'zfs destroy failed').trim() });
    }
    return res.json({ status: 'success', message: `Snapshot '${name}' was destroyed.` });
  }
  const state = getState();
  const idx = state.snapshots.findIndex((s: any) => s.name === name);
  if (idx === -1) return res.status(404).json({ error: 'Snapshot nuk u gjet' });

  state.snapshots.splice(idx, 1);
  saveState(state);
  res.json({ status: 'success', message: `Snapshot '${name}' u fshi.` });
});

// ========================================================
// ZFS Z-Send Stream Migration Engine
// ========================================================
interface ActiveZSendTask {
  migrationId: string;
  sourcePool: string;
  sourceDataset: string;
  snapshotName: string;
  targetPool: string;
  targetDataset: string;
  status: 'INITIALIZING' | 'STREAMING_SNAPSHOT' | 'VERIFYING_CHECKSUM' | 'FINALIZING_RECEIVE' | 'COMPLETED' | 'FAILED' | 'ABORTED';
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
}

let activeZSendTask: ActiveZSendTask | null = null;
const zsendHistory: ActiveZSendTask[] = [];

// GET /api/zfs/zsend/active
app.get('/api/zfs/zsend/active', (req: Request, res: Response) => {
  if (useRealHost()) return res.json({ activeMigration: null, history: [] });
  res.json({ activeMigration: activeZSendTask, history: zsendHistory });
});

// POST /api/zfs/zsend/start
app.post('/api/zfs/zsend/start', (req: Request, res: Response) => {
  if (useRealHost()) {
    return res.status(409).json({ error: 'DEMO is off. Simulated Z-Send is not started. Use zfs send from the shell.' });
  }
  const {
    sourcePool,
    sourceDataset,
    snapshotName,
    targetPool,
    targetDataset,
    isIncremental = false,
    baseSnapshot,
    rawCompressed = true,
    forceOverwrite = true,
    preserveProperties = true,
  } = req.body;

  if (!sourcePool || !sourceDataset || !targetPool || !targetDataset) {
    return res.status(400).json({ error: 'Mungojne parametrat e burimit ose destinacionit per Z-Send' });
  }

  if (activeZSendTask && activeZSendTask.status === 'STREAMING_SNAPSHOT') {
    return res.status(409).json({ error: 'Nje proces ZFS Z-Send eshte tashme duke u ekzekutuar!' });
  }

  const migrationId = `zsend_${Date.now()}`;
  const now = Date.now();
  const effectiveSnap = snapshotName || `${sourceDataset}@migration-${Date.now().toString().slice(-4)}`;

  const flags = `${rawCompressed ? '-c ' : ''}${preserveProperties ? '-p ' : ''}${isIncremental && baseSnapshot ? `-i ${baseSnapshot} ` : ''}`.trim();
  const receiveFlags = `${forceOverwrite ? '-F ' : ''}`.trim();
  const cliCommandExecuted = `zfs send ${flags} ${effectiveSnap} | zfs receive ${receiveFlags} ${targetDataset}`;

  const totalBytes = 18.4 * 1024 * 1024 * 1024; // 18.4 GB payload

  activeZSendTask = {
    migrationId,
    sourcePool,
    sourceDataset,
    snapshotName: effectiveSnap,
    targetPool,
    targetDataset,
    status: 'INITIALIZING',
    totalBytes,
    totalFormatted: '18.40 GB',
    bytesSent: 0,
    bytesSentFormatted: '0 MB',
    progressPct: 0,
    currentRateMbS: 0,
    averageRateMbS: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: 20,
    checksumMatches: true,
    startedAt: now,
    cliCommandExecuted,
  };

  let bytesTransferred = 0;
  const interval = setInterval(() => {
    if (!activeZSendTask || activeZSendTask.migrationId !== migrationId || activeZSendTask.status === 'ABORTED') {
      clearInterval(interval);
      return;
    }

    const elapsed = Math.max(0.5, (Date.now() - activeZSendTask.startedAt) / 1000);
    activeZSendTask.elapsedSeconds = Math.round(elapsed);

    // Realistic OpenZFS Z-Send stream speed: 850 - 1200 MB/s
    const speedMbS = 850 + Math.random() * 350;
    activeZSendTask.currentRateMbS = Number(speedMbS.toFixed(1));
    const chunkBytes = (speedMbS * 1024 * 1024) * 0.5;
    bytesTransferred += chunkBytes;

    if (bytesTransferred >= totalBytes) {
      activeZSendTask.bytesSent = totalBytes;
      activeZSendTask.bytesSentFormatted = activeZSendTask.totalFormatted;
      activeZSendTask.progressPct = 100;
      activeZSendTask.status = 'COMPLETED';
      activeZSendTask.completedAt = Date.now();
      activeZSendTask.estimatedRemainingSeconds = 0;
      clearInterval(interval);

      const state = getState();
      const existing = state.datasets.find((d: any) => d.name === targetDataset);
      if (!existing) {
        state.datasets.push({
          name: targetDataset,
          used: '18.4G',
          available: '3.42T',
          refer: '18.4G',
          mountpoint: `/${targetDataset}`,
          compression: 'zstd',
          compressratio: '1.42x',
          type: 'filesystem',
          recordsize: '128K',
          dedup: 'off',
        });
      }

      if (Array.isArray(systemLogs)) {
        systemLogs.unshift({
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          epochMs: Date.now(),
          level: 'INFO',
          source: 'zed',
          subsystem: 'zsend',
          pool: targetPool,
          message: `zed: Z-Send stream complete: ${effectiveSnap} -> ${targetDataset} (18.4 GB transferred in ${activeZSendTask.elapsedSeconds}s). Fletcher4 checksum verification PASSED.`,
          raw: `Oct 13 00:22:00 storage-node01 zed[1042]: ZFS Z-Send migration task ${migrationId} SUCCESS.`,
        });
      }
      saveState(state);
      zsendHistory.unshift({ ...activeZSendTask });
    } else {
      activeZSendTask.status = 'STREAMING_SNAPSHOT';
      activeZSendTask.bytesSent = Math.round(bytesTransferred);
      activeZSendTask.bytesSentFormatted = `${(bytesTransferred / 1024 / 1024 / 1024).toFixed(2)} GB`;
      activeZSendTask.progressPct = Number(((bytesTransferred / totalBytes) * 100).toFixed(1));
      activeZSendTask.averageRateMbS = Number((bytesTransferred / 1024 / 1024 / elapsed).toFixed(1));
      const remainingBytes = totalBytes - bytesTransferred;
      activeZSendTask.estimatedRemainingSeconds = Math.max(1, Math.ceil(remainingBytes / (activeZSendTask.averageRateMbS * 1024 * 1024)));
    }
  }, 500);

  res.json({
    status: 'success',
    message: `Migrimi ZFS Z-Send filloi me sukses per ${targetDataset}!`,
    migration: activeZSendTask,
  });
});

// GET /api/zfs/zsend/status/:id
app.get('/api/zfs/zsend/status/:id', (req: Request, res: Response) => {
  if (activeZSendTask && activeZSendTask.migrationId === req.params.id) {
    return res.json({ migration: activeZSendTask });
  }
  const hist = zsendHistory.find((h) => h.migrationId === req.params.id);
  if (hist) {
    return res.json({ migration: hist });
  }
  res.status(404).json({ error: 'Migrimi Z-Send nuk u gjet' });
});

// POST /api/zfs/zsend/abort/:id
app.post('/api/zfs/zsend/abort/:id', (req: Request, res: Response) => {
  if (useRealHost()) return res.status(409).json({ error: 'DEMO is off. There is no simulated Z-Send to abort.' });
  if (activeZSendTask && activeZSendTask.migrationId === req.params.id) {
    activeZSendTask.status = 'ABORTED';
    zsendHistory.unshift({ ...activeZSendTask });
    activeZSendTask = null;
    return res.json({ status: 'success', message: 'Migrimi Z-Send u nderpre.' });
  }
  res.status(404).json({ error: 'Nuk ka migrim aktiv me kete ID' });
});

// 5. ARC Tuning & Kernel Parameters
app.get('/api/zfs/arc', (req: Request, res: Response) => {
  if (useRealHost()) return res.json({ arc: readLiveArc() });
  res.json({ arc: getState().arc });
});

app.post('/api/zfs/arc/tune', async (req: Request, res: Response) => {
  if (useRealHost()) {
    const writes: Array<[string, unknown]> = [
      ['zfs_arc_max', req.body?.zfs_arc_max],
      ['zfs_arc_min', req.body?.zfs_arc_min],
      ['l2arc_write_max', req.body?.l2arc_write_max],
      ['l2arc_noprefetch', req.body?.l2arc_noprefetch],
    ];
    const errors: string[] = [];
    for (const [param, value] of writes) {
      if (value === undefined || value === null || value === '') continue;
      if (!/^\d+$/.test(String(value))) {
        errors.push(`${param} must be a number`);
        continue;
      }
      const file = `/sys/module/zfs/parameters/${param}`;
      if (managingRemote()) {
        const probe = await runShell(`test -e ${file}`);
        if (probe.code !== 0) {
          errors.push(`${param} is not available`);
          continue;
        }
        const wrote = await runShell(`sh -c 'printf %s ${value} > ${file}'`);
        if (wrote.code !== 0) errors.push(`${param}: ${shellError(wrote, 'write failed')}`);
        continue;
      }
      if (!fs.existsSync(file)) {
        errors.push(`${param} is not available`);
        continue;
      }
      try {
        fs.writeFileSync(file, String(value));
      } catch (err: any) {
        errors.push(`${param}: ${err?.message || 'write failed'}`);
      }
    }
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    return res.json({ status: 'success', message: 'ARC parameters were written to the running kernel.', arc: readLiveArc() });
  }
  const state = getState();
  const { zfs_arc_max, zfs_arc_min, l2arc_write_max, l2arc_noprefetch } = req.body;

  if (zfs_arc_max) {
    state.arc.c_max = Number(zfs_arc_max);
    state.arc.tunables.zfs_arc_max = Number(zfs_arc_max);
  }
  if (zfs_arc_min) {
    state.arc.c_min = Number(zfs_arc_min);
    state.arc.tunables.zfs_arc_min = Number(zfs_arc_min);
  }
  if (l2arc_write_max) {
    state.arc.tunables.l2arc_write_max = Number(l2arc_write_max);
  }
  if (l2arc_noprefetch !== undefined) {
    state.arc.tunables.l2arc_noprefetch = Number(l2arc_noprefetch);
  }

  // Attempt real sysfs write if root and available
  try {
    if (fs.existsSync('/sys/module/zfs/parameters/zfs_arc_max') && zfs_arc_max) {
      fs.writeFileSync('/sys/module/zfs/parameters/zfs_arc_max', String(zfs_arc_max));
    }
  } catch (err) {
    // ignore
  }

  // Generate /etc/modprobe.d/zfs.conf content for user convenience
  const modprobeContent = `# Generated by OpenZFS Enterprise Director
options zfs zfs_arc_max=${state.arc.tunables.zfs_arc_max}
options zfs zfs_arc_min=${state.arc.tunables.zfs_arc_min}
options zfs l2arc_write_max=${state.arc.tunables.l2arc_write_max}
options zfs l2arc_noprefetch=${state.arc.tunables.l2arc_noprefetch}
`;

  saveState(state);
  res.json({
    status: 'success',
    message: 'Parametrat e ARC dhe L2ARC u aplikuan me sukses!',
    arc: state.arc,
    modprobeConf: modprobeContent,
  });
});

app.post('/api/zfs/arc/persist', async (req: Request, res: Response) => {
  if (managingRemote()) {
    return res.status(409).json({ error: 'Initramfs persist runs on the director host. Select the local node before writing /etc/modprobe.d/zfs.conf.' });
  }
  if (demoMode) {
    return res.status(409).json({ error: 'DEMO is on. Persistent kernel config is not written to this host.' });
  }
  const allowed = new Set(['zfs_arc_max', 'zfs_arc_min', 'l2arc_write_max', 'l2arc_noprefetch']);
  const parsed: Record<string, string> = {};
  for (const raw of String(req.body?.conf || '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^options\s+zfs\s+([a-z0-9_]+)=(\d+)$/);
    if (!match || !allowed.has(match[1])) {
      return res.status(400).json({ error: `Unsupported line: ${line}` });
    }
    parsed[match[1]] = match[2];
  }
  if (!parsed.zfs_arc_max || !parsed.zfs_arc_min) {
    return res.status(400).json({ error: 'zfs_arc_max and zfs_arc_min are required.' });
  }

  const target = '/etc/modprobe.d/zfs.conf';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  let backup: string | null = null;
  if (fs.existsSync(target)) {
    backup = `${target}.bak-${stamp}`;
    fs.copyFileSync(target, backup);
  }
  let initrdBackup: string | null = null;
  const initrdLink = '/boot/initrd.img';
  if (fs.existsSync(initrdLink)) {
    const real = fs.realpathSync(initrdLink);
    initrdBackup = `${real}.bak-${stamp}`;
    fs.copyFileSync(real, initrdBackup);
  }

  const body = [
    '# OpenZFS Enterprise Director - Persistent Kernel Tunables',
    `# Backup: ${backup || 'none (file did not exist)'}`,
    ...Object.entries(parsed).map(([key, value]) => `options zfs ${key}=${value}`),
    '',
  ].join('\n');
  fs.writeFileSync(target, body);

  const init = await runShell('update-initramfs -u', 180000);
  if (init.code !== 0) {
    return res.status(400).json({
      error: shellError(init, 'update-initramfs failed'),
      backup,
      initrdBackup,
      written: target,
    });
  }
  return res.json({
    status: 'success',
    message: backup
      ? `Saved ${target}. Previous config backed up to ${backup}. initramfs updated.`
      : `Saved ${target}. There was no previous config to back up. initramfs updated.`,
    backup,
    initrdBackup,
    written: target,
  });
});

// 6. Interactive Command Executor (for web terminal)
app.post('/api/zfs/exec', async (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Komanda mungon' });
  }

  const cleanCmd = command.trim();
  if (useRealHost()) {
    if (!/^(zpool|zfs|arcstat|arc_summary|lsblk)(\s|$)/.test(cleanCmd) || /[;&|`$<>\\\n]/.test(cleanCmd)) {
      return res.status(400).json({ error: 'LIVE shell accepts only zpool, zfs, arcstat, arc_summary, and lsblk, without shell operators.' });
    }
    const result = await runShell(cleanCmd, 20000);
    return res.json({ command: cleanCmd, output: result.stdout || result.stderr || '', exitCode: result.code });
  }

  const state = getState();

  // High-fidelity command responses when emulating or in demo mode
  let output = '';
  if (cleanCmd === 'zpool list') {
    output = `NAME               SIZE  ALLOC   FREE  CKPOINT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH  ALTROOT\n`;
    for (const p of state.pools) {
      output += `${p.name.padEnd(17)} ${p.size.padEnd(6)} ${p.allocated.padEnd(7)} ${p.free.padEnd(7)}        -         -     ${p.frag.padEnd(6)}  26%  ${p.dedup.padEnd(7)}  ${p.health.padEnd(7)}        -\n`;
    }
  } else if (cleanCmd.startsWith('zpool status')) {
    const p = state.pools[0] || {};
    output = `  pool: ${p.name || 'tank-enterprise'}\n state: ${p.health || 'ONLINE'}\nstatus: ${p.status || 'Optimal'}\n scrub: ${p.scrub_status || 'None'}\nconfig:\n\n\tNAME                 STATE     READ WRITE CKSUM\n\t${p.name}      ONLINE       0     0     0\n`;
    for (const v of p.vdevs || []) {
      output += `\t  ${v.name}        ONLINE       0     0     0  (${v.type.toUpperCase()})\n`;
      for (const d of v.disks || []) {
        output += `\t    ${d}           ONLINE       0     0     0\n`;
      }
    }
    output += `\nerrors: No known data errors\n`;
  } else if (cleanCmd === 'zfs list' || cleanCmd.startsWith('zfs list')) {
    output = `NAME                                   USED  AVAIL  REFER  MOUNTPOINT\n`;
    for (const d of state.datasets) {
      output += `${d.name.padEnd(38)} ${d.used.padEnd(5)}  ${d.avail.padEnd(5)}  ${d.refer.padEnd(5)}  ${d.mountpoint}\n`;
    }
  } else if (cleanCmd === 'arcstat' || cleanCmd.includes('arc_summary')) {
    output = `=== OpenZFS ARC Adaptive Replacement Cache Summary ===\n`;
    output += `Current ARC Size:       ${(state.arc.size / 1024 / 1024 / 1024).toFixed(2)} GiB\n`;
    output += `Target Max (c_max):     ${(state.arc.c_max / 1024 / 1024 / 1024).toFixed(2)} GiB\n`;
    output += `Target Min (c_min):     ${(state.arc.c_min / 1024 / 1024 / 1024).toFixed(2)} GiB\n`;
    output += `Hit Ratio:              ${state.arc.hit_ratio}%\n`;
    output += `Most Recently Used:     ${(state.arc.mru_size / 1024 / 1024 / 1024).toFixed(2)} GiB\n`;
    output += `Most Frequently Used:   ${(state.arc.mfu_size / 1024 / 1024 / 1024).toFixed(2)} GiB\n`;
    output += `L2ARC Size:             ${(state.arc.l2_size / 1024 / 1024 / 1024).toFixed(2)} GiB\n`;
    output += `L2ARC Hit Ratio:        ${state.arc.l2_hit_ratio}%\n`;
  } else {
    output = `[OpenZFS Director Kernel Shell] Command '${cleanCmd}' executed successfully.\nSystem status: OK. All pools synced.`;
  }

  res.json({
    command: cleanCmd,
    output,
    exitCode: 0,
  });
});

// 7. Service control
app.post('/api/zfs/service/:action', (req: Request, res: Response) => {
  const { action } = req.params;
  if (useRealHost()) {
    return res.json({
      status: 'success',
      message: 'LIVE mode is this Node process. Start, stop, and restart do not control a separate daemon.',
      serviceStatus: {
        daemonActive: true,
        pid: process.pid,
        uptime: formatHostUptime(),
        kernelModuleLoaded: fs.existsSync('/proc/spl/kstat/zfs/arcstats'),
        rustServerAvailable: false,
        installedPath: __dirname,
      },
    });
  }
  const state = getState();

  if (action === 'restart') {
    state.serviceStatus.uptime = '0d 00h 01m';
    state.serviceStatus.pid = Math.floor(Math.random() * 50000) + 10000;
  } else if (action === 'stop') {
    state.serviceStatus.daemonActive = false;
  } else if (action === 'start') {
    state.serviceStatus.daemonActive = true;
  }

  saveState(state);
  res.json({ status: 'success', message: `Service ${action} completed`, serviceStatus: state.serviceStatus });
});

// 8. Package inspector
app.get('/api/zfs/package', (req: Request, res: Response) => {
  const pkgDir = path.join(__dirname, 'linux_package');
  const files = [
    { path: '/root/zfs-enterprise-suite/zfs-mgr.sh', desc: 'Master start/stop/restart CLI script', type: 'bash' },
    { path: '/root/zfs-enterprise-suite/linux_package/install.sh', desc: 'Automated root installer', type: 'bash' },
    { path: '/root/zfs-enterprise-suite/linux_package/python_cli/zfs_manager.py', desc: 'Python CLI ZFS & ARC manager', type: 'python' },
    { path: '/root/zfs-enterprise-suite/linux_package/python_cli/zfs_wizard.py', desc: 'Interactive terminal config wizard', type: 'python' },
    { path: '/root/zfs-enterprise-suite/linux_package/rust_engine/src/main.rs', desc: 'High-speed Rust metrics engine', type: 'rust' },
    { path: '/root/zfs-enterprise-suite/linux_package/docs/INSTALL_AND_USAGE_GUIDE.md', desc: 'Complete Albanian & English installation guide', type: 'doc' },
    { path: '/root/zfs-enterprise-suite/linux_package/docs/ZFS_ARCHITECTURE_MANUAL.md', desc: 'Deep OpenZFS architectural reference', type: 'doc' },
  ];
  res.json({ rootDirectory: '/root/zfs-enterprise-suite', files });
});

// -------------------------------------------------------------
// VITE INTEGRATION
// -------------------------------------------------------------
async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[OpenZFS Enterprise Director] Server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
});

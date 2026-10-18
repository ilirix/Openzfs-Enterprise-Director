import { InfoBoxTopic } from '../types/zfs';

export const ZFS_KNOWLEDGE_BASE_EN: Record<string, InfoBoxTopic> = {
  dashboard: {
    id: 'dashboard',
    title: 'Fleet Overview & OpenZFS Telemetry',
    subtitle: 'Live monitoring of drive health, data integrity, and cache performance',
    summary:
      'The main dashboard is a single view of the storage cluster. It shows total capacity, scrub integrity, IOPS, and how efficiently the Adaptive Replacement Cache (ARC) is using RAM.',
    keyConcepts: [
      {
        label: 'Self-healing data integrity',
        description:
          'ZFS checksums every block (Fletcher4 or SHA-256). If silent bit-rot is detected, ZFS repairs the block from a redundant copy during a read or a scrub.',
      },
      {
        label: 'ARC hit ratio',
        description:
          'The share of reads served from RAM with sub-microsecond latency, without touching the disks. Values above 90% are typical for a healthy enterprise host.',
      },
      {
        label: 'Pool fragmentation',
        description:
          'How free space is spread across the disks. Copy-on-write handles fragmentation well, but a pool should stay under about 80–85% full.',
      },
    ],
    shellCommands: [
      'zpool list -v',
      'zpool status -x',
      'arcstat 1 5',
      'zpool iostat -v 1 3',
    ],
    bestPractices: [
      'Keep each pool under 80–85% full so free-space allocation stays fast.',
      'Schedule a scrub at least monthly on enterprise disks, or weekly on consumer disks.',
      'Watch the ARC hit ratio to decide whether the host needs more RAM or an L2ARC device.',
    ],
    architectureNote:
      'OpenZFS combines the file system and the volume manager (the Storage Pool Allocator), so you do not need hardware RAID or a separate fsck pass.',
  },

  pools: {
    id: 'pools',
    title: 'Pool Management & VDEV Topology (ZPOOL Architecture)',
    subtitle: 'How disk groups, redundancy layouts, and dedicated accelerators fit together',
    summary:
      'A storage pool (zpool) is the foundation of ZFS. It is built from virtual devices (VDEVs). You grow a pool by adding VDEVs. ZFS stripes writes across those VDEVs according to free space.',
    keyConcepts: [
      {
        label: 'ashift (physical sector size)',
        description:
          'ashift=12 means 4096-byte sectors. That is the right setting for SSD, NVMe, and modern Advanced Format disks. ashift=9 (512 bytes) on those disks causes write amplification and a large drop in throughput. ashift cannot be changed after the pool is created.',
      },
      {
        label: 'VDEV types (mirror vs RAIDZ)',
        description:
          'A 2-way or 3-way mirror gives the highest IOPS and the shortest resilver. RAIDZ2 (similar to RAID-6) survives two disk failures and is the usual choice for large, safe capacity.',
      },
      {
        label: 'SLOG / ZIL (separate intent log)',
        description:
          'A low-latency SSD or NVMe with power-loss protection that holds the synchronous intent log. It directly affects NFS, iSCSI, and database commit latency.',
      },
      {
        label: 'L2ARC (level 2 cache)',
        description:
          'A read cache on SSD or NVMe that extends the RAM ARC. Blocks evicted from RAM can still be served from L2ARC.',
      },
      {
        label: 'Special VDEV (metadata and small blocks)',
        description:
          'A fast NVMe VDEV that stores the metadata tree and small blocks (for example 16 KB or 32 KB and under), which can speed up file-heavy workloads several times over.',
      },
    ],
    shellCommands: [
      'zpool create -o ashift=12 tank mirror /dev/sdb /dev/sdc',
      'zpool add tank log mirror /dev/nvme0n1p1 /dev/nvme1n1p1',
      'zpool add tank cache /dev/nvme2n1p1',
      'zpool add tank special mirror /dev/nvme3n1p1 /dev/nvme4n1p1',
      'zpool scrub tank',
      'zpool trim tank',
    ],
    bestPractices: [
      'Always set ashift=12 when you create a pool. This property cannot be changed later.',
      'Use an enterprise SSD with power-loss protection, in a mirror, for the SLOG.',
      'Do not put pool disks behind a hardware RAID controller. The HBA should be in IT mode.',
    ],
    architectureNote:
      'Losing a single data VDEV that has no redundancy destroys the whole pool. Redundancy (mirror or RAIDZ2/3) belongs on each data VDEV.',
  },

  datasets: {
    id: 'datasets',
    title: 'Datasets & ZVOLs (File Hierarchy and Virtual Disks)',
    subtitle: 'Per-dataset compression, record size, quotas, and encryption',
    summary:
      'A dataset is a lightweight file system inside a pool, with its own properties. A ZVOL is a block device used for virtual machines (KVM/QEMU), iSCSI targets, or raw volumes.',
    keyConcepts: [
      {
        label: 'Record size',
        description:
          'The maximum block size for files. The default is 128 KB. Use 16 KB for PostgreSQL and MySQL InnoDB so it matches the database page size. Use 1 MB for large media and backups to raise throughput and compression.',
      },
      {
        label: 'Inline compression (zstd / lz4)',
        description:
          'ZFS compresses each block before it hits the disk. lz4 is extremely fast and almost free on CPU. zstd compresses more (often 1.8x–2.5x), which saves space and can raise I/O throughput.',
      },
      {
        label: 'Deduplication (DDT)',
        description:
          'Drops duplicate blocks. The dedup table needs roughly 5 GB of RAM per 1 TB of deduplicated data. Without that RAM, performance falls sharply.',
      },
      {
        label: 'Native encryption (AES-256-GCM)',
        description:
          'Block-level encryption built into ZFS, without dm-crypt or LUKS. A raw send can replicate ciphertext to a remote host that does not hold the key.',
      },
    ],
    shellCommands: [
      'zfs create -o compression=zstd -o atime=off tank/data',
      'zfs create -o recordsize=16k -o compression=lz4 tank/postgres',
      'zfs create -V 50G -o volblocksize=16k tank/vm-disk-1',
      'zfs set quota=500G tank/user-storage',
      'zfs get all tank/data',
    ],
    bestPractices: [
      'Set atime=off so every file read does not rewrite metadata.',
      'Enable lz4 or zstd on datasets. Compressed data is often faster to read because the disks move fewer bytes.',
      'Use a ZVOL only when you need a block device. For files, use a ZFS dataset.',
    ],
    architectureNote:
      'Child datasets inherit properties from their parent unless a property is set locally.',
  },

  arc: {
    id: 'arc',
    title: 'ARC & L2ARC Cache Architecture',
    subtitle: 'How the Adaptive Replacement Cache works, and which kernel limits to set',
    summary:
      'The ARC is the main performance cache in ZFS. Unlike a plain LRU, it keeps a live balance between data used a moment ago (MRU) and data used often (MFU).',
    keyConcepts: [
      {
        label: 'MRU (most recently used)',
        description:
          'Holds blocks read recently. A large sequential scan should not be able to push frequently used data out of RAM.',
      },
      {
        label: 'MFU (most frequently used)',
        description:
          'Holds blocks that are read over and over. Those blocks stay protected so latency stays low.',
      },
      {
        label: 'Size cap (zfs_arc_max / c_max)',
        description:
          'The kernel limit on how much RAM ZFS may use. On a 64 GB host, 32–48 GB is a typical cap, leaving room for the OS and applications.',
      },
      {
        label: 'L2ARC write throttle',
        description:
          'l2arc_write_max limits how fast ZFS fills the cache SSD, so the flash is not worn out by cache writes.',
      },
    ],
    shellCommands: [
      'cat /proc/spl/kstat/zfs/arcstats',
      'echo 34359738368 > /sys/module/zfs/parameters/zfs_arc_max',
      'arc_summary',
      'arcstat -f time,read,hit%,hits,miss,l2read,l2hit% 1',
    ],
    bestPractices: [
      'Do not set zfs_arc_max above about 75% of RAM if the host also runs KVM or PostgreSQL.',
      'Each 1 GB of L2ARC needs about 70 MB of ARC RAM for index headers. Add RAM before you add a very large L2ARC.',
      'Put the limits in /etc/modprobe.d/zfs.conf so they survive a reboot.',
    ],
    architectureNote:
      'OpenZFS watches Linux memory pressure. When user processes need RAM, the ARC shrinks on its own to avoid the OOM killer.',
  },

  snapshots: {
    id: 'snapshots',
    title: 'Snapshots, Clones & Replication (Copy-on-Write)',
    subtitle: 'Instant atomic copies, immediate rollback, and incremental send/receive',
    summary:
      'A ZFS snapshot is an atomic point-in-time copy created in well under a millisecond. Copy-on-write means it uses no extra space until blocks change. Only modified blocks consume new space.',
    keyConcepts: [
      {
        label: 'Zero-overhead snapshots',
        description:
          'Creating a snapshot freezes the existing block tree. Nothing is copied on disk at that moment.',
      },
      {
        label: 'Instant rollback',
        description:
          'Returns a dataset to the exact snapshot state and drops later changes, in under a second, regardless of how much data changed.',
      },
      {
        label: 'Writable clones',
        description:
          'A new writable file system created from a snapshot, with almost no extra space. Useful for database tests and development copies.',
      },
      {
        label: 'Incremental replication (zfs send / zfs recv)',
        description:
          'Sends only the blocks that changed between two snapshots, over SSH or the network, and keeps compression intact.',
      },
    ],
    shellCommands: [
      'zfs snapshot tank/databases@snap-2026-10-11',
      'zfs rollback -r tank/databases@snap-2026-10-11',
      'zfs clone tank/databases@snap-2026-10-11 tank/databases-dev',
      'zfs send -i @snap-1 @snap-2 tank/data | ssh backup-srv zfs recv backup/data',
    ],
    bestPractices: [
      'Automate retention: for example hourly (keep 24), daily (keep 7), weekly (keep 4).',
      'Delete old snapshots on busy datasets. They hold onto space that would otherwise be freed.',
      'Use zfs send -R to replicate a whole dataset tree and its properties.',
    ],
    architectureNote:
      'zfs send is a block-level binary stream. It stays exact and avoids the cost of rsync walking millions of small files.',
  },

  wizard: {
    id: 'wizard',
    title: 'Configuration Wizard',
    subtitle: 'Build a safe pool and dataset layout for the workload you actually run',
    summary:
      'The wizard helps you create pools and datasets without missing critical settings such as ashift, record size, and VDEV type. The same flow exists in the terminal CLI and in this web panel.',
    keyConcepts: [
      {
        label: 'Parameter checks',
        description:
          'Stops you from creating a pool with ashift=9 on modern disks, and suggests a redundancy layout that matches the number of disks you have.',
      },
      {
        label: 'Workload presets',
        description:
          'Sets recordsize=16k for Postgres/MySQL, 8k for VM ZVOLs, and 1M for video and backups.',
      },
      {
        label: 'Shell script output',
        description:
          'Besides applying a change, the wizard shows the exact zpool and zfs commands for your change log.',
      },
    ],
    shellCommands: [
      './zfs-mgr.sh wizard',
      'python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_wizard.py',
    ],
    bestPractices: [
      'Use the wizard for new pools so ashift and redundancy match enterprise practice.',
      'Read the generated commands before you apply them on a production host.',
    ],
    architectureNote:
      'A saved profile can be reused on another server from /etc/zfs-director/wizard_profile.json.',
  },

  terminal: {
    id: 'terminal',
    title: 'Built-in Terminal & Shell Console',
    subtitle: 'Run ZFS and kstat commands directly from the panel',
    summary:
      'The console runs the OpenZFS tools (zpool, zfs, arcstat, zdb, arc_summary), with shortcuts for the diagnostic commands used most often.',
    keyConcepts: [
      {
        label: 'Kernel introspection (kstat)',
        description:
          'Reads the kernel module counters under /proc/spl/kstat/zfs/ for a detailed diagnosis.',
      },
      {
        label: 'I/O telemetry (zpool iostat)',
        description:
          'Shows latency, bandwidth, and read/write operations per second for each disk and VDEV.',
      },
    ],
    shellCommands: [
      'zpool iostat -v 1',
      'zpool status -v',
      'zfs list -o space',
      'arc_summary',
    ],
    bestPractices: [
      'Use zpool status -v to see whether a checksum error names a specific file.',
      'Avoid zdb on a busy production pool unless you are doing a deep repair.',
    ],
    architectureNote:
      'The console talks to the local server over the REST API, so each command is logged and the reply stays on this host.',
  },

  reports: {
    id: 'reports',
    title: 'Diagnostic Reports & Live Benchmarks',
    subtitle: 'Measure IOPS and latency, and keep a history of scrub integrity',
    summary:
      'This page measures pool performance (sequential MB/s, 4K random IOPS, average latency, and ARC hit ratio) and keeps a history of scrub and disk-integrity audits.',
    keyConcepts: [
      {
        label: 'IOPS and latency',
        description:
          'Compares reads served from the ARC (often under 0.2 ms) with synchronous writes to the disks and to an NVMe SLOG.',
      },
      {
        label: 'Historical integrity and bit-rot',
        description:
          'Records checksum errors found and repaired by Fletcher4 during a periodic zpool scrub.',
      },
      {
        label: 'Exportable audit reports',
        description:
          'Downloads the current report as Markdown, JSON, or CSV for an infrastructure audit.',
      },
    ],
    shellCommands: [
      'zpool iostat -v 1 5',
      'fio --name=zfs-bench --rw=randwrite --bs=4k --size=1G',
      'zpool scrub -s tank',
      'smartctl -x /dev/nvme0n1',
    ],
    bestPractices: [
      'Run load tests when applications are quiet so production I/O is not competing with the benchmark.',
      'Compare a test before and after you add a SLOG or L2ARC so the gain is visible.',
    ],
    architectureNote:
      'OpenZFS batches writes into transaction groups about every 5 seconds, turning scattered writes into larger sequential ones.',
  },

  deployment: {
    id: 'deployment',
    title: 'Install Package & Service Control',
    subtitle: 'Layout of the Linux package, zfs-mgr.sh, and the systemd unit',
    summary:
      'The suite is meant to live as one directory and is controlled by zfs-mgr.sh: one command starts, stops, or restarts the service. Python covers the CLI and wizard; the optional Rust engine is a separate binary.',
    keyConcepts: [
      {
        label: 'zfs-mgr.sh',
        description:
          'start launches the web panel in the background, stop ends those processes and frees the port, status reports the recorded PID.',
      },
      {
        label: 'Python CLI and optional Rust engine',
        description:
          'Python runs the administrative CLI and the wizard. The Rust crate is an optional Axum service; the panel itself is served by the Node process.',
      },
      {
        label: 'systemd',
        description:
          'zfs-enterprise.service can start the panel after boot, once zfs.target has loaded.',
      },
    ],
    shellCommands: [
      '/root/zfs-enterprise-suite/zfs-mgr.sh start',
      '/root/zfs-enterprise-suite/zfs-mgr.sh stop',
      '/root/zfs-enterprise-suite/zfs-mgr.sh restart',
      '/root/zfs-enterprise-suite/zfs-mgr.sh status',
      'sudo ./linux_package/install.sh',
    ],
    bestPractices: [
      'Check ./zfs-mgr.sh status before and after a configuration change.',
      'Copy zfs_state.json before large edits in a test environment.',
    ],
    architectureNote:
      'The package is self-contained and can be placed on Ubuntu, Debian, Proxmox, or RHEL. Start it with bash start.sh after Node.js 20 or newer is installed.',
  },

  logs: {
    id: 'logs',
    title: 'System Logs & the ZFS Event Daemon (ZED)',
    subtitle: 'Kernel zfs.ko events, I/O errors, and proactive SMART checks',
    summary:
      'ZED and the zfs.ko module record topology changes, transaction-group syncs, checksum errors, and scrub or trim runs. The log view streams those events and lets you filter them.',
    keyConcepts: [
      {
        label: 'ZED (ZFS Event Daemon)',
        description:
          'Watches events from /dev/zfs. On a disk fault it can activate a hot spare or email an administrator.',
      },
      {
        label: 'Checksum ereports and self-healing',
        description:
          'A corrupt block produces ereport.fs.zfs.checksum. The kernel repairs it from a mirror or parity copy and notifies ZED without stopping the service.',
      },
      {
        label: 'SMART daemon (smartd)',
        description:
          'Tracks temperature, power-on hours, reallocated sectors, and NVMe wear before a drive fails completely.',
      },
    ],
    shellCommands: [
      'zpool events -v',
      'journalctl -u zed -f',
      'journalctl -k | grep -i zfs',
      'smartctl -a /dev/sdb',
      'arcstat -f time,hits,miss,hit%,size,c',
    ],
    bestPractices: [
      'Enable zed.service on every OpenZFS host so faults are noticed in the background.',
      'Turn on auto-refresh while a benchmark or resilver is running so latency changes are visible.',
      'Export logs as JSON or plain text when you need an audit archive.',
    ],
    architectureNote:
      'ZFS sends events into the Linux kernel trace path and systemd-journald, so storage errors can be lined up with device health.',
  },

  scheduler: {
    id: 'scheduler',
    title: 'ZFS Scrub Scheduler & Maintenance Windows',
    subtitle: 'Check every block on a schedule that stays out of the way of users',
    summary:
      'A scrub reads every block in the pool and checks its Fletcher4 or SHA-256 checksum. A cron job or a systemd timer runs that check in a quiet window, often 02:00–08:00 UTC.',
    keyConcepts: [
      {
        label: 'Maintenance windows',
        description:
          'Keep the heavy scrub read inside low-traffic hours (night or weekend) so production IOPS stay available.',
      },
      {
        label: 'Pause and throttle',
        description:
          'zpool scrub -p pauses a scrub and it can be resumed later. The scheduler can also pause when CPU or disk load crosses a threshold.',
      },
      {
        label: 'How often to scrub',
        description:
          'Hard disks: every one to two weeks. SSD and NVMe: about monthly, because there is no mechanical risk and extra reads wear flash.',
      },
    ],
    shellCommands: [
      'zpool scrub tank-enterprise',
      'zpool scrub -p tank-enterprise',
      'zpool scrub -s tank-enterprise',
      'cat /etc/cron.d/zfs-pool-scrub',
      'systemctl list-timers | grep zfs',
    ],
    bestPractices: [
      'Do not scrub two pools at once if they share the same SAS controller.',
      'Set a maximum duration so a scrub stops before the business day starts.',
      'Watch scrub duration over time. A scrub that keeps getting slower often means a disk is degrading.',
    ],
    architectureNote:
      'A scrub runs in the background at low I/O priority. On a fragmented hard-disk pool it can still raise random-read latency.',
  },
};

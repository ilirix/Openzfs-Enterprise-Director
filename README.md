# OpenZFS Enterprise Director

Web panel and command-line tools for OpenZFS on Linux. The running interface is a Node.js service on port 3000. In **LIVE** mode it calls the host `zfs`, `zpool`, `lsblk`, and `smartctl` commands. In **DEMO** mode it reads and writes a local JSON state file and does not change pools.

## Requirements

- Linux (tested on Ubuntu)
- Node.js 22 or newer, with npm, for a checkout of this repository (`server.ts` is started with `--experimental-strip-types`)
- Root, or `sudo`, for pool create, destroy, rollback, ARC persist, and scrub
- OpenZFS (`zfs`, `zpool`) on the host you want to manage in LIVE mode
- `smartctl` (package `smartmontools`) for disk SMART data
- `iproute2` (`ss`) so `zfs-mgr.sh` can see whether port 3000 is listening

A fresh Ubuntu install does not start the panel by itself. `./zfs-mgr.sh status` printing `JO AKTIV` means the service has not been started yet.

## Fresh Linux install

Run these on Ubuntu or Debian before the first start. The `nodejs` package from Ubuntu is often older than 22, so Node.js is installed from NodeSource.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git python3 \
  zfsutils-linux smartmontools nvme-cli

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo modprobe zfs
node -v
zpool version
smartctl --version
```

`node -v` must print v22 or newer. `zpool version` confirms OpenZFS. `smartctl` is used for disk health. `nvme` is used when the host has NVMe disks. `python3` is used by `./zfs-mgr.sh cli` and `./zfs-mgr.sh wizard`.

Then get the project and start it:

```bash
git clone <repository-url> openzfs-enterprise-director
cd openzfs-enterprise-director
chmod +x start.sh zfs-mgr.sh linux_package/zfs-mgr.sh
./zfs-mgr.sh start
./zfs-mgr.sh status
```

`JO AKTIV` before `start` is expected. After `start`, the status line is `AKTIV` and the panel is at `http://<server-ip>:3000`.

If this host should accept connections from another network and `ufw` is enabled:

```bash
sudo ufw allow 3000/tcp
```

If another director will manage this machine over SSH, install the server and enable it:

```bash
sudo apt-get install -y openssh-server
sudo systemctl enable --now ssh
```

## Quick start

```bash
git clone <repository-url> openzfs-enterprise-director
cd openzfs-enterprise-director
chmod +x start.sh zfs-mgr.sh linux_package/zfs-mgr.sh
./zfs-mgr.sh start
./zfs-mgr.sh status
```

Open `http://<server-ip>:3000`. The process listens on `0.0.0.0:3000`. Override the port with `PORT=3000`.

The first `./start.sh` runs `npm install` when `node_modules` is missing, then serves the built panel. Later starts rebuild `dist/` only when `src/`, `server.ts`, `index.html`, or `vite.config.ts` is newer than `dist/index.html`.

Logs: `/var/log/zfs-enterprise-director.log`  
PID file: `/var/run/zfs-enterprise-director.pid`

## Service control

`zfs-mgr.sh` in the project root forwards to `linux_package/zfs-mgr.sh`.

| Command | What it does |
| --- | --- |
| `./zfs-mgr.sh start` | Starts the panel in the background. Uses `server.cjs` when that file exists (portable package). Otherwise runs `npm start`. |
| `./zfs-mgr.sh stop` | Stops the process listening on port 3000. |
| `./zfs-mgr.sh restart` | Stop, then start. |
| `./zfs-mgr.sh status` | `AKTIV` when something is listening on port 3000. `JO AKTIV` when it is not running, with the start command. |
| `./zfs-mgr.sh device /dev/sdX` | Prints SMART output from `smartctl` when that tool is installed. |
| `./zfs-mgr.sh cli …` | Python CLI (`linux_package/python_cli/zfs_manager.py`). |
| `./zfs-mgr.sh wizard` | Terminal wizard (`linux_package/python_cli/zfs_wizard.py`). |
| `./zfs-mgr.sh web-rust` | Builds and runs `linux_package/rust_engine` when `cargo` is installed. Without Cargo, it starts the Node panel instead. |

Python CLI:

```bash
./zfs-mgr.sh cli pool list
./zfs-mgr.sh cli pool status <pool>
./zfs-mgr.sh cli arc status
./zfs-mgr.sh cli arc tune --max <bytes>
./zfs-mgr.sh cli scrub <pool> --action start|stop|pause
```

## Web panel

The sidebar language switch covers Albanian, English, German, French, Spanish, Arabic, Hindi, and Chinese. Each page can open an information dialog. Switch **DEMO** and **LIVE** from the header.

| Page | Function |
| --- | --- |
| Dashboard | Pool health, host CPU and memory, disk identity from `lsblk`. Charts that have no host measurement stay empty. |
| Pools | List pools, scrub, trim, add a vdev, export, import, destroy. Destroy asks for a typed confirmation. |
| Datasets | Create and destroy datasets and set properties through `zfs`. |
| ARC | Read ARC statistics, apply runtime tunables, and write `/etc/modprobe.d/zfs.conf`. Persist first copies the existing file and the current initrd, then runs `update-initramfs -u`. Persist is refused in DEMO and when a remote SSH node is selected. |
| Snapshots | Create, destroy, and roll back. Rollback asks for confirmation and runs `zfs rollback` without `-r`, so it does not delete newer snapshots. |
| Wizard | Create a pool. Data topologies: stripe, 2-way mirror, 3-way mirror, raidz1, raidz2, raidz3, draid1, draid2, draid3. Extra roles: SLOG (ZIL), L2ARC, special, spare. Disks already in a pool and the system disk are disabled, with a reason. |
| Reports | Host I/O and resource views from the telemetry endpoints. |
| Scheduler | Scrub schedules: weekly, every two weeks, monthly, or a custom cron expression. Run or pause a schedule from the page. |
| Logs | ZFS and service log view, plus clear. |
| Terminal | Runs an allowed ZFS-related command on the active node. |
| Deployment | Package presence and install status for the host tools the panel expects. |
| SSH nodes | Register another Linux host, test the connection, and select it as the active node. |

## LIVE and DEMO

- **LIVE** (demo off, active node is this machine): `zpool` and `zfs` run on this host. SMART comes from `smartctl`. If the disk has no SMART data, the dialog says it was not measured and does not invent temperature or health.
- **DEMO**: pool, dataset, snapshot, and ARC changes stay in `linux_package/python_cli/zfs_state.json`.
- **Remote node selected**: the same `zpool`, `zfs`, `lsblk`, `smartctl`, and ARC reads go over SSH to that host, even if DEMO is on. CPU and memory charts stay local to the machine running the panel.

## SSH nodes

On the SSH nodes page, add a host by hostname or IPv4. Authentication is an SSH private key (pasted or a path on this machine) or a password. Secrets are stored under `/var/lib/zfs-director/` and are not returned by the node list API. Test runs `hostname` and `zpool list`. Choosing a node makes later pool, dataset, snapshot, disk, and ARC actions target that host.

## Development

```bash
npm install
npm start          # production static server, low memory
npm run dev:vite   # Vite middleware; hot reload is disabled
npm run build      # write dist/
npm run lint       # tsc --noEmit
```

`npm start` and `npm run dev` both run `scripts/serve-light.sh`: one Vite build when sources changed, then `node --experimental-strip-types` with a 128 MB heap. The UI is not served by the Rust binary.

## Infrastructure and schema

The panel that listens on port 3000 is one Node.js process. It serves the built React page and the `/api` routes. OpenZFS stays on the host (or on an SSH node). There is no separate database.

```text
Browser
  |
  |  HTTP  :3000
  v
Node.js 22  (Express in server.ts, heap cap 128 MB)
  |
  +-- static files in dist/          React 19, Tailwind 4, Recharts
  |
  +-- /api/zfs/*  /api/nodes  /api/system
        |
        +-- DEMO, local node     linux_package/python_cli/zfs_state.json
        |
        +-- LIVE, local node     zpool, zfs, lsblk, smartctl, /proc/spl/kstat/zfs
        |
        +-- remote node selected ssh  ->  same commands on that host
```

| Layer | What it is | Role |
| --- | --- | --- |
| Browser | Any modern browser | Renders the panel. Language and a few UI flags stay in `localStorage`. |
| Web UI | React 19, Vite 8, Tailwind CSS 4, Recharts | Pages for pools, datasets, ARC, snapshots, wizard, reports, scheduler, logs, terminal, deployment, and SSH nodes. |
| API | Express 4 in `server.ts` | JSON under `/api`. Binds `0.0.0.0:3000`. |
| Process manager | `zfs-mgr.sh` and `scripts/serve-light.sh` | Start, stop, and status. Production start builds `dist/` when sources are newer, then runs Node with `--experimental-strip-types`. |
| OpenZFS | `zfsutils-linux` on the managed host | Pools, datasets, snapshots, scrub, trim, and ARC. |
| Disk identity | `lsblk`, `smartctl`, `nvme` | Disk list and SMART. Missing SMART is reported as not measured. |
| Python CLI | `linux_package/python_cli/` | `./zfs-mgr.sh cli` and `./zfs-mgr.sh wizard`. DEMO state is the JSON file the API also uses. |
| Optional Rust service | `linux_package/rust_engine` (Axum, Tokio) | Started only by `./zfs-mgr.sh web-rust` when `cargo` is installed. It does not serve the panel during a normal `start`. |

Request path:

1. The browser loads `dist/index.html` and calls `/api/...`.
2. The server reads the DEMO flag in `linux_package/python_cli/demo_mode.json` and the active node in `/var/lib/zfs-director/nodes.json`.
3. If DEMO is on and the active node is this machine, reads and writes go to `zfs_state.json`.
4. If LIVE is on, or a remote node is selected, the server runs `zpool`, `zfs`, `lsblk`, and `smartctl`. A remote node receives those commands over SSH.
5. CPU and memory charts always come from the machine that runs the panel.

Files the running service uses:

| Path | Contents |
| --- | --- |
| `linux_package/python_cli/demo_mode.json` | Whether DEMO is on. |
| `linux_package/python_cli/zfs_state.json` | Simulated pools, datasets, snapshots, and ARC while DEMO is local. |
| `/var/lib/zfs-director/nodes.json` | SSH node registry. Mode `0600`. Secrets are not returned by the API. |
| `/var/lib/zfs-director/keys/` | Private keys for nodes. Mode `0700`. |
| `/etc/modprobe.d/zfs.conf` | Persistent ARC tunables after the persist action. A backup is written first. |
| `/var/run/zfs-enterprise-director.pid` | PID recorded by `zfs-mgr.sh`. |
| `/var/log/zfs-enterprise-director.log` | Start log. |

Source tree:

```text
server.ts                         Express API and static serving
src/                              React panel, i18n locales, API client
dist/                             Built panel, created by Vite
scripts/serve-light.sh            Production launcher
zfs-mgr.sh                        Wrapper
start.sh                          First-run install, then npm start
linux_package/zfs-mgr.sh          start, stop, status, cli, wizard
linux_package/python_cli/         CLI, wizard, DEMO JSON
linux_package/rust_engine/        Optional Axum service
```

## Safety

Pool destroy, dataset destroy, and snapshot rollback change real storage in LIVE mode. ARC persist rewrites the initramfs after a backup. Do not point the wizard at the system disk. Keep SSH private keys out of the git repository; they belong only in `/var/lib/zfs-director/keys` on the director host.

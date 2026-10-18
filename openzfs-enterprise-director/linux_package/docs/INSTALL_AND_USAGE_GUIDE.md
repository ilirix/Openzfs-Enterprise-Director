# OpenZFS Enterprise Director - Manuali i Instalimit dhe Perdorimit (Guide)

Ky dokument ofron udhezuesin e plote hap-pas-hapi per instalimin, konfigurimin dhe administrimin e OpenZFS Enterprise Director ne sisteme operative Linux (Ubuntu 22.04/24.04, Debian 12, Proxmox VE, RHEL 9/Rocky Linux).

---

## 1. Struktura e Projektit ne `/root`

Sipas kerkesave, i gjithe projekti vendoset ne dosjen:
```
/root/zfs-enterprise-suite/
├── zfs-mgr.sh                       # Script-i qendror per Start, Stop, Restart, Status
├── package.json                     # Varesite e Web Interface dhe Backend
├── server.ts                        # Serveri Express me REST API per ZFS & ARC
├── src/                             # Kodi burimor i Modern Enterprise Web UI (React + Tailwind)
├── linux_package/
│   ├── zfs-mgr.sh                   # Script-i kryesor i kontrollit
│   ├── install.sh                   # Script-i automatik i instalimit ne sistem
│   ├── python_cli/
│   │   ├── zfs_manager.py           # Programi Python per CLI ZFS & ARC Cache
│   │   └── zfs_wizard.py            # Konfiguruesi interaktiv (Config Wizard) ne terminal
│   ├── rust_engine/
│   │   ├── Cargo.toml               # Projekti Rust per metrika me shpejtesi te larte
│   │   └── src/main.rs              # Moduli i leximit direkt te /proc/spl/kstat/zfs/arcstats
│   ├── systemd/
│   │   └── zfs-enterprise.service   # Sherbimi automatik per Systemd
│   └── docs/
│       ├── INSTALL_AND_USAGE_GUIDE.md
│       └── ZFS_ARCHITECTURE_MANUAL.md
```

---

## 2. Instalimi i Menjehershem (Quick Start me 1 Komande)

Nese ndodheni ne serverin tuaj Linux si `root`:

```bash
# 1. Shkoni ne dosjen ku keni shkarkuar projektin ose klonuar
cd /root/zfs-enterprise-suite

# 2. Jepni te drejta ekzekutimi
chmod +x zfs-mgr.sh linux_package/install.sh

# 3. Ekzekutoni instaluesin automatik
sudo ./linux_package/install.sh
```

Instaluesi automatik do te:
- Instaloje paketat e nevojshme te ZFS (`zfsutils-linux`), `python3`, `nodejs`, `npm`.
- Kopjoje gjithcka ne `/root/zfs-enterprise-suite/`.
- Regjistroje sherbimin ne Systemd (`systemctl enable zfs-enterprise.service`).
- Krijoj symlink `zfs-mgr` ne `/usr/local/bin/zfs-mgr` qe te thirret nga cdo vend ne terminal.

---

## 3. Menaxhimi me Nje Script te Vetem (`zfs-mgr.sh`)

Ju mund te kontrolloni gjithe suiten (paneli web + daemon i prapavijes) permes komandes se thjeshte:

| Komanda | Pershkrimi |
|---|---|
| `./zfs-mgr.sh start` | **Nis** panelin web ne prapavije ne portin 3000 dhe ngarkon modulet e ZFS |
| `./zfs-mgr.sh stop` | **Ndalon** panelin web dhe liron portin 3000 dhe proceset e lidhura |
| `./zfs-mgr.sh restart` | **Rinis** te gjithe sherbimin |
| `./zfs-mgr.sh status` | Kontrollon nese sherbimi eshte aktiv, shfaq PID dhe gjendjen e ARC |
| `./zfs-mgr.sh cli` | Hap menaxhuesin Python CLI ne terminal |
| `./zfs-mgr.sh wizard` | Nis Wizard-in interaktiv te konfigurimit te ZFS ne terminal |

---

## 4. Perdorimi i Mjeteve ne Shell Linux

### A. Python CLI (`zfs_manager.py`)
Mjeti ne Python mundeson komanda te shpejta administrative:
```bash
# Shfaq listen e pooleve
python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_manager.py pool list

# Shfaq statusin e detajuar te pool-it (VDEV, disqet, scrub)
python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_manager.py pool status tank-enterprise

# Shfaq statistikat e thelluara te ARC Cache (Hit Ratio, MRU, MFU, L2ARC)
python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_manager.py arc status

# Ndrysho kufirin maksimal te memorjes ARC ne kohe reale (p.sh. ne 32 GB)
python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_manager.py arc tune --max 34359738368

# Nis verifikimin e integritetit (Scrub) per nje pool
python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_manager.py scrub tank-enterprise --action start
```

### B. Interactive Terminal Wizard (`zfs_wizard.py`)
Nisni wizard-in per konfigurim te ri te sigurt:
```bash
./zfs-mgr.sh wizard
# ose
python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_wizard.py
```
Wizard-i ju pyet per:
1. Emrin e Pool-it dhe llogaritjen e `ashift=12` (4K sectors).
2. Nivelin e redundances (RAIDZ2, Mirror, RAIDZ1, RAIDZ3).
3. Pajisjet per pershpejtim: **SLOG (ZIL)** per shkrime sinkrone dhe **L2ARC** ne SSD/NVMe per lexim.
4. Karakteristikat e Dataset-it sipas llojit te aplikacionit (Database PostgreSQL 16K, VM 8K, Media 1M, kompresim zstd/lz4).

### C. Rust Metrics Engine
Motori ne Rust lexon drejtperdrejt nga `/proc/spl/kstat/zfs/arcstats`:
```bash
cd /root/zfs-enterprise-suite/linux_package/rust_engine
cargo run --release -- --json
```

---

## 5. Paneli Web Enterprise

Pasi ekzekutoni `./zfs-mgr.sh start`, hapni shfletuesin ne:
`http://SERVERI_JUAJ:3000`

Karakteristikat e Web Interface:
1. **Fleet & Capacity Dashboard**: Paneli kryesor me grafikun e perdorimit te memorjes ARC (Hit ratio %, MFU vs MRU), statusin e Pooleve, shpejtesine I/O dhe kontrollet e scrub.
2. **Pools & Topology Visualizer**: Struktura hierarkike e disqeve, VDEV (RAIDZ, Mirror, SLOG Log, Cache L2ARC, Special VDEV).
3. **Dataset & ZVOL Manager**: Modifikimi i vetive te kompresimit (zstd, lz4), recordsize, kuotave, atime, dedup dhe enkriptimit.
4. **ARC & L2ARC Tuning Studio**: Rregullimi interaktiv me sliders i `zfs_arc_max`, gjenerimi i skedarit `/etc/modprobe.d/zfs.conf`.
5. **Interactive Config Wizard ne Web**: Njesoj si ne CLI, krijoni dhe optimizoni konfigurime me 1 klikim.
6. **Integrimi i Info Box**: Cdo menu dhe koncept ne panel ka nje kutie informacioni te thelluar kur klikohet me mouse, qe shpjegon arkitekturen dhe praktikat me te mira!

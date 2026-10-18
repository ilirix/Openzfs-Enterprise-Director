#!/usr/bin/env python3
"""
OpenZFS Enterprise Director - Interactive Configuration Wizard
Konfigurues interaktiv per krijimin dhe optimizimin e Pooleve dhe Datasets ZFS.
"""

import sys
import os
import json
import time

def clear_screen():
    os.system('clear' if os.name == 'posix' else 'cls')

def print_header(title):
    print("\033[36m" + "="*70)
    print(f"  OPENZFS CONFIGURATION WIZARD :: {title}")
    print("="*70 + "\033[0m\n")

def prompt_choice(question, options, default_index=0):
    print(f"\033[1m{question}\033[0m")
    for idx, opt in enumerate(options):
        marker = " (Recommended)" if idx == default_index else ""
        print(f"  [{idx+1}] {opt}{marker}")
    while True:
        choice = input(f"\nZgjidh opsionin [1-{len(options)}] (Default: {default_index+1}): ").strip()
        if not choice:
            return default_index
        try:
            val = int(choice) - 1
            if 0 <= val < len(options):
                return val
            print("\033[31mZgjedhje e pavlefshme. Ju lutem provoni perseri.\033[0m")
        except ValueError:
            print("\033[31mShkruani nje numer te vlefshem.\033[0m")

def run_wizard():
    clear_screen()
    print_header("HAPI 1 / 5: IDENTIFIKIMI I POOL-IT DHE DISQEVE")
    
    print("Ky wizard do t'ju udheheqe ne konfigurimin me te mire per storage-in tuaj.\n")
    pool_name = input("Vendosni emrin e Pool-it (psh: pool-storage, fast-tank): ").strip()
    if not pool_name:
        pool_name = "tank0"
    
    ashift_idx = prompt_choice(
        "Zgjidhni vleren ashift (madhesia e sektorit fizik te diskut):",
        [
            "ashift=12 (Sektor 4KB - Rekomanduar per 99% te SSD/HDD moderne)",
            "ashift=13 (Sektor 8KB - Per disa NVMe te vecanta dhe SSD flash enterprise)",
            "ashift=9  (Sektor 512B - Vetem per disqe te vjetra mekanike legacy)"
        ],
        default_index=0
    )
    ashift_val = [12, 13, 9][ashift_idx]

    clear_screen()
    print_header("HAPI 2 / 5: TOPOLOGJIA E VDEV-VE DHE REDUNDANCA")
    
    topo_idx = prompt_choice(
        "Zgjidhni nivelin e mbrojtjes nga deshtimi i disqeve (VDEV Topology):",
        [
            "RAIDZ2 (Mbrojtje nga deshtimi i 2 disqeve njekohesisht - Ideale per HDD/SSD storage)",
            "MIRROR (Mirroring 2-way/3-way - Performanca me e larte IOPS per databaza dhe VM)",
            "RAIDZ1 (Mbrojtje nga 1 disk i deshtuar - E ngjashme me RAID-5)",
            "RAIDZ3 (Mbrojtje nga deshtimi i 3 disqeve njekohesisht - Per disqe shume te medha)",
            "STRIPE (Pa redundance - Vetem per caching ose temp scratchpad)"
        ],
        default_index=0
    )
    topo_names = ["raidz2", "mirror", "raidz1", "raidz3", "stripe"]
    topo_val = topo_names[topo_idx]

    clear_screen()
    print_header("HAPI 3 / 5: PERSHPEJTIMI I MEMORJES (SLOG & L2ARC)")
    
    print("ZFS mund te perdore disqe te shpejta NVMe/Optane per caching te avancuar:\n")
    slog_choice = prompt_choice(
        "Dëshironi të konfiguroni një Pajisje SLOG (Separate Intent Log - ZIL)?",
        [
            "Po, shto Mirror SLOG me NVMe (Pershpejton shkrimet sinkrone: NFS, DB, iSCSI)",
            "Jo, perdor logun default te pool-it ne disqet kryesore"
        ],
        default_index=1
    )
    
    l2arc_choice = prompt_choice(
        "Dëshironi të shtoni L2ARC (Kujtesë Cache e Leximit në NVMe/SSD)?",
        [
            "Po, shto NVMe si L2ARC Cache (Zgjeron ARC pertej RAM-it fizik)",
            "Jo, mjafton RAM-i fizik i sistemit"
        ],
        default_index=0
    )

    clear_screen()
    print_header("HAPI 4 / 5: DATASET PRESETS DHE COMPRESSION")
    
    workload_idx = prompt_choice(
        "Zgjidhni llojin kryesor te ngarkeses se punes (Workload Optimization):",
        [
            "General Enterprise Storage (recordsize=128K, compression=zstd, atime=off)",
            "Database Engine - PostgreSQL / MySQL / Oracle (recordsize=16K, compression=lz4)",
            "Virtual Machines & Hypervisor Images (recordsize=8K / 64K zvol, direct i/o)",
            "Media Streaming & Video Archives (recordsize=1M, compression=zstd-3)"
        ],
        default_index=0
    )
    
    compress_opts = ["zstd", "lz4", "zstd-3", "gzip-6", "off"]
    compress_idx = prompt_choice(
        "Algoritmi i kompresimit ne kohe reale (zero latency overhead):",
        [
            "zstd (Rekomanduar: Raport i larte kompresimi me CPU modern)",
            "lz4  (Shpejtesi ekstreme, gati zero ngarkese ne CPU)",
            "zstd-3 (Balancim i optimizuar per arkiva)",
            "off  (Pa kompresim)"
        ],
        default_index=0
    )
    chosen_compress = ["zstd", "lz4", "zstd-3", "off"][compress_idx]

    clear_screen()
    print_header("HAPI 5 / 5: PERMBLEDHJA DHE KOMANDAT E ZBATIMIT")
    
    print("\033[1mKonfigurimi i Zgjedhur:\033[0m")
    print(f"  • Emri i Pool-it:        \033[32m{pool_name}\033[0m")
    print(f"  • Madhesia Ashift:       \033[32m{ashift_val} (2^{ashift_val} = {2**ashift_val} bytes)\033[0m")
    print(f"  • Topologjia e VDEV:     \033[32m{topo_val.upper()}\033[0m")
    print(f"  • Kompresimi:            \033[32m{chosen_compress}\033[0m")
    print(f"  • SLOG ZIL:              \033[32m{'Aktiv (NVMe Mirror)' if slog_choice == 0 else 'Jo'}\033[0m")
    print(f"  • L2ARC Cache:           \033[32m{'Aktiv (NVMe Cache)' if l2arc_choice == 0 else 'Jo'}\033[0m")
    print(f"  • Atime:                 \033[32moff (Performance optimization)\033[0m")
    print("-" * 70)
    
    print("\033[1mKomandat Shell qe do te ekzekutohen ne Linux:\033[0m\n")
    pool_cmd = f"zpool create -o ashift={ashift_val} {pool_name} {topo_val} /dev/sdb /dev/sdc /dev/sdd /dev/sde"
    if slog_choice == 0:
        pool_cmd += " log mirror /dev/nvme0n1p1 /dev/nvme1n1p1"
    if l2arc_choice == 0:
        pool_cmd += " cache /dev/nvme2n1p1"
    
    print(f"  \033[33m# 1. Krijimi i Pool-it:\033[0m\n  {pool_cmd}\n")
    print(f"  \033[33m# 2. Optimizimi i Dataset-it Rrenje:\033[0m")
    print(f"  zfs set compression={chosen_compress} {pool_name}")
    print(f"  zfs set atime=off {pool_name}")
    print(f"  zfs set xattr=sa {pool_name}")
    print(f"  zfs set acltype=posixacl {pool_name}\n")
    
    confirm = input("A deshironi te ruani kete profil konfigurimi? (po/jo) [po]: ").strip().lower()
    if confirm in ["", "po", "p", "yes", "y"]:
        config_data = {
            "pool_name": pool_name,
            "ashift": ashift_val,
            "topology": topo_val,
            "compression": chosen_compress,
            "has_slog": slog_choice == 0,
            "has_l2arc": l2arc_choice == 0,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        out_file = "/etc/zfs-director/wizard_profile.json"
        try:
            os.makedirs(os.path.dirname(out_file), exist_ok=True)
            with open(out_file, "w") as f:
                json.dump(config_data, f, indent=2)
            print(f"\n\033[32m[OK] Konfigurimi u ruajt me sukses ne {out_file}\033[0m")
        except Exception:
            local_out = "./wizard_profile.json"
            with open(local_out, "w") as f:
                json.dump(config_data, f, indent=2)
            print(f"\n\033[32m[OK] Konfigurimi u ruajt ne {local_out}\033[0m")
        print("\033[36mJu mund ta aplikoni kete profil gjithashtu drejtperdrejt nga Paneli Web!\033[0m\n")

if __name__ == "__main__":
    run_wizard()

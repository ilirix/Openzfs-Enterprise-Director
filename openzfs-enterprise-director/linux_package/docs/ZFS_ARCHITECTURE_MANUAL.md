# OpenZFS Deep Technical & Architectural Reference Manual

Ky manual permbledh funksionalitetet e thelluara dhe te detajuara te teknologjise OpenZFS ne Linux.

---

## 1. Arkitektura e Kujteses ARC (Adaptive Replacement Cache)

ZFS nuk perdor page cache standard te Linux-it; ne vend te saj, implementon nje algoritem te patentuar nga Nimrod Megiddo dhe Dharmendra S. Modha: **ARC (Adaptive Replacement Cache)**.

### Mekanizmi i Brendshem:
1. **MRU (Most Recently Used)**: Ruan blloqet qe jane lexuar rishtazi. Nese nje bllok aksesohet serish ndersa eshte ne MRU, ai promovohet ne MFU.
2. **MFU (Most Frequently Used)**: Ruan blloqet qe aksesohen ne menyre te perseritur me shpeshsi te larte. Kjo siguron qe te dhenat vitale te qendrojne ne memorje pavaresisht skanimeve te medha sekuenciale.
3. **Ghost Lists (B1 & B2)**: Ruajne metadata per blloqet qe u eviktuan (larguan) nga RAM-i, per te mesuar nese duhet rritur pjesa e MRU apo e MFU.
4. **Target C**: Kufiri dinamik i kujteses qe ARC synon te konsumoje ne sistem pa shkaktuar presion ne OOM (Out-Of-Memory) killer.

### Parametrat Kryesore te Kernelit (`/sys/module/zfs/parameters/`):
- `zfs_arc_max`: Kufiri tavan maksimal i memorjes RAM (ne bytes). Rekomandimi: 50% deri 75% e RAM-it total te serverit.
- `zfs_arc_min`: Kufiri dysheme minimal nen te cilin ARC nuk pranon te tkurret.
- `zfs_arc_sys_free`: Sasia minimale e RAM-it qe ZFS le te lire per proceset e tjera te sistemit operativ.

---

## 2. L2ARC (Level 2 Adaptive Replacement Cache)

- **Qellimi**: Shtrese e dyte e leximit e vendosur ne disqe SSD ose NVMe me kosto me te ulet per gigabyte se sa RAM-i.
- **Rregulli i Artë**: Cdo 1GB L2ARC kerkon rreth 70MB RAM ne ARC per te mbajtur header-at e indekseve. Prandaj, nuk keshillohet L2ARC shume i madh nese serveri ka RAM te paket.
- **Parametra**:
  - `l2arc_write_max`: Shpejtesia maksimale e mbushjes se L2ARC (default 8MB/s per te ruajtur jetegjatesine e SSD). Per NVMe moderne, rekomandohet rritja ne 100MB/s - 250MB/s.
  - `l2arc_noprefetch`: Ne vleren `0` lejon futjen e te dhenave prefetch ne L2ARC.

---

## 3. SLOG dhe ZIL (Separate Intent Log & ZFS Intent Log)

- **ZIL**: Cdo shkrim sinkron (`O_SYNC`, PostgreSQL `fsync`, transaksione databaze, NFS) duhet te garantohet ne disk para kthimit te pergjigjes (ACK) te klientit.
- **SLOG**: Zhvendos shkrimet e ZIL-it ne nje pajisje te dedikuar me latence ultra-te-ulet (Optane ose NVMe me mbrojtje nga humbja e energjise PLP).
- **Kujdes**: SLOG nuk eshte cache shkrimi per gjithe pool-in; ai eshte vetem nje regjister urgjence per shkrimet sinkrone ne rast fikjeje te papritur te rrymes.

---

## 4. Special Metadata VDEV

- Ne versionet moderne te OpenZFS (0.8+ dhe 2.0+), lejohet shtimi i `special` VDEV.
- Ai ruan:
  1. Te gjitha **metadatat** e skedareve (inodes, pemen e direktorive).
  2. Blloqet e vogla te te dhenave (p.sh. `special_small_blocks=32K` ose `16K`).
- Kjo ofron pershpejtim te menjehershem deri ne 500% per operacione si `ls -la`, kërkime `find`, ose databaza me rekorde te vogla.

---

## 5. Zgjedhja e Ashift dhe Recordsize

- **Ashift**:
  - `ashift=9` -> $2^9 = 512$ bytes (Disqe antike).
  - `ashift=12` -> $2^{12} = 4096$ bytes (4KB - Standardi i detyruar per SSD/NVMe dhe HDD moderne Advanced Format).
  - `ashift=13` -> $2^{13} = 8192$ bytes (8KB - Disqe te caktuara flash me faqe 8K).
  *Vini re: Vlera `ashift` vendoset vetem gjate krijimit te pool-it dhe nuk mund te ndryshohet me vone!*

- **Recordsize per Datasets**:
  - PostgreSQL: `recordsize=16K` (perputhet me faqet 8K/16K te Postgres, parandalon Read-Modify-Write amplification).
  - MySQL InnoDB: `recordsize=16K`.
  - Virtual Machines (KVM/QEMU zvols): `volblocksize=8K` ose `16K`.
  - Ruajtje e zakonshme / Video / ISO: `recordsize=1M` (maksimizon raportin e kompresimit dhe throughput).

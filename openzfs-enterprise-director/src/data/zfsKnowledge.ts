import { InfoBoxTopic } from '../types/zfs';

export const ZFS_KNOWLEDGE_BASE: Record<string, InfoBoxTopic> = {
  dashboard: {
    id: 'dashboard',
    title: 'Paneli Qendror & Telemetria e OpenZFS (Fleet Overview)',
    subtitle: 'Monitorim ne kohe reale i shendetit te disqeve, integritetit te te dhenave dhe performnaces se kujteses',
    summary:
      'Paneli qendror ofron nje pamje te unifikuar te te gjithe storage cluster-it. Ai tregon kapacitetin total, statusin e integritetit (Scrub), shpejtesine e IOPS dhe efikasitetin e kujteses kryesore ARC (Adaptive Replacement Cache).',
    keyConcepts: [
      {
        label: 'Integriteti i te dhenave (Self-Healing)',
        description:
          'ZFS llogarit checksums (fletcher4 ose sha256) per cdo bllok te dhenash. Nese zbulohet demtim i heshtur i te dhenave (Silent Bit-Rot), ZFS e riparon automatikisht nga kopjet redundante gjate leximit ose scrub-it.',
      },
      {
        label: 'ARC Hit Ratio',
        description:
          'Perqindja e leximeve qe plotesohen drejtperdrejt nga memorja RAM me latence nen 1 mikrosekonde pa prekur disqet fizike. Vlerat mbi 90% konsiderohen optimale per servera enterprise.',
      },
      {
        label: 'Fragmentimi (Pool Fragmentation)',
        description:
          'Mat shperndarjen e hapesires se lire ne disqe. Ne arkitekturen Copy-on-Write, fragmentimi menaxhohet me spatiale te larta dhe recomandohet te mbahet pool-i nen 80-85% te mbushjes.',
      },
    ],
    shellCommands: [
      'zpool list -v',
      'zpool status -x',
      'arcstat 1 5',
      'zpool iostat -v 1 3',
    ],
    bestPractices: [
      'Mos lejoni qe nje pool te kaloje 80-85% te kapacitetit maksimal per te shmangur fragmentimin e hapesires se lire.',
      'Planifikoni nje Scrub automatik te pakten 1 here ne muaj per disqe enterprise ose 1 here ne jave per disqe komerciale.',
      'Monitoroni raportin e ARC Hit Ratio per te pare nese nevojitet shtim i RAM-it ose vendosje e L2ARC SSD.',
    ],
    architectureNote:
      'OpenZFS unifikon shtresen e File System me ate te Volume Manager (SPA - Storage Pool Allocator), duke eliminuar nevojen per RAID harduerik dhe fsck.',
  },

  pools: {
    id: 'pools',
    title: 'Menaxhimi i Pooleve & Topologjia e VDEV-ve (ZPOOL Architecture)',
    subtitle: 'Arkitektura e grupeve te disqeve, llojet e redundances dhe pershpejtuesit e dedikuar',
    summary:
      'Storage Pool (zpool) eshte themeli i ZFS. Ai perbehet nga Virtual Devices (VDEV). Nje pool zgjerohet duke shtuar VDEV te reja. ZFS ben balancim automatik te shkrimeve mes VDEV-ve dinamikisht sipas hapesires se lire.',
    keyConcepts: [
      {
        label: 'Ashift (Madhesia e Sektorit Fizik)',
        description:
          'ashift=12 tregon madhesi sektori 4096 bytes (4KB). Kjo eshte kritike per SSD, NVMe dhe disqet moderne Advanced Format (AF). Nese vendoset gabimisht ashift=9 (512B), shkaktohet Write Amplification dhe renie e rendesishme e shpejtesise.',
      },
      {
        label: 'VDEV Types (Mirror vs RAIDZ)',
        description:
          'Mirror (2-way ose 3-way) ofron IOPS maksimale dhe kohe me te shkurter resilvering. RAIDZ2 (ngjashem me RAID-6) toleron humbjen e 2 disqeve dhe eshte standardi i arte per kapacitet te madh te sigurt.',
      },
      {
        label: 'SLOG ZIL (Separate Intent Log)',
        description:
          'Pajisje SSD/NVMe me latence te ulet dhe mbrojtje nga nderprerja e rrymes (PLP) per te shkruar logun sinkron ZIL. Ndikon drejtperdrejt ne performancen e NFS, iSCSI dhe transaksioneve te databazave.',
      },
      {
        label: 'L2ARC (Level 2 Cache)',
        description:
          'Kujtese e dyte e leximit ne SSD/NVMe per zgjerimin e ARC-it te RAM-it. Blloqet e eviktuara nga RAM ruhen ne L2ARC per lexim te shpejte.',
      },
      {
        label: 'Special VDEV (Metadata & Small Blocks)',
        description:
          'VDEV e dedikuar me NVMe me shpejtesi te larte qe ruan pemen e metadatave (inodes) dhe blloqet e vogla te te dhenave (p.sh. <= 16KB/32KB), duke pershpejtuar operacionet me skedare deri ne 500%.',
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
      'Vendosni gjithmone ashift=12 kur krijoni pool te ri. Ky parameter nuk mund te ndryshohet me vone!',
      'Per SLOG, perdorni gjithmone pajisje SSD Enterprise me Power Loss Protection (PLP) ne konfigurim Mirror.',
      'Disqet e pool-it nuk duhet te menaxhohen nga Hardware RAID controller (HBA duhet te jete ne IT Mode).',
    ],
    architectureNote:
      'Humbja e nje VDEV te vetme te dhenash pa redundance shkakton humbjen e gjithe pool-it. Prandaj redundanca (Mirror ose RAIDZ2/3) eshte e domosdoshme ne nivel VDEV.',
  },

  datasets: {
    id: 'datasets',
    title: 'Datasets & ZVOLs (Hierarkia e Skedareve dhe Disqeve Virtuale)',
    subtitle: 'Konfigurimi granular i vetive te kompresimit, madhesise se rekordit, kuotave dhe enkriptimit',
    summary:
      'Datasets ne ZFS funksionojne si filesystem-e te lehta (lightweight) brenda nje pool-i, me veti te pavarura. ZVOLs jane pajisje bllok (block devices) qe perdoren per Virtual Machines (KVM/QEMU), iSCSI targets ose volumet RAW.',
    keyConcepts: [
      {
        label: 'Recordsize Optimization',
        description:
          'Madhesia maksimale e bllokut per skedar. Standardi eshte 128KB. Per PostgreSQL dhe MySQL InnoDB vendoset 16KB per te perputhur madhesine e faqes se motorit te databazes. Per media te medha (video, backups), 1MB maksimizon shpejtesine dhe kompresimin.',
      },
      {
        label: 'Kompresimi ne Kohe Reale (zstd / lz4)',
        description:
          'ZFS kompreson cdo bllok para se ta shkruaje ne disk. lz4 eshte ultra-i shpejte me zero ngarkese te CPU. zstd ofron raport shume me te larte kompresimi (1.8x-2.5x) duke kursyer hapesire dhe rritur throughput-in e I/O.',
      },
      {
        label: 'Deduplication (DDT)',
        description:
          'Eliminon blloqet e dublikuara te te dhenave. Kujdes: Dedup kerkon afersisht 5GB RAM ne tabele DDT per cdo 1TB te dhena te dedupikuara. Nese nuk ka mjaftueshem RAM, performanca bie ndjeshem.',
      },
      {
        label: 'Native Encryption (AES-256-GCM)',
        description:
          'Kriptim vendas ne nivel blloku i integruar ne ZFS pa nevoje per dm-crypt/LUKS. Mundeson replikim te sigurt te enkriptuar (raw send/recv) drejt serverave te jashtem pa pasur celesin ne destinacion.',
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
      'Aktivizoni gjithmone atime=off per te eliminuar shkrimet e panevojshme te metadatave ne cdo lexim skedari.',
      'Perdorni kompresim zstd ose lz4 ne te gjitha dataset-et. Shpesh leximi i te dhenave te kompresuara eshte me i shpejte se i atyre te pakompresuara per shkak te reduktimit te I/O fizike.',
      'Perdorni ZVOL vetem kur nevojitet bllok storage (VM disks). Per storage skedaresh perdorni gjithmone ZFS filesystem.',
    ],
    architectureNote:
      'Vetite ne ZFS trashegohen hierarkikisht nga dataseti prind te datasetet femije, pervec rasteve kur specifikohet ndryshe ne nivel lokal.',
  },

  arc: {
    id: 'arc',
    title: 'Arkitektura e Kujteses ARC & L2ARC Cache Studio',
    subtitle: 'Analize e thelluar e algoritmit Adaptive Replacement Cache dhe rregullimi i parametrave te kernelit',
    summary:
      'ARC (Adaptive Replacement Cache) eshte zemra e performancave ne ZFS. Ndryshe nga algoritmet e thjeshta LRU (Least Recently Used), ARC mban ne menyre dinamike balancen mes te dhenave te aksesuar rishtazi (MRU) dhe atyre me frekuence me te larte perdorimi (MFU).',
    keyConcepts: [
      {
        label: 'MRU (Most Recently Used)',
        description:
          'Kujtesa per blloqet e lexuara se fundmi. Parandalon qe skanime te medha sekuenciale te fshijne te dhenat kritike te shpeshta nga memorja.',
      },
      {
        label: 'MFU (Most Frequently Used)',
        description:
          'Kujtesa per blloqet qe aksesohen me shpeshsi te vazhdueshme (hot data). Blloqet ne MFU mbrohen per te ruajtur latencat me te uleta.',
      },
      {
        label: 'Kufizimi i Madhesise (zfs_arc_max / c_max)',
        description:
          'Parametri i kernelit qe percakton tavanin maksimal te RAM-it per ZFS. Ne nje server me 64GB RAM, vlera tipike eshte 32GB-48GB, duke lene memorje te mjaftueshme per aplikacionet dhe OS.',
      },
      {
        label: 'L2ARC Write Throttling',
        description:
          'Parametri l2arc_write_max kontrollon shpejtesine me te cilen ZFS mbush SSD-ne e cache-it per te parandaluar konsumimin e parakoheshem te cellules flash.',
      },
    ],
    shellCommands: [
      'cat /proc/spl/kstat/zfs/arcstats',
      'echo 34359738368 > /sys/module/zfs/parameters/zfs_arc_max',
      'arc_summary',
      'arcstat -f time,read,hit%,hits,miss,l2read,l2hit% 1',
    ],
    bestPractices: [
      'Mos vendosni zfs_arc_max me shume se 75% te RAM-it total nese serveri ekzekuton sherbime te tjera intensive si KVM ose PostgreSQL.',
      'Cdo 1GB L2ARC kerkon afersisht 70MB RAM ne ARC per header-at e indekseve. Sigurohuni qe keni mjaftueshem RAM para se te shtoni L2ARC shume te madh.',
      'Konfiguroni parametrat ne /etc/modprobe.d/zfs.conf per te mbetur aktive pas cdo rindezjeje (reboot) te serverit.',
    ],
    architectureNote:
      'OpenZFS monitoron vazhdimisht presionin e memorjes te sistemit operativ Linux. Kur sistemi kerkon memorje per proceset e perdoruesit, ARC tkurret vullnetarisht per te shmangur OOM Killer.',
  },

  snapshots: {
    id: 'snapshots',
    title: 'Snapshots, Clones & Replikimi i Avancuar (CoW Lifecycle)',
    subtitle: 'Kopje casti atomike, rollback i menjehershem dhe transmetim inkremental send/receive',
    summary:
      'Snapshot-et ne ZFS jane kopje atomike te castit qe krijohen ne zero kohe (nen 1 milisekunde) dhe nuk konsumojne hapesire shtese fillimisht per shkak te arkitektures Copy-on-Write (CoW). Vetem blloqet e modifikuara me vone zene hapesire.',
    keyConcepts: [
      {
        label: 'Zero Overhead Snapshots',
        description:
          'Krijimi i nje snapshot-i vetem ngrin pemen e blloqeve ekzistuese. Asnje e dhene nuk kopjohet fizikisht ne momentin e krijimit.',
      },
      {
        label: 'Rollback i Menjehershem',
        description:
          'Kthen dataset-in fiks ne gjendjen e sakte te snapshot-it, duke zhbere cdo modifikim te metejshem ne me pak se 1 sekonde, pavaresisht madhesise se te dhenave.',
      },
      {
        label: 'Clones (Klonimi i Shkrueshem)',
        description:
          'Krijon nje filesystem te ri te shkrueshem nga nje snapshot me zero kosto hapesire. Shume i dobishem per testimin e bazave te te dhenave dhe zhvillim.',
      },
      {
        label: 'Incremental Replication (zfs send / zfs recv)',
        description:
          'Transmeton vetem blloqet binare qe kane ndryshuar mes dy snapshot-eve permes SSH ose rrjetit, me shpejtesi maksimale dhe kompresim te ruajtur.',
      },
    ],
    shellCommands: [
      'zfs snapshot tank/databases@snap-2026-10-11',
      'zfs rollback -r tank/databases@snap-2026-10-11',
      'zfs clone tank/databases@snap-2026-10-11 tank/databases-dev',
      'zfs send -i @snap-1 @snap-2 tank/data | ssh backup-srv zfs recv backup/data',
    ],
    bestPractices: [
      'Automatizoni politikat e snapshot-eve: p.sh. cdo 1 ore (mbaj 24), cdo dite (mbaj 7), cdo jave (mbaj 4).',
      'Mos lejoni snapshot-e shume te vjetra te harruara ne dataset-e me volum te larte shkrimesh, sepse ato parandalojne lirimin e hapesires se fshire.',
      'Perdorni "zfs send -R" per te replikuar te gjithe hierarkine e datasets dhe vetive te tyre.',
    ],
    architectureNote:
      'Transmetimi zfs send eshte stream binar i nivelit te blloqeve, duke garantuar saktesi 100% dhe duke shmangur ngadalesine e rsync me miliona skedare te vegjel.',
  },

  wizard: {
    id: 'wizard',
    title: 'Konfiguruesi Interaktiv (ZFS Configuration Wizard)',
    subtitle: 'Ndertim i automatizuar i konfigurimeve optimale sipas ngarkeses se punes',
    summary:
      'Wizard-i ndihmon administratoret te konfigurojne poole dhe datasets te reja pa rrezikun e gabimeve me parametra kritikë si ashift, recordsize dhe llojin e VDEV-ve. Funksionon njelloj si ne terminal CLI ashtu edhe ne panelin Web.',
    keyConcepts: [
      {
        label: 'Validimi i Parametrave',
        description:
          'Parandalon krijimin e pooleve me ashift=9 ne disqe moderne dhe sugjeron topologjine me te sigurt per sasine e disqeve ne dispozicion.',
      },
      {
        label: 'Parapergatitja e Workload-it',
        description:
          'Konfiguron automatikisht recordsize=16k per Postgres/MySQL, 8k per VM ZVOLs dhe 1M per video/backups.',
      },
      {
        label: 'Gjenerimi i Skripteve Shell',
        description:
          'Pervec aplikimit te menjehershem, shfaq komandat e sakta te zpool dhe zfs per dokumentacion dhe auditim.',
      },
    ],
    shellCommands: [
      './zfs-mgr.sh wizard',
      'python3 /root/zfs-enterprise-suite/linux_package/python_cli/zfs_wizard.py',
    ],
    bestPractices: [
      'Perdorni wizard-in per konfigurime te reja per te siguruar perputhje me standardet enterprise.',
      'Rishikoni komandat e gjeneruara para zbatimit perfundimtar ne prodhim.',
    ],
    architectureNote:
      'Profili i ruajtur mund te ripërdoret ne servera te tjere permes skedarit /etc/zfs-director/wizard_profile.json.',
  },

  terminal: {
    id: 'terminal',
    title: 'Terminali i Integruar & Shell Console',
    subtitle: 'Ekzekutim i drejtperdrejte i komandave ZFS dhe kstat ne kohe reale',
    summary:
      'Konsola e integruar lejon ekzekutimin e te gjitha komandave zyrtare te OpenZFS (zpool, zfs, arcstat, zdb, arc_summary) me butona te shpejte per komandat me te perdorura diagnostikuese.',
    keyConcepts: [
      {
        label: 'Kernel Introspection (kstat)',
        description:
          'Akses i drejtperdrejte ne statistikat e modulit te kernelit ne /proc/spl/kstat/zfs/ per diagnostikim te hollesishem.',
      },
      {
        label: 'I/O Telemetry (zpool iostat)',
        description:
          'Mat latencen, banden dhe numrin e operacioneve te leximit/shkrimit ne sekonde per cdo disk dhe VDEV.',
      },
    ],
    shellCommands: [
      'zpool iostat -v 1',
      'zpool status -v',
      'zfs list -o space',
      'arc_summary',
    ],
    bestPractices: [
      'Perdorni "zpool status -v" per te pare saktesisht nese ndonje skedar eshte prekur nga korruptimi i te dhenave.',
      'Shmangni perdorimin e zdb ne poole te ngarkuara prodhimi nese nuk eshte e domosdoshme per riparime te thella.',
    ],
    architectureNote:
      'Konsola lidhet permes REST API tek serveri lokal duke garantuar pergjigje te shpejta dhe regjistrim te sakte te logjeve.',
  },

  reports: {
    id: 'reports',
    title: 'Raportet Diagnostikuese & Benchmarking ne Kohe Reale',
    subtitle: 'Matja e xhiros IOPS, latences dhe verifikimi i integritetit historik me Scrub',
    summary:
      'Ky modul mundeson testimin e drejtperdrejte te performances se storage pool-it (Sequential MB/s, 4K Random IOPS, Latence mesatare dhe ARC Hit Ratio) si dhe ruan historikun e auditeve te integritetit te disqeve fizike dhe scrub-it.',
    keyConcepts: [
      {
        label: 'Matja e IOPS & Latences',
        description:
          'Krahason shpejtesine e leximit nga ARC RAM (latence < 0.2ms) kundrejt shkrimeve sinkrone ne disqet fizike dhe SLOG ZIL NVMe.',
      },
      {
        label: 'Integriteti Historik & Bit-Rot',
        description:
          'Regjistron cdo gabim te zbuluar dhe te riparuar automatikisht permes Fletcher4 checksums gjate procesit periodik zpool scrub.',
      },
      {
        label: 'Eksportimi i Raporteve (Audit Ready)',
        description:
          'Mundeson shkarkimin e menjehershem te raportit te plote ne format Markdown ose tekst per certifikim dhe auditim te infrastruktures.',
      },
    ],
    shellCommands: [
      'zpool iostat -v 1 5',
      'fio --name=zfs-bench --rw=randwrite --bs=4k --size=1G',
      'zpool scrub -s tank',
      'smartctl -x /dev/nvme0n1',
    ],
    bestPractices: [
      'Ekzekutoni testet e ngarkeses (stress test) gjate periudhave me trafik te ulet per te mos ndikuar aplikacionet e prodhimit.',
      'Krahasoni rezultatet e testit para dhe pas shtimit te pajisjeve SLOG ose L2ARC per te verifikuar fitimin e performances.',
    ],
    architectureNote:
      'OpenZFS optimizon shkrimet permes transaksioneve TXG (Transaction Groups) qe grupohen cdo 5 sekonda, duke konvertuar shkrime te shperndara rastesore ne shkrime sekuenciale me throughput te larte.',
  },

  deployment: {
    id: 'deployment',
    title: 'Paketa e Instalimit & Kontrolli i Sherbimit (/root/zfs-enterprise-suite)',
    subtitle: 'Struktura e plote ne Linux, script-i unik zfs-mgr.sh dhe sherbimi automatik Systemd',
    summary:
      'Gjithe suita eshte e organizuar per tu vendosur ne dosjen /root/zfs-enterprise-suite/. Ajo permban script-in unik te kontrollit zfs-mgr.sh per te startuar, ndaluar dhe rinisur sherbimin me nje komande te vetme, se bashku me modulet ne Python dhe Rust.',
    keyConcepts: [
      {
        label: 'Script-i Unik zfs-mgr.sh',
        description:
          'Zevendeson menaxhimin e komplikuar: ./zfs-mgr.sh start nis gjithcka ne prapavije, ./zfs-mgr.sh stop ndalon te gjithe proceset dhe liron portat.',
      },
      {
        label: 'Struktura Multi-Language (Python & Rust)',
        description:
          'Python perdoret per logjiken administrative, CLI dhe Wizard-in; Rust perdoret per motorin e llogaritjes me latence sub-milisekond te statistikave te ARC nga kernel-i.',
      },
      {
        label: 'Systemd Integration',
        description:
          'Regjistron zfs-enterprise.service per nisje automatike ne boot te serverit Linux pas ngarkimit te zfs.target.',
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
      'Gjithmone verifikoni statusin e sherbimit me ./zfs-mgr.sh status para dhe pas ndryshimeve te konfigurimit.',
      'Krijoni nje kopje rezervë te skedarit zfs_state.json perpara modifikimeve madhore ne mjedise testuese.',
    ],
    architectureNote:
      'Paketa eshte krejtesisht e pavarur dhe e vetembajtshme (self-contained), e gatshme per tu vendosur ne Ubuntu, Debian, Proxmox ose RHEL.',
  },

  logs: {
    id: 'logs',
    title: 'Regjistrat e Sistemit & ZED Daemon (ZFS Event Daemon)',
    subtitle: 'Auditimi i eventeve te kernelit zfs.ko, diagnostikimi i gabimeve te I/O dhe monitorimi proaktiv SMART',
    summary:
      'ZFS Event Daemon (ZED) dhe moduli i kernelit zfs.ko gjenerojne regjistra te detajuar per cdo ndryshim ne topologji, txg sync, gabime checksum dhe operacione scrub/trim. Paneli i logeve ofron transmetim ne kohe reale dhe filtra te avancuar per zgjidhjen e shpejte te problemeve.',
    keyConcepts: [
      {
        label: 'ZED (ZFS Event Daemon)',
        description:
          'Monitoron eventet nga /dev/zfs (sysevent dhe ereport). Kur ndodh nje gabim disku, ZED mund te nise automatikisht zevendesimin me Hot Spare ose te dergoje njoftime me email administratorit.',
      },
      {
        label: 'Checksum Ereports & Self-Healing',
        description:
          'Kur zbulohet nje bllok i korruptuar, kernel-i regjistron nje ereport.fs.zfs.checksum, riparon te dhenat nga kopja pasqyre ose pariteti dhe e njofton ZED per auditim pa nderprere sherbimin.',
      },
      {
        label: 'SMART Daemon (smartd)',
        description:
          'Kontrollon parametrat kritike te harduerit (temperature, ore pune, reallocated sectors, NVMe TBW wear) perpara se disku te deshtoje teresisht.',
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
      'Aktivizoni zed.service ne cdo server OpenZFS per monitorim te vazhdueshem ne prapavije.',
      'Perdorni auto-refresh gjate ekzekutimit te benchmark-eve ose resilvering-ut per te pare impaktin ne latence.',
      'Eksportoni regjistrat periodikisht ne format JSON ose .log per arkivim dhe audite sigurie.',
    ],
    architectureNote:
      'ZFS integron eventet drejtperdrejt me Linux kernel tracing dhe systemd-journald, duke mundesuar korelacion te plote mes performnaces se storage-it dhe shendetit te pajisjeve.',
  },

  scheduler: {
    id: 'scheduler',
    title: 'Planifikuesi i ZFS Scrub & Dritaret e Mirembajtjes (Cron & Systemd)',
    subtitle: 'Auditimi i rregullt i integritetit te dhenave pa impaktuar punen e perdoruesve',
    summary:
      'Scrubbing eshte procesi ku OpenZFS lexon cdo bllok te dhenash ne pool dhe verifikon checksum-in Fletcher4 ose SHA-256. Planifikimi permes Cron ose systemd timers siguron qe verifikimi te kryhet automatikisht gjate oreve me pak trafik (02:00 - 08:00 UTC).',
    keyConcepts: [
      {
        label: 'Dritaret e Mirembajtjes (Maintenance Windows)',
        description:
          'Kufizojne ekzekutimin e procesit te rende te scrub-it vetem brenda oreve me trafik te ulet (nate ose fundjave) per te mbrojtur IOPS-at e prodhimit.',
      },
      {
        label: 'Auto-Pause & Throttle',
        description:
          'ZFS lejon ndalimin e perkohshem me `zpool scrub -p` dhe rifillimin automatik. Nese ngarkesa e CPU/diskut kalon pragun, scheduler-i e pauzon procesin.',
      },
      {
        label: 'Frekuenca e Rekomanduar',
        description:
          'Per disqe magnetike (HDD): Cdo 1 deri 2 jave. Per disqe SSD/NVMe: Cdo muaj (per shkak te mungeses se levizjes mekanike dhe konsumimit te flash-it).',
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
      'Mos ekzekutoni scrub ne me shume se nje pool njekohesisht nese ndajne te njejten kontrolere SAS.',
      'Vendosni kohezgjatje maksimale (maxDurationHours) per te ndaluar scrub-in perpara fillimit te orarit te punes se biznesit.',
      'Inspektoni rregullisht raportin e kohezgjatjes se scrub-eve per te dalluar heret disqet qe po degradojne.',
    ],
    architectureNote:
      'ZFS scrub kryhet teresisht ne prapavije (background) me prioritet te ulet I/O, por ne disqe magnetike me shume fragmente mund te rrise latencen e leximeve rastesore.',
  },
};


import { InfoBoxTopic, Language } from '../types/zfs';
import { ZFS_KNOWLEDGE_BASE } from './zfsKnowledge';
import { ZFS_KNOWLEDGE_BASE_EN } from './zfsKnowledge.en';

type TopicText = Omit<InfoBoxTopic, 'shellCommands'>;

const es: Record<string, TopicText> = {
  dashboard: {
    id: 'dashboard',
    title: 'Vista de la flota y telemetría OpenZFS',
    subtitle: 'Supervisión en vivo del estado de los discos, la integridad y la caché',
    summary:
      'El panel principal es una vista única del clúster de almacenamiento. Muestra la capacidad total, la integridad del scrub, los IOPS y la eficiencia con la que la Adaptive Replacement Cache (ARC) usa la RAM.',
    keyConcepts: [
      { label: 'Integridad con autorreparación', description: 'ZFS calcula un checksum (Fletcher4 o SHA-256) de cada bloque. Si detecta bit-rot silencioso, repara el bloque desde una copia redundante durante una lectura o un scrub.' },
      { label: 'Tasa de aciertos de ARC', description: 'Porcentaje de lecturas servidas desde la RAM, con latencia inferior a un microsegundo, sin tocar los discos. Por encima del 90% es lo habitual en un servidor en buen estado.' },
      { label: 'Fragmentación del pool', description: 'Cómo se reparte el espacio libre. El copy-on-write tolera la fragmentación, pero el pool debe quedarse por debajo del 80–85% de ocupación.' },
    ],
    bestPractices: [
      'Mantenga cada pool por debajo del 80–85% para que la asignación de espacio libre siga siendo rápida.',
      'Programe un scrub al menos una vez al mes en discos enterprise, o una vez a la semana en discos de consumo.',
      'Observe la tasa de aciertos de ARC para decidir si hace falta más RAM o un dispositivo L2ARC.',
    ],
    architectureNote: 'OpenZFS une el sistema de archivos y el gestor de volúmenes (Storage Pool Allocator), así que no hace falta RAID por hardware ni un fsck aparte.',
  },
  pools: {
    id: 'pools',
    title: 'Pools y topología VDEV (arquitectura ZPOOL)',
    subtitle: 'Grupos de discos, redundancia y aceleradores dedicados',
    summary: 'Un storage pool (zpool) es la base de ZFS. Se construye con dispositivos virtuales (VDEV). El pool crece al añadir VDEV. ZFS reparte las escrituras entre esos VDEV según el espacio libre.',
    keyConcepts: [
      { label: 'ashift (tamaño de sector físico)', description: 'ashift=12 significa sectores de 4096 bytes. Es el valor correcto para SSD, NVMe y discos Advanced Format. ashift=9 (512 bytes) en esos discos provoca amplificación de escritura. ashift no se puede cambiar después de crear el pool.' },
      { label: 'Tipos de VDEV (mirror y RAIDZ)', description: 'Un mirror de 2 o 3 vías da los IOPS más altos y el resilver más corto. RAIDZ2 (parecido a RAID-6) sobrevive a dos fallos de disco y es la opción habitual para mucha capacidad segura.' },
      { label: 'SLOG / ZIL', description: 'Un SSD o NVMe de baja latencia, con protección ante corte de energía, que guarda el registro de intención síncrono. Afecta a NFS, iSCSI y a la latencia de commit de las bases de datos.' },
      { label: 'L2ARC', description: 'Caché de lectura en SSD o NVMe que amplía la ARC de la RAM. Los bloques expulsados de la RAM aún pueden servirse desde L2ARC.' },
      { label: 'VDEV special', description: 'Un VDEV NVMe rápido que guarda el árbol de metadatos y los bloques pequeños (por ejemplo 16 KB o 32 KB o menos) y puede acelerar varias veces las cargas con muchos archivos.' },
    ],
    bestPractices: [
      'Use siempre ashift=12 al crear un pool. Esta propiedad no se puede cambiar después.',
      'Para el SLOG, use un SSD enterprise con protección ante corte de energía, en mirror.',
      'No ponga los discos del pool detrás de un controlador RAID por hardware. El HBA debe estar en modo IT.',
    ],
    architectureNote: 'Perder un único VDEV de datos sin redundancia destruye todo el pool. La redundancia (mirror o RAIDZ2/3) va en cada VDEV de datos.',
  },
  datasets: {
    id: 'datasets',
    title: 'Datasets y ZVOL',
    subtitle: 'Compresión, tamaño de registro, cuotas y cifrado por dataset',
    summary: 'Un dataset es un sistema de archivos ligero dentro de un pool, con propiedades propias. Un ZVOL es un dispositivo de bloques para máquinas virtuales (KVM/QEMU), destinos iSCSI o volúmenes RAW.',
    keyConcepts: [
      { label: 'Tamaño de registro', description: 'Tamaño máximo de bloque de un archivo. El valor por defecto es 128 KB. Use 16 KB para PostgreSQL y MySQL InnoDB, para coincidir con la página de la base de datos. Use 1 MB para medios grandes y copias de seguridad.' },
      { label: 'Compresión en línea (zstd / lz4)', description: 'ZFS comprime cada bloque antes de escribirlo. lz4 es muy rápido y casi no usa CPU. zstd comprime más (a menudo 1,8x–2,5x), ahorra espacio y puede subir el rendimiento de E/S.' },
      { label: 'Deduplicación (DDT)', description: 'Elimina bloques duplicados. La tabla de deduplicación necesita unos 5 GB de RAM por cada 1 TB deduplicado. Sin esa RAM, el rendimiento cae con fuerza.' },
      { label: 'Cifrado nativo (AES-256-GCM)', description: 'Cifrado por bloques integrado en ZFS, sin dm-crypt ni LUKS. Un envío raw puede replicar el texto cifrado a un host que no tiene la clave.' },
    ],
    bestPractices: [
      'Ponga atime=off para que cada lectura no reescriba metadatos.',
      'Active lz4 o zstd. Los datos comprimidos a menudo se leen más rápido porque el disco mueve menos bytes.',
      'Use un ZVOL solo cuando necesite un dispositivo de bloques. Para archivos, use un dataset ZFS.',
    ],
    architectureNote: 'Los datasets hijos heredan las propiedades del padre, salvo que una propiedad se fije en el hijo.',
  },
  arc: {
    id: 'arc',
    title: 'Arquitectura de caché ARC y L2ARC',
    subtitle: 'Cómo funciona la Adaptive Replacement Cache y qué límites del kernel fijar',
    summary: 'La ARC es la caché principal de rendimiento de ZFS. A diferencia de un LRU simple, mantiene un equilibrio entre los datos usados hace un momento (MRU) y los datos usados a menudo (MFU).',
    keyConcepts: [
      { label: 'MRU (usados más recientemente)', description: 'Guarda los bloques leídos hace poco. Un escaneo secuencial grande no debería expulsar de la RAM los datos que se usan con frecuencia.' },
      { label: 'MFU (usados con más frecuencia)', description: 'Guarda los bloques que se leen una y otra vez. Esos bloques quedan protegidos para que la latencia siga baja.' },
      { label: 'Tope de tamaño (zfs_arc_max)', description: 'Límite del kernel sobre cuánta RAM puede usar ZFS. En un host de 64 GB, 32–48 GB es un tope habitual, y deja sitio al sistema y a las aplicaciones.' },
      { label: 'Límite de escritura de L2ARC', description: 'l2arc_write_max limita la velocidad a la que ZFS llena el SSD de caché, para no desgastar la flash con escrituras de caché.' },
    ],
    bestPractices: [
      'No ponga zfs_arc_max por encima de un 75% de la RAM si el host también ejecuta KVM o PostgreSQL.',
      'Cada 1 GB de L2ARC necesita unos 70 MB de RAM de ARC para las cabeceras del índice. Añada RAM antes de un L2ARC muy grande.',
      'Guarde los límites en /etc/modprobe.d/zfs.conf para que sobrevivan a un reinicio.',
    ],
    architectureNote: 'OpenZFS observa la presión de memoria de Linux. Cuando los procesos necesitan RAM, la ARC se reduce sola para evitar el OOM killer.',
  },
  snapshots: {
    id: 'snapshots',
    title: 'Instantáneas, clones y replicación',
    subtitle: 'Copias atómicas, reversión inmediata y send/receive incremental',
    summary: 'Una instantánea ZFS es una copia atómica de un instante, creada en menos de un milisegundo. Por copy-on-write no ocupa espacio extra hasta que los bloques cambian. Solo los bloques modificados consumen espacio nuevo.',
    keyConcepts: [
      { label: 'Instantáneas sin coste inicial', description: 'Crear una instantánea congela el árbol de bloques existente. En ese momento no se copia nada en el disco.' },
      { label: 'Reversión inmediata', description: 'Devuelve un dataset al estado exacto de la instantánea y descarta los cambios posteriores, en menos de un segundo, sea cual sea el volumen modificado.' },
      { label: 'Clones escribibles', description: 'Un sistema de archivos nuevo y escribible creado desde una instantánea, casi sin espacio extra. Sirve para pruebas de bases de datos y copias de desarrollo.' },
      { label: 'Replicación incremental', description: 'Envía solo los bloques que cambiaron entre dos instantáneas, por SSH o por la red, y conserva la compresión.' },
    ],
    bestPractices: [
      'Automatice la retención: por ejemplo cada hora (guardar 24), cada día (guardar 7) y cada semana (guardar 4).',
      'Borre las instantáneas antiguas en datasets con mucha escritura. Retienen espacio que de otro modo se liberaría.',
      'Use zfs send -R para replicar un árbol completo de datasets y sus propiedades.',
    ],
    architectureNote: 'zfs send es un flujo binario a nivel de bloque. Es exacto y evita el coste de que rsync recorra millones de archivos pequeños.',
  },
  wizard: {
    id: 'wizard',
    title: 'Asistente de configuración',
    subtitle: 'Construya un pool y unos datasets acordes a la carga real',
    summary: 'El asistente ayuda a crear pools y datasets sin omitir ajustes críticos como ashift, el tamaño de registro y el tipo de VDEV. El mismo flujo existe en la CLI del terminal y en este panel.',
    keyConcepts: [
      { label: 'Comprobación de parámetros', description: 'Impide crear un pool con ashift=9 en discos modernos y propone una redundancia acorde al número de discos.' },
      { label: 'Perfiles de carga', description: 'Fija recordsize=16k para Postgres/MySQL, 8k para ZVOL de máquinas virtuales y 1M para vídeo y copias de seguridad.' },
      { label: 'Salida de comandos', description: 'Además de aplicar el cambio, el asistente muestra los comandos zpool y zfs exactos para el registro de cambios.' },
    ],
    bestPractices: [
      'Use el asistente en pools nuevos para que ashift y la redundancia sigan la práctica enterprise.',
      'Lea los comandos generados antes de aplicarlos en un host de producción.',
    ],
    architectureNote: 'Un perfil guardado se puede reutilizar en otro servidor desde /etc/zfs-director/wizard_profile.json.',
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal integrada',
    subtitle: 'Ejecute comandos ZFS y kstat desde el panel',
    summary: 'La consola ejecuta las herramientas OpenZFS (zpool, zfs, arcstat, zdb, arc_summary), con accesos directos a los comandos de diagnóstico más usados.',
    keyConcepts: [
      { label: 'Introspección del kernel (kstat)', description: 'Lee los contadores del módulo en /proc/spl/kstat/zfs/ para un diagnóstico detallado.' },
      { label: 'Telemetría de E/S', description: 'Muestra latencia, ancho de banda y operaciones de lectura y escritura por segundo de cada disco y VDEV.' },
    ],
    bestPractices: [
      'Use zpool status -v para ver si un error de checksum nombra un archivo concreto.',
      'Evite zdb en un pool de producción ocupado, salvo en una reparación profunda.',
    ],
    architectureNote: 'La consola habla con el servidor local por la API REST, así que cada comando queda registrado y la respuesta permanece en este host.',
  },
  reports: {
    id: 'reports',
    title: 'Informes de diagnóstico y pruebas en vivo',
    subtitle: 'Mida IOPS y latencia, y conserve el historial de integridad del scrub',
    summary: 'Esta página mide el rendimiento del pool (MB/s secuenciales, IOPS aleatorios de 4K, latencia media y tasa de aciertos de ARC) y guarda el historial de scrub y de auditorías de integridad.',
    keyConcepts: [
      { label: 'IOPS y latencia', description: 'Compara las lecturas servidas desde la ARC (a menudo por debajo de 0,2 ms) con las escrituras síncronas a los discos y a un SLOG NVMe.' },
      { label: 'Integridad histórica y bit-rot', description: 'Registra los errores de checksum encontrados y reparados por Fletcher4 durante un zpool scrub periódico.' },
      { label: 'Informes exportables', description: 'Descarga el informe actual en Markdown, JSON o CSV para una auditoría de infraestructura.' },
    ],
    bestPractices: [
      'Ejecute las pruebas de carga cuando las aplicaciones estén en calma, para no competir con la E/S de producción.',
      'Compare una prueba antes y después de añadir un SLOG o L2ARC, para ver la ganancia.',
    ],
    architectureNote: 'OpenZFS agrupa las escrituras en grupos de transacción cada unos 5 segundos y convierte escrituras dispersas en escrituras secuenciales más grandes.',
  },
  deployment: {
    id: 'deployment',
    title: 'Paquete de instalación y control del servicio',
    subtitle: 'Disposición del paquete Linux, zfs-mgr.sh y la unidad systemd',
    summary: 'La suite vive en un directorio y se controla con zfs-mgr.sh: un comando inicia, detiene o reinicia el servicio. Python cubre la CLI y el asistente; el motor Rust es un binario opcional.',
    keyConcepts: [
      { label: 'zfs-mgr.sh', description: 'start lanza el panel web en segundo plano, stop termina esos procesos y libera el puerto, y status informa del PID registrado.' },
      { label: 'CLI Python y motor Rust opcional', description: 'Python ejecuta la CLI administrativa y el asistente. El crate Rust es un servicio Axum opcional; el panel lo sirve el proceso Node.' },
      { label: 'systemd', description: 'zfs-enterprise.service puede arrancar el panel tras el inicio, cuando zfs.target ya está cargado.' },
    ],
    bestPractices: [
      'Compruebe ./zfs-mgr.sh status antes y después de un cambio de configuración.',
      'Copie zfs_state.json antes de ediciones grandes en un entorno de prueba.',
    ],
    architectureNote: 'El paquete es autónomo y puede colocarse en Ubuntu, Debian, Proxmox o RHEL. Arránquelo con bash start.sh cuando Node.js 22 o posterior esté instalado.',
  },
  logs: {
    id: 'logs',
    title: 'Registros del sistema y el daemon ZED',
    subtitle: 'Eventos de zfs.ko, errores de E/S y comprobaciones SMART',
    summary: 'ZED y el módulo zfs.ko registran cambios de topología, sincronizaciones de grupos de transacción, errores de checksum y ejecuciones de scrub o trim. La vista de registros transmite esos eventos y permite filtrarlos.',
    keyConcepts: [
      { label: 'ZED (ZFS Event Daemon)', description: 'Vigila los eventos de /dev/zfs. Ante un fallo de disco puede activar un hot spare o avisar a un administrador.' },
      { label: 'Ereports de checksum y autorreparación', description: 'Un bloque dañado produce ereport.fs.zfs.checksum. El kernel lo repara desde una copia mirror o de paridad y avisa a ZED sin detener el servicio.' },
      { label: 'Daemon SMART (smartd)', description: 'Sigue la temperatura, las horas encendido, los sectores reasignados y el desgaste NVMe antes de que un disco falle del todo.' },
    ],
    bestPractices: [
      'Active zed.service en cada host OpenZFS para que los fallos se detecten en segundo plano.',
      'Active la actualización automática durante un benchmark o un resilver para ver los cambios de latencia.',
      'Exporte los registros en JSON o texto plano cuando necesite un archivo de auditoría.',
    ],
    architectureNote: 'ZFS envía eventos a la traza del kernel Linux y a systemd-journald, de modo que los errores de almacenamiento se pueden alinear con la salud del dispositivo.',
  },
  scheduler: {
    id: 'scheduler',
    title: 'Programador de scrub y ventanas de mantenimiento',
    subtitle: 'Compruebe cada bloque en un horario que no estorbe a los usuarios',
    summary: 'Un scrub lee cada bloque del pool y comprueba su checksum Fletcher4 o SHA-256. Un trabajo cron o un temporizador systemd ejecuta esa comprobación en una ventana tranquila, a menudo de 02:00 a 08:00 UTC.',
    keyConcepts: [
      { label: 'Ventanas de mantenimiento', description: 'Deje la lectura pesada del scrub en horas de poco tráfico (noche o fin de semana) para que los IOPS de producción sigan disponibles.' },
      { label: 'Pausa y límite', description: 'zpool scrub -p pausa un scrub y se puede reanudar después. El programador también puede pausar si la CPU o los discos superan un umbral.' },
      { label: 'Frecuencia', description: 'Discos duros: cada una o dos semanas. SSD y NVMe: aproximadamente una vez al mes, porque no hay riesgo mecánico y las lecturas extra desgastan la flash.' },
    ],
    bestPractices: [
      'No haga scrub de dos pools a la vez si comparten el mismo controlador SAS.',
      'Fije una duración máxima para que el scrub termine antes de que empiece la jornada.',
      'Observe la duración del scrub. Un scrub que se alarga una y otra vez suele indicar un disco que se degrada.',
    ],
    architectureNote: 'Un scrub corre en segundo plano con prioridad de E/S baja. En un pool de discos duros fragmentado aún puede subir la latencia de lectura aleatoria.',
  },
};

const de: Record<string, TopicText> = {
  dashboard: {
    id: 'dashboard',
    title: 'Flottenübersicht und OpenZFS-Telemetrie',
    subtitle: 'Live-Überwachung von Plattenzustand, Integrität und Cache',
    summary: 'Das Haupt-Dashboard ist eine einzige Sicht auf den Speicher-Cluster. Es zeigt Gesamtkapazität, Scrub-Integrität, IOPS und wie effizient der Adaptive Replacement Cache (ARC) den Arbeitsspeicher nutzt.',
    keyConcepts: [
      { label: 'Selbstheilende Integrität', description: 'ZFS bildet für jeden Block eine Prüfsumme (Fletcher4 oder SHA-256). Stille Bit-Rot wird beim Lesen oder beim Scrub aus einer redundanten Kopie repariert.' },
      { label: 'ARC-Trefferquote', description: 'Anteil der Lesezugriffe, die aus dem RAM mit Latenz unter einer Mikrosekunde bedient werden, ohne die Platten zu berühren. Über 90% ist für einen gesunden Host typisch.' },
      { label: 'Pool-Fragmentierung', description: 'Wie freier Platz über die Platten verteilt ist. Copy-on-Write verträgt Fragmentierung, der Pool sollte aber unter etwa 80–85% Füllstand bleiben.' },
    ],
    bestPractices: [
      'Halten Sie jeden Pool unter 80–85% Füllstand, damit die Freiraumvergabe schnell bleibt.',
      'Planen Sie einen Scrub mindestens monatlich auf Enterprise-Platten, wöchentlich auf Consumer-Platten.',
      'Beobachten Sie die ARC-Trefferquote, um zu entscheiden, ob mehr RAM oder ein L2ARC-Gerät nötig ist.',
    ],
    architectureNote: 'OpenZFS vereint Dateisystem und Volume-Manager (Storage Pool Allocator). Hardware-RAID und ein separater fsck-Lauf sind nicht nötig.',
  },
  pools: {
    id: 'pools',
    title: 'Pool-Verwaltung und VDEV-Topologie',
    subtitle: 'Plattengruppen, Redundanz und dedizierte Beschleuniger',
    summary: 'Ein Storage-Pool (zpool) ist das Fundament von ZFS. Er besteht aus virtuellen Geräten (VDEVs). Ein Pool wächst durch zusätzliche VDEVs. ZFS verteilt Schreibvorgänge nach freiem Platz auf diese VDEVs.',
    keyConcepts: [
      { label: 'ashift (physische Sektorgröße)', description: 'ashift=12 bedeutet 4096-Byte-Sektoren. Das ist die richtige Einstellung für SSD, NVMe und moderne Advanced-Format-Platten. ashift=9 auf diesen Platten verursacht Write Amplification. ashift lässt sich nach dem Anlegen nicht mehr ändern.' },
      { label: 'VDEV-Typen (Mirror und RAIDZ)', description: 'Ein 2- oder 3-fach-Mirror liefert die höchsten IOPS und den kürzesten Resilver. RAIDZ2 (ähnlich RAID-6) übersteht zwei Plattenausfälle und ist die übliche Wahl für große, sichere Kapazität.' },
      { label: 'SLOG / ZIL', description: 'Eine SSD oder NVMe mit niedriger Latenz und Schutz bei Stromausfall für das synchrone Intent-Log. Sie beeinflusst NFS, iSCSI und die Commit-Latenz von Datenbanken.' },
      { label: 'L2ARC', description: 'Ein Lese-Cache auf SSD oder NVMe, der den RAM-ARC erweitert. Aus dem RAM verdrängte Blöcke können weiter aus dem L2ARC kommen.' },
      { label: 'Special-VDEV', description: 'Ein schnelles NVMe-VDEV für den Metadatenbaum und kleine Blöcke (zum Beispiel 16 KB oder 32 KB und darunter). Dateilastige Workloads können dadurch mehrfach schneller werden.' },
    ],
    bestPractices: [
      'Setzen Sie beim Anlegen immer ashift=12. Diese Eigenschaft lässt sich später nicht ändern.',
      'Für den SLOG eine Enterprise-SSD mit Stromausfallschutz im Mirror verwenden.',
      'Pool-Platten nicht hinter einen Hardware-RAID-Controller legen. Der HBA muss im IT-Modus laufen.',
    ],
    architectureNote: 'Der Verlust eines einzigen Daten-VDEV ohne Redundanz zerstört den ganzen Pool. Redundanz (Mirror oder RAIDZ2/3) gehört auf jedes Daten-VDEV.',
  },
  datasets: {
    id: 'datasets',
    title: 'Datasets und ZVOLs',
    subtitle: 'Kompression, Recordsize, Kontingente und Verschlüsselung je Dataset',
    summary: 'Ein Dataset ist ein leichtes Dateisystem im Pool mit eigenen Eigenschaften. Ein ZVOL ist ein Blockgerät für virtuelle Maschinen (KVM/QEMU), iSCSI-Targets oder RAW-Volumes.',
    keyConcepts: [
      { label: 'Recordsize', description: 'Maximale Blockgröße für Dateien. Standard ist 128 KB. 16 KB für PostgreSQL und MySQL InnoDB, passend zur Datenbankseite. 1 MB für große Medien und Sicherungen.' },
      { label: 'Inline-Kompression (zstd / lz4)', description: 'ZFS komprimiert jeden Block vor dem Schreiben. lz4 ist sehr schnell und kostet fast keine CPU. zstd komprimiert stärker (oft 1,8x–2,5x), spart Platz und kann den Durchsatz erhöhen.' },
      { label: 'Deduplizierung (DDT)', description: 'Entfernt doppelte Blöcke. Die Dedup-Tabelle braucht etwa 5 GB RAM je 1 TB deduplizierter Daten. Ohne diesen RAM bricht die Leistung ein.' },
      { label: 'Native Verschlüsselung (AES-256-GCM)', description: 'Blockverschlüsselung in ZFS, ohne dm-crypt oder LUKS. Ein Raw-Send kann den Geheimtext auf einen Host replizieren, der den Schlüssel nicht besitzt.' },
    ],
    bestPractices: [
      'Setzen Sie atime=off, damit jeder Lesezugriff keine Metadaten neu schreibt.',
      'Aktivieren Sie lz4 oder zstd. Komprimierte Daten werden oft schneller gelesen, weil weniger Bytes bewegt werden.',
      'Ein ZVOL nur verwenden, wenn ein Blockgerät nötig ist. Für Dateien ein ZFS-Dataset nehmen.',
    ],
    architectureNote: 'Kind-Datasets erben Eigenschaften vom Eltern-Dataset, sofern eine Eigenschaft nicht lokal gesetzt ist.',
  },
  arc: {
    id: 'arc',
    title: 'ARC- und L2ARC-Cache',
    subtitle: 'Wie der Adaptive Replacement Cache arbeitet und welche Kernel-Grenzen gelten',
    summary: 'Der ARC ist der zentrale Leistungscache von ZFS. Anders als ein einfacher LRU hält er die Balance zwischen gerade benutzten Daten (MRU) und oft benutzten Daten (MFU).',
    keyConcepts: [
      { label: 'MRU', description: 'Hält kürzlich gelesene Blöcke. Ein großer sequenzieller Scan soll häufig genutzte Daten nicht aus dem RAM verdrängen.' },
      { label: 'MFU', description: 'Hält Blöcke, die immer wieder gelesen werden. Diese Blöcke bleiben geschützt, damit die Latenz niedrig bleibt.' },
      { label: 'Größengrenze (zfs_arc_max)', description: 'Kernel-Grenze, wie viel RAM ZFS nutzen darf. Auf einem 64-GB-Host sind 32–48 GB üblich und lassen Platz für System und Anwendungen.' },
      { label: 'L2ARC-Schreibdrossel', description: 'l2arc_write_max begrenzt, wie schnell ZFS die Cache-SSD füllt, damit Flash nicht durch Cache-Schreibvorgänge verschleißt.' },
    ],
    bestPractices: [
      'Setzen Sie zfs_arc_max nicht über etwa 75% des RAM, wenn der Host auch KVM oder PostgreSQL ausführt.',
      'Jedes 1 GB L2ARC braucht etwa 70 MB ARC-RAM für Indexköpfe. Erst RAM erweitern, dann einen sehr großen L2ARC.',
      'Grenzen in /etc/modprobe.d/zfs.conf schreiben, damit sie einen Neustart überstehen.',
    ],
    architectureNote: 'OpenZFS beobachtet den Speicherdruck von Linux. Brauchen Prozesse RAM, schrumpft der ARC von selbst, um den OOM-Killer zu vermeiden.',
  },
  snapshots: {
    id: 'snapshots',
    title: 'Snapshots, Klone und Replikation',
    subtitle: 'Atomare Kopien, sofortiges Rollback und inkrementelles Send/Receive',
    summary: 'Ein ZFS-Snapshot ist eine atomare Kopie eines Zeitpunkts und entsteht in weit unter einer Millisekunde. Durch Copy-on-Write belegt er keinen Extra-Platz, bis Blöcke sich ändern. Nur geänderte Blöcke verbrauchen neuen Platz.',
    keyConcepts: [
      { label: 'Snapshots ohne Anfangskosten', description: 'Das Anlegen friert den bestehenden Blockbaum ein. In diesem Moment wird nichts auf die Platte kopiert.' },
      { label: 'Sofortiges Rollback', description: 'Setzt ein Dataset auf den exakten Snapshot-Stand zurück und verwirft spätere Änderungen, in unter einer Sekunde, unabhängig von der Datenmenge.' },
      { label: 'Beschreibbare Klone', description: 'Ein neues beschreibbares Dateisystem aus einem Snapshot, fast ohne Extra-Platz. Nützlich für Datenbanktests und Entwicklungskopien.' },
      { label: 'Inkrementelle Replikation', description: 'Sendet nur die Blöcke, die sich zwischen zwei Snapshots geändert haben, über SSH oder das Netz, und behält die Kompression.' },
    ],
    bestPractices: [
      'Aufbewahrung automatisieren: zum Beispiel stündlich (24 behalten), täglich (7 behalten), wöchentlich (4 behalten).',
      'Alte Snapshots auf stark beschriebenen Datasets löschen. Sie halten Platz fest, der sonst frei würde.',
      'zfs send -R verwenden, um einen ganzen Dataset-Baum samt Eigenschaften zu replizieren.',
    ],
    architectureNote: 'zfs send ist ein binärer Strom auf Blockebene. Er bleibt exakt und vermeidet den Aufwand, mit dem rsync Millionen kleiner Dateien abläuft.',
  },
  wizard: {
    id: 'wizard',
    title: 'Konfigurationsassistent',
    subtitle: 'Einen Pool und Datasets für die tatsächliche Last aufbauen',
    summary: 'Der Assistent hilft, Pools und Datasets anzulegen, ohne kritische Werte wie ashift, Recordsize und VDEV-Typ zu vergessen. Derselbe Ablauf gibt es in der Terminal-CLI und in diesem Panel.',
    keyConcepts: [
      { label: 'Parameterprüfung', description: 'Verhindert einen Pool mit ashift=9 auf modernen Platten und schlägt eine Redundanz passend zur Plattenzahl vor.' },
      { label: 'Lastprofile', description: 'Setzt recordsize=16k für Postgres/MySQL, 8k für VM-ZVOLs und 1M für Video und Sicherungen.' },
      { label: 'Shell-Ausgabe', description: 'Neben der Anwendung zeigt der Assistent die genauen zpool- und zfs-Befehle für das Änderungsprotokoll.' },
    ],
    bestPractices: [
      'Neue Pools über den Assistenten anlegen, damit ashift und Redundanz der Enterprise-Praxis entsprechen.',
      'Die erzeugten Befehle lesen, bevor sie auf einem Produktionshost ausgeführt werden.',
    ],
    architectureNote: 'Ein gespeichertes Profil kann auf einem anderen Server aus /etc/zfs-director/wizard_profile.json wiederverwendet werden.',
  },
  terminal: {
    id: 'terminal',
    title: 'Eingebaute Konsole',
    subtitle: 'ZFS- und kstat-Befehle direkt aus dem Panel ausführen',
    summary: 'Die Konsole führt die OpenZFS-Werkzeuge aus (zpool, zfs, arcstat, zdb, arc_summary), mit Kurzbefehlen für die häufigsten Diagnosekommandos.',
    keyConcepts: [
      { label: 'Kernel-Introspektion (kstat)', description: 'Liest die Zähler des Kernelmoduls unter /proc/spl/kstat/zfs/ für eine genaue Diagnose.' },
      { label: 'E/A-Telemetrie', description: 'Zeigt Latenz, Durchsatz und Lese-/Schreiboperationen je Sekunde für jede Platte und jedes VDEV.' },
    ],
    bestPractices: [
      'zpool status -v zeigt, ob ein Prüfsummenfehler eine konkrete Datei nennt.',
      'zdb auf einem beschäftigten Produktionspool vermeiden, außer bei einer tiefen Reparatur.',
    ],
    architectureNote: 'Die Konsole spricht über die REST-API mit dem lokalen Server. Jeder Befehl wird protokolliert, die Antwort bleibt auf diesem Host.',
  },
  reports: {
    id: 'reports',
    title: 'Diagnoseberichte und Live-Benchmarks',
    subtitle: 'IOPS und Latenz messen und die Scrub-Historie behalten',
    summary: 'Diese Seite misst die Pool-Leistung (sequentielle MB/s, zufällige 4K-IOPS, mittlere Latenz und ARC-Trefferquote) und behält die Historie von Scrub- und Integritätsprüfungen.',
    keyConcepts: [
      { label: 'IOPS und Latenz', description: 'Vergleicht aus dem ARC bediente Lesezugriffe (oft unter 0,2 ms) mit synchronen Schreibvorgängen auf die Platten und auf einen NVMe-SLOG.' },
      { label: 'Historische Integrität und Bit-Rot', description: 'Zeichnet Prüfsummenfehler auf, die Fletcher4 bei einem periodischen zpool scrub gefunden und repariert hat.' },
      { label: 'Exportierbare Berichte', description: 'Lädt den aktuellen Bericht als Markdown, JSON oder CSV für ein Infrastruktur-Audit herunter.' },
    ],
    bestPractices: [
      'Lasttests ausführen, wenn Anwendungen ruhig sind, damit Produktions-E/A nicht mit dem Benchmark konkurriert.',
      'Einen Test vor und nach dem Hinzufügen von SLOG oder L2ARC vergleichen, damit der Gewinn sichtbar ist.',
    ],
    architectureNote: 'OpenZFS bündelt Schreibvorgänge etwa alle 5 Sekunden in Transaktionsgruppen und macht verstreute Schreibvorgänge zu größeren sequenziellen.',
  },
  deployment: {
    id: 'deployment',
    title: 'Installationspaket und Dienststeuerung',
    subtitle: 'Aufbau des Linux-Pakets, zfs-mgr.sh und die systemd-Unit',
    summary: 'Die Suite liegt in einem Verzeichnis und wird über zfs-mgr.sh gesteuert: ein Befehl startet, stoppt oder startet den Dienst neu. Python übernimmt CLI und Assistent; die Rust-Engine ist ein optionales Programm.',
    keyConcepts: [
      { label: 'zfs-mgr.sh', description: 'start startet das Web-Panel im Hintergrund, stop beendet diese Prozesse und gibt den Port frei, status meldet die gespeicherte PID.' },
      { label: 'Python-CLI und optionale Rust-Engine', description: 'Python führt die Verwaltungs-CLI und den Assistenten aus. Das Rust-Crate ist ein optionaler Axum-Dienst; das Panel selbst liefert der Node-Prozess.' },
      { label: 'systemd', description: 'zfs-enterprise.service kann das Panel nach dem Boot starten, sobald zfs.target geladen ist.' },
    ],
    bestPractices: [
      './zfs-mgr.sh status vor und nach einer Konfigurationsänderung prüfen.',
      'zfs_state.json vor großen Änderungen in einer Testumgebung kopieren.',
    ],
    architectureNote: 'Das Paket ist in sich geschlossen und kann auf Ubuntu, Debian, Proxmox oder RHEL liegen. Start mit bash start.sh, sobald Node.js 22 oder neuer installiert ist.',
  },
  logs: {
    id: 'logs',
    title: 'Systemprotokolle und der ZED-Daemon',
    subtitle: 'Ereignisse von zfs.ko, E/A-Fehler und SMART-Prüfungen',
    summary: 'ZED und das Modul zfs.ko zeichnen Topologieänderungen, Transaktionsgruppen, Prüfsummenfehler sowie Scrub- und Trim-Läufe auf. Die Protokollansicht streamt diese Ereignisse und lässt sie filtern.',
    keyConcepts: [
      { label: 'ZED (ZFS Event Daemon)', description: 'Beobachtet Ereignisse von /dev/zfs. Bei einem Plattenfehler kann er eine Hot-Spare aktivieren oder einen Administrator benachrichtigen.' },
      { label: 'Checksum-Ereports und Selbstheilung', description: 'Ein beschädigter Block erzeugt ereport.fs.zfs.checksum. Der Kernel repariert ihn aus Mirror oder Parität und benachrichtigt ZED, ohne den Dienst zu stoppen.' },
      { label: 'SMART-Daemon (smartd)', description: 'Verfolgt Temperatur, Betriebsstunden, neu zugewiesene Sektoren und NVMe-Verschleiß, bevor eine Platte ganz ausfällt.' },
    ],
    bestPractices: [
      'zed.service auf jedem OpenZFS-Host aktivieren, damit Fehler im Hintergrund auffallen.',
      'Automatische Aktualisierung während Benchmark oder Resilver einschalten, damit Latenzänderungen sichtbar sind.',
      'Protokolle als JSON oder Klartext exportieren, wenn ein Audit-Archiv nötig ist.',
    ],
    architectureNote: 'ZFS sendet Ereignisse in den Linux-Kernel-Trace und nach systemd-journald, sodass Speicherfehler mit dem Gerätezustand zusammenpassen.',
  },
  scheduler: {
    id: 'scheduler',
    title: 'Scrub-Planer und Wartungsfenster',
    subtitle: 'Jeden Block in einem Zeitplan prüfen, der Nutzer nicht stört',
    summary: 'Ein Scrub liest jeden Block im Pool und prüft die Fletcher4- oder SHA-256-Prüfsumme. Ein Cron-Job oder ein systemd-Timer führt die Prüfung in einem ruhigen Fenster aus, oft 02:00–08:00 UTC.',
    keyConcepts: [
      { label: 'Wartungsfenster', description: 'Die schwere Scrub-Leselast in verkehrsarme Stunden legen (Nacht oder Wochenende), damit Produktions-IOPS verfügbar bleiben.' },
      { label: 'Pause und Drosselung', description: 'zpool scrub -p pausiert einen Scrub, er kann später weiterlaufen. Der Planer kann auch pausieren, wenn CPU oder Platten eine Schwelle überschreiten.' },
      { label: 'Häufigkeit', description: 'Festplatten: alle ein bis zwei Wochen. SSD und NVMe: etwa monatlich, weil kein mechanisches Risiko besteht und zusätzliche Lesevorgänge Flash verschleißen.' },
    ],
    bestPractices: [
      'Nicht zwei Pools gleichzeitig scruben, wenn sie denselben SAS-Controller teilen.',
      'Eine Höchstdauer setzen, damit der Scrub vor Beginn des Arbeitstags endet.',
      'Die Scrub-Dauer über die Zeit beobachten. Ein immer langsamerer Scrub deutet oft auf eine alternde Platte.',
    ],
    architectureNote: 'Ein Scrub läuft im Hintergrund mit niedriger E/A-Priorität. Auf einem fragmentierten Festplatten-Pool kann er die Latenz zufälliger Lesezugriffe trotzdem erhöhen.',
  },
};

const fr: Record<string, TopicText> = {
  dashboard: {
    id: 'dashboard',
    title: 'Vue de la flotte et télémétrie OpenZFS',
    subtitle: 'Suivi en direct de l état des disques, de l intégrité et du cache',
    summary: 'Le tableau de bord principal est une vue unique du cluster de stockage. Il montre la capacité totale, l intégrité du scrub, les IOPS et l efficacité avec laquelle l Adaptive Replacement Cache (ARC) utilise la RAM.',
    keyConcepts: [
      { label: 'Intégrité auto-réparatrice', description: 'ZFS calcule une somme de contrôle (Fletcher4 ou SHA-256) pour chaque bloc. Si un bit-rot silencieux est détecté, ZFS répare le bloc depuis une copie redondante pendant une lecture ou un scrub.' },
      { label: 'Taux de succès ARC', description: 'Part des lectures servies depuis la RAM avec une latence inférieure à une microseconde, sans toucher les disques. Au-dessus de 90 %, c est typique d un hôte sain.' },
      { label: 'Fragmentation du pool', description: 'Répartition de l espace libre. Le copy-on-write gère bien la fragmentation, mais un pool doit rester sous environ 80–85 % de remplissage.' },
    ],
    bestPractices: [
      'Gardez chaque pool sous 80–85 % pour que l allocation d espace libre reste rapide.',
      'Planifiez un scrub au moins une fois par mois sur des disques enterprise, ou chaque semaine sur des disques grand public.',
      'Surveillez le taux de succès ARC pour décider s il faut plus de RAM ou un périphérique L2ARC.',
    ],
    architectureNote: 'OpenZFS réunit le système de fichiers et le gestionnaire de volumes (Storage Pool Allocator). Le RAID matériel et un fsck séparé ne sont pas nécessaires.',
  },
  pools: {
    id: 'pools',
    title: 'Pools et topologie VDEV',
    subtitle: 'Groupes de disques, redondance et accélérateurs dédiés',
    summary: 'Un pool de stockage (zpool) est la base de ZFS. Il est composé de périphériques virtuels (VDEV). On agrandit un pool en ajoutant des VDEV. ZFS répartit les écritures selon l espace libre.',
    keyConcepts: [
      { label: 'ashift (taille de secteur physique)', description: 'ashift=12 signifie des secteurs de 4096 octets. C est le bon réglage pour SSD, NVMe et disques Advanced Format. ashift=9 sur ces disques provoque une amplification d écriture. ashift ne peut plus changer après la création du pool.' },
      { label: 'Types de VDEV (mirror et RAIDZ)', description: 'Un mirror à 2 ou 3 voies donne les IOPS les plus élevés et le resilver le plus court. RAIDZ2 (proche de RAID-6) survit à deux pannes de disque et convient aux grandes capacités sûres.' },
      { label: 'SLOG / ZIL', description: 'Un SSD ou NVMe à faible latence, protégé contre la coupure de courant, qui porte le journal d intention synchrone. Il agit sur NFS, iSCSI et la latence de commit des bases de données.' },
      { label: 'L2ARC', description: 'Un cache de lecture sur SSD ou NVMe qui prolonge l ARC en RAM. Les blocs évincés de la RAM peuvent encore être servis depuis le L2ARC.' },
      { label: 'VDEV special', description: 'Un VDEV NVMe rapide qui stocke l arbre de métadonnées et les petits blocs (par exemple 16 Ko ou 32 Ko et moins) et peut accélérer fortement les charges riches en fichiers.' },
    ],
    bestPractices: [
      'Fixez toujours ashift=12 à la création. Cette propriété ne peut pas changer ensuite.',
      'Pour le SLOG, utilisez un SSD enterprise protégé contre la coupure, en mirror.',
      'Ne placez pas les disques du pool derrière un contrôleur RAID matériel. Le HBA doit être en mode IT.',
    ],
    architectureNote: 'Perdre un seul VDEV de données sans redondance détruit tout le pool. La redondance (mirror ou RAIDZ2/3) se place sur chaque VDEV de données.',
  },
  datasets: {
    id: 'datasets',
    title: 'Datasets et ZVOL',
    subtitle: 'Compression, taille d enregistrement, quotas et chiffrement par dataset',
    summary: 'Un dataset est un système de fichiers léger dans un pool, avec ses propres propriétés. Un ZVOL est un périphérique bloc pour des machines virtuelles (KVM/QEMU), des cibles iSCSI ou des volumes RAW.',
    keyConcepts: [
      { label: 'Taille d enregistrement', description: 'Taille maximale de bloc d un fichier. La valeur par défaut est 128 Ko. Utilisez 16 Ko pour PostgreSQL et MySQL InnoDB, pour coller à la page de la base. Utilisez 1 Mo pour les médias volumineux et les sauvegardes.' },
      { label: 'Compression en ligne (zstd / lz4)', description: 'ZFS compresse chaque bloc avant l écriture. lz4 est très rapide et coûte presque rien en CPU. zstd compresse davantage (souvent 1,8x–2,5x), économise de l espace et peut augmenter le débit.' },
      { label: 'Déduplication (DDT)', description: 'Supprime les blocs en double. La table de déduplication demande environ 5 Go de RAM par To dédupliqué. Sans cette RAM, les performances chutent fortement.' },
      { label: 'Chiffrement natif (AES-256-GCM)', description: 'Chiffrement par blocs intégré à ZFS, sans dm-crypt ni LUKS. Un envoi raw peut répliquer le texte chiffré vers un hôte qui ne détient pas la clé.' },
    ],
    bestPractices: [
      'Réglez atime=off pour qu une lecture ne réécrive pas les métadonnées.',
      'Activez lz4 ou zstd. Les données compressées se lisent souvent plus vite parce que le disque déplace moins d octets.',
      'N utilisez un ZVOL que si vous avez besoin d un périphérique bloc. Pour des fichiers, utilisez un dataset ZFS.',
    ],
    architectureNote: 'Les datasets enfants héritent des propriétés du parent, sauf si une propriété est fixée localement.',
  },
  arc: {
    id: 'arc',
    title: 'Cache ARC et L2ARC',
    subtitle: 'Fonctionnement de l Adaptive Replacement Cache et limites noyau à fixer',
    summary: 'L ARC est le cache de performance principal de ZFS. Contrairement à un simple LRU, il équilibre les données utilisées à l instant (MRU) et les données utilisées souvent (MFU).',
    keyConcepts: [
      { label: 'MRU', description: 'Conserve les blocs lus récemment. Un grand parcours séquentiel ne doit pas chasser de la RAM les données fréquemment utilisées.' },
      { label: 'MFU', description: 'Conserve les blocs lus encore et encore. Ces blocs restent protégés pour garder une latence basse.' },
      { label: 'Plafond (zfs_arc_max)', description: 'Limite noyau de la RAM que ZFS peut utiliser. Sur un hôte de 64 Go, 32–48 Go est un plafond courant, qui laisse de la place au système et aux applications.' },
      { label: 'Limite d écriture L2ARC', description: 'l2arc_write_max limite la vitesse à laquelle ZFS remplit le SSD de cache, pour ne pas user la flash par des écritures de cache.' },
    ],
    bestPractices: [
      'Ne placez pas zfs_arc_max au-dessus d environ 75 % de la RAM si l hôte exécute aussi KVM ou PostgreSQL.',
      'Chaque 1 Go de L2ARC demande environ 70 Mo de RAM ARC pour les en-têtes d index. Ajoutez de la RAM avant un très grand L2ARC.',
      'Écrivez les limites dans /etc/modprobe.d/zfs.conf pour qu elles survivent à un redémarrage.',
    ],
    architectureNote: 'OpenZFS observe la pression mémoire de Linux. Quand les processus ont besoin de RAM, l ARC se réduit seul pour éviter le tueur OOM.',
  },
  snapshots: {
    id: 'snapshots',
    title: 'Instantanés, clones et réplication',
    subtitle: 'Copies atomiques, retour immédiat et send/receive incrémental',
    summary: 'Un instantané ZFS est une copie atomique d un instant, créée en bien moins d une milliseconde. Grâce au copy-on-write, il n occupe pas d espace tant que les blocs ne changent pas. Seuls les blocs modifiés consomment de l espace neuf.',
    keyConcepts: [
      { label: 'Instantanés sans coût initial', description: 'Créer un instantané fige l arbre de blocs existant. Rien n est copié sur le disque à cet instant.' },
      { label: 'Retour immédiat', description: 'Ramène un dataset à l état exact de l instantané et abandonne les changements ultérieurs, en moins d une seconde, quel que soit le volume modifié.' },
      { label: 'Clones inscriptibles', description: 'Un nouveau système de fichiers inscriptible créé depuis un instantané, presque sans espace supplémentaire. Utile pour les tests de base de données et les copies de développement.' },
      { label: 'Réplication incrémentale', description: 'N envoie que les blocs changés entre deux instantanés, via SSH ou le réseau, et conserve la compression.' },
    ],
    bestPractices: [
      'Automatisez la rétention : par exemple toutes les heures (garder 24), chaque jour (garder 7), chaque semaine (garder 4).',
      'Supprimez les anciens instantanés sur les datasets très écrits. Ils retiennent de l espace qui serait sinon libéré.',
      'Utilisez zfs send -R pour répliquer tout un arbre de datasets et ses propriétés.',
    ],
    architectureNote: 'zfs send est un flux binaire au niveau des blocs. Il reste exact et évite le coût de rsync qui parcourt des millions de petits fichiers.',
  },
  wizard: {
    id: 'wizard',
    title: 'Assistant de configuration',
    subtitle: 'Construire un pool et des datasets adaptés à la charge réelle',
    summary: 'L assistant aide à créer des pools et des datasets sans oublier des réglages critiques comme ashift, la taille d enregistrement et le type de VDEV. Le même parcours existe dans la CLI et dans ce panneau.',
    keyConcepts: [
      { label: 'Contrôle des paramètres', description: 'Empêche de créer un pool avec ashift=9 sur des disques modernes et propose une redondance adaptée au nombre de disques.' },
      { label: 'Profils de charge', description: 'Fixe recordsize=16k pour Postgres/MySQL, 8k pour les ZVOL de machines virtuelles et 1M pour la vidéo et les sauvegardes.' },
      { label: 'Sortie des commandes', description: 'En plus d appliquer le changement, l assistant montre les commandes zpool et zfs exactes pour le journal des modifications.' },
    ],
    bestPractices: [
      'Utilisez l assistant pour les nouveaux pools afin que ashift et la redondance suivent la pratique enterprise.',
      'Lisez les commandes générées avant de les appliquer sur un hôte de production.',
    ],
    architectureNote: 'Un profil enregistré peut être réutilisé sur un autre serveur depuis /etc/zfs-director/wizard_profile.json.',
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal intégré',
    subtitle: 'Exécuter les commandes ZFS et kstat depuis le panneau',
    summary: 'La console exécute les outils OpenZFS (zpool, zfs, arcstat, zdb, arc_summary), avec des raccourcis vers les commandes de diagnostic les plus utilisées.',
    keyConcepts: [
      { label: 'Introspection du noyau (kstat)', description: 'Lit les compteurs du module sous /proc/spl/kstat/zfs/ pour un diagnostic détaillé.' },
      { label: 'Télémétrie d E/S', description: 'Montre la latence, le débit et les opérations de lecture et d écriture par seconde pour chaque disque et VDEV.' },
    ],
    bestPractices: [
      'Utilisez zpool status -v pour voir si une erreur de somme de contrôle nomme un fichier précis.',
      'Évitez zdb sur un pool de production chargé, sauf pour une réparation profonde.',
    ],
    architectureNote: 'La console parle au serveur local via l API REST. Chaque commande est journalisée et la réponse reste sur cet hôte.',
  },
  reports: {
    id: 'reports',
    title: 'Rapports de diagnostic et bancs d essai',
    subtitle: 'Mesurer les IOPS et la latence, et garder l historique d intégrité du scrub',
    summary: 'Cette page mesure les performances du pool (Mo/s séquentiels, IOPS aléatoires 4K, latence moyenne et taux de succès ARC) et conserve l historique des scrub et des audits d intégrité.',
    keyConcepts: [
      { label: 'IOPS et latence', description: 'Compare les lectures servies depuis l ARC (souvent sous 0,2 ms) aux écritures synchrones vers les disques et vers un SLOG NVMe.' },
      { label: 'Intégrité historique et bit-rot', description: 'Enregistre les erreurs de somme de contrôle trouvées et réparées par Fletcher4 pendant un zpool scrub périodique.' },
      { label: 'Rapports exportables', description: 'Télécharge le rapport courant en Markdown, JSON ou CSV pour un audit d infrastructure.' },
    ],
    bestPractices: [
      'Lancez les tests de charge quand les applications sont calmes, pour ne pas concurrencer les E/S de production.',
      'Comparez un test avant et après l ajout d un SLOG ou d un L2ARC pour voir le gain.',
    ],
    architectureNote: 'OpenZFS regroupe les écritures en groupes de transactions environ toutes les 5 secondes et transforme des écritures dispersées en écritures séquentielles plus grandes.',
  },
  deployment: {
    id: 'deployment',
    title: 'Paquet d installation et contrôle du service',
    subtitle: 'Disposition du paquet Linux, zfs-mgr.sh et l unité systemd',
    summary: 'La suite vit dans un répertoire et se pilote avec zfs-mgr.sh : une commande démarre, arrête ou redémarre le service. Python couvre la CLI et l assistant ; le moteur Rust est un binaire facultatif.',
    keyConcepts: [
      { label: 'zfs-mgr.sh', description: 'start lance le panneau web en arrière-plan, stop termine ces processus et libère le port, status indique le PID enregistré.' },
      { label: 'CLI Python et moteur Rust facultatif', description: 'Python exécute la CLI d administration et l assistant. Le crate Rust est un service Axum facultatif ; le panneau est servi par le processus Node.' },
      { label: 'systemd', description: 'zfs-enterprise.service peut démarrer le panneau après le boot, une fois zfs.target chargé.' },
    ],
    bestPractices: [
      'Vérifiez ./zfs-mgr.sh status avant et après un changement de configuration.',
      'Copiez zfs_state.json avant de grandes modifications dans un environnement de test.',
    ],
    architectureNote: 'Le paquet est autonome et peut être placé sur Ubuntu, Debian, Proxmox ou RHEL. Démarrez-le avec bash start.sh une fois Node.js 22 ou plus récent installé.',
  },
  logs: {
    id: 'logs',
    title: 'Journaux système et le démon ZED',
    subtitle: 'Événements de zfs.ko, erreurs d E/S et contrôles SMART',
    summary: 'ZED et le module zfs.ko enregistrent les changements de topologie, les synchronisations de groupes de transactions, les erreurs de somme de contrôle et les scrub ou trim. La vue des journaux diffuse ces événements et permet de les filtrer.',
    keyConcepts: [
      { label: 'ZED (ZFS Event Daemon)', description: 'Surveille les événements de /dev/zfs. En cas de panne de disque, il peut activer un disque de secours ou prévenir un administrateur.' },
      { label: 'Ereports de checksum et auto-réparation', description: 'Un bloc corrompu produit ereport.fs.zfs.checksum. Le noyau le répare depuis un mirror ou la parité et prévient ZED sans arrêter le service.' },
      { label: 'Démon SMART (smartd)', description: 'Suit la température, les heures de fonctionnement, les secteurs réalloués et l usure NVMe avant qu un disque ne tombe complètement.' },
    ],
    bestPractices: [
      'Activez zed.service sur chaque hôte OpenZFS pour que les pannes soient vues en arrière-plan.',
      'Activez le rafraîchissement automatique pendant un benchmark ou un resilver pour voir les changements de latence.',
      'Exportez les journaux en JSON ou en texte brut lorsqu un archive d audit est nécessaire.',
    ],
    architectureNote: 'ZFS envoie les événements vers la trace du noyau Linux et systemd-journald, ce qui permet d aligner les erreurs de stockage avec l état du périphérique.',
  },
  scheduler: {
    id: 'scheduler',
    title: 'Planificateur de scrub et fenêtres de maintenance',
    subtitle: 'Vérifier chaque bloc à un horaire qui ne gêne pas les utilisateurs',
    summary: 'Un scrub lit chaque bloc du pool et vérifie sa somme Fletcher4 ou SHA-256. Une tâche cron ou un minuteur systemd lance ce contrôle dans une fenêtre calme, souvent de 02:00 à 08:00 UTC.',
    keyConcepts: [
      { label: 'Fenêtres de maintenance', description: 'Gardez la lecture lourde du scrub aux heures de faible trafic (nuit ou week-end) pour que les IOPS de production restent disponibles.' },
      { label: 'Pause et limite', description: 'zpool scrub -p met un scrub en pause et il peut reprendre plus tard. Le planificateur peut aussi pauser si le CPU ou les disques dépassent un seuil.' },
      { label: 'Fréquence', description: 'Disques durs : toutes les une à deux semaines. SSD et NVMe : environ une fois par mois, car il n y a pas de risque mécanique et les lectures supplémentaires usent la flash.' },
    ],
    bestPractices: [
      'Ne scrubbez pas deux pools en même temps s ils partagent le même contrôleur SAS.',
      'Fixez une durée maximale pour que le scrub s arrête avant le début de la journée de travail.',
      'Surveillez la durée du scrub. Un scrub qui s allonge sans cesse indique souvent un disque qui se dégrade.',
    ],
    architectureNote: 'Un scrub tourne en arrière-plan avec une priorité d E/S basse. Sur un pool de disques durs fragmenté, il peut quand même augmenter la latence des lectures aléatoires.',
  },
};

const zh: Record<string, TopicText> = {
  dashboard: {
    id: 'dashboard',
    title: '集群总览与 OpenZFS 遥测',
    subtitle: '实时查看磁盘健康、数据完整性与缓存性能',
    summary: '主仪表板是存储集群的单一视图。它显示总容量、scrub 完整性、IOPS，以及自适应替换缓存（ARC）使用内存的效率。',
    keyConcepts: [
      { label: '自愈数据完整性', description: 'ZFS 为每个块计算校验和（Fletcher4 或 SHA-256）。若发现静默位衰减，会在读取或 scrub 时从冗余副本修复该块。' },
      { label: 'ARC 命中率', description: '由内存直接完成、延迟低于 1 微秒、不接触磁盘的读取比例。健康的企业主机通常高于 90%。' },
      { label: '池碎片', description: '空闲空间在磁盘上的分布。写时复制能应对碎片，但池占用应保持在约 80–85% 以下。' },
    ],
    bestPractices: [
      '每个池保持在 80–85% 以下，以免空闲空间分配变慢。',
      '企业盘至少每月 scrub 一次，消费级磁盘至少每周一次。',
      '观察 ARC 命中率，以决定是否需要更多内存或 L2ARC 设备。',
    ],
    architectureNote: 'OpenZFS 把文件系统和卷管理器（存储池分配器）合在一起，因此不需要硬件 RAID，也不需要单独的 fsck。',
  },
  pools: {
    id: 'pools',
    title: '存储池与 VDEV 拓扑',
    subtitle: '磁盘组、冗余布局和专用加速设备',
    summary: '存储池（zpool）是 ZFS 的基础，由虚拟设备（VDEV）组成。添加 VDEV 即可扩大池。ZFS 按空闲空间把写入分摊到这些 VDEV。',
    keyConcepts: [
      { label: 'ashift（物理扇区大小）', description: 'ashift=12 表示 4096 字节扇区，适用于 SSD、NVMe 和现代高级格式磁盘。在这些磁盘上使用 ashift=9 会造成写放大。池创建后不能再改 ashift。' },
      { label: 'VDEV 类型（镜像与 RAIDZ）', description: '双向或三向镜像提供最高 IOPS 和最短重建时间。RAIDZ2（类似 RAID-6）可承受两块磁盘故障，适合大容量且要求安全的场景。' },
      { label: 'SLOG / ZIL', description: '低延迟且具备掉电保护的 SSD 或 NVMe，用于保存同步意图日志。它直接影响 NFS、iSCSI 和数据库提交延迟。' },
      { label: 'L2ARC', description: '位于 SSD 或 NVMe 上的读缓存，用来扩展内存中的 ARC。被挤出内存的块仍可从 L2ARC 读取。' },
      { label: 'Special VDEV', description: '高速 NVMe VDEV，存放元数据树和小块（例如 16 KB 或 32 KB 及以下），可显著加快文件密集型负载。' },
    ],
    bestPractices: [
      '创建池时始终设置 ashift=12。此属性之后不能修改。',
      'SLOG 应使用具备掉电保护的企业级 SSD，并做成镜像。',
      '不要把池磁盘放在硬件 RAID 控制器后面。HBA 应处于 IT 模式。',
    ],
    architectureNote: '丢失一个没有冗余的数据 VDEV 会毁掉整个池。冗余（镜像或 RAIDZ2/3）必须做在每个数据 VDEV 上。',
  },
  datasets: {
    id: 'datasets',
    title: '数据集与 ZVOL',
    subtitle: '按数据集设置压缩、记录大小、配额和加密',
    summary: '数据集是池内的轻量文件系统，拥有自己的属性。ZVOL 是块设备，用于虚拟机（KVM/QEMU）、iSCSI 目标或原始卷。',
    keyConcepts: [
      { label: '记录大小', description: '文件的最大块大小。默认 128 KB。PostgreSQL 和 MySQL InnoDB 使用 16 KB，以匹配数据库页。大型媒体和备份使用 1 MB。' },
      { label: '内联压缩（zstd / lz4）', description: 'ZFS 在写入前压缩每个块。lz4 极快，几乎不占 CPU。zstd 压缩率更高（常为 1.8 倍到 2.5 倍），能省空间并可能提高吞吐。' },
      { label: '去重（DDT）', description: '去掉重复块。去重表大约每 1 TB 去重数据需要 5 GB 内存。没有这些内存时性能会急剧下降。' },
      { label: '原生加密（AES-256-GCM）', description: 'ZFS 内置的块级加密，不需要 dm-crypt 或 LUKS。原始发送可以把密文复制到没有密钥的远端主机。' },
    ],
    bestPractices: [
      '设置 atime=off，避免每次读取都改写元数据。',
      '启用 lz4 或 zstd。压缩后的数据往往读得更快，因为磁盘搬运的字节更少。',
      '只有需要块设备时才使用 ZVOL。存放文件请使用 ZFS 数据集。',
    ],
    architectureNote: '子数据集继承父级属性，除非某项属性在本地单独设置。',
  },
  arc: {
    id: 'arc',
    title: 'ARC 与 L2ARC 缓存',
    subtitle: '自适应替换缓存如何工作，以及应设置哪些内核上限',
    summary: 'ARC 是 ZFS 的主要性能缓存。它不像普通 LRU，而是在刚刚用过的数据（MRU）和经常使用的数据（MFU）之间保持平衡。',
    keyConcepts: [
      { label: 'MRU', description: '保存最近读取的块。大规模顺序扫描不应把经常使用的数据挤出内存。' },
      { label: 'MFU', description: '保存反复读取的块。这些块受到保护，以保持低延迟。' },
      { label: '容量上限（zfs_arc_max）', description: '内核对 ZFS 可用内存的限制。64 GB 主机上，32–48 GB 是常见上限，给操作系统和应用留出空间。' },
      { label: 'L2ARC 写入节流', description: 'l2arc_write_max 限制 ZFS 填充缓存 SSD 的速度，避免缓存写入过快磨损闪存。' },
    ],
    bestPractices: [
      '如果主机还运行 KVM 或 PostgreSQL，不要把 zfs_arc_max 设到内存的约 75% 以上。',
      '每 1 GB L2ARC 大约需要 70 MB ARC 内存来存放索引头。先增加内存，再添加很大的 L2ARC。',
      '把上限写入 /etc/modprobe.d/zfs.conf，这样重启后仍然有效。',
    ],
    architectureNote: 'OpenZFS 会观察 Linux 的内存压力。用户进程需要内存时，ARC 会自行缩小，以避免 OOM killer。',
  },
  snapshots: {
    id: 'snapshots',
    title: '快照、克隆与复制',
    subtitle: '瞬时原子副本、立即回滚和增量 send/receive',
    summary: 'ZFS 快照是某一时刻的原子副本，创建时间远低于 1 毫秒。由于写时复制，在块发生变化之前它不额外占用空间。只有被修改的块才会占用新空间。',
    keyConcepts: [
      { label: '零初始开销快照', description: '创建快照会冻结现有块树。那一刻磁盘上不会复制任何数据。' },
      { label: '立即回滚', description: '把数据集恢复到快照的精确状态并丢弃之后的更改，耗时不到一秒，与变更的数据量无关。' },
      { label: '可写克隆', description: '从快照创建的新可写文件系统，几乎不占额外空间。适合数据库测试和开发副本。' },
      { label: '增量复制', description: '只发送两个快照之间发生变化的块，可通过 SSH 或网络传输，并保留压缩。' },
    ],
    bestPractices: [
      '自动保留策略：例如每小时保留 24 个、每天保留 7 个、每周保留 4 个。',
      '在写入频繁的数据集上删除旧快照。它们会占住本可释放的空间。',
      '使用 zfs send -R 复制整个数据集树及其属性。',
    ],
    architectureNote: 'zfs send 是块级二进制流。它保持精确，并避免 rsync 遍历数百万小文件的开销。',
  },
  wizard: {
    id: 'wizard',
    title: '配置向导',
    subtitle: '按实际负载建立安全和合适的池与数据集',
    summary: '向导帮助创建池和数据集，避免漏掉 ashift、记录大小和 VDEV 类型等关键设置。终端 CLI 和这个 Web 面板使用同一流程。',
    keyConcepts: [
      { label: '参数检查', description: '阻止在现代磁盘上用 ashift=9 创建池，并根据磁盘数量建议冗余布局。' },
      { label: '负载预设', description: '为 Postgres/MySQL 设置 recordsize=16k，为虚拟机 ZVOL 设置 8k，为视频和备份设置 1M。' },
      { label: '命令输出', description: '除了应用更改，向导还会显示精确的 zpool 和 zfs 命令，便于记入变更记录。' },
    ],
    bestPractices: [
      '新建池时使用向导，使 ashift 和冗余符合企业实践。',
      '在生产主机上执行之前，先阅读生成的命令。',
    ],
    architectureNote: '保存的配置文件可以从 /etc/zfs-director/wizard_profile.json 在另一台服务器上复用。',
  },
  terminal: {
    id: 'terminal',
    title: '内置终端',
    subtitle: '直接从面板运行 ZFS 和 kstat 命令',
    summary: '控制台运行 OpenZFS 工具（zpool、zfs、arcstat、zdb、arc_summary），并为最常用的诊断命令提供快捷方式。',
    keyConcepts: [
      { label: '内核自省（kstat）', description: '读取 /proc/spl/kstat/zfs/ 下的内核模块计数器，用于详细诊断。' },
      { label: 'I/O 遥测', description: '显示每块磁盘和每个 VDEV 的延迟、带宽以及每秒读写操作数。' },
    ],
    bestPractices: [
      '使用 zpool status -v 查看校验和错误是否指向具体文件。',
      '除非在做深入修复，否则不要在繁忙的生产池上运行 zdb。',
    ],
    architectureNote: '控制台通过 REST API 与本机服务器通信，因此每条命令都会被记录，响应留在这台主机上。',
  },
  reports: {
    id: 'reports',
    title: '诊断报告与实时基准测试',
    subtitle: '测量 IOPS 和延迟，并保留 scrub 完整性历史',
    summary: '此页面测量池性能（顺序 MB/s、4K 随机 IOPS、平均延迟和 ARC 命中率），并保留 scrub 与磁盘完整性审计的历史。',
    keyConcepts: [
      { label: 'IOPS 与延迟', description: '比较由 ARC 提供的读取（常常低于 0.2 毫秒）与写入磁盘和 NVMe SLOG 的同步写。' },
      { label: '历史完整性与位衰减', description: '记录定期 zpool scrub 中由 Fletcher4 发现并修复的校验和错误。' },
      { label: '可导出的审计报告', description: '把当前报告下载为 Markdown、JSON 或 CSV，用于基础设施审计。' },
    ],
    bestPractices: [
      '在应用空闲时运行负载测试，避免与生产 I/O 争用。',
      '在添加 SLOG 或 L2ARC 前后各测一次，以便看到收益。',
    ],
    architectureNote: 'OpenZFS 大约每 5 秒把写入组成事务组，把分散写入变成更大的顺序写入。',
  },
  deployment: {
    id: 'deployment',
    title: '安装包与服务控制',
    subtitle: 'Linux 软件包布局、zfs-mgr.sh 和 systemd 单元',
    summary: '这套软件放在一个目录里，由 zfs-mgr.sh 控制：一条命令即可启动、停止或重启服务。Python 负责 CLI 和向导；Rust 引擎是可选的独立程序。',
    keyConcepts: [
      { label: 'zfs-mgr.sh', description: 'start 在后台启动 Web 面板，stop 结束这些进程并释放端口，status 报告记录的 PID。' },
      { label: 'Python CLI 与可选 Rust 引擎', description: 'Python 运行管理 CLI 和向导。Rust crate 是可选的 Axum 服务；面板本身由 Node 进程提供。' },
      { label: 'systemd', description: 'zfs-enterprise.service 可以在启动后、zfs.target 加载完成时启动面板。' },
    ],
    bestPractices: [
      '配置变更前后都检查 ./zfs-mgr.sh status。',
      '在测试环境做大改动之前，先复制 zfs_state.json。',
    ],
    architectureNote: '软件包可以独立放在 Ubuntu、Debian、Proxmox 或 RHEL 上。安装 Node.js 22 或更新版本后，用 bash start.sh 启动。',
  },
  logs: {
    id: 'logs',
    title: '系统日志与 ZED 守护进程',
    subtitle: 'zfs.ko 事件、I/O 错误和主动 SMART 检查',
    summary: 'ZED 和 zfs.ko 模块记录拓扑变化、事务组同步、校验和错误以及 scrub 或 trim。日志视图会流式显示这些事件并允许过滤。',
    keyConcepts: [
      { label: 'ZED（ZFS 事件守护进程）', description: '监视 /dev/zfs 的事件。磁盘故障时可以激活热备盘或通知管理员。' },
      { label: '校验和事件与自愈', description: '损坏的块会产生 ereport.fs.zfs.checksum。内核从镜像或校验副本修复它，并通知 ZED，而不停止服务。' },
      { label: 'SMART 守护进程（smartd）', description: '在磁盘彻底失效前跟踪温度、通电时间、重分配扇区和 NVMe 磨损。' },
    ],
    bestPractices: [
      '在每台 OpenZFS 主机上启用 zed.service，以便在后台发现故障。',
      '基准测试或重建期间打开自动刷新，以便看到延迟变化。',
      '需要审计存档时，把日志导出为 JSON 或纯文本。',
    ],
    architectureNote: 'ZFS 把事件送入 Linux 内核跟踪路径和 systemd-journald，因此存储错误可以和设备健康状况对齐。',
  },
  scheduler: {
    id: 'scheduler',
    title: 'Scrub 调度与维护窗口',
    subtitle: '在不妨碍用户的时间检查每一个块',
    summary: 'Scrub 会读取池中的每一个块并检查 Fletcher4 或 SHA-256 校验和。cron 作业或 systemd 定时器在安静窗口运行这次检查，通常是 UTC 02:00–08:00。',
    keyConcepts: [
      { label: '维护窗口', description: '把繁重的 scrub 读取放在低流量时段（夜间或周末），以便生产 IOPS 仍然可用。' },
      { label: '暂停与节流', description: 'zpool scrub -p 可以暂停 scrub，之后再继续。调度器也可以在 CPU 或磁盘超过阈值时暂停。' },
      { label: '频率', description: '机械硬盘：每一到两周。SSD 和 NVMe：大约每月一次，因为没有机械风险，额外读取会磨损闪存。' },
    ],
    bestPractices: [
      '如果两个池共用同一 SAS 控制器，不要同时 scrub。',
      '设置最长持续时间，让 scrub 在工作日开始前结束。',
      '长期观察 scrub 时长。一次比一次慢，往往说明某块磁盘正在退化。',
    ],
    architectureNote: 'Scrub 在后台以低 I/O 优先级运行。在碎片化的机械盘池上，它仍可能提高随机读延迟。',
  },
};

const hi: Record<string, TopicText> = {
  dashboard: {
    id: 'dashboard',
    title: 'फ्लीट अवलोकन और OpenZFS टेलीमेट्री',
    subtitle: 'डिस्क स्वास्थ्य, डेटा अखंडता और कैश प्रदर्शन की लाइव निगरानी',
    summary: 'मुख्य डैशबोर्ड स्टोरेज क्लस्टर का एक ही दृश्य है। यह कुल क्षमता, scrub अखंडता, IOPS और यह दिखाता है कि Adaptive Replacement Cache (ARC) RAM का कितनी कुशलता से उपयोग कर रहा है।',
    keyConcepts: [
      { label: 'स्व-उपचार डेटा अखंडता', description: 'ZFS हर ब्लॉक का checksum (Fletcher4 या SHA-256) बनाता है। मौन bit-rot मिलने पर पढ़ने या scrub के दौरान वह ब्लॉक अतिरिक्त प्रति से ठीक हो जाता है।' },
      { label: 'ARC हिट अनुपात', description: 'उन पढ़ाइयों का हिस्सा जो डिस्क को छुए बिना, एक माइक्रोसेकंड से कम विलंब पर RAM से पूरी होती हैं। स्वस्थ एंटरप्राइज होस्ट पर 90% से ऊपर सामान्य है।' },
      { label: 'पूल विखंडन', description: 'खाली स्थान डिस्क पर कैसे फैला है। Copy-on-write विखंडन संभालता है, पर पूल लगभग 80–85% से कम भरा रहना चाहिए।' },
    ],
    bestPractices: [
      'हर पूल को 80–85% से नीचे रखें ताकि खाली स्थान का आवंटन तेज रहे।',
      'एंटरप्राइज डिस्क पर कम से कम मासिक, उपभोक्ता डिस्क पर साप्ताहिक scrub रखें।',
      'ARC हिट अनुपात देखकर तय करें कि अधिक RAM चाहिए या L2ARC उपकरण।',
    ],
    architectureNote: 'OpenZFS फ़ाइल सिस्टम और वॉल्यूम प्रबंधक (Storage Pool Allocator) को जोड़ता है, इसलिए हार्डवेयर RAID या अलग fsck की जरूरत नहीं।',
  },
  pools: {
    id: 'pools',
    title: 'पूल प्रबंधन और VDEV टोपोलॉजी',
    subtitle: 'डिस्क समूह, अतिरेक और समर्पित त्वरक',
    summary: 'स्टोरेज पूल (zpool) ZFS की नींव है। यह वर्चुअल डिवाइस (VDEV) से बनता है। VDEV जोड़कर पूल बढ़ता है। ZFS खाली स्थान के अनुसार उन VDEV पर लेखन बाँटता है।',
    keyConcepts: [
      { label: 'ashift (भौतिक सेक्टर आकार)', description: 'ashift=12 का अर्थ 4096-बाइट सेक्टर है। SSD, NVMe और आधुनिक Advanced Format डिस्क के लिए यही सही है। उन पर ashift=9 लिखने का प्रवर्धन करता है। पूल बनने के बाद ashift नहीं बदलता।' },
      { label: 'VDEV प्रकार (mirror और RAIDZ)', description: '2-वे या 3-वे mirror सबसे अधिक IOPS और सबसे छोटा resilver देता है। RAIDZ2 (RAID-6 जैसा) दो डिस्क विफलता झेलता है और बड़ी सुरक्षित क्षमता के लिए सामान्य विकल्प है।' },
      { label: 'SLOG / ZIL', description: 'कम विलंब और पावर-लॉस सुरक्षा वाला SSD या NVMe, जो समकालिक इंटेंट लॉग रखता है। यह NFS, iSCSI और डेटाबेस कमिट विलंब को सीधे प्रभावित करता है।' },
      { label: 'L2ARC', description: 'SSD या NVMe पर पढ़ने का कैश, जो RAM ARC को बढ़ाता है। RAM से निकले ब्लॉक अभी भी L2ARC से आ सकते हैं।' },
      { label: 'Special VDEV', description: 'तेज NVMe VDEV जो मेटाडेटा वृक्ष और छोटे ब्लॉक (जैसे 16 KB या 32 KB और उससे कम) रखता है और फ़ाइल-भारी कार्य को कई गुना तेज कर सकता है।' },
    ],
    bestPractices: [
      'पूल बनाते समय हमेशा ashift=12 रखें। यह गुण बाद में नहीं बदलता।',
      'SLOG के लिए पावर-लॉस सुरक्षा वाली एंटरप्राइज SSD को mirror में रखें।',
      'पूल डिस्क को हार्डवेयर RAID नियंत्रक के पीछे न रखें। HBA IT मोड में होना चाहिए।',
    ],
    architectureNote: 'बिना अतिरेक वाला एक डेटा VDEV खोने से पूरा पूल नष्ट होता है। अतिरेक (mirror या RAIDZ2/3) हर डेटा VDEV पर होना चाहिए।',
  },
  datasets: {
    id: 'datasets',
    title: 'डेटासेट और ZVOL',
    subtitle: 'संपीड़न, रिकॉर्ड आकार, कोटा और एन्क्रिप्शन प्रति डेटासेट',
    summary: 'डेटासेट पूल के अंदर एक हल्का फ़ाइल सिस्टम है, अपनी विशेषताओं के साथ। ZVOL एक ब्लॉक उपकरण है, वर्चुअल मशीन (KVM/QEMU), iSCSI लक्ष्य या RAW वॉल्यूम के लिए।',
    keyConcepts: [
      { label: 'रिकॉर्ड आकार', description: 'फ़ाइल का अधिकतम ब्लॉक आकार। डिफ़ॉल्ट 128 KB है। PostgreSQL और MySQL InnoDB के लिए 16 KB, ताकि डेटाबेस पृष्ठ से मेल खाए। बड़े मीडिया और बैकअप के लिए 1 MB।' },
      { label: 'इनलाइन संपीड़न (zstd / lz4)', description: 'ZFS लिखने से पहले हर ब्लॉक संपीड़ित करता है। lz4 बहुत तेज है और CPU लगभग नहीं लेता। zstd अधिक संपीड़ित करता है (अक्सर 1.8x–2.5x), स्थान बचाता है और थ्रूपुट बढ़ा सकता है।' },
      { label: 'डुप्लीकेशन (DDT)', description: 'दोहरे ब्लॉक हटाता है। डेडप तालिका को लगभग हर 1 TB डेडप डेटा के लिए 5 GB RAM चाहिए। उस RAM के बिना प्रदर्शन तेजी से गिरता है।' },
      { label: 'मूल एन्क्रिप्शन (AES-256-GCM)', description: 'ZFS में निर्मित ब्लॉक एन्क्रिप्शन, dm-crypt या LUKS के बिना। raw send उस होस्ट पर सिफरटेक्स्ट भेज सकता है जिसके पास कुंजी नहीं है।' },
    ],
    bestPractices: [
      'atime=off रखें ताकि हर पढ़ना मेटाडेटा न लिखे।',
      'lz4 या zstd चालू करें। संपीड़ित डेटा अक्सर तेज पढ़ा जाता है क्योंकि डिस्क कम बाइट ले जाती है।',
      'ZVOL तभी उपयोग करें जब ब्लॉक उपकरण चाहिए। फ़ाइलों के लिए ZFS डेटासेट उपयोग करें।',
    ],
    architectureNote: 'बाल डेटासेट माता-पिता की विशेषताएँ लेते हैं, जब तक कोई विशेषता स्थानीय रूप से न दी जाए।',
  },
  arc: {
    id: 'arc',
    title: 'ARC और L2ARC कैश',
    subtitle: 'Adaptive Replacement Cache कैसे काम करता है और कौन-सी कर्नेल सीमाएँ रखें',
    summary: 'ARC, ZFS का मुख्य प्रदर्शन कैश है। साधारण LRU के विपरीत यह अभी उपयोग हुए डेटा (MRU) और बार-बार उपयोग हुए डेटा (MFU) के बीच संतुलन रखता है।',
    keyConcepts: [
      { label: 'MRU', description: 'हाल में पढ़े ब्लॉक रखता है। बड़ा क्रमिक स्कैन बार-बार उपयोग होने वाले डेटा को RAM से नहीं निकालना चाहिए।' },
      { label: 'MFU', description: 'बार-बार पढ़े जाने वाले ब्लॉक रखता है। वे ब्लॉक सुरक्षित रहते हैं ताकि विलंब कम रहे।' },
      { label: 'आकार सीमा (zfs_arc_max)', description: 'कर्नेल सीमा कि ZFS कितनी RAM ले सकता है। 64 GB होस्ट पर 32–48 GB सामान्य सीमा है, ताकि OS और अनुप्रयोगों के लिए जगह रहे।' },
      { label: 'L2ARC लेखन सीमा', description: 'l2arc_write_max तय करता है कि ZFS कैश SSD कितनी तेजी से भरे, ताकि फ्लैश कैश लेखन से न घिसे।' },
    ],
    bestPractices: [
      'यदि होस्ट KVM या PostgreSQL भी चलाता है तो zfs_arc_max को RAM के लगभग 75% से ऊपर न रखें।',
      'हर 1 GB L2ARC को इंडेक्स हेडर के लिए लगभग 70 MB ARC RAM चाहिए। बहुत बड़ा L2ARC जोड़ने से पहले RAM बढ़ाएँ।',
      'सीमाएँ /etc/modprobe.d/zfs.conf में लिखें ताकि रीबूट के बाद भी रहें।',
    ],
    architectureNote: 'OpenZFS Linux की मेमोरी दबाव देखता है। जब प्रक्रियाओं को RAM चाहिए, ARC स्वयं सिकुड़ता है ताकि OOM killer से बचा जा सके।',
  },
  snapshots: {
    id: 'snapshots',
    title: 'स्नैपशॉट, क्लोन और प्रतिकृति',
    subtitle: 'तुरंत परमाणु प्रतियाँ, तत्काल रोलबैक और वृद्धिशील send/receive',
    summary: 'ZFS स्नैपशॉट एक क्षण की परमाणु प्रति है, जो एक मिलीसेकंड से बहुत कम में बनती है। Copy-on-write के कारण ब्लॉक बदलने तक अतिरिक्त स्थान नहीं लगता। केवल बदले ब्लॉक नया स्थान लेते हैं।',
    keyConcepts: [
      { label: 'शून्य प्रारंभिक लागत', description: 'स्नैपशॉट बनाना मौजूदा ब्लॉक वृक्ष को जमा देता है। उस क्षण डिस्क पर कुछ कॉपी नहीं होता।' },
      { label: 'तत्काल रोलबैक', description: 'डेटासेट को स्नैपशॉट की ठीक स्थिति पर लौटाता है और बाद के बदलाव हटाता है, एक सेकंड से कम में, चाहे कितना भी डेटा बदला हो।' },
      { label: 'लिखने योग्य क्लोन', description: 'स्नैपशॉट से बना नया लिखने योग्य फ़ाइल सिस्टम, लगभग बिना अतिरिक्त स्थान। डेटाबेस परीक्षण और विकास प्रतियों के लिए उपयोगी।' },
      { label: 'वृद्धिशील प्रतिकृति', description: 'दो स्नैपशॉट के बीच बदले ब्लॉक ही भेजता है, SSH या नेटवर्क पर, और संपीड़न बनाए रखता है।' },
    ],
    bestPractices: [
      'प्रतिधारण स्वचालित करें: उदाहरण के लिए प्रति घंटा (24 रखें), प्रति दिन (7 रखें), प्रति सप्ताह (4 रखें)।',
      'बहुत लिखे जाने वाले डेटासेट पर पुराने स्नैपशॉट हटाएँ। वे वह स्थान रोके रखते हैं जो अन्यथा खाली होता।',
      'पूरा डेटासेट वृक्ष और उसकी विशेषताएँ भेजने के लिए zfs send -R उपयोग करें।',
    ],
    architectureNote: 'zfs send ब्लॉक-स्तर की द्विआधारी धारा है। यह सटीक रहती है और rsync द्वारा लाखों छोटी फ़ाइलें चलने की लागत से बचाती है।',
  },
  wizard: {
    id: 'wizard',
    title: 'कॉन्फ़िगरेशन विज़ार्ड',
    subtitle: 'वास्तविक लोड के लिए सुरक्षित पूल और डेटासेट बनाएँ',
    summary: 'विज़ार्ड पूल और डेटासेट बनाने में ashift, रिकॉर्ड आकार और VDEV प्रकार जैसी महत्वपूर्ण सेटिंग छोड़ने से बचाता है। वही प्रवाह टर्मिनल CLI और इस पैनल में है।',
    keyConcepts: [
      { label: 'पैरामीटर जाँच', description: 'आधुनिक डिस्क पर ashift=9 वाला पूल बनने से रोकता है और डिस्क संख्या के अनुसार अतिरेक सुझाता है।' },
      { label: 'लोड प्रीसेट', description: 'Postgres/MySQL के लिए recordsize=16k, VM ZVOL के लिए 8k, और वीडियो तथा बैकअप के लिए 1M सेट करता है।' },
      { label: 'कमांड आउटपुट', description: 'बदलाव लागू करने के साथ विज़ार्ड सटीक zpool और zfs कमांड दिखाता है, परिवर्तन लॉग के लिए।' },
    ],
    bestPractices: [
      'नए पूल के लिए विज़ार्ड उपयोग करें ताकि ashift और अतिरेक एंटरप्राइज अभ्यास से मेल खाएँ।',
      'उत्पादन होस्ट पर लागू करने से पहले बनी कमांड पढ़ें।',
    ],
    architectureNote: 'सहेजा प्रोफ़ाइल दूसरे सर्वर पर /etc/zfs-director/wizard_profile.json से फिर उपयोग हो सकता है।',
  },
  terminal: {
    id: 'terminal',
    title: 'अंतर्निहित टर्मिनल',
    subtitle: 'पैनल से सीधे ZFS और kstat कमांड चलाएँ',
    summary: 'कंसोल OpenZFS उपकरण चलाता है (zpool, zfs, arcstat, zdb, arc_summary), सबसे अधिक उपयोग होने वाली निदान कमांड के शॉर्टकट के साथ।',
    keyConcepts: [
      { label: 'कर्नेल निरीक्षण (kstat)', description: 'विस्तृत निदान के लिए /proc/spl/kstat/zfs/ के मॉड्यूल काउंटर पढ़ता है।' },
      { label: 'I/O टेलीमेट्री', description: 'हर डिस्क और VDEV के लिए विलंब, बैंडविड्थ और प्रति सेकंड पढ़ने/लिखने की क्रियाएँ दिखाता है।' },
    ],
    bestPractices: [
      'zpool status -v से देखें कि checksum त्रुटि किसी निश्चित फ़ाइल का नाम लेती है या नहीं।',
      'व्यस्त उत्पादन पूल पर zdb से बचें, जब तक गहरी मरम्मत न हो रही हो।',
    ],
    architectureNote: 'कंसोल स्थानीय सर्वर से REST API पर बात करता है, इसलिए हर कमांड लॉग होती है और उत्तर इसी होस्ट पर रहता है।',
  },
  reports: {
    id: 'reports',
    title: 'निदान रिपोर्ट और लाइव बेंचमार्क',
    subtitle: 'IOPS और विलंब मापें, और scrub अखंडता का इतिहास रखें',
    summary: 'यह पृष्ठ पूल प्रदर्शन मापता है (क्रमिक MB/s, 4K यादृच्छिक IOPS, औसत विलंब और ARC हिट अनुपात) और scrub तथा डिस्क-अखंडता ऑडिट का इतिहास रखता है।',
    keyConcepts: [
      { label: 'IOPS और विलंब', description: 'ARC से पूरी हुई पढ़ाइयों (अक्सर 0.2 ms से कम) की तुलना डिस्क और NVMe SLOG पर समकालिक लेखन से करता है।' },
      { label: 'ऐतिहासिक अखंडता और bit-rot', description: 'आवधिक zpool scrub के दौरान Fletcher4 द्वारा मिली और ठीक की गई checksum त्रुटियाँ दर्ज करता है।' },
      { label: 'निर्यात योग्य रिपोर्ट', description: 'अवसंरचना ऑडिट के लिए वर्तमान रिपोर्ट Markdown, JSON या CSV में डाउनलोड होती है।' },
    ],
    bestPractices: [
      'लोड परीक्षण तब चलाएँ जब अनुप्रयोग शांत हों, ताकि उत्पादन I/O से प्रतिस्पर्धा न हो।',
      'SLOG या L2ARC जोड़ने से पहले और बाद में परीक्षण की तुलना करें ताकि लाभ दिखे।',
    ],
    architectureNote: 'OpenZFS लेखन को लगभग हर 5 सेकंड में लेनदेन समूहों में बाँधता है और बिखरे लेखन को बड़े क्रमिक लेखन में बदलता है।',
  },
  deployment: {
    id: 'deployment',
    title: 'स्थापना पैकेज और सेवा नियंत्रण',
    subtitle: 'Linux पैकेज का लेआउट, zfs-mgr.sh और systemd इकाई',
    summary: 'सूट एक निर्देशिका में रहती है और zfs-mgr.sh से नियंत्रित होती है: एक कमांड सेवा शुरू, रोक या पुनः आरंभ करती है। Python CLI और विज़ार्ड चलाता है; Rust इंजन वैकल्पिक बाइनरी है।',
    keyConcepts: [
      { label: 'zfs-mgr.sh', description: 'start वेब पैनल पृष्ठभूमि में चलाता है, stop उन प्रक्रियाओं को समाप्त कर पोर्ट मुक्त करता है, status दर्ज PID बताता है।' },
      { label: 'Python CLI और वैकल्पिक Rust इंजन', description: 'Python प्रशासनिक CLI और विज़ार्ड चलाता है। Rust crate वैकल्पिक Axum सेवा है; पैनल स्वयं Node प्रक्रिया देता है।' },
      { label: 'systemd', description: 'zfs-enterprise.service बूट के बाद पैनल शुरू कर सकता है, जब zfs.target लोड हो चुका हो।' },
    ],
    bestPractices: [
      'कॉन्फ़िगरेशन बदलाव से पहले और बाद में ./zfs-mgr.sh status जाँचें।',
      'परीक्षण वातावरण में बड़े संपादन से पहले zfs_state.json की प्रतिलिपि लें।',
    ],
    architectureNote: 'पैकेज स्वयंपूर्ण है और Ubuntu, Debian, Proxmox या RHEL पर रखा जा सकता है। Node.js 22 या नया होने पर bash start.sh से शुरू करें।',
  },
  logs: {
    id: 'logs',
    title: 'सिस्टम लॉग और ZED डेमन',
    subtitle: 'zfs.ko घटनाएँ, I/O त्रुटियाँ और SMART जाँच',
    summary: 'ZED और zfs.ko मॉड्यूल टोपोलॉजी बदलाव, लेनदेन-समूह सिंक, checksum त्रुटियाँ और scrub या trim दर्ज करते हैं। लॉग दृश्य इन घटनाओं को प्रवाहित करता है और फ़िल्टर करने देता है।',
    keyConcepts: [
      { label: 'ZED (ZFS Event Daemon)', description: '/dev/zfs की घटनाएँ देखता है। डिस्क दोष पर हॉट स्पेयर सक्रिय कर सकता है या व्यवस्थापक को सूचित कर सकता है।' },
      { label: 'Checksum ereport और स्व-उपचार', description: 'दूषित ब्लॉक ereport.fs.zfs.checksum बनाता है। कर्नेल उसे mirror या पैरिटी प्रति से ठीक करता है और सेवा रोके बिना ZED को बताता है।' },
      { label: 'SMART डेमन (smartd)', description: 'डिस्क पूरी तरह विफल होने से पहले तापमान, चालू घंटे, पुनः आवंटित सेक्टर और NVMe घिसाव ट्रैक करता है।' },
    ],
    bestPractices: [
      'हर OpenZFS होस्ट पर zed.service चालू करें ताकि दोष पृष्ठभूमि में दिखें।',
      'बेंचमार्क या resilver के दौरान स्वतः ताज़ाकरण चालू करें ताकि विलंब परिवर्तन दिखें।',
      'ऑडिट संग्रह चाहिए तो लॉग JSON या सादे पाठ में निर्यात करें।',
    ],
    architectureNote: 'ZFS घटनाएँ Linux कर्नेल ट्रेस और systemd-journald में भेजता है, ताकि स्टोरेज त्रुटियाँ उपकरण स्वास्थ्य के साथ मिल सकें।',
  },
  scheduler: {
    id: 'scheduler',
    title: 'Scrub अनुसूचक और रखरखाव खिड़कियाँ',
    subtitle: 'हर ब्लॉक उस समय जाँचें जब उपयोगकर्ताओं को बाधा न हो',
    summary: 'Scrub पूल का हर ब्लॉक पढ़ता है और Fletcher4 या SHA-256 checksum जाँचता है। cron कार्य या systemd टाइमर यह जाँच शांत खिड़की में चलाता है, अक्सर UTC 02:00–08:00।',
    keyConcepts: [
      { label: 'रखरखाव खिड़कियाँ', description: 'भारी scrub पढ़ना कम ट्रैफ़िक के घंटों (रात या सप्ताहांत) में रखें ताकि उत्पादन IOPS उपलब्ध रहें।' },
      { label: 'विराम और सीमा', description: 'zpool scrub -p scrub रोकता है और बाद में जारी हो सकता है। CPU या डिस्क सीमा पार करने पर अनुसूचक भी रोक सकता है।' },
      { label: 'कितनी बार', description: 'हार्ड डिस्क: हर एक या दो सप्ताह। SSD और NVMe: लगभग मासिक, क्योंकि यांत्रिक जोखिम नहीं और अतिरिक्त पढ़ना फ्लैश घिसता है।' },
    ],
    bestPractices: [
      'यदि दो पूल एक ही SAS नियंत्रक साझा करते हैं तो एक साथ scrub न करें।',
      'अधिकतम अवधि रखें ताकि कार्यदिवस शुरू होने से पहले scrub रुक जाए।',
      'समय के साथ scrub अवधि देखें। लगातार धीमा scrub अक्सर घटती डिस्क का संकेत है।',
    ],
    architectureNote: 'Scrub पृष्ठभूमि में कम I/O प्राथमिकता पर चलता है। विखंडित हार्ड-डिस्क पूल पर यह फिर भी यादृच्छिक पढ़ने का विलंब बढ़ा सकता है।',
  },
};

const ar: Record<string, TopicText> = {
  dashboard: {
    id: 'dashboard',
    title: 'نظرة على الأسطول وقياس OpenZFS',
    subtitle: 'مراقبة مباشرة لصحة الأقراص وسلامة البيانات وأداء الذاكرة المخبأة',
    summary: 'لوحة التحكم الرئيسية عرض واحد لمجموعة التخزين. تعرض السعة الإجمالية وسلامة الفحص (scrub) وعمليات الإدخال والإخراج في الثانية، ومدى كفاءة ذاكرة الاستبدال التكيفية (ARC) في استخدام الذاكرة.',
    keyConcepts: [
      { label: 'سلامة البيانات مع الإصلاح الذاتي', description: 'يحسب ZFS مجموع تحقق (Fletcher4 أو SHA-256) لكل كتلة. إذا اكتُشف تلف صامت، تُصلح الكتلة من نسخة احتياطية أثناء القراءة أو أثناء scrub.' },
      { label: 'نسبة إصابة ARC', description: 'حصة القراءات التي تُلبى من الذاكرة بزمن أقل من ميكروثانية دون لمس الأقراص. القيم فوق 90% معتادة في مضيف سليم.' },
      { label: 'تجزؤ المجمع', description: 'كيف يتوزع الفراغ على الأقراص. النسخ عند الكتابة يتحمل التجزؤ، لكن يجب أن يبقى المجمع تحت نحو 80–85% امتلاء.' },
    ],
    bestPractices: [
      'أبقِ كل مجمع تحت 80–85% حتى يبقى تخصيص الفراغ سريعا.',
      'جدول فحص scrub شهريا على الأقل لأقراص المؤسسات، أو أسبوعيا للأقراص الاستهلاكية.',
      'راقب نسبة إصابة ARC لتقرر إن كان المضيف يحتاج ذاكرة أكثر أو جهاز L2ARC.',
    ],
    architectureNote: 'يجمع OpenZFS نظام الملفات ومدير وحدات التخزين (مخصص مجمع التخزين)، لذلك لا حاجة إلى RAID عتادي ولا إلى fsck منفصل.',
  },
  pools: {
    id: 'pools',
    title: 'إدارة المجمعات وبنية VDEV',
    subtitle: 'مجموعات الأقراص وتخطيطات التكرار والمسرّعات المخصصة',
    summary: 'مجمع التخزين (zpool) هو أساس ZFS. يُبنى من أجهزة افتراضية (VDEV). يكبر المجمع بإضافة VDEV. يوزع ZFS الكتابات على هذه الأجهزة حسب الفراغ المتاح.',
    keyConcepts: [
      { label: 'ashift (حجم القطاع الفيزيائي)', description: 'ashift=12 يعني قطاعات بحجم 4096 بايت. هذا الإعداد الصحيح لـ SSD وNVMe وأقراص الصيغة المتقدمة. ashift=9 على هذه الأقراص يسبب تضخيم الكتابة. لا يمكن تغيير ashift بعد إنشاء المجمع.' },
      { label: 'أنواع VDEV (المرآة وRAIDZ)', description: 'المرآة الثنائية أو الثلاثية تعطي أعلى IOPS وأقصر إعادة بناء. RAIDZ2 (شبيه بـ RAID-6) يتحمل عطل قرصين وهو الخيار المعتاد للسعة الكبيرة الآمنة.' },
      { label: 'SLOG / ZIL', description: 'قرص SSD أو NVMe منخفض الكمون مع حماية من انقطاع الطاقة يحمل سجل النية المتزامن. يؤثر مباشرة في NFS وiSCSI وكمون تثبيت قواعد البيانات.' },
      { label: 'L2ARC', description: 'ذاكرة قراءة على SSD أو NVMe تمد ARC في الذاكرة. الكتل المطرودة من الذاكرة يمكن أن تُخدم من L2ARC.' },
      { label: 'VDEV الخاص', description: 'جهاز NVMe سريع يخزن شجرة البيانات الوصفية والكتل الصغيرة (مثل 16 ك.ب أو 32 ك.ب فأقل) ويمكن أن يسرع أحمال الملفات عدة مرات.' },
    ],
    bestPractices: [
      'اضبط ashift=12 دائما عند إنشاء المجمع. لا يمكن تغيير هذه الخاصية لاحقا.',
      'استخدم لـ SLOG قرص SSD مؤسسي مع حماية من انقطاع الطاقة، في مرآة.',
      'لا تضع أقراص المجمع خلف متحكم RAID عتادي. يجب أن يكون HBA في وضع IT.',
    ],
    architectureNote: 'فقدان جهاز بيانات واحد بلا تكرار يدمر المجمع كله. التكرار (مرآة أو RAIDZ2/3) يكون على كل جهاز بيانات.',
  },
  datasets: {
    id: 'datasets',
    title: 'مجموعات البيانات وZVOL',
    subtitle: 'الضغط وحجم السجل والحصص والتشفير لكل مجموعة',
    summary: 'مجموعة البيانات نظام ملفات خفيف داخل المجمع بخصائص خاصة. ZVOL جهاز كتل يُستخدم للآلات الافتراضية (KVM/QEMU) أو أهداف iSCSI أو وحدات RAW.',
    keyConcepts: [
      { label: 'حجم السجل', description: 'أكبر حجم لكتلة الملف. الافتراضي 128 ك.ب. استخدم 16 ك.ب لـ PostgreSQL وMySQL InnoDB ليطابق صفحة قاعدة البيانات. استخدم 1 م.ب للوسائط الكبيرة والنسخ الاحتياطي.' },
      { label: 'ضغط مباشر (zstd / lz4)', description: 'يضغط ZFS كل كتلة قبل الكتابة. lz4 سريع جدا ويكاد لا يستهلك المعالج. zstd يضغط أكثر (غالبا 1.8 مرة إلى 2.5) ويوفر المساحة وقد يرفع الإنتاجية.' },
      { label: 'إزالة التكرار (DDT)', description: 'يحذف الكتل المكررة. جدول إزالة التكرار يحتاج نحو 5 ج.ب من الذاكرة لكل 1 ت.ب من البيانات المزالة تكرارها. من دون هذه الذاكرة ينهار الأداء.' },
      { label: 'تشفير أصلي (AES-256-GCM)', description: 'تشفير على مستوى الكتل داخل ZFS من دون dm-crypt أو LUKS. يمكن لإرسال خام أن ينسخ النص المشفر إلى مضيف لا يملك المفتاح.' },
    ],
    bestPractices: [
      'اضبط atime=off حتى لا تعيد كل قراءة كتابة البيانات الوصفية.',
      'فعّل lz4 أو zstd. البيانات المضغوطة تُقرأ غالبا أسرع لأن القرص ينقل بايتات أقل.',
      'استخدم ZVOL فقط عند الحاجة إلى جهاز كتل. للملفات استخدم مجموعة بيانات ZFS.',
    ],
    architectureNote: 'ترث المجموعات الفرعية خصائص الأصل ما لم تُضبط خاصية محليا.',
  },
  arc: {
    id: 'arc',
    title: 'ذاكرة ARC وL2ARC المخبأة',
    subtitle: 'كيف تعمل ذاكرة الاستبدال التكيفية وأي حدود للنواة تُضبط',
    summary: 'ARC هي ذاكرة الأداء الرئيسة في ZFS. بخلاف LRU البسيط، تحافظ على توازن بين البيانات المستخدمة قبل لحظة (MRU) والبيانات المستخدمة كثيرا (MFU).',
    keyConcepts: [
      { label: 'MRU', description: 'تحتفظ بالكتل المقروءة حديثا. يجب ألا يطرد المسح التسلسلي الكبير البيانات المستخدمة كثيرا من الذاكرة.' },
      { label: 'MFU', description: 'تحتفظ بالكتل التي تُقرأ مرارا. تبقى هذه الكتل محمية ليظل الكمون منخفضا.' },
      { label: 'سقف الحجم (zfs_arc_max)', description: 'حد النواة لذاكرة RAM التي يجوز لـ ZFS استخدامها. على مضيف 64 ج.ب، 32–48 ج.ب سقف معتاد ويترك مكانا للنظام والتطبيقات.' },
      { label: 'حد كتابة L2ARC', description: 'l2arc_write_max يحد سرعة ملء قرص الكاش حتى لا تبلى الذاكرة الوميضية بكتابات الكاش.' },
    ],
    bestPractices: [
      'لا تضبط zfs_arc_max فوق نحو 75% من الذاكرة إذا كان المضيف يشغل أيضا KVM أو PostgreSQL.',
      'كل 1 ج.ب من L2ARC يحتاج نحو 70 م.ب من ذاكرة ARC لترويسات الفهرس. أضف ذاكرة قبل L2ARC كبير جدا.',
      'ضع الحدود في /etc/modprobe.d/zfs.conf حتى تبقى بعد إعادة التشغيل.',
    ],
    architectureNote: 'يراقب OpenZFS ضغط ذاكرة Linux. عندما تحتاج العمليات إلى RAM تتقلص ARC من تلقاء نفسها لتجنب قاتل نفاد الذاكرة.',
  },
  snapshots: {
    id: 'snapshots',
    title: 'اللقطات والنسخ والاستنساخ',
    subtitle: 'نسخ ذرية فورية وتراجع فوري وإرسال واستقبال تزايدي',
    summary: 'لقطة ZFS نسخة ذرية للحظة تُنشأ في أقل بكثير من ميلي ثانية. بسبب النسخ عند الكتابة لا تستهلك مساحة إضافية حتى تتغير الكتل. الكتل المعدلة وحدها تستهلك مساحة جديدة.',
    keyConcepts: [
      { label: 'لقطات بلا كلفة أولية', description: 'إنشاء اللقطة يجمد شجرة الكتل القائمة. لا يُنسخ شيء على القرص في تلك اللحظة.' },
      { label: 'تراجع فوري', description: 'يعيد مجموعة البيانات إلى حالة اللقطة تماما ويلغي التغييرات اللاحقة في أقل من ثانية، مهما كان حجم البيانات المتغيرة.' },
      { label: 'نسخ قابلة للكتابة', description: 'نظام ملفات جديد قابل للكتابة يُنشأ من لقطة، بلا مساحة إضافية تقريبا. مفيد لاختبارات قواعد البيانات ونسخ التطوير.' },
      { label: 'استنساخ تزايدي', description: 'يرسل فقط الكتل التي تغيرت بين لقطتين، عبر SSH أو الشبكة، ويحافظ على الضغط.' },
    ],
    bestPractices: [
      'أتمت الاحتفاظ: مثلا كل ساعة (أبقِ 24) ويوميا (أبقِ 7) وأسبوعيا (أبقِ 4).',
      'احذف اللقطات القديمة على المجموعات كثيرة الكتابة. إنها تحتجز مساحة كانت ستتحرر.',
      'استخدم zfs send -R لاستنساخ شجرة مجموعات كاملة وخصائصها.',
    ],
    architectureNote: 'zfs send تيار ثنائي على مستوى الكتل. يبقى دقيقا ويتجنب كلفة أن يمر rsync على ملايين الملفات الصغيرة.',
  },
  wizard: {
    id: 'wizard',
    title: 'معالج الإعداد',
    subtitle: 'ابنِ مجمعا ومجموعات تناسب الحمل الفعلي',
    summary: 'يساعد المعالج على إنشاء المجمعات والمجموعات من دون إغفال إعدادات حرجة مثل ashift وحجم السجل ونوع VDEV. المسار نفسه موجود في واجهة الطرفية وفي هذه اللوحة.',
    keyConcepts: [
      { label: 'فحص المعاملات', description: 'يمنع إنشاء مجمع بـ ashift=9 على الأقراص الحديثة ويقترح تكرارا يناسب عدد الأقراص.' },
      { label: 'إعدادات الحمل', description: 'يضبط recordsize=16k لـ Postgres/MySQL و8k لوحدات ZVOL الافتراضية و1M للفيديو والنسخ الاحتياطي.' },
      { label: 'مخرجات الأوامر', description: 'إلى جانب تطبيق التغيير يعرض المعالج أوامر zpool وzfs الدقيقة لسجل التغيير.' },
    ],
    bestPractices: [
      'استخدم المعالج للمجمعات الجديدة حتى يطابق ashift والتكرار ممارسة المؤسسات.',
      'اقرأ الأوامر المولدة قبل تطبيقها على مضيف إنتاج.',
    ],
    architectureNote: 'يمكن إعادة استخدام ملف محفوظ على خادم آخر من /etc/zfs-director/wizard_profile.json.',
  },
  terminal: {
    id: 'terminal',
    title: 'الطرفية المدمجة',
    subtitle: 'شغّل أوامر ZFS وkstat من اللوحة مباشرة',
    summary: 'تشغل وحدة التحكم أدوات OpenZFS‏ (zpool وzfs وarcstat وzdb وarc_summary) مع اختصارات لأوامر التشخيص الأكثر استخداما.',
    keyConcepts: [
      { label: 'استبطان النواة (kstat)', description: 'يقرأ عدادات وحدة النواة تحت /proc/spl/kstat/zfs/ لتشخيص مفصل.' },
      { label: 'قياس الإدخال والإخراج', description: 'يعرض الكمون وعرض النطاق وعمليات القراءة والكتابة في الثانية لكل قرص ولكل VDEV.' },
    ],
    bestPractices: [
      'استخدم zpool status -v لترى إن كان خطأ مجموع التحقق يسمي ملفا بعينه.',
      'تجنب zdb على مجمع إنتاج مشغول إلا عند إصلاح عميق.',
    ],
    architectureNote: 'تتحدث وحدة التحكم مع الخادم المحلي عبر واجهة REST، لذلك يُسجل كل أمر وتبقى الإجابة على هذا المضيف.',
  },
  reports: {
    id: 'reports',
    title: 'تقارير التشخيص واختبارات الأداء الحية',
    subtitle: 'قس IOPS والكمون واحتفظ بتاريخ سلامة الفحص',
    summary: 'تقيس هذه الصفحة أداء المجمع (ميغابايت/ثا التسلسلية وIOPS العشوائية 4K والكمون المتوسط ونسبة إصابة ARC) وتحتفظ بتاريخ فحوص scrub وتدقيق سلامة الأقراص.',
    keyConcepts: [
      { label: 'IOPS والكمون', description: 'يقارن القراءات المخدومة من ARC (غالبا تحت 0.2 مللي ثانية) بالكتابات المتزامنة إلى الأقراص وإلى SLOG من نوع NVMe.' },
      { label: 'السلامة التاريخية وتلف البتات', description: 'يسجل أخطاء مجموع التحقق التي وجدها Fletcher4 وأصلحها أثناء zpool scrub دوري.' },
      { label: 'تقارير قابلة للتصدير', description: 'ينزل التقرير الحالي بصيغة Markdown أو JSON أو CSV لتدقيق البنية.' },
    ],
    bestPractices: [
      'شغّل اختبارات الحمل عندما تكون التطبيقات هادئة حتى لا تنافس إدخال وإخراج الإنتاج.',
      'قارن اختبارا قبل إضافة SLOG أو L2ARC وبعدها حتى يظهر المكسب.',
    ],
    architectureNote: 'يجمع OpenZFS الكتابات في مجموعات معاملات كل نحو 5 ثوان ويحول الكتابات المتناثرة إلى كتابات تسلسلية أكبر.',
  },
  deployment: {
    id: 'deployment',
    title: 'حزمة التثبيت والتحكم بالخدمة',
    subtitle: 'تخطيط حزمة Linux وzfs-mgr.sh ووحدة systemd',
    summary: 'تعيش الحزمة في دليل واحد وتُدار عبر zfs-mgr.sh: أمر واحد يبدأ الخدمة أو يوقفها أو يعيد تشغيلها. Python يغطي واجهة الأوامر والمعالج؛ محرك Rust برنامج اختياري.',
    keyConcepts: [
      { label: 'zfs-mgr.sh', description: 'start يطلق لوحة الويب في الخلفية، وstop ينهي تلك العمليات ويحرر المنفذ، وstatus يبلغ عن معرف العملية المسجل.' },
      { label: 'واجهة Python ومحرك Rust الاختياري', description: 'يشغل Python واجهة الإدارة والمعالج. حزمة Rust خدمة Axum اختيارية؛ اللوحة نفسها يقدمها عملية Node.' },
      { label: 'systemd', description: 'يمكن لـ zfs-enterprise.service أن يبدأ اللوحة بعد الإقلاع عندما يكتمل تحميل zfs.target.' },
    ],
    bestPractices: [
      'تحقق من ./zfs-mgr.sh status قبل تغيير الإعداد وبعده.',
      'انسخ zfs_state.json قبل التعديلات الكبيرة في بيئة اختبار.',
    ],
    architectureNote: 'الحزمة قائمة بذاتها ويمكن وضعها على Ubuntu أو Debian أو Proxmox أو RHEL. ابدأها بـ bash start.sh بعد تثبيت Node.js 22 أو أحدث.',
  },
  logs: {
    id: 'logs',
    title: 'سجلات النظام وخدمة ZED',
    subtitle: 'أحداث zfs.ko وأخطاء الإدخال والإخراج وفحوص SMART',
    summary: 'تسجل ZED ووحدة zfs.ko تغييرات البنية ومزامنة مجموعات المعاملات وأخطاء مجموع التحقق وعمليات scrub أو trim. تعرض نافذة السجلات هذه الأحداث وتسمح بترشيحها.',
    keyConcepts: [
      { label: 'ZED (خدمة أحداث ZFS)', description: 'تراقب أحداث /dev/zfs. عند عطل قرص يمكنها تفعيل قرص احتياطي ساخن أو إعلام مسؤول.' },
      { label: 'تقارير checksum والإصلاح الذاتي', description: 'الكتلة التالفة تنتج ereport.fs.zfs.checksum. تصلحها النواة من مرآة أو تماثل وتعلم ZED من دون إيقاف الخدمة.' },
      { label: 'خدمة SMART‏ (smartd)', description: 'تتابع الحرارة وساعات التشغيل والقطاعات المعاد تخصيصها وتآكل NVMe قبل أن يفشل القرص تماما.' },
    ],
    bestPractices: [
      'فعّل zed.service على كل مضيف OpenZFS حتى تُلاحظ الأعطال في الخلفية.',
      'شغّل التحديث التلقائي أثناء اختبار أو إعادة بناء لترى تغيرات الكمون.',
      'صدّر السجلات JSON أو نصا عاديا عندما تحتاج أرشيفا للتدقيق.',
    ],
    architectureNote: 'يرسل ZFS الأحداث إلى مسار تتبع نواة Linux وإلى systemd-journald، فيمكن مواءمة أخطاء التخزين مع صحة الجهاز.',
  },
  scheduler: {
    id: 'scheduler',
    title: 'جدولة scrub ونوافذ الصيانة',
    subtitle: 'افحص كل كتلة في وقت لا يزعج المستخدمين',
    summary: 'يقرأ scrub كل كتلة في المجمع ويتحقق من مجموع Fletcher4 أو SHA-256. مهمة cron أو مؤقت systemd تشغل هذا الفحص في نافذة هادئة، غالبا من 02:00 إلى 08:00 بالتوقيت العالمي.',
    keyConcepts: [
      { label: 'نوافذ الصيانة', description: 'أبقِ قراءة scrub الثقيلة في ساعات الحركة المنخفضة (ليلا أو في عطلة نهاية الأسبوع) حتى تبقى IOPS الإنتاج متاحة.' },
      { label: 'الإيقاف المؤقت والحد', description: 'zpool scrub -p يوقف الفحص مؤقتا ويمكن استئنافه لاحقا. يمكن للجدولة أيضا أن توقف عندما يتجاوز المعالج أو القرص عتبة.' },
      { label: 'التكرار', description: 'الأقراص الميكانيكية: كل أسبوع أو أسبوعين. SSD وNVMe: نحو مرة في الشهر، لأنه لا خطر ميكانيكي والقراءات الإضافية تبلي الذاكرة الوميضية.' },
    ],
    bestPractices: [
      'لا تفحص مجمعين في الوقت نفسه إذا كانا يشاركان متحكم SAS نفسه.',
      'حدد مدة قصوى حتى ينتهي الفحص قبل بدء يوم العمل.',
      'راقب مدة الفحص عبر الزمن. فحص يطول باستمرار غالبا ما يعني قرصا يتدهور.',
    ],
    architectureNote: 'يعمل الفحص في الخلفية بأولوية إدخال وإخراج منخفضة. على مجمع أقراص ميكانيكية مجزأ قد يرفع مع ذلك كمون القراءة العشوائية.',
  },
};

const LOCALIZED: Partial<Record<Language, Record<string, TopicText>>> = {
  es,
  de,
  fr,
  zh,
  hi,
  ar,
};

export function resolveInfoTopic(lang: Language, topic: InfoBoxTopic | null): InfoBoxTopic | null {
  if (!topic) return null;
  const id = topic.id;
  const english = ZFS_KNOWLEDGE_BASE_EN[id];
  const albanian = ZFS_KNOWLEDGE_BASE[id];
  const translated = LOCALIZED[lang]?.[id];
  const chosen =
    lang === 'sq' ? albanian || topic :
    lang === 'en' ? english || topic :
    translated || english || topic;
  return {
    ...chosen,
    shellCommands: english?.shellCommands || topic.shellCommands,
  };
}

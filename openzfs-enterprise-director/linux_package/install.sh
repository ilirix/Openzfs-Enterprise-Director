#!/usr/bin/env bash
# ==============================================================================
# OpenZFS Enterprise Director - Automated Root Installer
# Instalon te gjithe paketen ne /root/zfs-enterprise-suite/ dhe konfiguron sherbimin.
# ==============================================================================

set -e

INSTALL_DIR="/root/zfs-enterprise-suite"
SYSTEMD_PATH="/etc/systemd/system/zfs-enterprise.service"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}"
echo "======================================================================"
echo "    INSTALUESI AUTOMATIK: OPENZFS ENTERPRISE DIRECTOR               "
echo "    Target Directory: ${INSTALL_DIR}                                "
echo "======================================================================"
echo -e "${NC}"

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[GABIM] Ju lutem ekzekutoni kete script si ROOT (sudo ./install.sh)!${NC}"
    exit 1
fi

echo -e "${CYAN}[1/5] Duke kontrolluar paketat baze te sistemit...${NC}"
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y zfsutils-linux python3 python3-pip curl git nodejs npm lsof || true
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y zfs python3 python3-pip curl git nodejs npm lsof || true
fi

echo -e "${CYAN}[2/5] Duke pergatitur dosjen e instalimit ne ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"
SCRIPT_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Kopjo skedaret ne /root/zfs-enterprise-suite
cp -rf "$SCRIPT_SOURCE"/* "$INSTALL_DIR/" || true
chmod +x "$INSTALL_DIR/zfs-mgr.sh" || true
chmod +x "$INSTALL_DIR/linux_package/zfs-mgr.sh" || true
chmod +x "$INSTALL_DIR/linux_package/python_cli"/*.py || true

echo -e "${CYAN}[3/5] Duke instaluar varesite e aplikacionit (Node.js & Python)...${NC}"
cd "$INSTALL_DIR"
if command -v npm >/dev/null 2>&1; then
    npm install --production=false || true
    npm run build || true
fi

echo -e "${CYAN}[4/5] Duke konfiguruar sherbimin Systemd (zfs-enterprise.service)...${NC}"
cat <<EOF > "$SYSTEMD_PATH"
[Unit]
Description=OpenZFS Enterprise Director Web & CLI Service
After=network.target zfs.target
Wants=zfs.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/env npm run dev
Restart=always
RestartSec=5
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload || true
systemctl enable zfs-enterprise.service || true

# Krijimi i symlink per qasje te lehte nga kudo ne terminal
ln -sf "$INSTALL_DIR/zfs-mgr.sh" /usr/local/bin/zfs-mgr || true

echo -e "${GREEN}"
echo "======================================================================"
echo "           INSTALIMI U PERFUNDUA ME SUKSES!                           "
echo "======================================================================"
echo -e "${NC}"
echo "Ju mund ta perdorni programin ne terminal me komandat:"
echo "  1. zfs-mgr start       -> Nis panelin Web dhe Daemon-in"
echo "  2. zfs-mgr stop        -> Ndalon sherbimin"
echo "  3. zfs-mgr status      -> Shfaq gjendjen dhe metrikat ARC"
echo "  4. zfs-mgr cli         -> CLI ZFS ne Python"
echo "  5. zfs-mgr wizard      -> Config Wizard interaktiv"
echo ""
echo "Paneli Web eshte i gatshem ne: http://localhost:3000"
echo "Dosja e plote ndodhet ne: ${INSTALL_DIR}"

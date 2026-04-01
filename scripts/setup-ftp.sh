#!/usr/bin/env bash
# setup-ftp.sh — Install and start the PhotoPro FTP server on VPS
# Run as root from the repo root: sudo bash scripts/setup-ftp.sh

set -euo pipefail

PHOTOPRO_DIR="/opt/photopro"
FTP_ROOT="${FTP_ROOT:-/photopro_upload}"

echo "=== PhotoPro FTP Setup ==="

# ── 1. Copy files ─────────────────────────────────────────────────────────────
echo "[1/5] Copying files to ${PHOTOPRO_DIR}..."
mkdir -p "${PHOTOPRO_DIR}"
cp backend/photopro/ftp_server.py "${PHOTOPRO_DIR}/ftp_server.py"

# ── 2. Install Python dependencies ────────────────────────────────────────────
echo "[2/5] Installing Python dependencies..."
if [ -d "${PHOTOPRO_DIR}/venv" ]; then
    PYTHON="${PHOTOPRO_DIR}/venv/bin/python"
    PIP="${PHOTOPRO_DIR}/venv/bin/pip"
else
    # Create venv if it doesn't exist yet
    python3 -m venv "${PHOTOPRO_DIR}/venv"
    PYTHON="${PHOTOPRO_DIR}/venv/bin/python"
    PIP="${PHOTOPRO_DIR}/venv/bin/pip"
fi

"${PIP}" install --quiet pyftpdlib redis psycopg2-binary

# ── 3. Create FTP root directory ──────────────────────────────────────────────
echo "[3/5] Creating FTP root directory ${FTP_ROOT}..."
mkdir -p "${FTP_ROOT}"
chmod 755 "${FTP_ROOT}"

# ── 4. Install systemd service ────────────────────────────────────────────────
echo "[4/5] Installing systemd service..."
cp scripts/photopro-ftp.service /etc/systemd/system/photopro-ftp.service
systemctl daemon-reload

# ── 5. Enable and start ───────────────────────────────────────────────────────
echo "[5/5] Enabling and starting photopro-ftp service..."
systemctl enable photopro-ftp
systemctl restart photopro-ftp
systemctl status photopro-ftp --no-pager

echo ""
echo "FTP server is running on port 21 (passive 21000-21099)"
echo "Make sure ports 21 and 21000-21099/tcp are open in your firewall."
echo ""
echo "Firewall commands (ufw):"
echo "  ufw allow 21/tcp"
echo "  ufw allow 21000:21099/tcp"

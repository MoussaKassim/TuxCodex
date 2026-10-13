#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_BUILD_DIR="$(mktemp -d -t codex_deb_build_XXXXXX)"
TMP_OUT_DIR="$(mktemp -d -t codex_deb_out_XXXXXX)"
OUTPUT_DIR="${SCRIPT_DIR}/dist"
PKG_VERSION="1.0.0"
DEB_NAME="codex-desktop_${PKG_VERSION}_all.deb"

echo "=== Building Debian Package: ${DEB_NAME} ==="

mkdir -p "${TMP_BUILD_DIR}/DEBIAN"
mkdir -p "${TMP_BUILD_DIR}/usr/bin"
mkdir -p "${TMP_BUILD_DIR}/usr/lib/python3/dist-packages/codex_desktop"
mkdir -p "${TMP_BUILD_DIR}/usr/share/applications"
mkdir -p "${TMP_BUILD_DIR}/usr/share/icons/hicolor/scalable/apps"
mkdir -p "${TMP_BUILD_DIR}/usr/share/doc/codex-desktop"
mkdir -p "${OUTPUT_DIR}"

# 1. Copy control file
cp "${SCRIPT_DIR}/debian/control" "${TMP_BUILD_DIR}/DEBIAN/control"
chmod 644 "${TMP_BUILD_DIR}/DEBIAN/control"
chmod 755 "${TMP_BUILD_DIR}/DEBIAN"

# 2. Copy python package files (excluding pycache)
cp -r "${SCRIPT_DIR}/codex_desktop/"* "${TMP_BUILD_DIR}/usr/lib/python3/dist-packages/codex_desktop/"
find "${TMP_BUILD_DIR}/usr/lib/python3/dist-packages/codex_desktop" -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find "${TMP_BUILD_DIR}/usr/lib/python3/dist-packages/codex_desktop" -name "*.pyc" -delete 2>/dev/null || true
find "${TMP_BUILD_DIR}/usr/lib/python3/dist-packages/codex_desktop" -type d -exec chmod 755 {} +
find "${TMP_BUILD_DIR}/usr/lib/python3/dist-packages/codex_desktop" -type f -exec chmod 644 {} +

# 3. Create launcher in /usr/bin/codex-desktop
cat << 'LAUNCHER_EOF' > "${TMP_BUILD_DIR}/usr/bin/codex-desktop"
#!/usr/bin/env python3
import sys
from codex_desktop.app import main

if __name__ == "__main__":
    main()
LAUNCHER_EOF
chmod 755 "${TMP_BUILD_DIR}/usr/bin/codex-desktop"

# 4. Copy desktop entry
cp "${SCRIPT_DIR}/debian/codex-desktop.desktop" "${TMP_BUILD_DIR}/usr/share/applications/"
chmod 644 "${TMP_BUILD_DIR}/usr/share/applications/codex-desktop.desktop"

# 5. Copy icon
cp "${SCRIPT_DIR}/icons/codex-desktop.svg" "${TMP_BUILD_DIR}/usr/share/icons/hicolor/scalable/apps/"
chmod 644 "${TMP_BUILD_DIR}/usr/share/icons/hicolor/scalable/apps/codex-desktop.svg"

# 6. Copy copyright and changelog
cp "${SCRIPT_DIR}/LICENSE" "${TMP_BUILD_DIR}/usr/share/doc/codex-desktop/copyright"
chmod 644 "${TMP_BUILD_DIR}/usr/share/doc/codex-desktop/copyright"
cat << 'CHANGELOG_EOF' | gzip -9 -c > "${TMP_BUILD_DIR}/usr/share/doc/codex-desktop/changelog.Debian.gz"
codex-desktop (1.0.0) noble; urgency=medium

  * Initial release of Codex Desktop for Linux / Ubuntu 24.04.
  * Added background daemon management for Codex app-server.
  * Added thread listing, new chat, message streaming, and thread resumption.

 -- Codex Desktop Team <codex-desktop@example.com>  Tue, 13 Oct 2026 12:00:00 +0200
CHANGELOG_EOF
chmod 644 "${TMP_BUILD_DIR}/usr/share/doc/codex-desktop/changelog.Debian.gz"

# Set standard permissions on directories
find "${TMP_BUILD_DIR}" -type d -exec chmod 755 {} +

# 7. Build package with dpkg-deb into /tmp/
dpkg-deb --build --root-owner-group "${TMP_BUILD_DIR}" "${TMP_OUT_DIR}/${DEB_NAME}"

# 8. Copy to dist
cp "${TMP_OUT_DIR}/${DEB_NAME}" "${OUTPUT_DIR}/${DEB_NAME}"

# Clean up
rm -rf "${TMP_BUILD_DIR}" "${TMP_OUT_DIR}"

echo "=== Successfully built: ${OUTPUT_DIR}/${DEB_NAME} ==="
ls -lh "${OUTPUT_DIR}/${DEB_NAME}"

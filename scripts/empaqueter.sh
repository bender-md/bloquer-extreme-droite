#!/usr/bin/env bash
# Produit dist/bloquer-extreme-droite.zip à partir du dossier extension/ (nom fixe : le lien « dernière version » du README ne change jamais).
# Zip reproductible : fichiers triés, date fixe (1980-01-01 00:00), droits neutres, aucun champ propriétaire/utilisateur.
# Le zip contient un dossier « bloquer-extreme-droite/ » : c'est lui qu'on choisit dans « Charger l'extension non empaquetée ».
# Usage : scripts/empaqueter.sh   (depuis n'importe où)
set -euo pipefail
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT="$RACINE/extension"
NOM="bloquer-extreme-droite"
command -v python3 >/dev/null || { echo "python3 est nécessaire (macOS : xcode-select --install)." >&2; exit 1; }
VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$EXT/manifest.json")"
mkdir -p "$RACINE/dist"
SORTIE="$RACINE/dist/$NOM.zip"   # version $VERSION
rm -f "$SORTIE"
python3 -I - "$EXT" "$SORTIE" "$NOM" <<'PY'
import os, sys, zipfile
ext, sortie, nom = sys.argv[1:]
ignores = {'.DS_Store', 'Thumbs.db', 'desktop.ini', 'README.md'}
fichiers = []
for dossier, sous, noms in os.walk(ext):
    sous[:] = sorted(d for d in sous if not d.startswith('.'))
    for n in noms:
        if n in ignores or n.startswith('.') or n.endswith('~'):
            continue
        fichiers.append(os.path.relpath(os.path.join(dossier, n), ext).replace(os.sep, '/'))
with zipfile.ZipFile(sortie, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel in sorted(fichiers):
        info = zipfile.ZipInfo(f'{nom}/{rel}', date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3                      # Unix
        info.external_attr = (0o100644 & 0xFFFF) << 16  # -rw-r--r--
        with open(os.path.join(ext, rel), 'rb') as f:
            z.writestr(info, f.read(), compresslevel=9)
print(f'{len(fichiers)} fichiers')
PY
echo "Archive : $SORTIE"
if command -v sha256sum >/dev/null; then sha256sum "$SORTIE"; else shasum -a 256 "$SORTIE"; fi

#!/usr/bin/env bash
# Rebuilds the self-hosted subset fonts (docs/design/system.md §3.2).
#
# Outputs
#   src/assets/fonts/*.woff2      bundled by Vite: emitted content-hashed under /_astro/
#   src/assets/fonts/SHA256SUMS   checked by tests/unit/fonts.test.ts
#   public/fonts/LICENSE-*.txt    OFL-1.1 texts served next to the site
#
# Build-time only: python3 with the exact versions in tools/fonts-requirements.txt
# (fonttools 4.61.1, brotli 1.2.0). Sources are pinned to one google/fonts commit and
# verified by SHA-256 before use; SOURCE_DATE_EPOCH makes the output byte-identical.
# Outputs are built in a staging directory and moved into place only when complete.
#
# Usage: tools/build-fonts.sh                    # download, verify, instance, subset
#        FONT_SRC_DIR=dir tools/build-fonts.sh   # use sources already downloaded
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FONTS="$ROOT/src/assets/fonts"
LICENSES="$ROOT/public/fonts"
COMMIT="95f4904fc8bcf26d3420fe315560c96417c6dec7"
BASE="https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl"
FONTTOOLS_VERSION="4.61.1"
BROTLI_VERSION="1.2.0"

PY="${PYTHON:-python3}"
"$PY" - "$FONTTOOLS_VERSION" "$BROTLI_VERSION" <<'PYCHECK' || exit 1
import sys
try:
    import fontTools, brotli
except ImportError:
    sys.exit("build-fonts: needs python3 -m pip install -r tools/fonts-requirements.txt")
want = (sys.argv[1], sys.argv[2])
have = (fontTools.version, brotli.__version__)
if have != want:
    sys.exit(f"build-fonts: need fonttools {want[0]} and brotli {want[1]}, found {have[0]} and {have[1]}")
PYCHECK

mkdir -p "$FONTS" "$LICENSES"
WORK="$(mktemp -d)"
STAGE="$(mktemp -d "$FONTS.stage.XXXXXX")"   # same filesystem as $FONTS: mv is a rename
trap 'rm -rf "$WORK" "$STAGE"' EXIT
SRC="${FONT_SRC_DIR:-$WORK/src}"
mkdir -p "$SRC"

# name|url-path|sha256
SOURCES=(
  "Fraunces[SOFT,WONK,opsz,wght].ttf|fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf|177ff6c0f14e5550a3c624247cd1189611d4eb65d000b14944c63d967958abbb"
  "Fraunces-OFL.txt|fraunces/OFL.txt|bdf4c22802eaf804f998195871c6b8938aac2ac14b2d78a8bd66a6f1eced833b"
  "AtkinsonHyperlegibleNext[wght].ttf|atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext%5Bwght%5D.ttf|5a455d1cfa099b601ab70751bb9673e8fe1854dc4500c80e1a220d0d75e31745"
  "AtkinsonHyperlegibleNext-Italic[wght].ttf|atkinsonhyperlegiblenext/AtkinsonHyperlegibleNext-Italic%5Bwght%5D.ttf|ce9cffed32742ad2d9238c561a93220385e5934cdc02b8eb4097a50efa957dc6"
  "Atkinson-OFL.txt|atkinsonhyperlegiblenext/OFL.txt|aca6a428580965d2297d1b718042dd427c2a9443ece3b0d02d758e161e0c4030"
)

for entry in "${SOURCES[@]}"; do
  IFS='|' read -r name path sum <<<"$entry"
  if [[ ! -f "$SRC/$name" ]]; then
    curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --max-time 120 \
      "$BASE/$path" -o "$SRC/$name.part"
    echo "$sum  $SRC/$name.part" | sha256sum -c --quiet -
    mv "$SRC/$name.part" "$SRC/$name"
  fi
  echo "$sum  $SRC/$name" | sha256sum -c --quiet -
done

export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1772548477}"

# Basic Latin, Latin-1, Latin Extended-A (SK/CS), S/T comma, modifier carons and
# breves, dashes, quotes („ “ ‚ ‘), bullet, ellipsis, primes, guillemets, euro,
# trade mark, arrows, minus.
UNI="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0218-021B,U+02C6-02C7,U+02D8-02DD,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212"
FEAT="kern,liga,calt,ccmp,locl,mark,mkmk,onum,lnum,tnum,case"

subset() { # in out
  "$PY" -m fontTools.subset "$1" --unicodes="$UNI" --layout-features="$FEAT" \
    --flavor=woff2 --output-file="$2"
}

# Fraunces: brand settings SOFT 50, WONK 0; weights 400-600; opsz kept (18-144).
"$PY" -m fontTools.varLib.instancer "$SRC/Fraunces[SOFT,WONK,opsz,wght].ttf" \
  SOFT=50 WONK=0 wght=400:600 opsz=18:144 -q -o "$WORK/fraunces-inst.ttf"
subset "$WORK/fraunces-inst.ttf" "$STAGE/fraunces-roman.woff2"

"$PY" -m fontTools.varLib.instancer "$SRC/AtkinsonHyperlegibleNext[wght].ttf" \
  wght=400:700 -q -o "$WORK/atk-inst.ttf"
subset "$WORK/atk-inst.ttf" "$STAGE/atkinson-next-roman.woff2"

"$PY" -m fontTools.varLib.instancer "$SRC/AtkinsonHyperlegibleNext-Italic[wght].ttf" \
  wght=400:700 -q -o "$WORK/atk-it-inst.ttf"
subset "$WORK/atk-it-inst.ttf" "$STAGE/atkinson-next-italic.woff2"

(cd "$STAGE" && sha256sum -- *.woff2 >SHA256SUMS)

# Licences: copy to temp names beside the target, then rename.
cp "$SRC/Fraunces-OFL.txt" "$LICENSES/.LICENSE-fraunces.txt.tmp"
cp "$SRC/Atkinson-OFL.txt" "$LICENSES/.LICENSE-atkinson.txt.tmp"
mv "$LICENSES/.LICENSE-fraunces.txt.tmp" "$LICENSES/LICENSE-fraunces.txt"
mv "$LICENSES/.LICENSE-atkinson.txt.tmp" "$LICENSES/LICENSE-atkinson.txt"

# Fonts: every file is complete in $STAGE; rename each into place (atomic per file).
for f in "$STAGE"/*.woff2 "$STAGE"/SHA256SUMS; do
  mv -f "$f" "$FONTS/$(basename "$f")"
done

(cd "$FONTS" && sha256sum -c --quiet SHA256SUMS)
ls -l "$FONTS" "$LICENSES"

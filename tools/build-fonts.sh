#!/usr/bin/env bash
# Rebuilds the self-hosted subset fonts in public/fonts/ (docs/design/system.md §3.2).
#
# Build-time only: needs python3 with fonttools >= 4.40 and brotli
# (pip install 'fonttools[woff]'). Nothing here ships to the browser except the
# .woff2 outputs and the OFL licence files. Sources are pinned to one google/fonts
# commit and checked against SHA-256 sums, so reruns are reproducible.
#
# Usage: tools/build-fonts.sh            # download, verify, instance, subset
#        FONT_SRC_DIR=dir tools/build-fonts.sh   # use already downloaded sources
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/public/fonts"
COMMIT="95f4904fc8bcf26d3420fe315560c96417c6dec7"
BASE="https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SRC="${FONT_SRC_DIR:-$WORK/src}"
mkdir -p "$SRC" "$OUT"

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
    curl -fsSL --proto '=https' "$BASE/$path" -o "$SRC/$name"
  fi
  echo "$sum  $SRC/$name" | sha256sum -c --quiet -
done

# Fixed head.modified timestamp so identical inputs give identical bytes.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1772548477}"
PY="${PYTHON:-python3}"
"$PY" -c 'import fontTools, brotli' 2>/dev/null || {
  echo "build-fonts: needs python3 with fonttools and brotli (pip install 'fonttools[woff]')" >&2
  exit 1
}

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
subset "$WORK/fraunces-inst.ttf" "$OUT/fraunces-roman.woff2"

"$PY" -m fontTools.varLib.instancer "$SRC/AtkinsonHyperlegibleNext[wght].ttf" \
  wght=400:700 -q -o "$WORK/atk-inst.ttf"
subset "$WORK/atk-inst.ttf" "$OUT/atkinson-next-roman.woff2"

"$PY" -m fontTools.varLib.instancer "$SRC/AtkinsonHyperlegibleNext-Italic[wght].ttf" \
  wght=400:700 -q -o "$WORK/atk-it-inst.ttf"
subset "$WORK/atk-it-inst.ttf" "$OUT/atkinson-next-italic.woff2"

cp "$SRC/Fraunces-OFL.txt" "$OUT/LICENSE-fraunces.txt"
cp "$SRC/Atkinson-OFL.txt" "$OUT/LICENSE-atkinson.txt"

ls -l "$OUT"

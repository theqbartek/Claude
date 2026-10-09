#!/usr/bin/env bash
# Buduje aplikację Android (android/build/notatki.apk) bez Android Studio i bez Android SDK.
# Wymaga: Java 17+ (javac), curl, unzip, python3, Linux x86_64.
# Narzędzia są pobierane raz do android/.tools:
#   - aapt2 i zasoby frameworka – z apktool (GitHub Releases)
#   - biblioteka Androida 14 – org.robolectric:android-all (Maven Central)
#   - dx (konwersja do DEX) i apksig (podpisywanie) – Maven Central
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
TOOLS="${ANDROID_TOOLS_DIR:-$HERE/.tools}"
BUILD="$HERE/build"
MAVEN="https://repo.maven.apache.org/maven2"

MIN_SDK=24
TARGET_SDK=34
KEYSTORE="$HERE/notatki.keystore"
KEY_ALIAS="notatki"
KEY_PASS="notatki"

download() { # url plik
  local i
  for i in 1 2 3 4 5; do
    if curl -fsSL -o "$2.part" "$1" && unzip -tq "$2.part" >/dev/null 2>&1; then
      mv "$2.part" "$2"
      return 0
    fi
    echo "  ponawiam pobieranie ($i)…" >&2
    sleep $((i * 5))
  done
  echo "Nie udało się pobrać $1" >&2
  exit 1
}

mkdir -p "$TOOLS"
if [ ! -x "$TOOLS/aapt2" ] || [ ! -f "$TOOLS/android-framework.jar" ]; then
  echo "» Pobieranie aapt2 (apktool)…"
  download https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar "$TOOLS/apktool.jar"
  unzip -o -q -j "$TOOLS/apktool.jar" prebuilt/linux/aapt2_64 brut/androlib/android-framework.jar -d "$TOOLS"
  mv "$TOOLS/aapt2_64" "$TOOLS/aapt2"
  chmod +x "$TOOLS/aapt2"
  rm "$TOOLS/apktool.jar"
fi
if [ ! -f "$TOOLS/android-all.jar" ]; then
  echo "» Pobieranie biblioteki Androida 14…"
  download "$MAVEN/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar" "$TOOLS/android-all.jar"
fi
if [ ! -f "$TOOLS/dx.jar" ]; then
  echo "» Pobieranie dx…"
  download "$MAVEN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" "$TOOLS/dx.jar"
fi
if [ ! -f "$TOOLS/apksig.jar" ]; then
  echo "» Pobieranie apksig…"
  download "$MAVEN/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar" "$TOOLS/apksig.jar"
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/assets/www" "$BUILD/classes" "$BUILD/tools"

echo "» Kopiowanie aplikacji webowej do assets…"
cp -r "$ROOT/index.html" "$ROOT/css" "$ROOT/js" "$ROOT/icons" "$BUILD/assets/www/"

echo "» Kompilowanie zasobów…"
"$TOOLS/aapt2" compile --dir "$HERE/res" -o "$BUILD/res.zip"
"$TOOLS/aapt2" link \
  -I "$TOOLS/android-framework.jar" \
  --manifest "$HERE/AndroidManifest.xml" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  -A "$BUILD/assets" \
  -o "$BUILD/unsigned.apk" \
  "$BUILD/res.zip"

echo "» Kompilowanie kodu Java…"
# android-all nie zawiera klas java.* – te bierzemy z JDK (--release 8).
javac -nowarn -Xlint:-options --release 8 \
  -cp "$TOOLS/android-all.jar" \
  -d "$BUILD/classes" \
  $(find "$HERE/src" -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex \
  --min-sdk-version="$MIN_SDK" --output="$BUILD/classes.dex" "$BUILD/classes"

python3 "$HERE/tools/align_apk.py" "$BUILD/unsigned.apk" "$BUILD/classes.dex" "$BUILD/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "» Tworzenie klucza do podpisywania…"
  keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 \
    -storepass "$KEY_PASS" -keypass "$KEY_PASS" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Notatki" >/dev/null
fi

echo "» Podpisywanie…"
javac -nowarn -cp "$TOOLS/apksig.jar" -d "$BUILD/tools" "$HERE/tools/Sign.java"
# apksig 2.3.0 (ostatnia wersja w Maven Central) korzysta z wewnętrznych klas JDK.
java --add-exports java.base/sun.security.x509=ALL-UNNAMED \
  --add-exports java.base/sun.security.pkcs=ALL-UNNAMED \
  --add-exports java.base/sun.security.util=ALL-UNNAMED \
  -cp "$TOOLS/apksig.jar:$BUILD/tools" Sign \
  "$KEYSTORE" "$KEY_PASS" "$KEY_ALIAS" "$BUILD/aligned.apk" "$BUILD/notatki.apk"

echo "✔ Gotowe: $BUILD/notatki.apk ($(du -h "$BUILD/notatki.apk" | cut -f1))"

"""Dodaje classes.dex do APK i wyrównuje nieskompresowane pliki do 4 bajtów.

Odpowiednik narzędzia zipalign z Android SDK – Android 11+ wymaga, żeby resources.arsc
był nieskompresowany i wyrównany. Tak jak zipalign, dopełnia pole „extra” zerami.

Użycie: python3 align_apk.py <wejście.apk> <classes.dex> <wyjście.apk>
"""
import sys
import zipfile

ALIGNMENT = 4


def main(src, dex, out):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, 'w') as zout:
        entries = [(info, zin.read(info)) for info in zin.infolist()]

        dex_info = zipfile.ZipInfo('classes.dex', date_time=(2008, 1, 1, 0, 0, 0))
        dex_info.compress_type = zipfile.ZIP_DEFLATED
        with open(dex, 'rb') as f:
            entries.append((dex_info, f.read()))

        for info, data in entries:
            info.extra = b''
            if info.compress_type == zipfile.ZIP_STORED:
                # Dane zaczynają się po 30-bajtowym nagłówku lokalnym, nazwie i polu extra.
                data_start = zout.fp.tell() + 30 + len(info.filename.encode('utf-8'))
                info.extra = b'\0' * (-data_start % ALIGNMENT)
            zout.writestr(info, data)


if __name__ == '__main__':
    main(*sys.argv[1:4])

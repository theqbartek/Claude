# Notatki

Aplikacja do notatek na telefon (PWA – Android i iPhone), z funkcją **blokowania edycji** wybranej notatki.
Działa bez internetu, a notatki są zapisywane automatycznie w pamięci telefonu.

## Aplikacja na Androida (APK)

Plik `android/build/notatki.apk` to zwykła aplikacja na Androida 7.0 lub nowszego.

1. Skopiuj `notatki.apk` na telefon (albo pobierz go na telefonie).
2. Otwórz plik. Android zapyta o zgodę na instalowanie aplikacji z tego źródła – zezwól.
3. Zainstaluj. Ikona „Notatki” pojawi się na liście aplikacji.

Notatki są zapisywane w pamięci telefonu i aplikacja nie potrzebuje internetu.
Uwaga: odinstalowanie aplikacji usuwa notatki.

### Budowanie APK

```bash
android/build.sh
```

Skrypt nie wymaga Android Studio ani Android SDK – potrzebuje tylko Javy 17+, `curl`, `unzip`
i `python3` (Linux x86_64). Potrzebne narzędzia (aapt2, dx, apksig) pobiera sam do `android/.tools`.
Aplikacja to natywne „opakowanie” (WebView) na ten sam kod co wersja webowa – zmiany w `index.html`,
`css/` i `js/` trafiają do APK przy kolejnym budowaniu.

APK jest podpisywany kluczem `android/notatki.keystore` (hasło: `notatki`). Klucz jest w repozytorium
celowo: nowe wersje muszą być podpisane tym samym kluczem, żeby dało się je zainstalować na starszą
wersję bez odinstalowania (i utraty notatek).

## Instalacja jako aplikacja webowa (PWA)

Aplikacja musi być dostępna pod adresem HTTPS, np. przez GitHub Pages
(Settings → Pages → Deploy from a branch → wybierz gałąź i folder `/`).
Następnie otwórz ten adres na telefonie:

- **Android (Chrome):** menu ⋮ → „Zainstaluj aplikację” / „Dodaj do ekranu głównego”
- **iPhone (Safari):** przycisk Udostępnij → „Do ekranu początkowego”

Ikona „Notatki” pojawi się na ekranie głównym, a aplikacja otworzy się na pełnym ekranie, bez paska przeglądarki.

Na komputerze wystarczy otworzyć `index.html` w przeglądarce.

## Funkcje

- tworzenie, edycja (autozapis) i usuwanie notatek
- wyszukiwanie po tytule i treści
- **blokada notatki** – przycisk „🔒 Zablokuj”:
  - zablokowanej notatki nie można edytować ani usunąć
  - opcjonalne hasło wymagane do odblokowania (zapisywany jest tylko skrót SHA-256)
  - zablokowane notatki mają ikonę 🔒 na liście, a blokada przetrwa odświeżenie strony
- układ dopasowany do telefonu: duże przyciski, przycisk „+”, panel blokady wysuwany od dołu
- systemowy przycisk „wstecz” na Androidzie wraca z notatki do listy
- działa offline (service worker), jasny/ciemny motyw zgodny z systemem

> Blokada chroni przed przypadkową zmianą. Dane leżą lokalnie w przeglądarce,
> więc nie jest to zabezpieczenie przed osobą z dostępem do komputera.

## Testy

```bash
npm test
```

## Struktura

- `index.html` – widok aplikacji
- `css/style.css` – style
- `js/store.js` – logika danych (notatki, blokowanie, hasła)
- `js/app.js` – obsługa interfejsu
- `manifest.webmanifest`, `sw.js`, `icons/` – instalacja PWA i tryb offline
- `android/` – aplikacja na Androida (`MainActivity.java`, zasoby, skrypt `build.sh`)
- `tests/store.test.js` – testy logiki

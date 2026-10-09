# Notatki

Aplikacja do notatek na telefon (PWA – Android i iPhone), z funkcją **blokowania edycji** wybranej notatki.
Działa bez internetu, a notatki są zapisywane automatycznie w pamięci telefonu.

## Instalacja na telefonie

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
- `manifest.webmanifest`, `sw.js`, `icons/` – instalacja na telefonie i tryb offline
- `tests/store.test.js` – testy logiki

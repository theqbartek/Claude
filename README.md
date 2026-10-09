# Notatki

Prosta aplikacja do notatek działająca w przeglądarce, z funkcją **blokowania edycji** wybranej notatki.

## Uruchomienie

Otwórz plik `index.html` w przeglądarce – nie wymaga instalacji ani serwera.
Notatki są zapisywane automatycznie w `localStorage` przeglądarki.

## Funkcje

- tworzenie, edycja (autozapis) i usuwanie notatek
- wyszukiwanie po tytule i treści
- **blokada notatki** – przycisk „🔒 Zablokuj”:
  - zablokowanej notatki nie można edytować ani usunąć
  - opcjonalne hasło wymagane do odblokowania (zapisywany jest tylko skrót SHA-256)
  - zablokowane notatki mają ikonę 🔒 na liście, a blokada przetrwa odświeżenie strony
- jasny/ciemny motyw zgodny z ustawieniami systemu, układ działa na telefonie

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
- `tests/store.test.js` – testy logiki

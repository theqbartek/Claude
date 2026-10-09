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
- **blokada notatki** – przycisk z kłódką:
  - jedno dotknięcie blokuje notatkę – nie można jej wtedy edytować ani usunąć
  - odblokowanie: dotknij kłódki **3 razy** w krótkim odstępie (przycisk odlicza „Jeszcze 2×”, „Jeszcze 1×”)
  - zablokowane notatki mają ikonę 🔒 na liście, a blokada przetrwa odświeżenie strony
- **login i hasło** w notatce (przycisk „🔑 + Login i hasło”):
  - osobne pola z przyciskiem „Kopiuj”, który pojawia się, gdy pole nie jest puste
  - własna kłódka: jedno dotknięcie blokuje login i hasło, 3 szybkie dotknięcia odblokowują
    (kopiowanie działa także po zablokowaniu; blokada całej notatki blokuje też te pola)
  - w historii edycji zmiana hasła jest widoczna jako „zmienione”, bez pokazywania hasła
  - w aplikacji Android skopiowane hasło jest oznaczone jako poufne (Android 13+ nie pokazuje go w podglądzie schowka)
  - uwaga: dane nie są szyfrowane – to wygodny notatnik, nie menedżer haseł
- **kosz** (ikona 🗑️ obok tytułu „Notatki”, z licznikiem):
  - „Usuń” przenosi notatkę do kosza – nic nie jest kasowane od razu
  - notatki leżą w koszu, dopóki sam ich nie usuniesz (nic nie znika automatycznie)
  - zaznaczanie pojedynczych notatek albo „Zaznacz wszystkie”
  - „Przywróć” lub „Usuń na zawsze” dla zaznaczonych, „Opróżnij kosz” dla wszystkich naraz
- **historia edycji** osobno dla każdej notatki (przycisk 🕘):
  - każda sesja pisania to jedna wersja – nowa powstaje po wyjściu z notatki lub z aplikacji
  - po dotknięciu wersji widać zmiany: dodane wiersze na zielono, usunięte na czerwono, zmianę tytułu
  - dowolną starszą wersję można przywrócić (zapisuje się jako nowa wersja, nic nie ginie);
    w zablokowanej notatce historię można tylko przeglądać
  - przechowywane jest do 50 ostatnich wersji każdej notatki
- układ dopasowany do telefonu: duże przyciski, przycisk „+”
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
- `js/store.js` – logika danych (notatki, blokowanie)
- `js/app.js` – obsługa interfejsu
- `manifest.webmanifest`, `sw.js`, `icons/` – instalacja PWA i tryb offline
- `android/` – aplikacja na Androida (`MainActivity.java`, zasoby, skrypt `build.sh`)
- `tests/store.test.js` – testy logiki

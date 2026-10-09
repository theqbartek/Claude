/*
 * Warstwa danych aplikacji notatek.
 * Działa w przeglądarce (globalny obiekt NotesStore) oraz w Node (module.exports) – na potrzeby testów.
 */
(function (root) {
  'use strict';

  const STORAGE_KEY = 'notatki.v1';

  class LockedNoteError extends Error {
    constructor(message = 'Notatka jest zablokowana i nie można jej edytować.') {
      super(message);
      this.name = 'LockedNoteError';
    }
  }

  // Ile wersji historii trzymamy dla jednej notatki (najstarsze są usuwane).
  const MAX_VERSIONS = 50;
  // Powyżej tylu wierszy nie liczymy dokładnego porównania (zbyt kosztowne).
  const MAX_DIFF_LINES = 2000;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Porównanie dwóch tekstów wiersz po wierszu (najdłuższy wspólny podciąg).
   * Zwraca listę { type: 'same' | 'add' | 'del', text }.
   */
  function diffLines(oldText, newText) {
    const a = oldText ? oldText.split('\n') : [];
    const b = newText ? newText.split('\n') : [];
    if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
      return a.map((text) => ({ type: 'del', text })).concat(b.map((text) => ({ type: 'add', text })));
    }
    // lcs[i][j] = długość wspólnego podciągu a[i..] i b[j..]
    const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        out.push({ type: 'same', text: a[i] });
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        out.push({ type: 'del', text: a[i++] });
      } else {
        out.push({ type: 'add', text: b[j++] });
      }
    }
    while (i < a.length) out.push({ type: 'del', text: a[i++] });
    while (j < b.length) out.push({ type: 'add', text: b[j++] });
    return out;
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function createStore(storage, now = () => Date.now()) {
    let notes = load();

    function load() {
      try {
        const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    function save() {
      storage.setItem(STORAGE_KEY, JSON.stringify(notes));
    }

    function find(id) {
      const note = notes.find((n) => n.id === id);
      if (!note) throw new Error('Nie znaleziono notatki: ' + id);
      return note;
    }

    function assertEditable(note) {
      if (note.locked) throw new LockedNoteError();
    }

    // Historia: lista wersji { ts, title, content, sealed?, restoredFrom? }, ostatnia = stan aktualny.
    // Kolejne zapisy w jednej sesji pisania nadpisują ostatnią wersję; „zamknięcie” sesji
    // (sealHistory) sprawia, że następna zmiana tworzy nową wersję.
    function ensureVersions(note) {
      if (Array.isArray(note.versions)) return;
      note.versions = [];
      // Notatki sprzed wprowadzenia historii: obecny stan staje się pierwszą wersją.
      if (note.title || note.content) {
        note.versions.push({ ...snapshot(note, note.updatedAt), sealed: true });
      }
    }

    // Pola notatki zapisywane w historii (login i hasło też – żeby dało się je przywrócić).
    function snapshot(note, ts) {
      return {
        ts,
        title: note.title,
        content: note.content,
        login: note.login || '',
        password: note.password || '',
      };
    }

    function assertCredentialsEditable(note) {
      assertEditable(note);
      if (note.credentialsLocked) throw new LockedNoteError('Login i hasło są zablokowane.');
    }

    function trimVersions(note) {
      if (note.versions.length > MAX_VERSIONS) note.versions.splice(0, note.versions.length - MAX_VERSIONS);
    }

    return {
      // Notatki posortowane od ostatnio zmienionej.
      // Notatki poza koszem: najpierw przypięte (ostatnio przypięta na górze),
      // potem pozostałe od ostatnio zmienionej.
      list() {
        return notes
          .filter((n) => !n.trashedAt)
          .sort((a, b) => {
            if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) return a.pinnedAt ? -1 : 1;
            if (a.pinnedAt) return b.pinnedAt - a.pinnedAt;
            return b.updatedAt - a.updatedAt;
          })
          .map(clone);
      },

      // Przypięcie nie zmienia treści, więc działa też dla zablokowanych notatek.
      pin(id) {
        const note = find(id);
        note.pinnedAt = now();
        save();
        return clone(note);
      },

      unpin(id) {
        const note = find(id);
        delete note.pinnedAt;
        save();
        return clone(note);
      },

      // Notatki w koszu, od ostatnio usuniętej. Leżą tam, dopóki użytkownik sam ich nie usunie.
      trash() {
        return notes
          .filter((n) => n.trashedAt)
          .sort((a, b) => b.trashedAt - a.trashedAt)
          .map(clone);
      },

      get(id) {
        return clone(find(id));
      },

      create({ title = '', content = '' } = {}) {
        const ts = now();
        const note = {
          id: generateId(),
          title,
          content,
          locked: false,
          createdAt: ts,
          updatedAt: ts,
          versions: title || content ? [{ ts, title, content, sealed: true }] : [],
        };
        notes.push(note);
        save();
        return clone(note);
      },

      // Zmiana tytułu, treści, loginu lub hasła. Login i hasło mają osobną blokadę.
      update(id, changes) {
        const note = find(id);
        assertEditable(note);
        const next = {
          title: typeof changes.title === 'string' ? changes.title : note.title,
          content: typeof changes.content === 'string' ? changes.content : note.content,
          login: typeof changes.login === 'string' ? changes.login : note.login || '',
          password: typeof changes.password === 'string' ? changes.password : note.password || '',
        };
        const credentialsChanged = next.login !== (note.login || '') || next.password !== (note.password || '');
        if (!credentialsChanged && next.title === note.title && next.content === note.content) return clone(note);
        if (credentialsChanged) {
          assertCredentialsEditable(note);
          note.hasCredentials = true;
        }

        ensureVersions(note);
        const ts = now();
        Object.assign(note, next);
        note.updatedAt = ts;

        const last = note.versions[note.versions.length - 1];
        if (last && !last.sealed) {
          Object.assign(last, snapshot(note, ts));
        } else {
          note.versions.push(snapshot(note, ts));
          trimVersions(note);
        }
        save();
        return clone(note);
      },

      // Pokazuje w notatce pola „Login” i „Hasło”.
      addCredentials(id) {
        const note = find(id);
        assertEditable(note);
        note.hasCredentials = true;
        save();
        return clone(note);
      },

      // Usuwa pola logowania z notatki (poprzednie wartości zostają w historii).
      removeCredentials(id) {
        const note = find(id);
        assertCredentialsEditable(note);
        if (note.login || note.password) this.update(id, { login: '', password: '' });
        note.hasCredentials = false;
        save();
        return clone(note);
      },

      lockCredentials(id) {
        const note = find(id);
        note.credentialsLocked = true;
        save();
        return clone(note);
      },

      unlockCredentials(id) {
        const note = find(id);
        note.credentialsLocked = false;
        save();
        return clone(note);
      },

      // Kończy bieżącą sesję edycji – następna zmiana utworzy nową wersję w historii.
      sealHistory(id) {
        const note = notes.find((n) => n.id === id);
        const last = note && Array.isArray(note.versions) && note.versions[note.versions.length - 1];
        if (last && !last.sealed) {
          last.sealed = true;
          save();
        }
      },

      // Historia od najstarszej do najnowszej (ostatnia = stan aktualny).
      history(id) {
        const note = clone(find(id));
        ensureVersions(note);
        return note.versions;
      },

      // Przywraca wersję o podanym indeksie; zapisuje to jako nową wersję (nic nie ginie).
      restoreVersion(id, index) {
        const note = find(id);
        assertEditable(note);
        ensureVersions(note);
        const version = note.versions[index];
        if (!version) throw new Error('Nie ma takiej wersji: ' + index);
        if (index === note.versions.length - 1) return clone(note);

        const ts = now();
        const last = note.versions[note.versions.length - 1];
        if (last) last.sealed = true;
        note.title = version.title;
        note.content = version.content;
        // Zablokowanych loginu i hasła przywracanie nie zmienia.
        if (!note.credentialsLocked) {
          note.login = version.login || '';
          note.password = version.password || '';
          if (note.login || note.password) note.hasCredentials = true;
        }
        note.updatedAt = ts;
        note.versions.push({ ...snapshot(note, ts), sealed: true, restoredFrom: version.ts });
        trimVersions(note);
        save();
        return clone(note);
      },

      // Przenosi notatkę do kosza (zablokowanej nie można usunąć).
      moveToTrash(id) {
        const note = find(id);
        assertEditable(note);
        note.trashedAt = now();
        const last = Array.isArray(note.versions) && note.versions[note.versions.length - 1];
        if (last) last.sealed = true;
        save();
      },

      // Przywraca notatki z kosza na listę (razem z ich historią).
      restoreFromTrash(ids) {
        notes.forEach((n) => {
          if (ids.includes(n.id) && n.trashedAt) delete n.trashedAt;
        });
        save();
      },

      // Usuwa na zawsze wybrane notatki z kosza. Notatek spoza kosza nie rusza.
      deleteForever(ids) {
        notes = notes.filter((n) => !(n.trashedAt && ids.includes(n.id)));
        save();
      },

      emptyTrash() {
        notes = notes.filter((n) => !n.trashedAt);
        save();
      },

      // Blokuje edycję i usuwanie notatki.
      lock(id) {
        const note = find(id);
        note.locked = true;
        const last = Array.isArray(note.versions) && note.versions[note.versions.length - 1];
        if (last) last.sealed = true;
        save();
        return clone(note);
      },

      unlock(id) {
        const note = find(id);
        note.locked = false;
        delete note.passwordHash; // pozostałość po starszej wersji z hasłami
        save();
        return clone(note);
      },
    };
  }

  const api = { createStore, diffLines, LockedNoteError, STORAGE_KEY, MAX_VERSIONS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NotesStore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

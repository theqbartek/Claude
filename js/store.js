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
        note.versions.push({ ts: note.updatedAt, title: note.title, content: note.content, sealed: true });
      }
    }

    function trimVersions(note) {
      if (note.versions.length > MAX_VERSIONS) note.versions.splice(0, note.versions.length - MAX_VERSIONS);
    }

    return {
      // Notatki posortowane od ostatnio zmienionej.
      list() {
        return notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(clone);
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

      update(id, changes) {
        const note = find(id);
        assertEditable(note);
        const title = typeof changes.title === 'string' ? changes.title : note.title;
        const content = typeof changes.content === 'string' ? changes.content : note.content;
        if (title === note.title && content === note.content) return clone(note);

        ensureVersions(note);
        const ts = now();
        note.title = title;
        note.content = content;
        note.updatedAt = ts;

        const last = note.versions[note.versions.length - 1];
        if (last && !last.sealed) {
          Object.assign(last, { ts, title, content });
        } else {
          note.versions.push({ ts, title, content });
          trimVersions(note);
        }
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
        note.updatedAt = ts;
        note.versions.push({
          ts,
          title: version.title,
          content: version.content,
          sealed: true,
          restoredFrom: version.ts,
        });
        trimVersions(note);
        save();
        return clone(note);
      },

      remove(id) {
        const note = find(id);
        assertEditable(note);
        notes = notes.filter((n) => n.id !== id);
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

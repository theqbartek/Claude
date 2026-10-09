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

    return {
      // Notatki posortowane od ostatnio zmienionej.
      list() {
        return notes.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((n) => ({ ...n }));
      },

      get(id) {
        return { ...find(id) };
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
        };
        notes.push(note);
        save();
        return { ...note };
      },

      update(id, changes) {
        const note = find(id);
        assertEditable(note);
        if (typeof changes.title === 'string') note.title = changes.title;
        if (typeof changes.content === 'string') note.content = changes.content;
        note.updatedAt = now();
        save();
        return { ...note };
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
        save();
        return { ...note };
      },

      unlock(id) {
        const note = find(id);
        note.locked = false;
        delete note.passwordHash; // pozostałość po starszej wersji z hasłami
        save();
        return { ...note };
      },
    };
  }

  const api = { createStore, LockedNoteError, STORAGE_KEY };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NotesStore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

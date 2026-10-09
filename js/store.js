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

  class WrongPasswordError extends Error {
    constructor(message = 'Nieprawidłowe hasło.') {
      super(message);
      this.name = 'WrongPasswordError';
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // SHA-256 z hasła (hex). Hasło nigdy nie jest zapisywane jawnym tekstem.
  async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const digest = await root.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
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
          passwordHash: null,
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

      // Blokuje edycję. Opcjonalny passwordHash wymusza podanie hasła przy odblokowaniu.
      lock(id, passwordHash = null) {
        const note = find(id);
        note.locked = true;
        note.passwordHash = passwordHash || null;
        save();
        return { ...note };
      },

      unlock(id, passwordHash = null) {
        const note = find(id);
        if (!note.locked) return { ...note };
        if (note.passwordHash && note.passwordHash !== passwordHash) {
          throw new WrongPasswordError();
        }
        note.locked = false;
        note.passwordHash = null;
        save();
        return { ...note };
      },
    };
  }

  const api = { createStore, hashPassword, LockedNoteError, WrongPasswordError, STORAGE_KEY };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.NotesStore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

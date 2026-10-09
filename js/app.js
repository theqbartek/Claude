(function () {
  'use strict';

  const { createStore } = window.NotesStore;
  const store = createStore(window.localStorage);

  const $ = (id) => document.getElementById(id);
  const els = {
    app: document.querySelector('.app'),
    list: $('note-list'),
    emptyList: $('empty-list'),
    search: $('search'),
    newNote: $('new-note'),
    newNoteFab: $('new-note-fab'),
    placeholder: $('placeholder'),
    view: $('note-view'),
    back: $('back'),
    status: $('status'),
    toggleLock: $('toggle-lock'),
    deleteNote: $('delete-note'),
    banner: $('lock-banner'),
    title: $('title'),
    content: $('content'),
  };

  // Odblokowanie wymaga kilku szybkich dotknięć kłódki – chroni przed przypadkowym odblokowaniem.
  const UNLOCK_TAPS = 3;
  const TAP_WINDOW_MS = 1500;

  let selectedId = null;
  let saveTimer = null;
  let unlockTaps = 0;
  let tapTimer = null;

  const dateFmt = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const notes = store.list().filter(
      (n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );

    els.list.innerHTML = notes
      .map((n) => {
        const title = n.title.trim() || 'Bez tytułu';
        const preview = n.content.trim().split('\n')[0] || 'Brak treści';
        return `
          <li class="note-item${n.id === selectedId ? ' active' : ''}" data-id="${n.id}" tabindex="0">
            <div class="note-item-title">${n.locked ? '<span class="lock-icon" title="Zablokowana">🔒</span>' : ''}${escapeHtml(title)}</div>
            <div class="note-item-preview">${escapeHtml(preview)}</div>
            <div class="note-item-date">${dateFmt.format(n.updatedAt)}</div>
          </li>`;
      })
      .join('');

    els.emptyList.hidden = store.list().length > 0;
  }

  function renderEditor() {
    if (!selectedId) {
      els.view.hidden = true;
      els.placeholder.hidden = false;
      els.app.classList.remove('show-editor');
      return;
    }
    const note = store.get(selectedId);
    els.view.hidden = false;
    els.placeholder.hidden = true;
    els.app.classList.add('show-editor');

    if (document.activeElement !== els.title) els.title.value = note.title;
    if (document.activeElement !== els.content) els.content.value = note.content;

    els.title.readOnly = note.locked;
    els.content.readOnly = note.locked;
    els.view.classList.toggle('locked', note.locked);
    els.banner.hidden = !note.locked;
    els.deleteNote.disabled = note.locked;
    els.deleteNote.title = note.locked ? 'Odblokuj notatkę, aby ją usunąć' : 'Usuń notatkę';
    els.toggleLock.classList.toggle('is-locked', note.locked);
    els.toggleLock.classList.toggle('counting', unlockTaps > 0);
    els.toggleLock.textContent = !note.locked
      ? '🔓 Zablokuj'
      : unlockTaps > 0
        ? `🔒 Jeszcze ${UNLOCK_TAPS - unlockTaps}×`
        : '🔒 Zablokowana';
    els.toggleLock.title = note.locked
      ? `Dotknij ${UNLOCK_TAPS} razy, aby odblokować`
      : 'Zablokuj możliwość edycji';
    els.status.textContent = 'Zmieniono: ' + dateFmt.format(note.updatedAt);
  }

  function render() {
    renderList();
    renderEditor();
  }

  function select(id) {
    flushSave();
    resetUnlockTaps();
    selectedId = id;
    els.title.blur();
    els.content.blur();
    render();
  }

  // Otwarcie notatki dodaje wpis do historii, dzięki czemu systemowy
  // przycisk „wstecz” na telefonie wraca do listy zamiast zamykać aplikację.
  function openNote(id) {
    const state = { note: id };
    if (history.state && history.state.note) history.replaceState(state, '');
    else history.pushState(state, '');
    select(id);
  }

  function closeNote() {
    if (history.state && history.state.note) history.back();
    else select(null);
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    els.status.textContent = 'Zapisywanie…';
    saveTimer = setTimeout(flushSave, 400);
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!selectedId) return;
    const note = store.get(selectedId);
    if (note.locked) return;
    if (note.title === els.title.value && note.content === els.content.value) return;
    store.update(selectedId, { title: els.title.value, content: els.content.value });
    render();
  }

  // --- Blokada ---

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  function resetUnlockTaps() {
    clearTimeout(tapTimer);
    tapTimer = null;
    unlockTaps = 0;
  }

  // Zablokowanie: jedno dotknięcie. Odblokowanie: UNLOCK_TAPS dotknięć w krótkim odstępie.
  function handleLockTap() {
    flushSave();
    const note = store.get(selectedId);

    if (!note.locked) {
      store.lock(selectedId);
      vibrate(30);
      render();
      return;
    }

    unlockTaps++;
    clearTimeout(tapTimer);
    if (unlockTaps >= UNLOCK_TAPS) {
      resetUnlockTaps();
      store.unlock(selectedId);
      render();
      return;
    }

    tapTimer = setTimeout(() => {
      resetUnlockTaps();
      renderEditor();
    }, TAP_WINDOW_MS);
    renderEditor();
  }

  // --- Zdarzenia ---

  function newNote() {
    const note = store.create();
    els.search.value = '';
    openNote(note.id);
    els.title.focus();
  }

  els.newNote.addEventListener('click', newNote);
  els.newNoteFab.addEventListener('click', newNote);

  els.list.addEventListener('click', (e) => {
    const item = e.target.closest('.note-item');
    if (item) openNote(item.dataset.id);
  });
  els.list.addEventListener('keydown', (e) => {
    const item = e.target.closest('.note-item');
    if (item && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openNote(item.dataset.id);
    }
  });

  els.search.addEventListener('input', renderList);
  els.title.addEventListener('input', scheduleSave);
  els.content.addEventListener('input', scheduleSave);
  els.back.addEventListener('click', closeNote);
  els.toggleLock.addEventListener('click', handleLockTap);

  els.deleteNote.addEventListener('click', () => {
    const note = store.get(selectedId);
    if (note.locked) return;
    if (!confirm(`Usunąć notatkę „${note.title.trim() || 'Bez tytułu'}”?`)) return;
    clearTimeout(saveTimer);
    store.remove(selectedId);
    selectedId = null;
    closeNote();
  });

  window.addEventListener('popstate', (e) => {
    const id = e.state && e.state.note;
    select(id && store.list().some((n) => n.id === id) ? id : null);
  });

  window.addEventListener('beforeunload', flushSave);
  // Na telefonie aplikacja jest często zamykana bez beforeunload – zapisz przy schowaniu.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Po ponownym uruchomieniu zaczynamy od listy.
  if (history.state && history.state.note) history.replaceState(null, '');

  // Wywoływane z natywnej aplikacji Android (android/src/pl/notatki/MainActivity.java).
  // handleBack zwraca true, jeśli przycisk „wstecz” został obsłużony w aplikacji.
  window.notatki = {
    handleBack() {
      if (selectedId) {
        history.replaceState(null, '');
        select(null);
        return true;
      }
      return false;
    },
    flush: flushSave,
  };

  render();
})();

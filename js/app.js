(function () {
  'use strict';

  const { createStore, hashPassword, WrongPasswordError } = window.NotesStore;
  const store = createStore(window.localStorage);

  const $ = (id) => document.getElementById(id);
  const els = {
    app: document.querySelector('.app'),
    list: $('note-list'),
    emptyList: $('empty-list'),
    search: $('search'),
    newNote: $('new-note'),
    placeholder: $('placeholder'),
    view: $('note-view'),
    back: $('back'),
    status: $('status'),
    toggleLock: $('toggle-lock'),
    deleteNote: $('delete-note'),
    banner: $('lock-banner'),
    title: $('title'),
    content: $('content'),
    dialog: $('lock-dialog'),
    form: $('lock-form'),
    dialogTitle: $('lock-dialog-title'),
    dialogText: $('lock-dialog-text'),
    password: $('lock-password'),
    error: $('lock-error'),
    cancel: $('lock-cancel'),
    confirm: $('lock-confirm'),
  };

  let selectedId = null;
  let saveTimer = null;

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
    els.toggleLock.textContent = note.locked ? '🔓 Odblokuj' : '🔒 Zablokuj';
    els.toggleLock.title = note.locked
      ? note.passwordHash ? 'Odblokuj (wymaga hasła)' : 'Odblokuj edycję'
      : 'Zablokuj możliwość edycji';
    els.status.textContent = 'Zmieniono: ' + dateFmt.format(note.updatedAt);
  }

  function render() {
    renderList();
    renderEditor();
  }

  function select(id) {
    flushSave();
    selectedId = id;
    els.title.blur();
    els.content.blur();
    render();
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

  // --- Okno dialogowe blokady ---

  function openLockDialog(note) {
    const locking = !note.locked;
    els.error.hidden = true;
    els.password.value = '';

    if (locking) {
      els.dialogTitle.textContent = 'Zablokuj notatkę';
      els.dialogText.textContent =
        'Zablokowanej notatki nie można edytować ani usunąć. Możesz ustawić hasło wymagane do odblokowania (opcjonalnie).';
      els.password.placeholder = 'Hasło (opcjonalnie)';
      els.confirm.textContent = 'Zablokuj';
    } else {
      els.dialogTitle.textContent = 'Odblokuj notatkę';
      els.dialogText.textContent = 'Ta notatka jest chroniona hasłem. Podaj je, aby odblokować edycję.';
      els.password.placeholder = 'Hasło';
      els.confirm.textContent = 'Odblokuj';
    }
    els.dialog.dataset.mode = locking ? 'lock' : 'unlock';
    els.dialog.showModal();
    els.password.focus();
  }

  async function handleDialogSubmit(e) {
    e.preventDefault();
    const pwd = els.password.value;
    try {
      if (els.dialog.dataset.mode === 'lock') {
        store.lock(selectedId, pwd ? await hashPassword(pwd) : null);
      } else {
        store.unlock(selectedId, await hashPassword(pwd));
      }
      els.dialog.close();
      render();
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        els.error.textContent = err.message;
        els.error.hidden = false;
        els.password.select();
      } else {
        throw err;
      }
    }
  }

  function toggleLock() {
    flushSave();
    const note = store.get(selectedId);
    if (!note.locked || note.passwordHash) {
      openLockDialog(note);
    } else {
      store.unlock(selectedId);
      render();
    }
  }

  // --- Zdarzenia ---

  els.newNote.addEventListener('click', () => {
    const note = store.create();
    els.search.value = '';
    select(note.id);
    els.title.focus();
  });

  els.list.addEventListener('click', (e) => {
    const item = e.target.closest('.note-item');
    if (item) select(item.dataset.id);
  });
  els.list.addEventListener('keydown', (e) => {
    const item = e.target.closest('.note-item');
    if (item && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(item.dataset.id);
    }
  });

  els.search.addEventListener('input', renderList);
  els.title.addEventListener('input', scheduleSave);
  els.content.addEventListener('input', scheduleSave);
  els.back.addEventListener('click', () => select(null));
  els.toggleLock.addEventListener('click', toggleLock);

  els.deleteNote.addEventListener('click', () => {
    const note = store.get(selectedId);
    if (note.locked) return;
    if (!confirm(`Usunąć notatkę „${note.title.trim() || 'Bez tytułu'}”?`)) return;
    clearTimeout(saveTimer);
    store.remove(selectedId);
    selectedId = null;
    render();
  });

  els.form.addEventListener('submit', handleDialogSubmit);
  els.cancel.addEventListener('click', () => els.dialog.close());

  window.addEventListener('beforeunload', flushSave);

  render();
})();

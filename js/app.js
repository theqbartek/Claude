(function () {
  'use strict';

  const { createStore, diffLines } = window.NotesStore;
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
    showHistory: $('show-history'),
    historyView: $('history-view'),
    historyBack: $('history-back'),
    historyNote: $('history-note'),
    historyList: $('history-list'),
    notesPanel: $('notes-panel'),
    trashPanel: $('trash-panel'),
    openTrash: $('open-trash'),
    closeTrash: $('close-trash'),
    trashCount: $('trash-count'),
    trashToolbar: $('trash-toolbar'),
    trashSelectAll: $('trash-select-all'),
    trashSelectedLabel: $('trash-selected-label'),
    trashRestore: $('trash-restore'),
    trashDelete: $('trash-delete'),
    trashList: $('trash-list'),
    trashEmpty: $('trash-empty'),
    trashFooter: $('trash-footer'),
    trashEmptyAll: $('trash-empty-all'),
    addCreds: $('add-creds'),
    creds: $('creds'),
    credsLock: $('creds-lock'),
    login: $('cred-login'),
    password: $('cred-password'),
    pwEye: $('pw-eye'),
    credsHint: $('creds-hint'),
    credsRemove: $('creds-remove'),
    copyButtons: document.querySelectorAll('.copy-btn'),
  };

  // Odblokowanie wymaga kilku szybkich dotknięć kłódki – chroni przed przypadkowym odblokowaniem.
  const UNLOCK_TAPS = 3;
  const TAP_WINDOW_MS = 1500;

  // Licznik szybkich dotknięć dla jednej kłódki (osobny dla notatki i dla loginu z hasłem).
  function createTapCounter() {
    const counter = {
      taps: 0,
      timer: null,
      reset() {
        clearTimeout(counter.timer);
        counter.timer = null;
        counter.taps = 0;
      },
      // Zwraca true, gdy dotknięto UNLOCK_TAPS razy; po przerwie liczenie zaczyna się od nowa.
      tap(onTimeout) {
        counter.taps++;
        clearTimeout(counter.timer);
        if (counter.taps >= UNLOCK_TAPS) {
          counter.reset();
          return true;
        }
        counter.timer = setTimeout(() => {
          counter.reset();
          onTimeout();
        }, TAP_WINDOW_MS);
        return false;
      },
    };
    return counter;
  }

  const noteTaps = createTapCounter();
  const credsTaps = createTapCounter();

  function lockLabel(locked, counter, lockedText) {
    if (!locked) return '🔓 Zablokuj';
    return counter.taps > 0 ? `🔒 Jeszcze ${UNLOCK_TAPS - counter.taps}×` : lockedText;
  }

  let selectedId = null;
  let saveTimer = null;
  let passwordRevealed = false; // czy hasło jest odsłonięte (ikona 👁)
  let historyOpen = false;
  let openVersion = null; // indeks rozwiniętej wersji w historii
  let statusMessage = null; // jednorazowy komunikat zamiast daty zmiany
  let trashOpen = false;
  const trashSelected = new Set(); // id zaznaczonych notatek w koszu

  const dateFmt = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderList() {
    const q = els.search.value.trim().toLowerCase();
    const notes = store.list().filter(
      (n) =>
        !q ||
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        (n.login || '').toLowerCase().includes(q)
    );

    els.list.innerHTML = notes
      .map((n) => {
        const title = n.title.trim() || 'Bez tytułu';
        const preview = n.content.trim().split('\n')[0] || 'Brak treści';
        return `
          <li class="note-item${n.id === selectedId ? ' active' : ''}" data-id="${n.id}" tabindex="0">
            <div class="note-item-title">${n.locked ? '<span class="lock-icon" title="Zablokowana">🔒</span>' : ''}${n.login || n.password ? '<span class="lock-icon" title="Zawiera login i hasło">🔑</span>' : ''}${escapeHtml(title)}</div>
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
      els.historyView.hidden = true;
      els.placeholder.hidden = false;
      els.app.classList.remove('show-editor');
      return;
    }
    const note = store.get(selectedId);
    els.placeholder.hidden = true;
    els.app.classList.add('show-editor');
    els.view.hidden = historyOpen;
    els.historyView.hidden = !historyOpen;
    if (historyOpen) {
      renderHistory(note);
      return;
    }

    // Pola z niezapisanymi zmianami (czeka autozapis) mają nowszą treść niż zapisana notatka.
    const pending = saveTimer !== null;
    if (!pending && document.activeElement !== els.title) els.title.value = note.title;
    if (!pending && document.activeElement !== els.content) els.content.value = note.content;

    els.title.readOnly = note.locked;
    els.content.readOnly = note.locked;
    els.view.classList.toggle('locked', note.locked);
    els.banner.hidden = !note.locked;
    els.deleteNote.disabled = note.locked;
    els.deleteNote.title = note.locked ? 'Odblokuj notatkę, aby ją usunąć' : 'Usuń notatkę';
    els.toggleLock.classList.toggle('is-locked', note.locked);
    els.toggleLock.classList.toggle('counting', noteTaps.taps > 0);
    els.toggleLock.textContent = lockLabel(note.locked, noteTaps, '🔒 Zablokowana');
    els.toggleLock.title = note.locked
      ? `Dotknij ${UNLOCK_TAPS} razy, aby odblokować`
      : 'Zablokuj możliwość edycji';
    els.status.textContent = statusMessage || 'Zmieniono: ' + dateFmt.format(note.updatedAt);
    renderCredentials(note);
  }

  function renderCredentials(note) {
    els.addCreds.hidden = note.hasCredentials || note.locked;
    els.creds.hidden = !note.hasCredentials;
    if (!note.hasCredentials) return;

    const readOnly = note.locked || Boolean(note.credentialsLocked);
    const pending = saveTimer !== null;
    if (!pending && document.activeElement !== els.login) els.login.value = note.login || '';
    if (!pending && document.activeElement !== els.password) els.password.value = note.password || '';
    els.login.readOnly = readOnly;
    els.password.readOnly = readOnly;

    // Mgła na haśle: znika podczas pisania albo po dotknięciu 👁.
    const editingPassword = document.activeElement === els.password && !readOnly;
    const hasPassword = els.password.value !== '';
    els.password.classList.toggle('fogged', hasPassword && !passwordRevealed && !editingPassword);
    els.pwEye.hidden = !hasPassword;
    els.pwEye.classList.toggle('on', passwordRevealed);
    els.pwEye.setAttribute('aria-label', passwordRevealed ? 'Ukryj hasło' : 'Pokaż hasło');

    els.copyButtons.forEach((btn) => {
      if (btn.classList.contains('copied')) return;
      btn.hidden = (btn.dataset.copy === 'login' ? els.login.value : els.password.value) === '';
    });

    const locked = Boolean(note.credentialsLocked);
    els.credsLock.classList.toggle('is-locked', locked);
    els.credsLock.classList.toggle('counting', credsTaps.taps > 0);
    els.credsLock.textContent = lockLabel(locked, credsTaps, '🔒 Zablokowane');
    els.credsLock.title = locked ? `Dotknij ${UNLOCK_TAPS} razy, aby odblokować` : 'Zablokuj login i hasło';
    els.credsHint.textContent = locked
      ? `Dotknij kłódki ${UNLOCK_TAPS} razy, aby edytować`
      : note.locked
        ? 'Notatka jest zablokowana'
        : '';
    els.credsRemove.hidden = readOnly;
  }

  // Odmiana: „1 notatkę”, „2 notatki”, „5 notatek”.
  function pluralNotes(n) {
    const last = n % 10;
    const lastTwo = n % 100;
    if (n === 1) return '1 notatkę';
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return n + ' notatki';
    return n + ' notatek';
  }

  function renderTrash() {
    const items = store.trash();
    // Zaznaczenie może zawierać notatki, których już nie ma w koszu.
    for (const id of trashSelected) {
      if (!items.some((n) => n.id === id)) trashSelected.delete(id);
    }

    els.trashCount.hidden = items.length === 0;
    els.trashCount.textContent = items.length > 99 ? '99+' : String(items.length);
    els.openTrash.setAttribute('aria-label', items.length ? `Kosz (${items.length})` : 'Kosz');

    els.notesPanel.hidden = trashOpen;
    els.trashPanel.hidden = !trashOpen;
    if (!trashOpen) return;

    els.trashList.innerHTML = items
      .map((n) => {
        const selected = trashSelected.has(n.id);
        const title = n.title.trim() || 'Bez tytułu';
        const preview = n.content.trim().split('\n')[0] || 'Brak treści';
        return `
          <li class="note-item trash-item${selected ? ' selected' : ''}" data-id="${n.id}">
            <input type="checkbox" aria-label="Zaznacz „${escapeHtml(title)}”"${selected ? ' checked' : ''}>
            <div class="note-item-body">
              <div class="note-item-title">${escapeHtml(title)}</div>
              <div class="note-item-preview">${escapeHtml(preview)}</div>
              <div class="note-item-date">Usunięto: ${dateFmt.format(n.trashedAt)}</div>
            </div>
          </li>`;
      })
      .join('');

    const count = items.length;
    const chosen = trashSelected.size;
    els.trashEmpty.hidden = count > 0;
    els.trashToolbar.hidden = count === 0;
    els.trashFooter.hidden = count === 0;
    els.trashSelectAll.checked = count > 0 && chosen === count;
    els.trashSelectAll.indeterminate = chosen > 0 && chosen < count;
    els.trashSelectedLabel.textContent = chosen ? `Zaznaczono ${chosen} z ${count}` : 'Zaznacz wszystkie';
    els.trashRestore.disabled = chosen === 0;
    els.trashDelete.disabled = chosen === 0;
  }

  function render() {
    renderList();
    renderTrash();
    renderEditor();
  }

  function openTrash() {
    if (selectedId) {
      history.replaceState(null, '');
      select(null);
    }
    trashSelected.clear();
    trashOpen = true;
    history.pushState({ trash: true }, '');
    render();
  }

  function closeTrash() {
    if (history.state && history.state.trash) {
      history.back();
    } else {
      trashOpen = false;
      render();
    }
  }

  function select(id) {
    flushSave();
    noteTaps.reset();
    credsTaps.reset();
    passwordRevealed = false;
    // Wyjście z notatki kończy sesję pisania – kolejne zmiany będą nową wersją w historii.
    if (selectedId && id !== selectedId) {
      store.sealHistory(selectedId);
      statusMessage = null;
    }
    historyOpen = false;
    openVersion = null;
    selectedId = id;
    els.title.blur();
    els.content.blur();
    els.login.blur();
    els.password.blur();
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
    statusMessage = null;
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
    const changes = {};
    if (note.title !== els.title.value) changes.title = els.title.value;
    if (note.content !== els.content.value) changes.content = els.content.value;
    if (note.hasCredentials && !note.credentialsLocked) {
      if ((note.login || '') !== els.login.value) changes.login = els.login.value;
      if ((note.password || '') !== els.password.value) changes.password = els.password.value;
    }
    if (!Object.keys(changes).length) return;
    store.update(selectedId, changes);
    render();
  }

  // --- Historia edycji ---

  function pluralVersions(n) {
    const last = n % 10;
    const lastTwo = n % 100;
    if (n === 1) return '1 wersja';
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return n + ' wersje';
    return n + ' wersji';
  }

  // Pokazuje zmienione wiersze z 2 wierszami kontekstu; długie niezmienione fragmenty zwija.
  function renderDiff(diff) {
    if (!diff.some((d) => d.type !== 'same')) {
      return '<div class="diff-empty">Treść bez zmian</div>';
    }
    const CONTEXT = 2;
    const keep = diff.map(() => false);
    diff.forEach((d, i) => {
      if (d.type === 'same') return;
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(diff.length - 1, i + CONTEXT); k++) keep[k] = true;
    });
    let html = '';
    let skipped = 0;
    const flushGap = () => {
      if (skipped) html += `<div class="diff-gap">⋯ ${skipped} niezmienionych wierszy</div>`;
      skipped = 0;
    };
    diff.forEach((d, i) => {
      if (!keep[i]) {
        skipped++;
        return;
      }
      flushGap();
      html += `<div class="diff-line ${d.type}">${escapeHtml(d.text)}</div>`;
    });
    flushGap();
    return html;
  }

  function renderHistory(note) {
    const versions = store.history(note.id);
    els.historyNote.textContent = note.locked
      ? '🔒 Notatka jest zablokowana – możesz przeglądać historię, ale żeby przywrócić wersję, odblokuj ją.'
      : versions.length
        ? `${pluralVersions(versions.length)} · nowa wersja powstaje po każdym wyjściu z notatki`
        : '';

    if (!versions.length) {
      els.historyList.innerHTML = '<li class="diff-empty">Brak historii – zacznij pisać, a zmiany pojawią się tutaj.</li>';
      return;
    }

    const lastIndex = versions.length - 1;
    let html = '';
    for (let i = lastIndex; i >= 0; i--) {
      const v = versions[i];
      const prev = versions[i - 1];
      const diff = diffLines(prev ? prev.content : '', v.content);
      const added = diff.filter((d) => d.type === 'add').length;
      const removed = diff.filter((d) => d.type === 'del').length;
      const titleChanged = prev ? prev.title !== v.title : false;
      const loginChanged = prev ? (prev.login || '') !== (v.login || '') : Boolean(v.login);
      const passwordChanged = prev ? (prev.password || '') !== (v.password || '') : Boolean(v.password);
      const open = openVersion === i;

      let sub = escapeHtml(v.title.trim() || 'Bez tytułu');
      if (i === 0) sub = 'Pierwsza wersja · ' + sub;
      else if (v.restoredFrom) sub = 'Przywrócono wersję z ' + dateFmt.format(v.restoredFrom);
      else if (titleChanged) sub = 'Zmieniono tytuł · ' + sub;
      else if ((loginChanged || passwordChanged) && !added && !removed) sub = 'Zmieniono login lub hasło · ' + sub;

      html += `
        <li class="version${open ? ' open' : ''}" data-index="${i}">
          <button class="version-head" aria-expanded="${open}">
            <div class="version-main">
              <div class="version-date">${dateFmt.format(v.ts)}</div>
              <div class="version-sub">${sub}</div>
            </div>
            ${i === lastIndex ? '<span class="version-tag">Aktualna</span>' : ''}
            <span class="version-stats">${added ? `<span class="stat-add">+${added}</span>` : ''}${removed ? `<span class="stat-del">−${removed}</span>` : ''}</span>
          </button>
          <div class="version-body"${open ? '' : ' hidden'}>
            ${titleChanged ? `<div class="diff-title">Tytuł: <s>${escapeHtml(prev.title || 'Bez tytułu')}</s> → <strong>${escapeHtml(v.title || 'Bez tytułu')}</strong></div>` : ''}
            ${loginChanged ? `<div class="diff-title">🔑 Login: ${prev && prev.login ? `<s>${escapeHtml(prev.login)}</s> → ` : ''}<strong>${escapeHtml(v.login || '(pusty)')}</strong></div>` : ''}
            ${passwordChanged ? `<div class="diff-title">🔑 Hasło: ${v.password ? (prev && prev.password ? 'zmienione' : 'dodane') : 'usunięte'} <span class="muted">(ukryte)</span></div>` : ''}
            ${open && (added || removed || !(titleChanged || loginChanged || passwordChanged)) ? `<div class="diff">${renderDiff(diff)}</div>` : ''}
            ${i === lastIndex ? '' : `
            <div class="version-actions">
              ${note.locked ? '<span class="hint">Odblokuj notatkę, aby przywrócić</span>' : ''}
              <button class="btn btn-primary restore"${note.locked ? ' disabled' : ''}>Przywróć tę wersję</button>
            </div>`}
          </div>
        </li>`;
    }
    els.historyList.innerHTML = html;
  }

  function openHistory() {
    flushSave();
    store.sealHistory(selectedId);
    historyOpen = true;
    openVersion = null;
    history.pushState({ note: selectedId, history: true }, '');
    renderEditor();
    els.historyList.scrollTop = 0;
  }

  function closeHistory() {
    if (history.state && history.state.history) {
      history.back();
    } else {
      historyOpen = false;
      renderEditor();
    }
  }

  function restoreVersion(index) {
    const version = store.history(selectedId)[index];
    const note = store.restoreVersion(selectedId, index);
    // Pola edytora muszą od razu dostać przywróconą treść – inaczej zapis przy
    // powrocie do notatki nadpisałby ją starą zawartością pól.
    clearTimeout(saveTimer);
    els.title.value = note.title;
    els.content.value = note.content;
    els.login.value = note.login || '';
    els.password.value = note.password || '';
    statusMessage = 'Przywrócono wersję z ' + dateFmt.format(version.ts);
    closeHistory();
    render();
  }

  // --- Blokada ---

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
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

    if (noteTaps.tap(renderEditor)) {
      store.unlock(selectedId);
      render();
      return;
    }
    renderEditor();
  }

  // Ta sama zasada dla loginu i hasła: jedno dotknięcie blokuje, trzy odblokowują.
  function handleCredsLockTap() {
    flushSave();
    const note = store.get(selectedId);
    if (!note.credentialsLocked) {
      store.lockCredentials(selectedId);
      els.login.blur();
      els.password.blur();
      vibrate(30);
      renderEditor();
      return;
    }
    if (credsTaps.tap(renderEditor)) store.unlockCredentials(selectedId);
    renderEditor();
  }

  // --- Kopiowanie ---

  function copyFallback(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  async function copyText(text, sensitive) {
    // W aplikacji Android kopiuje kod natywny – hasło jest oznaczane jako poufne
    // i nie pokazuje się w podglądzie schowka.
    if (window.NotatkiAndroid && window.NotatkiAndroid.copy) {
      window.NotatkiAndroid.copy(text, sensitive);
      return true;
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyFallback(text);
    }
  }

  async function handleCopy(btn) {
    const isPassword = btn.dataset.copy === 'password';
    const text = isPassword ? els.password.value : els.login.value;
    if (!text) return;
    const ok = await copyText(text, isPassword);
    btn.classList.add('copied');
    btn.textContent = ok ? 'Skopiowano ✓' : 'Błąd';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.textContent = 'Kopiuj';
      if (selectedId) renderEditor();
    }, 1500);
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
  els.credsLock.addEventListener('click', handleCredsLockTap);
  els.copyButtons.forEach((btn) => btn.addEventListener('click', () => handleCopy(btn)));
  els.addCreds.addEventListener('click', () => {
    flushSave();
    store.addCredentials(selectedId);
    renderEditor();
    els.login.focus();
  });
  els.credsRemove.addEventListener('click', () => {
    if (!confirm('Usunąć login i hasło z tej notatki? Poprzednie wartości zostaną w historii edycji.')) return;
    flushSave();
    store.removeCredentials(selectedId);
    els.login.value = '';
    els.password.value = '';
    passwordRevealed = false;
    renderEditor();
  });
  els.pwEye.addEventListener('click', () => {
    passwordRevealed = !passwordRevealed;
    renderEditor();
  });
  els.login.addEventListener('input', () => {
    scheduleSave();
    renderCredentials(store.get(selectedId));
  });
  els.password.addEventListener('input', () => {
    scheduleSave();
    renderCredentials(store.get(selectedId));
  });
  // Mgła znika na czas pisania hasła i wraca po wyjściu z pola.
  els.password.addEventListener('focus', () => {
    flushSave();
    renderCredentials(store.get(selectedId));
  });
  els.password.addEventListener('blur', () => {
    flushSave();
    if (selectedId) renderCredentials(store.get(selectedId));
  });
  els.showHistory.addEventListener('click', openHistory);
  els.historyBack.addEventListener('click', closeHistory);
  els.historyList.addEventListener('click', (e) => {
    const item = e.target.closest('.version');
    if (!item) return;
    const index = Number(item.dataset.index);
    if (e.target.closest('.restore')) {
      restoreVersion(index);
    } else if (e.target.closest('.version-head')) {
      openVersion = openVersion === index ? null : index;
      renderEditor();
    }
  });

  // „Usuń” przenosi notatkę do kosza – można ją stamtąd przywrócić, więc bez pytania.
  els.deleteNote.addEventListener('click', () => {
    const note = store.get(selectedId);
    if (note.locked) return;
    flushSave();
    store.moveToTrash(selectedId);
    selectedId = null;
    closeNote();
    render();
  });

  els.openTrash.addEventListener('click', openTrash);
  els.closeTrash.addEventListener('click', closeTrash);

  els.trashList.addEventListener('click', (e) => {
    const item = e.target.closest('.trash-item');
    if (!item) return;
    const id = item.dataset.id;
    if (trashSelected.has(id)) trashSelected.delete(id);
    else trashSelected.add(id);
    renderTrash();
  });

  els.trashSelectAll.addEventListener('change', () => {
    const items = store.trash();
    if (trashSelected.size === items.length) trashSelected.clear();
    else items.forEach((n) => trashSelected.add(n.id));
    renderTrash();
  });

  els.trashRestore.addEventListener('click', () => {
    store.restoreFromTrash([...trashSelected]);
    trashSelected.clear();
    render();
  });

  els.trashDelete.addEventListener('click', () => {
    const ids = [...trashSelected];
    if (!ids.length) return;
    if (!confirm(`Usunąć na zawsze ${pluralNotes(ids.length)}? Tego nie da się cofnąć.`)) return;
    store.deleteForever(ids);
    trashSelected.clear();
    render();
  });

  els.trashEmptyAll.addEventListener('click', () => {
    const count = store.trash().length;
    if (!count) return;
    if (!confirm(`Opróżnić kosz? Wszystkie notatki z kosza (${count}) zostaną usunięte na zawsze. Tego nie da się cofnąć.`)) return;
    store.emptyTrash();
    trashSelected.clear();
    render();
  });

  window.addEventListener('popstate', (e) => {
    const id = e.state && e.state.note;
    const exists = id && store.list().some((n) => n.id === id);
    select(exists ? id : null);
    trashOpen = Boolean(e.state && e.state.trash);
    if (exists && e.state.history) historyOpen = true;
    render();
  });

  window.addEventListener('beforeunload', flushSave);
  // Na telefonie aplikacja jest często zamykana bez beforeunload – zapisz przy schowaniu.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAndSeal();
  });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Po ponownym uruchomieniu zaczynamy od listy.
  if (history.state && (history.state.note || history.state.trash)) history.replaceState(null, '');

  // Zapisuje zmiany i kończy sesję pisania (wyjście z aplikacji = nowa wersja w historii).
  function flushAndSeal() {
    flushSave();
    if (selectedId) store.sealHistory(selectedId);
  }

  // Wywoływane z natywnej aplikacji Android (android/src/pl/notatki/MainActivity.java).
  // handleBack zwraca true, jeśli przycisk „wstecz” został obsłużony w aplikacji.
  window.notatki = {
    handleBack() {
      if (historyOpen) {
        historyOpen = false;
        history.replaceState({ note: selectedId }, '');
        renderEditor();
        return true;
      }
      if (trashOpen) {
        trashOpen = false;
        history.replaceState(null, '');
        render();
        return true;
      }
      if (selectedId) {
        history.replaceState(null, '');
        select(null);
        return true;
      }
      return false;
    },
    flush: flushAndSeal,
  };

  render();
})();

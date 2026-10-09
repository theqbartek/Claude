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
  };

  // Odblokowanie wymaga kilku szybkich dotknięć kłódki – chroni przed przypadkowym odblokowaniem.
  const UNLOCK_TAPS = 3;
  const TAP_WINDOW_MS = 1500;

  let selectedId = null;
  let saveTimer = null;
  let unlockTaps = 0;
  let historyOpen = false;
  let openVersion = null; // indeks rozwiniętej wersji w historii
  let statusMessage = null; // jednorazowy komunikat zamiast daty zmiany
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
    els.status.textContent = statusMessage || 'Zmieniono: ' + dateFmt.format(note.updatedAt);
  }

  function render() {
    renderList();
    renderEditor();
  }

  function select(id) {
    flushSave();
    resetUnlockTaps();
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
    if (note.title === els.title.value && note.content === els.content.value) return;
    store.update(selectedId, { title: els.title.value, content: els.content.value });
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
      const open = openVersion === i;

      let sub = escapeHtml(v.title.trim() || 'Bez tytułu');
      if (i === 0) sub = 'Pierwsza wersja · ' + sub;
      else if (v.restoredFrom) sub = 'Przywrócono wersję z ' + dateFmt.format(v.restoredFrom);
      else if (titleChanged) sub = 'Zmieniono tytuł · ' + sub;

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
            ${open ? `<div class="diff">${renderDiff(diff)}</div>` : ''}
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
    statusMessage = 'Przywrócono wersję z ' + dateFmt.format(version.ts);
    closeHistory();
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
    const exists = id && store.list().some((n) => n.id === id);
    select(exists ? id : null);
    if (exists && e.state.history) {
      historyOpen = true;
      renderEditor();
    }
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
  if (history.state && history.state.note) history.replaceState(null, '');

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

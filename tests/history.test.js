const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, diffLines, LockedNoteError, STORAGE_KEY, MAX_VERSIONS } = require('../js/store.js');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

// Zegar sterowany z testu.
function clockStore(storage = memoryStorage()) {
  let t = 1000;
  const store = createStore(storage, () => t);
  return { store, tick: (ms = 1000) => { t += ms; }, storage };
}

test('kolejne zapisy w jednej sesji tworzą jedną wersję', () => {
  const { store, tick } = clockStore();
  const note = store.create();
  for (const text of ['a', 'ab', 'abc']) {
    tick();
    store.update(note.id, { content: text });
  }
  const h = store.history(note.id);
  assert.equal(h.length, 1);
  assert.equal(h[0].content, 'abc');
});

test('zamknięcie sesji sprawia, że następna zmiana to nowa wersja', () => {
  const { store, tick } = clockStore();
  const note = store.create({ title: 'Zakupy', content: 'mleko' });
  tick();
  store.update(note.id, { content: 'mleko\nchleb' });
  store.sealHistory(note.id);
  tick();
  store.update(note.id, { content: 'chleb' });
  assert.deepEqual(store.history(note.id).map((v) => v.content), ['mleko', 'mleko\nchleb', 'chleb']);
});

test('historia jest osobna dla każdej notatki', () => {
  const { store, tick } = clockStore();
  const a = store.create({ content: 'A1' });
  const b = store.create({ content: 'B1' });
  tick();
  store.update(a.id, { content: 'A2' });
  assert.deepEqual(store.history(a.id).map((v) => v.content), ['A1', 'A2']);
  assert.deepEqual(store.history(b.id).map((v) => v.content), ['B1']);
});

test('zapis bez zmian nie dodaje wersji', () => {
  const { store } = clockStore();
  const note = store.create({ content: 'x' });
  store.sealHistory(note.id);
  store.update(note.id, { content: 'x' });
  assert.equal(store.history(note.id).length, 1);
});

test('przywrócenie wersji dodaje nową wersję i niczego nie usuwa', () => {
  const { store, tick } = clockStore();
  const note = store.create({ title: 'T', content: 'v1' });
  tick();
  store.update(note.id, { title: 'T2', content: 'v2' });
  tick();
  const restored = store.restoreVersion(note.id, 0);
  assert.equal(restored.title, 'T');
  assert.equal(restored.content, 'v1');
  const h = store.history(note.id);
  assert.deepEqual(h.map((v) => v.content), ['v1', 'v2', 'v1']);
  assert.equal(h[2].restoredFrom, h[0].ts);
  // po przywróceniu dalsze pisanie tworzy kolejną wersję
  tick();
  store.update(note.id, { content: 'v3' });
  assert.equal(store.history(note.id).length, 4);
});

test('zablokowanej notatki nie można przywrócić, ale historię widać', () => {
  const { store, tick } = clockStore();
  const note = store.create({ content: 'v1' });
  tick();
  store.update(note.id, { content: 'v2' });
  store.lock(note.id);
  assert.throws(() => store.restoreVersion(note.id, 0), LockedNoteError);
  assert.equal(store.history(note.id).length, 2);
  assert.equal(store.get(note.id).content, 'v2');
});

test('blokada zamyka sesję – po odblokowaniu zmiany idą do nowej wersji', () => {
  const { store, tick } = clockStore();
  const note = store.create({ content: 'v1' });
  store.lock(note.id);
  store.unlock(note.id);
  tick();
  store.update(note.id, { content: 'v2' });
  assert.equal(store.history(note.id).length, 2);
});

test('historia przetrwa ponowne wczytanie', () => {
  const { store, tick, storage } = clockStore();
  const note = store.create({ content: 'v1' });
  tick();
  store.update(note.id, { content: 'v2' });
  assert.deepEqual(createStore(storage).history(note.id).map((v) => v.content), ['v1', 'v2']);
});

test('notatki ze starszej wersji aplikacji dostają historię od obecnego stanu', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify([
    { id: 'a', title: 'Stara', content: 'treść', locked: false, createdAt: 1, updatedAt: 5 },
  ]));
  let t = 10;
  const store = createStore(storage, () => t);
  assert.deepEqual(store.history('a').map((v) => v.content), ['treść']);
  store.update('a', { content: 'nowa treść' });
  assert.deepEqual(store.history('a').map((v) => v.content), ['treść', 'nowa treść']);
});

test('historia ma limit wersji', () => {
  const { store, tick } = clockStore();
  const note = store.create({ content: '0' });
  for (let i = 1; i <= MAX_VERSIONS + 10; i++) {
    tick();
    store.update(note.id, { content: String(i) });
    store.sealHistory(note.id);
  }
  const h = store.history(note.id);
  assert.equal(h.length, MAX_VERSIONS);
  assert.equal(h[h.length - 1].content, String(MAX_VERSIONS + 10));
});

test('zmiana zwróconej kopii nie psuje zapisanej historii', () => {
  const { store } = clockStore();
  const note = store.create({ content: 'v1' });
  store.history(note.id)[0].content = 'zmienione';
  assert.equal(store.history(note.id)[0].content, 'v1');
});

test('diffLines pokazuje dodane i usunięte wiersze', () => {
  assert.deepEqual(diffLines('mleko\nchleb\njajka', 'mleko\njajka\nser'), [
    { type: 'same', text: 'mleko' },
    { type: 'del', text: 'chleb' },
    { type: 'same', text: 'jajka' },
    { type: 'add', text: 'ser' },
  ]);
  assert.deepEqual(diffLines('', 'a'), [{ type: 'add', text: 'a' }]);
  assert.deepEqual(diffLines('a', ''), [{ type: 'del', text: 'a' }]);
});

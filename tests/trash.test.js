const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, LockedNoteError } = require('../js/store.js');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

function setup() {
  let t = 1000;
  const storage = memoryStorage();
  const store = createStore(storage, () => (t += 1000));
  const [a, b, c] = ['A', 'B', 'C'].map((title) => store.create({ title }));
  return { store, storage, a, b, c };
}

const titles = (notes) => notes.map((n) => n.title).sort();

test('usunięcie przenosi notatkę do kosza', () => {
  const { store, a } = setup();
  store.moveToTrash(a.id);
  assert.deepEqual(titles(store.list()), ['B', 'C']);
  assert.deepEqual(titles(store.trash()), ['A']);
});

test('kosz jest posortowany od ostatnio usuniętej', () => {
  const { store, a, b } = setup();
  store.moveToTrash(a.id);
  store.moveToTrash(b.id);
  assert.deepEqual(store.trash().map((n) => n.title), ['B', 'A']);
});

test('zablokowanej notatki nie można przenieść do kosza', () => {
  const { store, a } = setup();
  store.lock(a.id);
  assert.throws(() => store.moveToTrash(a.id), LockedNoteError);
  assert.equal(store.trash().length, 0);
});

test('przywrócenie z kosza oddaje notatki z historią', () => {
  const { store, a, b } = setup();
  store.update(a.id, { content: 'treść' });
  store.moveToTrash(a.id);
  store.moveToTrash(b.id);
  store.restoreFromTrash([a.id]);
  assert.deepEqual(titles(store.list()), ['A', 'C']);
  assert.deepEqual(titles(store.trash()), ['B']);
  assert.equal(store.get(a.id).content, 'treść');
  assert.ok(store.history(a.id).length >= 1);
});

test('usuwanie na zawsze tylko wybranych notatek z kosza', () => {
  const { store, a, b, c } = setup();
  store.moveToTrash(a.id);
  store.moveToTrash(b.id);
  store.deleteForever([a.id, c.id]); // c nie jest w koszu – nie może zniknąć
  assert.deepEqual(titles(store.trash()), ['B']);
  assert.deepEqual(titles(store.list()), ['C']);
  assert.throws(() => store.get(a.id));
});

test('opróżnienie kosza usuwa wszystko z kosza, ale nie z listy', () => {
  const { store, a, b } = setup();
  store.moveToTrash(a.id);
  store.moveToTrash(b.id);
  store.emptyTrash();
  assert.equal(store.trash().length, 0);
  assert.deepEqual(titles(store.list()), ['C']);
});

test('kosz przetrwa ponowne wczytanie i nic nie znika samo', () => {
  const { store, storage, a } = setup();
  store.moveToTrash(a.id);
  let later = 10 ** 12; // bardzo dużo czasu później
  const reloaded = createStore(storage, () => later);
  assert.deepEqual(titles(reloaded.trash()), ['A']);
});

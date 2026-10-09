const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, STORAGE_KEY } = require('../js/store.js');

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
  return { store, storage };
}

const titles = (store) => store.list().map((n) => n.title);
const ids = (store, ...names) => names.map((name) => store.list().find((n) => n.title === name).id);

test('nowa notatka pojawia się na górze pozostałych, pod przypiętymi', () => {
  const { store } = setup();
  const a = store.create({ title: 'A' });
  store.create({ title: 'B' });
  store.pin(a.id);
  store.create({ title: 'C' });
  assert.deepEqual(titles(store), ['A', 'C', 'B']);
});

test('ręczna zmiana kolejności pozostałych notatek', () => {
  const { store } = setup();
  ['A', 'B', 'C', 'D'].forEach((title) => store.create({ title }));
  assert.deepEqual(titles(store), ['D', 'C', 'B', 'A']);
  store.reorder(ids(store, 'A', 'D', 'C', 'B'));
  assert.deepEqual(titles(store), ['A', 'D', 'C', 'B']);
});

test('ręczna zmiana kolejności przypiętych notatek', () => {
  const { store } = setup();
  const [a, b, c] = ['A', 'B', 'C'].map((title) => store.create({ title }));
  store.create({ title: 'X' });
  [a, b, c].forEach((n) => store.pin(n.id));
  assert.deepEqual(titles(store), ['C', 'B', 'A', 'X']);
  store.reorder(ids(store, 'A', 'C', 'B'));
  assert.deepEqual(titles(store), ['A', 'C', 'B', 'X']);
});

test('nie da się wstawić zwykłej notatki między przypięte', () => {
  const { store } = setup();
  const a = store.create({ title: 'A' });
  store.create({ title: 'B' });
  store.pin(a.id);
  assert.throws(() => store.reorder(ids(store, 'B', 'A')));
  assert.deepEqual(titles(store), ['A', 'B']);
});

test('edycja nie zmienia ręcznej kolejności', () => {
  const { store } = setup();
  ['A', 'B', 'C'].forEach((title) => store.create({ title }));
  store.reorder(ids(store, 'A', 'B', 'C'));
  store.update(ids(store, 'C')[0], { content: 'nowa treść' });
  assert.deepEqual(titles(store), ['A', 'B', 'C']);
});

test('kolejność przetrwa ponowne wczytanie i powrót z kosza', () => {
  const { store, storage } = setup();
  ['A', 'B', 'C'].forEach((title) => store.create({ title }));
  store.reorder(ids(store, 'A', 'B', 'C'));
  const [b] = ids(store, 'B');
  store.moveToTrash(b);
  store.restoreFromTrash([b]);
  assert.deepEqual(titles(createStore(storage)), ['A', 'B', 'C']);
});

test('notatki ze starszej wersji dostają kolejność zgodną z dawnym sortowaniem', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify([
    { id: 'a', title: 'Stara', content: '', locked: false, createdAt: 1, updatedAt: 10 },
    { id: 'b', title: 'Nowsza', content: '', locked: false, createdAt: 1, updatedAt: 30 },
    { id: 'c', title: 'Przypięta', content: '', locked: false, createdAt: 1, updatedAt: 5, pinnedAt: 40 },
  ]));
  const store = createStore(storage, () => 100);
  assert.deepEqual(titles(store), ['Przypięta', 'Nowsza', 'Stara']);
  assert.ok(JSON.parse(storage.getItem(STORAGE_KEY)).every((n) => typeof n.position === 'number'));
});

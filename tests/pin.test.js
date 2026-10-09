const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore } = require('../js/store.js');

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

test('przypięta notatka jest na górze także po dodaniu nowych', () => {
  const { store } = setup();
  const a = store.create({ title: 'A' });
  store.create({ title: 'B' });
  store.pin(a.id);
  store.create({ title: 'C' });
  store.create({ title: 'D' });
  assert.deepEqual(titles(store), ['A', 'D', 'C', 'B']);
});

test('ostatnio przypięta jest najwyżej, a edycja nie zmienia kolejności przypiętych', () => {
  const { store } = setup();
  const a = store.create({ title: 'A' });
  const b = store.create({ title: 'B' });
  store.create({ title: 'C' });
  store.pin(a.id);
  store.pin(b.id);
  assert.deepEqual(titles(store), ['B', 'A', 'C']);
  store.update(a.id, { content: 'zmiana' });
  assert.deepEqual(titles(store), ['B', 'A', 'C']);
});

test('odpięta notatka trafia na górę pozostałych', () => {
  const { store } = setup();
  const a = store.create({ title: 'A' });
  store.create({ title: 'B' });
  store.create({ title: 'C' });
  store.pin(a.id);
  assert.deepEqual(titles(store), ['A', 'C', 'B']);
  store.unpin(a.id);
  assert.deepEqual(titles(store), ['A', 'C', 'B']);
  assert.ok(!store.get(a.id).pinnedAt);
});

test('zablokowaną notatkę można przypiąć i odpiąć', () => {
  const { store } = setup();
  const a = store.create({ title: 'A' });
  store.create({ title: 'B' });
  store.lock(a.id);
  store.pin(a.id);
  assert.deepEqual(titles(store), ['A', 'B']);
  store.unpin(a.id);
  assert.deepEqual(titles(store), ['A', 'B']);
  assert.ok(!store.get(a.id).pinnedAt);
});

test('przypięcie nie zmienia daty edycji ani historii', () => {
  const { store } = setup();
  const a = store.create({ title: 'A', content: 'x' });
  const before = store.get(a.id);
  store.pin(a.id);
  assert.equal(store.get(a.id).updatedAt, before.updatedAt);
  assert.equal(store.history(a.id).length, before.versions.length);
});

test('przypięcie przetrwa ponowne wczytanie i powrót z kosza', () => {
  const { store, storage } = setup();
  const a = store.create({ title: 'A' });
  store.create({ title: 'B' });
  store.pin(a.id);
  store.moveToTrash(a.id);
  assert.deepEqual(titles(store), ['B']);
  store.restoreFromTrash([a.id]);
  assert.deepEqual(titles(createStore(storage)), ['A', 'B']);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createStore,
  hashPassword,
  LockedNoteError,
  WrongPasswordError,
  STORAGE_KEY,
} = require('../js/store.js');

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

test('tworzenie i edycja notatki', () => {
  const store = createStore(memoryStorage());
  const note = store.create({ title: 'Zakupy', content: 'mleko' });
  store.update(note.id, { content: 'mleko, chleb' });
  assert.equal(store.get(note.id).content, 'mleko, chleb');
  assert.equal(store.list().length, 1);
});

test('zablokowanej notatki nie można edytować ani usunąć', () => {
  const store = createStore(memoryStorage());
  const note = store.create({ title: 'Ważne', content: 'nie ruszać' });
  store.lock(note.id);

  assert.throws(() => store.update(note.id, { content: 'zmiana' }), LockedNoteError);
  assert.throws(() => store.remove(note.id), LockedNoteError);
  assert.equal(store.get(note.id).content, 'nie ruszać');
});

test('po odblokowaniu edycja znów działa', () => {
  const store = createStore(memoryStorage());
  const note = store.create();
  store.lock(note.id);
  store.unlock(note.id);
  store.update(note.id, { title: 'Nowy' });
  assert.equal(store.get(note.id).title, 'Nowy');
});

test('blokada z hasłem wymaga poprawnego hasła', async () => {
  const store = createStore(memoryStorage());
  const note = store.create();
  store.lock(note.id, await hashPassword('tajne'));

  assert.throws(() => store.unlock(note.id), WrongPasswordError);
  const wrong = await hashPassword('zle');
  assert.throws(() => store.unlock(note.id, wrong), WrongPasswordError);
  assert.equal(store.get(note.id).locked, true);

  store.unlock(note.id, await hashPassword('tajne'));
  assert.equal(store.get(note.id).locked, false);
  assert.equal(store.get(note.id).passwordHash, null);
});

test('hasło nie jest zapisywane jawnym tekstem', async () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const note = store.create();
  store.lock(note.id, await hashPassword('tajne'));
  assert.ok(!storage.getItem(STORAGE_KEY).includes('tajne'));
});

test('blokada przetrwa ponowne wczytanie', () => {
  const storage = memoryStorage();
  const note = createStore(storage).create({ title: 'A' });
  createStore(storage).lock(note.id);
  const reloaded = createStore(storage);
  assert.equal(reloaded.get(note.id).locked, true);
  assert.throws(() => reloaded.update(note.id, { title: 'B' }), LockedNoteError);
});

test('uszkodzone dane w storage nie psują aplikacji', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{nie json');
  assert.deepEqual(createStore(storage).list(), []);
});

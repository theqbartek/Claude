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
  const note = store.create({ title: 'Wifi' });
  return { store, storage, note };
}

test('dodanie pól i zapis loginu oraz hasła', () => {
  const { store, note } = setup();
  assert.ok(!store.get(note.id).hasCredentials);
  store.addCredentials(note.id);
  store.update(note.id, { login: 'jan', password: 'tajne123' });
  const n = store.get(note.id);
  assert.equal(n.hasCredentials, true);
  assert.equal(n.login, 'jan');
  assert.equal(n.password, 'tajne123');
});

test('zablokowanych loginu i hasła nie można zmienić, ale tytuł i treść tak', () => {
  const { store, note } = setup();
  store.update(note.id, { login: 'jan', password: 'a' });
  store.lockCredentials(note.id);
  assert.throws(() => store.update(note.id, { password: 'b' }), LockedNoteError);
  assert.throws(() => store.removeCredentials(note.id), LockedNoteError);
  store.update(note.id, { content: 'hasło do domowego wifi' });
  assert.equal(store.get(note.id).content, 'hasło do domowego wifi');
  assert.equal(store.get(note.id).password, 'a');
});

test('odblokowanie loginu i hasła przywraca edycję', () => {
  const { store, note } = setup();
  store.update(note.id, { password: 'a' });
  store.lockCredentials(note.id);
  store.unlockCredentials(note.id);
  store.update(note.id, { password: 'b' });
  assert.equal(store.get(note.id).password, 'b');
});

test('blokada całej notatki blokuje też login i hasło', () => {
  const { store, note } = setup();
  store.update(note.id, { password: 'a' });
  store.lock(note.id);
  assert.throws(() => store.update(note.id, { password: 'b' }), LockedNoteError);
  assert.throws(() => store.addCredentials(note.id), LockedNoteError);
});

test('usunięcie pól czyści login i hasło, a stare wartości zostają w historii', () => {
  const { store, note } = setup();
  store.update(note.id, { login: 'jan', password: 'a' });
  store.sealHistory(note.id);
  store.removeCredentials(note.id);
  const n = store.get(note.id);
  assert.equal(n.hasCredentials, false);
  assert.equal(n.login, '');
  assert.equal(n.password, '');
  assert.ok(store.history(note.id).some((v) => v.password === 'a'));
});

test('historia zapisuje zmiany hasła i pozwala je przywrócić', () => {
  const { store, note } = setup();
  store.update(note.id, { login: 'jan', password: 'stare' });
  store.sealHistory(note.id);
  store.update(note.id, { password: 'nowe' });
  const h = store.history(note.id);
  const old = h.findIndex((v) => v.password === 'stare');
  store.restoreVersion(note.id, old);
  assert.equal(store.get(note.id).password, 'stare');
});

test('przywracanie wersji nie zmienia zablokowanego loginu i hasła', () => {
  const { store, note } = setup();
  store.update(note.id, { content: 'v1', password: 'stare' });
  store.sealHistory(note.id);
  store.update(note.id, { content: 'v2', password: 'nowe' });
  store.lockCredentials(note.id);
  const h = store.history(note.id);
  store.restoreVersion(note.id, h.findIndex((v) => v.content === 'v1'));
  assert.equal(store.get(note.id).content, 'v1');
  assert.equal(store.get(note.id).password, 'nowe');
});

test('login, hasło i ich blokada przetrwają ponowne wczytanie', () => {
  const { store, storage, note } = setup();
  store.update(note.id, { login: 'jan', password: 'a' });
  store.lockCredentials(note.id);
  const n = createStore(storage).get(note.id);
  assert.equal(n.login, 'jan');
  assert.equal(n.credentialsLocked, true);
});

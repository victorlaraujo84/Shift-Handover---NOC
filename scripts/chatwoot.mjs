import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://app.chatwoot.com';
const path = '/app/accounts/1/conversations/101';
const payload = 'INC-126039\nAcompanhar a nova data.';
const context = vm.createContext({
  chrome: { runtime: { onMessageExternal: { addListener() {} } } },
  location: { origin, pathname: path },
  Event,
});
vm.runInContext(readFileSync(new URL('../extension/worker.js', import.meta.url), 'utf8'), context);

class Textarea {
  #value = '';
  events = [];
  get value() { return this.#value; }
  set value(value) { this.#value = value; }
  getClientRects() { return [1]; }
  getAttribute() { return null; }
  querySelector() { return null; }
  focus() {}
  dispatchEvent(event) { this.events.push(event.type); }
}

const editor = new Textarea();
let privateMode = false;
context.HTMLTextAreaElement = Textarea;
context.document = {
  querySelectorAll() {
    return [{
      getClientRects: () => [1],
      classList: { contains: name => name === 'is-private' && privateMode },
      querySelectorAll: () => [editor],
    }];
  },
};
assert.equal(context.fillReply(origin, path + '2', payload), 'other');
assert.equal(editor.value, '');
privateMode = true;
assert.equal(context.fillReply(origin, path, payload), 'private');
assert.equal(editor.value, '');
privateMode = false;
editor.value = 'Rascunho existente';
assert.equal(context.fillReply(origin, path, payload), 'draft');
assert.equal(editor.value, 'Rascunho existente');
editor.value = '';
assert.equal(context.fillReply(origin, path, payload), 'filled');
assert.equal(editor.value, payload);
assert.deepEqual(editor.events, ['input']);
console.log('OK: conversa correta, resposta pública, rascunho preservado e texto preenchido.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { field, formatPhone, formatPostalCode, formatInput, setupInputFormats, PHONE_ATTRIBUTES } from '../src/form-fields.js';

test('phone masks accept mobile, landline and pasted Brazilian country code', () => {
  assert.equal(formatPhone('35999998888'), '(35) 99999-8888');
  assert.equal(formatPhone('3532671234'), '(35) 3267-1234');
  assert.equal(formatPhone('+55 (35) 99999-8888'), '(35) 99999-8888');
  assert.equal(formatPhone('5532671234'), '(55) 3267-1234');
  assert.equal(formatPhone(''), '');
  const pattern = new RegExp(`^(?:${PHONE_ATTRIBUTES.match(/pattern="([^"]+)"/)[1]})$`, 'v');
  assert.ok(pattern.test(formatPhone('35999998888')));
  assert.ok(pattern.test(formatPhone('3532671234')));
  assert.ok(!pattern.test(formatPhone('359999')));
});

test('CEP handles typing, pasted punctuation and extra digits', () => {
  assert.equal(formatPostalCode('37770'), '37770');
  assert.equal(formatPostalCode('37770000'), '37770-000');
  assert.equal(formatPostalCode('37.770-000'), '37770-000');
  assert.equal(formatPostalCode('377700001'), '37770-000');
  assert.equal(formatPostalCode(''), '');
});

function input(format, value, start = value.length, end = start) {
  return {
    dataset: { format }, value, selectionStart: start, selectionEnd: end,
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    matches: () => true
  };
}

test('formatting preserves an edit or selection in the middle of the field', () => {
  const phone = input('phone', '35999998888', 4, 7);
  formatInput(phone);
  assert.equal(phone.value, '(35) 99999-8888');
  assert.equal(phone.selectionStart, 7);
  assert.equal(phone.selectionEnd, 10);
  const pasted = input('phone', '+55 (35) 99999-8888');
  formatInput(pasted);
  assert.equal(pasted.selectionStart, pasted.value.length);
  const state = input('state', 'mg');
  formatInput(state);
  assert.equal(state.value, 'MG');
});

test('backspace and delete cross mask separators without trapping the caret', () => {
  const handlers = {};
  const form = { querySelectorAll: () => [], addEventListener: (type, handler) => { handlers[type] = handler; } };
  setupInputFormats(form);
  const cep = input('postal_code', '37770-000', 6);
  cep.dispatchEvent = () => handlers.input({ target: cep });
  let prevented = false;
  handlers.beforeinput({ target: cep, inputType: 'deleteContentBackward', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  assert.equal(cep.value, '37770-00');
  assert.equal(cep.selectionStart, 4);
  const phone = input('phone', '(35) 3267-1234', 9);
  phone.dispatchEvent = () => handlers.input({ target: phone });
  handlers.beforeinput({ target: phone, inputType: 'deleteContentForward', preventDefault() {} });
  assert.equal(phone.value, '(35) 3267-234');
  assert.equal(phone.selectionStart, 9);
});

test('field labels distinguish requirements, format saved values and use unique accessible hints', () => {
  const phone = field('phone', 'Telefone com DDD', '5535999998888', PHONE_ATTRIBUTES);
  assert.match(phone, /value="\(35\) 99999-8888"/);
  assert.match(phone, /field-required/);
  assert.doesNotMatch(phone, /opcional/);
  const complement = field('complement', 'Complemento', '<Casa>', 'maxlength="180"');
  assert.match(complement, /\(opcional\)/);
  assert.match(complement, /&lt;Casa&gt;/);
  const number = field('number', 'Número', '', 'required', 'Informe s/n se não houver número.');
  const hintId = number.match(/aria-describedby="([^"]+)"/)[1];
  assert.ok(number.includes(`id="${hintId}"`));
  assert.notEqual(phone.match(/<input id="([^"]+)"/)[1], field('phone', 'Telefone', '', PHONE_ATTRIBUTES).match(/<input id="([^"]+)"/)[1]);
});

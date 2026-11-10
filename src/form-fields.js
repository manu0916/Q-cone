import { escapeHTML } from './domain.js';

const digits = value => String(value ?? '').replace(/\D/g, '');
const hasCountryCode = value => /^55\d{10,11}$/.test(digits(value));

export function formatPhone(value) {
  let number = digits(value);
  if (hasCountryCode(value)) number = number.slice(2);
  number = number.slice(0, 11);
  if (!number) return '';
  if (number.length <= 2) return `(${number}`;
  const local = number.slice(2);
  const split = local.length > 8 ? 5 : 4;
  return `(${number.slice(0, 2)}) ${local.slice(0, split)}${local.length > split ? `-${local.slice(split)}` : ''}`;
}

export function formatPostalCode(value) {
  const number = digits(value).slice(0, 8);
  return number.length > 5 ? `${number.slice(0, 5)}-${number.slice(5)}` : number;
}

const formatters = {
  phone: formatPhone,
  postal_code: formatPostalCode,
  state: value => String(value ?? '').replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase()
};

export const PHONE_ATTRIBUTES = 'type="tel" autocomplete="tel-national" inputmode="tel" data-format="phone" placeholder="(35) 99999-9999" pattern="\\([0-9]{2}\\) [0-9]{4,5}-[0-9]{4}" title="Informe o DDD e um telefone de 8 ou 9 dígitos." required';

let nextFieldId = 0;
export function field(name, label, value = '', attributes = '', hint = '') {
  const format = attributes.match(/data-format="([^"]+)"/)?.[1];
  const required = /\brequired\b/.test(attributes);
  const id = `field-${name}-${++nextFieldId}`;
  return `<label for="${id}"><span>${label}${required ? ' <span class="field-required" aria-hidden="true">*</span>' : ' <span class="field-optional">(opcional)</span>'}</span><input id="${id}" name="${name}" value="${escapeHTML(formatters[format] ? formatters[format](value) : value)}" ${attributes}${hint ? ` aria-describedby="${id}-hint"` : ''}>${hint ? `<small class="field-hint" id="${id}-hint">${hint}</small>` : ''}</label>`;
}

function caretAfterDigits(value, count) {
  if (!count) return value.startsWith('(') ? 1 : 0;
  for (let index = 0, seen = 0; index < value.length; index++) {
    if (/\d/.test(value[index]) && ++seen === count) return index + 1;
  }
  return value.length;
}

export function formatInput(input) {
  const format = input.dataset.format;
  const formatter = formatters[format];
  if (!formatter) return;
  const original = input.value;
  const start = input.selectionStart ?? original.length;
  const end = input.selectionEnd ?? start;
  const value = formatter(original);
  if (original === value) return;
  input.value = value;
  if (format === 'state') {
    input.setSelectionRange(Math.min(start, value.length), Math.min(end, value.length));
  } else {
    const removed = format === 'phone' && hasCountryCode(original) ? 2 : 0;
    const position = offset => caretAfterDigits(value, Math.max(0, digits(original.slice(0, offset)).length - removed));
    input.setSelectionRange(position(start), position(end));
  }
}

export function setupInputFormats(form) {
  form.querySelectorAll('input[data-format]').forEach(formatInput);
  form.addEventListener('input', event => {
    if (event.target.matches('input[data-format]') && !event.isComposing) formatInput(event.target);
  });
  form.addEventListener('change', event => {
    if (event.target.matches('input[data-format]')) formatInput(event.target);
  });
  // Deleting a separator also removes the adjacent digit, so the caret never gets stuck.
  form.addEventListener('beforeinput', event => {
    const input = event.target;
    if (!input.matches('input[data-format="phone"], input[data-format="postal_code"]') || input.selectionStart !== input.selectionEnd) return;
    const direction = event.inputType === 'deleteContentBackward' ? -1 : event.inputType === 'deleteContentForward' ? 1 : 0;
    if (!direction) return;
    let index = input.selectionStart + (direction < 0 ? -1 : 0);
    if (index < 0 || index >= input.value.length || /\d/.test(input.value[index])) return;
    while (index >= 0 && index < input.value.length && !/\d/.test(input.value[index])) index += direction;
    if (index < 0 || index >= input.value.length) return;
    event.preventDefault();
    const caret = direction < 0 ? index : input.selectionStart;
    input.value = input.value.slice(0, index) + input.value.slice(index + 1);
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

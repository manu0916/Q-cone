import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeCart,readCart,cartTotal,validateCustomer,escapeHTML} from '../src/domain.js';
test('guest cart rejects corruption, duplicate overflow and unknown products',()=>{assert.deepEqual(sanitizeCart([{product_id:'a',quantity:80},{product_id:'a',quantity:80},{product_id:'x',quantity:1},{product_id:'b',quantity:-1}],['a','b']),[{product_id:'a',quantity:99}]);assert.deepEqual(readCart({getItem:()=>'{invalid'},['a']),[]);});
test('cart uses catalog prices in integer cents',()=>{assert.equal(cartTotal([{product_id:'a',quantity:3,price_cents:1}],[{id:'a',price_cents:1400}]),4200);});
test('customer validation and output encoding',()=>{assert.equal(validateCustomer({name:'Cliente Teste',phone:'(35) 99999-9999'}),'');assert.ok(validateCustomer({name:'A',phone:'12'}));assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');});

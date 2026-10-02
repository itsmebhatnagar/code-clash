import assert from 'node:assert/strict';
import test from 'node:test';
import './helpers';
import { normalizeLanguage, normalizeOutput } from '../src/judgeWorker';
import { LANGUAGE_REGISTRY } from '../src/judgeLanguages';

test('normalizes supported judge language aliases', () => {
  assert.equal(normalizeLanguage('JS'), null);
  assert.equal(normalizeLanguage('python3'), 'python');
  assert.equal(normalizeLanguage('c++'), 'cpp');
  assert.equal(normalizeLanguage('ruby'), null);
});

test('compiles C++ as C++17 only', () => {
  assert.ok(LANGUAGE_REGISTRY.cpp.compile?.args.includes('-std=c++17'));
  assert.equal(LANGUAGE_REGISTRY.cpp.compile?.args.includes('-std=c++20'), false);
  assert.equal(LANGUAGE_REGISTRY.cpp.compile?.args.includes('-std=c++23'), false);
});

test('normalizes line endings and trailing whitespace in output', () => {
  assert.equal(normalizeOutput('answer  \r\nsecond\r\n'), 'answer\nsecond');
});
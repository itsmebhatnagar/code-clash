import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeLanguage, normalizeOutput } from '../src/judgeWorker';

test('normalizes supported judge language aliases', () => {
  assert.equal(normalizeLanguage('JS'), 'javascript');
  assert.equal(normalizeLanguage('python3'), 'python');
  assert.equal(normalizeLanguage('c++'), 'cpp');
  assert.equal(normalizeLanguage('ruby'), null);
});

test('normalizes line endings and trailing whitespace in output', () => {
  assert.equal(normalizeOutput('answer  \r\nsecond\r\n'), 'answer\nsecond');
});
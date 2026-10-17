import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonDiagnostic } from '../src/jsonSyntax.js';

test('valid JSON and BOM-prefixed source have no syntax diagnostic', () => {
  for (const text of ['null', 'true', 'false', '0', '-1.2e-3', '"🌱\\n\\u1234"', '{}', '[]', '{"": [1, null, {"nested":true}]}', '\uFEFF{"tree":false}']) assert.equal(jsonDiagnostic(text), null, text);
});

test('diagnostics locate syntax errors and incomplete input at the exact character', () => {
  const cases = [
    ['{\n  "tree": true\n  "pot": 1\n}', '"pot"'],
    ['{\n  "tree": @\n}', '@'],
    ['{\n  "tree": 1,\n}', '}'],
    ['[1,]', ']'], ['{"x" 1}', '1'], ['{"x": truX}', 'X'],
    ['{"x": "\\q"}', 'q'], ['"\\u12xz"', 'x'], ['"unescaped\nline"', '\n'],
    ['01', '1'], ['1.', ''], ['1e+', ''], ['-', ''],
    ['{"x":', ''], ['"unterminated', ''], ['[1,', ''], ['', ''],
    ['\uFEFF{\n"x": @}', '@'], ['true false', 'false'],
  ];
  for (const [text, at] of cases) {
    const expected = at ? text.indexOf(at) : text.length, issue = jsonDiagnostic(text);
    assert.ok(issue, text);
    assert.equal(issue.position, expected, text);
    const before = text.slice(0, expected);
    assert.equal(issue.line, before.split('\n').length, text);
    assert.equal(issue.column, expected - before.lastIndexOf('\n'), text);
    assert.ok(issue.message.length);
  }
});

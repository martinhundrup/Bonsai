// JSON.parse remains authoritative. This scanner supplies a precise location even
// in browsers whose parse errors omit offsets (including incomplete input).
export function jsonDiagnostic(text) {
  const bom = text.startsWith('\uFEFF') ? 1 : 0, source = text.slice(bom);
  try { JSON.parse(source); return null; } catch { /* Locate the first syntax error below. */ }
  let offset = 0;
  const fail = message => { throw { position: offset + bom, message }; };
  const space = () => { while (/[\t\n\r ]/.test(source[offset] ?? '\0')) offset++; };
  function string() {
    offset++;
    while (offset < source.length) {
      const char = source[offset++];
      if (char === '"') return;
      if (char.charCodeAt(0) < 32) { offset--; fail('Escape control characters inside strings.'); }
      if (char === '\\') {
        if (source[offset] === 'u') {
          offset++;
          for (let digit = 0; digit < 4; digit++, offset++) if (!/[0-9a-f]/i.test(source[offset] ?? '')) fail('Expected four hexadecimal digits after \\u.');
        } else if (/^["\\/bfnrt]$/.test(source[offset] ?? '')) offset++;
        else fail('Expected a valid string escape.');
      }
    }
    fail('Expected a closing quote.');
  }
  function value() {
    space();
    const char = source[offset];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      const object = char === '{', close = object ? '}' : ']';
      offset++; space();
      if (source[offset] === close) { offset++; return; }
      while (true) {
        if (object) {
          if (source[offset] !== '"') fail('Expected a property name in double quotes.');
          string(); space();
          if (source[offset] !== ':') fail('Expected ":" after the property name.');
          offset++;
        }
        value(); space();
        if (source[offset] === close) { offset++; return; }
        if (source[offset] !== ',') fail(`Expected "," or "${close}".`);
        offset++; space();
      }
    }
    if (char === '-' || /\d/.test(char ?? '')) {
      if (char === '-') offset++;
      if (source[offset] === '0') offset++;
      else {
        if (!/[1-9]/.test(source[offset] ?? '')) fail('Expected a digit.');
        while (/\d/.test(source[offset] ?? '')) offset++;
      }
      if (source[offset] === '.') {
        offset++;
        if (!/\d/.test(source[offset] ?? '')) fail('Expected a digit after the decimal point.');
        while (/\d/.test(source[offset] ?? '')) offset++;
      }
      if (/[eE]/.test(source[offset] ?? '')) {
        offset++;
        if (/[+-]/.test(source[offset] ?? '')) offset++;
        if (!/\d/.test(source[offset] ?? '')) fail('Expected an exponent digit.');
        while (/\d/.test(source[offset] ?? '')) offset++;
      }
      return;
    }
    const literal = { t: 'true', f: 'false', n: 'null' }[char];
    if (literal) {
      for (const letter of literal) {
        if (source[offset] !== letter) fail(`Expected "${literal}".`);
        offset++;
      }
      return;
    }
    fail('Expected a JSON value.');
  }
  let issue;
  try { value(); space(); fail('Unexpected content after the JSON value.'); }
  catch (error) {
    issue = Number.isInteger(error.position) ? error : { position: offset + bom, message: 'Invalid JSON near this position.' };
  }
  const position = Math.min(text.length, issue.position), before = text.slice(0, position);
  return { ...issue, position, line: before.split('\n').length, column: position - before.lastIndexOf('\n') };
}

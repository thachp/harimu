import assert from 'node:assert/strict';
import {validSquareText,uuidPattern} from '../lib/square-chat-validation.ts';
assert.equal(validSquareText(' hello '),true);
assert.equal(validSquareText('<script>alert(1)</script>'),true); // Rendered as React text, never HTML.
for(const text of ['', '   ', 'x'.repeat(281),'x\u0000',{},null])assert.equal(validSquareText(text),false);
assert.equal(validSquareText('x'.repeat(280)),true);
assert.equal(uuidPattern.test('c37e2c43-1db4-4a18-b31b-43b4d432a456'),true);
assert.equal(uuidPattern.test('caller-user-id'),false);
console.log('Square text and request validation passed.');

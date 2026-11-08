const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseCnsPage, splitTrackingNumbers, isValidTrackingNumber } = require('../cns');

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('parseCnsPage reads every step of a real CNS page, including the Thai carrier, newest first', () => {
  const { note, steps } = parseCnsPage(fixture('cns-home-found.html'));
  assert.equal(note, 'รหัสพัสดุนี้ถึงไทยแล้ว ส่งต่อขนส่ง Flash เรียบร้อย รหัสพัสดุ TH01439B26WV4A สถานะการจัดส่งตามด้านล่างนี้');
  assert.equal(steps.length, 15);
  assert.deepEqual(steps[0], {
    date: '05/11/2026 12:54',
    description: 'นำส่งสำเร็จ เซ็นรับโดย【C.R.ENGINEERING AND TECHNOLOGY CO., LTD.(เจ้าของสินค้า)】 ขอบคุณที่ใช้บริการ Flash Express สวนหลวง สวนหลวง กรุงเทพ',
    done: true,
  });
  assert.deepEqual(steps[14], { date: '17/10/2026 17:30', description: 'ถึงโกดังจีน', done: true });
  assert.deepEqual(steps.slice(7).map(s => s.description), [
    'ถึงโกดังไทย',
    'ผ่านพิธีศุลกากรไทยเรียบร้อย',
    'ด่านไทยตรวจปล่อย',
    'ถึงชายแดนไทย',
    'ออกจากด่านจีนแล้ว',
    'ผ่านพิธีศุลกากรจีนเรียบร้อย',
    'ออกจากโกดังจีน',
    'ถึงโกดังจีน',
  ]);
  // Two steps share 04/11/2026 15:55; they keep the order CNS shows.
  assert.match(steps[5].description, /^รับพัสดุเข้าสาขา/);
  assert.match(steps[6].description, /^เจ้าหน้าที่สาขา/);
});

test('parseCnsPage returns null when CNS has no such number', () => {
  assert.equal(parseCnsPage(fixture('cns-home-not-found.html')), null);
});

test('splitTrackingNumbers splits on commas and spaces and drops duplicates', () => {
  assert.deepEqual(splitTrackingNumbers(' A1234, B5678  C9012,,A1234 '), ['A1234', 'B5678', 'C9012']);
  assert.deepEqual(splitTrackingNumbers(''), []);
});

test('isValidTrackingNumber accepts letters, digits and dashes only', () => {
  assert.equal(isValidTrackingNumber('SF0210589618167'), true);
  assert.equal(isValidTrackingNumber('<script>'), false);
  assert.equal(isValidTrackingNumber('ab'), false);
});

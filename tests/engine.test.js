'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Minesweeper } = require('../engine.js');

const { HIDDEN, OPEN, FLAG, QUESTION } = Minesweeper;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function sequence(indices, size) {
  let k = 0;
  return () => (indices[k++ % indices.length] + 0.5) / size;
}

const count = (arr, v) => arr.reduce((n, x) => n + (x === v ? 1 : 0), 0);

test('첫 칸은 절대 지뢰가 아니다 (고급 판 300회)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = seeded(seed);
    const g = new Minesweeper(16, 30, 99, rnd);
    const first = Math.floor(rnd() * g.size);
    g.reveal(first);
    assert.notEqual(g.status, 'lost');
    assert.equal(g.mine[first], 0);
    assert.equal(count(Array.from(g.mine), 1), 99);
  }
});

test('첫 칸에 걸린 지뢰는 왼쪽 위 첫 빈칸으로 옮겨진다 (원본 방식)', () => {
  // 지뢰를 가운데(40)와 첫 줄 0~8 에 깐다. 가운데를 먼저 누르면 그 지뢰는 9번 칸으로 간다.
  const g = new Minesweeper(9, 9, 10, sequence([40, 0, 1, 2, 3, 4, 5, 6, 7, 8], 81));
  g.reveal(40);
  assert.equal(g.mine[40], 0);
  assert.equal(g.mine[9], 1);
  assert.equal(count(Array.from(g.mine), 1), 10);
  assert.notEqual(g.status, 'lost');
});

test('빈 칸을 열면 주변이 연쇄로 열리고, 다 열면 이긴다', () => {
  const g = Minesweeper.fromMap([
    '*....',
    '.....',
    '.....',
  ]);
  g.reveal(14);
  assert.equal(g.status, 'won');
  assert.equal(g.opened, 14);
  assert.equal(g.state[0], FLAG, '이기면 남은 지뢰에 깃발이 꽂힌다');
  assert.equal(g.minesLeft, 0);
});

test('연쇄로 열릴 때 깃발 칸은 열지 않고, 물음표 칸은 연다', () => {
  const g = Minesweeper.fromMap([
    '*....',
    '.....',
    '.....',
  ]);
  g.toggleMark(12, true); // 깃발
  g.toggleMark(13, true);
  g.toggleMark(13, true); // 물음표
  g.reveal(4);
  assert.equal(g.state[12], FLAG);
  assert.equal(g.state[13], OPEN);
  assert.equal(g.status, 'playing', '깃발 아래 칸이 남아 있으니 아직 안 끝남');
});

test('깃발 칸은 눌러도 열리지 않고, 물음표 칸은 열린다', () => {
  const g = Minesweeper.fromMap(['*..', '...', '...']);
  g.toggleMark(8, true);
  assert.equal(g.reveal(8), false);
  assert.equal(g.state[8], FLAG);
  g.toggleMark(2, true);
  g.toggleMark(2, true);
  assert.equal(g.state[2], QUESTION);
  assert.equal(g.reveal(2), true);
  assert.equal(g.state[2], OPEN);
});

test('표시 순환: 물음표 켜짐이면 깃발→물음표→해제, 꺼짐이면 깃발→해제', () => {
  const g = Minesweeper.fromMap(['*..', '...', '...']);
  g.toggleMark(4, true);
  assert.equal(g.state[4], FLAG);
  g.toggleMark(4, true);
  assert.equal(g.state[4], QUESTION);
  g.toggleMark(4, true);
  assert.equal(g.state[4], HIDDEN);
  g.toggleMark(4, false);
  g.toggleMark(4, false);
  assert.equal(g.state[4], HIDDEN);
  assert.equal(g.flags, 0);
});

test('남은 지뢰 수는 깃발을 많이 꽂으면 음수가 된다', () => {
  const g = Minesweeper.fromMap(['*..', '...', '...']);
  g.toggleMark(1, true);
  g.toggleMark(2, true);
  g.toggleMark(3, true);
  assert.equal(g.minesLeft, -2);
});

test('숫자 칸 동시 열기: 깃발이 맞으면 주변을 연다', () => {
  const g = Minesweeper.fromMap([
    '*..*',
    '....',
    '....',
    '*..*',
  ]);
  g.reveal(5); // 1행1열 숫자 1
  assert.equal(g.adj[5], 1);
  g.toggleMark(0, true);
  assert.equal(g.chord(5), true);
  for (const j of [1, 2, 4, 6, 8, 9, 10]) assert.equal(g.state[j], OPEN);
  assert.equal(g.opened, 8);
  assert.equal(g.status, 'playing');
});

test('숫자 칸 동시 열기: 깃발 수가 다르면 아무 일도 없다', () => {
  const g = Minesweeper.fromMap(['*..', '...', '...']);
  g.reveal(4);
  assert.equal(g.chord(4), false);
  assert.equal(g.opened, 1);
});

test('숫자 칸 동시 열기: 깃발을 잘못 꽂았으면 진다', () => {
  const g = Minesweeper.fromMap(['*..', '...', '...']);
  g.reveal(4);
  g.toggleMark(2, true); // 엉뚱한 곳에 깃발
  g.chord(4);
  assert.equal(g.status, 'lost');
  assert.deepEqual(g.exploded, [0]);
});

test('지뢰를 밟으면 지고, 그 뒤로는 어떤 조작도 먹지 않는다', () => {
  const g = Minesweeper.fromMap(['*..', '...', '...']);
  g.reveal(0);
  assert.equal(g.status, 'lost');
  assert.deepEqual(g.exploded, [0]);
  assert.equal(g.reveal(8), false);
  assert.equal(g.toggleMark(8, true), false);
});

test('저장했다 불러와도 판이 똑같다', () => {
  const g = new Minesweeper(16, 16, 40, seeded(7));
  g.reveal(100);
  g.toggleMark(0, true);
  const copy = Minesweeper.fromJSON(JSON.parse(JSON.stringify(g)));
  assert.deepEqual(Array.from(copy.mine), Array.from(g.mine));
  assert.deepEqual(Array.from(copy.state), Array.from(g.state));
  assert.deepEqual(Array.from(copy.adj), Array.from(g.adj));
  assert.equal(copy.status, g.status);
  assert.equal(copy.flags, g.flags);
  assert.equal(copy.opened, g.opened);
});

test('망가진 저장 데이터는 거부한다', () => {
  assert.throws(() => Minesweeper.fromJSON({ rows: 9, cols: 9, mines: 10, status: 'playing', mine: '0', state: '0' }));
});

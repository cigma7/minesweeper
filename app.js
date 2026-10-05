/* 지뢰 찾기 화면 — 판 그리기, 터치 조작, 메뉴, 기록, 소리 */
(() => {
  'use strict';

  const { HIDDEN, OPEN, FLAG, QUESTION } = Minesweeper;

  // 판 크기는 화면에 맞춰 정하고, 난이도는 지뢰 비율로만 정한다.
  // 앞의 셋은 원본 초급(10/81)·중급(40/256)·고급(99/480)의 지뢰 비율과 같다.
  const LEVELS = {
    easy: { name: '쉬움', ratio: 0.12 },
    normal: { name: '보통', ratio: 0.16 },
    hard: { name: '어려움', ratio: 0.21 },
    extreme: { name: '아주 어려움', ratio: 0.25 },
  };
  const LEVEL_KEYS = Object.keys(LEVELS);
  // 칸 한 변의 최소 크기. 일반 아이폰 세로 화면에서 각각 가로 8·9·10칸이 된다.
  const CELL_SIZES = {
    large: { name: '큰 칸', px: 43 },
    normal: { name: '보통 칸', px: 38 },
    small: { name: '작은 칸', px: 34 },
  };
  const SIZE_KEYS = Object.keys(CELL_SIZES);
  const DEFAULT_NAME = '익명';
  const LONG_PRESS_MS = 400;
  const MOVE_TOLERANCE = 10;
  const CELL_MIN = 18;
  const CELL_MAX = 64;

  // ---------- 저장 (휴대폰 안에만 남는다) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('ms.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('ms.' + key, JSON.stringify(value));
      } catch {}
    },
  };

  const settings = Object.assign(
    { level: 'easy', cellSize: 'normal', marks: true, color: true, sound: false, flagMode: false, area: null },
    store.get('settings', {}),
  );
  // 예전 버전(초급·중급·고급·사용자 정의)의 설정은 새 방식으로 바꾼다.
  if (!LEVELS[settings.level]) settings.level = 'easy';
  if (!CELL_SIZES[settings.cellSize]) settings.cellSize = 'normal';
  delete settings.custom;
  const saveSettings = () => store.set('settings', settings);

  // 기록은 난이도와 칸 크기 조합마다 따로 둔다 (칸 크기가 바뀌면 판 크기도 바뀐다).
  const recordKey = (level, size) => `${level}.${size}`;
  function loadRecords() {
    const saved = store.get('records', {});
    const out = {};
    for (const level of LEVEL_KEYS) {
      for (const size of SIZE_KEYS) {
        const k = recordKey(level, size);
        const r = saved && saved[k];
        out[k] = r && Number.isFinite(r.time) && typeof r.name === 'string' ? r : { time: 999, name: DEFAULT_NAME };
      }
    }
    return out;
  }
  let records = loadRecords();

  // ---------- 그림 (원본 비트맵을 픽셀 단위로 다시 그림) ----------
  const NUMBER_COLORS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];

  const DIGITS = {
    1: ['.......##.......', '......###.......', '.....####.......', '....#####.......', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '....########....', '....########....'],
    2: ['.....######.....', '....########....', '....##....##....', '..........##....', '........####....', '......####......', '....####........', '....##..........', '....########....', '....########....'],
    3: ['....#######.....', '....########....', '..........##....', '..........##....', '......#####.....', '......#####.....', '..........##....', '..........##....', '....########....', '....#######.....'],
    4: ['....##...##.....', '....##...##.....', '....##...##.....', '....##...##.....', '....########....', '....########....', '.........##.....', '.........##.....', '.........##.....', '.........##.....'],
    5: ['....########....', '....########....', '....##..........', '....##..........', '....#######.....', '....########....', '..........##....', '..........##....', '....########....', '....#######.....'],
    6: ['.....######.....', '....#######.....', '....##..........', '....##..........', '....#######.....', '....########....', '....##....##....', '....##....##....', '....########....', '.....######.....'],
    7: ['....########....', '....########....', '..........##....', '.........##.....', '........##......', '........##......', '.......##.......', '.......##.......', '.......##.......', '.......##.......'],
    8: ['.....######.....', '....########....', '....##....##....', '....##....##....', '.....######.....', '....########....', '....##....##....', '....##....##....', '....########....', '.....######.....'],
  };
  const QUESTION_ART = ['.....######.....', '....########....', '....##....##....', '..........##....', '........###.....', '.......##.......', '.......##.......', '................', '.......##.......', '.......##.......'];
  const MINE_ART = [
    '................',
    '................',
    '.......#........',
    '.......#........',
    '...#.#####.#....',
    '....#######.....',
    '...##WW#####....',
    '...##WW#####....',
    '.#############..',
    '...#########....',
    '...#########....',
    '....#######.....',
    '...#.#####.#....',
    '.......#........',
    '.......#........',
    '................',
  ];
  const FLAG_ART = [
    '................',
    '................',
    '................',
    '......RR#.......',
    '....RRRR#.......',
    '...RRRRR#.......',
    '....RRRR#.......',
    '......RR#.......',
    '........#.......',
    '........#.......',
    '......#####.....',
    '....#########...',
    '....#########...',
    '................',
    '................',
    '................',
  ];
  const CHECK_ART = ['......#', '.....##', '#...###', '##.###.', '#####..', '.###...', '..#....'];

  const pad16 = (lines, top = 3) => {
    const blank = '.'.repeat(16);
    const out = [];
    for (let y = 0; y < 16; y++) out.push(lines[y - top] || blank);
    return out;
  };

  function pixelSvg(rows, colors, extra = '') {
    const h = rows.length;
    const w = rows[0].length;
    let rects = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < w) {
        const ch = row[x];
        if (ch === '.') {
          x++;
          continue;
        }
        let x2 = x + 1;
        while (x2 < w && row[x2] === ch) x2++;
        rects += `<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${colors[ch]}"/>`;
        x = x2;
      }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}${extra}</svg>`;
  }
  const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

  function faceArt(kind) {
    const N = 17;
    const g = [];
    for (let y = 0; y < N; y++) {
      const row = [];
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x - 8, y - 8);
        row.push(d <= 7.4 ? 'Y' : d <= 8.5 ? '#' : '.');
      }
      g.push(row);
    }
    const dot = (pts) => pts.forEach(([x, y]) => (g[y][x] = '#'));
    const smile = [[4, 10], [12, 10], [5, 11], [11, 11], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12]];
    const eyes = [[5, 5], [6, 5], [5, 6], [6, 6], [10, 5], [11, 5], [10, 6], [11, 6]];
    if (kind === 'smile') dot([...eyes, ...smile]);
    if (kind === 'oh') dot([...eyes, [7, 10], [8, 10], [9, 10], [6, 11], [10, 11], [6, 12], [10, 12], [7, 13], [8, 13], [9, 13]]);
    if (kind === 'dead') {
      dot([[4, 4], [6, 4], [5, 5], [4, 6], [6, 6], [10, 4], [12, 4], [11, 5], [10, 6], [12, 6]]);
      dot([[6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [5, 12], [11, 12], [4, 13], [12, 13]]);
    }
    if (kind === 'cool') {
      for (let x = 2; x <= 14; x++) g[5][x] = '#';
      for (let x = 3; x <= 7; x++) g[6][x] = '#';
      for (let x = 9; x <= 13; x++) g[6][x] = '#';
      for (let x = 4; x <= 6; x++) g[7][x] = '#';
      for (let x = 10; x <= 12; x++) g[7][x] = '#';
      dot(smile);
    }
    return g.map((r) => r.join(''));
  }

  function installSprites() {
    const black = { '#': '#000', W: '#fff', R: '#f00', Y: '#ff0' };
    const mine = pixelSvg(MINE_ART, black);
    const cross = '<path d="M2.5 2.5L13.5 13.5M13.5 2.5L2.5 13.5" stroke="#f00" stroke-width="1.6" shape-rendering="geometricPrecision"/>';
    const css = [];
    for (let n = 1; n <= 8; n++) css.push(`.c.n${n}{background-image:${svgUrl(pixelSvg(pad16(DIGITS[n]), { '#': NUMBER_COLORS[n] }))}}`);
    css.push(`.c.q,.c.qp{background-image:${svgUrl(pixelSvg(pad16(QUESTION_ART), black))}}`);
    css.push(`.c.m,.c.mx{background-image:${svgUrl(mine)}}`);
    css.push(`.c.mw{background-image:${svgUrl(pixelSvg(MINE_ART, black, cross))}}`);
    css.push(`.c.f{background-image:${svgUrl(pixelSvg(FLAG_ART, black))}}`);
    for (const k of ['smile', 'oh', 'dead', 'cool']) css.push(`.face[data-face="${k}"]{background-image:${svgUrl(pixelSvg(faceArt(k), black))}}`);
    css.push(`:root{--flag:${svgUrl(pixelSvg(FLAG_ART, black))};--check:${svgUrl(pixelSvg(CHECK_ART, black))}}`);
    const style = document.createElement('style');
    style.textContent = css.join('\n');
    document.head.appendChild(style);
  }

  // ---------- 빨간 숫자판 (7세그먼트) ----------
  const SEGMENTS = (() => {
    const h = 1.4;
    const L = 2.2;
    const R = 10.8;
    const T = 2.2;
    const M = 11.5;
    const B = 20.8;
    const gap = 0.55;
    const hs = (x0, x1, y) => `${x0},${y} ${x0 + h},${y - h} ${x1 - h},${y - h} ${x1},${y} ${x1 - h},${y + h} ${x0 + h},${y + h}`;
    const vs = (x, y0, y1) => `${x},${y0} ${x + h},${y0 + h} ${x + h},${y1 - h} ${x},${y1} ${x - h},${y1 - h} ${x - h},${y0 + h}`;
    return {
      a: hs(L + gap, R - gap, T),
      b: vs(R, T + gap, M - gap),
      c: vs(R, M + gap, B - gap),
      d: hs(L + gap, R - gap, B),
      e: vs(L, M + gap, B - gap),
      f: vs(L, T + gap, M - gap),
      g: hs(L + gap, R - gap, M),
    };
  })();
  const LIT = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };

  function ledSvg(value) {
    const v = Math.max(-99, Math.min(999, value));
    const text = v < 0 ? '-' + String(-v).padStart(2, '0') : String(v).padStart(3, '0');
    let body = '';
    [...text].forEach((ch, k) => {
      const on = LIT[ch];
      body += `<g transform="translate(${k * 13} 0)">`;
      for (const s of 'abcdefg') body += `<polygon points="${SEGMENTS[s]}" fill="${on.includes(s) ? '#ff0000' : '#2c0000'}"/>`;
      body += '</g>';
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 39 23" aria-hidden="true">${body}</svg>`;
  }

  // ---------- 요소 ----------
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const win = $('win');
  const wrap = $('wrap');
  const board = $('board');
  const faceBtn = $('face');
  const minesLed = $('mines');
  const timeLed = $('time');
  const flagBtn = $('flagBtn');

  let game = null;
  let cells = [];
  let rotated = false;
  let builtKey = '';
  let scrollable = false;
  let press = null; // 판을 누르고 있는 손가락 하나의 상태
  let faceDown = false;
  let openDialogs = 0;
  let shown = { mines: null, time: null, face: null };

  // ---------- 타이머 (앱을 나가면 멈춤, 원본도 창을 내리면 멈춘다) ----------
  const clock = { acc: 0, t0: 0, running: false, paused: false };
  const elapsedMs = () => clock.acc + (clock.running ? performance.now() - clock.t0 : 0);
  function startClock() {
    clock.acc = 0;
    clock.t0 = performance.now();
    clock.running = true;
  }
  function stopClock() {
    if (clock.running) clock.acc += performance.now() - clock.t0;
    clock.running = false;
  }
  function resumeClock() {
    if (!clock.running && game.status === 'playing') {
      clock.t0 = performance.now();
      clock.running = true;
    }
  }
  function shownSeconds() {
    if (game.status === 'ready') return 0;
    return Math.min(999, Math.floor(elapsedMs() / 1000) + 1);
  }

  // ---------- 소리 (원본처럼 처음엔 꺼짐) ----------
  const sound = {
    ctx: null,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, at, dur, type = 'square', vol = 0.05) {
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(c.destination);
      o.start(at);
      o.stop(at + dur + 0.02);
    },
    tick() {
      if (!settings.sound || !this.ensure()) return;
      this.tone(2400, this.ctx.currentTime, 0.02, 'square', 0.03);
    },
    boom() {
      if (!settings.sound || !this.ensure()) return;
      const c = this.ctx;
      const len = Math.floor(c.sampleRate * 0.7);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
      const src = c.createBufferSource();
      const lp = c.createBiquadFilter();
      const g = c.createGain();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      g.gain.value = 0.6;
      src.buffer = buf;
      src.connect(lp).connect(g).connect(c.destination);
      src.start();
    },
    win() {
      if (!settings.sound || !this.ensure()) return;
      const t = this.ctx.currentTime;
      [523, 659, 784, 1047, 784, 1047].forEach((f, k) => this.tone(f, t + k * 0.1, 0.14));
    },
  };

  // ---------- 손끝 진동 (아이폰은 iOS 18 이상에서만, 안 되면 조용히 넘어감) ----------
  const haptic = (() => {
    if (navigator.vibrate) return () => navigator.vibrate(12);
    const label = document.createElement('label');
    label.className = 'haptic';
    label.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    return () => {
      try {
        label.click();
      } catch {}
    };
  })();

  // ---------- 판 ----------
  const isPortrait = () => stage.clientHeight >= stage.clientWidth;

  // 세로 화면에서 판이 쓸 수 있는 공간을 기억해 둔다. 판 모양은 늘 이 공간 기준으로 정한다.
  function rememberArea(w, h) {
    if (!isPortrait()) return;
    if (settings.area && settings.area.w === w && settings.area.h === h) return;
    settings.area = { w, h };
    saveSettings();
  }

  function portraitArea() {
    stage.classList.add('measuring');
    win.dataset.layout = 'classic';
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    stage.classList.remove('measuring');
    rememberArea(w, h);
    if (isPortrait() || !settings.area) {
      if (isPortrait()) return { w, h };
      // 세로로 한 번도 연 적 없이 가로에서 시작하면, 가로 화면 치수를 뒤집어 어림한다.
      return { w: stageH - (stageW - w), h: stageW - (stageH - h) };
    }
    return settings.area;
  }

  function boardConfig() {
    const area = portraitArea();
    const { rows, cols } = Minesweeper.fitBoard(area.w, area.h, CELL_SIZES[settings.cellSize].px);
    return { rows, cols, mines: Minesweeper.minesFor(rows * cols, LEVELS[settings.level].ratio) };
  }

  function buildBoard() {
    const { rows, cols } = game;
    const dispRows = rotated ? cols : rows;
    const dispCols = rotated ? rows : cols;
    board.style.gridTemplateColumns = `repeat(${dispCols}, var(--cell))`;
    cells = new Array(game.size);
    const frag = document.createDocumentFragment();
    for (let y = 0; y < dispRows; y++) {
      for (let x = 0; x < dispCols; x++) {
        // 돌려 보일 때는 원래 판을 시계 방향으로 90도 돌린다 (맨 윗줄 → 맨 오른쪽 줄).
        const r = rotated ? rows - 1 - x : y;
        const c = rotated ? y : x;
        const i = r * cols + c;
        const el = document.createElement('div');
        el.className = 'c h';
        el.dataset.i = i;
        cells[i] = el;
        frag.appendChild(el);
      }
    }
    board.textContent = '';
    board.appendChild(frag);
    builtKey = `${rows}x${cols}:${rotated}`;
  }

  function pressedSet() {
    const set = new Set();
    let target = -1;
    if (!press || press.spent || press.idx < 0 || game.over) return { set, target };
    const i = press.idx;
    const s = game.state[i];
    if (s === OPEN) {
      if (game.adj[i] > 0) for (const j of game.nb[i]) if (game.state[j] === HIDDEN || game.state[j] === QUESTION) set.add(j);
    } else if (press.mode === 'mark') {
      target = i;
    } else if (s !== FLAG) {
      set.add(i);
    }
    return { set, target };
  }

  function cellClass(i, pressed, target) {
    const s = game.state[i];
    if (game.status === 'lost') {
      if (game.mine[i]) {
        if (s === FLAG) return 'c h f';
        return game.exploded.includes(i) ? 'c o mx' : 'c o m';
      }
      if (s === FLAG) return 'c o mw';
    }
    if (s === OPEN) return 'c o n' + game.adj[i];
    if (pressed.has(i)) return s === QUESTION ? 'c o qp' : 'c o n0';
    const t = i === target ? ' t' : '';
    if (s === FLAG) return 'c h f' + t;
    if (s === QUESTION) return 'c h q' + t;
    return 'c h' + t;
  }

  function faceKind() {
    if (game.status === 'won') return 'cool';
    if (game.status === 'lost') return 'dead';
    if (press && !press.spent && press.idx >= 0) return 'oh';
    return 'smile';
  }

  function render() {
    const { set, target } = pressedSet();
    for (let i = 0; i < game.size; i++) {
      const cls = cellClass(i, set, target);
      if (cells[i].className !== cls) cells[i].className = cls;
    }
    if (shown.mines !== game.minesLeft) {
      shown.mines = game.minesLeft;
      minesLed.innerHTML = ledSvg(game.minesLeft);
    }
    renderTime();
    const f = faceKind();
    if (shown.face !== f) {
      shown.face = f;
      faceBtn.dataset.face = f;
    }
    faceBtn.classList.toggle('down', faceDown);
  }

  function renderTime() {
    const t = shownSeconds();
    if (shown.time === t) return;
    if (shown.time !== null && clock.running && t > shown.time) sound.tick();
    shown.time = t;
    timeLed.innerHTML = ledSvg(t);
  }

  // ---------- 화면 크기에 맞추기 ----------
  // 원래 방향/돌린 방향, 위아래 배치/옆 배치 네 가지를 재 보고 칸이 가장 커지는 것을 고른다.
  function layout() {
    // 아직 한 칸도 건드리지 않은 판은 화면 크기가 바뀌면 다시 맞춘다
    // (앱이 막 켜져 화면 크기가 자리 잡기 전이나, 가로로 켰다가 세로로 돌린 경우).
    if (game.status === 'ready' && game.state.every((s) => s === HIDDEN)) {
      const cfg = boardConfig();
      if (cfg.rows !== game.rows || cfg.cols !== game.cols || cfg.mines !== game.mines) {
        game = new Minesweeper(cfg.rows, cfg.cols, cfg.mines);
        save();
      }
    }
    const { rows, cols } = game;
    stage.classList.add('measuring');
    let best = null;
    for (const mode of ['classic', 'side']) {
      win.dataset.layout = mode;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (mode === 'classic') rememberArea(w, h);
      for (const rot of [false, true]) {
        const r = rot ? cols : rows;
        const c = rot ? rows : cols;
        const fit = Math.min(Math.floor(w / c), Math.floor(h / r), CELL_MAX);
        // 기본 배치(위아래·원래 방향)를 우선하고, 다른 배치는 칸이 2px 이상 커질 때만 고른다.
        if (!best || fit >= best.fit + 2) best = { mode, rot, fit, w, h, r, c };
      }
    }
    stage.classList.remove('measuring');
    win.dataset.layout = best.mode;

    const cell = Math.max(best.fit, CELL_MIN);
    const bevel = Math.max(2, Math.round(cell / 9));
    const line = Math.max(1, Math.round(cell / 16));
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--cell', cell + 'px');
    rootStyle.setProperty('--bevel', bevel + 'px');
    rootStyle.setProperty('--line', line + 'px');

    scrollable = cell * best.c > best.w || cell * best.r > best.h;
    wrap.classList.toggle('scroll', scrollable);
    wrap.style.maxWidth = scrollable ? best.w + 'px' : '';
    wrap.style.maxHeight = scrollable ? best.h + 'px' : '';

    if (rotated !== best.rot || builtKey !== `${rows}x${cols}:${best.rot}`) {
      rotated = best.rot;
      buildBoard();
    }
    render();
  }

  let layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      if (game) layout();
    });
  }

  // ---------- 게임 진행 ----------
  function newGame() {
    const cfg = boardConfig();
    game = new Minesweeper(cfg.rows, cfg.cols, cfg.mines);
    clock.acc = 0;
    clock.running = false;
    clock.paused = false;
    cancelPress();
    layout();
    save();
  }

  function save() {
    if (!game) return;
    store.set('save', { level: settings.level, cellSize: settings.cellSize, game: game.toJSON(), ms: elapsedMs() });
  }

  function restore() {
    const saved = store.get('save', null);
    if (!saved || !saved.game) return false;
    try {
      const g = Minesweeper.fromJSON(saved.game);
      if (saved.level !== settings.level || saved.cellSize !== settings.cellSize) return false;
      if (g.mines !== Minesweeper.minesFor(g.size, LEVELS[settings.level].ratio)) return false;
      game = g;
      clock.acc = Number(saved.ms) || 0;
      clock.running = false;
      if (game.status === 'playing') resumeClock();
      return true;
    } catch {
      return false;
    }
  }

  // kind: 'open'(열기) | 'mark'(깃발·물음표)
  function act(i, kind) {
    if (game.over) return;
    const before = game.status;
    let changed = false;
    if (game.state[i] === OPEN) changed = game.chord(i);
    else if (kind === 'mark') changed = game.toggleMark(i, settings.marks);
    else if (game.state[i] !== FLAG) changed = game.reveal(i);
    if (!changed) return;
    if (before === 'ready' && game.status !== 'ready') startClock();
    if (game.status === 'won') onWin();
    else if (game.status === 'lost') onLose();
    save();
  }

  function onLose() {
    stopClock();
    sound.boom();
    haptic();
  }

  function onWin() {
    stopClock();
    sound.win();
    const t = shownSeconds();
    const level = settings.level;
    const key = recordKey(level, settings.cellSize);
    if (t >= records[key].time) return;
    // 이름을 받기 전에 앱이 꺼져도 기록은 남도록 먼저 저장한다.
    const name = store.get('lastName', DEFAULT_NAME);
    records[key] = { time: t, name };
    store.set('records', records);
    setTimeout(async () => {
      const entered = await askName(level, name);
      records[key] = { time: t, name: entered };
      store.set('records', records);
      store.set('lastName', entered);
      showRecords();
    }, 450);
  }

  // ---------- 터치·마우스 ----------
  function cellAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.parentNode !== board) return -1;
    return Number(el.dataset.i);
  }

  function cancelPress() {
    if (press && press.timer) clearTimeout(press.timer);
    press = null;
  }

  function armLongPress() {
    if (press.timer) clearTimeout(press.timer);
    press.timer = 0;
    if (press.pointerType === 'mouse' || press.idx < 0) return;
    press.timer = setTimeout(onLongPress, LONG_PRESS_MS);
  }

  function onLongPress() {
    const p = press;
    if (!p || p.spent || p.idx < 0 || game.over) return;
    p.timer = 0;
    const s = game.state[p.idx];
    if (s === OPEN) return; // 숫자 칸은 손을 뗄 때 동시 열기
    if (settings.flagMode && s === FLAG) return;
    p.spent = true;
    haptic();
    act(p.idx, settings.flagMode ? 'open' : 'mark');
    render();
  }

  board.addEventListener('pointerdown', (e) => {
    if (openDialogs) return;
    if (press) {
      // 두 번째 손가락이 닿으면 실수로 열지 않도록 지금 누르던 것을 취소한다.
      cancelPress();
      render();
      return;
    }
    if (game.over) return;
    const idx = cellAt(e.clientX, e.clientY);
    if (idx < 0) return;
    if (settings.sound) sound.ensure();
    if (e.pointerType === 'mouse' && e.button === 2) {
      act(idx, 'mark');
      render();
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    press = {
      id: e.pointerId,
      pointerType: e.pointerType,
      idx,
      x0: e.clientX,
      y0: e.clientY,
      mode: settings.flagMode ? 'mark' : 'open',
      chordOnly: e.button === 1,
      spent: false,
      timer: 0,
    };
    try {
      board.setPointerCapture(e.pointerId);
    } catch {}
    armLongPress();
    render();
  });

  board.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || press.spent) return;
    if (scrollable) {
      // 판이 화면보다 커서 밀어 볼 수 있는 경우: 손가락이 움직이면 스크롤로 본다.
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > MOVE_TOLERANCE) {
        cancelPress();
        render();
      }
      return;
    }
    // 원본처럼 누른 채 다른 칸으로 옮길 수 있다. 손을 뗀 칸이 열린다.
    const idx = cellAt(e.clientX, e.clientY);
    if (idx === press.idx) return;
    press.idx = idx;
    armLongPress();
    render();
  });

  function finishPress(e, cancelled) {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    cancelPress();
    if (!cancelled && !p.spent && p.idx >= 0 && !game.over) {
      if (p.chordOnly) {
        if (game.state[p.idx] === OPEN) act(p.idx, 'open');
      } else {
        act(p.idx, p.mode);
      }
    }
    render();
  }
  board.addEventListener('pointerup', (e) => finishPress(e, false));
  board.addEventListener('pointercancel', (e) => finishPress(e, true));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // 스마일: 누르면 들어가고, 손을 떼면 새 게임
  faceBtn.addEventListener('pointerdown', () => {
    faceDown = true;
    render();
  });
  const faceUp = () => {
    if (!faceDown) return;
    faceDown = false;
    render();
  };
  faceBtn.addEventListener('pointerup', faceUp);
  faceBtn.addEventListener('pointercancel', faceUp);
  faceBtn.addEventListener('pointerleave', faceUp);
  faceBtn.addEventListener('click', () => newGame());

  function syncFlagButton() {
    flagBtn.setAttribute('aria-pressed', String(settings.flagMode));
    flagBtn.querySelector('.st').textContent = settings.flagMode ? '켜짐' : '꺼짐';
  }
  flagBtn.addEventListener('click', () => {
    settings.flagMode = !settings.flagMode;
    saveSettings();
    syncFlagButton();
    haptic();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && !openDialogs) {
      e.preventDefault();
      newGame();
    }
  });

  // ---------- 메뉴 ----------
  const MENUS = {
    game: () => [
      { label: '새 게임', key: 'F2', run: newGame },
      '-',
      ...LEVEL_KEYS.map((k) => ({ label: LEVELS[k].name, check: settings.level === k, run: () => setLevel(k) })),
      '-',
      ...SIZE_KEYS.map((k) => ({ label: CELL_SIZES[k].name, check: settings.cellSize === k, run: () => setCellSize(k) })),
      '-',
      { label: '물음표 표시(?)', check: settings.marks, run: () => toggleSetting('marks') },
      { label: '색', check: settings.color, run: () => toggleSetting('color') },
      { label: '소리', check: settings.sound, run: () => toggleSetting('sound') },
      '-',
      { label: '최고 기록...', run: showRecords },
    ],
    help: () => [
      { label: '게임 방법', run: showHelp },
      '-',
      { label: '지뢰 찾기 정보...', run: showAbout },
    ],
  };

  let menu = null;
  function closeMenu() {
    if (!menu) return;
    menu.layer.remove();
    menu.btn.classList.remove('open');
    menu = null;
  }

  function openMenu(name, btn) {
    closeMenu();
    const layer = document.createElement('div');
    layer.className = 'menu-layer';
    const box = document.createElement('div');
    box.className = 'window dropdown';
    box.setAttribute('role', 'menu');
    for (const item of MENUS[name]()) {
      if (item === '-') {
        box.appendChild(document.createElement('hr'));
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', item.check === undefined ? 'menuitem' : 'menuitemcheckbox');
      if (item.check !== undefined) b.setAttribute('aria-checked', String(item.check));
      if (item.check) b.classList.add('checked');
      const label = document.createElement('span');
      label.textContent = item.label;
      b.appendChild(label);
      if (item.key) {
        const key = document.createElement('span');
        key.className = 'key';
        key.textContent = item.key;
        b.appendChild(key);
      }
      b.addEventListener('click', () => {
        closeMenu();
        item.run();
      });
      box.appendChild(b);
    }
    layer.addEventListener('pointerdown', (e) => {
      if (e.target === layer) closeMenu();
    });
    layer.appendChild(box);
    document.body.appendChild(layer);
    btn.classList.add('open');
    menu = { layer, btn };

    const r = btn.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom;
    if (win.dataset.layout === 'side') {
      // 옆 배치에서는 왼쪽 세로 줄 바깥에 붙여 연다.
      left = document.getElementById('status').getBoundingClientRect().right + 4;
      top = r.top;
    }
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    left = Math.max(4, Math.min(left, vw - box.offsetWidth - 4));
    top = Math.max(4, Math.min(top, vh - box.offsetHeight - 4));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    box.style.maxHeight = vh - top - 4 + 'px';
  }

  document.querySelectorAll('.menu-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (menu && menu.btn === btn) closeMenu();
      else openMenu(btn.dataset.menu, btn);
    });
  });

  function setLevel(k) {
    settings.level = k;
    saveSettings();
    newGame();
  }

  function setCellSize(k) {
    settings.cellSize = k;
    saveSettings();
    newGame();
  }

  function toggleSetting(key) {
    settings[key] = !settings[key];
    saveSettings();
    if (key === 'color') win.classList.toggle('mono', !settings.color);
    if (key === 'sound' && settings.sound) sound.ensure();
  }

  // ---------- 대화상자 ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function dialog({ title, body, buttons = [{ label: '확인', value: true, primary: true }], closeValue = null, init }) {
    closeMenu();
    cancelPress();
    render();
    return new Promise((resolve) => {
      const layer = el('div', 'dialog-layer');
      const box = el('div', 'window dialog');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', title);
      const bar = el('div', 'titlebar');
      const close = el('button', 'btn x', '×');
      close.type = 'button';
      close.setAttribute('aria-label', '닫기');
      bar.append(el('span', '', title), close);
      const content = el('div', 'body');
      if (typeof body === 'string') content.innerHTML = body;
      else content.appendChild(body);
      const row = el('div', 'buttons');
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        layer.remove();
        openDialogs--;
        resolve(v);
      };
      let primary = null;
      for (const spec of buttons) {
        const b = el('button', 'btn' + (spec.primary ? ' default' : ''), spec.label);
        b.type = 'button';
        b.addEventListener('click', () => {
          const v = typeof spec.value === 'function' ? spec.value() : spec.value;
          if (v !== undefined) finish(v);
        });
        if (spec.primary) primary = b;
        row.appendChild(b);
      }
      close.addEventListener('click', () => finish(closeValue));
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && primary) {
          e.preventDefault();
          primary.click();
        } else if (e.key === 'Escape') {
          finish(closeValue);
        }
      });
      box.append(bar, content, row);
      layer.appendChild(box);
      document.body.appendChild(layer);
      openDialogs++;
      if (init) init(content);
    });
  }

  function recordsTable() {
    const grid = el('div', 'records');
    for (const k of LEVEL_KEYS) {
      const r = records[recordKey(k, settings.cellSize)];
      grid.append(el('span', '', LEVELS[k].name + ':'), el('span', 't', r.time + '초'), el('span', '', r.name));
    }
    return grid;
  }

  function showRecords() {
    const holder = el('div');
    const note = el('p', 'field-note', `${CELL_SIZES[settings.cellSize].name} 기록입니다. 지금 판은 가로 ${game.cols} × 세로 ${game.rows}칸입니다.`);
    holder.append(recordsTable(), note);
    return dialog({
      title: '지뢰 찾기 최고 기록',
      body: holder,
      buttons: [
        {
          label: '점수 다시 설정',
          value: () => {
            for (const k of Object.keys(records)) records[k] = { time: 999, name: DEFAULT_NAME };
            store.set('records', records);
            holder.replaceChildren(recordsTable(), note);
            return undefined;
          },
        },
        { label: '확인', value: true, primary: true },
      ],
    });
  }

  function askName(level, name) {
    const box = el('div');
    box.append(el('p', '', `${LEVELS[level].name} 단계의 최고 기록을 세웠습니다. 이름을 입력하세요.`));
    const input = el('input', 'text');
    input.type = 'text';
    input.maxLength = 32;
    input.value = name;
    input.setAttribute('aria-label', '이름');
    box.appendChild(input);
    const get = () => input.value.trim() || DEFAULT_NAME;
    return dialog({
      title: '축하합니다',
      body: box,
      buttons: [{ label: '확인', value: get, primary: true }],
      closeValue: name,
    });
  }

  function showHelp() {
    return dialog({
      title: '게임 방법',
      body: `
        <h3>목표</h3>
        <p>지뢰를 밟지 않고, 지뢰가 없는 칸을 모두 여세요. 열린 칸의 숫자는 주변 8칸에 숨은 지뢰 수입니다.</p>
        <h3>조작</h3>
        <ul>
          <li><b>탭</b> — 칸 열기</li>
          <li><b>길게 누르기</b> — 깃발 꽂기. 다시 길게 누르면 물음표, 한 번 더 누르면 지워집니다.</li>
          <li><b>깃발 모드 버튼</b> — 켜면 반대로 됩니다. 탭하면 깃발, 길게 누르면 열기.</li>
          <li><b>숫자 칸 탭</b> — 주변에 꽂은 깃발 수가 숫자와 같으면 나머지 주변 칸을 한꺼번에 엽니다.</li>
          <li><b>누른 채 밀기</b> — 누른 칸을 옆 칸으로 옮길 수 있습니다. 손을 뗀 칸이 열립니다.</li>
          <li><b>스마일</b> — 새 게임</li>
        </ul>
        <h3>알아 두면 좋은 것</h3>
        <ul>
          <li>첫 칸에는 지뢰가 절대 없습니다.</li>
          <li>앱을 나가면 시간이 멈추고, 돌아오면 하던 판을 이어서 합니다.</li>
          <li>판 크기는 휴대폰 화면에 꽉 차게 정해집니다. 난이도는 지뢰가 얼마나 빽빽한지로 나뉩니다 (쉬움 12% · 보통 16% · 어려움 21% · 아주 어려움 25%).</li>
          <li>칸이 작거나 크게 느껴지면 <b>게임</b> 메뉴에서 큰 칸 · 보통 칸 · 작은 칸을 고르세요. 판 크기가 그에 맞게 바뀝니다.</li>
          <li>휴대폰을 가로로 눕히면 같은 판을 돌려서 보여줍니다.</li>
          <li>난이도, 칸 크기, 물음표 표시, 소리는 왼쪽 위 <b>게임</b> 메뉴에 있습니다.</li>
        </ul>`,
    });
  }

  function showAbout() {
    return dialog({
      title: '지뢰 찾기 정보',
      body: `<p><b>지뢰 찾기</b></p>
        <p>윈도우의 고전 지뢰 찾기를 휴대폰에서 할 수 있게 다시 만든 것입니다. 규칙과 화면은 원본을 따랐고, 판 크기와 터치 조작은 휴대폰에 맞게 바꿨습니다.</p>
        <p>기록과 하던 판은 이 휴대폰 안에만 저장됩니다.</p>`,
    });
  }

  // ---------- 시작 ----------
  installSprites();
  win.classList.toggle('mono', !settings.color);
  syncFlagButton();
  if (restore()) layout();
  else newGame();

  setInterval(() => {
    if (game) renderTime();
  }, 100);

  new ResizeObserver(queueLayout).observe(stage);
  window.addEventListener('orientationchange', () => setTimeout(queueLayout, 250));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (clock.running) {
        stopClock();
        clock.paused = true;
      }
      cancelPress();
      save();
    } else if (clock.paused) {
      clock.paused = false;
      resumeClock();
      render();
    }
  });
  window.addEventListener('pagehide', save);

  if (!store.get('seenHelp', false)) {
    store.set('seenHelp', true);
    setTimeout(showHelp, 300);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

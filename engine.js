/*
 * 지뢰 찾기 규칙 엔진 — 화면과 무관한 게임 상태만 다룬다.
 * 브라우저에서는 window.Minesweeper, Node 에서는 require('./engine.js').Minesweeper 로 쓴다.
 */
(function (root) {
  'use strict';

  const HIDDEN = 0;
  const OPEN = 1;
  const FLAG = 2;
  const QUESTION = 3;

  function buildNeighbors(rows, cols) {
    const list = new Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const around = [];
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) around.push(rr * cols + cc);
          }
        }
        list[r * cols + c] = around;
      }
    }
    return list;
  }

  class Minesweeper {
    constructor(rows, cols, mines, random = Math.random) {
      this.rows = rows;
      this.cols = cols;
      this.mines = mines;
      this.random = random;
      this.size = rows * cols;
      this.mine = new Uint8Array(this.size);
      this.state = new Uint8Array(this.size);
      this.adj = new Uint8Array(this.size);
      this.nb = buildNeighbors(rows, cols);
      this.status = 'ready'; // ready → playing → won | lost
      this.flags = 0;
      this.opened = 0;
      this.exploded = [];
    }

    get minesLeft() {
      return this.mines - this.flags;
    }

    get over() {
      return this.status === 'won' || this.status === 'lost';
    }

    // 윈도우 원본과 같은 방식: 판 전체에 무작위로 깔고, 첫 칸에 지뢰가 걸렸으면
    // 그 지뢰를 왼쪽 위부터 훑어 처음 나오는 빈칸으로 옮긴다.
    placeMines(first) {
      let placed = 0;
      while (placed < this.mines) {
        const i = Math.floor(this.random() * this.size);
        if (!this.mine[i]) {
          this.mine[i] = 1;
          placed++;
        }
      }
      if (this.mine[first]) {
        for (let i = 0; i < this.size; i++) {
          if (!this.mine[i]) {
            this.mine[i] = 1;
            break;
          }
        }
        this.mine[first] = 0;
      }
      this.computeAdjacency();
    }

    computeAdjacency() {
      for (let i = 0; i < this.size; i++) {
        let n = 0;
        for (const j of this.nb[i]) n += this.mine[j];
        this.adj[i] = n;
      }
    }

    // 닫힌 칸(물음표 포함)을 연다. 깃발 칸은 열리지 않는다.
    reveal(i) {
      if (this.over) return false;
      const s = this.state[i];
      if (s === OPEN || s === FLAG) return false;
      if (this.status === 'ready') {
        this.placeMines(i);
        this.status = 'playing';
      }
      if (this.mine[i]) {
        this.lose([i]);
        return true;
      }
      this.flood(i);
      this.checkWin();
      return true;
    }

    // 열린 숫자 칸 주변의 깃발 수가 숫자와 같으면, 깃발 없는 주변 칸을 모두 연다.
    chord(i) {
      if (this.status !== 'playing') return false;
      if (this.state[i] !== OPEN || this.adj[i] === 0) return false;
      let flags = 0;
      for (const j of this.nb[i]) if (this.state[j] === FLAG) flags++;
      if (flags !== this.adj[i]) return false;

      const hits = [];
      let changed = false;
      for (const j of this.nb[i]) {
        const s = this.state[j];
        if (s !== HIDDEN && s !== QUESTION) continue;
        changed = true;
        if (this.mine[j]) hits.push(j);
        else this.flood(j);
      }
      if (hits.length) this.lose(hits);
      else this.checkWin();
      return changed;
    }

    // 닫힌 칸 → 깃발 → (물음표 표시가 켜져 있으면) 물음표 → 닫힌 칸
    toggleMark(i, marksEnabled) {
      if (this.over) return false;
      const s = this.state[i];
      if (s === OPEN) return false;
      if (s === HIDDEN) {
        this.state[i] = FLAG;
        this.flags++;
      } else if (s === FLAG) {
        this.flags--;
        this.state[i] = marksEnabled ? QUESTION : HIDDEN;
      } else {
        this.state[i] = HIDDEN;
      }
      return true;
    }

    flood(start) {
      const stack = [start];
      while (stack.length) {
        const i = stack.pop();
        const s = this.state[i];
        if (s === OPEN || s === FLAG) continue;
        this.state[i] = OPEN;
        this.opened++;
        if (this.adj[i] === 0) {
          for (const j of this.nb[i]) {
            const t = this.state[j];
            if (t !== OPEN && t !== FLAG) stack.push(j);
          }
        }
      }
    }

    lose(hits) {
      this.status = 'lost';
      this.exploded = hits;
    }

    checkWin() {
      if (this.opened !== this.size - this.mines) return;
      this.status = 'won';
      // 원본처럼 이기면 남은 지뢰 칸에 모두 깃발을 꽂는다.
      for (let i = 0; i < this.size; i++) {
        if (this.mine[i]) this.state[i] = FLAG;
      }
      this.flags = this.mines;
    }

    toJSON() {
      return {
        rows: this.rows,
        cols: this.cols,
        mines: this.mines,
        status: this.status,
        exploded: this.exploded,
        mine: Array.from(this.mine).join(''),
        state: Array.from(this.state).join(''),
      };
    }

    static fromJSON(o, random) {
      const g = new Minesweeper(o.rows, o.cols, o.mines, random);
      if (!['ready', 'playing', 'won', 'lost'].includes(o.status)) throw new Error('bad status');
      if (o.mine.length !== g.size || o.state.length !== g.size) throw new Error('bad size');
      let mines = 0;
      for (let i = 0; i < g.size; i++) {
        g.mine[i] = o.mine.charCodeAt(i) === 49 ? 1 : 0;
        g.state[i] = Number(o.state[i]) & 3;
        mines += g.mine[i];
        if (g.state[i] === FLAG) g.flags++;
        if (g.state[i] === OPEN) g.opened++;
      }
      if (o.status !== 'ready' && mines !== g.mines) throw new Error('bad mines');
      g.status = o.status;
      g.exploded = Array.isArray(o.exploded) ? o.exploded.filter((i) => i >= 0 && i < g.size) : [];
      if (g.status !== 'ready') g.computeAdjacency();
      return g;
    }

    // 테스트용: ['*..', '...'] 처럼 지뢰 위치를 직접 정한 판을 만든다.
    static fromMap(lines) {
      const rows = lines.length;
      const cols = lines[0].length;
      let mines = 0;
      for (const line of lines) for (const ch of line) if (ch === '*') mines++;
      const g = new Minesweeper(rows, cols, mines);
      lines.forEach((line, r) => {
        for (let c = 0; c < cols; c++) if (line[c] === '*') g.mine[r * cols + c] = 1;
      });
      g.computeAdjacency();
      g.status = 'playing';
      return g;
    }
  }

  Minesweeper.HIDDEN = HIDDEN;
  Minesweeper.OPEN = OPEN;
  Minesweeper.FLAG = FLAG;
  Minesweeper.QUESTION = QUESTION;

  if (typeof module !== 'undefined' && module.exports) module.exports = { Minesweeper };
  else root.Minesweeper = Minesweeper;
})(typeof window !== 'undefined' ? window : globalThis);

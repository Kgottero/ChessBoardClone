// Position Lab — app.js
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const appRoot = $('app');
  const themeSelect = $('boardTheme');

  // ==========================================
  // BOARD THEMES
  // ==========================================

  function setBoardTheme(theme) {
    const allowed = ['green', 'blue', 'wood', 'purple', 'mono'];
    const value = allowed.includes(theme) ? theme : 'green';

    appRoot.dataset.boardTheme = value;

    if (themeSelect) themeSelect.value = value;

    try {
      localStorage.setItem('positionLabBoardTheme', value);
    } catch (e) {}
  }

  try {
    setBoardTheme(
      localStorage.getItem('positionLabBoardTheme') || 'green'
    );
  } catch (e) {
    setBoardTheme('green');
  }

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      setBoardTheme(themeSelect.value);
    });
  }

  // ==========================================
  // CHESS PIECES
  // ==========================================

  const glyph = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
  };

  const pieceNames = {
    k: 'king',
    q: 'queen',
    r: 'rook',
    b: 'bishop',
    n: 'knight',
    p: 'pawn'
  };

  /*
   * CUSTOM SVG PIECES
   *
   * Place your 12 SVG files inside the "pieces" folder.
   *
   * Required filenames:
   * pieces/king-w.svg
   * pieces/queen-w.svg
   * pieces/rook-w.svg
   * pieces/bishop-w.svg
   * pieces/knight-w.svg
   * pieces/pawn-w.svg
   *
   * pieces/king-b.svg
   * pieces/queen-b.svg
   * pieces/rook-b.svg
   * pieces/bishop-b.svg
   * pieces/knight-b.svg
   * pieces/pawn-b.svg
   *
   * "-w" means white.
   * "-b" means black.
   */

  const pieceImagePaths = {
    K: 'pieces/king-w.svg',
    Q: 'pieces/queen-w.svg',
    R: 'pieces/rook-w.svg',
    B: 'pieces/bishop-w.svg',
    N: 'pieces/knight-w.svg',
    P: 'pieces/pawn-w.svg',

    k: 'pieces/king-b.svg',
    q: 'pieces/queen-b.svg',
    r: 'pieces/rook-b.svg',
    b: 'pieces/bishop-b.svg',
    n: 'pieces/knight-b.svg',
    p: 'pieces/pawn-b.svg'
  };

  // ==========================================
  // CHESS STATE
  // ==========================================

  const files = 'abcdefgh';

  let board = [];
  let turn = 'w';
  let selected = null;
  let targets = [];
  let flipped = false;
  let history = [];
  let moves = [];
  let mode = 'analyse';
  let setupPiece = 'Q';
  let computer = false;
  let humanSide = 'w';
  let thinking = false;
  let castleRights = 'KQkq';
  let epSquare = '-';

  const values = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
  };

  function initial() {
    board = [
      'rnbqkbnr',
      'pppppppp',
      '........',
      '........',
      '........',
      '........',
      'PPPPPPPP',
      'RNBQKBNR'
    ].map(s => s.split(''));

    turn = 'w';
    castleRights = 'KQkq';
    epSquare = '-';
    history = [];
    moves = [];
    selected = null;
    targets = [];
    computer = false;
    thinking = false;

    render();
    say('New game ready.');
  }

  function say(message) {
    $('engineStatus').textContent = message;
  }

  // ==========================================
  // SOUND EFFECTS
  // ==========================================

  const moveSounds = {
    move: new Audio('sounds/Move%20Sound.mp3'),
    capture: new Audio('sounds/Capture%20Sound.mp3'),
    check: new Audio('sounds/Check%20Sound.mp3'),
    mate: new Audio('sounds/Checkmate%20Sound.mp3')
  };

  Object.values(moveSounds).forEach(audio => {
    audio.preload = 'auto';
    audio.volume = 0.75;
  });

  function playMoveSound(type) {
    const audio = moveSounds[type];

    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;

      const playback = audio.play();

      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {});
      }
    } catch (e) {}
  }

  // ==========================================
  // CHESS RULES
  // ==========================================

  function side(piece) {
    return piece === '.'
      ? null
      : piece === piece.toUpperCase() ? 'w' : 'b';
  }

  function fen() {
    const rows = board.map(row => {
      let result = '';
      let empty = 0;

      for (const piece of row) {
        if (piece === '.') {
          empty++;
        } else {
          if (empty) {
            result += empty;
            empty = 0;
          }

          result += piece;
        }
      }

      return result + (empty || '');
    });

    return rows.join('/') + ' ' + turn + ' ' +
      (castleRights || '-') + ' ' + epSquare + ' 0 ' +
      (Math.floor(moves.length / 2) + 1);
  }

  function loadFen(str) {
    const parts = str.trim().split(/\s+/);
    const ranks = parts[0].split('/');

    if (ranks.length !== 8) {
      throw Error('FEN must have 8 ranks.');
    }

    const next = ranks.map(rank => {
      const row = [];

      for (const ch of rank) {
        if (/[1-8]/.test(ch)) {
          row.push(...Array(+ch).fill('.'));
        } else if (glyph[ch]) {
          row.push(ch);
        } else {
          throw Error('Invalid FEN piece: ' + ch);
        }
      }

      if (row.length !== 8) {
        throw Error('Each rank must contain 8 squares.');
      }

      return row;
    });

    if (
      next.flat().filter(p => p === 'K').length !== 1 ||
      next.flat().filter(p => p === 'k').length !== 1
    ) {
      throw Error('FEN must include exactly one king of each colour.');
    }

    board = next;
    turn = parts[1] === 'b' ? 'b' : 'w';
    castleRights = parts[2] && parts[2] !== '-' ? parts[2] : '-';
    epSquare = parts[3] && parts[3] !== '-' ? parts[3] : '-';

    history = [];
    moves = [];
    selected = null;
    targets = [];
    computer = false;

    render();
  }

  function inside(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  function pseudo(b, r, c, includeKing = true) {
    const p = b[r][c];
    const out = [];

    if (p === '.') return out;

    const s = side(p);
    const k = p.toLowerCase();

    const add = (rr, cc) => {
      if (inside(rr, cc) && side(b[rr][cc]) !== s) {
        out.push([rr, cc]);
      }
    };

    if (k === 'p') {
      const d = s === 'w' ? -1 : 1;
      const start = s === 'w' ? 6 : 1;

      if (inside(r + d, c) && b[r + d][c] === '.') {
        out.push([r + d, c]);

        if (r === start && b[r + 2 * d][c] === '.') {
          out.push([r + 2 * d, c]);
        }
      }

      for (const dc of [-1, 1]) {
        if (
          inside(r + d, c + dc) &&
          (
            side(b[r + d][c + dc]) === (s === 'w' ? 'b' : 'w') ||
            (
              epSquare === files[c + dc] + (8 - (r + d)) &&
              b[r][c + dc] === (s === 'w' ? 'p' : 'P')
            )
          )
        ) {
          out.push([r + d, c + dc]);
        }
      }

      return out;
    }

    if (k === 'n') {
      for (const [dr, dc] of [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ]) {
        add(r + dr, c + dc);
      }

      return out;
    }

    if (k === 'k') {
      if (includeKing) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr || dc) add(r + dr, c + dc);
          }
        }
      }

      return out;
    }

    const dirs = [];

    if (k === 'b' || k === 'q') {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }

    if (k === 'r' || k === 'q') {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }

    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;

      while (inside(rr, cc)) {
        if (b[rr][cc] === '.') {
          out.push([rr, cc]);
        } else {
          if (side(b[rr][cc]) !== s) {
            out.push([rr, cc]);
          }

          break;
        }

        rr += dr;
        cc += dc;
      }
    }

    return out;
  }

  function attacked(b, r, c, by) {
    for (let rr = 0; rr < 8; rr++) {
      for (let cc = 0; cc < 8; cc++) {
        if (side(b[rr][cc]) !== by) continue;

        const p = b[rr][cc];
        const k = p.toLowerCase();

        if (k === 'p') {
          const d = by === 'w' ? -1 : 1;

          if (rr + d === r && Math.abs(cc - c) === 1) {
            return true;
          }
        } else if (k === 'k') {
          if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) === 1) {
            return true;
          }
        } else if (
          pseudo(b, rr, cc, false).some(([x, y]) => x === r && y === c)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function kingSafe(b, s) {
    let kr = -1;
    let kc = -1;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (b[r][c] === (s === 'w' ? 'K' : 'k')) {
          kr = r;
          kc = c;
        }
      }
    }

    return kr >= 0 && !attacked(b, kr, kc, s === 'w' ? 'b' : 'w');
  }

  function legalMoves(b, s, rights = castleRights, ep = epSquare) {
    const out = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (side(b[r][c]) !== s) continue;

        const p = b[r][c];
        const k = p.toLowerCase();

        for (const [rr, cc] of pseudo(b, r, c)) {
          const nb = b.map(row => row.slice());

          nb[rr][cc] = p;
          nb[r][c] = '.';

          if (
            k === 'p' &&
            ep !== '-' &&
            files[cc] + (8 - rr) === ep &&
            c !== cc &&
            b[rr][cc] === '.'
          ) {
            nb[r][cc] = '.';
          }

          if (p === 'P' && rr === 0) nb[rr][cc] = 'Q';
          if (p === 'p' && rr === 7) nb[rr][cc] = 'q';

          if (kingSafe(nb, s)) {
            out.push({
              from: [r, c],
              to: [rr, cc],
              board: nb,
              epCapture: k === 'p' &&
                ep !== '-' &&
                files[cc] + (8 - rr) === ep &&
                c !== cc
            });
          }
        }
      }
    }

    // Castling
    const home = s === 'w' ? 7 : 0;
    const king = s === 'w' ? 'K' : 'k';
    const rook = s === 'w' ? 'R' : 'r';
    const enemy = s === 'w' ? 'b' : 'w';

    if (b[home][4] === king && !attacked(b, home, 4, enemy)) {
      for (const wing of ['K', 'Q']) {
        const right = s === 'w' ? wing : wing.toLowerCase();

        if (!rights.includes(right)) continue;

        const rookCol = wing === 'K' ? 7 : 0;
        const between = wing === 'K' ? [5, 6] : [1, 2, 3];
        const cross = wing === 'K' ? [5, 6] : [3, 2];

        if (
          b[home][rookCol] !== rook ||
          between.some(c => b[home][c] !== '.') ||
          cross.some(c => attacked(b, home, c, enemy))
        ) {
          continue;
        }

        const nb = b.map(row => row.slice());

        nb[home][wing === 'K' ? 6 : 2] = king;
        nb[home][4] = '.';
        nb[home][wing === 'K' ? 5 : 3] = rook;
        nb[home][rookCol] = '.';

        if (kingSafe(nb, s)) {
          out.push({
            from: [home, 4],
            to: [home, wing === 'K' ? 6 : 2],
            board: nb,
            castle: wing
          });
        }
      }
    }

    return out;
  }

  // ==========================================
  // RENDER BOARD AND CUSTOM SVG PIECES
  // ==========================================

  function render() {
    const el = $('board');
    el.innerHTML = '';

    for (let i = 0; i < 64; i++) {
      const r = flipped
        ? 7 - Math.floor(i / 8)
        : Math.floor(i / 8);

      const c = flipped
        ? 7 - i % 8
        : i % 8;

      const sq = document.createElement('button');

      sq.type = 'button';
      sq.className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');

      sq.setAttribute(
        'aria-label',
        files[c] + (8 - r) +
        (board[r][c] === '.' ? ', empty' : ', ' + board[r][c])
      );

      if (selected && selected[0] === r && selected[1] === c) {
        sq.classList.add('selected');
      }

      if (targets.some(x => x[0] === r && x[1] === c)) {
        sq.classList.add(board[r][c] === '.' ? 'target' : 'takes');
      }

      if (board[r][c] !== '.') {
        const symbol = board[r][c];
        const kind = symbol.toLowerCase();
        const colour = symbol === symbol.toUpperCase() ? 'w' : 'b';

        // Load the SVG file matching this exact piece and colour.
        const piece = document.createElement('img');

        piece.className = 'piece';
        piece.alt =
          (colour === 'w' ? 'White ' : 'Black ') + pieceNames[kind];

        piece.draggable = false;
        piece.src = pieceImagePaths[symbol];

        // If an SVG is missing or its filename is wrong,
        // show the standard chess symbol instead of a broken image.
        piece.onerror = function () {
          const fallback = document.createElement('span');

          fallback.className = 'piece piece-fallback';
          fallback.textContent = glyph[symbol];

          piece.replaceWith(fallback);
        };

        sq.appendChild(piece);
      }

      if (c === 0 || r === 7) {
        const co = document.createElement('span');

        co.className = 'coord';
        co.textContent = c === 0 ? 8 - r : files[c];

        sq.appendChild(co);
      }

      sq.addEventListener('click', () => squareClick(r, c));

      el.appendChild(sq);
    }

    $('turnLabel').textContent =
      turn === 'w' ? 'White to move' : 'Black to move';

    $('moves').textContent = moves.length
      ? moves.map((m, i) =>
          (i % 2 === 0 ? Math.floor(i / 2) + 1 + '. ' : '') + m
        ).join('  ')
      : 'No moves yet.';

    $('fen').value = fen();
  }

  function squareClick(r, c) {
    if (mode === 'setup') {
      board[r][c] = setupPiece === '.' ? '.' : setupPiece;
      render();
      return;
    }

    if (thinking) return;

    if (selected && targets.some(([rr, cc]) => rr === r && cc === c)) {
      playMove(selected, [r, c]);
      return;
    }

    if (side(board[r][c]) === turn && (!computer || turn === humanSide)) {
      selected = [r, c];

      targets = legalMoves(board, turn)
        .filter(m => m.from[0] === r && m.from[1] === c)
        .map(m => m.to);

      render();
    } else {
      selected = null;
      targets = [];
      render();
    }
  }

  // ==========================================
  // PLAY MOVES
  // ==========================================

  function playMove(from, to, quiet = false) {
    const p = board[from[0]][from[1]];
    const captured = board[to[0]][to[1]];
    const oldEp = epSquare;

    const castle =
      from[1] === 4 &&
      p.toLowerCase() === 'k' &&
      Math.abs(to[1] - from[1]) === 2;

    const epCapture =
      p.toLowerCase() === 'p' &&
      oldEp === files[to[1]] + (8 - to[0]) &&
      from[1] !== to[1] &&
      captured === '.';

    let notation =
      files[from[1]] + (8 - from[0]) +
      (captured !== '.' || epCapture ? 'x' : '') +
      files[to[1]] + (8 - to[0]);

    history.push({
      board: board.map(row => row.slice()),
      turn,
      moves: moves.slice(),
      castleRights,
      epSquare
    });

    if (epCapture) board[from[0]][to[1]] = '.';

    board[to[0]][to[1]] = p;
    board[from[0]][from[1]] = '.';

    if (castle) {
      const row = from[0];

      if (to[1] === 6) {
        board[row][5] = board[row][7];
        board[row][7] = '.';
      } else {
        board[row][3] = board[row][0];
        board[row][0] = '.';
      }

      notation = to[1] === 6 ? 'O-O' : 'O-O-O';
    }

    if (p === 'P' && to[0] === 0) board[to[0]][to[1]] = 'Q';
    if (p === 'p' && to[0] === 7) board[to[0]][to[1]] = 'q';

    if (p === 'K') castleRights = castleRights.replace(/[KQ]/g, '');
    if (p === 'k') castleRights = castleRights.replace(/[kq]/g, '');

    if (
      (from[0] === 7 && from[1] === 0) ||
      (to[0] === 7 && to[1] === 0)
    ) castleRights = castleRights.replace('Q', '');

    if (
      (from[0] === 7 && from[1] === 7) ||
      (to[0] === 7 && to[1] === 7)
    ) castleRights = castleRights.replace('K', '');

    if (
      (from[0] === 0 && from[1] === 0) ||
      (to[0] === 0 && to[1] === 0)
    ) castleRights = castleRights.replace('q', '');

    if (
      (from[0] === 0 && from[1] === 7) ||
      (to[0] === 0 && to[1] === 7)
    ) castleRights = castleRights.replace('k', '');

    epSquare =
      p.toLowerCase() === 'p' &&
      Math.abs(to[0] - from[0]) === 2
        ? files[from[1]] + (8 - (from[0] + to[0]) / 2)
        : '-';

    moves.push(notation);
    turn = turn === 'w' ? 'b' : 'w';

    selected = null;
    targets = [];

    render();

    const possible = legalMoves(board, turn);
    const inCheck = !kingSafe(board, turn);

    if (!possible.length && !inCheck) {
      playMoveSound(captured !== '.' || epCapture ? 'capture' : 'move');
      say('Stalemate — no legal moves.');
      computer = false;
      return;
    }

    if (!possible.length && inCheck) {
      playMoveSound('mate');
      say((turn === 'w' ? 'White' : 'Black') + ' is checkmated.');
      computer = false;
      return;
    }

    if (inCheck) {
      playMoveSound('check');
    } else if (captured !== '.' || epCapture) {
      playMoveSound('capture');
    } else {
      playMoveSound('move');
    }

    if (computer && turn !== humanSide) {
      window.setTimeout(computerMove, 120);
    }
  }

  window.positionLabApplyUci = function (uci) {
    if (!computer || !thinking) return;

    const from = [
      8 - parseInt(uci[1], 10),
      files.indexOf(uci[0])
    ];

    const to = [
      8 - parseInt(uci[3], 10),
      files.indexOf(uci[2])
    ];

    if (
      from[0] < 0 || from[0] > 7 || from[1] < 0 ||
      to[0] < 0 || to[0] > 7 || to[1] < 0
    ) {
      thinking = false;
      return;
    }

    thinking = false;
    playMove(from, to, true);

    const ms = legalMoves(board, turn);

    if (!ms.length) {
      say(
        kingSafe(board, turn)
          ? 'Stalemate.'
          : (turn === 'w' ? 'White' : 'Black') + ' is checkmated.'
      );

      computer = false;
    } else {
      say('Stockfish played. Your move.');
    }
  };

  function undo() {
    if (thinking || !history.length) return;

    const h = history.pop();

    board = h.board;
    turn = h.turn;
    moves = h.moves;
    castleRights = h.castleRights || '-';
    epSquare = h.epSquare || '-';

    selected = null;
    targets = [];

    render();
    say('Last move undone.');

    if (computer && turn !== humanSide && history.length) {
      undo();
    }
  }

  // ==========================================
  // COMPUTER OPPONENT
  // ==========================================

  function evaluate(b) {
    let score = 0;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];

        if (p === '.') continue;

        let v = values[p.toLowerCase()];

        const center =
          3.5 - (Math.abs(3.5 - r) + Math.abs(3.5 - c)) / 2;

        if (p.toLowerCase() === 'p') {
          v += ((p === p.toUpperCase() ? 6 - r : r - 1) * 5) +
            center * 3;
        } else if (p.toLowerCase() !== 'k') {
          v += center * 7;
        }

        score += side(p) === 'w' ? v : -v;
      }
    }

    return score;
  }

  function search(b, s, depth, alpha, beta) {
    const ms = legalMoves(b, s);

    if (depth === 0 || !ms.length) {
      if (!ms.length && !kingSafe(b, s)) {
        return {
          score: s === 'w' ? -100000 - depth : 100000 + depth
        };
      }

      return { score: evaluate(b) };
    }

    ms.sort((a, z) => {
      const av = values[b[a.to[0]][a.to[1]]?.toLowerCase()] || 0;
      const zv = values[b[z.to[0]][z.to[1]]?.toLowerCase()] || 0;

      return zv - av;
    });

    let best = null;

    if (s === 'w') {
      let val = -Infinity;

      for (const m of ms) {
        const res = search(
          m.board, 'b', depth - 1, alpha, beta
        ).score;

        if (res > val) {
          val = res;
          best = m;
        }

        alpha = Math.max(alpha, val);

        if (beta <= alpha) break;
      }

      return { score: val, move: best };
    }

    let val = Infinity;

    for (const m of ms) {
      const res = search(
        m.board, 'w', depth - 1, alpha, beta
      ).score;

      if (res < val) {
        val = res;
        best = m;
      }

      beta = Math.min(beta, val);

      if (beta <= alpha) break;
    }

    return { score: val, move: best };
  }

  function computerMove() {
    if (!computer || turn === humanSide) return;

    thinking = true;
    say('Computer is thinking…');

    if (
      window.positionLabRequestStockfish &&
      window.positionLabRequestStockfish(fen())
    ) {
      say('Stockfish is calculating…');
      return;
    }

    const depth = +$('difficulty').value;

    setTimeout(() => {
      try {
        const result = search(board, turn, depth, -Infinity, Infinity);

        if (result.move) {
          playMove(result.move.from, result.move.to, true);

          const ms = legalMoves(board, turn);

          if (!ms.length) {
            say(
              kingSafe(board, turn)
                ? 'Stalemate.'
                : (turn === 'w' ? 'White' : 'Black') + ' is checkmated.'
            );

            computer = false;
          } else {
            say('Computer played. Your move.');
          }
        } else {
          say('No legal moves. Game over.');
          computer = false;
        }
      } catch (e) {
        say('Engine stopped: ' + e.message);
      } finally {
        thinking = false;
      }
    }, 40);
  }

  // ==========================================
  // INTERFACE CONTROLS
  // ==========================================

  function showMode(next) {
    mode = next;

    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === next);
    });

    $('analysePane').classList.toggle('hidden', next !== 'analyse');
    $('computerPane').classList.toggle('hidden', next !== 'computer');
    $('setupPane').classList.toggle('hidden', next !== 'setup');

    selected = null;
    targets = [];

    render();

    if (next === 'setup') {
      say('Setup mode: choose a piece, then tap a square.');
    }
  }

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => showMode(t.dataset.mode));
  });

  $('undo').addEventListener('click', undo);

  $('flip').addEventListener('click', () => {
    flipped = !flipped;
    render();
  });

  $('reset').addEventListener('click', initial);

  $('clear').addEventListener('click', () => {
    board = Array.from({ length: 8 }, () => Array(8).fill('.'));

    board[0][4] = 'k';
    board[7][4] = 'K';

    turn = 'w';
    castleRights = '-';
    epSquare = '-';
    history = [];
    moves = [];
    selected = null;
    targets = [];
    computer = false;

    render();
    say('Board cleared. Use Set up board to place pieces.');
  });

  $('loadFen').addEventListener('click', () => {
    try {
      loadFen($('fen').value);
      say('FEN position loaded.');
    } catch (e) {
      say(e.message);
    }
  });

  $('copyFen').addEventListener('click', () => {
    $('fen').value = fen();
    $('fen').focus();
    $('fen').select();
    say('FEN refreshed. Select and copy the text.');
  });

  $('startComputer').addEventListener('click', () => {
    humanSide = $('humanSide').value;
    computer = true;

    if (turn !== humanSide) {
      computerMove();
    } else {
      say('Ready. Make your move.');
    }
  });

  $('setupWhite').addEventListener('click', () => {
    turn = 'w';
    render();
    say('White to move.');
  });

  $('setupBlack').addEventListener('click', () => {
    turn = 'b';
    render();
    say('Black to move.');
  });

  $('finishSetup').addEventListener('click', () => {
    showMode('analyse');

    history = [];
    moves = [];
    castleRights = '-';
    epSquare = '-';
    computer = false;

    render();
    say('Position ready for analysis. Paste FEN to save it.');
  });

  // ==========================================
  // SETUP PIECE PICKER
  // ==========================================

  const picker = $('piecePicker');

  [
    ['.', 'Erase'],
    ['K', '♔'], ['Q', '♕'], ['R', '♖'],
    ['B', '♗'], ['N', '♘'], ['P', '♙'],
    ['k', '♚'], ['q', '♛'], ['r', '♜'],
    ['b', '♝'], ['n', '♞'], ['p', '♟']
  ].forEach(([p, label]) => {
    const b = document.createElement('button');

    b.type = 'button';
    b.className = 'pick' + (p === setupPiece ? ' active' : '');
    b.textContent = p === '.' ? '⌫' : label;
    b.title = p === '.' ? 'Erase square' : p;

    b.addEventListener('click', () => {
      setupPiece = p;

      picker.querySelectorAll('.pick').forEach(x => {
        x.classList.remove('active');
      });

      b.classList.add('active');
    });

    picker.appendChild(b);
  });

  // ==========================================
  // IMAGE IMPORT
  // ==========================================

  $('imageInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];

    if (!f) return;

    if (!f.type.startsWith('image/')) {
      $('imageInfo').textContent = 'Please choose an image file.';
      return;
    }

    const url = URL.createObjectURL(f);

    $('imagePreview').src = url;
    $('imagePreview').classList.remove('hidden');

    $('imageInfo').textContent =
      f.name + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB';

    $('imageMessage').textContent =
      'Screenshot ready. Select Recognize board to detect the pieces.';
  });

  $('loadImageFen').addEventListener('click', () => {
    try {
      loadFen($('imageFen').value);
      showMode('analyse');
      say('Imported position loaded from FEN.');
    } catch (e) {
      $('imageMessage').textContent = e.message;
    }
  });

  // Start the app.
  initial();
})();
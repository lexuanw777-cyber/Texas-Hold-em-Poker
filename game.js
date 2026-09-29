// game.js — 德州扑克游戏引擎（权威状态在服务端）
const { makeDeck, shuffle, bestHand, compareHand, handName } = require('./poker');

class Game {
  constructor(roomId, opts = {}) {
    this.roomId = roomId;
    this.players = [];          // 座位顺序数组
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;        // 本轮最高下注
    this.minRaise = 0;          // 最小加注增量
    this.stage = 'waiting';     // waiting|preflop|flop|turn|river|showdown|ended
    this.buttonIndex = -1;
    this.currentIndex = -1;     // 当前行动座位
    this.lastAggressorIndex = -1;
    this.multiplier = (opts && Number(opts.multiplier)) || 1; // 倍率
    this.startChips = 1000 * this.multiplier;
    this.smallBlind = 10 * this.multiplier;
    this.bigBlind = 20 * this.multiplier;
    this.handNumber = 0;
    this.log = [];
    this.showdown = null;       // 摊牌展示
    this.lastWinners = null;
    this.handWinners = null;
    this.timeoutHandle = null;
  }

  logMsg(msg) {
    this.log.push({ t: Date.now(), msg });
    if (this.log.length > 200) this.log.shift();
  }

  // ---- 玩家管理 ----
  addPlayer(id, name) {
    const existing = this.players.find(p => p.name === name && !p.connected);
    if (existing) { existing.connected = true; existing.id = id; return existing; }
    const seat = this.players.length;
    const player = {
      id, name, seat,
      chips: this.startChips, hole: [],
      bet: 0, totalBet: 0,
      folded: false, allIn: false, sittingOut: false,
      connected: true, isButton: false, isSB: false, isBB: false,
      lastAction: null, _best: null,
      stats: { handsPlayed: 0, handsWon: 0, totalWon: 0, biggestPot: 0 },
    };
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    const p = this.players.find(pl => pl.id === id);
    if (!p) return;
    if (this.stage === 'waiting' || this.stage === 'ended') {
      this.players = this.players.filter(pl => pl.id !== id);
      return;
    }
    p.connected = false;
    if (!p.folded && !p.allIn) {
      p.folded = true;
      p.lastAction = '弃牌';
      this.logMsg(`${p.name} 断开连接，已弃牌`);
      this.advance();
    }
  }

  // ---- 辅助 ----
  eligible() { return this.players.filter(p => p.chips > 0 && !p.sittingOut); }
  contenders() { return this.players.filter(p => !p.folded && !p.sittingOut); }
  actors() { return this.players.filter(p => !p.folded && p.chips > 0 && !p.allIn && !p.sittingOut); }

  nextSeat(from, predicate) {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (predicate(this.players[idx])) return idx;
    }
    return -1;
  }

  // ---- 开局 ----
  startHand() {
    this.players.forEach(p => { if (p.chips <= 0) p.sittingOut = true; });
    const elig = this.eligible();
    if (elig.length < 2) {
      this.stage = 'ended';
      this.logMsg('可玩玩家不足，游戏结束');
      return;
    }
    this.handNumber++;
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.showdown = null;
    this.lastWinners = null;
    this.players.forEach(p => {
      p.hole = []; p.bet = 0; p.totalBet = 0; p._best = null;
      p.folded = p.sittingOut || p.chips <= 0;
      p.allIn = false; p.lastAction = null;
      p.isButton = p.isSB = p.isBB = false;
    });

    this.deck = shuffle(makeDeck());

    // 按钮轮换
    const btn = this.players[this.buttonIndex];
    if (this.buttonIndex < 0 || !btn || btn.chips <= 0 || btn.sittingOut) {
      this.buttonIndex = this.players.indexOf(elig[0]);
    } else {
      this.buttonIndex = this.nextSeat(this.buttonIndex, p => p.chips > 0 && !p.sittingOut);
    }

    // 盲注座位
    let sbIdx, bbIdx;
    if (elig.length === 2) {
      sbIdx = this.buttonIndex;
      bbIdx = this.nextSeat(this.buttonIndex, p => p.chips > 0 && !p.sittingOut);
    } else {
      sbIdx = this.nextSeat(this.buttonIndex, p => p.chips > 0 && !p.sittingOut);
      bbIdx = this.nextSeat(sbIdx, p => p.chips > 0 && !p.sittingOut);
    }
    this.players[this.buttonIndex].isButton = true;
    this.players[sbIdx].isSB = true;
    this.players[bbIdx].isBB = true;

    this.postBlind(sbIdx, this.smallBlind);
    this.postBlind(bbIdx, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    // 发底牌
    elig.forEach(p => { p.hole = [this.deck.pop(), this.deck.pop()]; });

    this.lastAggressorIndex = bbIdx;
    this.currentIndex = this.nextSeat(bbIdx, p => !p.folded && p.chips > 0 && !p.allIn);
    this.stage = 'preflop';
    this.logMsg(`第 ${this.handNumber} 手开始`);
  }

  postBlind(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    p.totalBet += actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
    p.lastAction = amount === this.smallBlind ? '小盲' : '大盲';
  }

  // ---- 行动后推进 ----
  advance() {
    if (this.contenders().length <= 1) { this.finishHand(false); return; }
    const next = this.nextSeat(this.currentIndex, p => !p.folded && p.chips > 0 && !p.allIn);
    if (next === -1) { this.nextStage(); return; }
    if (next === this.lastAggressorIndex) { this.nextStage(); return; }
    this.currentIndex = next;
  }

  nextStage() {
    this.players.forEach(p => { p.bet = 0; });
    if (this.stage === 'preflop') { this.dealCommunity(3); this.stage = 'flop'; }
    else if (this.stage === 'flop') { this.dealCommunity(1); this.stage = 'turn'; }
    else if (this.stage === 'turn') { this.dealCommunity(1); this.stage = 'river'; }
    else if (this.stage === 'river') { this.finishHand(true); return; }

    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    const first = this.nextSeat(this.buttonIndex, p => !p.folded && p.chips > 0 && !p.allIn);
    if (first === -1) { this.runOut(); return; }
    this.lastAggressorIndex = first;
    this.currentIndex = first;
  }

  dealCommunity(n) {
    for (let i = 0; i < n; i++) this.community.push(this.deck.pop());
  }

  runOut() {
    while (this.community.length < 5) this.community.push(this.deck.pop());
    this.finishHand(true);
  }

  // ---- 玩家动作 ----
  handleAction(id, action) {
    if (this.stage === 'waiting' || this.stage === 'ended') return { error: '游戏未开始' };
    const p = this.players[this.currentIndex];
    if (!p || p.id !== id) return { error: '还没轮到你' };
    const type = action.type;

    if (type === 'fold') {
      p.folded = true; p.lastAction = '弃牌';
      this.advance();
      return { ok: true };
    }
    if (type === 'check') {
      if (p.bet !== this.currentBet) return { error: '不能过牌，需跟注或加注' };
      p.lastAction = '过牌';
      this.advance();
      return { ok: true };
    }
    if (type === 'call' && this.currentBet === 0) {
      p.lastAction = '过牌';
      this.advance();
      return { ok: true };
    }

    // call / bet / raise: 计算目标下注额
    let target = action.amount || 0;
    if (type === 'call') target = this.currentBet;
    const minTarget = this.currentBet === 0 ? this.bigBlind : this.currentBet + this.minRaise;
    const maxTarget = p.chips + p.bet;
    if (target > maxTarget) target = maxTarget;
    if (target < this.currentBet) target = this.currentBet;
    if (target > this.currentBet && target < minTarget && target < maxTarget) {
      return { error: `最小加注到 ${minTarget}` };
    }

    const oldCurrent = this.currentBet;
    const before = p.bet;
    this.placeBet(p, target);
    if (p.bet > oldCurrent) {
      this.currentBet = p.bet;
      this.minRaise = p.bet - oldCurrent;
      this.lastAggressorIndex = this.currentIndex;
    }
    if (type === 'call') p.lastAction = p.allIn ? '全下跟注' : '跟注';
    else p.lastAction = p.allIn ? '全下' : (type === 'bet' ? '下注' : '加注');
    this.advance();
    return { ok: true };
  }

  placeBet(p, target) {
    const actual = Math.min(target, p.chips + p.bet);
    const delta = actual - p.bet;
    p.chips -= delta;
    p.bet = actual;
    p.totalBet += delta;
    this.pot += delta;
    if (p.chips === 0) p.allIn = true;
  }

  // ---- 结算 ----
  finishHand(showdown) {
    // 边池
    const contrib = this.players
      .filter(p => p.totalBet > 0)
      .map(p => ({ id: p.id, totalBet: p.totalBet, folded: p.folded }));
    const pots = [];
    while (contrib.length) {
      const minB = Math.min(...contrib.map(c => c.totalBet));
      let amount = 0;
      const eligible = [];
      contrib.forEach(c => {
        amount += Math.min(minB, c.totalBet);
        c.totalBet -= minB;
        if (!c.folded) eligible.push(c.id);
      });
      pots.push({ amount, eligible });
      for (let i = contrib.length - 1; i >= 0; i--) if (contrib[i].totalBet <= 0) contrib.splice(i, 1);
    }

    const results = [];
    const winAmounts = {}; // id -> 本手赢得总额
    if (!showdown) {
      const winner = this.contenders()[0];
      if (winner) {
        const won = pots.reduce((s, pot) => s + pot.amount, 0);
        winner.chips += won;
        winAmounts[winner.id] = won;
        results.push({ winners: [winner.id], pots });
        this.lastWinners = [winner.id];
      } else this.lastWinners = [];
    } else {
      const cont = this.contenders();
      cont.forEach(p => { p._best = bestHand([...p.hole, ...this.community]); });
      this.showdown = cont.map(p => ({ id: p.id, name: p.name, hand: p._best, cards: p.hole }));
      pots.forEach(pot => {
        const inPot = cont.filter(p => pot.eligible.includes(p.id));
        const pool = inPot.length ? inPot : cont;
        let best = pool[0]._best;
        let winners = [pool[0].id];
        pool.forEach(p => {
          const cmp = compareHand(p._best, best);
          if (cmp > 0) { best = p._best; winners = [p.id]; }
          else if (cmp === 0) winners.push(p.id);
        });
        const share = Math.floor(pot.amount / winners.length);
        let rem = pot.amount - share * winners.length;
        winners.forEach(wid => {
          const wp = this.players.find(x => x.id === wid);
          const gain = share + (rem > 0 ? 1 : 0);
          wp.chips += gain;
          winAmounts[wid] = (winAmounts[wid] || 0) + gain;
          if (rem > 0) rem--;
        });
        results.push({ winners, pot: pot.amount });
      });
      this.lastWinners = [...new Set(results.flatMap(r => r.winners))];
    }

    // 更新记分板
    this.players.forEach(p => { if (p.totalBet > 0) p.stats.handsPlayed++; });
    Object.keys(winAmounts).forEach(id => {
      const p = this.players.find(x => x.id === id);
      if (!p) return;
      const won = winAmounts[id];
      p.stats.handsWon++;
      p.stats.totalWon += won;
      if (won > p.stats.biggestPot) p.stats.biggestPot = won;
    });

    this.players.forEach(p => { p.bet = 0; p.totalBet = 0; });
    this.pot = 0;
    this.stage = 'showdown';

    const names = (this.lastWinners || [])
      .map(id => this.players.find(p => p.id === id)?.name)
      .filter(Boolean);
    this.logMsg(`${names.join('、') || '无人'} 赢得底池`);

    if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
    this.timeoutHandle = setTimeout(() => this.startHand(), 8000);
  }

  // ---- 状态输出 ----
  legalActions(viewerId) {
    if (this.currentIndex < 0) return null;
    const p = this.players[this.currentIndex];
    if (!p || p.id !== viewerId) return null;
    const callAmount = Math.min(this.currentBet - p.bet, p.chips);
    return {
      canCheck: this.currentBet === p.bet,
      callAmount,
      minRaiseTo: this.currentBet === 0 ? this.bigBlind : this.currentBet + this.minRaise,
      maxRaiseTo: p.chips + p.bet,
      currentBet: this.currentBet,
      playerBet: p.bet,
      chips: p.chips,
    };
  }

  getStateFor(viewerId) {
    const legal = (this.currentIndex >= 0 &&
      this.players[this.currentIndex] &&
      this.players[this.currentIndex].id === viewerId &&
      ['preflop', 'flop', 'turn', 'river'].includes(this.stage))
      ? this.legalActions(viewerId) : null;
    return {
      roomId: this.roomId,
      stage: this.stage,
      handNumber: this.handNumber,
      community: this.community,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      multiplier: this.multiplier,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      startChips: this.startChips,
      buttonSeat: this.buttonIndex,
      currentSeat: this.currentIndex,
      showdown: this.showdown,
      lastWinners: this.lastWinners,
      legal,
      you: viewerId,
      players: this.players.map(p => ({
        id: p.id, name: p.name, seat: p.seat,
        chips: p.chips, bet: p.bet, totalBet: p.totalBet,
        folded: p.folded, allIn: p.allIn, sittingOut: p.sittingOut,
        isButton: p.isButton, isSB: p.isSB, isBB: p.isBB,
        lastAction: p.lastAction, connected: p.connected,
        stats: p.stats,
        hole: (p.id === viewerId || this.stage === 'showdown' || this.stage === 'ended') ? p.hole : [],
      })),
      // 记分板：按筹码排名（含个人统计）
      scoreboard: this.players
        .map(p => ({ id: p.id, name: p.name, chips: p.chips, stats: p.stats }))
        .sort((a, b) => b.chips - a.chips),
      log: this.log.slice(-30),
    };
  }
}

module.exports = { Game, handName };

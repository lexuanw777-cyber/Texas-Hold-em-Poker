// test.js — 无头模拟：跑大量随机牌局，验证筹码守恒与流程无崩溃
const { Game } = require('./game');

function runSimulation(numHands) {
  const g = new Game('test');
  const N = 6;
  for (let i = 0; i < N; i++) g.addPlayer('p' + i, 'P' + i);
  const startChips = g.players.reduce((s, p) => s + p.chips, 0);

  let hands = 0;
  let guard = 0;
  while (hands < numHands && guard < numHands * 5000) {
    guard++;
    if (g.stage === 'waiting' || g.stage === 'ended') {
      if (g.eligible().length < 2) break;
      g.startHand();
      continue;
    }
    if (g.stage === 'showdown') {
      // 等待"下一手"：直接调用 startHand
      if (g.eligible().length < 2) break;
      g.startHand();
      hands++;
      continue;
    }
    const p = g.players[g.currentIndex];
    const L = g.legalActions(p.id);
    const r = Math.random();
    let action;
    if (r < 0.12) action = { type: 'fold' };
    else if (L.canCheck) action = { type: 'check' };
    else if (r < 0.30 && L.maxRaiseTo > L.currentBet) action = { type: 'raise', amount: Math.min(L.maxRaiseTo, L.currentBet + L.minRaise) };
    else action = { type: 'call' };
    g.handleAction(p.id, action);

    // 守恒校验
    const sum = g.players.reduce((s, pl) => s + pl.chips, 0) + g.pot;
    if (sum !== startChips) {
      throw new Error(`筹码不守恒! 初始=${startChips} 当前=${sum} 阶段=${g.stage} 第${g.handNumber}手`);
    }
  }
  const final = g.players.reduce((s, p) => s + p.chips, 0) + g.pot;
  if (final !== startChips) throw new Error('最终筹码不守恒: ' + final);
  return { hands, final, startChips };
}

// 单元测试：牌型评估
const { bestHand, compareHand, makeDeck } = require('./poker');
function assert(cond, msg) { if (!cond) throw new Error('断言失败: ' + msg); }

// 皇家同花顺 > 四条
const royal = bestHand([{rank:14,suit:0},{rank:13,suit:0},{rank:12,suit:0},{rank:11,suit:0},{rank:10,suit:0},{rank:2,suit:1},{rank:3,suit:2}]);
assert(royal.cat === 8, '皇家同花顺');
const quads = bestHand([{rank:9,suit:0},{rank:9,suit:1},{rank:9,suit:2},{rank:9,suit:3},{rank:5,suit:0},{rank:2,suit:1},{rank:3,suit:2}]);
assert(quads.cat === 7, '四条');
assert(compareHand(royal, quads) > 0, '皇家 > 四条');

// 轮子顺 A-2-3-4-5
const wheel = bestHand([{rank:14,suit:0},{rank:2,suit:1},{rank:3,suit:2},{rank:4,suit:3},{rank:5,suit:0},{rank:13,suit:1},{rank:11,suit:2}]);
assert(wheel.cat === 4 && wheel.tb[0] === 5, '轮子顺');

// 同花 vs 顺子
const flush = bestHand([{rank:2,suit:0},{rank:5,suit:0},{rank:9,suit:0},{rank:11,suit:0},{rank:13,suit:0},{rank:14,suit:1},{rank:3,suit:2}]);
assert(flush.cat === 5, '同花');

console.log('单元测试通过 ✓');

const res = runSimulation(2000);
console.log(`模拟 ${res.hands} 手完成，筹码守恒 ✓ (总筹码 ${res.startChips} -> ${res.final})`);
console.log('全部测试通过 ✓');

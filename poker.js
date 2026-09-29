// poker.js — 牌组、洗牌、牌型评估
// 牌表示: { rank: 2..14, suit: 0..3 }  (14=A, 13=K, 12=Q, 11=J)

const SUIT = ['♠', '♥', '♦', '♣']; // 黑桃 红桃 方块 梅花
const RANK = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };

function makeDeck() {
  const deck = [];
  for (let r = 2; r <= 14; r++) {
    for (let s = 0; s < 4; s++) deck.push({ rank: r, suit: s });
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardToShort(c) {
  return RANK[c.rank] + SUIT[c.suit];
}

function isRed(c) {
  return c.suit === 1 || c.suit === 2; // 红桃、方块
}

// 评估 5 张牌，返回 { cat, tb }
// cat: 8=同花顺 7=四条 6=葫芦 5=同花 4=顺子 3=三条 2=两对 1=一对 0=高牌
function eval5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const rc = {};
  ranks.forEach(r => { rc[r] = (rc[r] || 0) + 1; });
  const counts = Object.entries(rc)
    .map(([r, c]) => ({ r: +r, c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  // 顺子判定
  let isStraight = false, straightHigh = 0;
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { isStraight = true; straightHigh = uniq[0]; }
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) { isStraight = true; straightHigh = 5; } // 轮子 A-2-3-4-5
  }

  if (isStraight && isFlush) return { cat: 8, tb: [straightHigh] };
  if (counts[0].c === 4) return { cat: 7, tb: [counts[0].r, counts[1].r] };
  if (counts[0].c === 3 && counts[1].c === 2) return { cat: 6, tb: [counts[0].r, counts[1].r] };
  if (isFlush) return { cat: 5, tb: ranks };
  if (isStraight) return { cat: 4, tb: [straightHigh] };
  if (counts[0].c === 3) return { cat: 3, tb: [counts[0].r, counts[1].r, counts[2].r] };
  if (counts[0].c === 2 && counts[1].c === 2) return { cat: 2, tb: [counts[0].r, counts[1].r, counts[2].r] };
  if (counts[0].c === 2) return { cat: 1, tb: [counts[0].r, counts[1].r, counts[2].r, counts[3].r] };
  return { cat: 0, tb: ranks };
}

// 从 7 张中选最优 5 张
function bestHand(cards) {
  let best = null;
  const n = cards.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++)
        for (let l = k + 1; l < n; l++)
          for (let m = l + 1; m < n; m++) {
            const h = eval5([cards[i], cards[j], cards[k], cards[l], cards[m]]);
            if (!best || compareHand(h, best) > 0) best = h;
          }
  return best;
}

// 比较两手牌: >0 表示 a 更大
function compareHand(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  for (let i = 0; i < a.tb.length; i++) {
    if (a.tb[i] !== b.tb[i]) return a.tb[i] - b.tb[i];
  }
  return 0;
}

function handName(h) {
  const r = h.tb.map(x => RANK[x]);
  switch (h.cat) {
    case 8: return '同花顺' + (h.tb[0] === 14 ? '（皇家）' : '');
    case 7: return '四条 ' + r[0];
    case 6: return '葫芦 ' + r[0] + ' 带 ' + r[1];
    case 5: return '同花 ' + r.slice(0, 5).join(' ');
    case 4: return '顺子 ' + (h.tb[0] === 5 ? 'A-5' : '到 ' + RANK[h.tb[0]]);
    case 3: return '三条 ' + r[0];
    case 2: return '两对 ' + r[0] + ' 与 ' + r[1] + ' 踢脚 ' + r[2];
    case 1: return '一对 ' + r[0];
    default: return '高牌 ' + r[0];
  }
}

module.exports = { makeDeck, shuffle, cardToShort, isRed, eval5, bestHand, compareHand, handName, RANK, SUIT };

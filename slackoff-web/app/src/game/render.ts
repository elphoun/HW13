import { Game, GROUND, H, PLAYER_X, W } from './engine';
import type { GameMap } from '../data/maps';

// Low-poly look: everything is flat-shaded polygons, no gradients except the sky.
const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const poly = (c: CanvasRenderingContext2D, pts: number[][], fill: string) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = fill; c.fill(); };
const shade = (hex: string, k: number) => {      // k>0 lighten, k<0 darken
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

function drawBackdrop(c: CanvasRenderingContext2D, g: Game, m: GameMap) {
  const sky = c.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, m.sky[0]); sky.addColorStop(1, m.sky[1]);
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  // sun
  poly(c, Array.from({ length: 10 }, (_, i) => [820 + Math.cos(i / 10 * 6.283) * 46, 90 + Math.sin(i / 10 * 6.283) * 46]), '#ffe58a');
  poly(c, Array.from({ length: 8 }, (_, i) => [820 + Math.cos(i / 8 * 6.283) * 30, 90 + Math.sin(i / 8 * 6.283) * 30]), '#fff3b8');
  // clouds
  for (let i = 0; i < 5; i++) {
    const x = ((i * 260 + 60 - g.clock * 9 - g.scroll * 0.05) % (W + 300) + (W + 300)) % (W + 300) - 150, y = 50 + hash(i + 3) * 110;
    poly(c, [[x, y + 24], [x + 22, y], [x + 55, y - 10], [x + 90, y + 2], [x + 112, y + 24]], '#ffffff');
    poly(c, [[x + 22, y], [x + 55, y - 10], [x + 48, y + 24]], '#eef8ff');
  }
  // far mountains (parallax 0.12)
  const fo = g.scroll * 0.12, step = 300;
  for (let i = Math.floor(fo / step) - 1; i < Math.floor(fo / step) + W / step + 2; i++) {
    const x = i * step - fo, h = 120 + hash(i) * 110;
    poly(c, [[x - 160, GROUND - 60], [x, GROUND - 60 - h], [x + 30, GROUND - 60]], shade(m.far, 0.12));
    poly(c, [[x + 30, GROUND - 60], [x, GROUND - 60 - h], [x + 170, GROUND - 60]], shade(m.far, -0.08));
  }
  c.fillStyle = m.far; c.fillRect(0, GROUND - 62, W, 70);
  // mid hills (parallax 0.3)
  const mo = g.scroll * 0.3, ms = 220;
  for (let i = Math.floor(mo / ms) - 1; i < Math.floor(mo / ms) + W / ms + 2; i++) {
    const x = i * ms - mo, h = 50 + hash(i + 9) * 60;
    poly(c, [[x - 130, GROUND - 20], [x + 30, GROUND - 20 - h], [x + 140, GROUND - 20]], m.mid);
    poly(c, [[x + 30, GROUND - 20 - h], [x + 140, GROUND - 20], [x + 20, GROUND - 20]], shade(m.mid, -0.1));
  }
  c.fillStyle = shade(m.mid, -0.05); c.fillRect(0, GROUND - 22, W, 30);
  // pine trees (parallax 0.55)
  const to = g.scroll * 0.55, ts = 150;
  for (let i = Math.floor(to / ts) - 1; i < Math.floor(to / ts) + W / ts + 2; i++) {
    const x = i * ts - to + hash(i + 40) * 70, s = 0.7 + hash(i + 5) * 0.6, base = GROUND + 4;
    c.fillStyle = m.trunk; c.fillRect(x - 6 * s, base - 40 * s, 12 * s, 40 * s);
    for (let k = 0; k < 3; k++) {
      const w = (62 - k * 14) * s, y0 = base - (34 + k * 38) * s, h = 62 * s;
      poly(c, [[x - w, y0], [x, y0 - h], [x, y0]], shade(m.leaf[k % 3], 0.1));
      poly(c, [[x, y0 - h], [x + w, y0], [x, y0]], shade(m.leaf[k % 3], -0.12));
    }
  }
}

function drawGround(c: CanvasRenderingContext2D, g: Game, m: GameMap) {
  c.fillStyle = m.ground; c.fillRect(0, GROUND, W, H - GROUND);
  const o = g.scroll, s = 70;
  for (let i = Math.floor(o / s) - 1; i < Math.floor(o / s) + W / s + 2; i++) {
    const x = i * s - o, d = 30 + hash(i + 70) * 60;
    poly(c, [[x, GROUND], [x + s, GROUND], [x + s / 2, GROUND + d]], i % 2 ? shade(m.ground, 0.1) : shade(m.ground, -0.1));
    poly(c, [[x + s, GROUND], [x + s * 1.5, GROUND + d * 0.8], [x + s / 2, GROUND + d]], i % 3 ? shade(m.ground, -0.05) : shade(m.ground, 0.06));
  }
  c.fillStyle = m.groundTop; c.fillRect(0, GROUND - 3, W, 12);
  for (let i = Math.floor(o / 40) - 1; i < Math.floor(o / 40) + W / 40 + 2; i++) {     // grass tufts
    const x = i * 40 - o + hash(i + 1) * 20;
    poly(c, [[x, GROUND - 3], [x + 4, GROUND - 14 - hash(i) * 8], [x + 8, GROUND - 3]], shade(m.groundTop, -0.12));
  }
}

function drawObstacle(c: CanvasRenderingContext2D, g: Game, m: GameMap) {
  if (g.mode === 'recover' || g.obstacleX < -260 || g.obstacleX > W + 260) return;
  const x = g.obstacleX, kind = g.kind, hit = g.mode === 'hit', u = g.resolveU;
  if (kind === 'jump') {
    const r = 48, cy = GROUND - r + (hit ? -Math.min(40, g.modeT * 80) : 0), rot = (g.scroll * 0.012);
    const pts = Array.from({ length: 9 }, (_, i) => { const a = rot + i / 9 * 6.283, rr = r * (0.88 + hash(i + 2) * 0.2); return [x + Math.cos(a) * rr, cy + Math.sin(a) * rr]; });
    pts.forEach((p, i) => poly(c, [[x, cy], p, pts[(i + 1) % 9]], ['#a3a8b8', '#8e93a6', '#b9bdcb', '#7c8196'][i % 4]));
    c.fillStyle = 'rgba(0,0,0,.14)'; c.beginPath(); c.ellipse(x, GROUND + 4, r * 0.9, 8, 0, 0, 6.283); c.fill();
  } else if (kind === 'duck') {
    const tx = x + 96;
    c.fillStyle = m.trunk; c.fillRect(tx - 18, GROUND - 330, 36, 340);
    poly(c, [[tx - 18, GROUND - 330], [tx, GROUND - 330], [tx - 6, GROUND]], shade(m.trunk, 0.15));
    c.fillStyle = shade(m.trunk, -0.08); c.fillRect(x - 120, GROUND - 100, 220, 22);      // the low branch
    poly(c, [[x - 120, GROUND - 100], [x - 138, GROUND - 89], [x - 120, GROUND - 78]], shade(m.trunk, -0.2));
    for (let k = 0; k < 4; k++) poly(c, [[x - 100 + k * 55, GROUND - 78], [x - 84 + k * 55, GROUND - 52], [x - 68 + k * 55, GROUND - 78]], m.leaf[k % 3]);
    poly(c, [[tx - 110, GROUND - 300], [tx, GROUND - 440], [tx + 110, GROUND - 300]], m.leaf[0]);
    poly(c, [[tx, GROUND - 440], [tx + 110, GROUND - 300], [tx, GROUND - 300]], shade(m.leaf[0], -0.15));
    poly(c, [[tx - 90, GROUND - 230], [tx, GROUND - 350], [tx + 90, GROUND - 230]], m.leaf[1]);
  } else if (kind === 'run') {
    const half = 100;
    c.fillStyle = '#3aa0e6'; c.fillRect(x - half, GROUND - 2, half * 2, H - GROUND);
    poly(c, [[x - half, GROUND - 2], [x - half + 30, GROUND + 70], [x - half, GROUND + 70]], '#2b8ad0');
    poly(c, [[x - half + 40, GROUND + 4], [x + 10, GROUND + 4], [x - 15, GROUND + 14]], '#8fd3ff');
    poly(c, [[x + 30, GROUND + 22], [x + 80, GROUND + 22], [x + 55, GROUND + 32]], '#8fd3ff');
    if (u > 0.2 || hit) {                      // bridge planks slam down once you start sprinting
      const drop = hit ? 0 : Math.min(1, (u - 0.2) / 0.15);
      for (let k = 0; k < 7; k++) { const px = x - half + 6 + k * 28; c.fillStyle = k % 2 ? '#c08a52' : '#a9733e'; c.fillRect(px, GROUND - 6 - (1 - drop) * 120, 24, 10); }
    }
  } else if (kind === 'tilt') {                       // vines hang down; they swing aside once you've cleared them
    const swing = hit ? 0 : Math.sin(Math.min(1, u * 1.5) * Math.PI) * 40;
    for (let k = 0; k < 6; k++) {
      const vx = x - 90 + k * 36, len = 230 + hash(k + 20) * 70, sway = Math.sin(g.clock * 2 + k) * 6 + (u > 0.15 ? swing * (k % 2 ? 1 : -1) : 0), ex = vx + sway * 1.5;
      c.strokeStyle = '#2f9e44'; c.lineWidth = 7; c.beginPath(); c.moveTo(vx, 0); c.quadraticCurveTo(vx + sway, len / 2, ex, len); c.stroke();
      poly(c, [[ex - 9, len], [ex, len + 22], [ex + 9, len]], m.leaf[k % 3]);
    }
  } else if (kind === 'circle') {                     // bubbles float in front of you and pop
    if (u > 0.5) return;
    for (let k = 0; k < 7; k++) {
      const bx = x - 80 + hash(k + 30) * 160, by = GROUND - 110 - hash(k + 40) * 120 + Math.sin(g.clock * 2 + k) * 8, r = 16 + hash(k + 50) * 16;
      c.fillStyle = hit ? 'rgba(160,160,170,.4)' : 'rgba(143,211,255,.45)'; c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3;
      c.beginPath(); c.arc(bx, by, r, 0, 6.283); c.fill(); c.stroke();
    }
  } else if (kind === 'toes') {                       // stepping stones to reach down and touch
    for (let k = 0; k < 3; k++) {
      const sx = x - 60 + k * 60, done = u > 0.45;
      poly(c, [[sx - 24, GROUND], [sx - 16, GROUND - 26], [sx + 16, GROUND - 30], [sx + 26, GROUND]], done ? '#ffd23f' : '#9aa0b4');
      poly(c, [[sx - 16, GROUND - 26], [sx + 16, GROUND - 30], [sx + 4, GROUND - 14]], done ? '#ffe58a' : '#b6bbcc');
    }
  } else if (kind === 'rotate') {                     // a wooden gate that swings open
    const open = hit ? 0 : Math.min(1, u * 1.6), w = 70 * Math.cos(open * 1.45);
    c.fillStyle = shade(m.trunk, -0.1); c.fillRect(x - 84, GROUND - 190, 18, 190); c.fillRect(x + 66, GROUND - 190, 18, 190);
    c.fillStyle = m.trunk; c.fillRect(x - w, GROUND - 170, w * 2, 150);
    c.fillStyle = shade(m.trunk, 0.2); for (let k = 0; k < 4; k++) c.fillRect(x - w, GROUND - 160 + k * 36, w * 2, 6);
  } else {
    const wilt = hit;
    for (let k = 0; k < 5; k++) {
      const fx = x - 70 + k * 35, fh = (wilt ? 26 : 46 + hash(k + 8) * 22) - (wilt ? 0 : 0);
      if (u > 0.5) continue;                   // picked
      c.strokeStyle = wilt ? '#8b8a5a' : '#2f9e44'; c.lineWidth = 4; c.beginPath(); c.moveTo(fx, GROUND); c.quadraticCurveTo(fx + (wilt ? 12 : 0), GROUND - fh / 2, fx + (wilt ? 18 : 0), GROUND - fh); c.stroke();
      const cx = fx + (wilt ? 18 : 0), cy = GROUND - fh - 2, col = wilt ? '#9b9a8a' : ['#ff7a93', '#ffd23f', '#b196ff', '#ff9f43', '#6ee7b7'][k];
      for (let p = 0; p < 6; p++) { const a = p / 6 * 6.283; poly(c, [[cx, cy], [cx + Math.cos(a - 0.4) * 13, cy + Math.sin(a - 0.4) * 13], [cx + Math.cos(a + 0.4) * 13, cy + Math.sin(a + 0.4) * 13]], col); }
      c.fillStyle = wilt ? '#c9c7a0' : '#fff6a8'; c.beginPath(); c.arc(cx, cy, 4.5, 0, 6.283); c.fill();
    }
  }
}

function drawPlayer(c: CanvasRenderingContext2D, g: Game) {
  const t = g.clock, u = g.resolveU, k = g.kind, p = g.pulse;
  let lift = 0, crouch = 0, bend = 0, twist = 0, armsUp = 0, legPh = t * 6, legAmp = 8, spin = 0, lean = 0, sink = 0, dizzy = false;
  const bob = Math.sin(t * 5) * 2;
  if (g.mode === 'approach') {
    if (k === 'jump') { lift = p * 26; armsUp = p; legAmp = 6 + p * 14; }
    else if (k === 'duck') crouch = p * 0.85;
    else if (k === 'run') { legPh = t * 16; legAmp = 20 + p * 8; lean = 0.12; }
    else if (k === 'tilt') lean = Math.sin(t * 3) * 0.22 * (0.4 + p);
    else if (k === 'circle') lean = Math.sin(t * 4) * 0.16 * (0.4 + p);
    else if (k === 'toes') { bend = p; crouch = p * 0.15; }
    else if (k === 'rotate') twist = t * 3 * (0.4 + p);
    else { bend = p; crouch = p * 0.4; }
  } else if (g.mode === 'resolve') {
    if (k === 'jump') { lift = 190 * 4 * u * (1 - u); armsUp = 1; legAmp = 18; spin = 0; }
    else if (k === 'duck') crouch = 0.88 * Math.min(1, Math.sin(Math.min(1, u * 1.15) * Math.PI) * 3);
    else if (k === 'run') { legPh = t * 30; legAmp = 28; lean = 0.3; lift = Math.abs(Math.sin(t * 15)) * 5; }
    else if (k === 'tilt') lean = Math.sin(u * Math.PI * 3) * 0.32;
    else if (k === 'circle') { lean = Math.sin(u * Math.PI * 4) * 0.26; armsUp = u > 0.4 ? 1 : 0; }
    else if (k === 'toes') { bend = Math.sin(Math.min(1, u * 1.2) * Math.PI); crouch = bend * 0.15; }
    else if (k === 'rotate') { twist = u * Math.PI * 2; armsUp = 0; }
    else { bend = Math.sin(Math.min(1, u * 1.2) * Math.PI); crouch = bend * 0.5; armsUp = u > 0.55 ? 1 : 0; }
  } else if (g.mode === 'hit') {
    const m = g.modeT; dizzy = true;
    if (k === 'run') { sink = Math.min(55, m * 160); } else { spin = Math.min(1.5, m * 5) * -1; lift = Math.max(0, 60 * Math.sin(Math.min(1, m * 2.2) * Math.PI)); }
  } else if (g.finished === 'win') { lift = Math.abs(Math.sin(t * 6)) * 30; armsUp = 1; }
  else if (g.finished === 'lose') { spin = -1.5; dizzy = true; }

  c.save();
  c.fillStyle = 'rgba(0,0,0,.16)'; c.beginPath(); c.ellipse(PLAYER_X, GROUND + 5, 34 / (1 + lift / 160), 8, 0, 0, 6.283); c.fill();
  if (sink) { c.beginPath(); c.rect(0, 0, W, GROUND + 6); c.clip(); }
  c.translate(PLAYER_X, GROUND - lift + sink + (g.mode === 'approach' ? bob * 0.5 : 0));
  c.rotate(spin + lean);
  const hipY = -44 + crouch * 22 + bend * 8;
  // legs
  c.lineCap = 'round'; c.strokeStyle = '#d9486a'; c.lineWidth = 11;
  for (const s of [-1, 1]) {
    const ph = legPh + (s > 0 ? Math.PI : 0), fx = s * (11 + crouch * 8) + Math.sin(ph) * legAmp, fy = -Math.max(0, Math.cos(ph)) * legAmp * 0.7;
    c.beginPath(); c.moveTo(s * 9, hipY); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = '#7a3dd1'; c.beginPath(); c.ellipse(fx + 3, fy, 10, 5, 0, 0, 6.283); c.fill();
  }
  // body
  c.save(); c.translate(0, hipY); c.scale((1 + crouch * 0.12) * (twist ? Math.max(0.25, Math.abs(Math.cos(twist))) : 1), 1 - crouch * 0.28); c.rotate(bend * 0.7);
  const body = [[-30, 0], [-34, -34], [-20, -66], [0, -76], [20, -66], [34, -34], [30, 0]];
  const cols = ['#ff8fa3', '#ff7a93', '#ffa3b3', '#f2688a', '#ff8fa3', '#ff7a93'];
  for (let i = 0; i < body.length - 1; i++) poly(c, [[0, -34], body[i], body[i + 1]], cols[i]);
  poly(c, [[-30, 0], [30, 0], [0, -34]], '#e9567a');
  // arms
  c.strokeStyle = '#ff7a93'; c.lineWidth = 9;
  for (const s of [-1, 1]) {
    const hx = armsUp ? s * (30 + armsUp * 6) : s * (38 + Math.sin(legPh + (s > 0 ? 0 : Math.PI)) * 6), hy = armsUp ? -66 - armsUp * 44 : (bend ? 22 + bend * 10 : -8 + Math.cos(legPh + (s > 0 ? 0 : Math.PI)) * 8);
    c.beginPath(); c.moveTo(s * 30, -46); c.lineTo(hx, hy); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(hx, hy, 6, 0, 6.283); c.fill();
  }
  // face
  c.fillStyle = '#2b2b3a'; c.strokeStyle = '#2b2b3a'; c.lineWidth = 3;
  if (dizzy) { for (const ex of [-12, 12]) { c.beginPath(); c.moveTo(ex - 5, -54); c.lineTo(ex + 5, -44); c.moveTo(ex + 5, -54); c.lineTo(ex - 5, -44); c.stroke(); } c.beginPath(); c.arc(0, -30, 6, 0, 6.283); c.stroke(); }
  else { c.beginPath(); c.arc(-12, -49, 4.5, 0, 6.283); c.arc(12, -49, 4.5, 0, 6.283); c.fill(); c.beginPath(); c.arc(0, -38, 9, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = 'rgba(255,90,120,.45)'; c.beginPath(); c.ellipse(-22, -40, 6, 3.5, 0, 0, 6.283); c.ellipse(22, -40, 6, 3.5, 0, 0, 6.283); c.fill(); }
  c.restore();
  c.restore();
}

export function render(c: CanvasRenderingContext2D, g: Game, m: GameMap) {
  c.save();
  if (g.shake > 0) c.translate((Math.random() - 0.5) * 12 * g.shake, (Math.random() - 0.5) * 12 * g.shake);
  drawBackdrop(c, g, m); drawGround(c, g, m);
  const behind = g.kind === 'run';
  if (behind) drawObstacle(c, g, m);
  drawPlayer(c, g);
  if (!behind) drawObstacle(c, g, m);
  // speed lines during the dash
  if (g.mode === 'resolve') { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3; for (let i = 0; i < 9; i++) { const y = 150 + hash(i + Math.floor(g.clock * 20)) * 280, x = hash(i * 3 + Math.floor(g.clock * 20)) * W; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 90, y); c.stroke(); } }
  // particles
  for (const p of g.particles) {
    const a = Math.max(0, p.life / p.max);
    c.globalAlpha = a;
    if (p.text) { c.font = `700 ${Math.round(30 * p.size)}px Fredoka, system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(40,40,80,.65)'; c.strokeText(p.text, p.x, p.y); c.fillStyle = p.color; c.fillText(p.text, p.x, p.y); }
    else poly(c, [[p.x, p.y - p.size], [p.x + p.size, p.y], [p.x, p.y + p.size], [p.x - p.size, p.y]], p.color);
    c.globalAlpha = 1;
  }
  // time bar for the current challenge
  if (g.mode === 'approach') {
    const f = g.timeLeft / g.budget, bw = 360, bx = (W - bw) / 2, by = H - 46;
    c.fillStyle = 'rgba(30,30,70,.35)'; c.fillRect(bx, by, bw, 14);
    c.fillStyle = f > 0.5 ? '#6ee787' : f > 0.25 ? '#ffd23f' : '#ff5c5c'; c.fillRect(bx, by, bw * f, 14);
    c.font = '600 13px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(`${g.timeLeft.toFixed(1)}s`, W / 2, by - 6);
  }
  c.restore();
}

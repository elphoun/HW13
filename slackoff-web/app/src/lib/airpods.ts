// AirPod motion in the browser. The Swift streamer (slackoff-airpod) sends UDP to the Node bridge (slackoff-web/bridge),
// which re-sends every packet as Server-Sent Events on /events. In dev, vite proxies /events to the bridge (vite.config.ts);
// set VITE_BRIDGE_URL (e.g. http://localhost:8080) to point somewhere else.
//
// No calibration: zero() makes the current pose neutral and everything is measured from it. A Sample has
//   roll / pitch / yaw   degrees from neutral (roll = ear toward shoulder, pitch = nod, yaw = turn)
//   tilt, bend           degrees away from neutral "up"; bend is positive when bent forward
//   up, mag              head acceleration along vertical / in any direction (g)
//   y                    rough up/down position in metres (leaky double integral, drifts back to 0 within ~1 s)
export interface Sample { t: number; dt: number; roll: number; pitch: number; yaw: number; tilt: number; bend: number; up: number; mag: number; y: number; vy: number; }
type Packet = { p?: number; t: number; roll: number; pitch: number; yaw: number; ax: number; ay: number; az: number; gx?: number; gy: number; gz: number; type?: string };
type Vec = [number, number, number];

const DEG = 180 / Math.PI;
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec): Vec => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

class AirPodsClient {
  private subs = new Set<(s: Sample) => void>();
  private es: EventSource | null = null;
  private win: { t: number; roll: number; pitch: number; yaw: number; g: Vec }[] = [];
  private base: { roll: number; pitch: number; yaw: number; g: Vec } | null = null;
  private prevT = 0; private by = 0; private vy = 0; private y = 0;
  private lastPacket = 0; private rateT = 0; private rateN = 0;
  rate = 0;
  /** Set to true if squats / up-down read backwards on your AirPods. Saved as the airpodsFlipUp setting (AppState syncs it). */
  flipUp = false;
  setFlipUp(v: boolean) { this.flipUp = v; }

  /** True while packets are arriving. */
  connected() { return performance.now() - this.lastPacket < 800; }

  /** Start listening (once) and call `cb` for every sample. Returns an unsubscribe function. */
  subscribe(cb: (s: Sample) => void) {
    this.subs.add(cb); this.open();
    return () => { this.subs.delete(cb); };
  }

  /** Make the current pose (average of the last 250 ms) neutral. */
  zero() {
    const w = this.win; if (!w.length) return false;
    const avg = (k: 'roll' | 'pitch' | 'yaw') => Math.atan2(w.reduce((a, p) => a + Math.sin(p[k]), 0), w.reduce((a, p) => a + Math.cos(p[k]), 0));
    const g = norm(w.reduce<Vec>((a, p) => [a[0] + p.g[0], a[1] + p.g[1], a[2] + p.g[2]], [0, 0, 0]));
    this.base = { roll: avg('roll'), pitch: avg('pitch'), yaw: avg('yaw'), g };
    this.y = this.vy = 0; return true;
  }

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Open the stream, and keep it open. If the page loads before the bridge is running, or the bridge restarts, the dev
   * proxy answers with an error and EventSource gives up for good (it only retries dropped connections). So whenever the
   * stream ends up closed, try again shortly, for as long as anything is subscribed.
   */
  private open() {
    if (this.es || this.retryTimer || typeof EventSource === 'undefined') return;
    const base = (import.meta.env.VITE_BRIDGE_URL as string | undefined) ?? '';
    const es = new EventSource(`${base}/events`);
    this.es = es;
    es.onmessage = e => { try { this.onPacket(JSON.parse(e.data) as Packet); } catch { /* ignore a bad packet */ } };
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) return;          // the browser is already retrying a dropped connection
      es.close(); if (this.es === es) this.es = null;
      this.retryTimer = setTimeout(() => { this.retryTimer = null; if (this.subs.size) this.open(); }, 2000);
    };
  }

  private onPacket(d: Packet) {
    if ((d.p ?? 1) !== 1 || d.type === 'button' || d.gx === undefined) return;
    const now = performance.now(); this.lastPacket = now;
    this.rateN++; if (now - this.rateT > 1000) { this.rate = this.rateN * 1000 / (now - this.rateT); this.rateN = 0; this.rateT = now; }
    const g = norm([d.gx, d.gy, d.gz]);
    this.win.push({ t: now, roll: d.roll, pitch: d.pitch, yaw: d.yaw, g }); this.win = this.win.filter(p => now - p.t < 250);
    if (!this.base) this.zero();
    const b = this.base; if (!b) return;
    let dt = d.t - this.prevT; this.prevT = d.t; if (!(dt > 0 && dt < 0.2)) dt = 0.04;
    const roll = wrap(d.roll - b.roll) * DEG, pitch = wrap(d.pitch - b.pitch) * DEG, yaw = wrap(d.yaw - b.yaw) * DEG;
    const tilt = Math.acos(Math.max(-1, Math.min(1, dot(g, b.g)))) * DEG;
    const ua: Vec = [d.ax, d.ay, d.az], up = dot(ua, g) * (this.flipUp ? -1 : 1), mag = len(ua);
    const rawY = up * 9.81, lk = Math.exp(-dt / 1.0);
    this.by += (rawY - this.by) * (1 - Math.exp(-dt / 2));             // slow bias estimate so a sensor offset doesn't integrate
    this.vy = (this.vy + (rawY - this.by) * dt) * lk; this.y = (this.y + this.vy * dt) * lk;
    const s: Sample = { t: now, dt, roll, pitch, yaw, tilt, bend: pitch <= 0 ? tilt : -tilt, up, mag, y: this.y, vy: this.vy };
    this.subs.forEach(f => f(s));
  }
}

export const airpods = new AirPodsClient();

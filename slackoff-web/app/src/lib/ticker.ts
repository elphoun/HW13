// Background tabs throttle setInterval on the main thread (down to once a minute after ~5 min hidden).
// Timers inside a Web Worker are not throttled the same way, so the clock ticks from a tiny inline worker.
export function createTicker(onTick: () => void, ms = 250) {
  let worker: Worker | null = null, id: number | undefined;
  try {
    const src = `let id;onmessage=e=>{clearInterval(id);if(e.data==='start')id=setInterval(()=>postMessage(0),${ms});};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    worker = new Worker(url); worker.onmessage = onTick;
    URL.revokeObjectURL(url);
  } catch { worker = null; }
  return {
    start() { if (worker) worker.postMessage('start'); else { window.clearInterval(id); id = window.setInterval(onTick, ms); } },
    stop() { if (worker) worker.postMessage('stop'); else window.clearInterval(id); },
    destroy() { this.stop(); worker?.terminate(); },
  };
}

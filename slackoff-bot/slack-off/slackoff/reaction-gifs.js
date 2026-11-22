// A happy GIF when someone finishes a break, a sad one when they run out of time. Skipping gets no GIF (their call).
// Defaults are public Giphy links; override with SLACKOFF_HAPPY_GIF_URLS / SLACKOFF_SAD_GIF_URLS (comma-separated)
// or turn them off with SLACKOFF_REACTION_GIFS=off.
const DEFAULT_REACTION_GIFS = {
  happy: [
    'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    'https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif',
  ],
  sad: [
    'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
    'https://media.giphy.com/media/3o6wrvdHFbwBrUFenu/giphy.gif',
    'https://media.giphy.com/media/ISOckXUybVfQ4/giphy.gif',
  ],
};

const SUCCESS_OUTCOMES = new Set(['detected', 'manual']);

const mood = (outcome) => (SUCCESS_OUTCOMES.has(outcome) ? 'happy' : outcome === 'timeout' ? 'sad' : null);

const pickReactionGif = (outcome, gifs = DEFAULT_REACTION_GIFS, random = Math.random) => {
  const kind = mood(outcome);
  const options = kind ? (gifs?.[kind] ?? []) : [];
  return options.length ? options[Math.floor(random() * options.length)] : null;
};

const parseUrlList = (value) =>
  (value || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

const loadReactionGifs = (env = process.env) => {
  if (String(env.SLACKOFF_REACTION_GIFS || '').toLowerCase() === 'off') return { happy: [], sad: [] };
  const happy = parseUrlList(env.SLACKOFF_HAPPY_GIF_URLS);
  const sad = parseUrlList(env.SLACKOFF_SAD_GIF_URLS);
  return {
    happy: happy.length ? happy : DEFAULT_REACTION_GIFS.happy,
    sad: sad.length ? sad : DEFAULT_REACTION_GIFS.sad,
  };
};

export { DEFAULT_REACTION_GIFS, loadReactionGifs, pickReactionGif };

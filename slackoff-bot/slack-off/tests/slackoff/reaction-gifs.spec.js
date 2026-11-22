import assert from 'node:assert';
import { describe, it } from 'node:test';
import { DEFAULT_REACTION_GIFS, loadReactionGifs, pickReactionGif } from '../../slackoff/reaction-gifs.js';

describe('reaction gifs', () => {
  const gifs = { happy: ['h1', 'h2'], sad: ['s1', 's2'] };

  it('picks a happy gif when the break was finished, detected or marked done', () => {
    assert.strictEqual(
      pickReactionGif('detected', gifs, () => 0),
      'h1',
    );
    assert.strictEqual(
      pickReactionGif('manual', gifs, () => 0.99),
      'h2',
    );
  });

  it('picks a sad gif when time ran out', () => {
    assert.strictEqual(
      pickReactionGif('timeout', gifs, () => 0),
      's1',
    );
  });

  it('sends no gif for a skipped break or when no gifs are configured', () => {
    assert.strictEqual(pickReactionGif('skipped', gifs), null);
    assert.strictEqual(pickReactionGif('detected', { happy: [], sad: [] }), null);
  });

  it('only ships working-looking https defaults', () => {
    for (const url of [...DEFAULT_REACTION_GIFS.happy, ...DEFAULT_REACTION_GIFS.sad])
      assert.match(url, /^https:\/\/.+\.gif$/);
  });

  it('reads comma-separated overrides, falls back to defaults, and can be turned off', () => {
    const custom = loadReactionGifs({ SLACKOFF_HAPPY_GIF_URLS: ' https://a.test/1.gif , https://a.test/2.gif ' });
    assert.deepStrictEqual(custom.happy, ['https://a.test/1.gif', 'https://a.test/2.gif']);
    assert.deepStrictEqual(custom.sad, DEFAULT_REACTION_GIFS.sad);
    assert.deepStrictEqual(loadReactionGifs({ SLACKOFF_REACTION_GIFS: 'off' }), { happy: [], sad: [] });
  });
});

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { activities, gifUrlFor, pickActivity, stretches } from '../../slackoff/activities.js';
import { createRepCounter } from '../../slackoff/rep-counter.js';

describe('activities', () => {
  it('includes all four stretches and six activities with unique ids', () => {
    assert.strictEqual(stretches.length, 4);
    assert.strictEqual(activities.length, 10);
    assert.strictEqual(new Set(activities.map((activity) => activity.id)).size, 10);
  });

  it('gives every activity a valid detection rule', () => {
    for (const activity of activities) {
      assert.doesNotThrow(() => createRepCounter(activity.rule), activity.id);
      assert(activity.targetReps > 0);
    }
  });

  it('picks from the requested category and never repeats the previous activity', () => {
    for (let i = 0; i < 50; i += 1) {
      const previous = activities[i % activities.length];
      const picked = pickActivity(previous.category, previous.id);
      assert.strictEqual(picked.category, previous.category);
      assert.notStrictEqual(picked.id, previous.id);
    }
  });

  it('builds gif urls only when a base url is configured', () => {
    assert.strictEqual(gifUrlFor(activities[0], null), null);
    assert.strictEqual(gifUrlFor(activities[0], 'https://cdn.test/gifs/'), 'https://cdn.test/gifs/neck-tilts.gif');
  });
});

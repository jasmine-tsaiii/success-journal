import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRef, shareLink, stripUtm } from '../app/js/ref.js';

test('分享連結帶 UTM', () => {
  const url = new URL(shareLink('thanks_card'));
  assert.equal(url.origin + url.pathname, 'https://success.jas-soul.com/');
  assert.equal(url.searchParams.get('utm_source'), 'success_journal');
  assert.equal(url.searchParams.get('utm_medium'), 'thanks_card');
  assert.equal(url.searchParams.get('utm_campaign'), 'friend_referral');
  assert.equal(url.searchParams.has('utm_content'), false);
  assert.equal(url.searchParams.get('openExternalBrowser'), '1', 'LINE 裡點開時用手機瀏覽器打開');
  assert.equal(new URL(shareLink('invite_card', 'settings')).searchParams.get('utm_content'), 'settings');
});

test('讀取與移除網址上的 UTM', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  assert.deepEqual(parseRef('?utm_source=success_journal&utm_medium=invite_card&utm_campaign=friend_referral&x=1', now), {
    source: 'success_journal',
    medium: 'invite_card',
    campaign: 'friend_referral',
    at: '2026-10-20T00:00:00.000Z',
  });
  assert.equal(parseRef('?x=1'), null);
  assert.equal(parseRef(''), null);
  assert.equal(parseRef(`?utm_source=${'a'.repeat(100)}`).source.length, 60);
  assert.equal(stripUtm('https://a.com/app/?utm_source=x&keep=1&utm_medium=y#top'), 'https://a.com/app/?keep=1#top');
  assert.equal(stripUtm('https://a.com/app/?utm_source=x'), 'https://a.com/app/');
  assert.equal(stripUtm('https://a.com/?utm_source=x&openExternalBrowser=1'), 'https://a.com/');
});

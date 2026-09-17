/* wall.js — cwi-placement-wall v1.0.0
 * Zero-dependency UMD engine for the CWI Catalog Placement Wall.
 * Renders scan-verified playlist placements for the That Boy Hi Hat catalog.
 * Never estimates: positions are snapshots, staleness is computed from
 * verified_at, and anything older than STALE_AFTER_DAYS flips to STALE.
 * Served byte-identical from the Pages site.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.Wall = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SCHEMA = 'cwi.placement-record/1.0';
  var STALE_AFTER_DAYS = 30;
  var SPOTIFY_ID_RE = /^[A-Za-z0-9]{22}$/;
  var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isFiniteInt(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  }

  function ageDays(verifiedAt, nowMs) {
    var t = Date.parse(verifiedAt);
    if (isNaN(t)) return Infinity;
    return (nowMs - t) / 86400000;
  }

  /** Validate a placements document. Returns {ok, errors}. Pure. */
  function validate(data, opts) {
    var errors = [];
    opts = opts || {};
    var nowMs = opts.nowMs || Date.now();

    function err(path, msg) { errors.push(path + ': ' + msg); }

    if (!data || typeof data !== 'object') { err('$', 'not an object'); return { ok: false, errors: errors }; }
    if (data.schema !== SCHEMA) err('schema', 'expected ' + SCHEMA);
    if (!data.artist) err('artist', 'missing');
    if (!Array.isArray(data.placements) || data.placements.length === 0) {
      err('placements', 'must be a non-empty array');
      return { ok: errors.length === 0, errors: errors };
    }
    var seen = {};
    data.placements.forEach(function (p, i) {
      var path = 'placements[' + i + ']';
      if (!p || typeof p !== 'object') { err(path, 'not an object'); return; }
      if (!p.id || seen[p.id]) err(path + '.id', 'missing or duplicate');
      seen[p.id] = true;
      if (!p.playlist_name) err(path + '.playlist_name', 'missing');
      if (!p.curator) err(path + '.curator', 'missing');
      if (!SPOTIFY_ID_RE.test(p.playlist_spotify_id || '')) err(path + '.playlist_spotify_id', 'not a Spotify id');
      if (!SPOTIFY_ID_RE.test(p.track_spotify_id || '')) err(path + '.track_spotify_id', 'not a Spotify id');
      if (!p.track) err(path + '.track', 'missing');
      if (!isFiniteInt(p.position) || p.position < 1) err(path + '.position', 'must be a positive integer');
      if (!isFiniteInt(p.of_total) || p.of_total < 1) err(path + '.of_total', 'must be a positive integer');
      if (isFiniteInt(p.position) && isFiniteInt(p.of_total) && p.position > p.of_total) {
        err(path + '.position', 'position ' + p.position + ' exceeds playlist size ' + p.of_total);
      }
      if (!ISO_RE.test(p.verified_at || '')) err(path + '.verified_at', 'must be ISO 8601 with timezone offset');
      else if (ageDays(p.verified_at, nowMs) > STALE_AFTER_DAYS && p.verification !== 'STALE') {
        err(path + '.verification', 'verified_at older than ' + STALE_AFTER_DAYS + ' days but verification is not STALE');
      }
      if (['VERIFIED', 'UNVERIFIED', 'STALE'].indexOf(p.verification) === -1) {
        err(path + '.verification', 'must be VERIFIED, UNVERIFIED, or STALE');
      }
      if (!/^https:\/\/open\.spotify\.com\/playlist\//.test(p.proof_url || '')) {
        err(path + '.proof_url', 'must be an open.spotify.com playlist URL');
      }
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /** Summary counts from real data only — no scoring, no estimates. Pure. */
  function summarize(data, opts) {
    var nowMs = (opts && opts.nowMs) || Date.now();
    var playlists = {};
    var tracks = {};
    var latest = null;
    var stale = 0;
    data.placements.forEach(function (p) {
      playlists[p.playlist_spotify_id] = p.playlist_name;
      tracks[p.track] = true;
      var t = Date.parse(p.verified_at);
      if (!isNaN(t) && (latest === null || t > latest)) latest = t;
      if (p.verification === 'STALE' || ageDays(p.verified_at, nowMs) > STALE_AFTER_DAYS) stale++;
    });
    return {
      playlistCount: Object.keys(playlists).length,
      trackPlacementCount: data.placements.length,
      trackCount: Object.keys(tracks).length,
      latestVerifiedAt: latest ? new Date(latest).toISOString() : null,
      staleCount: stale
    };
  }

  /** Group placement records by playlist. Pure. */
  function byPlaylist(data) {
    var groups = [];
    var index = {};
    data.placements.forEach(function (p) {
      var g = index[p.playlist_spotify_id];
      if (!g) {
        g = { playlist_spotify_id: p.playlist_spotify_id, playlist_name: p.playlist_name,
              curator: p.curator, followers: p.playlist_followers_snapshot,
              followersDate: p.followers_snapshot_date, size: p.playlist_size_snapshot,
              records: [] };
        index[p.playlist_spotify_id] = g;
        groups.push(g);
      }
      g.records.push(p);
    });
    groups.forEach(function (g) { g.records.sort(function (a, b) { return a.position - b.position; }); });
    return groups;
  }

  function chipClass(verification) {
    return verification === 'VERIFIED' ? 'chip-verified'
      : verification === 'STALE' ? 'chip-stale' : 'chip-unverified';
  }

  /** Render one playlist group card. HTML-escaped throughout. Pure. */
  function groupCard(g) {
    var rows = g.records.map(function (p) {
      var note = p.note ? '<p class="note">' + escapeHtml(p.note) + '</p>' : '';
      return '<li class="track-row">' +
        '<span class="pos">#' + p.position + '<small>/' + p.of_total + '</small></span>' +
        '<span class="track">' + escapeHtml(p.track) +
          '<a class="listen" href="https://open.spotify.com/track/' + escapeHtml(p.track_spotify_id) +
          '" target="_blank" rel="noopener">play ↗</a></span>' +
        '<span class="chip ' + chipClass(p.verification) + '">' + escapeHtml(p.verification) + '</span>' +
        '<span class="when" title="Position snapshot">' + escapeHtml(p.verified_at) + '</span>' +
        note + '</li>';
    }).join('');
    var followers = (typeof g.followers === 'number')
      ? '<span class="followers">' + g.followers.toLocaleString('en-US') + ' followers' +
        (g.followersDate ? ' <small>(snapshot ' + escapeHtml(g.followersDate) + ')</small>' : '') + '</span>'
      : '';
    return '<article class="card" id="pl-' + escapeHtml(g.playlist_spotify_id) + '">' +
      '<header><h2>' + escapeHtml(g.playlist_name) + '</h2>' +
      '<p class="curator">curated by ' + escapeHtml(g.curator) + ' ' + followers + '</p></header>' +
      '<iframe src="https://open.spotify.com/embed/playlist/' + escapeHtml(g.playlist_spotify_id) +
      '?utm_source=generator" width="100%" height="152" frameborder="0" ' +
      'allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>' +
      '<ul class="tracks">' + rows + '</ul>' +
      '<a class="proof" href="https://open.spotify.com/playlist/' + escapeHtml(g.playlist_spotify_id) +
      '" target="_blank" rel="noopener">Verify on Spotify ↗</a></article>';
  }

  /** Render the whole wall. Pure. */
  function render(data) {
    return byPlaylist(data).map(groupCard).join('\n');
  }

  /** Filter groups by Spotify playlist id (for ?playlist= deep links). Pure. */
  function filterByPlaylist(data, spotifyId) {
    if (!SPOTIFY_ID_RE.test(spotifyId || '')) return [];
    return byPlaylist(data).filter(function (g) { return g.playlist_spotify_id === spotifyId; });
  }

  return {
    VERSION: '1.0.0',
    SCHEMA: SCHEMA,
    STALE_AFTER_DAYS: STALE_AFTER_DAYS,
    escapeHtml: escapeHtml,
    validate: validate,
    summarize: summarize,
    byPlaylist: byPlaylist,
    groupCard: groupCard,
    render: render,
    filterByPlaylist: filterByPlaylist
  };
}));

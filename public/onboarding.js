/**
 * First-run onboarding overlay.
 *
 * Runs before the main app is usable and drives three server phases:
 *   seeding      -- repeatedly POST /api/onboarding/seed-step until done. The
 *                   server pages backwards through the inbox in small chunks,
 *                   so no single request can outlive a serverless timeout.
 *   categorizing -- POST /api/onboarding/suggest-categories once.
 *   reviewing    -- the user picks which suggested categories to keep, then
 *                   POST /api/onboarding/apply-categories.
 *
 * Kept in its own file, and deliberately free of any dependency on app.js
 * internals, so the overlay can appear before the main app has loaded data.
 */
(function () {
  'use strict';

  var POLL_BACKOFF_MS = 800;
  var MAX_CONSECUTIVE_ERRORS = 3;

  var state = {
    suggestions: [],
    selected: new Set(),
    consecutiveErrors: 0
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'style') { node.setAttribute('style', attrs[key]); }
      else if (key === 'className') { node.className = attrs[key]; }
      else if (key.indexOf('on') === 0) { node.addEventListener(key.slice(2), attrs[key]); }
      else { node.setAttribute(key, attrs[key]); }
    });
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function injectStyles() {
    if (document.getElementById('onboardingStyles')) return;
    var css = [
      '#onboardingOverlay{position:fixed;inset:0;z-index:100000;background:#fff;',
      'display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;}',
      '#onboardingCard{width:min(680px,92vw);max-height:88vh;overflow-y:auto;padding:36px 40px;}',
      '#onboardingCard h1{font-size:24px;margin:0 0 8px;color:#202124;font-weight:600;}',
      '#onboardingCard p.sub{font-size:14px;color:#5f6368;margin:0 0 28px;line-height:1.5;}',
      '.ob-bar{height:6px;border-radius:3px;background:#e8eaed;overflow:hidden;margin:24px 0 10px;}',
      '.ob-bar span{display:block;height:100%;background:#1a73e8;width:0;transition:width .35s ease;}',
      '.ob-count{font-size:13px;color:#5f6368;}',
      '.ob-sug{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid #dadce0;',
      'border-radius:8px;margin-bottom:8px;cursor:pointer;transition:border-color .15s,background .15s;}',
      '.ob-sug:hover{background:#f8f9fa;}',
      '.ob-sug.sel{border-color:#1a73e8;background:#e8f0fe;}',
      '.ob-sug input{margin-top:3px;flex:0 0 auto;}',
      '.ob-sug .name{font-size:15px;color:#202124;font-weight:500;}',
      '.ob-sug .meta{font-size:12px;color:#5f6368;margin-top:2px;}',
      '.ob-badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:11px;color:#fff;margin-left:8px;vertical-align:middle;}',
      '.ob-actions{display:flex;gap:12px;align-items:center;margin-top:28px;}',
      '.ob-btn{padding:10px 22px;border-radius:6px;border:none;font-size:14px;cursor:pointer;font-weight:500;}',
      '.ob-btn.primary{background:#1a73e8;color:#fff;}',
      '.ob-btn.primary:disabled{background:#c6dafc;cursor:default;}',
      '.ob-btn.ghost{background:transparent;color:#5f6368;}',
      '.ob-btn.ghost:hover{background:#f1f3f4;}',
      '.ob-err{background:#fce8e6;color:#c5221f;padding:12px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;}'
    ].join('');
    document.head.appendChild(el('style', { id: 'onboardingStyles' }, [css]));
  }

  function overlay() {
    var existing = document.getElementById('onboardingOverlay');
    if (existing) return existing.querySelector('#onboardingCard');
    injectStyles();
    var card = el('div', { id: 'onboardingCard' }, []);
    document.body.appendChild(el('div', { id: 'onboardingOverlay' }, [card]));
    return card;
  }

  function teardown() {
    var node = document.getElementById('onboardingOverlay');
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function renderProgress(seeded, target) {
    var pct = target > 0 ? Math.min(100, Math.round((seeded / target) * 100)) : 0;
    var card = overlay();
    card.innerHTML = '';
    card.appendChild(el('h1', {}, ['Setting up your inbox']));
    card.appendChild(el('p', { className: 'sub' }, [
      'We’re loading your recent mail so the app has real history to work with. ' +
      'This runs once and takes a minute or two — leave this tab open and it’ll finish on its own.'
    ]));
    var bar = el('div', { className: 'ob-bar' }, []);
    var fill = el('span', { style: 'width:' + pct + '%' }, []);
    bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(el('div', { className: 'ob-count' }, [seeded + ' of ' + target + ' emails loaded']));
  }

  function renderThinking(message) {
    var card = overlay();
    card.innerHTML = '';
    card.appendChild(el('h1', {}, ['Looking for patterns']));
    card.appendChild(el('p', { className: 'sub' }, [message]));
    var bar = el('div', { className: 'ob-bar' }, []);
    bar.appendChild(el('span', { style: 'width:100%;opacity:.45' }, []));
    card.appendChild(bar);
  }

  function renderError(message, onRetry) {
    var card = overlay();
    card.innerHTML = '';
    card.appendChild(el('h1', {}, ['Setup hit a snag']));
    card.appendChild(el('div', { className: 'ob-err' }, [message]));
    card.appendChild(el('p', { className: 'sub' }, [
      'Your mail is safe. You can retry, or skip setup and go straight to your inbox.'
    ]));
    card.appendChild(el('div', { className: 'ob-actions' }, [
      el('button', { className: 'ob-btn primary', onclick: onRetry }, ['Retry']),
      el('button', { className: 'ob-btn ghost', onclick: skip }, ['Skip setup'])
    ]));
  }

  function badgeFor(source) {
    var label = source === 'person' ? 'Person' : source === 'topic' ? 'Topic' : 'AI';
    var color = source === 'person' ? '#6f42c1' : source === 'topic' ? '#17a2b8' : '#4285f4';
    return el('span', { className: 'ob-badge', style: 'background:' + color }, [label]);
  }

  function renderReview() {
    var card = overlay();
    card.innerHTML = '';

    if (!state.suggestions.length) {
      card.appendChild(el('h1', {}, ['You’re all set']));
      card.appendChild(el('p', { className: 'sub' }, [
        'We didn’t find enough repeating patterns to suggest categories yet. As more mail arrives you can create categories any time.'
      ]));
      card.appendChild(el('div', { className: 'ob-actions' }, [
        el('button', { className: 'ob-btn primary', onclick: function () { apply([]); } }, ['Go to inbox'])
      ]));
      return;
    }

    card.appendChild(el('h1', {}, ['Suggested categories']));
    card.appendChild(el('p', { className: 'sub' }, [
      'Based on your mail, these groups came up repeatedly. Pick the ones worth keeping — everything you skip stays in "Other", and you can change all of this later.'
    ]));

    state.suggestions.forEach(function (suggestion, index) {
      var count = (suggestion.emailIds || []).length;
      var selected = state.selected.has(index);
      var checkbox = el('input', { type: 'checkbox' }, []);
      checkbox.checked = selected;

      var row = el('label', { className: 'ob-sug' + (selected ? ' sel' : '') }, [
        checkbox,
        el('div', {}, [
          el('div', { className: 'name' }, [suggestion.name || 'Untitled', badgeFor(suggestion.source)]),
          el('div', { className: 'meta' }, [count + (count === 1 ? ' email' : ' emails')])
        ])
      ]);
      row.addEventListener('click', function (event) {
        if (event.target !== checkbox) return;
        if (checkbox.checked) state.selected.add(index); else state.selected.delete(index);
        renderReview();
      });
      card.appendChild(row);
    });

    var confirm = el('button', { className: 'ob-btn primary' }, [
      state.selected.size ? 'Create ' + state.selected.size + ' ' + (state.selected.size === 1 ? 'category' : 'categories') : 'Create categories'
    ]);
    confirm.disabled = state.selected.size === 0;
    confirm.addEventListener('click', function () {
      var accepted = Array.from(state.selected).map(function (i) { return state.suggestions[i]; });
      apply(accepted);
    });

    card.appendChild(el('div', { className: 'ob-actions' }, [
      confirm,
      el('button', { className: 'ob-btn ghost', onclick: function () { apply([]); } }, ['Skip for now'])
    ]));
  }

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || data.success === false) {
          throw new Error(data.error || ('Request failed (' + response.status + ')'));
        }
        return data;
      });
    });
  }

  function finish() {
    teardown();
    // The main app loaded against an empty or partial inbox, so reload once to
    // pick up the seeded mail and the new categories.
    window.location.reload();
  }

  function skip() {
    postJson('/api/onboarding/skip').then(finish).catch(finish);
  }

  function apply(accepted) {
    renderThinking('Applying your categories…');
    postJson('/api/onboarding/apply-categories', { accepted: accepted })
      .then(finish)
      .catch(function (error) {
        renderError(error.message, function () { apply(accepted); });
      });
  }

  function runSeedLoop(seeded, target) {
    renderProgress(seeded, target);
    postJson('/api/onboarding/seed-step')
      .then(function (data) {
        state.consecutiveErrors = 0;
        renderProgress(data.seeded || 0, data.target || target);
        if (data.done) return runCategoryPhase();
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(runSeedLoop(data.seeded || 0, data.target || target)); }, POLL_BACKOFF_MS);
        });
      })
      .catch(function (error) {
        state.consecutiveErrors++;
        if (state.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          renderError(error.message, function () {
            state.consecutiveErrors = 0;
            runSeedLoop(seeded, target);
          });
          return;
        }
        setTimeout(function () { runSeedLoop(seeded, target); }, POLL_BACKOFF_MS * state.consecutiveErrors);
      });
  }

  function runCategoryPhase() {
    renderThinking('Reading through your mail to suggest categories…');
    return postJson('/api/onboarding/suggest-categories')
      .then(function (data) {
        state.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        // Pre-select everything: accepting the defaults is the common case.
        state.selected = new Set(state.suggestions.map(function (_, i) { return i; }));
        renderReview();
      })
      .catch(function (error) {
        renderError(error.message, runCategoryPhase);
      });
  }

  function start() {
    fetch('/api/onboarding/status')
      .then(function (response) {
        if (response.status === 401) return null; // not logged in; login gate handles it
        return response.json().catch(function () { return null; });
      })
      .then(function (data) {
        var onboarding = data && data.onboarding;
        if (!onboarding) return;
        switch (onboarding.status) {
          case 'seeding':
            return runSeedLoop(onboarding.seeded || 0, onboarding.target || 500);
          case 'categorizing':
            return runCategoryPhase();
          case 'reviewing':
            state.suggestions = Array.isArray(onboarding.suggestions) ? onboarding.suggestions : [];
            state.selected = new Set(state.suggestions.map(function (_, i) { return i; }));
            return renderReview();
          default:
            return; // 'done' or 'none' -- nothing to do
        }
      })
      .catch(function (error) {
        console.warn('Onboarding status check failed:', error);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

// Token Radar's dashboard (model radar-2). It reads window.RADAR, written beside
// dashboard/ by main.ts, and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs and the protocol's farm
// plan, and the method. No network: every byte it shows is in data.js.
//
// The farm plan is the same derivation main.ts writes to board.json: the
// protocol's category, chains, TVL and age decide the action, the capital
// and the hold, never a hand-written list of names.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  app.setAttribute('aria-busy', 'false');

  var state = { q: '', category: 'all', chain: 'all', watchlist: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var watchlistSet = {};
  DATA.rows.forEach(function (r) { watchlistSet[r.slug] = false; });
  // The watchlist slugs are the board rows the snapshot's watchlist names:
  // main.ts marks them in data.js through the board itself, so rebuild the
  // set from the first watchlist_size rows is wrong; instead the page asks
  // the data for them (see DATA.watchlist below, written by main.ts).
  (DATA.watchlist || []).forEach(function (s) { watchlistSet[s] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return 'x' + n.toFixed(2); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- The model, in one function: the page recomputes a row from the
  // snapshot figures and checks the number board.json carries, so the
  // page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var ageMult = m.age_floor + (Math.min(Math.max(age, 0), m.age_days) / m.age_days) * m.age_range;
    var breadthMult = 1 + Math.min(Math.max(row.chains.length - 1, 0), m.breadth_max_chains) * m.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * growthMult * ageMult * breadthMult));
  }

  // ---- The farm plan, the same derivation as lib/model.ts.
  function chainOf(row) { return row.chains.length > 0 ? row.chains[0] : 'its main chain'; }
  function capitalFor(row) {
    if (row.tvl_usd >= 5000000000) return 250;
    if (row.tvl_usd >= 1000000000) return 150;
    if (row.tvl_usd >= 100000000) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('swap') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('restak') >= 0) return 'Restake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token.';
    if (c.indexOf('staking') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the protocol\'s yield asset on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s basis strategy on ' + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Deposit $' + capital + ' into ' + name + '\'s main vault on ' + chain + ' and keep the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      return t.length > 600 ? t.slice(0, 596) + '...' : t;
    });
  }

  // ---- Filtering and sorting.
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchlist && !watchlistSet[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'change') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      return (av - bv) * dir || (a.rank - b.rank);
    });
    return rows;
  }

  // ---- The board table, refreshed in place so typing in the search box
  // never loses focus or scroll position.
  function updateBoardTable() {
    var host = document.getElementById('board-table');
    if (host) host.replaceChildren(renderBoard());
    var count = document.getElementById('board-count');
    if (count) count.textContent = filteredRows().length + ' shown';
  }

  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ▼' : ' ▲') : '';
    return el('button', { type: 'button', onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      updateBoardTable();
    } }, label + arrow);
  }

  // ---- Detail view for one protocol.
  function renderDetail(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null ? m.unknown_age_days : row.age_days;
    var ageMult = m.age_floor + (Math.min(Math.max(age, 0), m.age_days) / m.age_days) * m.age_range;
    var breadthMult = 1 + Math.min(Math.max(row.chains.length - 1, 0), m.breadth_max_chains) * m.breadth_per_chain;
    var recomputed = impliedOf(row);
    var box = el('section', { class: 'detail', id: 'detail' },
      el('button', { class: 'close', type: 'button', onclick: function () { state.selected = null; location.hash = ''; render(); } }, 'Close ×'),
      el('h2', {}, '#' + row.rank + ' ' + row.name),
      el('p', { class: 'meta' },
        (row.category || 'Uncategorised') + ' · ' + row.chains.join(', ') + ' · listed ' + (row.listed_at || 'unknown') +
        ' · ' + (watchlistSet[row.slug] ? 'on the watchlist' : 'below the watchlist floor') + ' · records no token'),
      el('p', { class: 'big' }, fmtUsd(row.implied_value_usd), el('small', {}, 'implied value if it launched a token today (model radar-2)')),
      el('h3', {}, 'How the value is built'),
      el('div', { class: 'modelgrid' },
        el('div', {}, el('b', {}, fmtUsd(row.tvl_usd)), el('span', {}, 'TVL, ' + fmtPct(row.change_7d) + ' over 7 days')),
        el('div', {}, el('b', {}, fmtMult(row.peer_multiple)), el('span', {}, 'peer multiple, ' + row.category + ' (' + row.peer_traders + ' trader' + (row.peer_traders === 1 ? '' : 's') + ')')),
        el('div', {}, el('b', {}, fmtMult(growthMult)), el('span', {}, 'growth, ' + fmtPct(growth) + ' clamped')),
        el('div', {}, el('b', {}, fmtMult(ageMult)), el('span', {}, 'age, ' + fmtAge(row.age_days) + ' with no token')),
        el('div', {}, el('b', {}, fmtMult(breadthMult)), el('span', {}, 'breadth, ' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's'))),
        el('div', {}, el('b', {}, fmtUsd(recomputed)), el('span', {}, 'recomputed in this page'))
      ),
      el('p', { class: 'formula' }, 'implied = TVL ' + fmtUsd(row.tvl_usd) + ' × peer ' + fmtMult(row.peer_multiple) + ' × growth ' + fmtMult(growthMult) + ' × age ' + fmtMult(ageMult) + ' × breadth ' + fmtMult(breadthMult) + ' = ' + fmtUsd(row.implied_value_usd)),
      el('h3', {}, 'Farm plan — six steps'),
      el('ol', { class: 'farm' }, farmSteps(row).map(function (s) { return el('li', {}, s); })),
      el('p', { class: 'meta' }, 'The plan is this entry\'s own claim, never a promise of a token or an airdrop. Values are as of ' + DATA.as_of + '.')
    );
    return box;
  }

  // ---- The board table.
  function renderBoard() {
    var rows = filteredRows();
    var table = el('table', { class: 'board' },
      el('caption', {}, 'Pre-token protocols ranked by implied value — ' + rows.length + ' of ' + DATA.rows.length + ' shown'),
      el('thead', {}, el('tr', {},
        el('th', {}, sortButton('Rank', 'implied')),
        el('th', {}, 'Protocol'),
        el('th', {}, 'Category'),
        el('th', {}, 'Chains'),
        el('th', { class: 'num' }, sortButton('TVL', 'tvl')),
        el('th', { class: 'num' }, sortButton('7d', 'change')),
        el('th', { class: 'num' }, sortButton('Age', 'age')),
        el('th', { class: 'num' }, 'Implied value')
      )),
      el('tbody', {}, rows.map(function (r) {
        var change = el('span', { class: r.change_7d !== null && r.change_7d > 0 ? 'pos' : (r.change_7d !== null && r.change_7d < 0 ? 'neg' : '') }, fmtPct(r.change_7d));
        return el('tr', { class: state.selected === r.slug ? 'selected' : '', onclick: function () { state.selected = r.slug; location.hash = '#/p/' + r.slug; render(); } },
          el('td', { class: 'rank' }, '#' + r.rank),
          el('td', {}, el('strong', {}, r.name),
            el('span', { class: 'sub' }, r.slug),
            watchlistSet[r.slug] ? el('span', { class: 'badge watch' }, 'watchlist') : null),
          el('td', {}, r.category || '—'),
          el('td', {}, r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')),
          el('td', { class: 'num' }, fmtUsd(r.tvl_usd)),
          el('td', { class: 'num' }, change),
          el('td', { class: 'num' }, fmtAge(r.age_days)),
          el('td', { class: 'num value' }, fmtUsd(r.implied_value_usd))
        );
      }))
    );
    if (rows.length === 0) table.appendChild(el('div', { class: 'empty' }, 'No protocols match this filter.'));
    return table;
  }

  function renderLive() {
    var table = el('table', { class: 'board' },
      el('caption', {}, 'Already trading — the market\'s own values, kept apart from the ranked board'),
      el('thead', {}, el('tr', {},
        el('th', {}, 'Protocol'), el('th', {}, 'Category'), el('th', {}, 'Chains'),
        el('th', { class: 'num' }, 'TVL'), el('th', { class: 'num' }, 'Market cap'), el('th', { class: 'num' }, '7d')
      )),
      el('tbody', {}, DATA.live.map(function (r) {
        return el('tr', {},
          el('td', {}, el('strong', {}, r.name), el('span', { class: 'sub' }, r.slug)),
          el('td', {}, r.category || '—'),
          el('td', {}, r.chains.slice(0, 3).join(', ')),
          el('td', { class: 'num' }, fmtUsd(r.tvl_usd)),
          el('td', { class: 'num value' }, fmtUsd(r.mcap_usd)),
          el('td', { class: 'num' }, fmtPct(r.change_7d))
        );
      }))
    );
    return table;
  }

  // ---- Method section: the model in words, with its peer table.
  function renderMethod() {
    var m = DATA.model;
    var peers = DATA.peers.slice().sort(function (a, b) { return b.multiple - a.multiple; });
    return el('section', { class: 'method' },
      el('h2', {}, 'How the radar scores'),
      el('p', {}, el('strong', {}, 'Peer multiple. '), 'For each category, the median market-cap/TVL of the protocols that already trade there, shrunk toward the global median (' + fmtMult(DATA.global_peer_median) + ') when the category has few traders. A category with no traders uses the global median. No protocol name is ever special-cased.'),
      el('p', {}, el('strong', {}, 'Formula. '), 'implied = TVL × peer multiple × growth × age × breadth. Growth is the 7-day TVL change clamped to ' + m.growth_floor + '%…+' + m.growth_cap + '% with weight ' + m.growth_weight + '. Age is 0.70 + 0.30 × min(age, ' + m.age_days + ' days) / ' + m.age_days + '; unknown age counts as ' + m.unknown_age_days + ' days. Breadth adds ' + (m.breadth_per_chain * 100) + '% per extra chain, up to ' + m.breadth_max_chains + '.'),
      el('p', {}, el('strong', {}, 'What it is not. '), 'The snapshot carries no ranking and no airdrop flag. A protocol that records no token may still have one its DefiLlama record does not carry, and the implied value is this entry\'s own claim, never a prediction that a token is issued or what it will be worth.'),
      el('table', { class: 'peers' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Category'), el('th', { class: 'num' }, 'Traders'), el('th', { class: 'num' }, 'Median mcap/TVL'), el('th', { class: 'num' }, 'Peer multiple'))),
        el('tbody', {}, peers.map(function (p) {
          return el('tr', {}, el('td', {}, p.category), el('td', { class: 'num' }, String(p.traders)), el('td', { class: 'num' }, fmtMult(p.median)), el('td', { class: 'num' }, fmtMult(p.multiple)));
        }))
      )
    );
  }

  function readHash() {
    var h = location.hash || '';
    var m = h.match(/^#\/p\/([A-Za-z0-9._-]+)$/);
    if (m) { state.selected = m[1]; return; }
    state.selected = null;
    if (h.indexOf('#/?') === 0) {
      var params = new URLSearchParams(h.slice(3));
      if (params.get('q')) state.q = params.get('q');
      if (params.get('category')) state.category = params.get('category');
      if (params.get('chain')) state.chain = params.get('chain');
      if (params.get('watchlist') === '1') state.watchlist = true;
      if (params.get('tab')) state.tab = params.get('tab');
    }
  }

  function render() {
    readHash();
    var wrap = el('div', { class: 'wrap' });
    var top = DATA.rows[0];
    wrap.appendChild(el('header', { class: 'hero' },
      el('h1', {}, 'Token ', el('span', { class: 'radar' }, 'Radar'), ' — pre-token protocols ranked by implied value'),
      el('p', { class: 'lede' }, 'The board finds protocols whose record carries no token yet and ranks them by what a launch would be worth, each with the steps to farm it. ',
        el('strong', {}, 'Rank #1: ' + (top ? top.name : '—') + ' at ' + fmtUsd(top ? top.implied_value_usd : 0) + '.'))
    ));
    var stats = el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('b', {}, String(DATA.board_size)), el('span', {}, 'protocols ranked')),
      el('div', { class: 'stat' }, el('b', {}, String(DATA.watchlist_size)), el('span', {}, 'on the watchlist')),
      el('div', { class: 'stat' }, el('b', {}, String(DATA.early_size)), el('span', {}, 'found below the floor')),
      el('div', { class: 'stat' }, el('b', {}, fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0)), el('span', {}, 'top implied value')),
      el('div', { class: 'stat' }, el('b', {}, fmtUsd(DATA.floor_usd)), el('span', {}, 'watchlist floor (TVL)'))
    );
    wrap.appendChild(stats);
    wrap.appendChild(el('p', { class: 'source' }, 'Snapshot as of ' + DATA.as_of + ' · ' + esc(DATA.source) + ' · model ' + DATA.model_version));
    wrap.appendChild(el('div', { class: 'tabs', role: 'tablist' },
      el('button', { type: 'button', role: 'tab', 'aria-selected': state.tab === 'pre-token' ? 'true' : 'false', onclick: function () { state.tab = 'pre-token'; render(); } }, 'Pre-token board (' + DATA.board_size + ')'),
      el('button', { type: 'button', role: 'tab', 'aria-selected': state.tab === 'live' ? 'true' : 'false', onclick: function () { state.tab = 'live'; render(); } }, 'Already trading (' + DATA.live_size + ')')
    ));
    if (state.tab === 'pre-token') {
      var categories = ['all'];
      DATA.rows.forEach(function (r) { var c = r.category || 'Uncategorised'; if (categories.indexOf(c) < 0) categories.push(c); });
      categories.sort();
      var chains = ['all'];
      DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); }); });
      chains.sort();
      var search = el('input', { type: 'search', placeholder: 'Search a protocol…', value: state.q, 'aria-label': 'Search protocols', oninput: function (e) { state.q = e.target.value; updateBoardTable(); } });
      var catSel = el('select', { 'aria-label': 'Filter by category', onchange: function (e) { state.category = e.target.value; updateBoardTable(); } },
        categories.map(function (c) { return el('option', { value: c, selected: state.category === c ? 'selected' : null }, c === 'all' ? 'All categories' : c); }));
      var chainSel = el('select', { 'aria-label': 'Filter by chain', onchange: function (e) { state.chain = e.target.value; updateBoardTable(); } },
        chains.map(function (c) { return el('option', { value: c, selected: state.chain === c ? 'selected' : null }, c === 'all' ? 'All chains' : c); }));
      var watchBox = el('label', { class: 'check' },
        el('input', { type: 'checkbox', checked: state.watchlist ? 'checked' : null, onchange: function (e) { state.watchlist = e.target.checked; updateBoardTable(); } }), ' Watchlist only');
      wrap.appendChild(el('div', { class: 'controls' }, search, catSel, chainSel, watchBox,
        el('span', { class: 'count', id: 'board-count' }, filteredRows().length + ' shown')));
      wrap.appendChild(el('div', { id: 'board-table' }, renderBoard()));
    } else {
      wrap.appendChild(renderLive());
    }
    var selected = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (selected) wrap.appendChild(renderDetail(selected));
    wrap.appendChild(renderMethod());
    wrap.appendChild(el('footer', {}, 'Implied values are this entry\'s own model claim (radar-2), computed from the sealed snapshot alone. Nothing here is a prediction that a token will be issued, or advice to farm any protocol.'));
    app.replaceChildren(wrap);
    if (selected) {
      var d = document.getElementById('detail');
      if (d) d.scrollIntoView({ block: 'start' });
    } else {
      window.scrollTo(0, 0);
    }
  }

  window.addEventListener('hashchange', render);
  render();
})();

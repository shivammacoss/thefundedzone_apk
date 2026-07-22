/*
 * The Funded Zone — mobile datafeed for the bundled TradingView Charting Library.
 *
 * Standalone port of the web datafeed (src/lib/charting/datafeed.ts):
 *   - Crypto history  → Binance public REST (real OHLCV)
 *   - Other symbols   → synthetic candles anchored to the REAL live price
 *                       (backend /bars is stale mock-era prices → would jump),
 *                       with /bars kept as a fallback.
 *   - Live updates    → polled from `${API}/instruments/{sym}/price`, built into
 *                       the streaming candle (seeded from the last history bar so
 *                       it connects with no far-right gap).
 *
 * Config comes from window.__TFZ_CONFIG__ (injected by the React Native host):
 *   { apiBase, token, symbol, theme }
 */
(function () {
  var CFG = window.__TFZ_CONFIG__ || {};
  var API = (CFG.apiBase || 'https://thefundedzone.com').replace(/\/$/, '');
  var TOKEN = CFG.token || '';

  function authHeaders() {
    return TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {};
  }

  /* ── Resolutions ── */
  var SUPPORTED_RESOLUTIONS = ['1', '5', '15', '30', '60', '240', '1D'];
  var RESOLUTION_TO_SECONDS = {
    '1': 60, '5': 300, '15': 900, '30': 1800,
    '60': 3600, '240': 14400, D: 86400, '1D': 86400,
  };

  /* ── Binance (crypto) ── */
  var BINANCE_PAIRS = {
    BTCUSD: 'BTCUSDT', ETHUSD: 'ETHUSDT', LTCUSD: 'LTCUSDT',
    XRPUSD: 'XRPUSDT', SOLUSD: 'SOLUSDT', BNBUSD: 'BNBUSDT',
    DOGEUSD: 'DOGEUSDT', ADAUSD: 'ADAUSDT', TRXUSD: 'TRXUSDT',
    LINKUSD: 'LINKUSDT', DOTUSD: 'DOTUSDT', AVAXUSD: 'AVAXUSDT',
  };
  var RESOLUTION_TO_BINANCE = {
    '1': '1m', '5': '5m', '15': '15m', '30': '30m',
    '60': '1h', '240': '4h', D: '1d', '1D': '1d',
  };
  var _binanceCache = {};

  function fetchBinanceKlines(symbol, resolution, from, to) {
    var pair = BINANCE_PAIRS[symbol.toUpperCase()];
    if (!pair) return Promise.resolve([]);
    var interval = RESOLUTION_TO_BINANCE[resolution] || '5m';
    var cacheKey = pair + ':' + interval;
    var cached = _binanceCache[cacheKey];
    if (cached && Date.now() - cached.ts < 60000) {
      return Promise.resolve(cached.bars.filter(function (b) {
        return b.time >= from * 1000 && b.time <= to * 1000;
      }));
    }
    var qs = 'symbol=' + pair + '&interval=' + interval +
      '&startTime=' + (from * 1000) + '&endTime=' + (to * 1000) + '&limit=1000';
    return fetch('https://api.binance.com/api/v3/klines?' + qs)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        var bars = (data || []).map(function (k) {
          return {
            time: Number(k[0]), open: Number(k[1]), high: Number(k[2]),
            low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
          };
        });
        _binanceCache[cacheKey] = { bars: bars, ts: Date.now() };
        return bars;
      })
      .catch(function () { return []; });
  }

  /* ── Synthetic candles (non-crypto) ── */
  function seededRand(seed) {
    var s = Math.abs(seed) % 2147483647;
    if (s === 0) s = 1;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  function getSymbolCategory(symbol) {
    var s = symbol.toUpperCase();
    if (s.indexOf('XAU') === 0 || s.indexOf('XAG') === 0) return 'metals';
    if (['USOIL', 'UKOIL', 'NGAS'].indexOf(s) >= 0) return 'commodities';
    if (['US30', 'US500', 'NAS100', 'UK100', 'GER40'].indexOf(s) >= 0) return 'indices';
    if (BINANCE_PAIRS[s]) return 'crypto';
    return 'forex';
  }
  function generateSyntheticBars(symbol, mid, spread, resolution, from, to) {
    if (mid <= 0) return [];
    var resSec = RESOLUTION_TO_SECONDS[resolution] || 300;
    var cat = getSymbolCategory(symbol);
    var volPct = 0.0003;
    if (cat === 'metals') volPct = 0.0004;
    if (cat === 'indices') volPct = 0.0005;
    if (cat === 'commodities') volPct = 0.0006;
    if (cat === 'crypto') volPct = 0.001;
    var resFactor = Math.sqrt(resSec / 300);
    var volatility = Math.max(spread * 1.5, mid * volPct * resFactor);
    var nowSec = Math.floor(Date.now() / 1000);
    var toSec = Math.min(to, nowSec);
    var fromAligned = Math.floor(from / resSec) * resSec;
    var toAligned = Math.floor(toSec / resSec) * resSec;
    if (fromAligned >= toAligned) return [];
    var count = Math.min(Math.floor((toAligned - fromAligned) / resSec) + 1, 500);
    var startSec = toAligned - (count - 1) * resSec;
    var seed = 0;
    for (var c = 0; c < symbol.length; c++) seed += symbol.charCodeAt(c);
    seed += Math.floor(startSec / 86400);
    var rand = seededRand(seed);
    var increments = [];
    for (var j = 0; j < count; j++) increments.push((rand() - 0.5) * volatility * 2);
    var cumSum = 0, cumSums = increments.map(function (inc) { cumSum += inc; return cumSum; });
    var lastCum = cumSums[cumSums.length - 1];
    var prices = cumSums.map(function (cc) { return mid + (cc - lastCum); });
    var bars = [];
    var prev = mid - (cumSums[0] - lastCum);
    for (var i = 0; i < count; i++) {
      var open = prev, close = prices[i];
      bars.push({
        time: (startSec + i * resSec) * 1000,
        open: open, close: close,
        high: Math.max(open, close) + Math.abs(rand() * volatility * 0.4),
        low: Math.min(open, close) - Math.abs(rand() * volatility * 0.4),
        volume: Math.floor(rand() * 500) + 50,
      });
      prev = close;
    }
    return bars;
  }

  /* ── Live price cache (polled) ── */
  var priceCache = {}; // sym -> { bid, ask, ts }
  var pricePollers = {}; // sym -> intervalId

  function fetchPrice(sym) {
    return fetch(API + '/api/v1/instruments/' + encodeURIComponent(sym) + '/price', { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && Number(d.bid) > 0) {
          priceCache[sym] = { bid: Number(d.bid), ask: Number(d.ask), ts: Date.now() };
          return priceCache[sym];
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function waitForPrice(sym) {
    var cached = priceCache[sym];
    if (cached && Date.now() - cached.ts < 5000) return Promise.resolve(cached);
    return fetchPrice(sym);
  }

  /* ── Config ── */
  var DF_CONFIG = {
    supported_resolutions: SUPPORTED_RESOLUTIONS,
    exchanges: [
      { value: '', name: 'All', desc: 'All exchanges' },
      { value: 'The Funded Zone', name: 'The Funded Zone', desc: 'The Funded Zone' },
    ],
    symbols_types: [
      { name: 'All', value: '' },
      { name: 'Forex', value: 'forex' },
      { name: 'Crypto', value: 'crypto' },
      { name: 'Index', value: 'index' },
      { name: 'Commodity', value: 'commodity' },
    ],
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
  };

  /* ── Instruments (for search + digits) ── */
  var instruments = [];
  function loadInstruments() {
    return fetch(API + '/api/v1/instruments', { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data && (data.items || data.value || data.instruments)) || [];
        if (list.length) instruments = list;
        return instruments;
      })
      .catch(function () { return instruments; });
  }
  loadInstruments();

  function segmentToSymbolType(segment) {
    switch ((segment || '').toLowerCase()) {
      case 'forex': return 'forex';
      case 'crypto': return 'crypto';
      case 'indices': case 'index': return 'index';
      case 'commodities': case 'commodity': return 'commodity';
      case 'stocks': case 'stock': return 'stock';
      default: return '';
    }
  }
  function defaultDigits(sym) {
    var cat = getSymbolCategory(sym);
    if (cat === 'crypto') return 2;
    if (cat === 'metals' || cat === 'indices' || cat === 'commodities') return 2;
    if (sym.toUpperCase().indexOf('JPY') >= 0) return 3;
    return 5;
  }

  /* ── Subscription state ── */
  var subscriptions = {}; // guid -> sub
  var lastHistoryBar = {}; // sym -> Bar

  /* ═══════════ DATAFEED ═══════════ */
  window.theFundedZoneDatafeed = {
    onReady: function (cb) { setTimeout(function () { cb(DF_CONFIG); }, 0); },

    searchSymbols: function (userInput, exchange, symbolType, onResult) {
      var q = (userInput || '').trim().toUpperCase();
      var result = instruments.filter(function (i) {
        if (symbolType && segmentToSymbolType(i.segment) !== symbolType) return false;
        if (!q) return true;
        return (i.symbol || '').toUpperCase().indexOf(q) >= 0 ||
          (i.display_name || '').toUpperCase().indexOf(q) >= 0;
      }).slice(0, 50).map(function (i) {
        return {
          symbol: i.symbol, full_name: i.symbol,
          description: i.display_name || i.symbol,
          exchange: 'The Funded Zone', ticker: i.symbol,
          type: segmentToSymbolType(i.segment) || 'forex',
        };
      });
      onResult(result);
    },

    resolveSymbol: function (symbolName, onResolve) {
      var sym = (symbolName.split(':').pop() || symbolName).toUpperCase();
      var inst = null;
      for (var k = 0; k < instruments.length; k++) {
        if ((instruments[k].symbol || '').toUpperCase() === sym) { inst = instruments[k]; break; }
      }
      var digits = (inst && inst.digits != null) ? inst.digits : defaultDigits(sym);
      var info = {
        ticker: sym, name: sym,
        description: (inst && inst.display_name) || sym,
        type: segmentToSymbolType(inst && inst.segment) || 'forex',
        session: '24x7', timezone: 'Etc/UTC',
        exchange: 'The Funded Zone', listed_exchange: 'The Funded Zone',
        format: 'price', pricescale: Math.pow(10, digits), minmov: 1,
        has_intraday: true, has_daily: true, has_weekly_and_monthly: false,
        supported_resolutions: SUPPORTED_RESOLUTIONS,
        volume_precision: 2, data_status: 'streaming',
      };
      setTimeout(function () { onResolve(info); }, 0);
    },

    getBars: function (symbolInfo, resolution, periodParams, onResult, onError) {
      var sym = (symbolInfo.ticker || symbolInfo.name).toUpperCase();
      var from = periodParams.from, to = periodParams.to;
      var res = String(resolution);

      function finish(bars) {
        if (bars && bars.length > 0) {
          lastHistoryBar[sym] = bars[bars.length - 1];
          onResult(bars, { noData: false });
          return true;
        }
        return false;
      }

      // 1. Crypto → Binance
      var chain = Promise.resolve(false);
      if (BINANCE_PAIRS[sym]) {
        chain = fetchBinanceKlines(sym, res, from, to).then(function (bars) { return finish(bars); });
      }

      // 2. Non-crypto → synthetic anchored to live price
      chain = chain.then(function (done) {
        if (done) return true;
        return waitForPrice(sym).then(function (tick) {
          if (tick && tick.bid > 0) {
            var mid = (tick.bid + tick.ask) / 2;
            var spread = Math.abs(tick.ask - tick.bid);
            return finish(generateSyntheticBars(sym, mid, spread, res, from, to));
          }
          return false;
        });
      });

      // 3. Fallback → backend /bars
      chain = chain.then(function (done) {
        if (done) return true;
        var qs = 'resolution=' + res + '&from=' + from + '&to=' + to;
        return fetch(API + '/api/v1/instruments/' + encodeURIComponent(sym) + '/bars?' + qs, { headers: authHeaders() })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            var raw = (data && data.bars) || [];
            if (!raw.length) return false;
            var bars = raw.map(function (b) {
              return { time: b.time * 1000, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
            }).sort(function (a, b) { return a.time - b.time; });
            return finish(bars);
          })
          .catch(function () { return false; });
      });

      chain.then(function (done) {
        if (!done) onResult([], { noData: true });
      }).catch(function (err) { onError((err && err.message) || 'getBars failed'); });
    },

    subscribeBars: function (symbolInfo, resolution, onTick, listenerGuid) {
      var sym = (symbolInfo.ticker || symbolInfo.name).toUpperCase();
      var barSec = RESOLUTION_TO_SECONDS[String(resolution)] || 300;

      function pushTick(bid, ask) {
        var sub = subscriptions[listenerGuid];
        if (!sub) return;
        var mid = (Number(bid) + Number(ask)) / 2;
        if (!isFinite(mid)) return;
        var nowSec = Math.floor(Date.now() / 1000);
        var barStartMs = Math.floor(nowSec / barSec) * barSec * 1000;
        var last = sub.lastBar, next;
        if (last && last.time === barStartMs) {
          next = {
            time: last.time, open: last.open,
            high: Math.max(last.high, mid), low: Math.min(last.low, mid),
            close: mid, volume: (last.volume || 0) + 1,
          };
        } else {
          if (last && barStartMs > last.time) {
            var barMs = barSec * 1000;
            var missing = Math.round((barStartMs - last.time) / barMs) - 1;
            if (missing > 0 && missing <= 500) {
              var pc = last.close;
              for (var i = 1; i <= missing; i++) {
                var fill = { time: last.time + i * barMs, open: pc, high: pc, low: pc, close: pc, volume: 0 };
                sub.lastBar = fill; sub.onTick(fill);
              }
            }
          }
          var openPx = (sub.lastBar && sub.lastBar.close) || mid;
          next = { time: barStartMs, open: openPx, high: Math.max(openPx, mid), low: Math.min(openPx, mid), close: mid, volume: 1 };
        }
        sub.lastBar = next;
        sub.onTick(next);
      }

      var poll = setInterval(function () {
        fetchPrice(sym).then(function (t) { if (t) pushTick(t.bid, t.ask); });
      }, 1000);
      // Crypto: also seed live from Binance mini-ticker quickly on first poll
      fetchPrice(sym).then(function (t) { if (t) pushTick(t.bid, t.ask); });

      subscriptions[listenerGuid] = {
        symbol: sym, resolution: String(resolution), onTick: onTick,
        lastBar: lastHistoryBar[sym], poll: poll,
      };
    },

    unsubscribeBars: function (listenerGuid) {
      var sub = subscriptions[listenerGuid];
      if (sub) { clearInterval(sub.poll); delete subscriptions[listenerGuid]; }
    },
  };

  // Expose the live price fetcher for the order-line layer.
  window.__tfzFetchPrice = fetchPrice;
  window.__tfzPriceCache = priceCache;
})();

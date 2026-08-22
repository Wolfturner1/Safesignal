const fs = require("fs");

const STATE_FILE = "paper-state.json";

const API_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.com/api/v3"
];

const FEE = 0.001;
const SLIPPAGE = 0.0005;
const RISK = 0.005;

const STOP_ATR = 1.8;
const TARGET_ATR = 4.5;
const MIN_EXPANSION = 1.30;
const MIN_MOMENTUM = 0.70;

const CONFIGS = [
  {
    key: "ETH",
    symbol: "ETHUSDT",
    interval: "4h"
  },
  {
    key: "SOL",
    symbol: "SOLUSDT",
    interval: "1h"
  },
  {
    key: "BTC",
    symbol: "BTCUSDT",
    interval: "4h"
  }
];


function newState() {
  const now = new Date().toISOString();

  return {
    version: "V11.2",
    created: now,
    updated: now,
    open: [],
    closed: [],
    seenSignals: {},
    markets: {}
  };
}


function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return newState();
    }

    const raw = fs.readFileSync(
      STATE_FILE,
      "utf8"
    );

    const state = JSON.parse(raw);

    if (!Array.isArray(state.open)) {
      state.open = [];
    }

    if (!Array.isArray(state.closed)) {
      state.closed = [];
    }

    if (
      !state.seenSignals ||
      typeof state.seenSignals !== "object"
    ) {
      state.seenSignals = {};
    }

    if (
      !state.markets ||
      typeof state.markets !== "object"
    ) {
      state.markets = {};
    }

    state.version = "V11.2";

    return state;

  } catch (error) {
    console.error(
      "paper-state.json konnte nicht gelesen werden:",
      error.message
    );

    return newState();
  }
}


function saveState(state) {
  state.updated = new Date().toISOString();

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      state,
      null,
      2
    )
  );
}


function ema(values, period) {
  const result =
    new Array(values.length).fill(null);

  if (values.length < period) {
    return result;
  }

  let current = 0;

  for (
    let i = 0;
    i < period;
    i++
  ) {
    current += values[i];
  }

  current /= period;

  result[period - 1] =
    current;

  const multiplier =
    2 / (period + 1);

  for (
    let i = period;
    i < values.length;
    i++
  ) {
    current =
      values[i] * multiplier
      +
      current * (1 - multiplier);

    result[i] =
      current;
  }

  return result;
}


function atr(
  high,
  low,
  close,
  period = 14
) {
  const result =
    new Array(close.length).fill(null);

  const trueRange =
    new Array(close.length).fill(null);

  for (
    let i = 1;
    i < close.length;
    i++
  ) {
    trueRange[i] =
      Math.max(
        high[i] - low[i],
        Math.abs(
          high[i] - close[i - 1]
        ),
        Math.abs(
          low[i] - close[i - 1]
        )
      );
  }

  if (
    close.length <= period
  ) {
    return result;
  }

  let current = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {
    current += trueRange[i];
  }

  current /= period;

  result[period] =
    current;

  for (
    let i = period + 1;
    i < close.length;
    i++
  ) {
    current =
      (
        current * (period - 1)
        +
        trueRange[i]
      )
      /
      period;

    result[i] =
      current;
  }

  return result;
}


function indicators(data) {
  const open =
    data.map(
      row => Number(row[1])
    );

  const high =
    data.map(
      row => Number(row[2])
    );

  const low =
    data.map(
      row => Number(row[3])
    );

  const close =
    data.map(
      row => Number(row[4])
    );

  const openTime =
    data.map(
      row => Number(row[0])
    );

  const closeTime =
    data.map(
      row => Number(row[6])
    );

  return {
    open,
    high,
    low,
    close,
    openTime,
    closeTime,
    ema50: ema(close, 50),
    ema200: ema(close, 200),
    ATR: atr(
      high,
      low,
      close,
      14
    )
  };
}


async function fetchWithTimeout(
  url,
  timeoutMs = 15000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          headers: {
            "Accept":
              "application/json",

            "User-Agent":
              "SafeSignal-V11.2"
          }
        }
      );

    return response;

  } finally {
    clearTimeout(timer);
  }
}


async function loadCandles(
  symbol,
  interval,
  limit = 500
) {
  const errors = [];

  for (
    const endpoint
    of API_ENDPOINTS
  ) {
    const url =
      endpoint
      +
      "/klines?symbol="
      +
      encodeURIComponent(symbol)
      +
      "&interval="
      +
      encodeURIComponent(interval)
      +
      "&limit="
      +
      limit;

    try {
      console.log(
        "Versuche Marktdaten:",
        endpoint,
        symbol,
        interval
      );

      const response =
        await fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(
          "HTTP "
          +
          response.status
          +
          " "
          +
          response.statusText
        );
      }

      const data =
        await response.json();

      if (!Array.isArray(data)) {
        throw new Error(
          "Antwort ist kein Kerzen-Array."
        );
      }

      if (data.length < 250) {
        throw new Error(
          "Nur "
          +
          data.length
          +
          " Kerzen erhalten."
        );
      }

      console.log(
        "Marktdaten erfolgreich:",
        symbol,
        interval,
        data.length,
        "Kerzen"
      );

      return data;

    } catch (error) {
      const message =
        endpoint
        +
        ": "
        +
        error.message;

      errors.push(message);

      console.error(
        "Datenquelle fehlgeschlagen:",
        message
      );
    }
  }

  throw new Error(
    "Alle Binance-Datenquellen fehlgeschlagen. "
    +
    errors.join(" | ")
  );
}


function volatilityAnalysis(
  index,
  ind
) {
  if (index < 220) {
    return {
      signal: null,
      reason:
        "Noch nicht genügend Kerzen.",
      expansion: null,
      moveRatio: null
    };
  }

  const price =
    ind.close[index];

  const A =
    ind.ATR[index];

  const ema50 =
    ind.ema50[index];

  const ema200 =
    ind.ema200[index];

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(A) ||
    !Number.isFinite(ema50) ||
    !Number.isFinite(ema200)
  ) {
    return {
      signal: null,
      reason:
        "Indikatoren nicht vollständig.",
      expansion: null,
      moveRatio: null
    };
  }

  const atrPct =
    A / price;

  let avgATR = 0;

  for (
    let i = index - 20;
    i < index;
    i++
  ) {
    if (
      !Number.isFinite(
        ind.ATR[i]
      )
    ) {
      return {
        signal: null,
        reason:
          "ATR-Durchschnitt fehlt.",
        expansion: null,
        moveRatio: null
      };
    }

    avgATR +=
      ind.ATR[i]
      /
      ind.close[i];
  }

  avgATR /= 20;

  const expansion =
    avgATR > 0
      ?
      atrPct / avgATR
      :
      0;

  const candleMove =
    Math.abs(
      ind.close[index]
      -
      ind.open[index]
    )
    /
    ind.open[index];

  const moveRatio =
    atrPct > 0
      ?
      candleMove / atrPct
      :
      0;

  const bullishTrend =
    price > ema50
    &&
    ema50 > ema200;

  const bearishTrend =
    price < ema50
    &&
    ema50 < ema200;

  const bullishCandle =
    ind.close[index]
    >
    ind.open[index];

  const bearishCandle =
    ind.close[index]
    <
    ind.open[index];

  if (
    expansion <
    MIN_EXPANSION
  ) {
    return {
      signal: null,

      reason:
        "ATR Expansion "
        +
        expansion.toFixed(2)
        +
        "x < "
        +
        MIN_EXPANSION.toFixed(2)
        +
        "x",

      expansion,
      moveRatio
    };
  }

  if (
    moveRatio <
    MIN_MOMENTUM
  ) {
    return {
      signal: null,

      reason:
        "Kerzen-Momentum "
        +
        moveRatio.toFixed(2)
        +
        "x ATR < "
        +
        MIN_MOMENTUM.toFixed(2)
        +
        "x",

      expansion,
      moveRatio
    };
  }

  if (
    bullishCandle &&
    !bullishTrend
  ) {
    return {
      signal: null,

      reason:
        "Bullische Expansion ohne gültigen EMA-Trend.",

      expansion,
      moveRatio
    };
  }

  if (
    bearishCandle &&
    !bearishTrend
  ) {
    return {
      signal: null,

      reason:
        "Bärische Expansion ohne gültigen EMA-Trend.",

      expansion,
      moveRatio
    };
  }

  if (
    bullishCandle &&
    bullishTrend
  ) {
    return {
      signal: {
        type: "LONG",
        atr: A
      },

      reason:
        "LONG-Setup erfüllt.",

      expansion,
      moveRatio
    };
  }

  if (
    bearishCandle &&
    bearishTrend
  ) {
    return {
      signal: {
        type: "SHORT",
        atr: A
      },

      reason:
        "SHORT-Setup erfüllt.",

      expansion,
      moveRatio
    };
  }

  return {
    signal: null,
    reason:
      "Keine eindeutige Richtung.",
    expansion,
    moveRatio
  };
}


function entryWithSlip(
  price,
  type
) {
  if (type === "LONG") {
    return (
      price *
      (1 + SLIPPAGE)
    );
  }

  return (
    price *
    (1 - SLIPPAGE)
  );
}


function exitWithSlip(
  price,
  type
) {
  if (type === "LONG") {
    return (
      price *
      (1 - SLIPPAGE)
    );
  }

  return (
    price *
    (1 + SLIPPAGE)
  );
}


function createTrade(
  config,
  signal,
  entryRaw,
  signalTime,
  entryTime
) {
  const entry =
    entryWithSlip(
      entryRaw,
      signal.type
    );

  let stop;
  let target;

  if (
    signal.type === "LONG"
  ) {
    stop =
      entry
      -
      STOP_ATR * signal.atr;

    target =
      entry
      +
      TARGET_ATR * signal.atr;

  } else {
    stop =
      entry
      +
      STOP_ATR * signal.atr;

    target =
      entry
      -
      TARGET_ATR * signal.atr;
  }

  const stopPct =
    Math.abs(
      entry - stop
    )
    /
    entry;

  let fraction =
    RISK / stopPct;

  if (
    !Number.isFinite(fraction)
    ||
    fraction <= 0
  ) {
    fraction = 0;
  }

  fraction =
    Math.min(
      fraction,
      1
    );

  return {
    id:
      config.symbol
      +
      "-"
      +
      config.interval
      +
      "-"
      +
      signalTime,

    symbol:
      config.symbol,

    interval:
      config.interval,

    type:
      signal.type,

    signalTime,

    entryTime,

    entry,

    stop,

    target,

    fraction,

    risk:
      RISK,

    stopATR:
      STOP_ATR,

    targetATR:
      TARGET_ATR
  };
}


function processTrade(
  trade,
  candles
) {
  for (
    const candle
    of candles
  ) {
    const openTime =
      Number(candle[0]);

    if (
      openTime <
      trade.entryTime
    ) {
      continue;
    }

    const high =
      Number(candle[2]);

    const low =
      Number(candle[3]);

    let rawExit = null;
    let reason = null;

    if (
      trade.type === "LONG"
    ) {
      const stopHit =
        low <= trade.stop;

      const targetHit =
        high >= trade.target;

      /*
      Falls Stop und Ziel in derselben
      Kerze liegen, rechnen wir
      konservativ: Stop zuerst.
      */

      if (stopHit) {
        rawExit =
          trade.stop;

        reason =
          "Stop-Loss";

      } else if (targetHit) {
        rawExit =
          trade.target;

        reason =
          "Take-Profit";
      }

    } else {
      const stopHit =
        high >= trade.stop;

      const targetHit =
        low <= trade.target;

      if (stopHit) {
        rawExit =
          trade.stop;

        reason =
          "Stop-Loss";

      } else if (targetHit) {
        rawExit =
          trade.target;

        reason =
          "Take-Profit";
      }
    }

    if (
      rawExit !== null
    ) {
      const exit =
        exitWithSlip(
          rawExit,
          trade.type
        );

      let marketReturn;

      if (
        trade.type === "LONG"
      ) {
        marketReturn =
          (
            exit -
            trade.entry
          )
          /
          trade.entry;

      } else {
        marketReturn =
          (
            trade.entry -
            exit
          )
          /
          trade.entry;
      }

      const feeCost =
        FEE
        *
        2
        *
        trade.fraction;

      const result =
        marketReturn
        *
        trade.fraction
        -
        feeCost;

      return {
        closed: true,

        record: {
          ...trade,

          exit,

          exitTime:
            Number(candle[6]),

          reason,

          marketReturn,

          feeCost,

          return:
            result
        }
      };
    }
  }

  return {
    closed: false
  };
}


async function processMarket(
  config,
  state
) {
  console.log("");
  console.log(
    "--------------------------------"
  );

  console.log(
    "Prüfe",
    config.symbol,
    config.interval
  );

  const data =
    await loadCandles(
      config.symbol,
      config.interval,
      500
    );

  const ind =
    indicators(data);

  /*
  Die letzte Binance-Kerze kann noch
  offen sein.

  Deshalb verwenden wir nur die
  vorletzte Kerze für neue Signale.
  */

  const signalIndex =
    data.length - 2;

  const analysis =
    volatilityAnalysis(
      signalIndex,
      ind
    );

  const signal =
    analysis.signal;

  const signalTime =
    ind.closeTime[
      signalIndex
    ];

  state.markets[
    config.key
  ] = {
    symbol:
      config.symbol,

    interval:
      config.interval,

    checkedAt:
      Date.now(),

    checkedAtISO:
      new Date().toISOString(),

    candleClose:
      signalTime,

    candleCloseISO:
      new Date(
        signalTime
      ).toISOString(),

    lastPrice:
      ind.close[
        signalIndex
      ],

    signal:
      signal
        ?
        signal.type
        :
        "WAIT",

    reason:
      analysis.reason,

    expansion:
      analysis.expansion ?? null,

    momentum:
      analysis.moveRatio ?? null,

    ema50:
      ind.ema50[
        signalIndex
      ],

    ema200:
      ind.ema200[
        signalIndex
      ],

    atr:
      ind.ATR[
        signalIndex
      ],

    dataStatus:
      "OK"
  };

  console.log(
    config.symbol,
    "Signal:",
    state.markets[
      config.key
    ].signal
  );

  console.log(
    config.symbol,
    "Grund:",
    analysis.reason
  );


  /*
  Bereits offene Trades für
  diesen Markt prüfen.
  */

  const existing =
    state.open.filter(
      trade =>
        trade.symbol ===
        config.symbol
        &&
        trade.interval ===
        config.interval
    );

  for (
    const trade
    of existing
  ) {
    const result =
      processTrade(
        trade,
        data
      );

    if (
      result.closed
    ) {
      state.open =
        state.open.filter(
          item =>
            item.id !==
            trade.id
        );

      state.closed.push(
        result.record
      );

      console.log(
        "Paper-Trade geschlossen:",
        trade.symbol,
        trade.type,
        result.record.reason,
        (
          result.record.return
          *
          100
        ).toFixed(2)
        +
        "%"
      );
    }
  }


  /*
  Kein neues Signal:
  hier endet die Prüfung.
  */

  if (!signal) {
    return;
  }


  /*
  Jede Signalkerze nur
  einmal verwenden.
  */

  const signalId =
    config.symbol
    +
    "-"
    +
    config.interval
    +
    "-"
    +
    signalTime;

  if (
    state.seenSignals[
      signalId
    ]
  ) {
    console.log(
      "Signal wurde bereits verarbeitet."
    );

    return;
  }


  /*
  Pro Markt maximal
  ein offener Paper-Trade.
  */

  const alreadyOpen =
    state.open.some(
      trade =>
        trade.symbol ===
        config.symbol
        &&
        trade.interval ===
        config.interval
    );

  if (alreadyOpen) {
    console.log(
      "Bereits offener Paper-Trade vorhanden."
    );

    return;
  }


  const entryIndex =
    signalIndex + 1;

  if (
    entryIndex >=
    data.length
  ) {
    console.log(
      "Noch keine nächste Kerze für Einstieg vorhanden."
    );

    return;
  }


  /*
  Signal erst jetzt als verarbeitet
  markieren, damit kein Signal
  verloren geht, wenn keine
  Einstiegskerze verfügbar ist.
  */

  state.seenSignals[
    signalId
  ] = true;


  const trade =
    createTrade(
      config,
      signal,
      ind.open[
        entryIndex
      ],
      signalTime,
      ind.openTime[
        entryIndex
      ]
    );

  if (
    trade.fraction <= 0
  ) {
    throw new Error(
      "Ungültige Positionsgröße für "
      +
      config.symbol
    );
  }

  state.open.push(
    trade
  );

  console.log(
    "Neuer Paper-Trade:",
    trade.symbol,
    trade.type
  );

  console.log(
    "Entry:",
    trade.entry
  );

  console.log(
    "Stop:",
    trade.stop
  );

  console.log(
    "Ziel:",
    trade.target
  );
}


async function main() {
  console.log(
    "SafeSignal V11.2 gestartet"
  );

  console.log(
    "Nur Paper-Trading."
  );

  console.log(
    "Keine echten Orders."
  );

  const state =
    loadState();

  let successfulMarkets = 0;
  let failedMarkets = 0;

  for (
    const config
    of CONFIGS
  ) {
    try {
      await processMarket(
        config,
        state
      );

      successfulMarkets++;

    } catch (error) {
      failedMarkets++;

      console.error("");
      console.error(
        "FEHLER:",
        config.symbol,
        config.interval
      );

      console.error(
        error.message
      );

      /*
      Fehler ebenfalls speichern,
      damit man im JSON sieht,
      warum ein Markt fehlt.
      */

      state.markets[
        config.key
      ] = {
        symbol:
          config.symbol,

        interval:
          config.interval,

        checkedAt:
          Date.now(),

        checkedAtISO:
          new Date().toISOString(),

        signal:
          "ERROR",

        reason:
          error.message,

        dataStatus:
          "ERROR"
      };
    }
  }

  saveState(state);

  console.log("");
  console.log(
    "================================"
  );

  console.log(
    "SafeSignal V11.2 fertig"
  );

  console.log(
    "Erfolgreiche Märkte:",
    successfulMarkets
  );

  console.log(
    "Fehlgeschlagene Märkte:",
    failedMarkets
  );

  console.log(
    "Offene Paper-Trades:",
    state.open.length
  );

  console.log(
    "Geschlossene Paper-Trades:",
    state.closed.length
  );

  /*
  WICHTIG:
  Kein falsches grünes GitHub-Success,
  wenn sämtliche Datenquellen
  ausgefallen sind.
  */

  if (
    successfulMarkets === 0
  ) {
    throw new Error(
      "Kein einziger Markt konnte geladen werden. Workflow wird absichtlich als Fehler beendet."
    );
  }

  if (
    successfulMarkets <
    CONFIGS.length
  ) {
    console.warn(
      "WARNUNG: Nicht alle Märkte konnten geladen werden."
    );
  }
}


main().catch(
  error => {
    console.error("");
    console.error(
      "SafeSignal V11.2 fehlgeschlagen:"
    );

    console.error(
      error.message
    );

    process.exit(1);
  }
);

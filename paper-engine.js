const fs = require("fs");

const API = "https://api.binance.com/api/v3";

const FEE = 0.001;
const SLIPPAGE = 0.0005;
const RISK = 0.005;

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

const STATE_FILE = "paper-state.json";


function newState() {
  return {
    version: "V11.1",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    open: [],
    closed: [],
    seenSignals: {},
    markets: {}
  };
}


function loadState() {

  try {

    if (fs.existsSync(STATE_FILE)) {

      const raw =
        fs.readFileSync(
          STATE_FILE,
          "utf8"
        );

      return JSON.parse(raw);

    }

  } catch (e) {

    console.log(
      "State konnte nicht gelesen werden:",
      e.message
    );

  }

  return newState();

}


function saveState(state) {

  state.updated =
    new Date().toISOString();

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
    Array(values.length).fill(null);

  if (values.length < period)
    return result;

  let current =

    values
      .slice(0, period)
      .reduce(
        (a, b) => a + b,
        0
      )
    /
    period;

  result[period - 1] =
    current;

  const k =
    2 / (period + 1);

  for (
    let i = period;
    i < values.length;
    i++
  ) {

    current =
      values[i] * k
      +
      current * (1 - k);

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
    Array(close.length).fill(null);

  const tr =
    Array(close.length).fill(null);

  for (
    let i = 1;
    i < close.length;
    i++
  ) {

    tr[i] =
      Math.max(

        high[i] - low[i],

        Math.abs(
          high[i] -
          close[i - 1]
        ),

        Math.abs(
          low[i] -
          close[i - 1]
        )

      );

  }

  let current = 0;

  for (
    let i = 1;
    i <= period;
    i++
  ) {

    current += tr[i];

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
        tr[i]
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
      x => Number(x[1])
    );

  const high =
    data.map(
      x => Number(x[2])
    );

  const low =
    data.map(
      x => Number(x[3])
    );

  const close =
    data.map(
      x => Number(x[4])
    );

  const openTime =
    data.map(
      x => Number(x[0])
    );

  const closeTime =
    data.map(
      x => Number(x[6])
    );

  return {

    open,
    high,
    low,
    close,
    openTime,
    closeTime,

    ema50:
      ema(close, 50),

    ema200:
      ema(close, 200),

    ATR:
      atr(
        high,
        low,
        close
      )

  };

}


async function loadCandles(
  symbol,
  interval,
  limit = 500
) {

  const url =

    API
    +
    "/klines?symbol="
    +
    symbol
    +
    "&interval="
    +
    interval
    +
    "&limit="
    +
    limit;

  const response =
    await fetch(url);

  if (!response.ok) {

    throw new Error(
      symbol +
      " konnte nicht geladen werden."
    );

  }

  return await response.json();

}


function volatilityAnalysis(
  i,
  ind
) {

  if (i < 220) {

    return {
      signal: null,
      reason:
        "Noch nicht genügend Kerzen."
    };

  }

  const price =
    ind.close[i];

  const A =
    ind.ATR[i];

  const e50 =
    ind.ema50[i];

  const e200 =
    ind.ema200[i];

  if (
    A === null ||
    e50 === null ||
    e200 === null
  ) {

    return {
      signal: null,
      reason:
        "Indikatoren nicht vollständig."
    };

  }

  const atrPct =
    A / price;

  let avgATR = 0;

  for (
    let x = i - 20;
    x < i;
    x++
  ) {

    if (
      ind.ATR[x] === null
    ) {

      return {
        signal: null,
        reason:
          "ATR-Durchschnitt fehlt."
      };

    }

    avgATR +=

      ind.ATR[x]
      /
      ind.close[x];

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
      ind.close[i] -
      ind.open[i]
    )
    /
    ind.open[i];

  const moveRatio =

    atrPct > 0
      ?
      candleMove / atrPct
      :
      0;

  const bullishTrend =

    price > e50
    &&
    e50 > e200;

  const bearishTrend =

    price < e50
    &&
    e50 < e200;

  const bullishCandle =

    ind.close[i]
    >
    ind.open[i];

  const bearishCandle =

    ind.close[i]
    <
    ind.open[i];


  if (
    expansion < 1.30
  ) {

    return {

      signal: null,

      reason:

        "ATR Expansion "
        +
        expansion.toFixed(2)
        +
        "x < 1.30x",

      expansion,
      moveRatio

    };

  }


  if (
    moveRatio < 0.70
  ) {

    return {

      signal: null,

      reason:

        "Kerzen-Momentum "
        +
        moveRatio.toFixed(2)
        +
        "x ATR < 0.70x",

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

  return type === "LONG"

    ?
    price * (1 + SLIPPAGE)

    :
    price * (1 - SLIPPAGE);

}


function exitWithSlip(
  price,
  type
) {

  return type === "LONG"

    ?
    price * (1 - SLIPPAGE)

    :
    price * (1 + SLIPPAGE);

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
      entry -
      1.8 * signal.atr;

    target =
      entry +
      4.5 * signal.atr;

  } else {

    stop =
      entry +
      1.8 * signal.atr;

    target =
      entry -
      4.5 * signal.atr;

  }

  const stopPct =

    Math.abs(
      entry - stop
    )
    /
    entry;

  let fraction =

    RISK /
    stopPct;

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

    fraction

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
    )
      continue;

    const high =
      Number(candle[2]);

    const low =
      Number(candle[3]);

    let rawExit = null;
    let reason = null;


    if (
      trade.type === "LONG"
    ) {

      if (
        low <= trade.stop
      ) {

        rawExit =
          trade.stop;

        reason =
          "Stop-Loss";

      } else if (
        high >= trade.target
      ) {

        rawExit =
          trade.target;

        reason =
          "Take-Profit";

      }

    } else {

      if (
        high >= trade.stop
      ) {

        rawExit =
          trade.stop;

        reason =
          "Stop-Loss";

      } else if (
        low <= trade.target
      ) {

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

      const result =

        marketReturn
        *
        trade.fraction

        -

        FEE
        *
        2
        *
        trade.fraction;

      return {

        closed: true,

        record: {

          ...trade,

          exit,

          exitTime:
            Number(candle[6]),

          reason,

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

  if (
    data.length < 250
  ) {

    throw new Error(
      "Nicht genügend Kerzen für "
      +
      config.symbol
    );

  }

  const ind =
    indicators(data);

  /*
  Letzte Kerze kann offen sein.
  Nur die vorletzte Kerze
  darf ein Signal erzeugen.
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

    candleClose:
      signalTime,

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
      analysis.moveRatio ?? null

  };


  /*
  Offene Trades aktualisieren.
  */

  const existing =

    state.open.filter(
      t =>
        t.symbol ===
        config.symbol

        &&

        t.interval ===
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
          t =>
            t.id !==
            trade.id
        );

      state.closed.push(
        result.record
      );

      console.log(
        "Trade geschlossen:",
        trade.symbol,
        trade.type,
        result.record.reason
      );

    }

  }


  if (!signal)
    return;


  const id =

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
    state.seenSignals[id]
  )
    return;


  state.seenSignals[id] =
    true;


  const entryIndex =
    signalIndex + 1;


  if (
    entryIndex >=
    data.length
  )
    return;


  const alreadyOpen =

    state.open.some(
      t =>
        t.symbol ===
        config.symbol

        &&

        t.interval ===
        config.interval
    );


  if (alreadyOpen)
    return;


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


  state.open.push(
    trade
  );


  console.log(
    "Neuer Paper-Trade:",
    config.symbol,
    trade.type,
    "Entry:",
    trade.entry
  );

}


async function main() {

  console.log(
    "SafeSignal V11.1 gestartet"
  );

  const state =
    loadState();

  for (
    const config
    of CONFIGS
  ) {

    try {

      await processMarket(
        config,
        state
      );

    } catch (error) {

      console.error(
        config.symbol,
        error.message
      );

    }

  }

  saveState(state);

  console.log(
    "Fertig."
  );

  console.log(
    "Offene Trades:",
    state.open.length
  );

  console.log(
    "Geschlossene Trades:",
    state.closed.length
  );

}


main().catch(
  error => {

    console.error(error);

    process.exit(1);

  }
);

const fs = require("fs");

const STATE_FILE = "paper-state.json";

const KRAKEN_API =
  "https://api.kraken.com/0/public/OHLC";

const FEE = 0.001;
const SLIPPAGE = 0.0005;
const RISK = 0.005;

const STOP_ATR = 1.8;
const TARGET_ATR = 4.5;

const MIN_EXPANSION = 1.30;
const MIN_MOMENTUM = 0.70;


/*
Kraken verwendet bei Bitcoin
traditionell XBT statt BTC.

Primär versuchen wir USDT.
Falls ein bestimmtes USDT-Paar
nicht verfügbar ist, wird USD
als Daten-Fallback verwendet.
*/

const CONFIGS = [
  {
    key: "ETH",
    displaySymbol: "ETHUSDT",
    pairs: [
      "ETHUSDT",
      "ETHUSD"
    ],
    interval: "4h",
    krakenInterval: 240
  },

  {
    key: "SOL",
    displaySymbol: "SOLUSDT",
    pairs: [
      "SOLUSDT",
      "SOLUSD"
    ],
    interval: "1h",
    krakenInterval: 60
  },

  {
    key: "BTC",
    displaySymbol: "BTCUSDT",
    pairs: [
      "XBTUSDT",
      "XBTUSD"
    ],
    interval: "4h",
    krakenInterval: 240
  }
];


function createNewState() {

  const now =
    new Date().toISOString();

  return {
    version: "V11.3",
    dataProvider: "Kraken",
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

    if (
      !fs.existsSync(
        STATE_FILE
      )
    ) {

      return createNewState();

    }


    const raw =
      fs.readFileSync(
        STATE_FILE,
        "utf8"
      );


    const state =
      JSON.parse(raw);


    if (
      !Array.isArray(
        state.open
      )
    ) {

      state.open = [];

    }


    if (
      !Array.isArray(
        state.closed
      )
    ) {

      state.closed = [];

    }


    if (
      !state.seenSignals
      ||
      typeof state.seenSignals
      !== "object"
    ) {

      state.seenSignals = {};

    }


    if (
      !state.markets
      ||
      typeof state.markets
      !== "object"
    ) {

      state.markets = {};

    }


    state.version =
      "V11.3";


    state.dataProvider =
      "Kraken";


    return state;

  }

  catch(error) {

    console.error(
      "paper-state.json konnte nicht gelesen werden:",
      error.message
    );


    return createNewState();

  }

}


function saveState(
  state
) {

  state.updated =
    new Date().toISOString();


  state.version =
    "V11.3";


  state.dataProvider =
    "Kraken";


  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      state,
      null,
      2
    )
  );

}


function ema(
  values,
  period
) {

  const result =
    Array(
      values.length
    ).fill(null);


  if (
    values.length <
    period
  ) {

    return result;

  }


  let current = 0;


  for (
    let i = 0;
    i < period;
    i++
  ) {

    current +=
      values[i];

  }


  current /=
    period;


  result[
    period - 1
  ] =
    current;


  const multiplier =
    2 /
    (period + 1);


  for (
    let i = period;
    i < values.length;
    i++
  ) {

    current =

      values[i]
      *
      multiplier

      +

      current
      *
      (1 - multiplier);


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
    Array(
      close.length
    ).fill(null);


  const trueRange =
    Array(
      close.length
    ).fill(null);


  for (
    let i = 1;
    i < close.length;
    i++
  ) {

    trueRange[i] =

      Math.max(

        high[i]
        -
        low[i],

        Math.abs(
          high[i]
          -
          close[i - 1]
        ),

        Math.abs(
          low[i]
          -
          close[i - 1]
        )

      );

  }


  if (
    close.length <=
    period
  ) {

    return result;

  }


  let current = 0;


  for (
    let i = 1;
    i <= period;
    i++
  ) {

    current +=
      trueRange[i];

  }


  current /=
    period;


  result[period] =
    current;


  for (
    let i =
      period + 1;
    i < close.length;
    i++
  ) {

    current =

      (
        current
        *
        (period - 1)

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


async function fetchJSON(
  url
) {

  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      15000
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
              "SafeSignal-V11.3"
          }
        }
      );


    if (
      !response.ok
    ) {

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


    return await
      response.json();

  }

  finally {

    clearTimeout(
      timer
    );

  }

}


async function loadKrakenCandles(
  config
) {

  const errors = [];


  for (
    const pair
    of config.pairs
  ) {

    try {

      console.log(
        "Versuche Kraken:",
        pair,
        config.krakenInterval
        +
        " Minuten"
      );


      const url =

        KRAKEN_API

        +

        "?pair="
        +
        encodeURIComponent(
          pair
        )

        +

        "&interval="
        +
        config.krakenInterval;


      const response =
        await fetchJSON(
          url
        );


      if (
        !response
        ||
        !Array.isArray(
          response.error
        )
      ) {

        throw new Error(
          "Ungültige Kraken-Antwort."
        );

      }


      if (
        response.error.length
        >
        0
      ) {

        throw new Error(
          response.error.join(
            ", "
          )
        );

      }


      const result =
        response.result;


      if (
        !result
        ||
        typeof result
        !== "object"
      ) {

        throw new Error(
          "Kein result-Feld."
        );

      }


      /*
      Kraken liefert zusätzlich
      das Feld "last".

      Der eigentliche Paar-Key
      kann anders heißen als
      der angefragte Name.
      */

      const pairKey =
        Object.keys(
          result
        ).find(
          key =>
            key !==
            "last"
        );


      if (
        !pairKey
      ) {

        throw new Error(
          "Kein OHLC-Paar gefunden."
        );

      }


      const rows =
        result[
          pairKey
        ];


      if (
        !Array.isArray(
          rows
        )
      ) {

        throw new Error(
          "OHLC-Daten fehlen."
        );

      }


      if (
        rows.length <
        250
      ) {

        throw new Error(
          "Nur "
          +
          rows.length
          +
          " Kerzen erhalten."
        );

      }


      /*
      Kraken OHLC:
      [
        time,
        open,
        high,
        low,
        close,
        vwap,
        volume,
        count
      ]

      Wir wandeln die Daten
      in unser internes Format.
      */


      const intervalMs =

        config.krakenInterval
        *
        60
        *
        1000;


      const candles =
        rows.map(
          row => {

            const openTime =

              Number(
                row[0]
              )
              *
              1000;


            return {

              openTime,

              closeTime:
                openTime
                +
                intervalMs
                -
                1,

              open:
                Number(
                  row[1]
                ),

              high:
                Number(
                  row[2]
                ),

              low:
                Number(
                  row[3]
                ),

              close:
                Number(
                  row[4]
                ),

              volume:
                Number(
                  row[6]
                )

            };

          }
        );


      console.log(
        "Kraken erfolgreich:",
        pair,
        candles.length,
        "Kerzen"
      );


      return {
        pairUsed:
          pair,

        pairKey,

        candles
      };

    }

    catch(error) {

      const message =

        pair
        +
        ": "
        +
        error.message;


      errors.push(
        message
      );


      console.error(
        "Kraken-Paar fehlgeschlagen:",
        message
      );

    }

  }


  throw new Error(

    "Alle Kraken-Paare fehlgeschlagen: "
    +
    errors.join(
      " | "
    )

  );

}


function indicators(
  candles
) {

  const open =
    candles.map(
      candle =>
        candle.open
    );


  const high =
    candles.map(
      candle =>
        candle.high
    );


  const low =
    candles.map(
      candle =>
        candle.low
    );


  const close =
    candles.map(
      candle =>
        candle.close
    );


  const openTime =
    candles.map(
      candle =>
        candle.openTime
    );


  const closeTime =
    candles.map(
      candle =>
        candle.closeTime
    );


  return {

    open,
    high,
    low,
    close,
    openTime,
    closeTime,

    ema50:
      ema(
        close,
        50
      ),

    ema200:
      ema(
        close,
        200
      ),

    ATR:
      atr(
        high,
        low,
        close,
        14
      )

  };

}


function volatilityAnalysis(
  index,
  ind
) {

  if (
    index < 220
  ) {

    return {
      signal: null,
      reason:
        "Noch nicht genügend Kerzen.",
      expansion: null,
      momentum: null
    };

  }


  const price =
    ind.close[
      index
    ];


  const currentATR =
    ind.ATR[
      index
    ];


  const ema50 =
    ind.ema50[
      index
    ];


  const ema200 =
    ind.ema200[
      index
    ];


  if (
    !Number.isFinite(
      price
    )
    ||
    !Number.isFinite(
      currentATR
    )
    ||
    !Number.isFinite(
      ema50
    )
    ||
    !Number.isFinite(
      ema200
    )
  ) {

    return {
      signal: null,
      reason:
        "Indikatoren nicht vollständig.",
      expansion: null,
      momentum: null
    };

  }


  const atrPercent =
    currentATR
    /
    price;


  let averageATRPercent =
    0;


  for (
    let i =
      index - 20;
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
        momentum: null
      };

    }


    averageATRPercent +=

      ind.ATR[i]
      /
      ind.close[i];

  }


  averageATRPercent /=
    20;


  const expansion =

    averageATRPercent
    >
    0

    ?

    atrPercent
    /
    averageATRPercent

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


  const momentum =

    atrPercent
    >
    0

    ?

    candleMove
    /
    atrPercent

    :

    0;


  const bullishCandle =

    ind.close[index]
    >
    ind.open[index];


  const bearishCandle =

    ind.close[index]
    <
    ind.open[index];


  const bullishTrend =

    price > ema50
    &&
    ema50 > ema200;


  const bearishTrend =

    price < ema50
    &&
    ema50 < ema200;


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

      momentum

    };

  }


  if (
    momentum <
    MIN_MOMENTUM
  ) {

    return {

      signal: null,

      reason:

        "Kerzen-Momentum "
        +
        momentum.toFixed(2)
        +
        "x ATR < "
        +
        MIN_MOMENTUM.toFixed(2)
        +
        "x",

      expansion,

      momentum

    };

  }


  if (
    bullishCandle
    &&
    !bullishTrend
  ) {

    return {

      signal: null,

      reason:
        "Bullische Expansion ohne gültigen EMA50/EMA200-Trend.",

      expansion,

      momentum

    };

  }


  if (
    bearishCandle
    &&
    !bearishTrend
  ) {

    return {

      signal: null,

      reason:
        "Bärische Expansion ohne gültigen EMA50/EMA200-Trend.",

      expansion,

      momentum

    };

  }


  if (
    bullishCandle
    &&
    bullishTrend
  ) {

    return {

      signal: {
        type:
          "LONG",

        atr:
          currentATR
      },

      reason:
        "LONG-Setup erfüllt.",

      expansion,

      momentum

    };

  }


  if (
    bearishCandle
    &&
    bearishTrend
  ) {

    return {

      signal: {
        type:
          "SHORT",

        atr:
          currentATR
      },

      reason:
        "SHORT-Setup erfüllt.",

      expansion,

      momentum

    };

  }


  return {

    signal: null,

    reason:
      "Keine eindeutige Richtung.",

    expansion,

    momentum

  };

}


function entryWithSlippage(
  price,
  type
) {

  if (
    type === "LONG"
  ) {

    return (
      price
      *
      (1 + SLIPPAGE)
    );

  }


  return (
    price
    *
    (1 - SLIPPAGE)
  );

}


function exitWithSlippage(
  price,
  type
) {

  if (
    type === "LONG"
  ) {

    return (
      price
      *
      (1 - SLIPPAGE)
    );

  }


  return (
    price
    *
    (1 + SLIPPAGE)
  );

}


function createTrade(
  config,
  pairUsed,
  signal,
  rawEntry,
  signalTime,
  entryTime
) {

  const entry =

    entryWithSlippage(
      rawEntry,
      signal.type
    );


  let stop;
  let target;


  if (
    signal.type ===
    "LONG"
  ) {

    stop =

      entry
      -
      STOP_ATR
      *
      signal.atr;


    target =

      entry
      +
      TARGET_ATR
      *
      signal.atr;

  }

  else {

    stop =

      entry
      +
      STOP_ATR
      *
      signal.atr;


    target =

      entry
      -
      TARGET_ATR
      *
      signal.atr;

  }


  const stopPercent =

    Math.abs(
      entry - stop
    )

    /

    entry;


  let fraction =

    RISK
    /
    stopPercent;


  fraction =
    Math.min(
      fraction,
      1
    );


  return {

    id:

      config.displaySymbol
      +
      "-"
      +
      config.interval
      +
      "-"
      +
      signalTime,

    provider:
      "Kraken",

    pairUsed,

    symbol:
      config.displaySymbol,

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

    if (
      candle.openTime
      <
      trade.entryTime
    ) {

      continue;

    }


    let rawExit =
      null;


    let reason =
      null;


    if (
      trade.type ===
      "LONG"
    ) {

      /*
      Konservative Regel:
      Stop wird vor TP geprüft.
      */


      if (
        candle.low
        <=
        trade.stop
      ) {

        rawExit =
          trade.stop;


        reason =
          "Stop-Loss";

      }

      else if (
        candle.high
        >=
        trade.target
      ) {

        rawExit =
          trade.target;


        reason =
          "Take-Profit";

      }

    }

    else {

      if (
        candle.high
        >=
        trade.stop
      ) {

        rawExit =
          trade.stop;


        reason =
          "Stop-Loss";

      }

      else if (
        candle.low
        <=
        trade.target
      ) {

        rawExit =
          trade.target;


        reason =
          "Take-Profit";

      }

    }


    if (
      rawExit === null
    ) {

      continue;

    }


    const exit =

      exitWithSlippage(
        rawExit,
        trade.type
      );


    let marketReturn;


    if (
      trade.type ===
      "LONG"
    ) {

      marketReturn =

        (
          exit
          -
          trade.entry
        )

        /

        trade.entry;

    }

    else {

      marketReturn =

        (
          trade.entry
          -
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


    const accountReturn =

      marketReturn
      *
      trade.fraction

      -

      feeCost;


    return {

      closed:
        true,

      record: {

        ...trade,

        exit,

        exitTime:
          candle.closeTime,

        reason,

        marketReturn,

        feeCost,

        return:
          accountReturn

      }

    };

  }


  return {
    closed:
      false
  };

}


async function processMarket(
  config,
  state
) {

  console.log("");
  console.log(
    "=============================="
  );


  console.log(
    "Prüfe",
    config.displaySymbol,
    config.interval
  );


  const loaded =
    await loadKrakenCandles(
      config
    );


  const pairUsed =
    loaded.pairUsed;


  const candles =
    loaded.candles;


  const ind =
    indicators(
      candles
    );


  /*
  Kraken dokumentiert,
  dass die letzte OHLC-Zeile
  die laufende, noch nicht
  abgeschlossene Kerze ist.

  Daher:
  letzte abgeschlossene Kerze
  = length - 2
  */


  const signalIndex =
    candles.length - 2;


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

    provider:
      "Kraken",

    pairUsed,

    symbol:
      config.displaySymbol,

    interval:
      config.interval,

    checkedAt:
      Date.now(),

    checkedAtISO:
      new Date()
      .toISOString(),

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
      analysis.expansion,

    momentum:
      analysis.momentum,

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
    "Datenquelle:",
    pairUsed
  );


  console.log(
    "Signal:",
    state.markets[
      config.key
    ].signal
  );


  console.log(
    "Grund:",
    analysis.reason
  );


  /*
  Vorhandene Paper-Trades
  dieses Marktes prüfen.
  */


  const existing =

    state.open.filter(
      trade =>

        trade.symbol
        ===
        config.displaySymbol

        &&

        trade.interval
        ===
        config.interval
    );


  for (
    const trade
    of existing
  ) {

    const result =

      processTrade(
        trade,
        candles
      );


    if (
      result.closed
    ) {

      state.open =

        state.open.filter(
          item =>
            item.id
            !==
            trade.id
        );


      state.closed.push(
        result.record
      );


      console.log(
        "Paper-Trade geschlossen:",
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
  Kein Signal =
  kein neuer Trade.
  */


  if (
    !signal
  ) {

    return;

  }


  const signalId =

    config.displaySymbol
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
      "Signal bereits verarbeitet."
    );


    return;

  }


  const alreadyOpen =

    state.open.some(
      trade =>

        trade.symbol
        ===
        config.displaySymbol

        &&

        trade.interval
        ===
        config.interval
    );


  if (
    alreadyOpen
  ) {

    console.log(
      "Bereits offene Position."
    );


    return;

  }


  /*
  Die letzte Kraken-Kerze
  ist die neue laufende Kerze.

  Deren Open wird als
  Paper-Entry verwendet.
  */


  const entryIndex =
    signalIndex + 1;


  if (
    entryIndex
    >=
    candles.length
  ) {

    console.log(
      "Keine Einstiegskerze vorhanden."
    );


    return;

  }


  const trade =

    createTrade(

      config,

      pairUsed,

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
    !Number.isFinite(
      trade.fraction
    )
    ||
    trade.fraction
    <=
    0
  ) {

    throw new Error(
      "Ungültige Positionsgröße."
    );

  }


  /*
  Erst markieren,
  wenn Trade wirklich
  angelegt wurde.
  */


  state.seenSignals[
    signalId
  ] =
    true;


  state.open.push(
    trade
  );


  console.log(
    "NEUER PAPER-TRADE"
  );


  console.log(
    config.displaySymbol,
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
    "SafeSignal V11.3 gestartet"
  );


  console.log(
    "Datenquelle: Kraken"
  );


  console.log(
    "Nur Paper-Trading"
  );


  console.log(
    "Keine echten Orders"
  );


  const state =
    loadState();


  let successes = 0;
  let failures = 0;


  for (
    const config
    of CONFIGS
  ) {

    try {

      await processMarket(
        config,
        state
      );


      successes++;

    }

    catch(error) {

      failures++;


      console.error("");
      console.error(
        "MARKTFEHLER:",
        config.displaySymbol,
        config.interval
      );


      console.error(
        error.message
      );


      /*
      Selbst bei Fehler wird
      der Markt im State sichtbar.

      markets darf also nicht
      mehr kommentarlos leer sein.
      */


      state.markets[
        config.key
      ] = {

        provider:
          "Kraken",

        symbol:
          config.displaySymbol,

        interval:
          config.interval,

        checkedAt:
          Date.now(),

        checkedAtISO:
          new Date()
          .toISOString(),

        signal:
          "ERROR",

        reason:
          error.message,

        dataStatus:
          "ERROR"

      };

    }

  }


  saveState(
    state
  );


  console.log("");
  console.log(
    "=============================="
  );


  console.log(
    "SafeSignal V11.3 fertig"
  );


  console.log(
    "Erfolgreiche Märkte:",
    successes
  );


  console.log(
    "Fehler:",
    failures
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
  Kein falsches Success,
  wenn gar keine Daten
  funktioniert haben.
  */


  if (
    successes === 0
  ) {

    throw new Error(
      "Kraken konnte keinen einzigen Markt liefern."
    );

  }

}


main()
.catch(
  error => {

    console.error("");
    console.error(
      "SafeSignal V11.3 fehlgeschlagen:"
    );


    console.error(
      error.message
    );


    process.exit(1);

  }
);

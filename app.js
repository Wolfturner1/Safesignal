const API = "https://api.binance.com/api/v3";

const $ = (id) => document.getElementById(id);


/* =========================
   EMA
========================= */

function ema(values, period) {

    const result =
        Array(values.length).fill(null);

    const multiplier =
        2 / (period + 1);

    let current =
        values
        .slice(0, period)
        .reduce((a, b) => a + b, 0)
        / period;

    result[period - 1] =
        current;

    for (
        let i = period;
        i < values.length;
        i++
    ) {

        current =
            values[i] * multiplier
            +
            current *
            (1 - multiplier);

        result[i] =
            current;
    }

    return result;
}


/* =========================
   RSI
========================= */

function calculateRSI(
    values,
    period = 14
) {

    let gains = 0;
    let losses = 0;

    const result =
        Array(values.length)
        .fill(null);


    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const difference =
            values[i]
            -
            values[i - 1];

        gains +=
            Math.max(
                difference,
                0
            );

        losses +=
            Math.max(
                -difference,
                0
            );
    }


    let averageGain =
        gains / period;

    let averageLoss =
        losses / period;


    result[period] =
        averageLoss === 0
        ? 100
        : 100 -
          100 /
          (
            1 +
            averageGain /
            averageLoss
          );


    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

        const difference =
            values[i]
            -
            values[i - 1];


        averageGain =
            (
                averageGain *
                (period - 1)
                +
                Math.max(
                    difference,
                    0
                )
            )
            /
            period;


        averageLoss =
            (
                averageLoss *
                (period - 1)
                +
                Math.max(
                    -difference,
                    0
                )
            )
            /
            period;


        result[i] =
            averageLoss === 0
            ? 100
            : 100 -
              100 /
              (
                1 +
                averageGain /
                averageLoss
              );
    }

    return result;
}


/* =========================
   ATR
========================= */

function calculateATR(
    high,
    low,
    close,
    period = 14
) {

    const ranges = [];

    for (
        let i = 1;
        i < close.length;
        i++
    ) {

        ranges.push(
            Math.max(

                high[i] -
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

            )
        );
    }


    let atr =
        ranges
        .slice(0, period)
        .reduce(
            (a, b) => a + b,
            0
        )
        /
        period;


    for (
        let i = period;
        i < ranges.length;
        i++
    ) {

        atr =
            (
                atr *
                (period - 1)
                +
                ranges[i]
            )
            /
            period;
    }

    return atr;
}


/* =========================
   PREISE FORMATIEREN
========================= */

function formatPrice(number) {

    return Number(number)
        .toLocaleString(
            "de-DE",
            {
                maximumFractionDigits:
                number > 100
                ? 2
                : 5
            }
        );
}


/* =========================
   BINANCE DATEN
========================= */

async function loadMarketData(
    symbol,
    interval
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
        "&limit=250";


    const response =
        await fetch(url);


    if (!response.ok) {

        throw new Error(
            "Marktdaten konnten nicht geladen werden."
        );
    }


    return await response.json();
}


/* =========================
   ANALYSE
========================= */

async function analyze() {

    try {

        $("status").textContent =
            "Marktdaten werden analysiert...";


        const symbol =
            $("symbol").value;

        const interval =
            $("interval").value;


        const data =
            await loadMarketData(
                symbol,
                interval
            );


        const close =
            data.map(
                candle =>
                Number(candle[4])
            );


        const high =
            data.map(
                candle =>
                Number(candle[2])
            );


        const low =
            data.map(
                candle =>
                Number(candle[3])
            );


        const volume =
            data.map(
                candle =>
                Number(candle[5])
            );


        const price =
            close[
                close.length - 1
            ];


        /* EMA */

        const ema20 =
            ema(close, 20);

        const ema50 =
            ema(close, 50);

        const ema200 =
            ema(close, 200);


        /* RSI */

        const rsiValues =
            calculateRSI(close);

        const currentRSI =
            rsiValues[
                rsiValues.length - 1
            ];


        /* MACD */

        const ema12 =
            ema(close, 12);

        const ema26 =
            ema(close, 26);


        const macdValues =
            [];


        for (
            let i = 26;
            i < close.length;
            i++
        ) {

            macdValues.push(
                ema12[i]
                -
                ema26[i]
            );
        }


        const signalValues =
            ema(
                macdValues,
                9
            );


        const currentMACD =
            macdValues[
                macdValues.length - 1
            ];


        const currentSignal =
            signalValues[
                signalValues.length - 1
            ];


        /* ATR */

        const atr =
            calculateATR(
                high,
                low,
                close
            );


        const volatility =
            atr / price;


        /* VOLUME */

        const recentVolumes =
            volume.slice(
                -21,
                -1
            );


        const averageVolume =
            recentVolumes.reduce(
                (a, b) => a + b,
                0
            )
            /
            recentVolumes.length;


        const volumeRatio =
            volume[
                volume.length - 1
            ]
            /
            averageVolume;


        /* TREND */

        const bullishTrend =

            price >
            ema20[
                ema20.length - 1
            ]

            &&

            ema20[
                ema20.length - 1
            ]
            >
            ema50[
                ema50.length - 1
            ]

            &&

            ema50[
                ema50.length - 1
            ]
            >
            ema200[
                ema200.length - 1
            ];


        const bearishTrend =

            price <
            ema20[
                ema20.length - 1
            ]

            &&

            ema20[
                ema20.length - 1
            ]
            <
            ema50[
                ema50.length - 1
            ]

            &&

            ema50[
                ema50.length - 1
            ]
            <
            ema200[
                ema200.length - 1
            ];


        /* SCORE */

        let bullishScore = 0;
        let bearishScore = 0;

        const reasons = [];


        if (bullishTrend) {

            bullishScore += 35;

            reasons.push(
                "EMA 20, 50 und 200 bestätigen einen Aufwärtstrend."
            );
        }


        if (bearishTrend) {

            bearishScore += 35;

            reasons.push(
                "EMA 20, 50 und 200 bestätigen einen Abwärtstrend."
            );
        }


        if (
            currentMACD >
            currentSignal
        ) {

            bullishScore += 20;

            reasons.push(
                "MACD ist bullisch."
            );

        } else {

            bearishScore += 20;

            reasons.push(
                "MACD ist bärisch."
            );
        }


        if (
            currentRSI >= 50
            &&
            currentRSI <= 65
        ) {

            bullishScore += 20;

            reasons.push(
                "RSI befindet sich in einer moderaten bullischen Zone."
            );
        }


        if (
            currentRSI <= 50
            &&
            currentRSI >= 35
        ) {

            bearishScore += 20;

            reasons.push(
                "RSI befindet sich in einer moderaten bärischen Zone."
            );
        }


        if (
            volumeRatio >= 1.10
        ) {

            bullishScore += 10;
            bearishScore += 10;

            reasons.push(
                "Das Handelsvolumen liegt über dem Durchschnitt."
            );
        }


        /* =========================
           RISIKOFILTER
        ========================= */

        let signal =
            "WARTEN";


        let score =
            Math.max(
                bullishScore,
                bearishScore
            );


        /*
        Sehr hohe Volatilität
        blockiert jeden Trade.
        */

        if (
            volatility > 0.035
        ) {

            signal =
                "WARTEN";

            score = 0;

            reasons.push(
                "Volatilität ist zu hoch. Der Risikofilter blockiert das Signal."
            );

        }

        else if (

            bullishScore >= 75

            &&

            bullishScore
            -
            bearishScore
            >= 25

            &&

            currentRSI < 70

        ) {

            signal =
                "KAUFEN";

        }

        else if (

            bearishScore >= 75

            &&

            bearishScore
            -
            bullishScore
            >= 25

            &&

            currentRSI > 30

        ) {

            signal =
                "VERKAUFEN";

        }

        else {

            signal =
                "WARTEN";

            reasons.push(
                "Nicht genügend unabhängige Bestätigungen. Kein Trade empfohlen."
            );
        }


        /*
        Zusätzlicher Schutz gegen
        überkaufte Märkte
        */

        if (
            currentRSI >= 70
        ) {

            signal =
                "WARTEN";

            reasons.push(
                "RSI über 70. Kauf wird wegen möglicher Überhitzung blockiert."
            );
        }


        /*
        Zusätzlicher Schutz gegen
        überverkaufte Märkte
        */

        if (
            currentRSI <= 30
        ) {

            signal =
                "WARTEN";

            reasons.push(
                "RSI unter 30. Verkauf wird wegen möglicher Gegenbewegung blockiert."
            );
        }


        /* =========================
           STOP LOSS / TAKE PROFIT
        ========================= */

        let stopLoss = null;
        let takeProfit = null;


        if (
            signal === "KAUFEN"
        ) {

            stopLoss =
                price -
                atr * 1.5;

            takeProfit =
                price +
                atr * 3;

        }


        if (
            signal === "VERKAUFEN"
        ) {

            stopLoss =
                price +
                atr * 1.5;

            takeProfit =
                price -
                atr * 3;

        }


        /* =========================
           DISPLAY
        ========================= */

        $("badge").textContent =
            signal;


        $("badge").className =
            "badge "
            +
            (
                signal === "KAUFEN"
                ? "buy"
                :
                signal === "VERKAUFEN"
                ? "sell"
                :
                "wait"
            );


        $("signal").textContent =

            signal === "WARTEN"

            ? "Kein Trade empfohlen"

            : signal +
              " – Setup bestätigt";


        $("score").textContent =
            Math.round(score);


        $("price").textContent =
            formatPrice(price)
            +
            " USDT";


        $("trend").textContent =

            bullishTrend
            ? "Bullisch"

            :

            bearishTrend
            ? "Bärisch"

            :

            "Neutral";


        $("rsi").textContent =
            currentRSI.toFixed(1);


        $("macd").textContent =

            currentMACD >
            currentSignal

            ? "Bullisch"

            : "Bärisch";


        $("volume").textContent =
            volumeRatio.toFixed(2)
            +
            "×";


        $("entry").textContent =
            signal === "WARTEN"
            ? "—"
            : formatPrice(price)
              +
              " USDT";


        $("stop").textContent =
            stopLoss === null
            ? "—"
            : formatPrice(stopLoss)
              +
              " USDT";


        $("tp").textContent =
            takeProfit === null
            ? "—"
            : formatPrice(takeProfit)
              +
              " USDT";


        $("rr").textContent =
            signal === "WARTEN"
            ? "—"
            : "1 : 2";


        $("reasons").innerHTML =
            reasons
            .map(
                reason =>
                "<li>"
                +
                reason
                +
                "</li>"
            )
            .join("");


        $("status").textContent =
            "Letzte Analyse: "
            +
            new Date()
            .toLocaleTimeString(
                "de-DE"
            );

    }

    catch (error) {

        $("status").textContent =
            "Fehler: "
            +
            error.message;

        $("signal").textContent =
            "Keine Marktdaten";

        $("badge").textContent =
            "WARTEN";

        $("badge").className =
            "badge wait";
    }
}


/* BUTTONS */

$("analyze")
.addEventListener(
    "click",
    analyze
);


$("refresh")
.addEventListener(
    "click",
    analyze
);


/*
Automatische Aktualisierung
alle 5 Minuten.
*/

setInterval(
    analyze,
    300000
);


/*
Erste Analyse direkt
beim Start.
*/

analyze();

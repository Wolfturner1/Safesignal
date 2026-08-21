const API =
"https://api.binance.com/api/v3";


const $ =
(id) =>
document.getElementById(id);



function ema(values, period) {

    const result =
    Array(values.length).fill(null);

    if (values.length < period)
        return result;


    let value =
    values
    .slice(0, period)
    .reduce((a,b) => a+b,0)
    /
    period;


    result[period - 1] =
    value;


    const k =
    2 / (period + 1);


    for (
        let i = period;
        i < values.length;
        i++
    ) {

        value =
        values[i] * k
        +
        value * (1-k);


        result[i] =
        value;
    }


    return result;
}



function rsi(values, period = 14) {

    const result =
    Array(values.length).fill(null);


    let gain = 0;
    let loss = 0;


    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const d =
        values[i]
        -
        values[i-1];


        gain +=
        Math.max(d,0);


        loss +=
        Math.max(-d,0);
    }


    let avgGain =
    gain / period;


    let avgLoss =
    loss / period;


    result[period] =
    avgLoss === 0
    ?
    100
    :
    100 -
    100 /
    (
        1 +
        avgGain / avgLoss
    );


    for (
        let i = period+1;
        i < values.length;
        i++
    ) {

        const d =
        values[i]
        -
        values[i-1];


        avgGain =
        (
            avgGain *
            (period-1)
            +
            Math.max(d,0)
        )
        /
        period;


        avgLoss =
        (
            avgLoss *
            (period-1)
            +
            Math.max(-d,0)
        )
        /
        period;


        result[i] =
        avgLoss === 0
        ?
        100
        :
        100 -
        100 /
        (
            1 +
            avgGain /
            avgLoss
        );
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

            high[i] -
            low[i],

            Math.abs(
                high[i] -
                close[i-1]
            ),

            Math.abs(
                low[i] -
                close[i-1]
            )
        );
    }


    let value = 0;


    for (
        let i = 1;
        i <= period;
        i++
    ) {

        value += tr[i];
    }


    value /= period;


    result[period] =
    value;


    for (
        let i = period+1;
        i < close.length;
        i++
    ) {

        value =
        (
            value *
            (period-1)
            +
            tr[i]
        )
        /
        period;


        result[i] =
        value;
    }


    return result;
}



function createIndicators(data) {

    const close =
    data.map(x => Number(x[4]));

    const high =
    data.map(x => Number(x[2]));

    const low =
    data.map(x => Number(x[3]));

    const volume =
    data.map(x => Number(x[5]));


    const e20 =
    ema(close,20);

    const e50 =
    ema(close,50);

    const e200 =
    ema(close,200);


    const r =
    rsi(close);


    const e12 =
    ema(close,12);

    const e26 =
    ema(close,26);


    const macd =
    Array(close.length).fill(null);


    for (
        let i = 26;
        i < close.length;
        i++
    ) {

        macd[i] =
        e12[i] -
        e26[i];
    }


    const validMACD =
    macd.slice(26);


    const tempSignal =
    ema(validMACD,9);


    const macdSignal =
    Array(close.length).fill(null);


    for (
        let i = 0;
        i < tempSignal.length;
        i++
    ) {

        macdSignal[i+26] =
        tempSignal[i];
    }


    const atrValues =
    atr(
        high,
        low,
        close
    );


    return {

        close,
        high,
        low,
        volume,
        e20,
        e50,
        e200,
        r,
        macd,
        macdSignal,
        atrValues
    };
}



function getSignal(
    i,
    ind
) {

    if (i < 200)
        return {
            signal:"WARTEN",
            score:0
        };


    const price =
    ind.close[i];


    const R =
    ind.r[i];


    const A =
    ind.atrValues[i];


    const M =
    ind.macd[i];


    const MS =
    ind.macdSignal[i];


    if (
        R === null ||
        A === null ||
        M === null ||
        MS === null
    ) {

        return {
            signal:"WARTEN",
            score:0
        };
    }


    const bullishTrend =

    price > ind.e20[i]

    &&

    ind.e20[i] >
    ind.e50[i]

    &&

    ind.e50[i] >
    ind.e200[i];


    const bearishTrend =

    price < ind.e20[i]

    &&

    ind.e20[i] <
    ind.e50[i]

    &&

    ind.e50[i] <
    ind.e200[i];


    let bull = 0;
    let bear = 0;


    if (bullishTrend)
        bull += 35;


    if (bearishTrend)
        bear += 35;


    if (M > MS)
        bull += 20;
    else
        bear += 20;


    if (
        R >= 50 &&
        R <= 65
    )
        bull += 20;


    if (
        R <= 50 &&
        R >= 35
    )
        bear += 20;


    let averageVolume = 0;


    for (
        let x = i-20;
        x < i;
        x++
    ) {

        averageVolume +=
        ind.volume[x];
    }


    averageVolume /= 20;


    const volumeRatio =
    ind.volume[i]
    /
    averageVolume;


    if (
        volumeRatio >= 1.10
    ) {

        bull += 10;
        bear += 10;
    }


    const volatility =
    A / price;


    let signal =
    "WARTEN";


    let score =
    Math.max(
        bull,
        bear
    );


    if (
        volatility > 0.035
    ) {

        return {
            signal:"WARTEN",
            score:0
        };
    }


    if (

        bull >= 75

        &&

        bull - bear >= 25

        &&

        R < 70

    ) {

        signal =
        "KAUFEN";
    }


    else if (

        bear >= 75

        &&

        bear - bull >= 25

        &&

        R > 30

    ) {

        signal =
        "VERKAUFEN";
    }


    if (
        R >= 70 ||
        R <= 30
    ) {

        signal =
        "WARTEN";
    }


    return {

        signal,
        score,
        atr:A
    };
}



async function loadHistory(
    symbol,
    interval,
    days
) {

    const endTime =
    Date.now();


    let startTime =
    endTime
    -
    days *
    24 *
    60 *
    60 *
    1000;


    const candles = [];


    while (
        startTime < endTime
    ) {

        $("status").textContent =
        "Historische Daten werden geladen: "
        +
        candles.length
        +
        " Kerzen";


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
        "&startTime="
        +
        startTime
        +
        "&endTime="
        +
        endTime
        +
        "&limit=1000";


        const response =
        await fetch(url);


        if (!response.ok) {

            throw new Error(
                "Binance-Daten konnten nicht geladen werden."
            );
        }


        const batch =
        await response.json();


        if (
            batch.length === 0
        )
            break;


        candles.push(
            ...batch
        );


        const lastTime =
        Number(
            batch[
                batch.length-1
            ][0]
        );


        startTime =
        lastTime + 1;


        if (
            batch.length < 1000
        )
            break;


        await new Promise(
            resolve =>
            setTimeout(
                resolve,
                100
            )
        );
    }


    return candles;
}



function backtest(
    data,
    fee
) {

    const ind =
    createIndicators(data);


    const trades = [];


    let equity =
    100;


    let peak =
    equity;


    let maxDrawdown =
    0;


    let position =
    null;


    for (
        let i = 200;
        i < data.length-1;
        i++
    ) {


        if (position) {

            const candleHigh =
            Number(data[i][2]);


            const candleLow =
            Number(data[i][3]);


            let exit = null;
            let reason = null;


            if (
                position.type === "LONG"
            ) {

                /*
                Konservative Annahme:
                Stop zuerst prüfen.
                */

                if (
                    candleLow <=
                    position.stop
                ) {

                    exit =
                    position.stop;

                    reason =
                    "Stop-Loss";
                }

                else if (
                    candleHigh >=
                    position.takeProfit
                ) {

                    exit =
                    position.takeProfit;

                    reason =
                    "Take-Profit";
                }

            }

            else {

                if (
                    candleHigh >=
                    position.stop
                ) {

                    exit =
                    position.stop;

                    reason =
                    "Stop-Loss";
                }

                else if (
                    candleLow <=
                    position.takeProfit
                ) {

                    exit =
                    position.takeProfit;

                    reason =
                    "Take-Profit";
                }

            }


            if (exit !== null) {

                let rawReturn;


                if (
                    position.type ===
                    "LONG"
                ) {

                    rawReturn =
                    (
                        exit -
                        position.entry
                    )
                    /
                    position.entry;

                }

                else {

                    rawReturn =
                    (
                        position.entry -
                        exit
                    )
                    /
                    position.entry;

                }


                const netReturn =
                rawReturn
                -
                fee * 2;


                equity *=
                1 + netReturn;


                if (
                    equity > peak
                ) {

                    peak =
                    equity;
                }


                const drawdown =
                (
                    peak -
                    equity
                )
                /
                peak;


                if (
                    drawdown >
                    maxDrawdown
                ) {

                    maxDrawdown =
                    drawdown;
                }


                trades.push({

                    type:
                    position.type,

                    entry:
                    position.entry,

                    exit,

                    result:
                    reason,

                    return:
                    netReturn

                });


                position =
                null;
            }


            continue;
        }



        const result =
        getSignal(
            i,
            ind
        );


        if (
            result.signal ===
            "WARTEN"
        )
            continue;


        /*
        Signal am Kerzenschluss.
        Einstieg erst zur
        nächsten Kerzeneröffnung.
        */

        const entry =
        Number(
            data[i+1][1]
        );


        const A =
        result.atr;


        if (
            result.signal ===
            "KAUFEN"
        ) {

            position = {

                type:"LONG",

                entry,

                stop:
                entry -
                1.5 * A,

                takeProfit:
                entry +
                3 * A
            };

        }


        else {

            position = {

                type:"SHORT",

                entry,

                stop:
                entry +
                1.5 * A,

                takeProfit:
                entry -
                3 * A
            };

        }
    }



    /*
    Offene Position am
    Testende schließen.
    */

    if (position) {

        const exit =
        ind.close[
            ind.close.length-1
        ];


        let rawReturn;


        if (
            position.type ===
            "LONG"
        ) {

            rawReturn =
            (
                exit -
                position.entry
            )
            /
            position.entry;

        }

        else {

            rawReturn =
            (
                position.entry -
                exit
            )
            /
            position.entry;

        }


        const netReturn =
        rawReturn -
        fee * 2;


        equity *=
        1 + netReturn;


        trades.push({

            type:
            position.type,

            entry:
            position.entry,

            exit,

            result:
            "Testende",

            return:
            netReturn
        });
    }


    return {

        trades,
        equity,
        maxDrawdown

    };
}



function showResults(
    result
) {

    const trades =
    result.trades;


    const wins =
    trades.filter(
        x => x.return > 0
    );


    const losses =
    trades.filter(
        x => x.return <= 0
    );


    const winRate =
    trades.length
    ?
    wins.length /
    trades.length *
    100
    :
    0;


    const performance =
    result.equity - 100;


    const average =
    trades.length
    ?
    trades.reduce(
        (sum,t) =>
        sum + t.return,
        0
    )
    /
    trades.length
    *
    100
    :
    0;


    const grossProfit =
    wins.reduce(
        (sum,t) =>
        sum + t.return,
        0
    );


    const grossLoss =
    Math.abs(
        losses.reduce(
            (sum,t) =>
            sum + t.return,
            0
        )
    );


    const profitFactor =
    grossLoss > 0
    ?
    grossProfit /
    grossLoss
    :
    grossProfit > 0
    ?
    Infinity
    :
    0;



    $("trades").textContent =
    trades.length;


    $("wins").textContent =
    wins.length;


    $("losses").textContent =
    losses.length;


    $("winrate").textContent =
    winRate.toFixed(1)
    +
    "%";


    $("return").textContent =
    (
        performance >= 0
        ? "+"
        : ""
    )
    +
    performance.toFixed(2)
    +
    "%";


    $("drawdown").textContent =
    "-"
    +
    (
        result.maxDrawdown *
        100
    ).toFixed(2)
    +
    "%";


    $("average").textContent =
    (
        average >= 0
        ? "+"
        : ""
    )
    +
    average.toFixed(2)
    +
    "%";


    $("profitfactor").textContent =
    profitFactor === Infinity
    ?
    "∞"
    :
    profitFactor.toFixed(2);



    $("return").className =
    performance >= 0
    ?
    "positive"
    :
    "negative";


    /*
    Einfache Bewertung
    */

    let rating;
    let text;


    if (
        trades.length < 20
    ) {

        rating =
        "⚠️ Zu wenig Daten";

        text =
        "Es wurden zu wenige Trades erzeugt, um die Strategie zuverlässig zu beurteilen.";

    }


    else if (

        performance > 0

        &&

        profitFactor >= 1.5

        &&

        result.maxDrawdown < 0.15

    ) {

        rating =
        "✅ Stark";

        text =
        "Der historische Test sieht interessant aus. Trotzdem sollte die Strategie weiter getestet werden.";

    }


    else if (

        performance > 0

        &&

        profitFactor > 1

    ) {

        rating =
        "🟡 Durchschnittlich";

        text =
        "Die Strategie war profitabel, besitzt aber noch Verbesserungspotenzial.";

    }


    else {

        rating =
        "🔴 Schwach";

        text =
        "Die Strategie war in diesem Zeitraum nicht überzeugend.";

    }


    $("rating").textContent =
    rating;


    $("ratingText").textContent =
    text;



    const recent =
    trades
    .slice(-15)
    .reverse();


    $("tradeList").innerHTML =
    recent.map(
        trade => {

            return (
                "<tr>"
                +
                "<td>"
                +
                trade.type
                +
                "</td>"
                +
                "<td>"
                +
                trade.result
                +
                "</td>"
                +
                "<td>"
                +
                (
                    trade.return >= 0
                    ? "+"
                    : ""
                )
                +
                (
                    trade.return *
                    100
                ).toFixed(2)
                +
                "%</td>"
                +
                "</tr>"
            );

        }
    ).join("");

}



async function runBacktest() {

    const button =
    $("run");


    button.disabled =
    true;


    try {

        const symbol =
        $("symbol").value;


        const interval =
        $("interval").value;


        const days =
        Number(
            $("period").value
        );


        const fee =
        Number(
            $("fee").value
        );


        $("status").textContent =
        "Backtest wird vorbereitet...";


        const data =
        await loadHistory(
            symbol,
            interval,
            days
        );


        if (
            data.length < 250
        ) {

            throw new Error(
                "Nicht genügend historische Daten."
            );
        }


        $("status").textContent =
        data.length
        +
        " Kerzen geladen. Strategie wird getestet...";


        const result =
        backtest(
            data,
            fee
        );


        showResults(
            result
        );


        $("status").textContent =
        "Backtest abgeschlossen · "
        +
        data.length
        +
        " Kerzen analysiert.";

    }

    catch(error) {

        $("status").textContent =
        "Fehler: "
        +
        error.message;

    }


    button.disabled =
    false;
}



$("run")
.addEventListener(
    "click",
    runBacktest
);

This is my first attempt to find an alternative to plotly in [freqtrade](https://github.com/freqtrade/freqtrade) without external dependency.

This script use [Tradingview lightweight-charts](https://github.com/tradingview/lightweight-charts) to plot the dataframe from freqtrade backtest.

Lot of work still needed to make this script usefull.

![plot_dataframe](https://github.com/il-katta/freqtrade-scripts/raw/master/plot_backtest.png)

Tested with `freqtrade` version `2019.9`

### Install
On linux, in your local freqtrade directory run:

```shell script
curl -sL https://github.com/il-katta/freqtrade-scripts/archive/master.tar.gz | tar xz -C scripts --strip-components=1
```

This command will download this repository into `scripts` directory.

### How to use

* Run the script

```shell script
python scripts/plot_backtest.py
```

```
 * Serving Flask app "plot_backtest" (lazy loading)
 * Environment: production
   WARNING: This is a development server. Do not use it in a production deployment.
   Use a production WSGI server instead.
 * Debug mode: off
 * Running on http://127.0.0.1:5000/ (Press CTRL+C to quit)
```

* open <http://localhost:5000/> with your favorite web browser.

#!/usr/bin/env python3

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict

import pandas as pd
from flask import Flask, request, render_template, jsonify

from freqtrade.data.btanalysis import extract_trades_of_period
from freqtrade.plot.plotting import (init_plotscript)
from freqtrade.resolvers import StrategyResolver
from freqtrade.state import RunMode
from freqtrade.utils import setup_utils_configuration

logger = logging.getLogger(__name__)


def generate_markers(trades: pd.DataFrame, data: pd.DataFrame) -> list:
    markers = []

    for _, trade in trades.iterrows():
        open_time = trade['open_time'].timestamp()
        close_time = trade['close_time'].timestamp()
        sell_reason = trade['sell_reason']
        profitperc = trade['profitperc']
        index = trade['index']

        markers.append(
            {
                "time": open_time,
                "position": 'belowBar',  # inBar | aboveBar | belowBar
                "color": 'black',
                "shape": 'arrowUp',
                "id": f"open_{index}"
            },
        )

        if sell_reason == 'roi':
            color = 'green'
        elif sell_reason == 'stop_loss':
            color = 'red'
        elif sell_reason == 'sell_signal':
            if profitperc > 0:
                color = 'orange'
            else:
                color = 'purple'
        elif sell_reason == 'force_sell':
            color = 'gray'
        else:
            color = 'black'

        markers.append(
            {
                "time": close_time,
                "position": 'aboveBar',  # inBar | aboveBar | belowBar
                "color": color,
                "shape": 'arrowDown',
                "id": f"{sell_reason}_{index}"
            },
        )
    for _, row in data.loc[data['buy'] == 1].iterrows():
        time = int(row['date'].timestamp())
        markers.append(
            {
                "time": time,
                "position": 'belowBar',  # inBar | aboveBar | belowBar
                "color": 'blue',
                "shape": 'circle',
                "id": f"{_}"
            },
        )
    return markers


def analyze_results(pair, data, trades, indicators1, indicators2):
    jdata = [{
        'time': int(d['date'].timestamp()),
        'open': float(d['open']),
        'high': float(d['high']),
        'low': float(d['low']),
        'close': float(d['close'])
    } for _, d in data.iterrows()]

    markers = generate_markers(trades, data)

    j_indicators2 = {
        indicator: [
            {'time': v['date'].timestamp(), 'value': float(v[indicator])}
            for _, v in data.iterrows()
            if not pd.isna(v[indicator])
        ]
        for indicator in indicators2
        if indicator in data.keys()
    }

    j_indicators1 = {
        indicator: [
            {'time': v['date'].timestamp(), 'value': float(v[indicator])}
            for _, v in data.iterrows()
            if not pd.isna(v[indicator])
        ]
        for indicator in indicators1
        if indicator in data.keys()
    }

    return {
        'pair': pair,
        'indicators1': j_indicators1,
        'indicators2': j_indicators2,
        'candles': jdata,
        'markers': markers,
    }


def parse_indicators(indicators):
    if not indicators:
        indicators = []
    elif ',' not in indicators:
        indicators = [indicators]
    else:
        indicators = indicators.split(',')
    return indicators


def analyse_and_plot_pairs(config: Dict[str, Any]):
    plot_elements = init_plotscript(config)
    trades = plot_elements['trades']
    strategy = StrategyResolver(config).strategy

    pair_counter = 0
    plots = []
    for pair, data in plot_elements["tickers"].items():
        pair_counter += 1
        logger.info("analyse pair %s", pair)
        tickers = {}
        tickers[pair] = data

        dataframe = strategy.analyze_ticker(tickers[pair], {'pair': pair})

        trades_pair = trades.loc[trades['pair'] == pair]
        trades_pair = extract_trades_of_period(dataframe, trades_pair)

        plots.append(
            analyze_results(
                pair=pair,
                data=dataframe,
                trades=trades_pair,
                indicators1=parse_indicators(config['indicators1'] if 'indicators1' in config.keys() else None),
                indicators2=parse_indicators(config['indicators2'] if 'indicators2' in config.keys() else None)
            )
        )

    logger.info('End of ploting process %s plots generated', pair_counter)
    return plots


def plot_parse_args(args: Dict[str, Any]) -> Dict[str, Any]:
    config = setup_utils_configuration(args, RunMode.OTHER)
    return config


app = Flask(__name__, template_folder=os.path.dirname(os.path.realpath(__file__)))

_results = []


def store_results(results: list):
    import pickle
    try:
        pickle.dump(results, open("results.p", "wb"))
    except:
        pass


def load_results() -> list:
    import pickle
    try:
        return pickle.load(open("results.p", "rb"))
    except:
        return []


@app.route('/')
def index():
    return render_template(
        f'{Path(__file__).stem}.html',
    )


@app.route('/previous_results.json')
def previous_results():
    global _results
    return jsonify(_results)


@app.route('/start', methods=['POST'])
def start():
    global _results
    try:
        config = request.get_json()
        default_conf = {
            "config": ['config.json'],
            # "datadir": None,
            # "db_url": None,
            # "export": None,
            "exportfilename": os.path.join('user_data', 'backtest_results', 'backtest-result.json'),
            "indicators1": 'sma,ema3,ema5',
            "indicators2": 'macd,macdsignal',
            # "logfile": None,
            # "pairs": [],
            # "plot_limit": None,
            "refresh_pairs": False,
            # "strategy": None,
            # "strategy_path": None,
            # "timerange": None,
            "trade_source": 'file',
            # "user_data_dir": None,
            # "verbosity": 0,
        }
        default_conf.update(config)

        if default_conf['refresh_pairs']:
            # ccxt used async functions
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        logger.info('Starting Plot Dataframe')
        _results = analyse_and_plot_pairs(
            plot_parse_args(default_conf)
        )
        store_results(_results)
        return jsonify(_results)
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(str(e))
        return jsonify({'message': str(e)}), 500


def path_join(path, *paths):
    return os.path.relpath(os.path.join(path, *paths))


def _lsdir(directory):
    return [path_join(directory, '..')] + [
        path_join(directory, o) for o in os.listdir(directory)
        if os.path.isdir(os.path.join(directory, o))
    ]


@app.route('/ls/')
def lsdir():
    directory = request.args.get('dir', '.')
    return jsonify(_lsdir(directory))


@app.route('/stop', methods=['POST'])
def stop():
    shutdown = request.environ.get('werkzeug.server.shutdown')
    if shutdown is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    shutdown()
    return jsonify({'message': 'shutting down ...'})


if __name__ == '__main__':
    DEBUG = os.getenv('DEBUG', '0').lower() in ['1', 'true', 'yes', 'y']
    if DEBUG:
        _results = load_results()

    jinja_options = app.jinja_options.copy()
    jinja_options.update(dict(
        block_start_string='<%',
        block_end_string='%>',
        variable_start_string='%%',
        variable_end_string='%%',
        comment_start_string='<#',
        comment_end_string='#>'
    ))
    app.jinja_options = jinja_options
    app.run(debug=DEBUG)

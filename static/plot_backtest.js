import 'https://ajax.googleapis.com/ajax/libs/angularjs/1.7.8/angular.min.js';
import 'https://cdnjs.cloudflare.com/ajax/libs/angular-ui-bootstrap/2.5.0/ui-bootstrap-tpls.min.js';
// import 'https://cdnjs.cloudflare.com/ajax/libs/angular-ui-bootstrap/2.5.0/ui-bootstrap.min.js';
import 'https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js';

angular.module('FreqtradeApp', ['ui.bootstrap']);

angular.module('FreqtradeApp')
    .config(['$uibModalProvider', function ($uibModalProvider) {
        $uibModalProvider.options.windowClass = 'show';
        $uibModalProvider.options.backdropClass = 'show';
    }]);

angular.module('FreqtradeApp')
    .factory('LightweightChartApi', ['$rootScope', function ($rootScope) {
        return {
            colors: [
                '#ff0058',
                '#9500ff',
                '#0026ff',
                '#00c5ff',
                '#47bd00',
                '#bcbf00',
                '#ffa400',
                '#ff0000',
            ],
            getColor: function () {
                return this.colors[Math.floor(Math.random() * this.colors.length)];
            },
            initializeGraph: function (pair, candles, markers, indicators1, indicators2, volume) {
                const chart = LightweightCharts.createChart(document.getElementById('graph'));
                chart.applyOptions({
                    watermark: {
                        color: 'rgba(11, 94, 29, 0.4)',
                        visible: true,
                        text: pair,
                        fontSize: 48,
                        horzAlign: 'center',
                        vertAlign: 'center',
                    },
                    timeScale: {
                        visible: true,
                        timeVisible: true,
                    }
                });
                console.log("creating candlestick series object");
                const series = chart.addCandlestickSeries();
                console.log("adding data to candlestick serie: ", candles);
                series.setData(candles);

                // trades and signals
                console.log("adding markers to candlestick serie: ", markers);
                series.setMarkers(markers);

                console.log("adding indicators1 to candlestick serie: ", indicators1);
                angular.forEach(indicators1, function (data, key) {
                    const lineSeries = chart.addLineSeries({
                        overlay: false,
                        title: key,
                        color: this.getColor(),
                        lineWidth: 2,
                    });
                    lineSeries.setData(data)
                }.bind(this));

                chart.subscribeVisibleTimeRangeChange(function (variation) {
                    $rootScope.$broadcast('VisibleTimeRangeChange', {source: chart, variation: variation});
                });

                $rootScope.$on('VisibleTimeRangeChange', function (event, data) {
                    if (data.source !== chart) {
                        chart.timeScale().setVisibleRange(data.variation);
                    }
                });

                chart.subscribeCrosshairMove(function (e) {
                    if (e.hoveredMarkerId) {
                        // TODO: visualize marker info
                        console.log("marker", e.hoveredMarkerId);
                    }
                    if (!e.seriesPrices) return;
                    e.seriesPrices.forEach(function (price, serie) {
                        // TODO: visualize this prices
                        //console.log(serie.options().title, serie.priceFormatter().format(price));
                    });
                });

                console.log("adding indicators2 to candlestick serie: ", indicators2);
                if (indicators2) {
                    angular.forEach(indicators2, function (data, key) {
                        const indicators2_chart = LightweightCharts.createChart(document.getElementById('indicators2'));
                        indicators2_chart.applyOptions({
                            watermark: {
                                color: 'rgba(11, 94, 29, 0.4)',
                                visible: true,
                                text: key,
                                fontSize: 24,
                                horzAlign: 'center',
                                vertAlign: 'center',
                            },
                            timeScale: {
                                visible: true,
                                timeVisible: true,
                            }
                        });

                        const lineSeries = indicators2_chart.addLineSeries({
                            overlay: true,
                            title: key,
                            color: this.getColor(),
                            lineWidth: 2,
                        });
                        lineSeries.setData(data);

                        indicators2_chart.subscribeVisibleTimeRangeChange(function (variation) {
                            $rootScope.$broadcast('VisibleTimeRangeChange', {
                                source: indicators2_chart,
                                variation: variation
                            });
                        });

                        $rootScope.$on('VisibleTimeRangeChange', function (event, data) {
                            if (data.source !== indicators2_chart) {
                                indicators2_chart.timeScale().setVisibleRange(data.variation);
                            }
                        });

                    }.bind(this));
                }

                if (angular.isDefined(volume)) {
                    var volumeSeries = chart.addHistogramSeries({
                        color: '#26a69a',
                        lineWidth: 2,
                        priceFormat: {
                            type: 'volume',
                        },
                        overlay: true,
                        scaleMargins: {
                            top: 0.6,
                            bottom: 0,
                        },
                    });
                    volumeSeries.setData(volume);
                }
            },
        };
    }]);

angular.module('FreqtradeApp').controller('BacktestController', [
    '$scope', '$http', 'LightweightChartApi', '$uibModal',
    function ($scope, $http, LightweightChartApi, $uibModal) {
        // default config loaded at start
        $scope.config = {
            'strategy': 'DefaultStrategy',
            'indicators1': 'sma,ema3,ema5',
            'indicators2': 'macd,macdsignal',
            'config': ['config.json'],
            'pairs': [],
            'exportfilename': 'user_data/backtest_results/backtest-result.json',
            'export': 'trades',
        };

        $scope.storeConfig = function () {
            if (!('localStorage' in window)) return;
            let jConfig = JSON.stringify($scope.config);
            localStorage.setItem('freqtrade_backtest_config', jConfig);
        };

        $scope.restoreConfig = function () {
            if (!('localStorage' in window)) return;
            let jConfig = localStorage.getItem('freqtrade_backtest_config');
            if (jConfig) {
                $scope.config = JSON.parse(jConfig);
            }
        };

        // load previous results
        $scope.load = function () {
            $scope.loading = true;
            $scope.clean();
            $http({url: '/previous_results.json'}).then(
                // success
                function (response) {
                    $scope.loading = false;
                    $scope.data = response.data;
                    angular.forEach(response.data, function (result) {
                        LightweightChartApi.initializeGraph(
                            result.pair,
                            result.candles,
                            result.markers,
                            result.indicators1,
                            result.indicators2
                        );
                    });
                },
                // error
                function (response) {
                    $scope.loading = false;
                    console.error("error getting response from server:", response);
                }
            );
        };

        $scope.clean = function () {
            console.log("removing existing graph");
            document.getElementById("graph").innerHTML = "";
            document.getElementById("indicators2").innerHTML = "";
        };

        // submit configuration and get backtest result
        $scope.startBacktest = function () {
            $scope.loading = true;
            $scope.storeConfig();
            $http({
                method: 'POST',
                url: '/start',
                data: $scope.config
            }).then(
                // success
                function (response) {
                    console.log("backtest results recived");
                    $scope.loading = false;
                    $scope.data = response.data;
                    angular.forEach(response.data, function (result) {
                        LightweightChartApi.initializeGraph(
                            result.pair,
                            result.candles,
                            result.markers,
                            result.indicators1,
                            result.indicators2
                        );
                    });
                },
                // error
                function (response) {
                    $scope.loading = false;
                    console.error("error getting response from server:", response);
                }
            );
            $scope.clean();
        };

        $scope.selectFolder = function (varname) {
            var modalInstance = $uibModal.open({
                templateUrl: 'folder_select.html',
                controller: 'FolderSelectorCtrl',
                controllerAs: '$ctrl',
                appendTo: angular.element(document.body),
                resolve: {
                    items: function () {
                        return $http({
                            url: '/ls'
                        }).then(function (response) {
                            return response.data;
                        });
                    }
                }
            });

            modalInstance.result.then(function (selectedItem) {
                $scope.config[varname] = selectedItem;
            });
        };

        // main
        $scope.restoreConfig();
        $scope.load();

    }
]);

angular.module('FreqtradeApp').controller('FolderSelectorCtrl', [
    '$uibModalInstance', '$scope', '$http', 'items',
    function ($uibModalInstance, $scope, $http, items) {
        $scope.items = items;
        $scope.loading = false;
        $scope.select = function ($event, dir) {
            $event.preventDefault();
            $scope.selected = dir;
            $scope.loading = true;
            $http({
                url: '/ls',
                params: {'dir': dir}
            }).then(function (response) {
                $scope.items = response.data;
            });
        };
        $scope.confirm = function () {
            $uibModalInstance.close($scope.selected);
        };
        $scope.cancel = function () {
            $uibModalInstance.dismiss('cancel');
        };
    }
]);
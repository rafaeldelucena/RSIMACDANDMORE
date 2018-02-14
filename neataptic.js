// npm install neataptic --save
const neataptic = require('neataptic')
const _ = require('lodash');
const config = require ('../core/util.js').getConfig();
const async = require ('async');
const log = require('../core/log.js');

// let's create our own method
var method = {};

// prepare everything our method needs
method.init = function() {
    this.name = '007';
    this.requiredHistory = config.tradingAdvisor.historySize;
    this.price = 0;
    this.open_order = false;

    // preprate neural network
    this.network = new neataptic.architect.LSTM(2,9,1);
    this.trainingData = [];
    this.real = [];
    this.obj = {};
    this.base = 20000;

    // prepare indicators
    this.addTulipIndicator('myema', 'ema', {optInTimePeriod: 6}); // We are aiming for 5 to 15mins candle, and 10 to 21 candle for our EMA value
	// Last EMA Value so we know if next EMA is above or bellow to know the current trend

	this.lastEMAValue = 0;
	this.lastEMA = 0;
}

// what happens on every new candle? 
method.update = function(candle) {

    if (this.lastEMAValue == 0) {
        this.lastEMAValue = this.tulipIndicators.myema.result.result;
        return;
    }

    this.real.push(candle.close);
    var last_real = this.real[this.real.length-1];

	// EMA < 0 = downtrend
	// EMA > 0 = uptrend
    var emaValue = this.tulipIndicators.myema.result.result;
	var ema = emaValue-this.lastEMAValue;
	this.lastEMA = ema;
	// Update lastEMA
	this.lastEMAValue=emaValue;


    this.obj['input'] = [ema,candle.volume/10000]; 
    this.obj['output'] = [ema];

    // train the neural network
    //log.info(this.obj);
    //log.info(this.trainingData);
    this.trainingData.push(this.obj);
    //this.trainingData.push({input: [ema/this.base,candle.volume/10000], output:[ema/this.base]});
    this.network.train(this.trainingData, {
        log: 0,
        iterations: 1000,
        error: 0.03,
        rate: 0.005,
        clear: true
    });
   
}


method.log = function() {

}

// check is executed after the minimum history input
method.check = function(candle) {
    if (this.lastEMA == 0) {
        return;
    }

    /* Candle information
    { id: 103956,
      start: moment("2018-02-04T00:00:00.000"),
      open: 9080.49,
      high: 9218.98,
      low: 9022,
      close: 9199.96,
      vwp: 9097.252446880359,
      volume: 802.5146890000001,
      trades: 8086 }
    */

    // ema
    var ema = this.lastEMA;

    //let's predict the current trend
    var predicted_value = this.network.activate(ema,candle.volume/10000);

    // % change in current trend and last trend
    //var percentage = ((predicted_value-candle.close)/candle.close)*100;
	var percentage = 100-(100*predicted_value)/this.lastEMA;
	log.info("--------------------");
	log.info("Predicted EMA : ",predicted_value);
	log.info("Last EMA : ",this.lastEMA);
	log.info("Percentage : ",percentage);
    
	if(percentage > 1 && !this.open_order)
    {
        log.info("Buy: $"+candle.close);
        this.price = candle.close;
        this.open_order = true;
        return this.advice('long');

    }else if(this.open_order && percentage < 0){
        this.open_order = false;
        log.info("Sold: $"+candle.close);
        return this.advice('short');

    }

    return this.advice();
}

module.exports = method;

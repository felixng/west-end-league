require('newrelic');
var TweetCounter = require('./tweetCounter.js');
var debug = false;

var Twit = require('twit');
var redis = require('redis').createClient(process.env.REDIS_URL || "redis://h:p681205353c4df3fcd2ac99172b553019835bd15ea1a943fb759dc3c5ac344aa9@ec2-34-251-82-220.eu-west-1.compute.amazonaws.com:16849");
var T = new Twit(require('./config.js'));
var counter = new TweetCounter(T, redis);

// retweetLatest();
// setInterval(retweetLatest, 1000 * 60 * 12);1
counter.gatherAll();

var express = require('express');
var app = express();

app.get('/', function(req, res) {
  res.status(200).send('I dream of being a website.. please follow us on https://twitter.com/dayseaters or DM us to join.');
});

var port = process.env.PORT || 1337;
var httpServer = require('http').createServer(app);
httpServer.listen(port, function() {
    console.log('Digital Usher running on port ' + port + '.');
});
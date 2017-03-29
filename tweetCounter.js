function TweetCounter(T, redis, offset = 5) {
    var fs = require('fs');
    var http = require("http");

    var debug = process.env.DEBUG || true;
    var includeRetweet = process.env.INCLUDE_RETWEET || true;
    var retweetWeight = process.env.RETWEET_WEIGHT || 0.3;
    var googleQuery = process.env.GOOGLESHEET_QUERY || 'id=1GsNXv7Na24WB5XzKCKlHl_72GLAxOrs9K_v2sYQ4eQ4&sheet=1';

    var tweetTotal = 0;
    var retweetTotal = 0;
    var score = 0;

    //Parsing Dates: Yesterday and the Day Before
    var date = new Date();
    date.setDate(date.getDate() - offset);
    var yesterday = date.toJSON().slice(0,10).replace(/-/g,'-');
    console.log("Yesterday: " + yesterday);

    date.setDate(date.getDate() - 1);
    var theDayBefore = date.toJSON().slice(0,10).replace(/-/g,'-');
    console.log("The Day Before Yesterday: " + theDayBefore);

    // Parsing Query
    // var query = process.env.RANKING_QUERY || "@HPPlayLDN";
    var since = " since:" + theDayBefore;
    var until = " until:" + yesterday;

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function logToRedis(handle){
        
        console.log('tweetTotal:', tweetTotal);
        console.log('retweetTotal:', retweetTotal);            
        console.log('score:', score);

        var key = [ 'daily', yesterday, handle ]

        redis.hmset( key.join(':'),
                    {
                        'tweetTotal': tweetTotal, 
                        'retweetTotal': retweetTotal, 
                        'retweetWeight': retweetWeight, 
                        'createdAt': new Date(), 
                        'score': score, 
                    },
            function(err, reply) {
              console.log(reply);
            }
        );
    }

    function getJSON(options, onResult)
    {
        console.log("rest::getJSON");

        var prot = options.port == 443 ? https : http;
        var req = prot.request(options, function(res)
        {
            var output = '';
            //console.log(options.host + ':' + res.statusCode);
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                output += chunk;
            });

            res.on('end', function() {
                var obj = JSON.parse(output);
                onResult(res.statusCode, obj);
            });
        });

        req.on('error', function(err) {
            //res.send('error: ' + err.message);
        });

        req.end();
    };

    function logToFile(data){
        if (debug){
            var json = JSON.stringify(data,null,2);
            //fs.appendFile("tweet.json", json, function(){});    
            fs.writeFile("tweet.json", json, function(){});    
        }
    }


    function calculateTweets(tweets) {
        if (tweets.statuses){
            tweetTotal += tweets.statuses.length;

            tweets.statuses.forEach( (tweet) => {
                retweetTotal += tweet.retweet_count;
            });
        }
    };

    function getHandles(callback){
        var options = {
          hostname: 'gsx2json.com',
          path: '/api?' + googleQuery,
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        };

        var handles = []

        console.log(options.path);

        getJSON(options, function(status, result) {
            if (result && result.rows && result.rows.length > 0){
                var productions = result.rows;
                
                for (var i = 0; i < productions.length; i++){
                    if (productions[i].tocrawl &&
                        productions[i].twitter && 
                        productions[i].twitter != '' &&
                        productions[i].twitter != '-') {
                        
                        if (!productions[i].twitter.startsWith('#')){
                            productions[i].twitter = '@' + productions[i].twitter;
                        }

                        handles.push(productions[i].twitter);
                    }
                }
            }

            callback(handles);
        });
    }

    function getTweetChunk(query, max_id) {
        return new Promise( (resolve, reject) => {
            var nextSearch = query;
            nextSearch.max_id = max_id;

            T.get('search/tweets', nextSearch, function(error, data) {
                logToFile(data);
                calculateTweets(data);
                resolve(data);

                if (error){
                    console.log(error);
                }
            });
        })
        .then( data => {
            if ( data.statuses && data.statuses.length > 98) {
                return getTweetChunk(query, data.statuses[data.statuses.length - 1].id);
            } else {

                if (includeRetweet){
                    score = tweetTotal + (retweetTotal * retweetWeight);
                    score = Math.round(score);
                }
                else{
                    score = tweetTotal;
                }

                logToRedis();
            }
        });
    };

    function gather(handle, index){
        var query = { q: handle + since + until,
                       geocode: "51.528308,-0.3817765,500mi", 
                       count: 99,
                       result_type: "recent", 
                       lang: 'en', 
                       include_entities: false,
                       result_type: 'recent' };

        T.get('search/tweets', query, function(error, data) {
            console.log("Query: " + handle);
            
            logToFile(data);
            if (data.statuses && data.statuses.length > 0){
                calculateTweets(data);
                getTweetChunk(query, data.statuses[data.statuses.length - 1].id);
            }
            else{
                logToRedis(handle);
            }

            if (error){
                console.log(error);
            }
        });
    };

    this.gather = function(handle){
        gather(handle);
    }

    this.gatherAll = function(){
        getHandles(function(handles){
            handles.forEach(gather);
        });
    }
}

module.exports = TweetCounter;
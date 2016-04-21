var restify = require("restify");
var restler = require("restler-q");
var config = require("./config");
var async = require("async");
var mysql = require('mysql');
var Q = require("q");

var server = restify.createServer();
var options = {
	username: config.username,
	password: config.password
};

server.use(
	function crossOrigin(req,res,next){
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "X-Requested-With");
		return next();
	}
);

var query = function(sql) {
	var deferred = Q.defer();
	pool.getConnection(function(err, connection) {
		if (err) {
			connection.release();
			deferred.reject(err);
			return;
		}
		// console.log('connected as id ' + connection.threadId);
		connection.query(sql, function(err,rows) {
			connection.release();
			if(err) {
				deferred.reject(err);
				return;
			}
			deferred.resolve(rows);
		});
	});
	return deferred.promise;
};

configParams = function(opts) {
	opts = opts || {};
	opts.apikey = this.apikey;
	var parts = [];
	for (var opt in opts) {
		parts.push(opt + "=" + opts[opt]);
	}
	return parts.join("&");
};

var get = function(endpoint, params) {
	return restler.get(config.api + "/" + endpoint + "?" + configParams(params), options);
};

var mapIds = function(objs) {
	var result = {};
	objs.forEach(function(obj) {
		result[obj._id] = obj;
	});
	return result;
};

server.get("/user/random/:count", function(req, res) {
	
	var count = req.params.count;
	if (count > 10)
		count = 10;
	console.time("user/random/" + count);
	get("user", { 
		"filter[status]": "active",
		// "autopopulate": 1,
		// limit: 10,
	})
	.then(function(result) {
		var queue = [];
		var users = result.data.filter(function(user) {
			if (!user.about)
				return false;
			if (!user.about.length)
				return false;
			if (!user.about[0].trim())
				return false;
			if (!user.img)
				return false;
			if (user.img.indexOf("grey_avatar_1.png") !== -1)
				return false;
			if (!user.urlid)
				return false;
			return true;
		});
		var max = users.length;
		if (count > max)
			count = max;
		
		// console.log(req.params.count);
		var tmp = [];
		while(tmp.length < count) {
			var rand = Math.floor((Math.random() * max));
			if (tmp.indexOf(rand) === -1) {
				tmp.push(rand);
			}
		}
		var finalUsers = [];
		tmp.forEach(function(id) {
			finalUsers.push(users[id]);
		});

		var data = finalUsers.map(function(user) {
			return {
				name: user.name,
				organisation: user.organisation_id.name,
				website: user.organisation_id.website,
				location: user.location_id.name,
				about: user.about,
				img: user.img,
				twitter: user.organisation_id.twitter,
				id: user.urlid,
				position: user.position,
			};
		});
		console.timeEnd("user/random/" + count);
		res.send({ status: "ok", count: data.length, data: data });
		
	}, function(err) {
		console.timeEnd("user/random/" + count);
		console.error(err);
		throw(err);
	});
});

server.get("/event", function(req, res) {
	console.time("event");
	var date = new Date();
	var today = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
	var locations = null;
	get("location")
	.then(function(result) {
		locations = mapIds(result.data);
		return get("booking", {
		"filter[start_time]": "$gte:" + today,
		"filter[public_event]": true,
		"autopopulate": true });
	}).then(function(result) {
		var data = result.data.map(function(event) {
			return {
				"room_name": event.room.name,
				"room_img": event.room.img,
				"location": locations[event.room.location].name,
				"start_time": event.start_time,
				"end_time": event.end_time,
				"title": event.title,
				"description": event.description,
				booking_url: event.booking_url,
				website: event.website,
				address: event.room.name + "<br>\r\n" + locations[event.room.location].name + "<br>\r\n" + locations[event.room.location].address,
				id: event._id,
				img: event.img,
			};
		});
		console.timeEnd("event");
		res.send({ status: "ok", count: data.length, data: data });
	}, function(err) {
		console.error(err);
		console.timeEnd("event");
		res.send(500, err);
	});
});

server.listen(config.port, function() {
	console.log('%s listening at %s', server.name, server.url);
});
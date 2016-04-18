var restify = require("restify");
var restler = require("restler-q");
var config = require("./config");
var async = require("async");

var server = restify.createServer();
var options = {
	username: config.username,
	password: config.password
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
	var getUser = function(offset, callback) {
		console.log("Fetching offset", offset);
		get("user", { 
			"filter[status]": "active",
			"autopopulate": 1,
			limit: 1,
			page: offset
		})
		.then(function(result) {
			var user = result.data.pop();
			callback(null, user);
		}, function(err) {
			console.error(err);
			callback(err);
		});
	};
	var count = req.params.count;
	if (count > 10)
		count = 10;
	console.time("user/random/" + count);
	get("user", { 
		"filter[status]": "active",
		// "autopopulate": 1,
		limit: 1
	})
	.then(function(result) {
		console.log(result);
		var max = result.count;
		if (count > max)
			count = max;
		var queue = [];
		// console.log(req.params.count);
		var tmp = [];
		while(tmp.length < count) {
			var rand = Math.floor((Math.random() * max));
			if (tmp.indexOf(rand) === -1) {
				tmp.push(rand);
			}
		}
		async.mapSeries(tmp, getUser, function(err, users) {
			if (err) {
				console.error(err);
				res.send(500, err);
			}
			console.log(users);
			var data = users.map(function(user) {
				return {
					name: user.name,
					organisation: user.organisation_id.name,
					website: user.organisation_id.website,
					location: user.location_id.name,
					about: user.about,
					img: user.img,
					twitter: user.organisation_id.twitter,
				};
			});
			console.timeEnd("user/random/" + count);
			res.send({ status: "ok", count: data.length, data: data });
		});
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
				"start_time": true,
				"end_time": true,
				"title": event.title,
				"description": event.description,
			};
		});
		console.timeEnd("event");
		res.send(data);
	}, function(err) {
		console.error(err);
		console.timeEnd("event");
		res.send(500, err);
	});
});

// server

server.listen(config.port, function() {
	console.log('%s listening at %s', server.name, server.url);
});
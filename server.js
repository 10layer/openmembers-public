var restify = require("restify");
var restler = require("restler-q");
var config = require("./config");
var async = require("async");
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

var get = function(endpoint, params, opts) {
	opts = opts || options;
	console.log(opts);
	console.log(config.api + "/" + endpoint + "?" + configParams(params));
	return restler.get(config.api + "/" + endpoint + "?" + configParams(params), opts);
};

var mapIds = function(objs) {
	var result = {};
	objs.forEach(function(obj) {
		result[obj._id] = obj;
	});
	return result;
};

var locations = null;
var events = null;

var getEvents = function() {
	console.time("getEvents");
	var date = new Date();
	var today = date.getTime();
	get("location")
	.then(function(result) {
		locations = mapIds(result.data);
		return get("booking", {
			"filter[end_time]": "$gte:" + today,
			"filter[public_event]": true,
			"autopopulate": true 
		});
	}).then(function(result) {
		events = result.data.map(function(event) {
			return eventMap(event);
		});
		console.timeEnd("getEvents");
	}, function(err) {
		console.error(err);
		console.timeEnd("getEvents");
	});
};

var userMap = function(user) {
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
		_id: user._id,
	};
};

var users = null;
var getUsers = function() {
	console.time("getUsers");
	get("user", { 
		"filter[status]": "active",
		autopopulate: true
	})
	.then(function(result) {
		users = result.data.filter(function(user) {
			if (!user.about)
				return false;
			if (!user.about.length)
				return false;
			if (user.hidden)
				return false;
			// if (!user.about.trim())
			// 	return false;
			if (!user.img)
				return false;
			if (user.img.indexOf("grey_avatar_1.png") !== -1)
				return false;
			if (!user.urlid)
				return false;
			return true;
		});
		users = users.map(function(user) {
			return userMap(user);
		});
		console.log("Retrieved " + users.length + " users");
		console.timeEnd("getUsers");
	})
	.catch(function(err) {
		console.trace(err);
	});
};

var updateCache = function() {
	getUsers();
	getEvents();
};

setInterval(updateCache, config.timeout || 60000);

updateCache();

server.get("/user/random/:count", function(req, res) {
	var count = req.params.count;
	console.time("user/random/" + req.params.count);
	if (count > 10)
		count = 10;
	var max = users.length;
	if (count > max)
		count = max;
	var tmp = [];
	while(tmp.length < count) {
		var rand = Math.floor((Math.random() * max));
		if (tmp.indexOf(rand) === -1) {
			tmp.push(rand);
		}
	}
	var data = [];
	tmp.forEach(function(id) {
		data.push(users[id]);
	});
	res.send({ status: "ok", count: data.length, data: data });
	console.timeEnd("user/random/" + req.params.count);
});

server.get("/user/:urlid", function(req, res) {
	console.time("user/" + req.params.urlid);
	var user = users.find(function(user) {
		return user.id === req.params.urlid;
	});
	if (!user) {
		res.send(404, "User not found");
		console.timeEnd("user/" + req.params.urlid);
		return;
	}
	res.send(user);
	console.timeEnd("user/" + req.params.urlid);
});

var eventMap = function(event) {
	// console.log(event);
	var ts = new Date(event.start_time);
	return {
		"room_name": event.room.name,
		"room_img": event.room.img,
		"location": locations[event.room.location].name,
		"start_time": event.start_time,
		"end_time": event.end_time,
		"title": event.title,
		"description": event.description,
		location_id: event.room.location,
		booking_url: event.booking_url,
		website: event.website,
		address: event.room.name + "<br>\r\n" + locations[event.room.location].name + "<br>\r\n" + locations[event.room.location].address,
		id: event._id,
		img: event.img,
		start_time_time: ts.getHours() + ":" + ts.getMinutes()
	};
};

server.get("/event", function(req, res) {
	console.time("event");
	console.log(events);
	res.send({ status: "ok", count: events.length, data: events });
	console.timeEnd("event");
});

server.get("/events/:location_id", (req, res) => {
	console.time("events" );
	var data = events.filter((event) => {
		return (event.location_id == req.params.location_id);
	});
	res.send({ status: "ok", count: data.length, data: data });
	console.timeEnd("events");
});

server.get("/event/:event_id", function(req, res) {
	console.time("booking/" + req.params.event_id);
	var event = events.find(function(event) {
		return event.id === req.params.event_id;
	});
	if (!event) {
		res.send(404, "Event not found");
		console.timeEnd("booking/" + req.params.event_id);
		return;
	}
	res.send(event);
	console.timeEnd("booking/" + req.params.event_id);
});

//Tenth free coffee

server.use(restify.authorizationParser());

server.get("/coffee", function(req, res) {
	var coffeeNames = [
		"Flat White", "Americano", "Cappucino", "Cafe Latte", "Chai Latte", "Almond/ Soy Cappucino", "Mocha", "Decaf ", "Dbl Espresso", "Hot Chocolate", "Ceylon Tea", "Rooibos Tea", "Green Tea", "Earl Grey Blue"
	];
	var juiceNames = [ 
		"Vitamin G", "The Goblin", "Up the Beet ", "Citrus Zinger"
	];
	var auth = req.authorization;
	var name = "";
	get("user", {
		"filter[email]": auth.basic.username
	}, { username: auth.basic.username, password: auth.basic.password })
	.then(function(result) {
		// console.log(result);
		var user = result.data.pop();
		var user_id = user._id;
		name = user.name;
		return get("ledger", {
			"filter[user_id]": user_id,
			"filter[cred_type]": "stuff",
			"filter[transaction_type]": "debit"
		}, { username: auth.basic.username, password: auth.basic.password });
	})
	.then(function(result) {
		var transactions = result.data.filter((transaction) => {
			return !!(transaction.details);
		});
		var purchased = transactions.map((transaction) => {
			try {
				return JSON.parse(transaction.details);
			} catch(e) {
				return [];
			}
		});
		var coffees = 0;
		var juices = 0;
		purchased.forEach((purchases) =>{
			purchases.forEach(purchase => {
				if (coffeeNames.indexOf(purchase.name) > -1) {
					coffees += parseInt(purchase.qty);
					console.log("Coffee", purchase.qty, parseInt(purchase.qty));
				}
				if (juiceNames.indexOf(purchase.name) > -1) {
					juices += parseInt(purchase.qty);
					console.log("Juice", purchase.qty, parseInt(purchase.qty));
				}
			});
		});
		res.send({ name: name, coffees: coffees, juices: juices });
	}, function(err) {
		res.send(err);
	});
});

server.listen(config.port, function() {
	console.log('%s listening at %s', server.name, server.url);
});
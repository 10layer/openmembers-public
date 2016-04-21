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

var pool = mysql.createPool(config.mysql);

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

server.get("/dbtest", function(req, res) {
	console.time("dbtest");
	query("SELECT * FROM wp_posts LIMIT 10")
	.then(function(result) {
		console.timeEnd("dbtest");
		res.send(result);
	}, function(err) {
		console.timeEnd("dbtest");
		res.send(500, err);
	});
});

var asyncQuery = function(sql, callback) {
	query(sql)
	.then(function(result) {
		callback(null, result);
	}, function(err) {
		console.error(err);
		callback(err);
	});
};

var mysql_real_escape_string = function(str) {
	if (!str)
		return "";
	if (!str.replace)
		return "";
    return str.replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, function (char) {
        switch (char) {
            case "\0":
                return "\\0";
            case "\x08":
                return "\\b";
            case "\x09":
                return "\\t";
            case "\x1a":
                return "\\z";
            case "\n":
                return "\\n";
            case "\r":
                return "\\r";
            case "\"":
            case "'":
            case "\\":
            case "%":
                return "\\"+char; // prepends a backslash to backslash, percent,
                                  // and double/single quotes
        }
    });
};

var imageSize = function(img) {
	var deferred = Q.defer();
	var http = require('http');
	var imagesize = require('imagesize');
	var request = http.get(img, function (response) {
		imagesize(response, function (err, result) {
			if (err)
				deferred.reject(err);
    		// do something with result
    		console.log("IMage size", result);
    		deferred.resolve(result);
			// we don't need more data
			request.abort();
		});
	});
	return deferred.promise;
};

server.get("/populate/users", function(req, res) {
	console.time("populateUsers");
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
		// console.log(users);
		users.forEach(function(user) {
			var sql = function(callback) {
				var id = null;
				var imgid = null;
				query("INSERT INTO `wp_posts` (`ID`, `post_author`, `post_date`, `post_date_gmt`, `post_content`, `post_title`, `post_excerpt`, `post_status`, `comment_status`, `ping_status`, `post_password`, `post_name`, `to_ping`, `pinged`, `post_modified`, `post_modified_gmt`, `post_content_filtered`, `post_parent`, `guid`, `menu_order`, `post_type`, `post_mime_type`, `comment_count`) VALUES (NULL, '1', NOW(), NOW(), '" + mysql_real_escape_string(user.about) + "', '" + mysql_real_escape_string(user.name) + "', '', 'draft', 'closed', '', '', '" + mysql_real_escape_string(user.urlid) + "', '', '', NOW(), NOW(), '', '0', 'http://w17.open.co.za/member/" + mysql_real_escape_string(user.urlid) + "', '0', 'post-k-teacher', '', '0');")
				.then(function(result) {
					id = result.insertId;
					return query("INSERT INTO `wp_posts` (`ID`, `post_author`, `post_date`, `post_date_gmt`, `post_content`, `post_title`, `post_excerpt`, `post_status`, `comment_status`, `ping_status`, `post_password`, `post_name`, `to_ping`, `pinged`, `post_modified`, `post_modified_gmt`, `post_content_filtered`, `post_parent`, `guid`, `menu_order`, `post_type`, `post_mime_type`, `comment_count`) VALUES (NULL, '1', NOW(), NOW(), '', '" + mysql_real_escape_string(user.name) + " Image', '', 'publish', 'closed', '', '', '" + mysql_real_escape_string(user.urlid) + "-image', '', '', NOW(), NOW(), '', '" + id + "', 'http://w17.open.co.za/wp-content/uploads/myopen/" + mysql_real_escape_string(user.img.replace("/uploads/", "")) + "', '0', 'attachment', 'image/jpeg', '0');");
				})
				.then(function(result) {
					imgid = result.insertId;
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", '_thumbnail_id', " + imgid + ")");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + imgid + ", '_wp_attached_file', 'myopen/" + mysql_real_escape_string(user.img.replace("/uploads/", "")) + "')");
				})
				.then(function(result) {
					callback(null, result);
				})
				.then(null, function(err) {
					console.error(err);
					callback(err);
				});
			};
			// console.log(sql);
			queue.push(sql);
		});
		async.series(queue, function(err, result) {
			console.timeEnd("populateUsers");
			if (err) {
				console.error(err);
				res.send(500, err);
				return;
			}
			res.send(result);
		});
	})
	.then(null, function(err) {
		res.send(500, err);
	});
});

server.get("populate/events", function(req, res) {
	console.time("populateEvents");
	console.time("event");
	var date = new Date();
	var today = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
	var locations = null;
	var queue = [];
	get("location")
	.then(function(result) {
		locations = mapIds(result.data);
		return get("booking", {
		"filter[start_time]": "$gte:" + today,
		"filter[public_event]": true,
		"autopopulate": true });
	}).then(function(result) {
		var events = result.data;
		events.forEach(function(event) {
			var sql = function(callback) {
				var id = null;
				var imgid = null;
				var img = "http://w17.open.co.za/wp-content/uploads/myopen/" + mysql_real_escape_string(event.img.replace("/uploads/", ""));
				query("INSERT INTO `wp_posts` (`ID`, `post_author`, `post_date`, `post_date_gmt`, `post_content`, `post_title`, `post_excerpt`, `post_status`, `comment_status`, `ping_status`, `post_password`, `post_name`, `to_ping`, `pinged`, `post_modified`, `post_modified_gmt`, `post_content_filtered`, `post_parent`, `guid`, `menu_order`, `post_type`, `post_mime_type`, `comment_count`) VALUES (NULL, '1', NOW(), NOW(), '" + mysql_real_escape_string(event.description) + "', '" + mysql_real_escape_string(event.title) + "', '', 'draft', 'closed', '', '', '" + mysql_real_escape_string(event._id) + "', '', '', NOW(), NOW(), '', '0', 'http://w17.open.co.za/event/" + mysql_real_escape_string(event._id) + "', '0', 'post-k-event', '', '0');")
				.then(function(result) {
					id = result.insertId;
					return query("INSERT INTO `wp_posts` (`ID`, `post_author`, `post_date`, `post_date_gmt`, `post_content`, `post_title`, `post_excerpt`, `post_status`, `comment_status`, `ping_status`, `post_password`, `post_name`, `to_ping`, `pinged`, `post_modified`, `post_modified_gmt`, `post_content_filtered`, `post_parent`, `guid`, `menu_order`, `post_type`, `post_mime_type`, `comment_count`) VALUES (NULL, '1', NOW(), NOW(), '', '" + mysql_real_escape_string(event.title) + " Image', '', 'publish', 'closed', '', '', '" + mysql_real_escape_string(event._id) + "-image', '', '', NOW(), NOW(), '', '" + id + "', '" + img  + "', '0', 'attachment', 'image/jpeg', '0');");
				})
				.then(function(result) {
					imgid = result.insertId;
					return imageSize(img);
				})
				.then(function(result) {
					var data = {
						'width': result.width,
						'height': result.heigth,
						'hwstring_small': "height='" + result.height + "' width='" + result.width + "'",
                    	'file': "myopen/" + event.img.replace("/uploads/", ""),
                    	'sizes': [],         // thumbnails etc.
                    	'image_meta': [],    // EXIF data
					};
					console.log("Serialized data", serialize(data));
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + imgid + ", '_wp_attachment_metadata', '" + mysql_real_escape_string(serialize(data)) + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", '_thumbnail_id', " + imgid + ")");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_start_date', '" + event.start_time + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_end_date', '" + event.end_time + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_subscribe_url', '" + event.booking_url + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_address', '" + event.room.name + "\r\n" + locations[event.room.location].name + "\r\n" + locations[event.room.location].address + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_website', '" + event.website + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_email', '" + locations[event.room.location].email + "')");
				})
				.then(function(result) {
					return query("INSERT INTO `wp_postmeta` (`post_id`, `meta_key`, `meta_value`) VALUES (" + id + ", 'event_titlebar_custom_content', '" + event.description + "')");
				})
				.then(function(result) {
					callback(null, { event_id: event._id });
				})
				.then(null, function(err) {
					callback(err);
				});
			};
			queue.push(sql);
		});
		async.series(queue, function(err, result) {
			console.timeEnd("populateEvents");
			if (err) {
				console.error(err);
				res.send(500, err);
				return;
			}
			res.send(result);
		});
	})
	.then(null, function(err) {
		console.timeEnd("populateEvents");
		console.error(err);
		res.send(500, err);
	});
	// res.send("Populating events");
});

server.listen(config.port, function() {
	console.log('%s listening at %s', server.name, server.url);
});
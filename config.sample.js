var config = {
	api: "http://localhost:3001/api",
	username: "me@blah.com",
	password: "password",
	port: 3006,
	mysql: {
		connectionLimit : 100, //important
		host     : 'localhost',
		user     : 'dbuser',
		password : '',
		database : 'dbname',
		debug    :  false
	}
};

module.exports = config;
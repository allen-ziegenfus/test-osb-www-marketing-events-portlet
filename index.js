var fs = require("fs");
var liferay = require("liferay-json");
var winston = require("winston");
var logger = new winston.Logger({
	level: 'info',
	transports: [
		new(winston.transports.Console)()
	]
});

var config = {};
var configDummy = {
	server: "liferay server url",
	user: "optional email adress of liferay user",
	"base64auth": "optional base64 encoded email:password for authentication"
};

var configFile = "./config.json";
try {
	config = JSON.parse(fs.readFileSync(configFile));
}
catch (error) {
	logger.error("Please create config file " + configFile + " with the following syntax in the current directory");
	logger.error(JSON.stringify(configDummy) + "\n");
	throw new Error("Could not find config file: " + configFile);
}

var invokeAndPrint = function(cmd, cb) {
	liferay.invoke_liferay(config, cmd, function(body) {
		logger.info(body.length);
		logger.info(JSON.stringify(body, null, "\t"));
		cb();
	});
};

var minimist = require('minimist');
var options = minimist(process.argv.slice(2));
if (options && options.auth) {
	if (options.auth == "false") {
		console.log("deleting auth");
		delete config.base64auth;
	}
}

var paths = {
	commands: "./commands",
	results: "./results",
	curl: "./curl"
}

fs.readdir(paths.commands, function(err, command_files) {
	command_files.forEach(function(command_file) {
		var cmd = JSON.parse(fs.readFileSync(paths.commands + "/" + command_file));
		logger.info("Invoking " + command_file);
		liferay.invoke_liferay(config, cmd, function(response) {
			fs.writeFileSync(paths.results + "/" + command_file, JSON.stringify(response, null, "\t"));
		});

		var curl_command = "curl '" + config.server + "/api/jsonws/invoke'  --data-urlencode 'cmd=" + JSON.stringify(cmd) + "'";

		fs.writeFileSync(paths.curl + "/" + command_file.replace(".json", ".sh"), curl_command);
	});
});
var firebase = require("firebase");
var csvWriter = require('csv-write-stream')
var fs = require("fs");
var liferay = require("liferay-json");
var mapreduce = require('mapred')();
var winston = require("winston");
var logger = new winston.Logger({
	level: 'info',
	transports: [
		new(winston.transports.Console)()
	]
});

var paths = {
	commands: "./commands",
	results: "./firebase-results",
};

var configDummy = {
	apiKey: "",
	authDomain: "",
	databaseURL: "",
	projectId: "",
	storageBucket: "",
	messagingSenderId: ""
};

var credsDummy = {
	"user": "",
	"password": ""
};

var configLRDummy = {
	server: "liferay server url",
	user: "optional email adress of liferay user",
	"base64auth": "optional base64 encoded email:password for authentication"
};

var getConfigFile = function(configFile, configDummy) {
	try {
		return JSON.parse(fs.readFileSync(configFile));
	}
	catch (error) {
		logger.error("Please create config file " + configFile + " with the following syntax in the current directory");
		logger.error(JSON.stringify(configDummy) + "\n");
		throw new Error("Could not find config file: " + configFile);
	}
};

var config = getConfigFile("./config-firebase-prod.json", configDummy);
var credentials = getConfigFile("./config-firebase-credentials-prod.json", credsDummy);
var configLR = getConfigFile("./config.json", configLRDummy);


var command_file = "get_marketing_events_and_sessions.json";
var cmd = JSON.parse(fs.readFileSync(paths.commands + "/" + command_file));
logger.info("Invoking " + command_file);

var eventsWithSessions = {};

liferay.invoke_liferay(configLR, cmd, function(response) {

	response.forEach(function(event) {

		var sessions = {};
		event.sessions.forEach(function(session) {
			sessions[session.marketingEventSessionId] = {
				title: session.titleCurrentValue,
				countFavorites: 0,
				ratings: []
			};
		});

		eventsWithSessions[event.marketingEventId] = {
			title: event.titleCurrentValue,
			sessions: sessions
		};
	});
	//	console.log(JSON.stringify(eventsWithSessions, null, "\t"));
	queryFirebase(eventsWithSessions);
});

var queryFirebase = function(eventsWithSessions) {
	firebase.initializeApp(config);

	firebase.auth()
		.signInWithEmailAndPassword(credentials.user, credentials.password)
		.then(function(firebaseUser) {
			console.log('Connected to firebase server.');

			var database = firebase.app().database();
			var ref = database.ref('/users');
			ref.once('value')
				.then(function(snap) {
					console.log(JSON.stringify(snap.val()));

					var ratings = snap.val();

					for (var device in ratings) {
						console.log(device);
						for (var event in ratings[device].events) {
							if (event in eventsWithSessions) {
								console.log("\t" + event + " " + eventsWithSessions[event].title);
								if ("sessionRatings" in ratings[device].events[event]) {
									for (var session in ratings[device].events[event].sessionRatings) {
										var rating = ratings[device].events[event].sessionRatings[session];
										if (session in eventsWithSessions[event].sessions) {
											eventsWithSessions[event].sessions[session].ratings.push(rating);
										}
										else {
											console.log("Error unknown session " + session);
										}
									}
								}
								if ("favoritedSessions" in ratings[device].events[event]) {
									ratings[device].events[event].favoritedSessions.forEach(function(favoritedSession) {
										if (favoritedSession in eventsWithSessions[event].sessions) {
											eventsWithSessions[event].sessions[favoritedSession].countFavorites += 1;
										}
										else {
											console.log("Error unknown session " + favoritedSession);
										}

									});
								}
							}
							else {
								console.log("unknown event id:" + event);
							}
						}
					}
					outputResults(eventsWithSessions, ratings);

					firebase.auth().signOut();
				})
				.catch(function(error) {
					console.log(error);
				});
		})
		.catch(function(error) {
			console.log(error);
		});
};

var outputResults = function(eventsWithSessions, ratingsData) {

	fs.writeFileSync(paths.results + "/firebaseOutput.json", JSON.stringify(ratingsData, null, "\t"));
	fs.writeFileSync(paths.results + "/sessionfavorites.json", JSON.stringify(eventsWithSessions, null, "\t"));
	var writer = csvWriter();
	writer.pipe(fs.createWriteStream(paths.results + "/" + 'favoriteCounts.csv'));
	for (var event in eventsWithSessions) {
		for (var sessionKey in eventsWithSessions[event].sessions) {
			var session = eventsWithSessions[event].sessions[sessionKey];
			if (session.countFavorites > 0) {
				writer.write({
					event: eventsWithSessions[event].title,
					session: session.title,
					favorites: session.countFavorites
				});
			}
		}
	}
	writer.end();

	var writer2 = csvWriter();
	writer2.pipe(fs.createWriteStream(paths.results + "/" + 'sessionRatings.csv'));
	for (var sessionRatingsEvent in eventsWithSessions) {
		for (var sessionRatingSessionKey in eventsWithSessions[sessionRatingsEvent].sessions) {
			var sessionRatingSession = eventsWithSessions[sessionRatingsEvent].sessions[sessionRatingSessionKey];
			if (sessionRatingSession.ratings.length > 0) {
				sessionRatingSession.ratings.forEach(function(rating) {
					writer2.write({
						event: eventsWithSessions[sessionRatingsEvent].title,
						session: sessionRatingSession.title,
						feedback: rating.feedback,
						rating: rating.rating
					});
				});
			}
		}
	}
	writer2.end();
};
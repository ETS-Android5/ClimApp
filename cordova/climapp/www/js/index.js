/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var app = {
	language: undefined,
	translations: undefined,
	knowledgeBase: undefined,
	pageMap: undefined,
	currentPageID: undefined,
	selectedWeatherID: undefined,
	maxForecast: undefined,
	radialgauge: undefined,


	// Application Constructor
	initialize: function () {
		document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
		//this.onDeviceReady(); //call this to run on browser, as browser does not fire the event by itself.
	},

	// deviceready Event Handler
	//
	// Bind any cordova events here. Common events are:
	// 'pause', 'resume', etc.
	onDeviceReady: function () {
		window.onerror = function (message, url, lineNumber) {
			console.log("Error: " + message + " in " + url + " at line " + lineNumber);
			showShortToast("Whoops... something went wrong at: " + lineNumber);
		}
		this.receivedEvent('deviceready');
		
		if( device.platform === "iOS"){
			window.FirebasePlugin.hasPermission(function(data) { 
				if( !data.isEnabled ){
					window.FirebasePlugin.grantPermission();
				}
			});
		}
		window.FirebasePlugin.onNotificationOpen(function(notification) {
			showShortToast( "Climapp has sent a notification: " + notification );
			}, function(error) {
		    console.error(error);
		});
		window.FirebasePlugin.onTokenRefresh(function(token) {
		    // save this server-side and use it to push notifications to this device
		    console.log(token);
		}, function(error) {
		    console.error(error);
		});		
		
	},

	// Update DOM on a Received Event
	receivedEvent: function (id) {
		self = this;
		// Read in translations (synchronously)
		this.loadTranslations("http://www.hittewijzer.nl/translations/translations.json");
		//
	},
	loadTranslations: function( url ){
		var self = this;
		$.getJSON( url, function (json) {
			try {
				console.log("Translations read from : "+url+" - " + Object.keys(json));
			} catch (error) {
				console.log("Error in reading translations: " + error);
			}
		}).fail(function (jqXHR, textStatus, errorThrown) {
			console.log("Failed to read translations " + JSON.stringify(jqXHR));
			console.log("Failed to read translations " + JSON.stringify(textStatus));
			console.log("Failed to read translations " + JSON.stringify(errorThrown));
			
			
			self.loadTranslations("./translations/translations.json");
		// Load settings after translations have been read
		}).done(function (result) {
			self.translations = result;
			self.loadSettings();
			
			if (self.knowledgeBase.user.guards.isFirstLogin) {//onboarding
				self.loadUI("onboarding");
			}
			else {
				self.loadUI("dashboard");
			}

			// Keeping track of how many time user has opened app, until count reaches 5
			if (self.knowledgeBase.user.guards.appOpenedCount < 5) {
				self.knowledgeBase.user.guards.appOpenedCount += 1;
			}
			// After 5 times opening the app, the user is seen as advanced
			if (self.knowledgeBase.user.settings.level !== 2 && self.knowledgeBase.user.guards.appOpenedCount === 5) {
				self.knowledgeBase.user.settings.level = 2;
				showShortToast(self.translations.toasts.adv_user[self.language]); // Showing how to call translation text for toasts
			}
			self.updateLocation();
			self.saveSettings();
		});
	},
	initNavbarListeners: function () {
		// navigation menu
		var self = this;
		$("div[data-listener='navbar']").off();
		$("div[data-listener='navbar']").on("click", function () {
			let target = $(this).attr("data-target");
			self.knowledgeBase.user.guards.isFirstLogin = 0;
			self.saveSettings();
			if (self.firstTimeLoginWithoutPersonalization(target)) {
				showShortToast(self.translations.toasts.default_values[self.language]);
			}
			self.loadUI(target);
		});
	},
	initErrorListeners: function() {
		var self = this;
		$("div[data-listener='weather_error']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='weather_error']").on("click", function () {
			let target = $(this).attr("data-target");
			self.updateLocation();

			if (self.knowledgeBase.user.guards.isFirstLogin) {//onboarding
				self.loadUI("onboarding");
			}
			else {
				self.loadUI(target);
			}
		});
	},
	initToggleListeners: function () {
		$("div[data-listener='toggle']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='toggle']").on("click", function () {
			let target = $(this).attr("data-target");
			$("#" + target).toggle();
		});
	},
	initFeedbackListeners: function () {
		var self = this;
		$("i[data-listener='reset_adaptation']").off(); //prevent multiple instances of listeners on same object
		$("i[data-listener='reset_adaptation']").on("click", function () {
			var mode = self.knowledgeBase.user.adaptation.mode;
			console.log("mode: " + mode);
			// Resetting diff
			self.knowledgeBase.user.adaptation[mode].diff = [0];
			self.saveSettings();
			showShortToast(self.translations.toasts.adaptation_reset[self.language]);
			let index = 0; // 0 = current situation -- is this what we want?

			self.getDrawGaugeParamsFromIndex(index, self.knowledgeBase, false).then(
				([width, personalvalue, modelvalue, thermal, tip_html]) => {//
					self.drawGauge('feedback_gauge', width, personalvalue, thermal);
					console.log("reset_adaptation - A ");
					$("#gauge_text_top_diff").html(self.translations.labels.str_personal[self.language] + " " + self.translations.labels.str_alert_level[self.language] + ": 0");
					console.log("reset_adaptation - B ");

					// Set the value as the perceived value in knowledgebase
					self.saveSettings();
				});
		});

		$("div[data-listener='adaptation']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='adaptation']").on('click', function () {
			var thermal = $(this).attr("data-context");
			console.log("adaptation context: " + thermal);

			var currentPAL_ = self.knowledgeBase.user.adaptation[thermal].diff;
			var currentPAL = 0;
			if (currentPAL_.length > 0) {
				currentPAL = currentPAL_[0];
			}

			currentPAL += 1.0 * $(this).attr("data-value");
			self.knowledgeBase.user.adaptation[thermal].diff = [currentPAL];

			// Draw gauge with current index value 
			let index = 0; // 0 = current situation -- is this what we want?
			self.getDrawGaugeParamsFromIndex(index, self.knowledgeBase, false).then(
				([width, personalvalue, modelvalue, thermal, tip_html]) => {//					
					self.drawGauge('feedback_gauge', width, personalvalue, thermal);
					$("#gauge_text_top_diff").html(self.translations.labels.str_personal[self.language] + " " + thermal + " " + self.translations.labels.str_alert_level[self.language] +": " + currentPAL);
					
					// Set the value as the perceived value in knowledgebase
					self.saveSettings();
				});
		});		

		// When user rates the feedback questions
		$("input[data-listener='feedback']").off();
		$("input[data-listener='feedback']").on("click", function () {
			var target = $(this).attr("data-target");
			console.log("target: " + target);

			// Updating rating bar using first char in ID
			var rating_id = $(this).attr("id")[0];

			if (rating_id === '1') {
				self.knowledgeBase.feedback.question1 = target + ".0"; // this is how the integers in feedback are read from the translations sheet "x.0" 
				$("#ratingtext1").html(self.translations.feedback.question1.ratingtext[self.knowledgeBase.feedback.question1][self.language]);
			} else if (rating_id === '2') {
				self.knowledgeBase.feedback.question2 = target + ".0";
				$("#ratingtext2").html(self.translations.feedback.question2.ratingtext[self.knowledgeBase.feedback.question2][self.language]);
			} else {
				self.knowledgeBase.feedback.question3 = target + ".0";
				$("#ratingtext3").html(self.translations.feedback.question3.ratingtext[self.knowledgeBase.feedback.question3][self.language]);
			}
			$("input[data-listener='feedback']").removeClass("checked");
			self.saveSettings();
		});

		// When user submits feedback, add to object to send to db + reset values
		$("div[data-listener='submit']").off();
		$("div[data-listener='submit']").on("click", function () {
			var target = $("#feedback_text").val();
			let mode = self.knowledgeBase.user.adaptation.mode;
			
			self.feedback_questions.comment = target;

			// If user not in database, add user to database
			self.checkIfUserExistInDB();

			// Add feedback to database
			addFeedbackToDB(self.knowledgeBase, self.feedback_questions, self.translations, self.language);

			// reset values
			$('#feedback_text').val("");

			// Load settings page
			self.loadUI('settings');
		});
	},
	initSettingsListeners: function () {
		var self = this;
		$("div[data-listener='wheel']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='wheel']").on("click", function () {
			var target = $(this).attr("data-target");
			let title_ = self.translations.wheels.settings[target].title[self.language];
			var items_ = self.getSelectables(target);
			var currentValueAsString = getWheelStartingValueSettings(target, self.knowledgeBase, self.translations, self.language);

			var config = {
				title: title_,
				items: [[items_]],
				positiveButtonText: self.translations.labels.str_done[self.language],
				negativeButtonText: self.translations.labels.str_cancel[self.language],
				defaultItems: {"0": currentValueAsString}, 
				wrapWheelText: true
			};
			window.SelectorCordovaPlugin.showSelector(config, function (result) {
				if (["gender", "height", "weight", "unit"].includes(target)) {
					self.knowledgeBase.user.settings[target] = items_[result[0].index].value;
					self.saveSettings();
					updateDBParam(self.knowledgeBase, target);

				} else if(target === "age") {
					// Set age based on year of birth
					self.knowledgeBase.user.settings[target] = getAgeFromYearOfBirth(items_[result[0].index].value);
					self.knowledgeBase.user.settings.yearOfBirth = items_[result[0].index].value;
					self.saveSettings();
					updateDBParam(self.knowledgeBase, target);
				}
				console.log(target + ": " + items_[result[0].index].value);
				self.updateUI();
			}, function () {
				console.log('Canceled');
			});
		});

		$("div[data-listener='tab']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='tab']").on("click", function () {

			var target = $(this).attr("data-target");
			console.log(target);
			if (target === "reset") {
				// Resetting values to default
				self.knowledgeBase.user.settings.age = 30;
				self.knowledgeBase.user.settings.yearOfBirth = 1990;
				self.knowledgeBase.user.settings.gender = "undefined";
				self.knowledgeBase.user.settings.height = 178;
				self.knowledgeBase.user.settings.weight = 82;
				self.knowledgeBase.user.settings.unit = "SI";
				self.knowledgeBase.user.settings.acclimatization = false;
				self.knowledgeBase.user.guards.receivesNotifications = false;

				self.saveSettings();
				self.updateUI();

				// Inform user about event in toast
				showShortToast(self.translations.toasts.preferences_reset[self.language]);
			}
			else {
				self.loadUI(target);
			}
		});

		$("input[data-listener='toggle_switch']").off(); //prevent multiple instances of listeners on same object
		$("input[data-listener='toggle_switch']").on("click", function () {
			var target = $(this).attr("data-target");

			if (target === "acclimatization_switch") {
				var isChecked = $(this).is(":checked");
				self.knowledgeBase.user.settings.acclimatization = isChecked;
				// Inform user about choice in toast
				var accText = isChecked ? self.translations.toasts.acclimatized[self.language] : self.translations.toasts.not_acclimatized[self.language];
				updateDBParam(self.knowledgeBase, "acclimatization");
				showShortToast(accText);

			} else if (target === "notification_switch") {
				var isChecked = $(this).is(":checked");
				self.knowledgeBase.user.guards.receivesNotifications = isChecked;
				// Inform user about choice in toast
				var notificationText = isChecked ? self.translations.toasts.notification_enabled[self.language] : self.translations.toasts.notification_disabled[self.language];
				showShortToast(notificationText);
			}
			self.saveSettings();
		});
	},
	initLocationListeners: function () {
		var self = this;
		$("div[data-listener='set_location']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='set_location']").on("click", function () {
			// Load Google Maps UI to set location on map
			$(".navigation_back_custom").show();
			$("#custom_location_switch").hide();
			$("#customLocationSection").hide();
			
			$("#google_maps_elem").fadeIn(500, function(){
				
				var [lat, lon] = getLocation(self.knowledgeBase);
				var point = new google.maps.LatLng(lat, lon);
		        var marker = new google.maps.Marker({
		            position: point,
		            label: "",
		            map: window.map
		        });
			    window.map.panTo(point);
			});
			
			$("#location_header").html(self.translations.labels.str_choose_location[self.language]);
		});

		$("input[data-listener='toggle_switch']").off(); //prevent multiple instances of listeners on same object
		$("input[data-listener='toggle_switch']").on("click", function () {
			var target = $(this).attr("data-target");

			var customText = "";
			var isChecked = $(this).is(":checked");
			if (target === "custom_location_switch") {
				self.knowledgeBase.user.guards.customLocationEnabled = isChecked;
				if (isChecked) {
					self.knowledgeBase.user.guards.isIndoor = false;
					customText = self.translations.toasts.location_enabled[self.language];
					$("#customLocationSection").show();
				} else {
					customText = self.translations.toasts.location_disabled[self.language];
					$("#customLocationSection").hide();
					self.updateLocation();
				}
			}
			showShortToast(customText);
			self.saveSettings();
		});

		$("div[data-listener='set_coordinates']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='set_coordinates']").on("click", function () {

			var rawCoordinates = document.getElementById("latlon").innerHTML;
			$("#latlon").html(rawCoordinates);
			// Hack solution, I know. Will fix.
			var lat = Number(rawCoordinates.split(",")[0].replace("(", ""));
			var lon = Number(rawCoordinates.split(",")[1].replace(")", ""));
			console.log("coordinates:  " + lat + " " + lon + " typeof " + typeof lat);
			
			if (typeof lat === "number" && typeof lon === "number") {
				self.knowledgeBase.user.settings.coordinates_lat = lat;
				self.knowledgeBase.user.settings.coordinates_lon = lon;
				self.saveSettings();
				self.updateLocation();
				customText = self.translations.toasts.custom_location[self.language] + ": ";
			} else {
				customText = self.translations.toasts.bad_location[self.language] + ": ";
				self.knowledgeBase.user.guards.customLocationEnabled = false;
				self.saveSettings();
			}

			customText +=  + self.knowledgeBase.user.settings.coordinates_lat.toFixed(4) + ", " + self.knowledgeBase.user.settings.coordinates_lon.toFixed(4);
			self.loadUI("dashboard");
			showShortToast(customText);
		});
	},
	initIndoorListeners: function () {
		var self = this;
		$("div[data-listener='wheel']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='wheel']").on("click", function () {
			var target = $(this).attr("data-target");
			let title_ = self.translations.wheels.settings[target].title[self.language];
			console.log(title_ + " " + target);
			var items_ = self.getSelectables(target);
			var currentValueAsString = getWheelStartingValueIndoor(target, self.knowledgeBase, self.translations, self.language);

			var config = {
				title: title_,
				items: [[items_]],
				positiveButtonText: self.translations.labels.str_done[self.language],
				negativeButtonText: self.translations.labels.str_cancel[self.language],
				defaultItems: {"0": currentValueAsString}
			};

			window.SelectorCordovaPlugin.showSelector(config, function (result) {
				self.knowledgeBase.user.settings[target] = items_[result[0].index].value;
				console.log(target + ": " + items_[result[0].index].value);
				self.saveSettings();
				self.updateUI();
			}, function () {
				console.log('Canceled');
			});
		});

		$("input[data-listener='toggle_switch']").off(); //prevent multiple instances of listeners on same object
		$("input[data-listener='toggle_switch']").on("click", function () {
			var target = $(this).attr("data-target");
			
			if (target === "indoor_switch") {
				var isChecked = $(this).is(":checked");
				self.knowledgeBase.user.guards.isIndoor = isChecked;
				// Inform user about choice in toast
				var customText = "";
				if (isChecked) {
					self.knowledgeBase.user.guards.customLocationEnabled = false;
					customText = self.translations.toasts.indoor_enabled[self.language];
					$("#indoorSection").show();
				} else {
					customText = self.translations.toasts.indoor_disabled[self.language];
					$("#indoorSection").hide();
					self.updateUI();
				}
			}
			showShortToast(customText);
			
			
			self.saveSettings();
		});

		$("div[data-listener='set_indoor_options']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='set_indoor_options']").on("click", async function () {
			// Load UI using indoor options
			var target = $(this).attr("data-target");

			// Get predicted indoor temperature from server
			getIndoorPrediction(self.knowledgeBase).then((temp) => {
				self.knowledgeBase.user.settings.temp_indoor_predicted = temp;
				self.saveSettings();
				//self.updateInfo();
				self.loadUI(target);
			});
			self.calcThermalIndices();
			self.saveSettings();

			self.loadUI(target);
		});
	},
	initGeolocationListeners: function () {
		var self = this;
		$("div[data-listener='geolocation']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='geolocation']").on("click", function () {
			self.updateLocation();
		});
	},
	initDashboardListeners: function () {
		var self = this;
		$("div[data-listener='tab']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='tab']").on("click", function () {
			var target = $(this).attr("data-target");
			// Load feedback page when pressing gauge in dashboard
			self.loadUI(target);
		});
	},
	initDashboardSwipeListeners: function () {
		var self = this;
		$("div[data-listener='panel']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='panel']").on({
			"swiperight": function () {
				var target = $(this).attr("data-target");
				self.dashBoardSwipeHelper("right", target);
			},
			"swipeleft": function () {
				var target = $(this).attr("data-target");
				self.dashBoardSwipeHelper("left", target);
			}
		});
		$("#forecast_right").off().on("click", function () {
			self.dashBoardSwipeHelper("left", "forecast");//right button is swipe left
		});
		$("#forecast_left").off().on("click", function () {
			self.dashBoardSwipeHelper("right", "forecast");//left button is swipe right
		});

	},
	dashBoardSwipeHelper: function (direction, target) {
		var self = this;
		console.log("selected weather id: " + this.selectedWeatherID);
		if (direction === "right") {
			if (target === "forecast") {
				if (this.selectedWeatherID === 0) {
					this.updateLocation();
					$("#main_panel").fadeOut(2000, function () { });
				}
				else {
					this.selectedWeatherID = Math.max(0, this.selectedWeatherID - 1);
					$("#main_panel").fadeOut(500, function () {
						self.updateInfo(self.selectedWeatherID);
					});
				}
			} else {
				this.loadUI(target);
			}
		}
		else {
			if (target === "forecast") {
				this.selectedWeatherID = Math.min(this.maxForecast, this.selectedWeatherID + 1);
				$("#main_panel").fadeOut(500, function () {
					self.updateInfo(self.selectedWeatherID);
				});
			}
		}

	},
	initActivityListeners: function () {
		var self = this;
		$("div[data-listener='wheel']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='wheel']").on("click", function () {
			var target = $(this).attr("data-target");
			let title_ = self.translations.wheels[target].title[self.language];
			console.log("target: " + target + " title " + title_);
			var items_ = self.getSelectables(target);
			var currentValueAsString = self.translations.wheels[target].label[self.knowledgeBase.user.settings[target+"_selected"]][self.language];
		
			var config = {
				title: title_,
				items: [[items_]],
				positiveButtonText: self.translations.labels.str_done[self.language],
				negativeButtonText: self.translations.labels.str_cancel[self.language],
				defaultItems: {"0": currentValueAsString}
			};
			window.SelectorCordovaPlugin.showSelector(config, function (result) {
				self.knowledgeBase.user.settings[target + "_selected"] = items_[result[0].index].value;
				console.log(target + ": " + items_[result[0].index].value);
				self.saveSettings();
				self.calcThermalIndices();
				self.updateUI();
			}, function () {
				console.log('Canceled');
			});
		});
	},
	initMenuListeners: function () {
		var self = this;
		$("div[data-listener='menu']").off(); //prevent multiple instances of listeners on same object
		$("div[data-listener='menu']").on("click", function () {
			var target = $(this).attr("data-target");
			$("div.menuitem").removeClass("menufocus");
			$(this).addClass("menufocus");

			//reset tab panels
			$("#selectactivity").removeClass("hidden").addClass("hidden");
			$("#selectclothing").removeClass("hidden").addClass("hidden");
			$("#selectheadgear").removeClass("hidden").addClass("hidden");
			$("#" + target).removeClass("hidden");
		});
	},
	initKnowledgeBase: function () {
		return {
			/* --------------------------------------------------- */
			// Should not be overwritten!
			"user": {
				"guards": {
					"isFirstLogin": 1,
					"introductionCompleted": 0,
					"hasExternalDBRecord": 0,
					"receivesNotifications": 0, // false as notifications are not part of the app
					"appOpenedCount": 0, // number of times user has opened app
					"feedbackSliderChanged": 0,
					"customLocationEnabled": false,
					"isIndoor": false
				},
				"settings": { // Using default values
					"yearOfBirth" : 1990,
					"age": 30,
					"height": 178,
					"weight": 82,
					"gender": "undefined",
					"unit": "SI",
					"acclimatization": false,
					"activity_selected": "medium",
					"clothing_selected": "Summer_attire",
					"headgear_selected": "none",
					"explore": false, // currently not used
					"level": 1, // 1 - beginner, 2 - advanced

					/* Indoor mode */
					"thermostat_level": 3,
					"open_windows": 0,
					"_temperature": 20, // indoor temperature
					"windspeed": 1, // 1 no_wind, 2 some_wind, 3 strong_wind
					"_humidity": 0,

					"temp_indoor_predicted": 0, // predicted indoor temp, false on error, otherwise double

					/* Custom location */
					"coordinates_lon": 0,
					"coordinates_lat": 0,
					"station": "Unknown",
				},
				"adaptation": {
					"mode": "undefined",
					"heat": {
						"predicted": 0,
						"perceived": 0,
						"diff": [] // perceived - predicted
					},
					"cold": {
						"predicted": 0,
						"perceived": 0,
						"diff": [] // perceived - predicted
					}
				}
			},
			/* --------------------------------------------------- */
			"version": 2.0477,
			"app_version": "3.0.4",
			"server": {
				"dtu_ip": "http://climapp.byg.dtu.dk",
				"dtu_api_base_url": "/ClimAppAPI/v2/ClimAppApi.php?apicall="
			},
			"position": {
				"lat": 0,
				"lng": 0,
				"timestamp": ""
			},
			"weather": {
				"station": "",
				"lat": 0,
				"lng": 0,
				"distance": -1,
				"utc": [""],
				"wbgt": [-99],
				"windchill": [-99],
				"temperature": [-99],
				"globetemperature": [-99],
				"humidity": [-99],
				"watervapourpressure": [-99],
				"windspeed": [-99],
				"radiation": [-99]
			},
			"activity": {
				// Dependent on correct translation sheet labels (rest, low, medium, high, intense)
				"values": {
					"rest": 115.0, //ISO 8896
					"low": 180.0,
					"medium": 300.0,
					"high": 415.0,
					"intense": 520.0
				}
			},
			"clothing": {
				"values": {
					"Summer_attire": 0.5, //clo
					"Business_suit": 1.0,
					"Double_layer": 1.5,
					"Cloth_coverall": 1.0,
					"Cloth_apron_long_sleeve": 1.2,
					"Vapour_barrier_coverall": 1.1,
					"Winter_attire": 2.5
				}
			},
			"feedback": {
				"question1": 0,
				"question2": 0,
				"question3": 0,
				"comment": ""
			},
			"headgear": {
				"values": {
					"none": 0, //clo
					"helmet": 0.1, //clo
				}
			},
			"thermalindices": {
				"ireq": [],
				"phs": [],
				"pmv": [],
			},
			"gauge": {
				"highlights": [//color also in CSS, keep consistent
					{ from: 3, to: 4, color: 'rgba(150,0,0,.9)', css: 'veryhot' },
					{ from: 2, to: 3, color: 'rgba(255,165,0,.9)', css: 'hot' },
					{ from: 1, to: 2, color: 'rgba(220,220,0,.9)', css: 'warm' },
					{ from: -1, to: 1, color: 'rgba(0,180,0,.9)', css: 'neutral' },
					{ from: -2, to: -1, color: 'rgba(0,180,180,.9)', css: 'cool' },
					{ from: -3, to: -2, color: 'rgba(0,100,255,.9)', css: 'cold' },
					{ from: -4, to: -3, color: 'rgba(0,0,180,.9)', css: 'verycold' }
				]
			},
			"thresholds": {
				"ireq": {
					"icl": 1.0 //ireq > "icl-value" -> 
				},
				"phs": {
					"duration": 120, //duration limit <= "icl-value" -> 
					"sweat": 1.0,     //sweat rate per hour >= "icl-value" ->
				},
				"windchill": {
					"deltaT": 5
				}
			},
			"sim": {
				"duration": 180, //minutes (required for PHS)
			},
		};
	},
	loadSettings: function () {
		this.pageMap = {
			"dashboard": "./pages/dashboard.html",
			"forecast": "./pages/forecast.html",
			"settings": "./pages/settings.html",
			"feedback": "./pages/feedback.html",
			"onboarding": "./pages/onboarding.html",
			"disclaimer": "./pages/disclaimer.html",
			"details": "./pages/details.html",
			"about": "./pages/about.html",
			"location": "./pages/location.html",
			"indoor": "./pages/indoor.html",
			"error": "./pages/error.html"
		};
		//this.translations = getTranslations(); //check if it works from here	
		this.selectedWeatherID = 0;
		this.maxForecast = 8; //8x3h = 24h
		var shadowKB = this.initKnowledgeBase();

		this.language = this.getLanguage(navigator.language);
		var msgString = ""; // String deciding message to show in console/toast

		// Distinguishing between a new and an existing user
		if (localStorage.getItem("knowledgebase_v2") === null) {
			// For all users with a different (older) version of the knowledgebase
			if (localStorage.getItem("knowledgebase") !== null) {
				localStorage.clear();
				this.knowledgeBase = shadowKB;
				this.knowledgeBase.user.guards.hasExternalDBRecord = 1; // Already in ClimApp DB
				// User will have to input personal settings (but from here on it will run smoothly)

				// Users downloading the app for the first time get new version of knowledgebase
			} else {
				this.knowledgeBase = shadowKB;
			}
			// Omitting saving to skip next if statement (want to end in line 445 after creating new kb)
		}

		if (localStorage.getItem("knowledgebase_v2") !== null) {
			this.knowledgeBase = JSON.parse(localStorage.getItem("knowledgebase_v2"));

			if ('version' in this.knowledgeBase && this.knowledgeBase.version < shadowKB.version) {
				// Saving user preferences before updating
				var userPreferences = this.knowledgeBase.user;   // Store old user data in temporary variable
				this.knowledgeBase = shadowKB;                   // Update knowledgebase to new version
				var mergedUserPreferences = MergeRecursive(shadowKB.user, userPreferences); // merge old user data into new user object
				this.knowledgeBase.user = mergedUserPreferences; // Add merged user data to knowledgebase

				if (typeof this.knowledgeBase.user.adaptation.heat.diff === 'number' || typeof this.knowledgeBase.user.adaptation.cold.diff === 'number') {
					this.knowledgeBase.user.adaptation.heat.diff = [];
					this.knowledgeBase.user.adaptation.cold.diff = [];
				}

				// Setting values of variables that have changed types since last kb version
				if(!'yearOfBirth' in this.knowledgeBase) {
					this.knowledgeBase.user.settings.clothing_selected = "Summer_attire";
					this.knowledgeBase.user.settings.headgear_selected = "none";

					var thisYear = new Date().getFullYear();
					this.knowledgeBase.user.settings.yearOfBirth = thisYear - shadowKB.user.settings.age;
				}

				msgString = this.translations.toasts.kb_updated[this.language];
			}
			else if ('version' in this.knowledgeBase && this.knowledgeBase.version == shadowKB.version) {
				msgString = this.translations.toasts.kb_loaded[this.language];
			}
			else { //old version does not have version key
				this.knowledgeBase = shadowKB;
				msgString = this.translations.toasts.kb_updated[this.language];
			}
		}
		else {
			this.knowledgeBase = shadowKB;
			msgString = this.translations.toasts.kb_created[this.language];
		}

		showShortToast(msgString + this.knowledgeBase.version);
		this.saveSettings();

		console.log("current language: " + this.language); // getting first two letters
		console.log("User settings: \n" + JSON.stringify(this.knowledgeBase.user)); // Showing current user settings
	},
	/* Getting language based on locale, if language is not supported, English is chosen */
	getLanguage: function (locale) {
		var shortenedLanguageIndicator = locale.slice(0, 2); // first two characters of ISO 639-1 code (https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)
		
		if(["nb","no","nn"].includes(shortenedLanguageIndicator)) {
			// Norway does not completely follow the standard, handling that here.
			shortenedLanguageIndicator = "no";
		}

		var availableLanguages = ["en", "da", "nl", "no", "el", "it", "de", "es", "fr",]; // list of all available languages, need to be updated manually

		if (availableLanguages.includes(shortenedLanguageIndicator)) {
			return shortenedLanguageIndicator;
		} else {
			return "en";
		}
	},
	firstTimeLoginWithoutPersonalization: function (target) {
		var self = this;
		return self.knowledgeBase.user.guards.isFirstLogin && target === 'dashboard';
	},
	getSelectables: function (key) {
		var self = this;
		let unit = this.knowledgeBase.user.settings.unit;
		var obj_array = [];

		if (key.slice(0, 3) === "age") {
			var thisYear = new Date().getFullYear();
			for (var i = (thisYear - 100); i < thisYear; i++) {
				obj_array.push({ description: ""+i, value: i });
			}
		}
		else if (key === "height") {
			for (var i = 0; i < 100; i++) {
				if (this.knowledgeBase.user.settings.unit === "SI") {
					obj_array.push({ description: (i + 120) + " " + getHeightUnit(unit), value: (i + 120) });
				} else { // feet, inches (still want to save in cm, not changing value)
					obj_array.push({ description: ((i + 120) / 30.48).toFixed(1) + " " + getHeightUnit(unit), value: (i + 120) });
				}
			}
		}
		else if (key === "weight") {
			for (var i = 0; i < 100; i++) {
				if (this.knowledgeBase.user.settings.unit === "SI") {
					obj_array.push({ description: (i + 40) + " " + getWeightUnit(unit), value: (i + 40) });
				} else if (this.knowledgeBase.user.settings.unit === "US") {
					// (still want to save in kg, not changing value)
					obj_array.push({ description: Math.round((i + 40) * 2.2046) + " " + getWeightUnit(unit), value: (i + 40) });
				} else { // only UK left
					// (still want to save in kg, not changing value)
					obj_array.push({ description: (6 + i * 0.1).toFixed(1) + " " + getWeightUnit(unit), value: (i + 40) });
				}
			}
		}
		else if (key === "gender") {
			obj_array.push({ description: this.translations.labels.str_female[this.language], value: 0 });
			obj_array.push({ description: this.translations.labels.str_male[this.language], value: 1 });
		}
		else if (key === "unit") {
			obj_array.push({ description: "SI: kg, cm, m/s, Celsius", value: "SI" });
			obj_array.push({ description: "US: lbs, inch, m/s, Fahrenheit", value: "US" });
			obj_array.push({ description: "UK: stone, inch, m/s, Celsius", value: "UK" });
		}
		else if (key === "windspeed") {
			obj_array.push({ description: this.translations.wheels.windspeed.description.no_wind[this.language], value: 1 });
			obj_array.push({ description: this.translations.wheels.windspeed.description.some_wind[this.language], value: 2 });
			obj_array.push({ description: this.translations.wheels.windspeed.description.strong_wind[this.language], value: 3 });
		}
		// Is this being used anywhere?
		else if (key === "radiation") {
			obj_array.push({ description: "Shadow", value: "Shadow" });
			obj_array.push({ description: "Halfshadow", value: "Halfshadow" });
			obj_array.push({ description: "Direct sunlight", value: "Direct sunlight" });
			obj_array.push({ description: "Extreme radiation", value: "Extreme radiation" });
		}
		else if (["activity", "clothing", "headgear"].includes(key)) {
			var numElements = Object.keys(this.translations.wheels[key].label).length;
			var desc = "";
			var value = "";
			
			for(var i = 0; i < numElements; i++) {
			    desc = Object.keys(this.translations.wheels[key].label)[i];
			    value = this.translations.wheels[key].label[Object.keys(this.translations.wheels[key].label)[i]][this.language]; // rest, light, medium, high, intense
				console.log("desc: " + desc + " value: " + value);
				obj_array.push({ description: value, value: desc});
			}
		}

		/* CUSTOM INPUT */
		else if (key === "custom_input" || key === "open_windows") {
			obj_array.push({ description: this.translations.labels.str_yes[this.language], value: 1 });
			obj_array.push({ description: this.translations.labels.str_no[this.language], value: 0 });
		}

		else if (key === "_temperature") {
			if (this.knowledgeBase.user.settings.unit !== "SI") {
				// Fahrenheit
				for (var i = 59; i <= 83; i++) {
					let convertedTemp = getTemperatureValueInPreferredUnit(i, "US");
					obj_array.push({ description: convertedTemp.toFixed(1) + " F", value: convertedTemp.toFixed(1) });
				}
			} else {
				// Celcius
				for (var j = 15; j <= 28; j++) {
					obj_array.push({ description: j + " C", value: j });
				}
			}
		}
		else if (key === "_humidity") {
			for (var i = 0; i <= 100; i += 10) {
				obj_array.push({ description: i + " %", value: i });
			}
		}
		// using logic for windspeed above

		/* INDOOR MODE */
		else if (key === "thermostat_level") {
			for (var i = 1; i <= 5; i++) {
				obj_array.push({ description: ""+i, value: i });
			}
		}
		// logic for windows in custom output section
		return obj_array;
	},
	saveSettings: function () {
		let jsonData = JSON.stringify(this.knowledgeBase);
		localStorage.setItem("knowledgebase_v2", jsonData); // saving to new version for easier logic
	},
	updateLocation: function () {
		//$('i.fa-sync-alt').toggleClass("fa-spin");
		var self = this; //copy current scope into local scope for use in anonymous function 
		let options = { timeout: 30000 };
		console.log("updating location");
		navigator.geolocation.getCurrentPosition(
			function (position) { //on success
				self.knowledgeBase.position.lat = position.coords.latitude;
				self.knowledgeBase.position.lng = position.coords.longitude;
				self.knowledgeBase.position.timestamp = new Date(position.timestamp).toJSON();
				console.log("loc found: " + position.coords.latitude + "," + position.coords.longitude);
				self.saveSettings(); // ned to save before using coords in updateWeather
				self.updateWeather();
				//setTimeout( function(){ $('i.fa-sync-alt').toggleClass("fa-spin") }, 1000 );	
			},
			function (error) { //on error
				showShortToast(self.translations.toasts.no_location[self.language]);
				console.log(error);
				//self.loadUI("error");
			},
			options // here the timeout is introduced
		);
	},
	updateWeather: async function () {
		var self = this;

		self.checkIfUserExistInDB().then((result) => {
			getAppIDFromDB(self.knowledgeBase).then((appidFromServer) => {

				if (appidFromServer) {
					let url = "https://www.sensationmapps.com/WBGT/api/worldweather.php";
					var [lat, lon] = getLocation(this.knowledgeBase); // Custom or GPS
					let data = {
						"action": "helios",
						"lat": lat,
						"lon": lon,
						"climapp": appidFromServer,
						"d": 1.0, //
						"utc": new Date().toJSON()
					};
					$.get(url,
						data,
						function (output) {//on success
							try {
								let weather = JSON.parse(output);

								if(self.knowledgeBase.user.guards.customLocationEnabled) { 
									// Used to show last weather station
									self.knowledgeBase.user.settings.station = weather.station;
								}
								self.knowledgeBase.weather.station = weather.station;
								self.knowledgeBase.weather.distance = weather.distance ? weather.distance : 0;
								self.knowledgeBase.weather.utc = "utc" in weather ? weather.utc : weather.dt;

								//returns current weather by default in key "weather.currentweather"
								//prepend to array.
								console.log(JSON.stringify(weather));
								self.knowledgeBase.weather.utc.unshift(weather.currentweather.dt);

								self.knowledgeBase.weather.utc = self.knowledgeBase.weather.utc.map(function (val) {
									let str = val.replace(/-/g, "/");
									str += " UTC";
									return str;
								});

								self.knowledgeBase.weather.lat = weather.lat;
								self.knowledgeBase.weather.lng = weather.lon;

								self.knowledgeBase.weather.wbgt = weather.wbgt_min.map(Number);
								self.knowledgeBase.weather.wbgt.unshift(Number(weather.currentweather.wbgt_min));

								self.knowledgeBase.weather.wbgt_max = weather.wbgt_max.map(Number);
								self.knowledgeBase.weather.wbgt_max.unshift(Number(weather.currentweather.wbgt_max));

								self.knowledgeBase.weather.windchill = weather.windchill.map(Number);
								self.knowledgeBase.weather.windchill.unshift(Number(weather.currentweather.windchill));

								// Using custom input, when custom is enabled (indoor mode)
								if (self.knowledgeBase.user.guards.isIndoor) {
									// Get predicted indoor temperature from server
									getIndoorPrediction(self.knowledgeBase).then((temp) => {
										self.knowledgeBase.user.settings.temp_indoor_predicted = Number(temp);
									});
									self.knowledgeBase.weather.humidity = self.knowledgeBase.user.settings._humidity;
									self.knowledgeBase.weather.windspeed = self.translateTextToWindspeed(self.knowledgeBase.user.settings.windspeed);
								}
								else {
									// Otherwise use weather service info
									self.knowledgeBase.weather.temperature = weather.tair.map(Number);
									self.knowledgeBase.weather.temperature.unshift(Number(weather.currentweather.tair));

									self.knowledgeBase.weather.humidity = weather.rh.map(Number);
									self.knowledgeBase.weather.humidity.unshift(Number(weather.currentweather.rh));

									self.knowledgeBase.weather.windspeed = weather.vair.map(Number);
									self.knowledgeBase.weather.windspeed.unshift(Number(weather.currentweather.vair));
								}								

								self.knowledgeBase.weather.globetemperature = weather.tglobe_clouds.map(Number);
								self.knowledgeBase.weather.globetemperature.unshift(Number(weather.currentweather.tglobe_clouds));

								self.knowledgeBase.weather.clouds = weather.clouds.map(Number);
								self.knowledgeBase.weather.clouds.unshift(Number(weather.currentweather.clouds));

								self.knowledgeBase.weather.rain = weather.rain.map(Number);
								self.knowledgeBase.weather.rain.unshift(Number(weather.currentweather.rain));

								self.knowledgeBase.weather.radiation = weather.solar_clouds.map(Number);
								self.knowledgeBase.weather.radiation.unshift(Number(weather.currentweather.solar_clouds));

								self.knowledgeBase.weather.meanradianttemperature = [];
								self.knowledgeBase.weather.windspeed2m = [];

								$.each( self.knowledgeBase.weather.windspeed, function(key, vair){
										var Tg = self.knowledgeBase.weather.globetemperature[key];
										var Ta = self.knowledgeBase.weather.temperature[key];
										var va = vair * Math.pow( 0.2, 0.25 ); //stability class D Liljgren 2008 Table 3
										/*
										//kruger et al 2014
										var D = 0.05; //diameter black globe (liljegren - ) --default value = 0.15
										var eps_g = 0.95; //standard emmisivity black bulb
										var t0 = (Tg+273.0);
										var t1 = Math.pow( t0, 4);
										var t2 = 1.1 * Math.pow(10,8) * Math.pow( va, 0.6 ); 
										var t3 = eps_g * Math.pow( D, 0.4);
										var t4 = t1 + ( t2 / t3 ) * (Tg-Ta);
										var Tmrt = Math.pow( t4, 0.25 ) - 273.0;
										*/
										console.log( "ClimateChip" );
										
										var WF1 = 0.4 * Math.pow( Math.abs( Tg - Ta ), 0.25 );
										var WF2 = 2.5 * Math.pow( va, 0.6 );
										var WF = WF1 > WF2 ? WF1 : WF2;
										var Tmrt = 100.0 * Math.pow( Math.pow((Tg + 273.0) / 100.0, 4 ) + WF * (Tg - Ta), 0.25) - 273.0;
										
										self.knowledgeBase.weather.meanradianttemperature.push( Tmrt );
										self.knowledgeBase.weather.windspeed2m.push( va );
								} );

								self.knowledgeBase.weather.watervapourpressure = [];
								$.each(self.knowledgeBase.weather.humidity,
									function (key, val) {
										let T = self.knowledgeBase.weather.temperature[key];
										let wvp = 0.1 * (val * 0.01) * Math.exp(18.965 - 4030 / (T + 235));
										self.knowledgeBase.weather.watervapourpressure.push(wvp);
									});

								self.saveSettings();
								self.calcThermalIndices();
								self.updateUI();

								// Only update when weather data has been received - and when external DB record is present.
								if (self.knowledgeBase.user.guards.hasExternalDBRecord) {
									addWeatherDataToDB(self.knowledgeBase);
								}
							}
							catch (error) {
								console.log(error);
							}
						}).fail(function (e) {
							console.log("fail in weather " + e);
						});
				} else {
					showShortToast(self.translations.toasts.weather_fail[self.language]);
				}
			}); // Making code execution wait for app id retrieval
		});
	},
	getWindspeedTextFromValue: function (val) {
		self = this;
		var text = "";
		switch (val) {
			case 1:
				text = self.translations.wheels.windspeed.description.no_wind[self.language];
				break;
			case 2:
				text = self.translations.wheels.windspeed.description.some_wind[self.language];	
				break;
			case 3:
				text = self.translations.wheels.windspeed.description.strong_wind[self.language];
				break;		
			default:
				// To information for user with earlier version on knowledgebase
				text = self.translations.wheels.windspeed.description.no_wind[self.language];
				self.knowledgeBase.user.settings.windspeed = 1;
				self.saveSettings();
				break;
		}
		return text;
	},
	translateTextToWindspeed: function (description) {
		// Based on wind speeds from: https://www.google.com/url?sa=i&source=images&cd=&ved=2ahUKEwjSq7ndjrzkAhVmposKHboJAGYQjRx6BAgBEAQ&url=https%3A%2F%2Fearthscience.stackexchange.com%2Fquestions%2F12562%2Fwhat-wind-speeds-and-gusts-can-usually-damage-houses-or-trees&psig=AOvVaw2Z8Ea0UmXAVcEuFrzpHpyU&ust=1567856490789493
		var windspeed = 0; // km/h
		switch (description) {
			case 1:
				windspeed = 1; // calm
				break;
			case 2:
				windspeed = 15; // light breeze
				break;
			case 3:
				windspeed = 35; // fresh breeze
				break;
			default:
				windspeed = 0; // something went wrong
		}
		return windspeed;
	},
	loadUI: function (pageid) {
		var self = this;
		if( this.knowledgeBase.user.guards.isIndoor && pageid === "feedback" ){
			showShortToast("No personalisation possible for indoor mode.");
		}
		else{
			$.get(this.pageMap[pageid], function (content) {
				console.log("loaded: " + pageid);
				self.currentPageID = pageid;
				$("#content").html(content);
				self.updateUI();
			});
		}
	},
	checkIfUserExistInDB: async function () {
		var self = this;
		if (!self.knowledgeBase.user.guards.hasExternalDBRecord && typeof (self.knowledgeBase.user.guards.hasExternalDBRecord) !== 'undefined') {
			createUserRecord(self.knowledgeBase).then((userCreatedInDB) => {
				// Only update value on success
				if (userCreatedInDB) {
					console.log("User added to database.");
					self.knowledgeBase.user.guards.hasExternalDBRecord = 1;
					self.saveSettings();
				}
			});
		} else {
			console.log("User exist in database.");
		}
	},
	calcThermalIndices: function () {
		this.knowledgeBase.thermalindices.ireq = [];
		this.knowledgeBase.thermalindices.phs = [];
		this.knowledgeBase.thermalindices.pmv = [];
		
		var options = {
			air: {},
			body: {
				"M": M(this.knowledgeBase), 	//W/m2 
				"work": 0,		//W/m2 external work 
				"posture": 2,		//1= sitting, 2= standing, 3= crouching
				"weight": this.knowledgeBase.user.settings.weight,		//kg  
				"height": this.knowledgeBase.user.settings.height / 100,	//m
				"drink": 0,	// may drink freely
				"accl": 0		//% acclimatisation state either 0 or 100						
			},
			cloth: {
				"Icl": getClo(this.knowledgeBase), 	//clo
				"p": getAirPermeability(this.knowledgeBase), 	// Air permeability (low < 5, medium 50, high > 100 l/m2s)
				"im_st": getMoisturePermeability(this.knowledgeBase), 	// static moisture permeability index
				"fAref": 0.54,	// Fraction covered by reflective clothing
				"Fr": 0.97,	// Emissivity reflective clothing
			},
			move: {
				"walk_dir": NaN, 	//degree walk direction
				"v_walk": 0,	//m/s walking speed
			},
			sim: {
				"mod": 0
			}
		};
		
		var self = this;
		$.each(this.knowledgeBase.weather.temperature, function (index, val) {
			console.log( index + " val " + val);
			options.air = {
				"Tair": self.knowledgeBase.weather.temperature[index], 	//C
				"rh": self.knowledgeBase.weather.humidity[index], 	//% relative humidity
				"Pw_air": self.knowledgeBase.weather.watervapourpressure[index],   //kPa partial water vapour pressure
				"Trad": self.knowledgeBase.weather.meanradianttemperature[index], 	//C mean radiant temperature
				"Tglobe": self.knowledgeBase.weather.globetemperature[index],
				"v_air": self.knowledgeBase.weather.windspeed2m[index], 	//m/s air velocity at 2m.
				"v_air10": self.knowledgeBase.weather.windspeed[index],  //m/s air velocity at 10m.
			};
			
			heatindex.IREQ.set_options(options);
			heatindex.IREQ.sim_run();
			var ireq = heatindex.IREQ.current_result();
			var ireq_object = {
				"ICLminimal": ireq.ICLminimal,
				"DLEminimal": ireq.DLEminimal,
				"ICLneutral": ireq.ICLneutral,
				"DLEneutral": ireq.DLEneutral,
				"M": options.body.M,
				"Icl": options.cloth.Icl,
				"p": options.cloth.p,
				"im_st": options.cloth.im_st,
				"Tair": options.air.Tair,
				"rh": options.air.rh,
				"v_air": options.air.v_air, //@2m
				"v_air10": options.air.v_air10, //@10m
				"Trad": options.air.Trad,
				"Tglobe": options.air.Tglobe,
				"clouds": self.knowledgeBase.weather.clouds[index],
				"rain": self.knowledgeBase.weather.rain[index],
				"rad": self.knowledgeBase.weather.radiation[index],
				"wbgt": self.knowledgeBase.weather.wbgt[index],
				"wbgt_max": self.knowledgeBase.weather.wbgt_max[index],
				"windchill": self.knowledgeBase.weather.windchill[index],
				"utc": self.knowledgeBase.weather.utc[index],
			};
			self.knowledgeBase.thermalindices.ireq.push(ireq_object);
			
			
			heatindex.PHS.set_options(options);
			heatindex.PHS.sim_init();

			let simduration = self.knowledgeBase.sim.duration;
			for (var i = 1; i <= simduration; i++) {
				var res = heatindex.PHS.time_step();
			}
			var phs = heatindex.PHS.current_result();
			var phs_object = {
				"D_Tre": phs.D_Tre,
				"Dwl50": phs.Dwl50,
				"SWtotg": phs.SWtotg,
				"M": options.body.M,
				"Icl": options.cloth.Icl,
				"p": options.cloth.p,
				"im_st": options.cloth.im_st,
				"Tair": options.air.Tair,
				"rh": options.air.rh,
				"v_air": options.air.v_air, //@2m
				"v_air10": options.air.v_air10, //@10m
				"Trad": options.air.Trad,
				"Tglobe": options.air.Tglobe,
				"clouds": self.knowledgeBase.weather.clouds[index],
				"rain": self.knowledgeBase.weather.rain[index],
				"rad": self.knowledgeBase.weather.radiation[index],
				"wbgt": self.knowledgeBase.weather.wbgt[index],
				"wbgt_max": self.knowledgeBase.weather.wbgt_max[index],
				"windchill": self.knowledgeBase.weather.windchill[index],
				"utc": self.knowledgeBase.weather.utc[index],
			};
			self.knowledgeBase.thermalindices.phs.push(phs_object);
			
			//pmv indoor
			
			//Pw_air assumed equal indoor and outdoor, RH different because of temperature difference.
			//let wvp = 0.1 * (val * 0.01) * Math.exp(18.965 - 4030 / (T + 235));
			var rh_outdoor = options.air.Pw_air / ( 0.1 *0.01 * Math.exp(18.965 - 4030 / (options.air.Tair + 235)) );
			var T_indoor = self.knowledgeBase.user.settings._temperature;
			var rh_indoor = Math.round( options.air.Pw_air / ( 0.1 *0.01 * Math.exp(18.965 - 4030 / (T_indoor + 235)) ) );
			
			var v_indoor = self.knowledgeBase.user.settings.open_windows ? 0.25 * self.knowledgeBase.weather.windspeed[index] : 0.1;
			options.air = {
				"Tair": T_indoor, 	//C
				"rh": rh_indoor, 	//% relative humidity
				"Pw_air": self.knowledgeBase.weather.watervapourpressure[index],   //kPa partial water vapour pressure
				"Trad": T_indoor, 	//C mean radiant temperature
				"v_air": v_indoor,
				"v_air10": self.knowledgeBase.weather.windspeed[index],  //m/s air velocity at 10m.
			};
			
			heatindex.PMV.set_options(options);
			heatindex.PMV.sim_run();
			var pmv = heatindex.PMV.current_result();
			var pmv_object = {
				"PMV": pmv.PMV,
				"PPD": pmv.PPD,
				"M": options.body.M,
				"Icl": options.cloth.Icl,
				"p": options.cloth.p,
				"im_st": options.cloth.im_st,
				"Tair": options.air.Tair,
				"rh": options.air.rh,
				"v_air": options.air.v_air, //@2m
				"v_air10": options.air.v_air10, //@10m
				"Trad": options.air.Trad,
				"Tglobe": options.air.Trad,
				"clouds": self.knowledgeBase.weather.clouds[index],
				"rain": self.knowledgeBase.weather.rain[index],
				"rad": self.knowledgeBase.weather.radiation[index],
				"wbgt": self.knowledgeBase.weather.wbgt[index],
				"wbgt_max": self.knowledgeBase.weather.wbgt_max[index],
				"windchill": self.knowledgeBase.weather.windchill[index],
				"utc": self.knowledgeBase.weather.utc[index],
			}
			self.knowledgeBase.thermalindices.pmv.push(pmv_object);
			self.saveSettings();
		});
	},
	updateUI: async function () {
		// context dependent filling of content
		this.initNavbarListeners();
		$(".navigation_back_settings").hide();
		$(".navigation_back_dashboard").hide();
		$(".navigation_back_custom").hide();
		$("#google_maps_elem").hide();

		if (this.currentPageID == "onboarding") {
			$(".navigation").hide();

			// Setting page content
			$("#str_welcome").html(this.translations.labels.str_welcome[this.language]);
			$("#onboarding_to_settings").html(this.translations.sentences.onboarding_to_settings[this.language]);			
			$("#str_settings").html(this.translations.labels.str_settings[this.language]);
			$("#onboarding_to_dashboard").html(this.translations.sentences.onboarding_to_dashboard[this.language]);			
			$("#str_dashboard").html(this.translations.labels.str_dashboard[this.language]);
		}
		else if (this.currentPageID == "error") {
			$(".navigation").hide();
			this.initErrorListeners();
			
			// Set page content
			$("#error_retrieve_weather").html(this.translations.sentences.error_retrieve_weather[this.language]);
			$("#str_try_again").html(this.translations.labels.str_try_again[this.language]);
		}
		else if (this.currentPageID == "dashboard") {
			$(".navigation").show();
			$("#main_panel").show();
			$("#tip_panel").show();
			this.initDashboardListeners();
			
			this.initGeolocationListeners();
			
			this.initActivityListeners();
			
			this.initMenuListeners();
			
			this.initToggleListeners();
			
			this.updateMenuItems();
			
			if (this.knowledgeBase.user.guards.isIndoor) {
				// Hide forecast when custom input is used
				$("#navbar-forecast").hide();
				$("#navbar-location").hide();
				
				$("#dashboard_header").hide();
				$("#dashboard_forecast").hide();
				$("#temperature").html(getTemperatureValueInPreferredUnit(this.knowledgeBase.user.settings.temp_indoor_predicted, this.knowledgeBase.user.settings.unit) + "&#xb0");
				$("#humidity_value").html(this.knowledgeBase.user.settings._humidity);
				$("#windspeed").html(this.getWindspeedTextFromValue(this.knowledgeBase.user.settings.windspeed));
				$("#open_windows").html(this.knowledgeBase.user.settings.open_windows);
				$("#temp_unit").html(getTemperatureUnit(this.knowledgeBase.user.settings.unit));

				// Remove weather indication from dashboard // substitute with windows open/close
                $("#icon-weather").removeClass().addClass("fab").addClass("fa-windows");
				$("#weather_desc").html(this.knowledgeBase.user.settings.open_windows ? this.translations.labels.indoor_open_windows[this.language] : this.translations.labels.indoor_no_open_windows[this.language]);
				this.updateInfo(0);
				
			} else {
				$("#navbar-forecast").show();
				$("#navbar-location").show();
				$("#dashboard_header").show();
				$("#dashboard_forecast").show();
				this.initDashboardSwipeListeners();
				
				this.updateInfo(this.selectedWeatherID);
			}
			var indoorOutdoorMode = this.knowledgeBase.user.guards.isIndoor ? this.translations.labels.str_indoor[this.language] : this.translations.labels.str_outdoor[this.language];

			// Set dashboard content using translations sheet
			$("#str_weather_report").html(this.translations.labels.str_weather_report[this.language]);
			$("#indoor_outdoor").html(indoorOutdoorMode);
			$("#str_more_info").html(this.translations.labels.str_more_info[this.language]);
			$("#str_personalise").html(this.translations.labels.str_personalise[this.language]);
			
			$("#str_activity_level").html(this.translations.labels.str_activity_level[this.language]);
			$("#str_clothing_level").html(this.translations.labels.str_clothing_level[this.language]);
			$("#str_activity").html(this.translations.labels.str_activity[this.language]);
			$("#str_clothing").html(this.translations.labels.str_clothing[this.language]);
			$("#str_headgear").html(this.translations.labels.str_headgear[this.language]);
			$("#head_gear").html(this.translations.labels.str_headgear[this.language]);
			
			// Giving the user an introduction of the dashbord on first login
			if (!this.knowledgeBase.user.guards.introductionCompleted) {
				startIntro(this.translations, this.language);
				this.knowledgeBase.user.guards.introductionCompleted = 1;
				this.saveSettings();
			}
		}
		else if (this.currentPageID == "details") {
			$(".navigation").hide();
			$(".navigation_back_dashboard").show();

			// Setting all page text content from translations sheet
			$("#str_more_info").html(firstCharToUpper(this.translations.labels.str_more_info[this.language]));
			$("#str_details").html(this.translations.labels.str_details[this.language]);
			$("#details_desc").html(this.translations.sentences.details_desc[this.language]);
			$("#str_weather").html(this.translations.labels.str_weather[this.language]);

			$("#str_time").html(this.translations.labels.str_time[this.language]);
			$("#str_air_temperature").html(this.translations.labels.str_air_temperature[this.language]);
			$("#str_humidity").html(this.translations.labels.str_humidity[this.language]);
			$("#str_cloud_cover").html(this.translations.labels.str_cloud_cover[this.language]);
			$("#str_wind10").html(this.translations.labels.str_wind10[this.language]);
			$("#str_wind2").html(this.translations.labels.str_wind2[this.language]);
			$("#str_mrt").html(this.translations.labels.str_mrt[this.language]);
			$("#str_globe_temperature").html(this.translations.labels.str_globe_temperature[this.language]);
			$("#str_solar_irradiation").html(this.translations.labels.str_solar_irradiation[this.language]);
			$("#str_wbgt").html(this.translations.labels.str_wbgt[this.language]);
			$("#str_wbgt_effective").html(this.translations.labels.str_wbgt_effective[this.language]);
			$("#str_aal").html(this.translations.labels.str_aal[this.language]);
			$("#str_pal").html(this.translations.labels.str_pal[this.language]);
			$("#str_windchill").html(this.translations.labels.str_windchill[this.language]);
			$("#str_mr").html(this.translations.labels.str_mr[this.language]);
			$("#str_surface_area").html(this.translations.labels.str_surface_area[this.language]);
			$("#str_clo").html(this.translations.labels.str_clo[this.language]);
			$("#str_wind_permeability").html(this.translations.labels.str_wind_permeability[this.language]);
			$("#str_evaporative_permeability").html(this.translations.labels.str_evaporative_permeability[this.language]);

			$("#str_user").html(this.translations.labels.str_user[this.language]);
			$("#str_wbgt").html(this.translations.labels.str_wbgt[this.language]);
			$("#str_wbgt_iso").html(this.translations.labels.str_wbgt_iso[this.language]);
			$("#details_wbgt_desc_1").html(this.translations.sentences.details_wbgt_desc_1[this.language]);
			$("#details_wbgt_desc_2").html(this.translations.sentences.details_wbgt_desc_1[this.language]);
			
			$("#str_phs_iso").html(this.translations.labels.str_phs_iso[this.language]);
			$("#details_phs_desc_1").html(this.translations.sentences.details_phs_desc_1[this.language]);
			$("#details_phs_desc_2").html(this.translations.sentences.details_phs_desc_2[this.language]);
			$("#details_phs_desc_3").html(this.translations.sentences.details_phs_desc_3[this.language]);
			
			$("#str_windchill_jagti").html(this.translations.labels.str_windchill_jagti[this.language]);
			$("#details_windchill_desc_1").html(this.translations.sentences.details_windchill_desc_1[this.language]);
			$("#details_windchill_desc_2").html(this.translations.sentences.details_windchill_desc_2[this.language]);					
			
			$("#str_ireq_iso").html(this.translations.labels.str_ireq_iso[this.language]);
			$("#details_ireq_desc").html(this.translations.sentences.details_ireq_desc[this.language]);
			$("#details_ireq_list1").html(this.translations.sentences.details_ireq_desc_list1[this.language]);
			$("#details_ireq_list2").html(this.translations.sentences.details_ireq_desc_list2[this.language]);
			$("#details_ireq_list3").html(this.translations.sentences.details_ireq_desc_list3[this.language]);

			$("#details_ireq_clo_1").html(this.translations.sentences.details_ireq_clo_1[this.language]);
			$("#details_ireq_clo_2").html(this.translations.sentences.details_ireq_clo_2[this.language]);
			$("#details_ireq_clo_3").html(this.translations.sentences.details_ireq_clo_3[this.language]);
			
			$("#str_min_cloth_level").html(this.translations.labels.str_min_cloth_level[this.language]);
			$("#str_max_cloth_level").html(this.translations.labels.str_max_cloth_level[this.language]);

			$("#details_ireq_clo_dle_1").html(this.translations.sentences.details_ireq_clo_dle_1[this.language]);
			$("#details_ireq_clo_dle_2").html(this.translations.sentences.details_ireq_clo_dle_2[this.language]);
			$("#details_neutral").html(this.translations.sentences.details_neutral[this.language]);
			
			var index = this.selectedWeatherID;
			
			this.getDrawGaugeParamsFromIndex(index, this.knowledgeBase, true).then(
				([width, personalvalue, modelvalue, thermal, tip_html]) => {
					let tair = 0;
					let rh = 0;
					let vair2 = 0;
					let tglobe = 0;
					let tmrt = 0;
					console.log("updateInfo Details - A");
					
					if (this.knowledgeBase.user.guards.isIndoor) {
						tair = this.knowledgeBase.user.settings._temperature;
						rh = this.knowledgeBase.thermalindices.pmv[index].rh.toFixed(0);
						vair2 = this.knowledgeBase.thermalindices.pmv[index].v_air.toFixed(1);
						tmrt = this.knowledgeBase.thermalindices.pmv[index].Trad.toFixed(1);
						tglobe = this.knowledgeBase.thermalindices.pmv[index].Tglobe.toFixed(1);
					} else {
						rh = this.knowledgeBase.thermalindices.phs[index].rh.toFixed(0);
						vair2 = this.knowledgeBase.thermalindices.phs[index].v_air.toFixed(1);
						tair = this.knowledgeBase.thermalindices.phs[index].Tair.toFixed(1);
						tmrt = this.knowledgeBase.thermalindices.phs[index].Trad.toFixed(1);
						tglobe = this.knowledgeBase.thermalindices.phs[index].Tglobe.toFixed(1);
					}
					console.log("updateInfo Details - B");
					let clouds = this.knowledgeBase.thermalindices.phs[index].clouds.toFixed(0);

					let rad = this.knowledgeBase.thermalindices.phs[index].rad.toFixed(0);
					let vair10 = this.knowledgeBase.thermalindices.phs[index].v_air10.toFixed(1);
					 
					let wbgt = this.knowledgeBase.thermalindices.phs[index].wbgt.toFixed(1);
					let wbgt_eff = getWBGTeffective(wbgt, this.knowledgeBase);
					let ral = RAL(this.knowledgeBase);
					let pal = getPAL(this.knowledgeBase, thermal);
					let personal_ral = ral - pal;

					var windchill = this.knowledgeBase.thermalindices.phs[index].windchill.toFixed(1);
			
					let M = this.knowledgeBase.thermalindices.phs[index].M.toFixed(0);
					let A = BSA(this.knowledgeBase).toFixed(1);

					let Icl = (0.155 * this.knowledgeBase.thermalindices.phs[index].Icl);
					Icl = Icl.toFixed(3);

					let p = this.knowledgeBase.thermalindices.phs[index].p.toFixed(2);
					let im = this.knowledgeBase.thermalindices.phs[index].im_st.toFixed(2);

					let utc_date = new Date(this.knowledgeBase.thermalindices.ireq[index].utc); //
					let local_time = utc_date.toLocaleTimeString(navigator.language, { //language specific setting
						hour: '2-digit',
						minute: '2-digit'
					});

					$("#detail_time").html(local_time);

					$("#detail_airtemp").html(tair + "&deg;C");
					$("#detail_rh").html(rh + "%");
					$("#detail_clouds").html(clouds + "%");

					$("#detail_wind10m").html(vair10 + "m/s");
					$("#detail_wind2m").html(vair2 + "m/s");

					$("#detail_mrt").html(tmrt + "&deg;C");
					
					$("#detail_tglobe").html(tglobe + "&deg;C");

					$("#detail_rad").html(rad + "W/m<sup>2</sup>");
					console.log("updateInfo Details - C");
					
					if( this.knowledgeBase.user.guards.isIndoor ){
						$("div[data-group='wbgt']").hide();
						$("div[data-group='ireq']").hide();
					}
					else{
						if( thermal === "heat" ){
							$("div[data-group='wbgt']").show();
							$("div[data-group='ireq']").hide();
						
							$("#detail_wbgt").html(wbgt + "&deg;C");
							$("#detail_wbgt_eff").html(wbgt_eff.toFixed(1) + "&deg;C");
					
							$("#detail_ral").html(ral.toFixed(1) + "&deg;C");
							$("#detail_ral_pal").html(personal_ral.toFixed(1) + "&deg;C");
						}
						else{
							$("div[data-group='wbgt']").hide();
							$("div[data-group='ireq']").show();
							$("#detail_windchill").html(windchill + "&deg;C");						
						}
					}
					
						
					console.log("updateInfo Details - D");
					

					$("#detail_metabolic").html(M + "W/m<sup>2</sup>");
					$("#detail_area").html(A + "m<sup>2</sup>")

					$("#detail_icl").html(Icl + "m<sup>2</sup>K/W");
				
					$("#detail_p").html(p);
					$("#detail_im").html(im);
					
					$("#moreinformation").html( tip_html );
					console.log("updateInfo Details - E");
					
					if( this.knowledgeBase.user.guards.isIndoor ){
						$("div[data-context='heat'],div[data-context='phs'],div[data-context='neutral'],div[data-context='cold']").hide();
					}
					else{
						let icl_min = this.knowledgeBase.thermalindices.ireq[ index].ICLminimal;
						let icl_neutral = this.knowledgeBase.thermalindices.ireq[ index].ICLneutral;
						let icl_worn = getClo(this.knowledgeBase);
						let cold_index = this.calculateColdIndex(icl_neutral, icl_min, icl_worn, true); // minimal - worn, if negative you do not wear enough clothing
	
						let heat_index = WBGTrisk( wbgt, this.knowledgeBase );
			
						let draw_cold_gauge = this.isDrawColdGauge( icl_min, heat_index, index );
						let draw_heat_gauge = this.isDrawHeatGauge( icl_min, heat_index, index );
						let isNeutral = !draw_cold_gauge && !draw_heat_gauge;
					
						if( personalvalue <= -1 ){
							$("div[data-context='heat'],div[data-context='phs'],div[data-context='neutral']").hide();
							$("div[data-context='cold']").show();
				
							let windrisk = windchillRisk( windchill );
							let windriskcat = windrisk ? "a risk of frostbite in" : "no risk of frostbite";
							$("#detail_exposed_windchill").html( windchill );
							$("#detail_exposed_windriskcat").html( windriskcat );
							if( windrisk ){
								$("#detail_exposed_windrisk").html( windrisk + " minutes");
							}

							let icl_max = this.knowledgeBase.thermalindices.ireq[index].ICLneutral;

							let dle_min = 60 * this.knowledgeBase.thermalindices.ireq[index].DLEminimal;
							dle_min = dle_min.toFixed(0);

							let activity = this.knowledgeBase.user.settings.activity_selected;
							$("#detail_activity_ireq").html(activity);
							$("#detail_icl_max").html(icl_max);
							$("#detail_icl_min").html(icl_min);

							let minicon = clothingIcon(icl_min);
							let maxicon = clothingIcon(icl_max);

							$("#detail_min_clo").html("<img src='" + minicon + "' class='small'/>");
							$("#detail_max_clo").html("<img src='" + maxicon + "' class='small'/>");

							$("#detail_dle_ireq").html(dle_min);
						}
						else if (personalvalue >= 1) {
							$("div[data-context='cold'],div[data-context='phs'],div[data-context='neutral']").hide();
							$("div[data-context='heat']").show();

							$("#detail_wbgt_iso7243").html(wbgt_eff.toFixed(1));
							$("#detail_ral_iso7243").html(ral.toFixed(1));

							if (wbgt_eff >= (ral - pav)) {
								$("div[data-context='phs']").show();
								let d_tre = this.knowledgeBase.thermalindices.phs[index].D_Tre ? this.knowledgeBase.thermalindices.phs[index].D_Tre : ">120";
								let d_sw = this.knowledgeBase.thermalindices.phs[index].Dwl50;
								let sw_tot_per_hour = 0.001 * this.knowledgeBase.thermalindices.phs[index].SWtotg /
									(this.knowledgeBase.sim.duration / 60); //liter per hour
								sw_tot_per_hour = sw_tot_per_hour.toFixed(1);

								$("#detail_sweat").html(sw_tot_per_hour);
								$("#detail_dle_phs").html(d_tre);
							}
						}
						else {
							$("div[data-context='cold'],div[data-context='phs'],div[data-context='heat']").hide();
							$("div[data-context='neutral']").show();
						}
					}
				})
		}
		else if (this.currentPageID == "settings") {
			$(".navigation").show();
			this.initSettingsListeners();
			let unit = this.knowledgeBase.user.settings.unit;
			let height = this.knowledgeBase.user.settings.height;
			let weight = this.knowledgeBase.user.settings.weight;

			$("#str_personal_settings").html(this.translations.labels.str_personal_settings[this.language].toUpperCase());

			$("#str_age").html(this.translations.labels.str_age[this.language]);
			$("#age").html(getAgeFromYearOfBirth(this.knowledgeBase.user.settings.yearOfBirth) + " " + this.translations.labels.str_years[this.language]);
			
			$("#str_height").html(this.translations.labels.str_height[this.language]);
			$("#height").html(getCalculatedHeightValue(unit, height) + " " + getHeightUnit(unit));
			
			$("#str_weight").html(this.translations.labels.str_weight[this.language]);
			$("#weight").html(getCalculatedWeightValue(unit, weight) + " " + getWeightUnit(unit));
			
			$("#str_gender").html(this.translations.labels.str_gender[this.language]);
			var genderAsText = this.knowledgeBase.user.settings.gender == 0 ? this.translations.labels.str_female[this.language] : this.translations.labels.str_male[this.language];
			$("#gender").html(genderAsText);
			
			$("#str_acclimatization").html(this.translations.labels.str_acclimatization[this.language]);
			$("#acclimatization_checkbox").prop("checked", this.knowledgeBase.user.settings.acclimatization);

			$("#str_advanced_personalization").html(this.translations.labels.str_advanced_personalization[this.language]);
			$("#str_reset_preferences").html(this.translations.labels.str_reset_preferences[this.language]);
			
			$("#str_preferences").html(this.translations.labels.str_preferences[this.language].toUpperCase());
			$("#str_unit").html(this.translations.labels.str_unit[this.language]);
			$("#unit").html(this.knowledgeBase.user.settings.unit + " " + this.translations.labels.str_units[this.language]);

			
			$("#str_other").html(this.translations.labels.str_other[this.language].toUpperCase());			
			$("#str_about").html(this.translations.labels.str_about[this.language]);
			$("#str_disclaimer_and_privacy").html(this.translations.labels.str_disclaimer_and_privacy[this.language]);
		}
		else if (this.currentPageID == "feedback") {
			$(".navigation").hide();
			$(".navigation_back_settings").show();
			this.initToggleListeners();
			this.initFeedbackListeners();
			this.knowledgeBase.user.guards.feedbackSliderChanged = 0;

			// Set page content
			$("#gauge_text_top").html(this.translations.sentences.feedback_adaptation_score[this.language]);
			$("#str_colder").html(this.translations.labels.str_colder[this.language]);			
			$("#str_warmer").html(this.translations.labels.str_warmer[this.language]);			
			$("#str_ok").html(this.translations.labels.str_ok[this.language]);			
			$("#str_more_questions").html(this.translations.labels.str_more_questions[this.language].toUpperCase());			
			$("#str_submit_data").html(this.translations.labels.str_submit_data[this.language]);
			// TODO - add text for feedback questions			

			// Draw gauge with current index value 
			let index = 0; // 0 = current situation -- is this what we want? -BK tricky tbd
			this.getDrawGaugeParamsFromIndex(index, this.knowledgeBase, false).then(
				([width, personalvalue, modelvalue, thermal, tip_html]) => {//
									
					$("#gauge_text_top_diff").hide();
					$("#reset_icon").hide();
					
					this.drawGauge('feedback_gauge', width, personalvalue, thermal);
					
					this.knowledgeBase.user.adaptation.mode = thermal;
					
					// Save current gauge value as original value
					this.knowledgeBase.user.adaptation[thermal].predicted = modelvalue;
					
					this.saveSettings();
					var diff_array = this.knowledgeBase.user.adaptation[thermal].diff;
					
					$("div[data-listener='adaptation']").attr("data-context", thermal);
					
					// Set text around gauge and slider
					if (diff_array.length >= 1) {
						$("#gauge_text_top_diff").show();
						
						$("#reset_icon").show();
						// Personal heat/cold alert limit: <value>
						$("#gauge_text_top_diff").html(this.translations.labels.str_personal[this.language] + " " + thermal + " " + this.translations.labels.str_alert_level[this.language] +": " + diff_array[0].toFixed(1));
					}
					$("#gauge_text_bottom").html(this.translations.sentences.feedback_adaptation_colder_warmer[this.language]);


					// Question text
					$("#question1").html(this.translations.feedback.question1.text[this.language]);
					$("#question2").html(this.translations.feedback.question2.text[this.language]);
					$("#question3").html(this.translations.feedback.question3.text[this.language]);
					
					// Set rating bar text (under feedback buttons) using last given feedback
					$("#ratingtext1").html(self.translations.feedback.question1.ratingtext[self.knowledgeBase.feedback.question1][this.language]);
					$("#ratingtext2").html(self.translations.feedback.question2.ratingtext[self.knowledgeBase.feedback.question2][this.language]);
					$("#ratingtext3").html(self.translations.feedback.question3.ratingtext[self.knowledgeBase.feedback.question3][this.language]);

					// Rating bar values
					$("input[id='1star" + 3 + "']").attr("checked", true);
					$("input[id='2star" + 3 + "']").attr("checked", true);
					$("input[id='3star" + 3 + "']").attr("checked", true);
				});
		}
		else if (this.currentPageID == "forecast") {
			//
			this.initActivityListeners();
			this.initMenuListeners();
			this.updateMenuItems();
			let index = 0;//does not really matter, thermal and width are required

			// Set page content
			

			this.getDrawGaugeParamsFromIndex(index, this.knowledgeBase, false).then(
				([width, personalvalue, modelvalue, thermal, tip_html]) => {
					
					$("#str_forecast").html(this.translations.labels.str_forecast[this.language]);
					
					if( thermal === "heat" ){
						$("#forecast_desc").html(this.translations.sentences.forecast_desc_heat[this.language]);
						$("#forecast_disclaimer").html(this.translations.sentences.forecast_disclaimer[this.language]);
					}
					else{
						$("#forecast_desc").html(this.translations.sentences.forecast_desc_cold[this.language]);
						$("#forecast_disclaimer").html("");		
					}

					$("#str_activity").html(this.translations.labels.str_activity[this.language]);
					$("#str_clothing").html(this.translations.labels.str_clothing[this.language]);
					$("#str_headgear").html(this.translations.labels.str_headgear[this.language]);

					$("#str_activity_level").html(this.translations.labels.str_activity_level[this.language]);
					$("#str_clothing_level").html(this.translations.labels.str_clothing_level[this.language]);
					$("#head_gear").html(this.translations.labels.str_headgear[this.language]);
					
					this.drawChart("forecast_canvas", width, thermal);
				});
		}
		else if (this.currentPageID == "about") {
			$(".navigation").hide();
			$(".navigation_back_settings").show(); //BK: class used as id - consider using id - #navigation_back_settings instead of .
			
			// Setting page content
			$("#str_era4cs").html(this.translations.labels.str_era4cs[this.language]);
			$("#about_read_more").html(this.translations.sentences.about_read_more[this.language]);
			$("#str_img_cred").html(this.translations.labels.str_img_cred[this.language]);
			$("#about_acknowledge_flaticon").html(this.translations.sentences.about_acknowledge_flaticon[this.language]);
			$("#about_acknowledge_fontawesome").html(this.translations.sentences.about_acknowledge_fontawesome[this.language]);
			$("#str_app_info").html(this.translations.labels.str_app_info[this.language]);
			
			$("#app_version").html(this.translations.labels.str_app_version[this.language] + ": " + this.knowledgeBase.app_version);
			$("#kb_version").html(this.translations.labels.str_kb_version[this.language] + ": " + this.knowledgeBase.version);
		}
		else if (this.currentPageID == "disclaimer") {
			$(".navigation").hide();
			$(".navigation_back_settings").show();

			// Setting page content
			$("#str_disclaimer").html(this.translations.labels.str_disclaimer[this.language]);
			$("#disclaimer_under_development").html(this.translations.sentences.disclaimer_under_development[this.language]);
			$("#disclaimer_era4cs").html(this.translations.sentences.disclaimer_era4cs[this.language]);
			$("#str_privacy").html(this.translations.labels.str_privacy[this.language]);
			$("#disclaimer_privacy_policy").html(this.translations.sentences.disclaimer_privacy_policy[this.language]);
		}
		else if (this.currentPageID == "location") {
			$("#custom_location_switch").show();
			$("#customLocationSection").show();
			$(".navigation_back_custom").hide();
			$("#google_maps_elem").hide();
			$("#coordinates").html("lat: " + this.knowledgeBase.user.settings.coordinates_lat.toFixed(4) + ", lon: " + this.knowledgeBase.user.settings.coordinates_lon.toFixed(4));
			$("#choose_location").html(this.translations.labels.str_choose_location[this.language]);
			$("#str_custom_location").html(this.translations.labels.str_custom_location[this.language]);
			$("#str_input_custom_location").html(this.translations.labels.str_input_custom_location[this.language]);
			$("#str_location").html(this.translations.labels.str_location[this.language]);
			$("#str_set_location").html(this.translations.labels.str_set_location[this.language]);
			$("#latlon_desc").html(this.translations.labels.str_new_location[this.language]);
			
			// Location
			this.knowledgeBase.user.guards.customLocationEnabled ? $("#customLocationSection").show() : $("#customLocationSection").hide();
			$("#custom_location_checkbox").prop("checked", this.knowledgeBase.user.guards.customLocationEnabled);
			this.initLocationListeners();
			
			if (customLocationEnabled(this.knowledgeBase)) {
				$("#location").html(this.translations.labels.str_saved_location[this.language] + ": " + this.knowledgeBase.user.settings.station + " (" + this.knowledgeBase.user.settings.coordinates_lat.toFixed(4) + ", " + this.knowledgeBase.user.settings.coordinates_lon.toFixed(4)  + ")");
				var [lat, lon] = getLocation(this.knowledgeBase);
				var center = new google.maps.LatLng(lat, lon);
				
				// using global variable:
				window.map.panTo(center);
				
			} else {
				$("#location").html(this.translations.labels.str_saved_location[this.language] + ": " + this.knowledgeBase.position.lat + ", " + this.knowledgeBase.position.lng);
    			var center = new google.maps.LatLng(this.knowledgeBase.position.lat , this.knowledgeBase.position.lng);
   				// using global variable:
   				window.map.panTo(center);
			}			
		}
		else if (this.currentPageID == "indoor") {
			
			$(".navigation_back_settings").hide();
			$(".navigation_back_dashboard").hide();
			$(".navigation_back_custom").hide();

			$("#indoor_checkbox").prop("checked", this.knowledgeBase.user.guards.isIndoor);
			this.knowledgeBase.user.guards.isIndoor ? $("#indoorSection").show() : $("#indoorSection").hide();
			this.initIndoorListeners();
			
			
			var windowsOpen = this.knowledgeBase.user.settings.open_windows ? this.translations.labels.str_yes[this.language] : this.translations.labels.str_no[this.language];
			
			// Setting page content
			$("#str_indoor_outdoor_mode").html(this.translations.labels.str_indoor_outdoor_mode[this.language]);
			$("#str_use_indoor_mode").html(this.translations.labels.str_use_indoor_mode[this.language]);
			$("#str_thermostat").html(this.translations.labels.str_thermostat[this.language]);
			$("#indoor_open_windows").html(this.translations.labels.indoor_open_windows[this.language]);
			$("#str_wind_speed").html(this.translations.labels.str_wind_speed[this.language]);
			$("#str_humidity").html(this.translations.labels.str_humidity[this.language]);
			$("#str_continue").html(this.translations.labels.str_continue[this.language]);

			// Values
			var tempUnit = this.knowledgeBase.user.settings.unit === "US" ? "F" : "C";
			$("#_temperature").html( this.knowledgeBase.user.settings._temperature + " &#xb0 " + tempUnit);
			//$("#windspeed").html(this.getWindspeedTextFromValue(this.knowledgeBase.user.settings.windspeed));
			//$("#_humidity").html(this.knowledgeBase.user.settings._humidity + " %");
			//$("#thermostat_level").html(this.knowledgeBase.user.settings.thermostat_level);
			$("#open_windows").html(windowsOpen);
		}
	},
	updateMenuItems: function () {
		let selected = this.knowledgeBase.user.settings.activity_selected;
		$("#dashboard_activity").html(this.translations.wheels.activity.label[selected][this.language]);
		let caption_ = this.translations.wheels.activity.description[selected][this.language];
		console.log(JSON.stringify( caption_ ));
	
		$("#activityCaption").html(caption_);

		selected = this.knowledgeBase.user.settings.clothing_selected;
		$("#dashboard_clothing").html(this.translations.wheels.clothing.label[selected][this.language]);
		caption_ = this.translations.wheels.clothing.description[selected][this.language];
		$("#clothingCaption").html(caption_);

		selected = this.knowledgeBase.user.settings.headgear_selected;
		$("#dashboard_headgear").html(this.translations.wheels.headgear.label[selected][this.language]);
		caption_ = this.translations.wheels.headgear.description[selected][this.language];
		$("#headgearCaption").html(caption_);
	},
	calculateColdIndex: function( icl_neutral, icl_min, icl_worn, isPersonalised ){
		var value = 0;
		
		var PAL = isPersonalised ? this.knowledgeBase.user.adaptation["cold"].diff[0] : 0;
		icl_worn = icl_worn + PAL;
		if( icl_worn < icl_min ){
			value = 1 +  icl_min - icl_worn;
		}
		else if( icl_worn <= icl_neutral ){
			var range = icl_neutral - icl_min;
			var x = icl_worn - icl_min;
			value = 1.0 - x;
		}
		return value;
	},
	getDrawGaugeParamsFromIndex: async function(index, kb, leveloverride ) {
		
		
		console.log( "getDrawGaugeParamsFromIndex " + index );
		var icl_min = kb.thermalindices.ireq[index].ICLminimal;
		var icl_neutral = kb.thermalindices.ireq[index].ICLneutral;
		var icl_worn = getClo(kb);
		
		var personal_cold_index = this.calculateColdIndex( icl_neutral, icl_min, icl_worn, true); 
		var model_cold_index = this.calculateColdIndex( icl_neutral, icl_min, icl_worn, false); 
	
		var personal_heat_index = WBGTrisk( kb.thermalindices.phs[index].wbgt, kb, true );
		var model_heat_index = WBGTrisk( kb.thermalindices.phs[index].wbgt, kb, false );	
		
		var pmv_index = kb.thermalindices.pmv[index].PMV;
		
		var isIndoor = this.knowledgeBase.user.guards.isIndoor;
		if( isIndoor ){
			personal_heat_index = pmv_index;
			model_heat_index = pmv_index;
			personal_cold_index = pmv_index;
			model_cold_index = pmv_index;
		}
		
		let draw_cold_gauge = this.isDrawColdGauge( model_cold_index, model_heat_index, index );
		let draw_heat_gauge = this.isDrawHeatGauge( model_cold_index, model_heat_index, index );

		let isNeutral = !draw_cold_gauge && !draw_heat_gauge;
		let tip_html = "";
		let thermal = draw_cold_gauge ? "cold" : "heat";
		let level = leveloverride ? 2 : kb.user.settings.level;
		
		let personal_value = this.determineThermalIndexValue(personal_cold_index, personal_heat_index, index, isIndoor);
		let model_value = this.determineThermalIndexValue(model_cold_index, model_heat_index, index, isIndoor);
		
		
		if( this.knowledgeBase.user.guards.isIndoor ){
			tip_html += indoorTips( kb, this.translations, this.language);
		}
		else{
			if (draw_cold_gauge || (isNeutral && cold_index > personal_heat_index)) {
				tip_html += coldLevelTips(index, level, kb, personal_cold_index, this.currentPageID, this.translations, this.language);
			}
			else {
				var fromThermalAdvisor = await heatLevelTips(index, level, kb, this.currentPageID, this.translations, this.language);
				tip_html += fromThermalAdvisor;
			}
		}
		
		let windowsize = $(window).width();
		let width = windowsize / 2.5;

		
		return [width, personal_value, model_value, thermal, tip_html];
	},
	getDiff: function (kb, thermal) {
		// This lgoci is also used in dashboard.js function: heatlevelTips
		getPAL(kb, thermal);
	},
	// ireq only valid with temperatures less than 10
	isDrawColdGauge: function (cold, heat, index) {
		return cold >= heat
			   &&
		this.knowledgeBase.thermalindices.ireq[ index].Tair <= 15; //ireq only from <10 however, 15 can already be cold with 0.5 clo
	},
	isDrawHeatGauge: function (cold, heat, index) {
		return heat > cold;
	},
	determineThermalIndexValue: function (cold, heat, index, isIndoor) {
		
		if( isIndoor ){
			return cold; //return pmv value 
		}
		else{
			let value = cold > heat ? -cold : heat;
		
			value = this.isDrawColdGauge(cold, heat, index) ? -cold : value;
			value = this.isDrawHeatGauge(cold, heat, index) ? heat : value;
		}
		
		return Math.max(-4, Math.min(4, value));//value between -4 and +4
	},
	updateInfo: function (index) {
		var self = this;
		if (this.knowledgeBase.thermalindices.ireq.length > 0 && !this.knowledgeBase.user.guards.isIndoor) {
			$("#icon-weather").show();
			$("#weather_desc").show();

			let distance = parseFloat(this.knowledgeBase.weather.distance).toFixed(0);
			let utc_date = new Date(this.knowledgeBase.thermalindices.ireq[index].utc); //
			let local_time = utc_date.toLocaleTimeString(navigator.language, { //language specific setting
				hour: '2-digit',
				minute: '2-digit'
			});
			$("#current_time").html(local_time);

			let next = index + 1;
			let prev = index - 1;

			let cDate = new Date();
			let cDaynumber = cDate.getDate();
			let cMonthnumber = cDate.getMonth();
			let cYearnumber = cDate.getYear();

			if (prev < 0) {
				$("#swipe_left_time").html(this.translations.labels.str_update_weather[this.language]);
			}
			else {
				$("#forecast_left").show();

				let prev_utc_date = new Date(this.knowledgeBase.thermalindices.ireq[prev].utc); //
				let prev_local_time = prev_utc_date.toLocaleTimeString(navigator.language, { //language specific setting
					hour: '2-digit',
					minute: '2-digit'
				});
				if (prev_utc_date.getDate() > cDaynumber ||
					prev_utc_date.getMonth() > cMonthnumber ||
					prev_utc_date.getYear() > cYearnumber) {

					prev_local_time = this.translations.labels.str_tomorrow[this.language] + " " + prev_local_time;
				}
				$("#swipe_left_time").html(prev_local_time);
			}

			if (next > this.maxForecast) {
				$("#forecast_right").hide();
			}
			else {
				$("#forecast_right").show();

				let next_utc_date = new Date(this.knowledgeBase.thermalindices.ireq[next].utc); //
				let next_local_time = next_utc_date.toLocaleTimeString(navigator.language, { //language specific setting
					hour: '2-digit',
					minute: '2-digit'
				});
				if (next_utc_date.getDate() > cDaynumber ||
					next_utc_date.getMonth() > cMonthnumber ||
					next_utc_date.getYear() > cYearnumber) {

					next_local_time = this.translations.labels.str_tomorrow[this.language] + " " + next_local_time;
				}
				$("#swipe_right_time").html(next_local_time);
			}

			var isCustomLocation = customLocationEnabled(this.knowledgeBase) ? ", " + this.translations.labels.str_custom[this.language] : "";
			$("#station").html(this.knowledgeBase.weather.station + " (" + distance + " km)" + isCustomLocation);

			$("#temperature").html(getTemperatureValueInPreferredUnit(this.knowledgeBase.thermalindices.ireq[index].Tair, this.knowledgeBase.user.settings.unit).toFixed(0) + "&#xb0");
			let ws = this.knowledgeBase.thermalindices.ireq[index].v_air10; //m/s to km/h
			$("#windspeed").html(ws.toFixed(0));
			$("#temp_unit").html(getTemperatureUnit(this.knowledgeBase.user.settings.unit));
			$("#humidity").html(this.translations.labels.str_humidity[this.language]);
			$("#humidity_value").html(this.knowledgeBase.thermalindices.ireq[index].rh.toFixed(0));

			$("#windspeed_desc").html(this.translations.labels.str_wind[this.language] + " ");
			$("#windspeed_unit").html(" km/h");

			//weather icon
			let clouds = this.knowledgeBase.thermalindices.ireq[index].clouds;
			let rain = this.knowledgeBase.thermalindices.ireq[index].rain;
			let solar = this.knowledgeBase.thermalindices.ireq[index].rad;

			// Weather descriptions aligned with https://openweathermap.org/weather-conditions
			
			let icon_weather = "fa-cloud-sun-rain";
			if (solar > 0) { //daytime
				if (clouds < 10) {                    //sun
					icon_weather = "fa-sun";
					$("#weather_desc").html(this.translations.labels.weather_sunny_clear[this.language]);
				}
				else if (clouds < 80 && rain < 0.1) { //clouds sun no rain
					icon_weather = "fa-cloud-sun";
					$("#weather_desc").html(this.translations.labels.weather_broken_clouds[this.language]);
				}
				else if (clouds >= 80 && rain < 0.1) { //clouds no rain
					icon_weather = "fa-cloud";
					$("#weather_desc").html(this.translations.labels.weather_overcast_clouds[this.language]);
				}
				else if (clouds < 80 && rain > 0.1) {  //cloud sun rain
					icon_weather = "fa-cloud-sun-rain";
					$("#weather_desc").html(this.translations.labels.weather_light_rain[this.language]);
				}
				else if (clouds >= 80 && rain > 0.1) {  //cloud  rain
					icon_weather = "fa-cloud-rain";
					$("#weather_desc").html(this.translations.labels.weather_light_rain_overcast[this.language]);
				}
				else if (clouds >= 80 && rain > 1) {  //cloud  rain
					icon_weather = "fa-cloud-showers-heavy";
					$("#weather_desc").html(this.translations.labels.weather_shower_rain[this.language]);
				}
			}
			else { //night
				if (clouds < 10) {                    //moon
					icon_weather = "fa-moon";
					$("#weather_desc").html(this.translations.labels.weather_clear[this.language]);
				}
				else if (clouds < 80 && rain < 0.1) { //clouds moon no rain
					icon_weather = "fa-cloud-moon";
					$("#weather_desc").html(this.translations.labels.weather_broken_clouds[this.language]);
				}
				else if (clouds >= 80 && rain < 0.1) { //clouds no rain
					icon_weather = "fa-cloud";
					$("#weather_desc").html(this.translations.labels.weather_overcast_clouds[this.language]);
				}
				else if (clouds < 80 && rain > 0.1) {  //cloud moon rain
					icon_weather = "fa-cloud-moon-rain";
					$("#weather_desc").html(this.translations.labels.weather_light_rain[this.language]);
				}
				else if (clouds >= 80 && rain > 0.1) {  //cloud  rain
					icon_weather = "fa-cloud-rain";
					$("#weather_desc").html(this.translations.labels.weather_light_rain_overcast[this.language]);
				}
				else if (clouds >= 80 && rain > 1) {  //cloud  rain
					icon_weather = "fa-cloud-moon-rain";
					$("#weather_desc").html(this.translations.labels.weather_shower_rain[this.language]);
				}
			}
			$("#icon-weather").removeClass().addClass("fas").addClass(icon_weather);

			self.getDrawGaugeParamsFromIndex(index, self.knowledgeBase, false).then(
				([width, personalvalue, modelvalue, thermal, tip_html]) => {//
					console.log("update info draw gauge phase 2 " + [width, personalvalue, modelvalue, thermal, tip_html]);
					self.drawGauge('main_gauge', width, personalvalue, thermal);

					$("#tips").html(tip_html);
					$("#circle_gauge_color").css("color", getCurrentGaugeColor(personalvalue));
					$("#main_panel").fadeIn(500);
				});

		} else {
			console.log("updateInfo isIndoor");
			if(this.knowledgeBase.thermalindices.phs.length > 0) {
				// Indoor mode
				$("#temperature").html(getTemperatureValueInPreferredUnit(self.knowledgeBase.thermalindices.pmv[0].Tair, self.knowledgeBase.user.settings.unit).toFixed(0) + "&#xb0");
				$("#windspeed").html(self.getWindspeedTextFromValue(self.knowledgeBase.user.settings.windspeed));
				$("#humidity").html(self.translations.labels.str_humidity[self.language]);
				$("#humidity_value").html(self.knowledgeBase.thermalindices.pmv[0].rh);
				$("#temp_unit").html(getTemperatureUnit(self.knowledgeBase.user.settings.unit));
					
				// Remove weather indication from dashboard // substitute with windows open/close
				$("#icon-weather").removeClass().addClass("fab").addClass("fa-windows");
				$("#weather_desc").html(self.knowledgeBase.user.settings.open_windows ? self.translations.labels.indoor_open_windows[self.language] : self.translations.labels.indoor_no_open_windows[self.language]);
				
				// Remove redundant wind speed information when indoor
				$("#windspeed_desc").html("");
				$("#windspeed_unit").html("");
				
				// Indicate indoor/outdoor mode on dashboard
				let isIndoor = self.knowledgeBase.user.guards.isIndoor ? self.translations.labels.str_indoor[self.language] : self.translations.labels.str_outoor[self.language];
				$("#indoor_outdoor").html(isIndoor.toUpperCase());

				// Draw gauge -- any values that needs to be changed?
				self.getDrawGaugeParamsFromIndex(index, self.knowledgeBase, false).then(
					([width, personalvalue, modelvalue, thermal, tip_html]) => {//
						self.drawGauge('main_gauge', width, personalvalue, thermal);
	
						$("#tips").html(tip_html);
						$("#circle_gauge_color").css("color", getCurrentGaugeColor(personalvalue));
						$("#main_panel").fadeIn(500);
					});
			}
		}
	},
	convertWeatherToChartData: function (thermal) {
		var data;
		if( thermal === "heat" ){
			data = {
				"labels": [],
				"min": { "points": [] },
				"max": { "points": [] },
				"ral": { "points": [] },
				"pal": { "points": [] },
				"ymax": 0,
				"ymin": 100,
			};
			for (var i = 0; i < this.maxForecast; i++) {
				var wbgt_min = this.knowledgeBase.thermalindices.phs[i].wbgt;
				var wbgt_effective_min = getWBGTeffective(wbgt_min, this.knowledgeBase);

				var item = {
					x: new Date(this.knowledgeBase.thermalindices.phs[i].utc).toJSON(),
					y: 1.0 * wbgt_effective_min
				};

				data.labels.push(item.x);
				data.min.points.push(item);

				var wbgt_max = this.knowledgeBase.thermalindices.phs[i].wbgt_max;
				var wbgt_effective_max = getWBGTeffective(wbgt_max, this.knowledgeBase);
				item = {
					x: new Date(this.knowledgeBase.thermalindices.phs[i].utc).toJSON(),
					y: 1.0 * wbgt_effective_max
				};
				data.max.points.push(item);

				data.ymax = Math.max( data.ymax, 1.0 * wbgt_effective_max );
				data.ymin = Math.min( data.ymin, 1.0 * wbgt_effective_min );
			}
		}
		else{
			data = {
				"labels": [],
				"coldindex": { "points": [] },//
				"ymin": 99999,
			};
			var icl_worn = getClo(this.knowledgeBase);
			
			for (var i = 0; i < this.maxForecast; i++) {
				
				var icl_min = this.knowledgeBase.thermalindices.ireq[i].ICLminimal;
				var icl_neutral = this.knowledgeBase.thermalindices.ireq[i].ICLneutral;
				var cold_index = -this.calculateColdIndex(icl_neutral, icl_min, icl_worn, true); // minimal - worn, if negative you do not wear enough clothing
				var item = {
					x: new Date(this.knowledgeBase.thermalindices.phs[i].utc).toJSON(),
					y: 1.0 * Math.min(0, cold_index ) //lower limit of green
				};
				data.labels.push(item.x);
				data.coldindex.points.push(item);	
				data.ymin = Math.min(data.ymin, 1.0 * cold_index);
							
			}
		}
		return data;
	},
	drawChart: function (id, width, thermal) {
		console.log( thermal);
		var ctx = document.getElementById(id).getContext('2d');

		if (ctx.canvas.width !== width || ctx.canvas.height !== width) {
			ctx.canvas.height = $(window).height() / 2.5;
			ctx.canvas.width = 0.95 * $(window).width();
		}

		var data = this.convertWeatherToChartData( thermal );

		var x_from = data.labels[0];
		var x_to = data.labels[data.labels.length - 1];
		
		var levels = [];
		var max_y = 0;//cold level
		var min_y = 0;
		 
		
		if( thermal === "heat" ){
			
			var ral = RAL(this.knowledgeBase);
			var pal = ral - getPAL(this.knowledgeBase, thermal);

			var green_y = 0.8 * pal;
			var yellow_y = 1.0 * pal;
			var orange_y = 1.2 * pal;
			var red_y = Math.ceil(Math.max(1.5 * pal, data.ymax + 1));
			max_y = red_y;
			min_y = data.ymin - 1;
			levels = [{
								label: "wbgt",
								backgroundColor: 'rgba(255,255,255,0.3)',
								borderColor: 'rgba(255,255,255,1)',
								borderWidth: 2,
								fill: false,
								data: data.min.points,
								cubicInterpolationMode: 'monotone'
							},
							{
								label: "wbgt max",
								backgroundColor: 'rgba(255,255,255,0.7)',
								borderColor: 'rgba(255,255,255,1)',
								borderWidth: 2,
								fill: '-1',
								data: data.max.points,
								cubicInterpolationMode: 'monotone'
							},
							{
								label: "red",
								backgroundColor: 'rgba(180,0,0,.5)',
								borderColor: 'rgba(180,0,0,1)',
								borderWidth: 2,
								fill: "+1",
								data: [{ x: x_from, y: red_y }, { x: x_to, y: red_y }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							},
							{
								label: "orange",
								backgroundColor: 'rgba(255,125,0,.5)',
								borderColor: 'rgba(255,125,0,1)',
								borderWidth: 2,
								fill: "+1",
								data: [{ x: x_from, y: orange_y }, { x: x_to, y: orange_y }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							},
							{
								label: "yellow",
								backgroundColor: 'rgba(255,255,0,.5)',
								borderColor: 'rgba(255,255,0,1)',
								borderWidth: 2,
								fill: "+1",
								data: [{ x: x_from, y: yellow_y }, { x: x_to, y: yellow_y }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							},
							{
								label: "green",
								backgroundColor: 'rgba(0,255,0,.5)',
								borderColor: 'rgba(0,255,0,1)',
								borderWidth: 2,
								fill: "origin",
								data: [{ x: x_from, y: green_y }, { x: x_to, y: green_y }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							} ];
		}
		else{		
			
			min_y = Math.ceil( Math.min( -4, data.ymin - 1));	
			levels = [	{
								label: "coldrisk",
								backgroundColor: 'rgba(255,255,255,0.3)',
								borderColor: 'rgba(255,255,255,1)',
								borderWidth: 2,
								fill: false,
								data: data.coldindex.points,
								cubicInterpolationMode: 'monotone'
							},
							{
								label: "green",
								backgroundColor: 'rgba(0,255,0,.5)',
								borderColor: 'rgba(0,255,0,1)',
								borderWidth: 2,
								fill: "origin",
								data: [{ x: x_from, y: -1 }, { x: x_to, y: -1 }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							}, 
							{
								label: "cyan",
								backgroundColor: 'rgba(0,180,180,.5)',
								borderColor: 'rgba(0,180,180,1)',
								borderWidth: 2,
								fill: "-1",
								data: [{ x: x_from, y: -2 }, { x: x_to, y: -2 }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							},
							{
								label: "blue",
								backgroundColor: 'rgba(0,100,255,.5)',
								borderColor: 'rgba(0,100,255,1)',
								borderWidth: 2,
								fill: "-1",
								data: [{ x: x_from, y: -3 }, { x: x_to, y: -3 }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							},
							{
								label: "darkblue",
								backgroundColor: 'rgba(0,0,180,.5)',
								borderColor: 'rgba(0,0,180,1)',
								borderWidth: 2,
								fill: "-1",
								data: [{ x: x_from, y: min_y }, { x: x_to, y: min_y }],
								cubicInterpolationMode: 'monotone',
								pointRadius: 0
							}
						];	
		}
		
		var tick_options = thermal === "heat" ? { fontSize: '16', fontColor: 'rgba(255, 255, 255, 1)', fontFamily: 'Lato', max: max_y, min: min_y } : { display:false, callback: function(value, index, values) { return '' + value; },max: max_y, min: min_y } ;
		
		var labelstr = thermal === "heat" ? this.translations.labels.str_heat_index[this.language]: this.translations.labels.str_cold_index[this.language];
		console.log("draw forecast: C");
		
		var chartData = {
			labels: data.labels,
			datasets: levels
		};
		console.log("draw forecast: D");
		new Chart(ctx, {
			type: 'line',
			data: chartData,
			options: {
				toolTips: {
					enabled: false
				},
				responsive: false,
				maintainAspectRatio: false,
				legend: false,
				scales: {
					yAxes: [{
						ticks: tick_options,
						gridLines: {
							color: 'rgba(255, 255, 255, 1)'
						},
						scaleLabel: {
							display: true,
							labelString: labelstr,
							fontColor: 'rgba(255, 255, 255, 1)',
							fontFamily: 'Lato',
							fontSize: '16',
						}
					}],
					xAxes: [{
						type: 'time',
						distribution: 'linear',
						time: {
						},
						ticks: {
							fontSize: '16',
							fontColor: 'rgba(255, 255, 255, 1)',
							fontFamily: 'Lato',
							source: 'data'
						},
						gridLines: {
							color: 'rgba(255, 255, 255, 1)'
						},
						scaleLabel: {
							display: false,
							labelString: "Time",
							fontColor: 'rgba(255, 255, 255, 1)',
							fontFamily: 'Lato'
						}
					}],

				}
			}
		});
		console.log("chart drawn");
	},
	drawGauge: function (id, width, value, key) {
		var c = $("#" + id),
			ctx = c[0].getContext('2d');

		if (ctx.canvas.width !== width || ctx.canvas.height !== width) {
			ctx.canvas.height = width;
			ctx.canvas.width = width;
		}
		var title = value < 0 ? gaugeTitleCold(Math.abs(value), this.translations, this.language) : gaugeTitleHeat(Math.abs(value), this.translations, this.language);
		var highlights = this.knowledgeBase.gauge.highlights;
		var gauge = new RadialGauge({
			renderTo: id,
			width: width,
			height: width,
			units: ' ',
			title: title,
			value: value, // making sure diff is reflected in gauge if any
			minValue: -4,
			maxValue: 4,
			startAngle: 45,
			ticksAngle: 270,
			majorTicks: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
			minorTicks: 2,
			strokeTicks: true,
			highlights: highlights,
			colorPlate: '#fff',
			borderShadowWidth: 2,
			borders: true,
			colorMajorTicks: '#f5f5f5',
			colorMinorTicks: '#ddd',
			colorTitle: '#000',
			colorUnits: '#111',
			colorNumbers: '#111',
			colorNeedle: 'rgba(200, 200, 200, 0.3)',
			colorNeedleEnd: 'rgba(33, 33, 33, .7)',
			colorBorderShadow: 'rgba(33, 33, 33, .7)',
			colorValueText: "#000",
			colorValueBoxRect: "#fff",
			colorValueBoxRectEnd: "#fff",
			colorValueBoxBackground: "#fff",
			colorValueBoxShadow: false,
			colorValueTextShadow: false,
			valueInt: 1,
			valueDec: 1,
			valueBox: true,
			needleType: "line",
			needleShadow: true,
			animationRule: 'elastic',
			animationDuration: 3000,
			fontNumbersSize: 30,
			fontValueSize: 30,
		});
		gauge.draw();
	},
};

app.initialize();

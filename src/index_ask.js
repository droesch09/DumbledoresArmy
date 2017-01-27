'use strict';
var Alexa = require('alexa-sdk');
var APP_ID = undefined;  // TODO replace with your app ID (OPTIONAL).

var languageStrings = {
    

    "en-US": {
        "translation": {
            "ABOUT_ME": [
                "Hi, I am your Porsche.",
                "Hi, it's me, your Porsche, I love you.",
                "I am your Porsche, I am brand new.",
                "I am your Porsche. I am a 918 model, I am very rare.  Only 918 units where ever built. I was produced in Zuffenhausen, a beautiful area in Stuttgart. "
            ],
            "WARM_UP": [
                "Sorry about that. Let's heat things up in here. Seat and steering wheel heating are activated.",
                "Yeah, I was gonna say that myself. I will turn on seat and steering wheel heating for you.",
                "I think so too. Let me help you with that. Activating seat heating."
            ],
            "SKILL_NAME" : "About Me Facts",
            "GET_FACT_MESSAGE" : "Here's your fact: ",
			"WELCOME_MESSAGE" : "This is your Porsche Assistant. How may I help you?",
			"LOCATION": [
			"I don't know where I am right now, we still need to connect me to the raspberry pi.",
			"I don't know either, sorry. Come get me please."
			],
            "HELP_MESSAGE" : "You can say tell me a space fact, or, you can say exit... What can I help you with?",
            "HELP_REPROMPT" : "What can I help you with?",
            "STOP_MESSAGE" : "Goodbye!"
        }
    },
    "de-DE": {
        "translation": {
            "FACTS": [
                "Alles klar! Ich werde die Sitz- und Lenkradheizung aktivieren",
                "Oh! dann werde ich mal die Temperatur erhöhen."
            ],
            "SKILL_NAME" : "Weltraumwissen auf Deutsch",
            "GET_FACT_MESSAGE" : "Hier sind deine Fakten: ",
            "HELP_MESSAGE" : "Du kannst sagen, „Nenne mir einen Fakt über den Weltraum“, oder du kannst „Beenden“ sagen... Wie kann ich dir helfen?",
            "HELP_REPROMPT" : "Wie kann ich dir helfen?",
            "STOP_MESSAGE" : "Auf Wiedersehen!"
        }
    }
};

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    'LaunchRequest': function () {
		//this.emit('AboutYouIntent');
        var speechOutput = this.t("WELCOME_MESSAGE");
		var reprompt = this.t("WELCOME_MESSAGE");
        this.emit(':ask', speechOutput, reprompt);
    },
    'WarmUpIntent': function () {
        var answerArr = this.t('WARM_UP');
        var answerIdx = Math.floor(Math.random() * answerArr.length);
        var randomAns = answerArr[answerIdx];

        this.emit(':ask', randomAns,randomAns);
    },
    
    'AboutYouIntent': function () {
        var answerArr = this.t('ABOUT_ME');
        var answerIdx = Math.floor(Math.random() * answerArr.length);
        var randomAns = answerArr[answerIdx];

        this.emit(':ask', randomAns,randomAns);
    },
	
    'LocationIntent': function () {
        var answerArr = this.t("LOCATION");
        var answerIdx = Math.floor(Math.random() * answerArr.length);
        var randomAns = answerArr[answerIdx];

        this.emit(':ask', randomAns,randomAns);
    },
    
    'AMAZON.HelpIntent': function () {
        var speechOutput = this.t("HELP_MESSAGE");
        var reprompt = this.t("HELP_MESSAGE");
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.CancelIntent': function () {
        this.emit(':tell', this.t("STOP_MESSAGE"));
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', this.t("STOP_MESSAGE"));
    }
};
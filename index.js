/*
 * Copyright 2016-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */

const bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),  
  request = require('request');

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

/*
 * Be sure to setup your config values before running this code. You can 
 * set them using environment variables or modifying the config file in /config.
 *
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = "aa8ced39ad5d2f18f8ed4ae433a3117c"

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = "KevinDanielChatbotKevinDaniel"

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = "EAAFKotdMmt4BAC1dwVgALu5KxAykCN0NZA8DMnBZBZAfE06b4SZARULr2fddDSPdSgx7EzwAd96cgSwiAL1ZAKNS1s3nLZAzQ8ZCDBTNfZAgZBdRDvH39NrxsfvdKWcdDGCo7u4rbSSx6Yak2KOJDpWDSXeZBHSD75EEJiFkbJzGTIlgZDZD"

// URL where the app is running (include protocol). Used to point to scripts and 
// assets located at this address. 
const SERVER_URL = "https://dry-tundra-12988.herokuapp.com/webhook"

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've 
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL. 
 * 
 */
app.get('/authorize', function(req, res) {
  var accountLinkingToken = req.query.account_linking_token;
  var redirectURI = req.query.redirect_uri;

  // Authorization Code should be generated per user by the developer. This will 
  // be passed to the Account Linking callback.
  var authCode = "1234567890";

  // Redirect users to this URI on successful login
  var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

  res.render('authorize', {
    accountLinkingToken: accountLinkingToken,
    redirectURI: redirectURI,
    redirectURISuccess: redirectURISuccess
  });
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an 
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the 
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger' 
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam, 
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authentication successful");
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some 
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've 
 * created. If we receive a message with an attachment (image, video, audio), 
 * then we'll simply confirm that we've received the attachment.
 * 
 */
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply; 
    if (quickReply) {
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);
    var quickReplyPayload = quickReply.payload;   
    }

  /*if (isEcho) {
    // Just logging message echoes to console
    console.log("Received echo for message %s and app %d with metadata %s", 
      messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);

    sendTextMessage(senderID, "Quick reply tapped");
    return;
  }*/
    
    if (quickReplyPayload) {
        

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (quickReplyPayload) {
         
        case 'sendZurueckMessage':
            console.log("---------------------------------------------------------")
        sendZurueckMessage(senderID);
        break;
            
      case 'sendStartMessageBerufsausbildung':
        sendBerufsausbildungMessage1(senderID);
        break;

      case 'sendStartMessageDualesStudium':
        sendDualesStudiumMessage(senderID);
        break;

      case 'sendStartMessagePraktikum':
        sendPraktikumMessage(senderID);
        break;

      case 'sendStartMessageTraineeProgramm':
        sendTraineeMessage(senderID);
        break;

      case 'sendStartMessageDirekteinstieg':
        sendDirekteinstiegMessage(senderID);
        break;

      case 'sendStartMessageBewerbung':
        sendButtonMessage(senderID);
        break;

      case 'sendStartMessageTermineUndEvents':
        sendGenericMessage(senderID);
        break;

        case 'sendDualesStudiumMessageAufbauUndInhalte':
        sendDualesStudiumAufbauMessage(senderID);
        break;
            
        case 'sendDualesStudiumMessageAnforderungen':
        sendDualesStudiumAnforderungenMessage(senderID);
        break;
            
        case 'sendDualesStudiumMessageBewerbung':
        sendDualesStudiumBewerbungMessage(senderID);
        break;
            
        case 'sendDualesStudiumMessageBewerbungsprozess':
        sendDualesStudiumBewerbungsprozessMessage(senderID);
        break;
            
        case 'sendDualesStudiumMessageAlle':
        sendDualesStudiumAufbauMessage(senderID);
        sendDualesStudiumAnforderungenMessage(senderID);
        sendDualesStudiumBewerbungMessage(senderID);
        break;

        case 'sendPraktikumMessageEinsatzbereiche':
        sendPraktikumEinsatzbereicheMessage(senderID);
        break;
            
        case 'sendPraktikumMessageDauer':
        sendPraktikumDauerMessage(senderID);
        break;
            
        case 'sendPraktikumMessageAnforderungen':
        sendPraktikumAnforderungenMessage(senderID);
        break;
    
        case 'sendPraktikumMessageBewerbung':
        sendPraktikumBewerbungMessage(senderID);
        break;
            
        case 'sendPraktikumMessageAlle':
        sendPraktikumEinsatzbereicheMessage(senderID);
        sendPraktikumDauerMessage(senderID);
        sendPraktikumAnforderungenMessage(senderID);
        sendPraktikumBewerbungMessage(senderID);
        sendPraktikumBewerbungMessage(senderID);
        break;

        case 'sendTraineeMessageInhalt':
        sendTraineeInhaltMessage(senderID);
        break;
        
        case 'sendTraineeMessageBewerbung':
        sendTraineeBewerbungMessage(senderID);
        break;
            
        case 'sendTraineeMessageAlle':
        sendTraineeInhaltMessage(senderID);
        sendTraineeBewerbungMessage(senderID);
        break;
            
        case 'sendDirekteinstiegMessageAnforderungen':
        sendDirekteinstiegAnforderungenMessage(senderID);
        break;
            
        case 'sendDirekteinstiegMessageBewerbung':
        sendDirekteinstiegBewerbungMessage(senderID);
        break;
            
        case 'sendDirekteinstiegMessageAlle':
        sendDirekteinstiegAnforderungenMessage(senderID);
        sendDirekteinstiegBewerbungMessage(senderID);
        break;
        
        //TODO
      default:
       console.log("default")
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Oh. Darauf antworten wir dir am besten persönlich. Wir werden uns schnellstmöglich bei dir melden.");
  }


  if (messageText) {

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (messageText) {
      case 'image':
        sendImageMessage(senderID);
        break;

      case 'gif':
        sendGifMessage(senderID);
        break;

      case 'audio':
        sendAudioMessage(senderID);
        break;

      case 'video':
        sendVideoMessage(senderID);
        break;

      case 'file':
        sendFileMessage(senderID);
        break;

      case 'button':
        sendButtonMessage(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'receipt':
        sendReceiptMessage(senderID);
        break;

      case 'quick reply':
        sendQuickReply(senderID);
        break;        

      case 'read receipt':
        sendReadReceipt(senderID);
        break;        

      case 'typing on':
        sendTypingOn(senderID);
        break;        

      case 'typing off':
        sendTypingOff(senderID);
        break;        

      case 'account linking':
        sendAccountLinking(senderID);
        break;

      default:
        if (!quickReplyPayload){
            sendHelpMessage(senderID);
        }
        console.log("default");
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}


/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s", 
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;

  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);

  if (payload) {

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (payload) {
      case 'start':
        sendStartMessage(senderID);
        break;

      case 'sendZurueckMessage':
        sendZurueckMessage(senderID);
        break;

      case 'audio':
        sendAudioMessage(senderID);
        break;

      case 'video':
        sendVideoMessage(senderID);
        break;

      case 'file':
        sendFileMessage(senderID);
        break;

      case 'button':
        sendButtonMessage(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'receipt':
        sendReceiptMessage(senderID);
        break;

      case 'quick reply':
        sendQuickReply(senderID);
        break;        

      case 'read receipt':
        sendReadReceipt(senderID);
        break;        

      case 'typing on':
        sendTypingOn(senderID);
        break;        

      case 'typing off':
        sendTypingOff(senderID);
        break;        

      case 'account linking':
        sendAccountLinking(senderID);
        break;

      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}



/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code;

  console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
}

/*
 * Send an image using the Send API.
 *
 */
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// -----------------------------------           ----------------------------
// -----------------------------------  Ebene 0  ----------------------------
// -----------------------------------           ----------------------------
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
function sendStartMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Hallo MAX, \n\nwir freuen uns, dass du \"Jobs & Karriere bei Porsche\" besuchst.\n\nViele Informationen rund um den Einstieg bei Porsche kannst du hier auf der Stelle abrufen. Natürlich kannst du uns auch jederzeit eine persönliche Nachricht schicken, gib dafür einfach @mitarbeiter ein. Wir bemühen uns, dir dann möglichst schnell zu antworten.\n\nKönnen wir dir bei einem der folgenden Themen helfen?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Berufsausbildung",
          "payload":"sendStartMessageBerufsausbildung"
        },
        {
          "content_type":"text",
          "title":"Duales Studium",
          "payload":"sendStartMessageDualesStudium"
        },
        {
          "content_type":"text",
          "title":"Praktikum",
          "payload":"sendStartMessagePraktikum"
        },
        {
          "content_type":"text",
          "title":"Trainee Programm",
          "payload":"sendStartMessageTraineeProgramm"
        },
        {
          "content_type":"text",
          "title":"Direkteinstieg",
          "payload":"sendStartMessageDirekteinstieg"
        },
        {
          "content_type":"text",
          "title":"Bewerbungsprozess",
          "payload":"sendStartMessageBewerbung"
        },
        {
          "content_type":"text",
          "title":"Termine & Events",
          "payload":"sendStartMessageTermineUndEvents"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendZurueckMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Alles klar! Benötigst du noch weitere Informationen? Füge deiner Nachricht gerne \"@mitarbeiter\" hinzu und ich leite sie an einen unserer Mitarbeiter weiter.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Berufsausbildung",
          "payload":"sendStartMessageBerufsausbildung"
        },
        {
          "content_type":"text",
          "title":"Duales Studium",
          "payload":"sendStartMessageDualesStudium"
        },
        {
          "content_type":"text",
          "title":"Praktikum",
          "payload":"sendStartMessagePraktikum"
        },
        {
          "content_type":"text",
          "title":"Trainee Programm",
          "payload":"sendStartMessageTraineeProgramm"
        },
        {
          "content_type":"text",
          "title":"Direkteinstieg",
          "payload":"sendStartMessageDirekteinstieg"
        },
        {
          "content_type":"text",
          "title":"Bewerbungsprozess",
          "payload":"sendStartMessageBewerbung"
        },
        {
          "content_type":"text",
          "title":"Termine & Events",
          "payload":"sendStartMessageTermineUndEvents"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendHelpMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Oh. Willst du das ich das an einen unserer Mitarbeiter weiterleite?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Ja",
          "payload":"sendStartMessageBerufsausbildung"
        },
        {
          "content_type":"text",
          "title":"Nein",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// -----------------------------------           ----------------------------
// -----------------------------------  Ebene 1  ----------------------------
// -----------------------------------           ----------------------------
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------

function sendBerufsausbildungMessage1(recipientId){
    var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Sehr gerne! Porsche bildet junge Menschen in verschiedenen technischen und kaufmännischen Berufen aus. Einen Übersicht übre die Angebotenen Ausbildungsberufe findest du hier:",
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
    
    setTimeout(function(){
  sendBerufsausbildungMessage6(recipientId);
    }, 1000);
}

function sendBerufsausbildungMessage6(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "JobLocator",
            subtitle: "Hier geht's zum JobLocator",               
            image_url: "https://jobs.porsche.com/cust/beesite/images/visual_porsche.jpg",
            buttons: [{
              type: "web_url",
              url: "https://jobs.porsche.com/index.php",
              title: "Gehe zum Job Locator"
            }],
          }]
        }
      }
    }
  }
    callSendAPI(messageData);
          setTimeout(function(){
  sendBerufsausbildungMessage2(recipientId);
    }, 1000);
}

function sendBerufsausbildungMessage2(recipientId){
    var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Die Anforderungen unterscheiden sich. Für manche Ausbildungsberufe genügt ein guter Hauptschullabschluss aus, für andere solltest du die Mittlere Reife mitbringen.",
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
    setTimeout(function(){
  sendBerufsausbildungMessage3(recipientId);
    }, 1000);
}

function sendBerufsausbildungMessage3(recipientId){
    var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Die Ausbildung bei Porsche dauert i.d.R. 3 Jahre. Ausbildungsstart ist jeweils im September, bewerben solltest du dich aber bereits 1 Jahr vorab.",
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
    
      setTimeout(function(){
  sendBerufsausbildungMessage4(recipientId);
    }, 1000);
}

//function sendBerufsausbildungMessage4(recipientId){
//    var messageData = {
//    recipient: {
//      id: recipientId
//    },
//    message: {
//      text: "Sieh dir einen Film mit unseren Azubis an oder erfahre mehr über unser modernes Ausbildungszentrum auf unserer Webseite. Reinschauen lohnt sich! LINK",
//      metadata: "DEVELOPER_DEFINED_METADATA"
//    }
//  };
//
//  callSendAPI(messageData);
//      setTimeout(function(){
//  sendBerufsausbildungMessage5(recipientId);
//    }, 1000);
//}

function sendBerufsausbildungMessage4(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Alltag bei Porsche",
            subtitle: "Sieh dir einen Film mit unseren Azubis an oder erfahre mehr über unser modernes Ausbildungszentrum auf unserer Webseite. Reinschauen lohnt sich!",               
            image_url: "http://files2.porsche.com/filestore/image/multimedia/none/rd-2015-jobsandcareer-profile-teaser/preview/0a2b2863-712d-11e6-9a3c-0019999cd470;s3/porsche-preview.jpg",
            buttons: [{
              type: "web_url",
              url: "http://www.porsche.com/filestore/video/multimedia/de/jobsandcareer-everyday-life-at-porsche/video-mp4/6e54dd15-5b16-11e6-873a-0019999cd470/porsche-video.mp4",
              title: "Gehe zum Video"
            }],
          }]
        }
      }
    }
  }
    callSendAPI(messageData);
          setTimeout(function(){
  sendBerufsausbildungMessage5(recipientId);
    }, 1000);
}


function sendBerufsausbildungMessage5(recipientId){
    var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Möchtest du weitere Informationen zu anderen Themen?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Berufsausbildung",
          "payload":"sendStartMessageBerufsausbildung"
        },
        {
          "content_type":"text",
          "title":"Duales Studium",
          "payload":"sendStartMessageDualesStudium"
        },
        {
          "content_type":"text",
          "title":"Praktikum",
          "payload":"sendStartMessagePraktikum"
        },
        {
          "content_type":"text",
          "title":"Trainee Programm",
          "payload":"sendStartMessageTraineeProgramm"
        },
        {
          "content_type":"text",
          "title":"Direkteinstieg",
          "payload":"sendStartMessageDirekteinstieg"
        },
        {
          "content_type":"text",
          "title":"Bewerbungsprozess",
          "payload":"sendStartMessageBewerbung"
        },
        {
          "content_type":"text",
          "title":"Termine & Events",
          "payload":"sendStartMessageTermineUndEvents"
        }
      ]
    }
  };

  callSendAPI(messageData);
}


function sendDualesStudiumMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Eine gute Wahl. Das duale Studium ist abwechslungsreich und beinhaltet dreimonatige Theoriephasen an der dualen Hochschule \(DHBW\) sowie Praxisphasen bei Porsche.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Aufbau und Inhalte", 
          "payload":"sendDualesStudiumMessageAufbauUndInhalte"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendDualesStudiumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDualesStudiumMessageBewerbungsprozess"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDualesStudiumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}


function sendDualesStudiumAufbauMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Alle angebotenen Studiengänge beginnen im September, dauern 3 Jahre und führen mit Bestehen der Abschlussprüfung zum international anerkannten Bachelor Abschluss.\n\nWährend des Studiums bei Porsche sind auch Auslandsaufenthalte vorgesehen, beispielsweise bei einer unserer internationalen Tochtergesellschaften.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendDualesStudiumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDualesStudiumMessageBewerbungsprozess"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDualesStudiumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendDualesStudiumAnforderungenMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Für ein duales Studium solltest du über die allgemeine oder fachgebundene Hochschulreife mit sehr guten Leistungen in Deutsch, Mathematik und Physik verfügen",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Aufbau und Inhalt",
          "payload":"sendDualesStudiumMessageAufbauUndInhalte"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDualesStudiumMessageBewerbungsprozess"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDualesStudiumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendDualesStudiumBewerbungMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Bewerbungen sind ein Jahr vor Studienbeginn möglich. Eine Übersicht über alle bei Porsche angebotenen Studiengänge findest du hier: LINK\n\n Wie du dich für das duale Studium bei uns bewerben kannst? Hier findest du weitere Infos: LINK",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Aufbau und Inhalt",
          "payload":"sendDualesStudiumMessageAufbauUndInhalte"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendDualesStudiumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDualesStudiumMessageBewerbungsprozess"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDualesStudiumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}



function sendDualesStudiumBewerbungsprozessMessage2(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Möchtest du weitere Informationen zum Dualen Studium?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Aufbau und Inhalt",
          "payload":"sendDualesStudiumMessageAufbauUndInhalte"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendDualesStudiumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDualesStudiumMessageBewerbung"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDualesStudiumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendDualesStudiumBewerbungsprozessMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Bewerbungsprozess",
            subtitle: "Wie du dich für das duale Studium bei uns bewerben kannst? Hier findest du weiter Infos.!",               
            image_url: "http://files3.porsche.com/filestore/image/multimedia/none/rd-2015-jobsandcareer-application-banner/normal/ad637cef-abab-11e4-b849-001a64c55f5c/porsche-normal.jpg",
            buttons: [{
              type: "web_url",
              url: "http://www.porsche.com/germany/aboutporsche/jobs/application/",
              title: "Gehe zu Bewerbungsprozess"
            }],
          }, 
                    {
            title: "Studiengänge",
            subtitle: "Eine Übersicht über alle Studiengänge findest du hier.",               
            image_url: "http://files3.porsche.com/filestore/image/multimedia/none/rd-2015-jobsandcareer-yourentry-pupils-study-banner/normal/d779715f-abb2-11e4-b849-001a64c55f5c/porsche-normal.jpg",
            buttons: [{
              type: "web_url",
              url: "http://www.porsche.com/germany/aboutporsche/jobs/pupils/study/",
              title: "Gehe zu Studiengänge"
            }],
          }]
        }
      }
    }
  }
    callSendAPI(messageData);
          setTimeout(function(){
  sendDualesStudiumBewerbungsprozessMessage2(recipientId);
    }, 1000);
}



function sendPraktikumMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Sehr gut! Durch ein Praktikum bei Porsche kannst du schon während dem Studium sehen, wo die berufliche Reise hingehen kann.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Einsatzbereiche", 
          "payload":"sendPraktikumMessageEinsatzbereiche"
        },
        {
          "content_type":"text",
          "title":"Dauer",
          "payload":"sendPraktikumMessageDauer"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendPraktikumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendPraktikumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendPraktikumMessageBewerbung"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendPraktikumEinsatzbereicheMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Ob beispielsweise in der Entwicklung, der IT, im Vertrieb oder der Produktion - Praktika sind in nahezu allen Unternehmensbereichen möglich.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Dauer",
          "payload":"sendPraktikumMessageDauer"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendPraktikumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendPraktikumMessageBewerbung"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendPraktikumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendPraktikumDauerMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Für ein Pratikum sind mindestens 3 bis 6 Monate vorgesehen. Kürzere Praktika in den Semester- oder Sommerferien bieten wir leider nicht an",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Einsatzbereiche",
          "payload":"sendPraktikumMessageEinsatzbereiche"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendPraktikumMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendPraktikumMessageBewerbung"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendPraktikumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}


function sendPraktikumAnforderungenMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Der erfolgreiche Abschluss von mindestens 3 Studiensemestern ist Voraussetzung für ein Praktikum bei Porsche.\n\n Du solltest während des Praktikums entweder an deiner Hochschule eingeschrieben sein oder dich zwischen deinem Bachelor- und einem geplanten Masterstudium befinden.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Einsatzbereiche",
          "payload":"sendPraktikumMessageEinsatzbereiche"
        },
        {
          "content_type":"text",
          "title":"Dauer",
          "payload":"sendPraktikumMessageDauer"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendPraktikumMessageBewerbung"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendPraktikumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendPraktikumBewerbungMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Bewirb dich bitte online und bereits ein halbes Jahr Jahr vor dem geplanten Start. Alle offenen Stellenangebote für Praktika gibt es hier: LINK",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Einsatzbereiche",
          "payload":"sendPraktikumMessageEinsatzbereiche"
        },
        {
          "content_type":"text",
          "title":"Dauer",
          "payload":"sendPraktikumMessageDauer"
        },
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendPraktikumMessageAnforderungen"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendPraktikumMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendTraineeMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Das internationale Porsche Trainee Programm startet bei uns immer im Herbst eine Jahres und dauert 12 Monate.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Inhalte", 
          "payload":"sendTraineeMessageInhalt"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendTraineeMessageBewerbung"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendTraineeMessageAlle"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendTraineeInhaltMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Als Trainee erwarten dich abwechslungsreiche Monate. Das Programm sieht Einsätze in verschiedenen Fachbereichen sowie in einer internationalen Tochtergesellschaft vor.\n\n Darüber hinaus kannst du in der Produktion mit anpacken und erhälst in einem Porsche Zentrum weitere spannende Einblicke.\n\n Du sammelst also vielfältige Erfahrungen, während dir ein persönlicher Mentor aus der Führungsebene unterstützend zur Seite steht.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendTraineeMessageBewerbung"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendTraineeMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendTraineeBewerbungMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "In der Regel kannst du dich etwa 6 Monate vor Beginn des Programms bewerben. Unser Job Abo informiert dich, sobald neue Trainee-Stellen ausgeschrieben werden. LINK ",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Inhalt",
          "payload":"sendTraineeMessageInhalt"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendTraineeMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendDirekteinstiegMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Sehr gut! Wir sind ständig auf der Suche nach motivierten Mitarbeitern, die unsere Leidenschaft für Sportwagen teilen.",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Anforderungen", 
          "payload":"sendDirekteinstiegMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDirekteinstiegMessageBewerbung"
        }, 
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDirekteinstiegMessageAlle"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendDirekteinstiegAnforderungenMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Bei der Auswahl unserer neuen Mitarbeiter achten wir auf ein stimmiges Gesamtpaket. Ebenso wichtig wie fachliche Qualifikationen ist uns soziale Kompetenz",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Bewerbung",
          "payload":"sendDirekteintiegMessageBewerbung"
        },
          {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDirekteinstiegMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

function sendDirekteinstiegBewerbungMessage(recipientId){
      var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Du findest alle offenen Stellenangebote von Porsche sowie unserer nationalen und internationalen Tochtergesellschaften im Porsche Job Locator. LINK\n\nDie Jobs lassen sich nach verschiedenen Kriterien filtern, so dass du schnell und einfach sehen kannst, ob ein passender für dich dabei ist.\n\nLege dir schnell und einfach ein Job Abo an. So wirst du per E-Mail informiert, sobald geeignete Stellen ausgeschrieben werden. LINK\n\nErlebe einen Tag bei Porsche: In unserem Film wird deutlich, dass Alltag bei Porsche niemals alltäglich ist. VIDEO",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Anforderungen",
          "payload":"sendDirekteintiegMessageAnforderungen"
        },
        {
          "content_type":"text",
          "title":"Alle Informationen",
          "payload":"sendDirekteinstiegMessageAlle"
        },
        {
          "content_type":"text",
          "title":"Zurück",
          "payload":"sendZurueckMessage"
        }
      ]
    }
  };

  callSendAPI(messageData);
}


































function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/rift.png"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/instagram_logo.gif"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "audio",
        payload: {
          url: SERVER_URL + "/assets/sample.mp3"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendVideoMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "video",
        payload: {
          url: SERVER_URL + "/assets/allofus480.mov"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a file using the Send API.
 *
 */
function sendFileMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "file",
        payload: {
          url: SERVER_URL + "/assets/test.txt"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a button message using the Send API.
 *
 */
function sendButtonMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "This is test text",
          buttons:[{
            type: "web_url",
            url: "https://www.oculus.com/en-us/rift/",
            title: "Open Web URL"
          }, {
            type: "postback",
            title: "Trigger Postback",
            payload: "DEVELOPER_DEFINED_PAYLOAD"
          }, {
            type: "phone_number",
            title: "Call Phone Number",
            payload: "+16505551234"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "Termine & Events",
            subtitle: "Wir sind bei einer Vielzahl von Veranstaltungen vor Ort und freuen uns, dich persönlich kennenzulernen.",               
            image_url: "http://files1.porsche.com/filestore/image/germany/none/rd-2015-jobsandcareer-events-teaser/preview/e73f281c-33c5-11e6-9225-0019999cd470;s3/porsche-preview.jpg",
            buttons: [{
              type: "web_url",
              url: "http://www.porsche.com/germany/aboutporsche/jobs/events/",
              title: "Gehe zu Termine & Events"
            }, {
              type: "postback",
              title: "Zurück",
              payload: "sendZurueckMessage",
            }],
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random()*1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: "Peter Chang",
          order_number: receiptId,
          currency: "USD",
          payment_method: "Visa 1234",        
          timestamp: "1428444852", 
          elements: [{
            title: "Oculus Rift",
            subtitle: "Includes: headset, sensor, remote",
            quantity: 1,
            price: 599.00,
            currency: "USD",
            image_url: SERVER_URL + "/assets/riftsq.png"
          }, {
            title: "Samsung Gear VR",
            subtitle: "Frost White",
            quantity: 1,
            price: 99.99,
            currency: "USD",
            image_url: SERVER_URL + "/assets/gearvrsq.png"
          }],
          address: {
            street_1: "1 Hacker Way",
            street_2: "",
            city: "Menlo Park",
            postal_code: "94025",
            state: "CA",
            country: "US"
          },
          summary: {
            subtotal: 698.99,
            shipping_cost: 20.00,
            total_tax: 57.67,
            total_cost: 626.66
          },
          adjustments: [{
            name: "New Customer Discount",
            amount: -50
          }, {
            name: "$100 Off Coupon",
            amount: -100
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "What's your favorite movie genre?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Action",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
        },
        {
          "content_type":"text",
          "title":"Comedy",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
        },
        {
          "content_type":"text",
          "title":"Drama",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
  console.log("Sending a read receipt to mark message as seen");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "mark_seen"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
function sendTypingOn(recipientId) {
  console.log("Turning typing indicator on");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
  console.log("Turning typing indicator off");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_off"
  };

  callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome. Link your account.",
          buttons:[{
            type: "account_link",
            url: SERVER_URL + "/authorize"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s", 
          messageId, recipientId);
      } else {
      console.log("Successfully called Send API for recipient %s", 
        recipientId);
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });  
}



// Start server
// Webhooks must be available via SSL with a certificate signed by a valid 
// certificate authority.
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;


# wtf-rtc

Theoretically a simple wrapper around WebRTC for making data channel connections

In reality WebRTC seems pretty bad in general so YMMV.

Log of the issues I've come across in [NOTES.md](NOTES.md)

## Usage

```
var wtfRtc = require('wtf-rtc');

var rtc = wtfRtc("myChannel", {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.voxgratia.org' }
    ]
});

// To offer a connection
rtc.createOffer(function(error, offerResult){
	
	// Send offerResult.sdp to your buddy

	// Get their answer sdp

    offerResult.answer(answeredSdp, function(error, answerResult){
    	answerResult.getOpenDataChannel(function(error, dataChannel){
    		// Do what you want with the data channel
		})
	})
})

// OR (Dont do both or the WebRTC demon wil come and eat you)

// To consume an offer
rtc.consumeOffer(sdp, function(error, consumeResult){
	// Send consumeResult.sdp to your buddy

	consumeResult.getOpenDataChannel(function(error, dataChannel){
		// Do what you want with the data channel
	})
});

```
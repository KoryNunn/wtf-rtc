# wtf-rtc

Theoretically a simple wrapper around WebRTC for making data channel connections

In reality WebRTC seems pretty bad in general so YMMV.

Log of the issues I've come across in [NOTES.md](NOTES.md)

[Example](https://korynunn.github.io/wtf-rtc/example/index.html)

## Usage

```
var wtfRtc = require('wtf-rtc');

// wtfRtc("myChannel", options) where 'options' is https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection#RTCConfiguration_dictionary
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
// rtc.createOffer(dataChannelOptions, callback) where dataChannelOptions is https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel#RTCDataChannelInit_dictionary
rtc.createOffer({ ordered: false }, function(error, offerResult){
	
	// Send offerResult.sdp to your buddy

	// Get their answer sdp

	// offerResult.answer(sdp, callback) where sdp is a big ol string that your buddy sent you (see below)
    offerResult.answer(yourBuddiesSdp, function(error, answerResult){
    	answerResult.getOpenDataChannel(function(error, dataChannel){
    		// Do what you want with the data channel
		})
	})
})

// OR (Dont do both or the WebRTC demon wil come and eat you)

// To consume an offer
// rtc.consumeOffer(sdp, callback) where sdp is a big ol string that your buddy sent you (see above)
rtc.consumeOffer(sdp, function(error, consumeResult){
	// Send consumeResult.sdp to your buddy

	consumeResult.getOpenDataChannel(function(error, dataChannel){
		// Do what you want with the data channel
	})
});

```

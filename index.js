var righto = require('righto');

module.exports = function(channelLabel, config, callback){
  function getConnectionInState(peerConnection, state, callback){
    var ready = righto(done => {
      var error;
      function onChange(){
        if(peerConnection.signalingState === state || error){
          peerConnection.removeEventListener('signalingstatechange ', onChange);
          clearInterval(interval);
          clearTimeout(timeout);
          done();
        }
      }
      peerConnection.addEventListener('signalingstatechange ', onChange);
      var interval = setInterval(onChange, 10);
      var timeout = setTimeout(function(){
        error = new Error('Timedout getting appropriate signaling state');
        onChange();
      }, 5000);
      onChange();
    });

    ready(callback);
  }

  function getSdp(peerConnection, offerOrAnser, callback){
    var localDescriptionSet = righto.sync(peerConnection.setLocalDescription.bind(peerConnection), offerOrAnser);
    var sdp = righto(done => {
      if(peerConnection.iceGatheringState === 'complete'){
          return done(null, peerConnection.localDescription.sdp);
      }

      var timeout = setTimeout(function(){
        return done(null, peerConnection.localDescription.sdp);
      }, 5000);

      peerConnection.addEventListener('icecandidate', ({ candidate }) => {
        if (candidate == null) {
          clearTimeout(timeout);
          done(null, peerConnection.localDescription.sdp);
        }
      })
    }, righto.after(localDescriptionSet));

    sdp(callback);
  }

  function consumeOffer(offerText, callback) {
    var peerConnection = new RTCPeerConnection(config);
    var stable = righto(getConnectionInState, peerConnection, 'stable');

    var getOpenDataChannel = righto(callback => {
      peerConnection.addEventListener('datachannel', (event) => {
        callback(null, event.channel)
      });
    });

    var remoteDescriptionSet = stable.get(() => peerConnection.setRemoteDescription({ type: "offer", sdp: offerText }));
    var answer = remoteDescriptionSet.get(() => peerConnection.createAnswer())
    var sdp = righto(getSdp, peerConnection, answer);
    var result = sdp.get(sdp => ({ sdp, getOpenDataChannel }));

    result(callback)
  };

  function createOffer(dataChannelOptions, callback) {
    var peerConnection = new RTCPeerConnection(config);
    var stable = righto(getConnectionInState, peerConnection, 'stable');

    var dataChannel = peerConnection.createDataChannel(channelLabel, dataChannelOptions);

    var getOpenDataChannel = righto(callback => {
      var interval = setInterval(() => {
        if(dataChannel.readyState === 'open'){
          clearInterval(interval);
          callback(null, dataChannel);
        }
      }, 10);
    });

    function answer(answerText, callback) {
      var haveLocalOffer = righto(getConnectionInState, peerConnection, 'have-local-offer');
      var remoteDescriptionSet = haveLocalOffer.get(() => righto.from(peerConnection.setRemoteDescription({ type: "answer", sdp: answerText })));
      var result = remoteDescriptionSet.get(() => ({ getOpenDataChannel }));

      result(callback);
    }

    var offer = stable.get(() => peerConnection.createOffer());
    var sdp = righto(getSdp, peerConnection, offer);
    var result = sdp.get(sdp => {
      return {
        sdp,
        answer
      }
    });

    result(callback)
  }

  return {
    consumeOffer,
    createOffer
  };
}
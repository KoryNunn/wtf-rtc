var righto = require('righto');

module.exports = function(channelLabel, config, callback){
  function getConnectionInState(peerConnection, state, callback){
    var ready = righto(done => {
      function onChange(){
        if(peerConnection.signalingState === state){
          peerConnection.removeEventListener('signalingstatechange ', onChange);
          done();
        }
      }
      peerConnection.addEventListener('signalingstatechange ', onChange);
      onChange();
    });

    ready(callback);
  }

  function getSdp(peerConnection, offerOrAnser, callback){
    var localDescriptionSet = righto.sync(peerConnection.setLocalDescription.bind(peerConnection), offerOrAnser);
    var sdp = righto(done => {
      peerConnection.addEventListener('icecandidate', ({ candidate }) => {
        if (!candidate) {
          done(null, peerConnection.localDescription.sdp);
        }
      })
    }, righto.after(localDescriptionSet));

    sdp(callback);
  }

  function consumeOffer(offerText, callback) {
    var peerConnection = new RTCPeerConnection(config);
    var stable = righto(getConnectionInState, peerConnection, 'stable');

    var dataChannel = peerConnection.createDataChannel(channelLabel, {
      ordered: false
    });
    var openCallbacks = [];

    var getOpenDataChannel = righto(callback => {
      dataChannel.addEventListener('open', () => callback(null, dataChannel));
    });

    var remoteDescriptionSet = stable.get(() => peerConnection.setRemoteDescription({ type: "offer", sdp: offerText }));
    var answer = remoteDescriptionSet.get(() => peerConnection.createAnswer());
    var sdp = righto(getSdp, peerConnection, answer);
    var result = sdp.get(sdp => ({ sdp, getOpenDataChannel }));

    result(callback)
  };

  function createOffer(callback) {
    var peerConnection = new RTCPeerConnection(config);
    var stable = righto(getConnectionInState, peerConnection, 'stable');

    var dataChannel = peerConnection.createDataChannel(channelLabel, {
      ordered: false
    });

    var getOpenDataChannel = righto(callback => {
      var interval = setInterval(() => {
        if(dataChannel.readyState === 'open'){
          clearInterval(interval);
          callback(null, dataChannel);
        }
      });
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
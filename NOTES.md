Config for `new RTCPeerConnection(config)` takes iceServers which is a list of objects that have a urls property that can be either a single url or an array of urls.

Why not just an array of urls? why is it called "urls" if it can just be a "url"?

If you dont prefix your stun urls with "stun" it will error.

WebRTC is agressively stateful and if you do the wrong thing at the wrong time it will error or just do nothing at all who knows.

Sometimes if you do the right thing it will do absolutely nothing.

the 'onicecandidate' event triggeres for three different reasons with three different results and you only care when the event.candidate is null

If you have gone down one flow with an instance of WebRTC but you want to go down another, you can't. just throw it out and start again.

Oooh nice sometimes peerConnection.addEventListener('icecandidate' just never changes so you have to be all like "Well I guess it's done then!" and just use what you've got.

If you try and connect to yourself within about 5 seconds it will absolutely fail sometimes.
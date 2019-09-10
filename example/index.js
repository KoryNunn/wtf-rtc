var wtfRtc = require('../');
var crel = require('crel');

window.addEventListener('DOMContentLoaded', function(){
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

    var offerButton = document.querySelector('#offerButton');
    var joinButton = document.querySelector('#joinButton');
    var offerDisplay = document.querySelector('#offer');
    var offerInput = document.querySelector('#offerInput');
    var answerTextarea = document.querySelector('#answerTextarea');
    var chatInput;
    var chatOutput = document.querySelector('#chatOutput');

    function reset(){
        offerDisplay && offerDisplay.remove();
        offerInput && offerInput.remove();
        chatInput && chatInput.remove();
    }

    function createTextarea(readOnly){
        var input = crel('textarea', {
            class: readOnly ? 'read' : 'write',
            placeholder: readOnly ? '' : 'Paste big string (sdp) from the other peer here'
        })
        document.body.appendChild(input);
        return input;
    }

    function startChat(result){
        result.getOpenDataChannel(function(error, dataChannel){
            reset();
            if(error){
                offerDisplay.value = error.message;
                offerDisplay.classList.remove('hidden');
                return;
            }

            chatInput = crel('input', { placeholder: 'Chat:' });
            document.body.appendChild(chatInput)

            function submit(event){
                if(event.keyCode !== 13){
                    return
                }
                event.preventDefault();
                dataChannel.send(chatInput.value);
                chatOutput.appendChild(crel('div', 'You:' + chatInput.value));
                chatInput.value = '';
            }

            chatInput.addEventListener('keypress', submit);

            dataChannel.addEventListener('message', function(event){
                chatOutput.appendChild(crel('div', 'Them:' + event.data));
            })
        })
    }

    offerButton.addEventListener('click', function(){
        reset();
        rtc.createOffer({ ordered: false }, function(error, offerResult){
            if(error){
                reset();
                offerDisplay = createTextarea(true);
                offerDisplay.value = error.message;
                return;
            }
            offerDisplay = createTextarea(true);
            offerDisplay.value = offerResult.sdp;
            offerInput = createTextarea();
            offerInput.addEventListener('keypress', function(event){
                if(event.keyCode !== 13){
                    return
                }

                event.preventDefault();

                offerResult.answer(offerInput.value, function(error, answerResult){
                    if(error){
                        offerDisplay = createTextarea(true);
                        offerDisplay.value = error.message;
                        return;
                    }
                    startChat(answerResult);
                });

                reset();
            });
        });
    });

    joinButton.addEventListener('click', function(){
        reset();
        offerInput = createTextarea();
        document.body.appendChild(offerInput);
        function submit(event){
            if(event.keyCode !== 13){
                return
            }
            event.preventDefault();
            reset();
            rtc.consumeOffer(offerInput.value, function(error, consumeResult){
                if(error){
                    reset();
                    offerDisplay = createTextarea(true);
                    offerDisplay.value = error.message;
                    document.body.appendChild(offerDisplay);
                    return;
                }
                offerDisplay = createTextarea(true);
                offerDisplay.value = consumeResult.sdp;
                startChat(consumeResult);
            });

        }
        offerInput.addEventListener('keypress', submit);
    });
})

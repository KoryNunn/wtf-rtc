(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{"../":2,"crel":4}],2:[function(require,module,exports){
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
      var timeout = setTimeout(function(){
        return done(null, peerConnection.localDescription.sdp);
      }, 1000);

      peerConnection.addEventListener('icecandidate', ({ candidate }) => {
        if (!candidate) {
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
    var answer = remoteDescriptionSet.get(() => peerConnection.createAnswer());
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
},{"righto":5}],3:[function(require,module,exports){
function checkIfPromise(promise){
    if(!promise || typeof promise !== 'object' || typeof promise.then !== 'function'){
        throw "Abbott requires a promise to break. It is the only thing Abbott is good at.";
    }
}

module.exports = function abbott(promiseOrFn){
    if(typeof promiseOrFn !== 'function'){
        checkIfPromise(promiseOrFn);
    }

    return function(){
        var promise;
        if(typeof promiseOrFn === 'function'){
           promise = promiseOrFn.apply(null, Array.prototype.slice.call(arguments, 0, -1));
        }else{
            promise = promiseOrFn;
        }

        checkIfPromise(promise);

        var callback = arguments[arguments.length-1];
        promise.then(callback.bind(null, null), callback);
    };
};
},{}],4:[function(require,module,exports){
/* Copyright (C) 2012 Kory Nunn
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

NOTE:
This code is formatted for run-speed and to assist compilers.
This might make it harder to read at times, but the code's intention should be transparent. */

// IIFE our function
((exporter) => {
    // Define our function and its properties
    // These strings are used multiple times, so this makes things smaller once compiled
    const func = 'function',
        isNodeString = 'isNode',
        d = document,
        // Helper functions used throughout the script
        isType = (object, type) => typeof object === type,
        isNode = (node) => node instanceof Node,
        isElement = (object) => object instanceof Element,
        // Recursively appends children to given element. As a text node if not already an element
        appendChild = (element, child) => {
            if (child !== null) {
                if (Array.isArray(child)) { // Support (deeply) nested child elements
                    child.map((subChild) => appendChild(element, subChild));
                } else {
                    if (!crel[isNodeString](child)) {
                        child = d.createTextNode(child);
                    }
                    element.appendChild(child);
                }
            }
        };
    //
    function crel (element, settings) {
        // Define all used variables / shortcuts here, to make things smaller once compiled
        let args = arguments, // Note: assigned to a variable to assist compilers.
            index = 1,
            key,
            attribute;
        // If first argument is an element, use it as is, otherwise treat it as a tagname
        element = crel.isElement(element) ? element : d.createElement(element);
        // Check if second argument is a settings object. Skip it if it's:
        // - not an object (this includes `undefined`)
        // - a Node
        // - an array
        if (!(!isType(settings, 'object') || crel[isNodeString](settings) || Array.isArray(settings))) {
            // Don't treat settings as a child
            index++;
            // Go through settings / attributes object, if it exists
            for (key in settings) {
                // Store the attribute into a variable, before we potentially modify the key
                attribute = settings[key];
                // Get mapped key / function, if one exists
                key = crel.attrMap[key] || key;
                // Note: We want to prioritise mapping over properties
                if (isType(key, func)) {
                    key(element, attribute);
                } else if (isType(attribute, func)) { // ex. onClick property
                    element[key] = attribute;
                } else {
                    // Set the element attribute
                    element.setAttribute(key, attribute);
                }
            }
        }
        // Loop through all arguments, if any, and append them to our element if they're not `null`
        for (; index < args.length; index++) {
            appendChild(element, args[index]);
        }

        return element;
    }

    // Used for mapping attribute keys to supported versions in bad browsers, or to custom functionality
    crel.attrMap = {};
    crel.isElement = isElement;
    crel[isNodeString] = isNode;
    // Expose proxy interface
    crel.proxy = new Proxy(crel, {
        get: (target, key) => {
            !(key in crel) && (crel[key] = crel.bind(null, key));
            return crel[key];
        }
    });
    // Export crel
    exporter(crel, func);
})((product, func) => {
    if (typeof exports === 'object') {
        // Export for Browserify / CommonJS format
        module.exports = product;
    } else if (typeof define === func && define.amd) {
        // Export for RequireJS / AMD format
        define(product);
    } else {
        // Export as a 'global' function
        this.crel = product;
    }
});

},{}],5:[function(require,module,exports){
(function (global){
var abbott = require('abbott');

var defer = global.process && global.process.nextTick || global.setImmediate || global.setTimeout;

function isRighto(x){
    return typeof x === 'function' && (x.__resolve__ === x || x.resolve === x);
}

function isThenable(x){
    return x && typeof x.then === 'function' && !isRighto(x);
}

function isResolvable(x){
    return isRighto(x) || isThenable(x);
}

function isTake(x){
    return x && typeof x === 'object' && '__take__' in x;
}

var slice = Array.prototype.slice.call.bind(Array.prototype.slice);

function getCallLine(stack){
    var index = 0,
        lines = stack.split('\n');

    while(lines[++index] && lines[index].match(/righto\/index\.js/)){}

    var match = lines[index] && lines[index].match(/at (.*)/);

    return match ? match[1] : ' - No trace - ';
}

function takeWrap(results){
    this.results = results;
}

function take(targetTask){
    var done = this;
    var keys = slice(arguments, 1);
    return targetTask(function(error){
        if(error){
            return done(error);
        }
        var args = slice(arguments, 1);
        done(error, new takeWrap(keys.map(function(key){
            return args[key];
        })));
    });
}

function resolveDependency(task, done){
    if(isThenable(task)){
        task = righto(abbott(task));
    }

    if(isRighto(task)){
        return task(done);
    }

    if(isTake(task)){
        return take.apply(done, task.__take__);
    }

    if(
        righto._debug &&
        righto._warnOnUnsupported &&
        Array.isArray(task) &&
        isRighto(task[0]) &&
        !isRighto(task[1])
    ){

        console.warn('\u001b[33mPossible unsupported take/ignore syntax detected:\u001b[39m\n' + getCallLine(this._stack));
    }

    return done(null, task);
}

function traceGet(instance, result){
    if(righto._debug && !(typeof result === 'object' || typeof result === 'function')){
        var line = getCallLine(instance._stack);
        throw new Error('Result of righto was not an instance at: \n' + line);
    }
}

function get(fn){
    var instance = this;
    return righto(function(result, fn, done){
        if(typeof fn === 'string' || typeof fn === 'number'){
            traceGet(instance, result);
            return done(null, result[fn]);
        }

        righto.from(fn(result))(done);
    }, this, fn);
}

var noOp = function(){};

function proxy(instance){
    instance._ = new Proxy(instance, {
        get: function(target, key){
            if(key === '__resolve__'){
                return instance._;
            }

            if(instance[key] || key in instance || key === 'inspect' || typeof key === 'symbol'){
                return instance[key];
            }

            if(righto._debug && key.charAt(0) === '_'){
                return instance[key];
            }

            return proxy(righto.sync(function(result){
                traceGet(instance, result);
                return result[key];
            }, instance));
        }
    });
    instance.__resolve__ = instance._;
    return instance._;
}

function createIterator(fn){
    var outerArgs = slice(arguments, 1);

    return function(){
        var args = outerArgs.concat(slice(arguments)),
            callback = args.pop(),
            errored,
            lastValue;

        var generator = fn.apply(null, args);

        function run(){
            if(errored){
                return;
            }
            var next = generator.next(lastValue);
            if(next.done){
                if(errored){
                    return;
                }
                return righto.from(next.value)(callback);
            }
            if(isResolvable(next.value)){
                righto.sync(function(value){
                    lastValue = value;
                    run();
                }, next.value)(function(error){
                    if(error){
                        callback(error);
                    }
                });
                return;
            }
            lastValue = next.value;
            run();
        }

        run();
    };
}

function addTracing(resolve, fn, args){

    var argMatch = fn.toString().match(/^[\w\s]*?\(((?:\w+[,\s]*?)*)\)/),
        argNames = argMatch ? argMatch[1].split(/[,\s]+/g) : [];

    resolve._stack = new Error().stack;
    resolve._trace = function(tabs){
        var firstLine = getCallLine(resolve._stack);

        if(resolve._error){
            firstLine = '\u001b[31m' + firstLine + ' <- ERROR SOURCE' +  '\u001b[39m';
        }

        tabs = tabs || 0;
        var spacing = '    ';
        for(var i = 0; i < tabs; i ++){
            spacing = spacing + '    ';
        }
        return args.map(function(arg, index){
            return [arg, argNames[index] || index];
        }).reduce(function(results, argInfo){
            var arg = argInfo[0],
                argName = argInfo[1];

            if(isTake(arg)){
                arg = arg.__take__[0];
            }

            if(isRighto(arg)){
                var line = spacing + '- argument "' + argName + '" from ';


                if(!arg._trace){
                    line = line + 'Tracing was not enabled for this righto instance.';
                }else{
                    line = line + arg._trace(tabs + 1);
                }
                results.push(line);
            }

            return results;
        }, [firstLine])
        .join('\n');
    };
}

function taskComplete(error){
    var done = this[0],
        context = this[1],
        callbacks = context.callbacks;

    if(error && righto._debug){
        context.resolve._error = error;
    }

    var results = arguments;

    done(results);

    for(var i = 0; i < callbacks.length; i++){
        defer(callbacks[i].apply.bind(callbacks[i], null, results));
    }
}

function errorOut(error, callback){
    if(error && righto._debug){
        if(righto._autotraceOnError || this.resolve._traceOnError){
            console.log('Dependency error executing ' + this.fn.name + ' ' + this.resolve._trace());
        }
    }

    callback(error);
}

function debugResolve(context, args, complete){
    try{
        args.push(complete);
        context.fn.apply(null, args);
    }catch(error){
        console.log('Task exception executing ' + context.fn.name + ' from ' + context.resolve._trace());
        throw error;
    }
}

function resolveWithDependencies(done, error, argResults){
    var context = this;

    if(error){
        var boundErrorOut = errorOut.bind(context, error);

        for(var i = 0; i < context.callbacks.length; i++){
            boundErrorOut(context.callbacks[i]);
        }

        return;
    }

    var args = argResults.reduce((results, next) => {
            if(next && next instanceof takeWrap){
                return results.concat(next.results);
            }

            results.push(next);
            return results;
        }, []) ,
        complete = taskComplete.bind([done, context]);

    if(righto._debug){
        return debugResolve(context, args, complete);
    }

    // Slight perf bump by avoiding apply for simple cases.
    switch(args.length){
        case 0: context.fn(complete); break;
        case 1: context.fn(args[0], complete); break;
        case 2: context.fn(args[0], args[1], complete); break;
        case 3: context.fn(args[0], args[1], args[2], complete); break;
        default:
            args.push(complete);
            context.fn.apply(null, args);
    }
}

function resolveDependencies(args, complete, resolveDependency){
    var results = [],
        done = 0,
        hasErrored;

    if(!args.length){
        complete(null, []);
    }

    function dependencyResolved(index, error, result){
        if(hasErrored){
            return;
        }

        if(error){
            hasErrored = true;
            return complete(error);
        }

        results[index] = result;

        if(++done === args.length){
            complete(null, results);
        }
    }

    for(var i = 0; i < args.length; i++){
        if(!isResolvable(args[i]) && !isTake(args[i])){
            dependencyResolved(i, null, args[i]);
            continue;
        }
        resolveDependency(args[i], dependencyResolved.bind(null, i));
    }
}

function resolver(complete){
    var context = this;

    // No callback? Just run the task.
    if(!arguments.length){
        complete = noOp;
    }

    if(isRighto(complete)){
        throw new Error('righto instance passed into a righto instance instead of a callback');
    }

    if(typeof complete !== 'function'){
        throw new Error('Callback must be a function');
    }

    if(context.results){
        return complete.apply(null, context.results);
    }

    context.callbacks.push(complete);

    if(context.started++){
        return;
    }

    var resolved = resolveWithDependencies.bind(context, function(resolvedResults){
            if(righto._debug){
                if(righto._autotrace || context.resolve._traceOnExecute){
                    console.log('Executing ' + context.fn.name + ' ' + context.resolve._trace());
                }
            }

            context.results = resolvedResults;
        });

    defer(resolveDependencies.bind(null, context.args, resolved, resolveDependency.bind(context.resolve)));

    return context.resolve;
};

function righto(){
    var args = slice(arguments),
        fn = args.shift();

    if(typeof fn !== 'function'){
        throw new Error('No task function passed to righto');
    }

    if(isRighto(fn) && args.length > 0){
        throw new Error('Righto task passed as target task to righto()');
    }

    var resolverContext = {
            fn: fn,
            callbacks: [],
            args: args,
            started: 0
        },
        resolve = resolver.bind(resolverContext);
    resolve.get = get.bind(resolve);
    resolverContext.resolve = resolve;
    resolve.resolve = resolve;

    if(righto._debug){
        addTracing(resolve, fn, args);
    }

    return resolve;
}

righto.sync = function(fn){
    return righto.apply(null, [function(){
        var args = slice(arguments),
            done = args.pop(),
            result = fn.apply(null, args);

        if(isResolvable(result)){
            return righto.from(result)(done);
        }

        done(null, result);
    }].concat(slice(arguments, 1)));
};

righto.all = function(value){
    var task = value;
    if(arguments.length > 1){
        task = slice(arguments);
    }

    function resolve(tasks){
        return righto.apply(null, [function(){
            arguments[arguments.length - 1](null, slice(arguments, 0, -1));
        }].concat(tasks));
    }

    if(isRighto(task)){
        return righto(function(tasks, done){
            resolve(tasks)(done);
        }, task);
    }

    return resolve(task);
};

righto.reduce = function(values, reducer, seed){
    var hasSeed = arguments.length >= 3;

    if(!reducer){
        reducer = function(previous, next){
            return righto(next);
        };
    }

    return righto.from(values).get(function(values){
        if(!values || !values.reduce){
            throw new Error('values was not a reduceable object (like an array)');
        }

        values = values.slice();

        if(!hasSeed){
            seed = values.shift();
        }

        if(!values.length){
            return righto.from(seed);
        }

        return values.reduce(function(previous, next){
            return righto.sync(reducer, previous, righto.value(next));
        }, seed);
    });
};

righto.from = function(value){
    if(arguments.length > 1){
        throw new Error('righto.from called with more than one argument. Righto v4 no longer supports constructing eventuals via `from`, use `sync` instead.');
    }

    if(isRighto(value)){
        return value;
    }

    return righto.sync(function(resolved){
        return resolved;
    }, value);
};

righto.mate = function(){
    return righto.apply(null, [function(){
        arguments[arguments.length -1].apply(null, [null].concat(slice(arguments, 0, -1)));
    }].concat(slice(arguments)));
};

righto.take = function(task){
    if(!isResolvable(task)){
        throw new Error('task was not a resolvable value');
    }

    return {__take__: slice(arguments)};
};

righto.after = function(task){
    if(!isResolvable(task)){
        throw new Error('task was not a resolvable value');
    }

    if(arguments.length === 1){
        return {__take__: [task]};
    }

    return {__take__: [righto.mate.apply(null, arguments)]};
};

righto.resolve = function(object, deep){
    if(isRighto(object)){
        return righto.sync(function(object){
            return righto.resolve(object, deep);
        }, object);
    }

    if(!object || !(typeof object === 'object' || typeof object === 'function')){
        return righto.from(object);
    }

    var pairs = righto.all(Object.keys(object).map(function(key){
        return righto(function(value, done){
            if(deep){
                righto.sync(function(value){
                    return [key, value];
                }, righto.resolve(value, true))(done);
                return;
            }
            done(null, [key, value]);
        }, object[key]);
    }));

    return righto.sync(function(pairs){
        return pairs.reduce(function(result, pair){
            result[pair[0]] = pair[1];
            return result;
        }, Array.isArray(object) ? [] : {});
    }, pairs);
};

righto.iterate = createIterator;

righto.value = function(){
    var args = arguments;
    return righto(function(done){
        done.apply(null, [null].concat(slice(args)));
    });
};

righto.surely = function(task){
    if(!isResolvable(task)){
        task = righto.apply(null, arguments);
    }

    return righto(function(done){
        task(function(){
            done(null, slice(arguments));
        });
    });
};

righto.handle = function(task, handler){
    return righto(function(handler, done){
        task(function(error){
            if(!error){
                return task(done);
            }

            handler(error, done);
        });
    }, handler);
};

righto.fail = function(error){
    return righto(function(error, done){
        done(error);
    }, error);
};

righto.fork = function(value){
    return function(resolve, reject){
        righto.from(value)(function(error, result){
            if(error){
                return reject(error);
            }

            resolve(result);
        });
    };
};

righto.isRighto = isRighto;
righto.isThenable = isThenable;
righto.isResolvable = isResolvable;

righto.proxy = function(){
    if(typeof Proxy === 'undefined'){
        throw new Error('This environment does not support Proxy\'s');
    }

    return proxy(righto.apply(this, arguments));
};

for(var key in righto){
    righto.proxy[key] = righto[key];
}

module.exports = righto;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"abbott":3}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2luZGV4LmpzIiwiaW5kZXguanMiLCJub2RlX21vZHVsZXMvYWJib3R0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NyZWwvY3JlbC5qcyIsIm5vZGVfbW9kdWxlcy9yaWdodG8vaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJ2YXIgd3RmUnRjID0gcmVxdWlyZSgnLi4vJyk7XG52YXIgY3JlbCA9IHJlcXVpcmUoJ2NyZWwnKTtcblxud2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCBmdW5jdGlvbigpe1xuICAgIHZhciBydGMgPSB3dGZSdGMoXCJteUNoYW5uZWxcIiwge1xuICAgICAgICBpY2VTZXJ2ZXJzOiBbXG4gICAgICAgICAgICB7IHVybHM6ICdzdHVuOnN0dW4ubC5nb29nbGUuY29tOjE5MzAyJyB9LFxuICAgICAgICAgICAgeyB1cmxzOiAnc3R1bjpzdHVuMS5sLmdvb2dsZS5jb206MTkzMDInIH0sXG4gICAgICAgICAgICB7IHVybHM6ICdzdHVuOnN0dW4yLmwuZ29vZ2xlLmNvbToxOTMwMicgfSxcbiAgICAgICAgICAgIHsgdXJsczogJ3N0dW46c3R1bjMubC5nb29nbGUuY29tOjE5MzAyJyB9LFxuICAgICAgICAgICAgeyB1cmxzOiAnc3R1bjpzdHVuNC5sLmdvb2dsZS5jb206MTkzMDInIH0sXG4gICAgICAgICAgICB7IHVybHM6ICdzdHVuOnN0dW4udm94Z3JhdGlhLm9yZycgfVxuICAgICAgICBdXG4gICAgfSk7XG5cbiAgICB2YXIgb2ZmZXJCdXR0b24gPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjb2ZmZXJCdXR0b24nKTtcbiAgICB2YXIgam9pbkJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNqb2luQnV0dG9uJyk7XG4gICAgdmFyIG9mZmVyRGlzcGxheSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNvZmZlcicpO1xuICAgIHZhciBvZmZlcklucHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI29mZmVySW5wdXQnKTtcbiAgICB2YXIgYW5zd2VyVGV4dGFyZWEgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjYW5zd2VyVGV4dGFyZWEnKTtcbiAgICB2YXIgY2hhdElucHV0O1xuICAgIHZhciBjaGF0T3V0cHV0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NoYXRPdXRwdXQnKTtcblxuICAgIGZ1bmN0aW9uIHJlc2V0KCl7XG4gICAgICAgIG9mZmVyRGlzcGxheSAmJiBvZmZlckRpc3BsYXkucmVtb3ZlKCk7XG4gICAgICAgIG9mZmVySW5wdXQgJiYgb2ZmZXJJbnB1dC5yZW1vdmUoKTtcbiAgICAgICAgY2hhdElucHV0ICYmIGNoYXRJbnB1dC5yZW1vdmUoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVUZXh0YXJlYShyZWFkT25seSl7XG4gICAgICAgIHZhciBpbnB1dCA9IGNyZWwoJ3RleHRhcmVhJywge1xuICAgICAgICAgICAgY2xhc3M6IHJlYWRPbmx5ID8gJ3JlYWQnIDogJ3dyaXRlJyxcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiByZWFkT25seSA/ICcnIDogJ1Bhc3RlIGJpZyBzdHJpbmcgKHNkcCkgZnJvbSB0aGUgb3RoZXIgcGVlciBoZXJlJ1xuICAgICAgICB9KVxuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGlucHV0KTtcbiAgICAgICAgcmV0dXJuIGlucHV0O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHN0YXJ0Q2hhdChyZXN1bHQpe1xuICAgICAgICByZXN1bHQuZ2V0T3BlbkRhdGFDaGFubmVsKGZ1bmN0aW9uKGVycm9yLCBkYXRhQ2hhbm5lbCl7XG4gICAgICAgICAgICByZXNldCgpO1xuICAgICAgICAgICAgaWYoZXJyb3Ipe1xuICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheS52YWx1ZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgb2ZmZXJEaXNwbGF5LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2hhdElucHV0ID0gY3JlbCgnaW5wdXQnLCB7IHBsYWNlaG9sZGVyOiAnQ2hhdDonIH0pO1xuICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjaGF0SW5wdXQpXG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHN1Ym1pdChldmVudCl7XG4gICAgICAgICAgICAgICAgaWYoZXZlbnQua2V5Q29kZSAhPT0gMTMpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBkYXRhQ2hhbm5lbC5zZW5kKGNoYXRJbnB1dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgY2hhdE91dHB1dC5hcHBlbmRDaGlsZChjcmVsKCdkaXYnLCAnWW91OicgKyBjaGF0SW5wdXQudmFsdWUpKTtcbiAgICAgICAgICAgICAgICBjaGF0SW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2hhdElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgc3VibWl0KTtcblxuICAgICAgICAgICAgZGF0YUNoYW5uZWwuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgICAgICBjaGF0T3V0cHV0LmFwcGVuZENoaWxkKGNyZWwoJ2RpdicsICdUaGVtOicgKyBldmVudC5kYXRhKSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIG9mZmVyQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgcnRjLmNyZWF0ZU9mZmVyKHsgb3JkZXJlZDogZmFsc2UgfSwgZnVuY3Rpb24oZXJyb3IsIG9mZmVyUmVzdWx0KXtcbiAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICByZXNldCgpO1xuICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheSA9IGNyZWF0ZVRleHRhcmVhKHRydWUpO1xuICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheS52YWx1ZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb2ZmZXJEaXNwbGF5ID0gY3JlYXRlVGV4dGFyZWEodHJ1ZSk7XG4gICAgICAgICAgICBvZmZlckRpc3BsYXkudmFsdWUgPSBvZmZlclJlc3VsdC5zZHA7XG4gICAgICAgICAgICBvZmZlcklucHV0ID0gY3JlYXRlVGV4dGFyZWEoKTtcbiAgICAgICAgICAgIG9mZmVySW5wdXQuYWRkRXZlbnRMaXN0ZW5lcigna2V5cHJlc3MnLCBmdW5jdGlvbihldmVudCl7XG4gICAgICAgICAgICAgICAgaWYoZXZlbnQua2V5Q29kZSAhPT0gMTMpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgICAgICAgICAgICAgb2ZmZXJSZXN1bHQuYW5zd2VyKG9mZmVySW5wdXQudmFsdWUsIGZ1bmN0aW9uKGVycm9yLCBhbnN3ZXJSZXN1bHQpe1xuICAgICAgICAgICAgICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICAgICAgICAgICAgICBvZmZlckRpc3BsYXkgPSBjcmVhdGVUZXh0YXJlYSh0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheS52YWx1ZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgc3RhcnRDaGF0KGFuc3dlclJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICByZXNldCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgam9pbkJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsIGZ1bmN0aW9uKCl7XG4gICAgICAgIHJlc2V0KCk7XG4gICAgICAgIG9mZmVySW5wdXQgPSBjcmVhdGVUZXh0YXJlYSgpO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG9mZmVySW5wdXQpO1xuICAgICAgICBmdW5jdGlvbiBzdWJtaXQoZXZlbnQpe1xuICAgICAgICAgICAgaWYoZXZlbnQua2V5Q29kZSAhPT0gMTMpe1xuICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgIHJlc2V0KCk7XG4gICAgICAgICAgICBydGMuY29uc3VtZU9mZmVyKG9mZmVySW5wdXQudmFsdWUsIGZ1bmN0aW9uKGVycm9yLCBjb25zdW1lUmVzdWx0KXtcbiAgICAgICAgICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICAgICAgICAgIHJlc2V0KCk7XG4gICAgICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheSA9IGNyZWF0ZVRleHRhcmVhKHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBvZmZlckRpc3BsYXkudmFsdWUgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKG9mZmVyRGlzcGxheSk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgb2ZmZXJEaXNwbGF5ID0gY3JlYXRlVGV4dGFyZWEodHJ1ZSk7XG4gICAgICAgICAgICAgICAgb2ZmZXJEaXNwbGF5LnZhbHVlID0gY29uc3VtZVJlc3VsdC5zZHA7XG4gICAgICAgICAgICAgICAgc3RhcnRDaGF0KGNvbnN1bWVSZXN1bHQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuICAgICAgICBvZmZlcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgc3VibWl0KTtcbiAgICB9KTtcbn0pXG4iLCJ2YXIgcmlnaHRvID0gcmVxdWlyZSgncmlnaHRvJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY2hhbm5lbExhYmVsLCBjb25maWcsIGNhbGxiYWNrKXtcbiAgZnVuY3Rpb24gZ2V0Q29ubmVjdGlvbkluU3RhdGUocGVlckNvbm5lY3Rpb24sIHN0YXRlLCBjYWxsYmFjayl7XG4gICAgdmFyIHJlYWR5ID0gcmlnaHRvKGRvbmUgPT4ge1xuICAgICAgdmFyIGVycm9yO1xuICAgICAgZnVuY3Rpb24gb25DaGFuZ2UoKXtcbiAgICAgICAgaWYocGVlckNvbm5lY3Rpb24uc2lnbmFsaW5nU3RhdGUgPT09IHN0YXRlIHx8IGVycm9yKXtcbiAgICAgICAgICBwZWVyQ29ubmVjdGlvbi5yZW1vdmVFdmVudExpc3RlbmVyKCdzaWduYWxpbmdzdGF0ZWNoYW5nZSAnLCBvbkNoYW5nZSk7XG4gICAgICAgICAgY2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcGVlckNvbm5lY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcignc2lnbmFsaW5nc3RhdGVjaGFuZ2UgJywgb25DaGFuZ2UpO1xuICAgICAgdmFyIGludGVydmFsID0gc2V0SW50ZXJ2YWwob25DaGFuZ2UsIDEwKTtcbiAgICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgICBlcnJvciA9IG5ldyBFcnJvcignVGltZWRvdXQgZ2V0dGluZyBhcHByb3ByaWF0ZSBzaWduYWxpbmcgc3RhdGUnKTtcbiAgICAgICAgb25DaGFuZ2UoKTtcbiAgICAgIH0sIDUwMDApO1xuICAgICAgb25DaGFuZ2UoKTtcbiAgICB9KTtcblxuICAgIHJlYWR5KGNhbGxiYWNrKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNkcChwZWVyQ29ubmVjdGlvbiwgb2ZmZXJPckFuc2VyLCBjYWxsYmFjayl7XG4gICAgdmFyIGxvY2FsRGVzY3JpcHRpb25TZXQgPSByaWdodG8uc3luYyhwZWVyQ29ubmVjdGlvbi5zZXRMb2NhbERlc2NyaXB0aW9uLmJpbmQocGVlckNvbm5lY3Rpb24pLCBvZmZlck9yQW5zZXIpO1xuICAgIHZhciBzZHAgPSByaWdodG8oZG9uZSA9PiB7XG4gICAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgICAgcmV0dXJuIGRvbmUobnVsbCwgcGVlckNvbm5lY3Rpb24ubG9jYWxEZXNjcmlwdGlvbi5zZHApO1xuICAgICAgfSwgMTAwMCk7XG5cbiAgICAgIHBlZXJDb25uZWN0aW9uLmFkZEV2ZW50TGlzdGVuZXIoJ2ljZWNhbmRpZGF0ZScsICh7IGNhbmRpZGF0ZSB9KSA9PiB7XG4gICAgICAgIGlmICghY2FuZGlkYXRlKSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIGRvbmUobnVsbCwgcGVlckNvbm5lY3Rpb24ubG9jYWxEZXNjcmlwdGlvbi5zZHApO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0sIHJpZ2h0by5hZnRlcihsb2NhbERlc2NyaXB0aW9uU2V0KSk7XG5cbiAgICBzZHAoY2FsbGJhY2spO1xuICB9XG5cbiAgZnVuY3Rpb24gY29uc3VtZU9mZmVyKG9mZmVyVGV4dCwgY2FsbGJhY2spIHtcbiAgICB2YXIgcGVlckNvbm5lY3Rpb24gPSBuZXcgUlRDUGVlckNvbm5lY3Rpb24oY29uZmlnKTtcbiAgICB2YXIgc3RhYmxlID0gcmlnaHRvKGdldENvbm5lY3Rpb25JblN0YXRlLCBwZWVyQ29ubmVjdGlvbiwgJ3N0YWJsZScpO1xuXG4gICAgdmFyIGdldE9wZW5EYXRhQ2hhbm5lbCA9IHJpZ2h0byhjYWxsYmFjayA9PiB7XG4gICAgICBwZWVyQ29ubmVjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdkYXRhY2hhbm5lbCcsIChldmVudCkgPT4ge1xuICAgICAgICBjYWxsYmFjayhudWxsLCBldmVudC5jaGFubmVsKVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB2YXIgcmVtb3RlRGVzY3JpcHRpb25TZXQgPSBzdGFibGUuZ2V0KCgpID0+IHBlZXJDb25uZWN0aW9uLnNldFJlbW90ZURlc2NyaXB0aW9uKHsgdHlwZTogXCJvZmZlclwiLCBzZHA6IG9mZmVyVGV4dCB9KSk7XG4gICAgdmFyIGFuc3dlciA9IHJlbW90ZURlc2NyaXB0aW9uU2V0LmdldCgoKSA9PiBwZWVyQ29ubmVjdGlvbi5jcmVhdGVBbnN3ZXIoKSk7XG4gICAgdmFyIHNkcCA9IHJpZ2h0byhnZXRTZHAsIHBlZXJDb25uZWN0aW9uLCBhbnN3ZXIpO1xuICAgIHZhciByZXN1bHQgPSBzZHAuZ2V0KHNkcCA9PiAoeyBzZHAsIGdldE9wZW5EYXRhQ2hhbm5lbCB9KSk7XG5cbiAgICByZXN1bHQoY2FsbGJhY2spXG4gIH07XG5cbiAgZnVuY3Rpb24gY3JlYXRlT2ZmZXIoZGF0YUNoYW5uZWxPcHRpb25zLCBjYWxsYmFjaykge1xuICAgIHZhciBwZWVyQ29ubmVjdGlvbiA9IG5ldyBSVENQZWVyQ29ubmVjdGlvbihjb25maWcpO1xuICAgIHZhciBzdGFibGUgPSByaWdodG8oZ2V0Q29ubmVjdGlvbkluU3RhdGUsIHBlZXJDb25uZWN0aW9uLCAnc3RhYmxlJyk7XG5cbiAgICB2YXIgZGF0YUNoYW5uZWwgPSBwZWVyQ29ubmVjdGlvbi5jcmVhdGVEYXRhQ2hhbm5lbChjaGFubmVsTGFiZWwsIGRhdGFDaGFubmVsT3B0aW9ucyk7XG5cbiAgICB2YXIgZ2V0T3BlbkRhdGFDaGFubmVsID0gcmlnaHRvKGNhbGxiYWNrID0+IHtcbiAgICAgIHZhciBpbnRlcnZhbCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgaWYoZGF0YUNoYW5uZWwucmVhZHlTdGF0ZSA9PT0gJ29wZW4nKXtcbiAgICAgICAgICBjbGVhckludGVydmFsKGludGVydmFsKTtcbiAgICAgICAgICBjYWxsYmFjayhudWxsLCBkYXRhQ2hhbm5lbCk7XG4gICAgICAgIH1cbiAgICAgIH0sIDEwKTtcbiAgICB9KTtcblxuICAgIGZ1bmN0aW9uIGFuc3dlcihhbnN3ZXJUZXh0LCBjYWxsYmFjaykge1xuICAgICAgdmFyIGhhdmVMb2NhbE9mZmVyID0gcmlnaHRvKGdldENvbm5lY3Rpb25JblN0YXRlLCBwZWVyQ29ubmVjdGlvbiwgJ2hhdmUtbG9jYWwtb2ZmZXInKTtcbiAgICAgIHZhciByZW1vdGVEZXNjcmlwdGlvblNldCA9IGhhdmVMb2NhbE9mZmVyLmdldCgoKSA9PiByaWdodG8uZnJvbShwZWVyQ29ubmVjdGlvbi5zZXRSZW1vdGVEZXNjcmlwdGlvbih7IHR5cGU6IFwiYW5zd2VyXCIsIHNkcDogYW5zd2VyVGV4dCB9KSkpO1xuICAgICAgdmFyIHJlc3VsdCA9IHJlbW90ZURlc2NyaXB0aW9uU2V0LmdldCgoKSA9PiAoeyBnZXRPcGVuRGF0YUNoYW5uZWwgfSkpO1xuXG4gICAgICByZXN1bHQoY2FsbGJhY2spO1xuICAgIH1cblxuICAgIHZhciBvZmZlciA9IHN0YWJsZS5nZXQoKCkgPT4gcGVlckNvbm5lY3Rpb24uY3JlYXRlT2ZmZXIoKSk7XG4gICAgdmFyIHNkcCA9IHJpZ2h0byhnZXRTZHAsIHBlZXJDb25uZWN0aW9uLCBvZmZlcik7XG4gICAgdmFyIHJlc3VsdCA9IHNkcC5nZXQoc2RwID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNkcCxcbiAgICAgICAgYW5zd2VyXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXN1bHQoY2FsbGJhY2spXG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbnN1bWVPZmZlcixcbiAgICBjcmVhdGVPZmZlclxuICB9O1xufSIsImZ1bmN0aW9uIGNoZWNrSWZQcm9taXNlKHByb21pc2Upe1xuICAgIGlmKCFwcm9taXNlIHx8IHR5cGVvZiBwcm9taXNlICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgcHJvbWlzZS50aGVuICE9PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgdGhyb3cgXCJBYmJvdHQgcmVxdWlyZXMgYSBwcm9taXNlIHRvIGJyZWFrLiBJdCBpcyB0aGUgb25seSB0aGluZyBBYmJvdHQgaXMgZ29vZCBhdC5cIjtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYWJib3R0KHByb21pc2VPckZuKXtcbiAgICBpZih0eXBlb2YgcHJvbWlzZU9yRm4gIT09ICdmdW5jdGlvbicpe1xuICAgICAgICBjaGVja0lmUHJvbWlzZShwcm9taXNlT3JGbik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCl7XG4gICAgICAgIHZhciBwcm9taXNlO1xuICAgICAgICBpZih0eXBlb2YgcHJvbWlzZU9yRm4gPT09ICdmdW5jdGlvbicpe1xuICAgICAgICAgICBwcm9taXNlID0gcHJvbWlzZU9yRm4uYXBwbHkobnVsbCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwLCAtMSkpO1xuICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgIHByb21pc2UgPSBwcm9taXNlT3JGbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNoZWNrSWZQcm9taXNlKHByb21pc2UpO1xuXG4gICAgICAgIHZhciBjYWxsYmFjayA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoLTFdO1xuICAgICAgICBwcm9taXNlLnRoZW4oY2FsbGJhY2suYmluZChudWxsLCBudWxsKSwgY2FsbGJhY2spO1xuICAgIH07XG59OyIsIi8qIENvcHlyaWdodCAoQykgMjAxMiBLb3J5IE51bm5cclxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcclxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXHJcblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxyXG5cclxuTk9URTpcclxuVGhpcyBjb2RlIGlzIGZvcm1hdHRlZCBmb3IgcnVuLXNwZWVkIGFuZCB0byBhc3Npc3QgY29tcGlsZXJzLlxyXG5UaGlzIG1pZ2h0IG1ha2UgaXQgaGFyZGVyIHRvIHJlYWQgYXQgdGltZXMsIGJ1dCB0aGUgY29kZSdzIGludGVudGlvbiBzaG91bGQgYmUgdHJhbnNwYXJlbnQuICovXHJcblxyXG4vLyBJSUZFIG91ciBmdW5jdGlvblxyXG4oKGV4cG9ydGVyKSA9PiB7XHJcbiAgICAvLyBEZWZpbmUgb3VyIGZ1bmN0aW9uIGFuZCBpdHMgcHJvcGVydGllc1xyXG4gICAgLy8gVGhlc2Ugc3RyaW5ncyBhcmUgdXNlZCBtdWx0aXBsZSB0aW1lcywgc28gdGhpcyBtYWtlcyB0aGluZ3Mgc21hbGxlciBvbmNlIGNvbXBpbGVkXHJcbiAgICBjb25zdCBmdW5jID0gJ2Z1bmN0aW9uJyxcclxuICAgICAgICBpc05vZGVTdHJpbmcgPSAnaXNOb2RlJyxcclxuICAgICAgICBkID0gZG9jdW1lbnQsXHJcbiAgICAgICAgLy8gSGVscGVyIGZ1bmN0aW9ucyB1c2VkIHRocm91Z2hvdXQgdGhlIHNjcmlwdFxyXG4gICAgICAgIGlzVHlwZSA9IChvYmplY3QsIHR5cGUpID0+IHR5cGVvZiBvYmplY3QgPT09IHR5cGUsXHJcbiAgICAgICAgaXNOb2RlID0gKG5vZGUpID0+IG5vZGUgaW5zdGFuY2VvZiBOb2RlLFxyXG4gICAgICAgIGlzRWxlbWVudCA9IChvYmplY3QpID0+IG9iamVjdCBpbnN0YW5jZW9mIEVsZW1lbnQsXHJcbiAgICAgICAgLy8gUmVjdXJzaXZlbHkgYXBwZW5kcyBjaGlsZHJlbiB0byBnaXZlbiBlbGVtZW50LiBBcyBhIHRleHQgbm9kZSBpZiBub3QgYWxyZWFkeSBhbiBlbGVtZW50XHJcbiAgICAgICAgYXBwZW5kQ2hpbGQgPSAoZWxlbWVudCwgY2hpbGQpID0+IHtcclxuICAgICAgICAgICAgaWYgKGNoaWxkICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShjaGlsZCkpIHsgLy8gU3VwcG9ydCAoZGVlcGx5KSBuZXN0ZWQgY2hpbGQgZWxlbWVudHNcclxuICAgICAgICAgICAgICAgICAgICBjaGlsZC5tYXAoKHN1YkNoaWxkKSA9PiBhcHBlbmRDaGlsZChlbGVtZW50LCBzdWJDaGlsZCkpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIWNyZWxbaXNOb2RlU3RyaW5nXShjaGlsZCkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGQgPSBkLmNyZWF0ZVRleHROb2RlKGNoaWxkKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hcHBlbmRDaGlsZChjaGlsZCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgLy9cclxuICAgIGZ1bmN0aW9uIGNyZWwgKGVsZW1lbnQsIHNldHRpbmdzKSB7XHJcbiAgICAgICAgLy8gRGVmaW5lIGFsbCB1c2VkIHZhcmlhYmxlcyAvIHNob3J0Y3V0cyBoZXJlLCB0byBtYWtlIHRoaW5ncyBzbWFsbGVyIG9uY2UgY29tcGlsZWRcclxuICAgICAgICBsZXQgYXJncyA9IGFyZ3VtZW50cywgLy8gTm90ZTogYXNzaWduZWQgdG8gYSB2YXJpYWJsZSB0byBhc3Npc3QgY29tcGlsZXJzLlxyXG4gICAgICAgICAgICBpbmRleCA9IDEsXHJcbiAgICAgICAgICAgIGtleSxcclxuICAgICAgICAgICAgYXR0cmlidXRlO1xyXG4gICAgICAgIC8vIElmIGZpcnN0IGFyZ3VtZW50IGlzIGFuIGVsZW1lbnQsIHVzZSBpdCBhcyBpcywgb3RoZXJ3aXNlIHRyZWF0IGl0IGFzIGEgdGFnbmFtZVxyXG4gICAgICAgIGVsZW1lbnQgPSBjcmVsLmlzRWxlbWVudChlbGVtZW50KSA/IGVsZW1lbnQgOiBkLmNyZWF0ZUVsZW1lbnQoZWxlbWVudCk7XHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgc2Vjb25kIGFyZ3VtZW50IGlzIGEgc2V0dGluZ3Mgb2JqZWN0LiBTa2lwIGl0IGlmIGl0J3M6XHJcbiAgICAgICAgLy8gLSBub3QgYW4gb2JqZWN0ICh0aGlzIGluY2x1ZGVzIGB1bmRlZmluZWRgKVxyXG4gICAgICAgIC8vIC0gYSBOb2RlXHJcbiAgICAgICAgLy8gLSBhbiBhcnJheVxyXG4gICAgICAgIGlmICghKCFpc1R5cGUoc2V0dGluZ3MsICdvYmplY3QnKSB8fCBjcmVsW2lzTm9kZVN0cmluZ10oc2V0dGluZ3MpIHx8IEFycmF5LmlzQXJyYXkoc2V0dGluZ3MpKSkge1xyXG4gICAgICAgICAgICAvLyBEb24ndCB0cmVhdCBzZXR0aW5ncyBhcyBhIGNoaWxkXHJcbiAgICAgICAgICAgIGluZGV4Kys7XHJcbiAgICAgICAgICAgIC8vIEdvIHRocm91Z2ggc2V0dGluZ3MgLyBhdHRyaWJ1dGVzIG9iamVjdCwgaWYgaXQgZXhpc3RzXHJcbiAgICAgICAgICAgIGZvciAoa2V5IGluIHNldHRpbmdzKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGUgYXR0cmlidXRlIGludG8gYSB2YXJpYWJsZSwgYmVmb3JlIHdlIHBvdGVudGlhbGx5IG1vZGlmeSB0aGUga2V5XHJcbiAgICAgICAgICAgICAgICBhdHRyaWJ1dGUgPSBzZXR0aW5nc1trZXldO1xyXG4gICAgICAgICAgICAgICAgLy8gR2V0IG1hcHBlZCBrZXkgLyBmdW5jdGlvbiwgaWYgb25lIGV4aXN0c1xyXG4gICAgICAgICAgICAgICAga2V5ID0gY3JlbC5hdHRyTWFwW2tleV0gfHwga2V5O1xyXG4gICAgICAgICAgICAgICAgLy8gTm90ZTogV2Ugd2FudCB0byBwcmlvcml0aXNlIG1hcHBpbmcgb3ZlciBwcm9wZXJ0aWVzXHJcbiAgICAgICAgICAgICAgICBpZiAoaXNUeXBlKGtleSwgZnVuYykpIHtcclxuICAgICAgICAgICAgICAgICAgICBrZXkoZWxlbWVudCwgYXR0cmlidXRlKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNUeXBlKGF0dHJpYnV0ZSwgZnVuYykpIHsgLy8gZXguIG9uQ2xpY2sgcHJvcGVydHlcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50W2tleV0gPSBhdHRyaWJ1dGU7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFNldCB0aGUgZWxlbWVudCBhdHRyaWJ1dGVcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnNldEF0dHJpYnV0ZShrZXksIGF0dHJpYnV0ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGFsbCBhcmd1bWVudHMsIGlmIGFueSwgYW5kIGFwcGVuZCB0aGVtIHRvIG91ciBlbGVtZW50IGlmIHRoZXkncmUgbm90IGBudWxsYFxyXG4gICAgICAgIGZvciAoOyBpbmRleCA8IGFyZ3MubGVuZ3RoOyBpbmRleCsrKSB7XHJcbiAgICAgICAgICAgIGFwcGVuZENoaWxkKGVsZW1lbnQsIGFyZ3NbaW5kZXhdKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBlbGVtZW50O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFVzZWQgZm9yIG1hcHBpbmcgYXR0cmlidXRlIGtleXMgdG8gc3VwcG9ydGVkIHZlcnNpb25zIGluIGJhZCBicm93c2Vycywgb3IgdG8gY3VzdG9tIGZ1bmN0aW9uYWxpdHlcclxuICAgIGNyZWwuYXR0ck1hcCA9IHt9O1xyXG4gICAgY3JlbC5pc0VsZW1lbnQgPSBpc0VsZW1lbnQ7XHJcbiAgICBjcmVsW2lzTm9kZVN0cmluZ10gPSBpc05vZGU7XHJcbiAgICAvLyBFeHBvc2UgcHJveHkgaW50ZXJmYWNlXHJcbiAgICBjcmVsLnByb3h5ID0gbmV3IFByb3h5KGNyZWwsIHtcclxuICAgICAgICBnZXQ6ICh0YXJnZXQsIGtleSkgPT4ge1xyXG4gICAgICAgICAgICAhKGtleSBpbiBjcmVsKSAmJiAoY3JlbFtrZXldID0gY3JlbC5iaW5kKG51bGwsIGtleSkpO1xyXG4gICAgICAgICAgICByZXR1cm4gY3JlbFtrZXldO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgLy8gRXhwb3J0IGNyZWxcclxuICAgIGV4cG9ydGVyKGNyZWwsIGZ1bmMpO1xyXG59KSgocHJvZHVjdCwgZnVuYykgPT4ge1xyXG4gICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xyXG4gICAgICAgIC8vIEV4cG9ydCBmb3IgQnJvd3NlcmlmeSAvIENvbW1vbkpTIGZvcm1hdFxyXG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gcHJvZHVjdDtcclxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gZnVuYyAmJiBkZWZpbmUuYW1kKSB7XHJcbiAgICAgICAgLy8gRXhwb3J0IGZvciBSZXF1aXJlSlMgLyBBTUQgZm9ybWF0XHJcbiAgICAgICAgZGVmaW5lKHByb2R1Y3QpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBFeHBvcnQgYXMgYSAnZ2xvYmFsJyBmdW5jdGlvblxyXG4gICAgICAgIHRoaXMuY3JlbCA9IHByb2R1Y3Q7XHJcbiAgICB9XHJcbn0pO1xyXG4iLCJ2YXIgYWJib3R0ID0gcmVxdWlyZSgnYWJib3R0Jyk7XHJcblxyXG52YXIgZGVmZXIgPSBnbG9iYWwucHJvY2VzcyAmJiBnbG9iYWwucHJvY2Vzcy5uZXh0VGljayB8fCBnbG9iYWwuc2V0SW1tZWRpYXRlIHx8IGdsb2JhbC5zZXRUaW1lb3V0O1xyXG5cclxuZnVuY3Rpb24gaXNSaWdodG8oeCl7XHJcbiAgICByZXR1cm4gdHlwZW9mIHggPT09ICdmdW5jdGlvbicgJiYgKHguX19yZXNvbHZlX18gPT09IHggfHwgeC5yZXNvbHZlID09PSB4KTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNUaGVuYWJsZSh4KXtcclxuICAgIHJldHVybiB4ICYmIHR5cGVvZiB4LnRoZW4gPT09ICdmdW5jdGlvbicgJiYgIWlzUmlnaHRvKHgpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBpc1Jlc29sdmFibGUoeCl7XHJcbiAgICByZXR1cm4gaXNSaWdodG8oeCkgfHwgaXNUaGVuYWJsZSh4KTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNUYWtlKHgpe1xyXG4gICAgcmV0dXJuIHggJiYgdHlwZW9mIHggPT09ICdvYmplY3QnICYmICdfX3Rha2VfXycgaW4geDtcclxufVxyXG5cclxudmFyIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwuYmluZChBcnJheS5wcm90b3R5cGUuc2xpY2UpO1xyXG5cclxuZnVuY3Rpb24gZ2V0Q2FsbExpbmUoc3RhY2spe1xyXG4gICAgdmFyIGluZGV4ID0gMCxcclxuICAgICAgICBsaW5lcyA9IHN0YWNrLnNwbGl0KCdcXG4nKTtcclxuXHJcbiAgICB3aGlsZShsaW5lc1srK2luZGV4XSAmJiBsaW5lc1tpbmRleF0ubWF0Y2goL3JpZ2h0b1xcL2luZGV4XFwuanMvKSl7fVxyXG5cclxuICAgIHZhciBtYXRjaCA9IGxpbmVzW2luZGV4XSAmJiBsaW5lc1tpbmRleF0ubWF0Y2goL2F0ICguKikvKTtcclxuXHJcbiAgICByZXR1cm4gbWF0Y2ggPyBtYXRjaFsxXSA6ICcgLSBObyB0cmFjZSAtICc7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRha2VXcmFwKHJlc3VsdHMpe1xyXG4gICAgdGhpcy5yZXN1bHRzID0gcmVzdWx0cztcclxufVxyXG5cclxuZnVuY3Rpb24gdGFrZSh0YXJnZXRUYXNrKXtcclxuICAgIHZhciBkb25lID0gdGhpcztcclxuICAgIHZhciBrZXlzID0gc2xpY2UoYXJndW1lbnRzLCAxKTtcclxuICAgIHJldHVybiB0YXJnZXRUYXNrKGZ1bmN0aW9uKGVycm9yKXtcclxuICAgICAgICBpZihlcnJvcil7XHJcbiAgICAgICAgICAgIHJldHVybiBkb25lKGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMsIDEpO1xyXG4gICAgICAgIGRvbmUoZXJyb3IsIG5ldyB0YWtlV3JhcChrZXlzLm1hcChmdW5jdGlvbihrZXkpe1xyXG4gICAgICAgICAgICByZXR1cm4gYXJnc1trZXldO1xyXG4gICAgICAgIH0pKSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVzb2x2ZURlcGVuZGVuY3kodGFzaywgZG9uZSl7XHJcbiAgICBpZihpc1RoZW5hYmxlKHRhc2spKXtcclxuICAgICAgICB0YXNrID0gcmlnaHRvKGFiYm90dCh0YXNrKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYoaXNSaWdodG8odGFzaykpe1xyXG4gICAgICAgIHJldHVybiB0YXNrKGRvbmUpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKGlzVGFrZSh0YXNrKSl7XHJcbiAgICAgICAgcmV0dXJuIHRha2UuYXBwbHkoZG9uZSwgdGFzay5fX3Rha2VfXyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYoXHJcbiAgICAgICAgcmlnaHRvLl9kZWJ1ZyAmJlxyXG4gICAgICAgIHJpZ2h0by5fd2Fybk9uVW5zdXBwb3J0ZWQgJiZcclxuICAgICAgICBBcnJheS5pc0FycmF5KHRhc2spICYmXHJcbiAgICAgICAgaXNSaWdodG8odGFza1swXSkgJiZcclxuICAgICAgICAhaXNSaWdodG8odGFza1sxXSlcclxuICAgICl7XHJcblxyXG4gICAgICAgIGNvbnNvbGUud2FybignXFx1MDAxYlszM21Qb3NzaWJsZSB1bnN1cHBvcnRlZCB0YWtlL2lnbm9yZSBzeW50YXggZGV0ZWN0ZWQ6XFx1MDAxYlszOW1cXG4nICsgZ2V0Q2FsbExpbmUodGhpcy5fc3RhY2spKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZG9uZShudWxsLCB0YXNrKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdHJhY2VHZXQoaW5zdGFuY2UsIHJlc3VsdCl7XHJcbiAgICBpZihyaWdodG8uX2RlYnVnICYmICEodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgfHwgdHlwZW9mIHJlc3VsdCA9PT0gJ2Z1bmN0aW9uJykpe1xyXG4gICAgICAgIHZhciBsaW5lID0gZ2V0Q2FsbExpbmUoaW5zdGFuY2UuX3N0YWNrKTtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Jlc3VsdCBvZiByaWdodG8gd2FzIG5vdCBhbiBpbnN0YW5jZSBhdDogXFxuJyArIGxpbmUpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXQoZm4pe1xyXG4gICAgdmFyIGluc3RhbmNlID0gdGhpcztcclxuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24ocmVzdWx0LCBmbiwgZG9uZSl7XHJcbiAgICAgICAgaWYodHlwZW9mIGZuID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgZm4gPT09ICdudW1iZXInKXtcclxuICAgICAgICAgICAgdHJhY2VHZXQoaW5zdGFuY2UsIHJlc3VsdCk7XHJcbiAgICAgICAgICAgIHJldHVybiBkb25lKG51bGwsIHJlc3VsdFtmbl0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmlnaHRvLmZyb20oZm4ocmVzdWx0KSkoZG9uZSk7XHJcbiAgICB9LCB0aGlzLCBmbik7XHJcbn1cclxuXHJcbnZhciBub09wID0gZnVuY3Rpb24oKXt9O1xyXG5cclxuZnVuY3Rpb24gcHJveHkoaW5zdGFuY2Upe1xyXG4gICAgaW5zdGFuY2UuXyA9IG5ldyBQcm94eShpbnN0YW5jZSwge1xyXG4gICAgICAgIGdldDogZnVuY3Rpb24odGFyZ2V0LCBrZXkpe1xyXG4gICAgICAgICAgICBpZihrZXkgPT09ICdfX3Jlc29sdmVfXycpe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlLl87XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKGluc3RhbmNlW2tleV0gfHwga2V5IGluIGluc3RhbmNlIHx8IGtleSA9PT0gJ2luc3BlY3QnIHx8IHR5cGVvZiBrZXkgPT09ICdzeW1ib2wnKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbnN0YW5jZVtrZXldO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihyaWdodG8uX2RlYnVnICYmIGtleS5jaGFyQXQoMCkgPT09ICdfJyl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5zdGFuY2Vba2V5XTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHByb3h5KHJpZ2h0by5zeW5jKGZ1bmN0aW9uKHJlc3VsdCl7XHJcbiAgICAgICAgICAgICAgICB0cmFjZUdldChpbnN0YW5jZSwgcmVzdWx0KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRba2V5XTtcclxuICAgICAgICAgICAgfSwgaW5zdGFuY2UpKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIGluc3RhbmNlLl9fcmVzb2x2ZV9fID0gaW5zdGFuY2UuXztcclxuICAgIHJldHVybiBpbnN0YW5jZS5fO1xyXG59XHJcblxyXG5mdW5jdGlvbiBjcmVhdGVJdGVyYXRvcihmbil7XHJcbiAgICB2YXIgb3V0ZXJBcmdzID0gc2xpY2UoYXJndW1lbnRzLCAxKTtcclxuXHJcbiAgICByZXR1cm4gZnVuY3Rpb24oKXtcclxuICAgICAgICB2YXIgYXJncyA9IG91dGVyQXJncy5jb25jYXQoc2xpY2UoYXJndW1lbnRzKSksXHJcbiAgICAgICAgICAgIGNhbGxiYWNrID0gYXJncy5wb3AoKSxcclxuICAgICAgICAgICAgZXJyb3JlZCxcclxuICAgICAgICAgICAgbGFzdFZhbHVlO1xyXG5cclxuICAgICAgICB2YXIgZ2VuZXJhdG9yID0gZm4uYXBwbHkobnVsbCwgYXJncyk7XHJcblxyXG4gICAgICAgIGZ1bmN0aW9uIHJ1bigpe1xyXG4gICAgICAgICAgICBpZihlcnJvcmVkKXtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB2YXIgbmV4dCA9IGdlbmVyYXRvci5uZXh0KGxhc3RWYWx1ZSk7XHJcbiAgICAgICAgICAgIGlmKG5leHQuZG9uZSl7XHJcbiAgICAgICAgICAgICAgICBpZihlcnJvcmVkKXtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20obmV4dC52YWx1ZSkoY2FsbGJhY2spO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmKGlzUmVzb2x2YWJsZShuZXh0LnZhbHVlKSl7XHJcbiAgICAgICAgICAgICAgICByaWdodG8uc3luYyhmdW5jdGlvbih2YWx1ZSl7XHJcbiAgICAgICAgICAgICAgICAgICAgbGFzdFZhbHVlID0gdmFsdWU7XHJcbiAgICAgICAgICAgICAgICAgICAgcnVuKCk7XHJcbiAgICAgICAgICAgICAgICB9LCBuZXh0LnZhbHVlKShmdW5jdGlvbihlcnJvcil7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYoZXJyb3Ipe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbGFzdFZhbHVlID0gbmV4dC52YWx1ZTtcclxuICAgICAgICAgICAgcnVuKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBydW4oKTtcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZFRyYWNpbmcocmVzb2x2ZSwgZm4sIGFyZ3Mpe1xyXG5cclxuICAgIHZhciBhcmdNYXRjaCA9IGZuLnRvU3RyaW5nKCkubWF0Y2goL15bXFx3XFxzXSo/XFwoKCg/OlxcdytbLFxcc10qPykqKVxcKS8pLFxyXG4gICAgICAgIGFyZ05hbWVzID0gYXJnTWF0Y2ggPyBhcmdNYXRjaFsxXS5zcGxpdCgvWyxcXHNdKy9nKSA6IFtdO1xyXG5cclxuICAgIHJlc29sdmUuX3N0YWNrID0gbmV3IEVycm9yKCkuc3RhY2s7XHJcbiAgICByZXNvbHZlLl90cmFjZSA9IGZ1bmN0aW9uKHRhYnMpe1xyXG4gICAgICAgIHZhciBmaXJzdExpbmUgPSBnZXRDYWxsTGluZShyZXNvbHZlLl9zdGFjayk7XHJcblxyXG4gICAgICAgIGlmKHJlc29sdmUuX2Vycm9yKXtcclxuICAgICAgICAgICAgZmlyc3RMaW5lID0gJ1xcdTAwMWJbMzFtJyArIGZpcnN0TGluZSArICcgPC0gRVJST1IgU09VUkNFJyArICAnXFx1MDAxYlszOW0nO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGFicyA9IHRhYnMgfHwgMDtcclxuICAgICAgICB2YXIgc3BhY2luZyA9ICcgICAgJztcclxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgdGFiczsgaSArKyl7XHJcbiAgICAgICAgICAgIHNwYWNpbmcgPSBzcGFjaW5nICsgJyAgICAnO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYXJncy5tYXAoZnVuY3Rpb24oYXJnLCBpbmRleCl7XHJcbiAgICAgICAgICAgIHJldHVybiBbYXJnLCBhcmdOYW1lc1tpbmRleF0gfHwgaW5kZXhdO1xyXG4gICAgICAgIH0pLnJlZHVjZShmdW5jdGlvbihyZXN1bHRzLCBhcmdJbmZvKXtcclxuICAgICAgICAgICAgdmFyIGFyZyA9IGFyZ0luZm9bMF0sXHJcbiAgICAgICAgICAgICAgICBhcmdOYW1lID0gYXJnSW5mb1sxXTtcclxuXHJcbiAgICAgICAgICAgIGlmKGlzVGFrZShhcmcpKXtcclxuICAgICAgICAgICAgICAgIGFyZyA9IGFyZy5fX3Rha2VfX1swXTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYoaXNSaWdodG8oYXJnKSl7XHJcbiAgICAgICAgICAgICAgICB2YXIgbGluZSA9IHNwYWNpbmcgKyAnLSBhcmd1bWVudCBcIicgKyBhcmdOYW1lICsgJ1wiIGZyb20gJztcclxuXHJcblxyXG4gICAgICAgICAgICAgICAgaWYoIWFyZy5fdHJhY2Upe1xyXG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5lICsgJ1RyYWNpbmcgd2FzIG5vdCBlbmFibGVkIGZvciB0aGlzIHJpZ2h0byBpbnN0YW5jZS4nO1xyXG4gICAgICAgICAgICAgICAgfWVsc2V7XHJcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IGxpbmUgKyBhcmcuX3RyYWNlKHRhYnMgKyAxKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJlc3VsdHMucHVzaChsaW5lKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgICAgfSwgW2ZpcnN0TGluZV0pXHJcbiAgICAgICAgLmpvaW4oJ1xcbicpO1xyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gdGFza0NvbXBsZXRlKGVycm9yKXtcclxuICAgIHZhciBkb25lID0gdGhpc1swXSxcclxuICAgICAgICBjb250ZXh0ID0gdGhpc1sxXSxcclxuICAgICAgICBjYWxsYmFja3MgPSBjb250ZXh0LmNhbGxiYWNrcztcclxuXHJcbiAgICBpZihlcnJvciAmJiByaWdodG8uX2RlYnVnKXtcclxuICAgICAgICBjb250ZXh0LnJlc29sdmUuX2Vycm9yID0gZXJyb3I7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHJlc3VsdHMgPSBhcmd1bWVudHM7XHJcblxyXG4gICAgZG9uZShyZXN1bHRzKTtcclxuXHJcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKXtcclxuICAgICAgICBkZWZlcihjYWxsYmFja3NbaV0uYXBwbHkuYmluZChjYWxsYmFja3NbaV0sIG51bGwsIHJlc3VsdHMpKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZXJyb3JPdXQoZXJyb3IsIGNhbGxiYWNrKXtcclxuICAgIGlmKGVycm9yICYmIHJpZ2h0by5fZGVidWcpe1xyXG4gICAgICAgIGlmKHJpZ2h0by5fYXV0b3RyYWNlT25FcnJvciB8fCB0aGlzLnJlc29sdmUuX3RyYWNlT25FcnJvcil7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdEZXBlbmRlbmN5IGVycm9yIGV4ZWN1dGluZyAnICsgdGhpcy5mbi5uYW1lICsgJyAnICsgdGhpcy5yZXNvbHZlLl90cmFjZSgpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY2FsbGJhY2soZXJyb3IpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkZWJ1Z1Jlc29sdmUoY29udGV4dCwgYXJncywgY29tcGxldGUpe1xyXG4gICAgdHJ5e1xyXG4gICAgICAgIGFyZ3MucHVzaChjb21wbGV0ZSk7XHJcbiAgICAgICAgY29udGV4dC5mbi5hcHBseShudWxsLCBhcmdzKTtcclxuICAgIH1jYXRjaChlcnJvcil7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ1Rhc2sgZXhjZXB0aW9uIGV4ZWN1dGluZyAnICsgY29udGV4dC5mbi5uYW1lICsgJyBmcm9tICcgKyBjb250ZXh0LnJlc29sdmUuX3RyYWNlKCkpO1xyXG4gICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZXNvbHZlV2l0aERlcGVuZGVuY2llcyhkb25lLCBlcnJvciwgYXJnUmVzdWx0cyl7XHJcbiAgICB2YXIgY29udGV4dCA9IHRoaXM7XHJcblxyXG4gICAgaWYoZXJyb3Ipe1xyXG4gICAgICAgIHZhciBib3VuZEVycm9yT3V0ID0gZXJyb3JPdXQuYmluZChjb250ZXh0LCBlcnJvcik7XHJcblxyXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb250ZXh0LmNhbGxiYWNrcy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgICAgIGJvdW5kRXJyb3JPdXQoY29udGV4dC5jYWxsYmFja3NbaV0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBhcmdzID0gYXJnUmVzdWx0cy5yZWR1Y2UoKHJlc3VsdHMsIG5leHQpID0+IHtcclxuICAgICAgICAgICAgaWYobmV4dCAmJiBuZXh0IGluc3RhbmNlb2YgdGFrZVdyYXApe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHMuY29uY2F0KG5leHQucmVzdWx0cyk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChuZXh0KTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XHJcbiAgICAgICAgfSwgW10pICxcclxuICAgICAgICBjb21wbGV0ZSA9IHRhc2tDb21wbGV0ZS5iaW5kKFtkb25lLCBjb250ZXh0XSk7XHJcblxyXG4gICAgaWYocmlnaHRvLl9kZWJ1Zyl7XHJcbiAgICAgICAgcmV0dXJuIGRlYnVnUmVzb2x2ZShjb250ZXh0LCBhcmdzLCBjb21wbGV0ZSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gU2xpZ2h0IHBlcmYgYnVtcCBieSBhdm9pZGluZyBhcHBseSBmb3Igc2ltcGxlIGNhc2VzLlxyXG4gICAgc3dpdGNoKGFyZ3MubGVuZ3RoKXtcclxuICAgICAgICBjYXNlIDA6IGNvbnRleHQuZm4oY29tcGxldGUpOyBicmVhaztcclxuICAgICAgICBjYXNlIDE6IGNvbnRleHQuZm4oYXJnc1swXSwgY29tcGxldGUpOyBicmVhaztcclxuICAgICAgICBjYXNlIDI6IGNvbnRleHQuZm4oYXJnc1swXSwgYXJnc1sxXSwgY29tcGxldGUpOyBicmVhaztcclxuICAgICAgICBjYXNlIDM6IGNvbnRleHQuZm4oYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSwgY29tcGxldGUpOyBicmVhaztcclxuICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICBhcmdzLnB1c2goY29tcGxldGUpO1xyXG4gICAgICAgICAgICBjb250ZXh0LmZuLmFwcGx5KG51bGwsIGFyZ3MpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZXNvbHZlRGVwZW5kZW5jaWVzKGFyZ3MsIGNvbXBsZXRlLCByZXNvbHZlRGVwZW5kZW5jeSl7XHJcbiAgICB2YXIgcmVzdWx0cyA9IFtdLFxyXG4gICAgICAgIGRvbmUgPSAwLFxyXG4gICAgICAgIGhhc0Vycm9yZWQ7XHJcblxyXG4gICAgaWYoIWFyZ3MubGVuZ3RoKXtcclxuICAgICAgICBjb21wbGV0ZShudWxsLCBbXSk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gZGVwZW5kZW5jeVJlc29sdmVkKGluZGV4LCBlcnJvciwgcmVzdWx0KXtcclxuICAgICAgICBpZihoYXNFcnJvcmVkKXtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYoZXJyb3Ipe1xyXG4gICAgICAgICAgICBoYXNFcnJvcmVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuIGNvbXBsZXRlKGVycm9yKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJlc3VsdHNbaW5kZXhdID0gcmVzdWx0O1xyXG5cclxuICAgICAgICBpZigrK2RvbmUgPT09IGFyZ3MubGVuZ3RoKXtcclxuICAgICAgICAgICAgY29tcGxldGUobnVsbCwgcmVzdWx0cyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKXtcclxuICAgICAgICBpZighaXNSZXNvbHZhYmxlKGFyZ3NbaV0pICYmICFpc1Rha2UoYXJnc1tpXSkpe1xyXG4gICAgICAgICAgICBkZXBlbmRlbmN5UmVzb2x2ZWQoaSwgbnVsbCwgYXJnc1tpXSk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXNvbHZlRGVwZW5kZW5jeShhcmdzW2ldLCBkZXBlbmRlbmN5UmVzb2x2ZWQuYmluZChudWxsLCBpKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmVyKGNvbXBsZXRlKXtcclxuICAgIHZhciBjb250ZXh0ID0gdGhpcztcclxuXHJcbiAgICAvLyBObyBjYWxsYmFjaz8gSnVzdCBydW4gdGhlIHRhc2suXHJcbiAgICBpZighYXJndW1lbnRzLmxlbmd0aCl7XHJcbiAgICAgICAgY29tcGxldGUgPSBub09wO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKGlzUmlnaHRvKGNvbXBsZXRlKSl7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyaWdodG8gaW5zdGFuY2UgcGFzc2VkIGludG8gYSByaWdodG8gaW5zdGFuY2UgaW5zdGVhZCBvZiBhIGNhbGxiYWNrJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYodHlwZW9mIGNvbXBsZXRlICE9PSAnZnVuY3Rpb24nKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKGNvbnRleHQucmVzdWx0cyl7XHJcbiAgICAgICAgcmV0dXJuIGNvbXBsZXRlLmFwcGx5KG51bGwsIGNvbnRleHQucmVzdWx0cyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29udGV4dC5jYWxsYmFja3MucHVzaChjb21wbGV0ZSk7XHJcblxyXG4gICAgaWYoY29udGV4dC5zdGFydGVkKyspe1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgcmVzb2x2ZWQgPSByZXNvbHZlV2l0aERlcGVuZGVuY2llcy5iaW5kKGNvbnRleHQsIGZ1bmN0aW9uKHJlc29sdmVkUmVzdWx0cyl7XHJcbiAgICAgICAgICAgIGlmKHJpZ2h0by5fZGVidWcpe1xyXG4gICAgICAgICAgICAgICAgaWYocmlnaHRvLl9hdXRvdHJhY2UgfHwgY29udGV4dC5yZXNvbHZlLl90cmFjZU9uRXhlY3V0ZSl7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coJ0V4ZWN1dGluZyAnICsgY29udGV4dC5mbi5uYW1lICsgJyAnICsgY29udGV4dC5yZXNvbHZlLl90cmFjZSgpKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29udGV4dC5yZXN1bHRzID0gcmVzb2x2ZWRSZXN1bHRzO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIGRlZmVyKHJlc29sdmVEZXBlbmRlbmNpZXMuYmluZChudWxsLCBjb250ZXh0LmFyZ3MsIHJlc29sdmVkLCByZXNvbHZlRGVwZW5kZW5jeS5iaW5kKGNvbnRleHQucmVzb2x2ZSkpKTtcclxuXHJcbiAgICByZXR1cm4gY29udGV4dC5yZXNvbHZlO1xyXG59O1xyXG5cclxuZnVuY3Rpb24gcmlnaHRvKCl7XHJcbiAgICB2YXIgYXJncyA9IHNsaWNlKGFyZ3VtZW50cyksXHJcbiAgICAgICAgZm4gPSBhcmdzLnNoaWZ0KCk7XHJcblxyXG4gICAgaWYodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIHRhc2sgZnVuY3Rpb24gcGFzc2VkIHRvIHJpZ2h0bycpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKGlzUmlnaHRvKGZuKSAmJiBhcmdzLmxlbmd0aCA+IDApe1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUmlnaHRvIHRhc2sgcGFzc2VkIGFzIHRhcmdldCB0YXNrIHRvIHJpZ2h0bygpJyk7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHJlc29sdmVyQ29udGV4dCA9IHtcclxuICAgICAgICAgICAgZm46IGZuLFxyXG4gICAgICAgICAgICBjYWxsYmFja3M6IFtdLFxyXG4gICAgICAgICAgICBhcmdzOiBhcmdzLFxyXG4gICAgICAgICAgICBzdGFydGVkOiAwXHJcbiAgICAgICAgfSxcclxuICAgICAgICByZXNvbHZlID0gcmVzb2x2ZXIuYmluZChyZXNvbHZlckNvbnRleHQpO1xyXG4gICAgcmVzb2x2ZS5nZXQgPSBnZXQuYmluZChyZXNvbHZlKTtcclxuICAgIHJlc29sdmVyQ29udGV4dC5yZXNvbHZlID0gcmVzb2x2ZTtcclxuICAgIHJlc29sdmUucmVzb2x2ZSA9IHJlc29sdmU7XHJcblxyXG4gICAgaWYocmlnaHRvLl9kZWJ1Zyl7XHJcbiAgICAgICAgYWRkVHJhY2luZyhyZXNvbHZlLCBmbiwgYXJncyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlc29sdmU7XHJcbn1cclxuXHJcbnJpZ2h0by5zeW5jID0gZnVuY3Rpb24oZm4pe1xyXG4gICAgcmV0dXJuIHJpZ2h0by5hcHBseShudWxsLCBbZnVuY3Rpb24oKXtcclxuICAgICAgICB2YXIgYXJncyA9IHNsaWNlKGFyZ3VtZW50cyksXHJcbiAgICAgICAgICAgIGRvbmUgPSBhcmdzLnBvcCgpLFxyXG4gICAgICAgICAgICByZXN1bHQgPSBmbi5hcHBseShudWxsLCBhcmdzKTtcclxuXHJcbiAgICAgICAgaWYoaXNSZXNvbHZhYmxlKHJlc3VsdCkpe1xyXG4gICAgICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20ocmVzdWx0KShkb25lKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRvbmUobnVsbCwgcmVzdWx0KTtcclxuICAgIH1dLmNvbmNhdChzbGljZShhcmd1bWVudHMsIDEpKSk7XHJcbn07XHJcblxyXG5yaWdodG8uYWxsID0gZnVuY3Rpb24odmFsdWUpe1xyXG4gICAgdmFyIHRhc2sgPSB2YWx1ZTtcclxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPiAxKXtcclxuICAgICAgICB0YXNrID0gc2xpY2UoYXJndW1lbnRzKTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiByZXNvbHZlKHRhc2tzKXtcclxuICAgICAgICByZXR1cm4gcmlnaHRvLmFwcGx5KG51bGwsIFtmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtIDFdKG51bGwsIHNsaWNlKGFyZ3VtZW50cywgMCwgLTEpKTtcclxuICAgICAgICB9XS5jb25jYXQodGFza3MpKTtcclxuICAgIH1cclxuXHJcbiAgICBpZihpc1JpZ2h0byh0YXNrKSl7XHJcbiAgICAgICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbih0YXNrcywgZG9uZSl7XHJcbiAgICAgICAgICAgIHJlc29sdmUodGFza3MpKGRvbmUpO1xyXG4gICAgICAgIH0sIHRhc2spO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXNvbHZlKHRhc2spO1xyXG59O1xyXG5cclxucmlnaHRvLnJlZHVjZSA9IGZ1bmN0aW9uKHZhbHVlcywgcmVkdWNlciwgc2VlZCl7XHJcbiAgICB2YXIgaGFzU2VlZCA9IGFyZ3VtZW50cy5sZW5ndGggPj0gMztcclxuXHJcbiAgICBpZighcmVkdWNlcil7XHJcbiAgICAgICAgcmVkdWNlciA9IGZ1bmN0aW9uKHByZXZpb3VzLCBuZXh0KXtcclxuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0byhuZXh0KTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByaWdodG8uZnJvbSh2YWx1ZXMpLmdldChmdW5jdGlvbih2YWx1ZXMpe1xyXG4gICAgICAgIGlmKCF2YWx1ZXMgfHwgIXZhbHVlcy5yZWR1Y2Upe1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3ZhbHVlcyB3YXMgbm90IGEgcmVkdWNlYWJsZSBvYmplY3QgKGxpa2UgYW4gYXJyYXkpJyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB2YWx1ZXMgPSB2YWx1ZXMuc2xpY2UoKTtcclxuXHJcbiAgICAgICAgaWYoIWhhc1NlZWQpe1xyXG4gICAgICAgICAgICBzZWVkID0gdmFsdWVzLnNoaWZ0KCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZighdmFsdWVzLmxlbmd0aCl7XHJcbiAgICAgICAgICAgIHJldHVybiByaWdodG8uZnJvbShzZWVkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB2YWx1ZXMucmVkdWNlKGZ1bmN0aW9uKHByZXZpb3VzLCBuZXh0KXtcclxuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5zeW5jKHJlZHVjZXIsIHByZXZpb3VzLCByaWdodG8udmFsdWUobmV4dCkpO1xyXG4gICAgICAgIH0sIHNlZWQpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5yaWdodG8uZnJvbSA9IGZ1bmN0aW9uKHZhbHVlKXtcclxuICAgIGlmKGFyZ3VtZW50cy5sZW5ndGggPiAxKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3JpZ2h0by5mcm9tIGNhbGxlZCB3aXRoIG1vcmUgdGhhbiBvbmUgYXJndW1lbnQuIFJpZ2h0byB2NCBubyBsb25nZXIgc3VwcG9ydHMgY29uc3RydWN0aW5nIGV2ZW50dWFscyB2aWEgYGZyb21gLCB1c2UgYHN5bmNgIGluc3RlYWQuJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYoaXNSaWdodG8odmFsdWUpKXtcclxuICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJpZ2h0by5zeW5jKGZ1bmN0aW9uKHJlc29sdmVkKXtcclxuICAgICAgICByZXR1cm4gcmVzb2x2ZWQ7XHJcbiAgICB9LCB2YWx1ZSk7XHJcbn07XHJcblxyXG5yaWdodG8ubWF0ZSA9IGZ1bmN0aW9uKCl7XHJcbiAgICByZXR1cm4gcmlnaHRvLmFwcGx5KG51bGwsIFtmdW5jdGlvbigpe1xyXG4gICAgICAgIGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0xXS5hcHBseShudWxsLCBbbnVsbF0uY29uY2F0KHNsaWNlKGFyZ3VtZW50cywgMCwgLTEpKSk7XHJcbiAgICB9XS5jb25jYXQoc2xpY2UoYXJndW1lbnRzKSkpO1xyXG59O1xyXG5cclxucmlnaHRvLnRha2UgPSBmdW5jdGlvbih0YXNrKXtcclxuICAgIGlmKCFpc1Jlc29sdmFibGUodGFzaykpe1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcigndGFzayB3YXMgbm90IGEgcmVzb2x2YWJsZSB2YWx1ZScpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7X190YWtlX186IHNsaWNlKGFyZ3VtZW50cyl9O1xyXG59O1xyXG5cclxucmlnaHRvLmFmdGVyID0gZnVuY3Rpb24odGFzayl7XHJcbiAgICBpZighaXNSZXNvbHZhYmxlKHRhc2spKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Rhc2sgd2FzIG5vdCBhIHJlc29sdmFibGUgdmFsdWUnKTtcclxuICAgIH1cclxuXHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID09PSAxKXtcclxuICAgICAgICByZXR1cm4ge19fdGFrZV9fOiBbdGFza119O1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7X190YWtlX186IFtyaWdodG8ubWF0ZS5hcHBseShudWxsLCBhcmd1bWVudHMpXX07XHJcbn07XHJcblxyXG5yaWdodG8ucmVzb2x2ZSA9IGZ1bmN0aW9uKG9iamVjdCwgZGVlcCl7XHJcbiAgICBpZihpc1JpZ2h0byhvYmplY3QpKXtcclxuICAgICAgICByZXR1cm4gcmlnaHRvLnN5bmMoZnVuY3Rpb24ob2JqZWN0KXtcclxuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5yZXNvbHZlKG9iamVjdCwgZGVlcCk7XHJcbiAgICAgICAgfSwgb2JqZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICBpZighb2JqZWN0IHx8ICEodHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCcgfHwgdHlwZW9mIG9iamVjdCA9PT0gJ2Z1bmN0aW9uJykpe1xyXG4gICAgICAgIHJldHVybiByaWdodG8uZnJvbShvYmplY3QpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBwYWlycyA9IHJpZ2h0by5hbGwoT2JqZWN0LmtleXMob2JqZWN0KS5tYXAoZnVuY3Rpb24oa2V5KXtcclxuICAgICAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKHZhbHVlLCBkb25lKXtcclxuICAgICAgICAgICAgaWYoZGVlcCl7XHJcbiAgICAgICAgICAgICAgICByaWdodG8uc3luYyhmdW5jdGlvbih2YWx1ZSl7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtrZXksIHZhbHVlXTtcclxuICAgICAgICAgICAgICAgIH0sIHJpZ2h0by5yZXNvbHZlKHZhbHVlLCB0cnVlKSkoZG9uZSk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZG9uZShudWxsLCBba2V5LCB2YWx1ZV0pO1xyXG4gICAgICAgIH0sIG9iamVjdFtrZXldKTtcclxuICAgIH0pKTtcclxuXHJcbiAgICByZXR1cm4gcmlnaHRvLnN5bmMoZnVuY3Rpb24ocGFpcnMpe1xyXG4gICAgICAgIHJldHVybiBwYWlycy5yZWR1Y2UoZnVuY3Rpb24ocmVzdWx0LCBwYWlyKXtcclxuICAgICAgICAgICAgcmVzdWx0W3BhaXJbMF1dID0gcGFpclsxXTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9LCBBcnJheS5pc0FycmF5KG9iamVjdCkgPyBbXSA6IHt9KTtcclxuICAgIH0sIHBhaXJzKTtcclxufTtcclxuXHJcbnJpZ2h0by5pdGVyYXRlID0gY3JlYXRlSXRlcmF0b3I7XHJcblxyXG5yaWdodG8udmFsdWUgPSBmdW5jdGlvbigpe1xyXG4gICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XHJcbiAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKGRvbmUpe1xyXG4gICAgICAgIGRvbmUuYXBwbHkobnVsbCwgW251bGxdLmNvbmNhdChzbGljZShhcmdzKSkpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5yaWdodG8uc3VyZWx5ID0gZnVuY3Rpb24odGFzayl7XHJcbiAgICBpZighaXNSZXNvbHZhYmxlKHRhc2spKXtcclxuICAgICAgICB0YXNrID0gcmlnaHRvLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihkb25lKXtcclxuICAgICAgICB0YXNrKGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgICAgIGRvbmUobnVsbCwgc2xpY2UoYXJndW1lbnRzKSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbnJpZ2h0by5oYW5kbGUgPSBmdW5jdGlvbih0YXNrLCBoYW5kbGVyKXtcclxuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24oaGFuZGxlciwgZG9uZSl7XHJcbiAgICAgICAgdGFzayhmdW5jdGlvbihlcnJvcil7XHJcbiAgICAgICAgICAgIGlmKCFlcnJvcil7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGFzayhkb25lKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaGFuZGxlcihlcnJvciwgZG9uZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9LCBoYW5kbGVyKTtcclxufTtcclxuXHJcbnJpZ2h0by5mYWlsID0gZnVuY3Rpb24oZXJyb3Ipe1xyXG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihlcnJvciwgZG9uZSl7XHJcbiAgICAgICAgZG9uZShlcnJvcik7XHJcbiAgICB9LCBlcnJvcik7XHJcbn07XHJcblxyXG5yaWdodG8uZm9yayA9IGZ1bmN0aW9uKHZhbHVlKXtcclxuICAgIHJldHVybiBmdW5jdGlvbihyZXNvbHZlLCByZWplY3Qpe1xyXG4gICAgICAgIHJpZ2h0by5mcm9tKHZhbHVlKShmdW5jdGlvbihlcnJvciwgcmVzdWx0KXtcclxuICAgICAgICAgICAgaWYoZXJyb3Ipe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJlc29sdmUocmVzdWx0KTtcclxuICAgICAgICB9KTtcclxuICAgIH07XHJcbn07XHJcblxyXG5yaWdodG8uaXNSaWdodG8gPSBpc1JpZ2h0bztcclxucmlnaHRvLmlzVGhlbmFibGUgPSBpc1RoZW5hYmxlO1xyXG5yaWdodG8uaXNSZXNvbHZhYmxlID0gaXNSZXNvbHZhYmxlO1xyXG5cclxucmlnaHRvLnByb3h5ID0gZnVuY3Rpb24oKXtcclxuICAgIGlmKHR5cGVvZiBQcm94eSA9PT0gJ3VuZGVmaW5lZCcpe1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhpcyBlbnZpcm9ubWVudCBkb2VzIG5vdCBzdXBwb3J0IFByb3h5XFwncycpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBwcm94eShyaWdodG8uYXBwbHkodGhpcywgYXJndW1lbnRzKSk7XHJcbn07XHJcblxyXG5mb3IodmFyIGtleSBpbiByaWdodG8pe1xyXG4gICAgcmlnaHRvLnByb3h5W2tleV0gPSByaWdodG9ba2V5XTtcclxufVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSByaWdodG87Il19

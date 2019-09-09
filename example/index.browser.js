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

    function createTextarea(){
        var input = crel('textarea')
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
                chatInput.removeEventListener('keypress', submit);
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
        rtc.createOffer(function(error, offerResult){
            if(error){
                reset();
                offerDisplay = createTextarea();
                offerDisplay.value = error.message;
                return;
            }
            offerDisplay = createTextarea();
            offerDisplay.value = offerResult.sdp;
            offerInput = createTextarea();
            offerInput.addEventListener('keypress', function(event){
                if(event.keyCode !== 13){
                    return
                }

                event.preventDefault();

                offerResult.answer(offerInput.value, function(error, answerResult){
                    if(error){
                        offerDisplay = createTextarea();
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
                    offerDisplay = createTextarea();
                    offerDisplay.value = error.message;
                    document.body.appendChild(offerDisplay);
                    return;
                }
                offerDisplay = createTextarea();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJleGFtcGxlL2luZGV4LmpzIiwiaW5kZXguanMiLCJub2RlX21vZHVsZXMvYWJib3R0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2NyZWwvY3JlbC5qcyIsIm5vZGVfbW9kdWxlcy9yaWdodG8vaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ25HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsInZhciB3dGZSdGMgPSByZXF1aXJlKCcuLi8nKTtcbnZhciBjcmVsID0gcmVxdWlyZSgnY3JlbCcpO1xuXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignRE9NQ29udGVudExvYWRlZCcsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIHJ0YyA9IHd0ZlJ0YyhcIm15Q2hhbm5lbFwiLCB7XG4gICAgICAgIGljZVNlcnZlcnM6IFtcbiAgICAgICAgICAgIHsgdXJsczogJ3N0dW46c3R1bi5sLmdvb2dsZS5jb206MTkzMDInIH0sXG4gICAgICAgICAgICB7IHVybHM6ICdzdHVuOnN0dW4xLmwuZ29vZ2xlLmNvbToxOTMwMicgfSxcbiAgICAgICAgICAgIHsgdXJsczogJ3N0dW46c3R1bjIubC5nb29nbGUuY29tOjE5MzAyJyB9LFxuICAgICAgICAgICAgeyB1cmxzOiAnc3R1bjpzdHVuMy5sLmdvb2dsZS5jb206MTkzMDInIH0sXG4gICAgICAgICAgICB7IHVybHM6ICdzdHVuOnN0dW40LmwuZ29vZ2xlLmNvbToxOTMwMicgfSxcbiAgICAgICAgICAgIHsgdXJsczogJ3N0dW46c3R1bi52b3hncmF0aWEub3JnJyB9XG4gICAgICAgIF1cbiAgICB9KTtcblxuICAgIHZhciBvZmZlckJ1dHRvbiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNvZmZlckJ1dHRvbicpO1xuICAgIHZhciBqb2luQnV0dG9uID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2pvaW5CdXR0b24nKTtcbiAgICB2YXIgb2ZmZXJEaXNwbGF5ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI29mZmVyJyk7XG4gICAgdmFyIG9mZmVySW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjb2ZmZXJJbnB1dCcpO1xuICAgIHZhciBhbnN3ZXJUZXh0YXJlYSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNhbnN3ZXJUZXh0YXJlYScpO1xuICAgIHZhciBjaGF0SW5wdXQ7XG4gICAgdmFyIGNoYXRPdXRwdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY2hhdE91dHB1dCcpO1xuXG4gICAgZnVuY3Rpb24gcmVzZXQoKXtcbiAgICAgICAgb2ZmZXJEaXNwbGF5ICYmIG9mZmVyRGlzcGxheS5yZW1vdmUoKTtcbiAgICAgICAgb2ZmZXJJbnB1dCAmJiBvZmZlcklucHV0LnJlbW92ZSgpO1xuICAgICAgICBjaGF0SW5wdXQgJiYgY2hhdElucHV0LnJlbW92ZSgpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNyZWF0ZVRleHRhcmVhKCl7XG4gICAgICAgIHZhciBpbnB1dCA9IGNyZWwoJ3RleHRhcmVhJylcbiAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpbnB1dCk7XG4gICAgICAgIHJldHVybiBpbnB1dDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzdGFydENoYXQocmVzdWx0KXtcbiAgICAgICAgcmVzdWx0LmdldE9wZW5EYXRhQ2hhbm5lbChmdW5jdGlvbihlcnJvciwgZGF0YUNoYW5uZWwpe1xuICAgICAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICBvZmZlckRpc3BsYXkudmFsdWUgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNoYXRJbnB1dCA9IGNyZWwoJ2lucHV0JywgeyBwbGFjZWhvbGRlcjogJ0NoYXQ6JyB9KTtcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY2hhdElucHV0KVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBzdWJtaXQoZXZlbnQpe1xuICAgICAgICAgICAgICAgIGlmKGV2ZW50LmtleUNvZGUgIT09IDEzKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgY2hhdElucHV0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgc3VibWl0KTtcbiAgICAgICAgICAgICAgICBkYXRhQ2hhbm5lbC5zZW5kKGNoYXRJbnB1dC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgY2hhdE91dHB1dC5hcHBlbmRDaGlsZChjcmVsKCdkaXYnLCAnWW91OicgKyBjaGF0SW5wdXQudmFsdWUpKTtcbiAgICAgICAgICAgICAgICBjaGF0SW5wdXQudmFsdWUgPSAnJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2hhdElucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgc3VibWl0KTtcblxuICAgICAgICAgICAgZGF0YUNoYW5uZWwuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgICAgICBjaGF0T3V0cHV0LmFwcGVuZENoaWxkKGNyZWwoJ2RpdicsICdUaGVtOicgKyBldmVudC5kYXRhKSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgIH1cblxuICAgIG9mZmVyQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgcnRjLmNyZWF0ZU9mZmVyKGZ1bmN0aW9uKGVycm9yLCBvZmZlclJlc3VsdCl7XG4gICAgICAgICAgICBpZihlcnJvcil7XG4gICAgICAgICAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgICAgICAgICBvZmZlckRpc3BsYXkgPSBjcmVhdGVUZXh0YXJlYSgpO1xuICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheS52YWx1ZSA9IGVycm9yLm1lc3NhZ2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb2ZmZXJEaXNwbGF5ID0gY3JlYXRlVGV4dGFyZWEoKTtcbiAgICAgICAgICAgIG9mZmVyRGlzcGxheS52YWx1ZSA9IG9mZmVyUmVzdWx0LnNkcDtcbiAgICAgICAgICAgIG9mZmVySW5wdXQgPSBjcmVhdGVUZXh0YXJlYSgpO1xuICAgICAgICAgICAgb2ZmZXJJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdrZXlwcmVzcycsIGZ1bmN0aW9uKGV2ZW50KXtcbiAgICAgICAgICAgICAgICBpZihldmVudC5rZXlDb2RlICE9PSAxMyl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cbiAgICAgICAgICAgICAgICBvZmZlclJlc3VsdC5hbnN3ZXIob2ZmZXJJbnB1dC52YWx1ZSwgZnVuY3Rpb24oZXJyb3IsIGFuc3dlclJlc3VsdCl7XG4gICAgICAgICAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheSA9IGNyZWF0ZVRleHRhcmVhKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBvZmZlckRpc3BsYXkudmFsdWUgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0Q2hhdChhbnN3ZXJSZXN1bHQpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgIHJlc2V0KCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBqb2luQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZnVuY3Rpb24oKXtcbiAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgb2ZmZXJJbnB1dCA9IGNyZWF0ZVRleHRhcmVhKCk7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQob2ZmZXJJbnB1dCk7XG4gICAgICAgIGZ1bmN0aW9uIHN1Ym1pdChldmVudCl7XG4gICAgICAgICAgICBpZihldmVudC5rZXlDb2RlICE9PSAxMyl7XG4gICAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgICAgIHJ0Yy5jb25zdW1lT2ZmZXIob2ZmZXJJbnB1dC52YWx1ZSwgZnVuY3Rpb24oZXJyb3IsIGNvbnN1bWVSZXN1bHQpe1xuICAgICAgICAgICAgICAgIGlmKGVycm9yKXtcbiAgICAgICAgICAgICAgICAgICAgcmVzZXQoKTtcbiAgICAgICAgICAgICAgICAgICAgb2ZmZXJEaXNwbGF5ID0gY3JlYXRlVGV4dGFyZWEoKTtcbiAgICAgICAgICAgICAgICAgICAgb2ZmZXJEaXNwbGF5LnZhbHVlID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChvZmZlckRpc3BsYXkpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG9mZmVyRGlzcGxheSA9IGNyZWF0ZVRleHRhcmVhKCk7XG4gICAgICAgICAgICAgICAgb2ZmZXJEaXNwbGF5LnZhbHVlID0gY29uc3VtZVJlc3VsdC5zZHA7XG4gICAgICAgICAgICAgICAgc3RhcnRDaGF0KGNvbnN1bWVSZXN1bHQpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgfVxuICAgICAgICBvZmZlcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXByZXNzJywgc3VibWl0KTtcbiAgICB9KTtcbn0pIiwidmFyIHJpZ2h0byA9IHJlcXVpcmUoJ3JpZ2h0bycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNoYW5uZWxMYWJlbCwgY29uZmlnLCBjYWxsYmFjayl7XG4gIGZ1bmN0aW9uIGdldENvbm5lY3Rpb25JblN0YXRlKHBlZXJDb25uZWN0aW9uLCBzdGF0ZSwgY2FsbGJhY2spe1xuICAgIHZhciByZWFkeSA9IHJpZ2h0byhkb25lID0+IHtcbiAgICAgIGZ1bmN0aW9uIG9uQ2hhbmdlKCl7XG4gICAgICAgIGlmKHBlZXJDb25uZWN0aW9uLnNpZ25hbGluZ1N0YXRlID09PSBzdGF0ZSl7XG4gICAgICAgICAgcGVlckNvbm5lY3Rpb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcignc2lnbmFsaW5nc3RhdGVjaGFuZ2UgJywgb25DaGFuZ2UpO1xuICAgICAgICAgIGRvbmUoKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcGVlckNvbm5lY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcignc2lnbmFsaW5nc3RhdGVjaGFuZ2UgJywgb25DaGFuZ2UpO1xuICAgICAgb25DaGFuZ2UoKTtcbiAgICB9KTtcblxuICAgIHJlYWR5KGNhbGxiYWNrKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGdldFNkcChwZWVyQ29ubmVjdGlvbiwgb2ZmZXJPckFuc2VyLCBjYWxsYmFjayl7XG4gICAgdmFyIGxvY2FsRGVzY3JpcHRpb25TZXQgPSByaWdodG8uc3luYyhwZWVyQ29ubmVjdGlvbi5zZXRMb2NhbERlc2NyaXB0aW9uLmJpbmQocGVlckNvbm5lY3Rpb24pLCBvZmZlck9yQW5zZXIpO1xuICAgIHZhciBzZHAgPSByaWdodG8oZG9uZSA9PiB7XG4gICAgICBwZWVyQ29ubmVjdGlvbi5hZGRFdmVudExpc3RlbmVyKCdpY2VjYW5kaWRhdGUnLCAoeyBjYW5kaWRhdGUgfSkgPT4ge1xuICAgICAgICBpZiAoIWNhbmRpZGF0ZSkge1xuICAgICAgICAgIGRvbmUobnVsbCwgcGVlckNvbm5lY3Rpb24ubG9jYWxEZXNjcmlwdGlvbi5zZHApO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgIH0sIHJpZ2h0by5hZnRlcihsb2NhbERlc2NyaXB0aW9uU2V0KSk7XG5cbiAgICBzZHAoY2FsbGJhY2spO1xuICB9XG5cbiAgZnVuY3Rpb24gY29uc3VtZU9mZmVyKG9mZmVyVGV4dCwgY2FsbGJhY2spIHtcbiAgICB2YXIgcGVlckNvbm5lY3Rpb24gPSBuZXcgUlRDUGVlckNvbm5lY3Rpb24oY29uZmlnKTtcbiAgICB2YXIgc3RhYmxlID0gcmlnaHRvKGdldENvbm5lY3Rpb25JblN0YXRlLCBwZWVyQ29ubmVjdGlvbiwgJ3N0YWJsZScpO1xuXG4gICAgdmFyIGRhdGFDaGFubmVsID0gcGVlckNvbm5lY3Rpb24uY3JlYXRlRGF0YUNoYW5uZWwoY2hhbm5lbExhYmVsLCB7XG4gICAgICBvcmRlcmVkOiBmYWxzZVxuICAgIH0pO1xuICAgIHZhciBvcGVuQ2FsbGJhY2tzID0gW107XG5cbiAgICB2YXIgZ2V0T3BlbkRhdGFDaGFubmVsID0gcmlnaHRvKGNhbGxiYWNrID0+IHtcbiAgICAgIGRhdGFDaGFubmVsLmFkZEV2ZW50TGlzdGVuZXIoJ29wZW4nLCAoKSA9PiBjYWxsYmFjayhudWxsLCBkYXRhQ2hhbm5lbCkpO1xuICAgIH0pO1xuXG4gICAgdmFyIHJlbW90ZURlc2NyaXB0aW9uU2V0ID0gc3RhYmxlLmdldCgoKSA9PiBwZWVyQ29ubmVjdGlvbi5zZXRSZW1vdGVEZXNjcmlwdGlvbih7IHR5cGU6IFwib2ZmZXJcIiwgc2RwOiBvZmZlclRleHQgfSkpO1xuICAgIHZhciBhbnN3ZXIgPSByZW1vdGVEZXNjcmlwdGlvblNldC5nZXQoKCkgPT4gcGVlckNvbm5lY3Rpb24uY3JlYXRlQW5zd2VyKCkpO1xuICAgIHZhciBzZHAgPSByaWdodG8oZ2V0U2RwLCBwZWVyQ29ubmVjdGlvbiwgYW5zd2VyKTtcbiAgICB2YXIgcmVzdWx0ID0gc2RwLmdldChzZHAgPT4gKHsgc2RwLCBnZXRPcGVuRGF0YUNoYW5uZWwgfSkpO1xuXG4gICAgcmVzdWx0KGNhbGxiYWNrKVxuICB9O1xuXG4gIGZ1bmN0aW9uIGNyZWF0ZU9mZmVyKGNhbGxiYWNrKSB7XG4gICAgdmFyIHBlZXJDb25uZWN0aW9uID0gbmV3IFJUQ1BlZXJDb25uZWN0aW9uKGNvbmZpZyk7XG4gICAgdmFyIHN0YWJsZSA9IHJpZ2h0byhnZXRDb25uZWN0aW9uSW5TdGF0ZSwgcGVlckNvbm5lY3Rpb24sICdzdGFibGUnKTtcblxuICAgIHZhciBkYXRhQ2hhbm5lbCA9IHBlZXJDb25uZWN0aW9uLmNyZWF0ZURhdGFDaGFubmVsKGNoYW5uZWxMYWJlbCwge1xuICAgICAgb3JkZXJlZDogZmFsc2VcbiAgICB9KTtcblxuICAgIHZhciBnZXRPcGVuRGF0YUNoYW5uZWwgPSByaWdodG8oY2FsbGJhY2sgPT4ge1xuICAgICAgdmFyIGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICBpZihkYXRhQ2hhbm5lbC5yZWFkeVN0YXRlID09PSAnb3Blbicpe1xuICAgICAgICAgIGNsZWFySW50ZXJ2YWwoaW50ZXJ2YWwpO1xuICAgICAgICAgIGNhbGxiYWNrKG51bGwsIGRhdGFDaGFubmVsKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiBhbnN3ZXIoYW5zd2VyVGV4dCwgY2FsbGJhY2spIHtcbiAgICAgIHZhciBoYXZlTG9jYWxPZmZlciA9IHJpZ2h0byhnZXRDb25uZWN0aW9uSW5TdGF0ZSwgcGVlckNvbm5lY3Rpb24sICdoYXZlLWxvY2FsLW9mZmVyJyk7XG4gICAgICB2YXIgcmVtb3RlRGVzY3JpcHRpb25TZXQgPSBoYXZlTG9jYWxPZmZlci5nZXQoKCkgPT4gcmlnaHRvLmZyb20ocGVlckNvbm5lY3Rpb24uc2V0UmVtb3RlRGVzY3JpcHRpb24oeyB0eXBlOiBcImFuc3dlclwiLCBzZHA6IGFuc3dlclRleHQgfSkpKTtcbiAgICAgIHZhciByZXN1bHQgPSByZW1vdGVEZXNjcmlwdGlvblNldC5nZXQoKCkgPT4gKHsgZ2V0T3BlbkRhdGFDaGFubmVsIH0pKTtcblxuICAgICAgcmVzdWx0KGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICB2YXIgb2ZmZXIgPSBzdGFibGUuZ2V0KCgpID0+IHBlZXJDb25uZWN0aW9uLmNyZWF0ZU9mZmVyKCkpO1xuICAgIHZhciBzZHAgPSByaWdodG8oZ2V0U2RwLCBwZWVyQ29ubmVjdGlvbiwgb2ZmZXIpO1xuICAgIHZhciByZXN1bHQgPSBzZHAuZ2V0KHNkcCA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzZHAsXG4gICAgICAgIGFuc3dlclxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmVzdWx0KGNhbGxiYWNrKVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjb25zdW1lT2ZmZXIsXG4gICAgY3JlYXRlT2ZmZXJcbiAgfTtcbn0iLCJmdW5jdGlvbiBjaGVja0lmUHJvbWlzZShwcm9taXNlKXtcbiAgICBpZighcHJvbWlzZSB8fCB0eXBlb2YgcHJvbWlzZSAhPT0gJ29iamVjdCcgfHwgdHlwZW9mIHByb21pc2UudGhlbiAhPT0gJ2Z1bmN0aW9uJyl7XG4gICAgICAgIHRocm93IFwiQWJib3R0IHJlcXVpcmVzIGEgcHJvbWlzZSB0byBicmVhay4gSXQgaXMgdGhlIG9ubHkgdGhpbmcgQWJib3R0IGlzIGdvb2QgYXQuXCI7XG4gICAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFiYm90dChwcm9taXNlT3JGbil7XG4gICAgaWYodHlwZW9mIHByb21pc2VPckZuICE9PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgY2hlY2tJZlByb21pc2UocHJvbWlzZU9yRm4pO1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICB2YXIgcHJvbWlzZTtcbiAgICAgICAgaWYodHlwZW9mIHByb21pc2VPckZuID09PSAnZnVuY3Rpb24nKXtcbiAgICAgICAgICAgcHJvbWlzZSA9IHByb21pc2VPckZuLmFwcGx5KG51bGwsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCwgLTEpKTtcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICBwcm9taXNlID0gcHJvbWlzZU9yRm47XG4gICAgICAgIH1cblxuICAgICAgICBjaGVja0lmUHJvbWlzZShwcm9taXNlKTtcblxuICAgICAgICB2YXIgY2FsbGJhY2sgPSBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aC0xXTtcbiAgICAgICAgcHJvbWlzZS50aGVuKGNhbGxiYWNrLmJpbmQobnVsbCwgbnVsbCksIGNhbGxiYWNrKTtcbiAgICB9O1xufTsiLCIvKiBDb3B5cmlnaHQgKEMpIDIwMTIgS29yeSBOdW5uXHJcblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cclxuXHJcbk5PVEU6XHJcblRoaXMgY29kZSBpcyBmb3JtYXR0ZWQgZm9yIHJ1bi1zcGVlZCBhbmQgdG8gYXNzaXN0IGNvbXBpbGVycy5cclxuVGhpcyBtaWdodCBtYWtlIGl0IGhhcmRlciB0byByZWFkIGF0IHRpbWVzLCBidXQgdGhlIGNvZGUncyBpbnRlbnRpb24gc2hvdWxkIGJlIHRyYW5zcGFyZW50LiAqL1xyXG5cclxuLy8gSUlGRSBvdXIgZnVuY3Rpb25cclxuKChleHBvcnRlcikgPT4ge1xyXG4gICAgLy8gRGVmaW5lIG91ciBmdW5jdGlvbiBhbmQgaXRzIHByb3BlcnRpZXNcclxuICAgIC8vIFRoZXNlIHN0cmluZ3MgYXJlIHVzZWQgbXVsdGlwbGUgdGltZXMsIHNvIHRoaXMgbWFrZXMgdGhpbmdzIHNtYWxsZXIgb25jZSBjb21waWxlZFxyXG4gICAgY29uc3QgZnVuYyA9ICdmdW5jdGlvbicsXHJcbiAgICAgICAgaXNOb2RlU3RyaW5nID0gJ2lzTm9kZScsXHJcbiAgICAgICAgZCA9IGRvY3VtZW50LFxyXG4gICAgICAgIC8vIEhlbHBlciBmdW5jdGlvbnMgdXNlZCB0aHJvdWdob3V0IHRoZSBzY3JpcHRcclxuICAgICAgICBpc1R5cGUgPSAob2JqZWN0LCB0eXBlKSA9PiB0eXBlb2Ygb2JqZWN0ID09PSB0eXBlLFxyXG4gICAgICAgIGlzTm9kZSA9IChub2RlKSA9PiBub2RlIGluc3RhbmNlb2YgTm9kZSxcclxuICAgICAgICBpc0VsZW1lbnQgPSAob2JqZWN0KSA9PiBvYmplY3QgaW5zdGFuY2VvZiBFbGVtZW50LFxyXG4gICAgICAgIC8vIFJlY3Vyc2l2ZWx5IGFwcGVuZHMgY2hpbGRyZW4gdG8gZ2l2ZW4gZWxlbWVudC4gQXMgYSB0ZXh0IG5vZGUgaWYgbm90IGFscmVhZHkgYW4gZWxlbWVudFxyXG4gICAgICAgIGFwcGVuZENoaWxkID0gKGVsZW1lbnQsIGNoaWxkKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjaGlsZCAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY2hpbGQpKSB7IC8vIFN1cHBvcnQgKGRlZXBseSkgbmVzdGVkIGNoaWxkIGVsZW1lbnRzXHJcbiAgICAgICAgICAgICAgICAgICAgY2hpbGQubWFwKChzdWJDaGlsZCkgPT4gYXBwZW5kQ2hpbGQoZWxlbWVudCwgc3ViQ2hpbGQpKTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjcmVsW2lzTm9kZVN0cmluZ10oY2hpbGQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkID0gZC5jcmVhdGVUZXh0Tm9kZShjaGlsZCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoY2hpbGQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICAgIC8vXHJcbiAgICBmdW5jdGlvbiBjcmVsIChlbGVtZW50LCBzZXR0aW5ncykge1xyXG4gICAgICAgIC8vIERlZmluZSBhbGwgdXNlZCB2YXJpYWJsZXMgLyBzaG9ydGN1dHMgaGVyZSwgdG8gbWFrZSB0aGluZ3Mgc21hbGxlciBvbmNlIGNvbXBpbGVkXHJcbiAgICAgICAgbGV0IGFyZ3MgPSBhcmd1bWVudHMsIC8vIE5vdGU6IGFzc2lnbmVkIHRvIGEgdmFyaWFibGUgdG8gYXNzaXN0IGNvbXBpbGVycy5cclxuICAgICAgICAgICAgaW5kZXggPSAxLFxyXG4gICAgICAgICAgICBrZXksXHJcbiAgICAgICAgICAgIGF0dHJpYnV0ZTtcclxuICAgICAgICAvLyBJZiBmaXJzdCBhcmd1bWVudCBpcyBhbiBlbGVtZW50LCB1c2UgaXQgYXMgaXMsIG90aGVyd2lzZSB0cmVhdCBpdCBhcyBhIHRhZ25hbWVcclxuICAgICAgICBlbGVtZW50ID0gY3JlbC5pc0VsZW1lbnQoZWxlbWVudCkgPyBlbGVtZW50IDogZC5jcmVhdGVFbGVtZW50KGVsZW1lbnQpO1xyXG4gICAgICAgIC8vIENoZWNrIGlmIHNlY29uZCBhcmd1bWVudCBpcyBhIHNldHRpbmdzIG9iamVjdC4gU2tpcCBpdCBpZiBpdCdzOlxyXG4gICAgICAgIC8vIC0gbm90IGFuIG9iamVjdCAodGhpcyBpbmNsdWRlcyBgdW5kZWZpbmVkYClcclxuICAgICAgICAvLyAtIGEgTm9kZVxyXG4gICAgICAgIC8vIC0gYW4gYXJyYXlcclxuICAgICAgICBpZiAoISghaXNUeXBlKHNldHRpbmdzLCAnb2JqZWN0JykgfHwgY3JlbFtpc05vZGVTdHJpbmddKHNldHRpbmdzKSB8fCBBcnJheS5pc0FycmF5KHNldHRpbmdzKSkpIHtcclxuICAgICAgICAgICAgLy8gRG9uJ3QgdHJlYXQgc2V0dGluZ3MgYXMgYSBjaGlsZFxyXG4gICAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgICAgICAvLyBHbyB0aHJvdWdoIHNldHRpbmdzIC8gYXR0cmlidXRlcyBvYmplY3QsIGlmIGl0IGV4aXN0c1xyXG4gICAgICAgICAgICBmb3IgKGtleSBpbiBzZXR0aW5ncykge1xyXG4gICAgICAgICAgICAgICAgLy8gU3RvcmUgdGhlIGF0dHJpYnV0ZSBpbnRvIGEgdmFyaWFibGUsIGJlZm9yZSB3ZSBwb3RlbnRpYWxseSBtb2RpZnkgdGhlIGtleVxyXG4gICAgICAgICAgICAgICAgYXR0cmlidXRlID0gc2V0dGluZ3Nba2V5XTtcclxuICAgICAgICAgICAgICAgIC8vIEdldCBtYXBwZWQga2V5IC8gZnVuY3Rpb24sIGlmIG9uZSBleGlzdHNcclxuICAgICAgICAgICAgICAgIGtleSA9IGNyZWwuYXR0ck1hcFtrZXldIHx8IGtleTtcclxuICAgICAgICAgICAgICAgIC8vIE5vdGU6IFdlIHdhbnQgdG8gcHJpb3JpdGlzZSBtYXBwaW5nIG92ZXIgcHJvcGVydGllc1xyXG4gICAgICAgICAgICAgICAgaWYgKGlzVHlwZShrZXksIGZ1bmMpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAga2V5KGVsZW1lbnQsIGF0dHJpYnV0ZSk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGlzVHlwZShhdHRyaWJ1dGUsIGZ1bmMpKSB7IC8vIGV4LiBvbkNsaWNrIHByb3BlcnR5XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFtrZXldID0gYXR0cmlidXRlO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBTZXQgdGhlIGVsZW1lbnQgYXR0cmlidXRlXHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5zZXRBdHRyaWJ1dGUoa2V5LCBhdHRyaWJ1dGUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIExvb3AgdGhyb3VnaCBhbGwgYXJndW1lbnRzLCBpZiBhbnksIGFuZCBhcHBlbmQgdGhlbSB0byBvdXIgZWxlbWVudCBpZiB0aGV5J3JlIG5vdCBgbnVsbGBcclxuICAgICAgICBmb3IgKDsgaW5kZXggPCBhcmdzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgICAgICBhcHBlbmRDaGlsZChlbGVtZW50LCBhcmdzW2luZGV4XSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZWxlbWVudDtcclxuICAgIH1cclxuXHJcbiAgICAvLyBVc2VkIGZvciBtYXBwaW5nIGF0dHJpYnV0ZSBrZXlzIHRvIHN1cHBvcnRlZCB2ZXJzaW9ucyBpbiBiYWQgYnJvd3NlcnMsIG9yIHRvIGN1c3RvbSBmdW5jdGlvbmFsaXR5XHJcbiAgICBjcmVsLmF0dHJNYXAgPSB7fTtcclxuICAgIGNyZWwuaXNFbGVtZW50ID0gaXNFbGVtZW50O1xyXG4gICAgY3JlbFtpc05vZGVTdHJpbmddID0gaXNOb2RlO1xyXG4gICAgLy8gRXhwb3NlIHByb3h5IGludGVyZmFjZVxyXG4gICAgY3JlbC5wcm94eSA9IG5ldyBQcm94eShjcmVsLCB7XHJcbiAgICAgICAgZ2V0OiAodGFyZ2V0LCBrZXkpID0+IHtcclxuICAgICAgICAgICAgIShrZXkgaW4gY3JlbCkgJiYgKGNyZWxba2V5XSA9IGNyZWwuYmluZChudWxsLCBrZXkpKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNyZWxba2V5XTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIC8vIEV4cG9ydCBjcmVsXHJcbiAgICBleHBvcnRlcihjcmVsLCBmdW5jKTtcclxufSkoKHByb2R1Y3QsIGZ1bmMpID0+IHtcclxuICAgIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcclxuICAgICAgICAvLyBFeHBvcnQgZm9yIEJyb3dzZXJpZnkgLyBDb21tb25KUyBmb3JtYXRcclxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IHByb2R1Y3Q7XHJcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IGZ1bmMgJiYgZGVmaW5lLmFtZCkge1xyXG4gICAgICAgIC8vIEV4cG9ydCBmb3IgUmVxdWlyZUpTIC8gQU1EIGZvcm1hdFxyXG4gICAgICAgIGRlZmluZShwcm9kdWN0KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRXhwb3J0IGFzIGEgJ2dsb2JhbCcgZnVuY3Rpb25cclxuICAgICAgICB0aGlzLmNyZWwgPSBwcm9kdWN0O1xyXG4gICAgfVxyXG59KTtcclxuIiwidmFyIGFiYm90dCA9IHJlcXVpcmUoJ2FiYm90dCcpO1xyXG5cclxudmFyIGRlZmVyID0gZ2xvYmFsLnByb2Nlc3MgJiYgZ2xvYmFsLnByb2Nlc3MubmV4dFRpY2sgfHwgZ2xvYmFsLnNldEltbWVkaWF0ZSB8fCBnbG9iYWwuc2V0VGltZW91dDtcclxuXHJcbmZ1bmN0aW9uIGlzUmlnaHRvKHgpe1xyXG4gICAgcmV0dXJuIHR5cGVvZiB4ID09PSAnZnVuY3Rpb24nICYmICh4Ll9fcmVzb2x2ZV9fID09PSB4IHx8IHgucmVzb2x2ZSA9PT0geCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVGhlbmFibGUoeCl7XHJcbiAgICByZXR1cm4geCAmJiB0eXBlb2YgeC50aGVuID09PSAnZnVuY3Rpb24nICYmICFpc1JpZ2h0byh4KTtcclxufVxyXG5cclxuZnVuY3Rpb24gaXNSZXNvbHZhYmxlKHgpe1xyXG4gICAgcmV0dXJuIGlzUmlnaHRvKHgpIHx8IGlzVGhlbmFibGUoeCk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzVGFrZSh4KXtcclxuICAgIHJldHVybiB4ICYmIHR5cGVvZiB4ID09PSAnb2JqZWN0JyAmJiAnX190YWtlX18nIGluIHg7XHJcbn1cclxuXHJcbnZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsLmJpbmQoQXJyYXkucHJvdG90eXBlLnNsaWNlKTtcclxuXHJcbmZ1bmN0aW9uIGdldENhbGxMaW5lKHN0YWNrKXtcclxuICAgIHZhciBpbmRleCA9IDAsXHJcbiAgICAgICAgbGluZXMgPSBzdGFjay5zcGxpdCgnXFxuJyk7XHJcblxyXG4gICAgd2hpbGUobGluZXNbKytpbmRleF0gJiYgbGluZXNbaW5kZXhdLm1hdGNoKC9yaWdodG9cXC9pbmRleFxcLmpzLykpe31cclxuXHJcbiAgICB2YXIgbWF0Y2ggPSBsaW5lc1tpbmRleF0gJiYgbGluZXNbaW5kZXhdLm1hdGNoKC9hdCAoLiopLyk7XHJcblxyXG4gICAgcmV0dXJuIG1hdGNoID8gbWF0Y2hbMV0gOiAnIC0gTm8gdHJhY2UgLSAnO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0YWtlV3JhcChyZXN1bHRzKXtcclxuICAgIHRoaXMucmVzdWx0cyA9IHJlc3VsdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRha2UodGFyZ2V0VGFzayl7XHJcbiAgICB2YXIgZG9uZSA9IHRoaXM7XHJcbiAgICB2YXIga2V5cyA9IHNsaWNlKGFyZ3VtZW50cywgMSk7XHJcbiAgICByZXR1cm4gdGFyZ2V0VGFzayhmdW5jdGlvbihlcnJvcil7XHJcbiAgICAgICAgaWYoZXJyb3Ipe1xyXG4gICAgICAgICAgICByZXR1cm4gZG9uZShlcnJvcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciBhcmdzID0gc2xpY2UoYXJndW1lbnRzLCAxKTtcclxuICAgICAgICBkb25lKGVycm9yLCBuZXcgdGFrZVdyYXAoa2V5cy5tYXAoZnVuY3Rpb24oa2V5KXtcclxuICAgICAgICAgICAgcmV0dXJuIGFyZ3Nba2V5XTtcclxuICAgICAgICB9KSkpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmVEZXBlbmRlbmN5KHRhc2ssIGRvbmUpe1xyXG4gICAgaWYoaXNUaGVuYWJsZSh0YXNrKSl7XHJcbiAgICAgICAgdGFzayA9IHJpZ2h0byhhYmJvdHQodGFzaykpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKGlzUmlnaHRvKHRhc2spKXtcclxuICAgICAgICByZXR1cm4gdGFzayhkb25lKTtcclxuICAgIH1cclxuXHJcbiAgICBpZihpc1Rha2UodGFzaykpe1xyXG4gICAgICAgIHJldHVybiB0YWtlLmFwcGx5KGRvbmUsIHRhc2suX190YWtlX18pO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKFxyXG4gICAgICAgIHJpZ2h0by5fZGVidWcgJiZcclxuICAgICAgICByaWdodG8uX3dhcm5PblVuc3VwcG9ydGVkICYmXHJcbiAgICAgICAgQXJyYXkuaXNBcnJheSh0YXNrKSAmJlxyXG4gICAgICAgIGlzUmlnaHRvKHRhc2tbMF0pICYmXHJcbiAgICAgICAgIWlzUmlnaHRvKHRhc2tbMV0pXHJcbiAgICApe1xyXG5cclxuICAgICAgICBjb25zb2xlLndhcm4oJ1xcdTAwMWJbMzNtUG9zc2libGUgdW5zdXBwb3J0ZWQgdGFrZS9pZ25vcmUgc3ludGF4IGRldGVjdGVkOlxcdTAwMWJbMzltXFxuJyArIGdldENhbGxMaW5lKHRoaXMuX3N0YWNrKSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGRvbmUobnVsbCwgdGFzayk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRyYWNlR2V0KGluc3RhbmNlLCByZXN1bHQpe1xyXG4gICAgaWYocmlnaHRvLl9kZWJ1ZyAmJiAhKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnIHx8IHR5cGVvZiByZXN1bHQgPT09ICdmdW5jdGlvbicpKXtcclxuICAgICAgICB2YXIgbGluZSA9IGdldENhbGxMaW5lKGluc3RhbmNlLl9zdGFjayk7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdSZXN1bHQgb2YgcmlnaHRvIHdhcyBub3QgYW4gaW5zdGFuY2UgYXQ6IFxcbicgKyBsaW5lKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0KGZuKXtcclxuICAgIHZhciBpbnN0YW5jZSA9IHRoaXM7XHJcbiAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKHJlc3VsdCwgZm4sIGRvbmUpe1xyXG4gICAgICAgIGlmKHR5cGVvZiBmbiA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGZuID09PSAnbnVtYmVyJyl7XHJcbiAgICAgICAgICAgIHRyYWNlR2V0KGluc3RhbmNlLCByZXN1bHQpO1xyXG4gICAgICAgICAgICByZXR1cm4gZG9uZShudWxsLCByZXN1bHRbZm5dKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJpZ2h0by5mcm9tKGZuKHJlc3VsdCkpKGRvbmUpO1xyXG4gICAgfSwgdGhpcywgZm4pO1xyXG59XHJcblxyXG52YXIgbm9PcCA9IGZ1bmN0aW9uKCl7fTtcclxuXHJcbmZ1bmN0aW9uIHByb3h5KGluc3RhbmNlKXtcclxuICAgIGluc3RhbmNlLl8gPSBuZXcgUHJveHkoaW5zdGFuY2UsIHtcclxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKHRhcmdldCwga2V5KXtcclxuICAgICAgICAgICAgaWYoa2V5ID09PSAnX19yZXNvbHZlX18nKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBpbnN0YW5jZS5fO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZihpbnN0YW5jZVtrZXldIHx8IGtleSBpbiBpbnN0YW5jZSB8fCBrZXkgPT09ICdpbnNwZWN0JyB8fCB0eXBlb2Yga2V5ID09PSAnc3ltYm9sJyl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaW5zdGFuY2Vba2V5XTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYocmlnaHRvLl9kZWJ1ZyAmJiBrZXkuY2hhckF0KDApID09PSAnXycpe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlW2tleV07XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiBwcm94eShyaWdodG8uc3luYyhmdW5jdGlvbihyZXN1bHQpe1xyXG4gICAgICAgICAgICAgICAgdHJhY2VHZXQoaW5zdGFuY2UsIHJlc3VsdCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzdWx0W2tleV07XHJcbiAgICAgICAgICAgIH0sIGluc3RhbmNlKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICBpbnN0YW5jZS5fX3Jlc29sdmVfXyA9IGluc3RhbmNlLl87XHJcbiAgICByZXR1cm4gaW5zdGFuY2UuXztcclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlSXRlcmF0b3IoZm4pe1xyXG4gICAgdmFyIG91dGVyQXJncyA9IHNsaWNlKGFyZ3VtZW50cywgMSk7XHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBvdXRlckFyZ3MuY29uY2F0KHNsaWNlKGFyZ3VtZW50cykpLFxyXG4gICAgICAgICAgICBjYWxsYmFjayA9IGFyZ3MucG9wKCksXHJcbiAgICAgICAgICAgIGVycm9yZWQsXHJcbiAgICAgICAgICAgIGxhc3RWYWx1ZTtcclxuXHJcbiAgICAgICAgdmFyIGdlbmVyYXRvciA9IGZuLmFwcGx5KG51bGwsIGFyZ3MpO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiBydW4oKXtcclxuICAgICAgICAgICAgaWYoZXJyb3JlZCl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIG5leHQgPSBnZW5lcmF0b3IubmV4dChsYXN0VmFsdWUpO1xyXG4gICAgICAgICAgICBpZihuZXh0LmRvbmUpe1xyXG4gICAgICAgICAgICAgICAgaWYoZXJyb3JlZCl7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5mcm9tKG5leHQudmFsdWUpKGNhbGxiYWNrKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZihpc1Jlc29sdmFibGUobmV4dC52YWx1ZSkpe1xyXG4gICAgICAgICAgICAgICAgcmlnaHRvLnN5bmMoZnVuY3Rpb24odmFsdWUpe1xyXG4gICAgICAgICAgICAgICAgICAgIGxhc3RWYWx1ZSA9IHZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgIHJ1bigpO1xyXG4gICAgICAgICAgICAgICAgfSwgbmV4dC52YWx1ZSkoZnVuY3Rpb24oZXJyb3Ipe1xyXG4gICAgICAgICAgICAgICAgICAgIGlmKGVycm9yKXtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGxhc3RWYWx1ZSA9IG5leHQudmFsdWU7XHJcbiAgICAgICAgICAgIHJ1bigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcnVuKCk7XHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZGRUcmFjaW5nKHJlc29sdmUsIGZuLCBhcmdzKXtcclxuXHJcbiAgICB2YXIgYXJnTWF0Y2ggPSBmbi50b1N0cmluZygpLm1hdGNoKC9eW1xcd1xcc10qP1xcKCgoPzpcXHcrWyxcXHNdKj8pKilcXCkvKSxcclxuICAgICAgICBhcmdOYW1lcyA9IGFyZ01hdGNoID8gYXJnTWF0Y2hbMV0uc3BsaXQoL1ssXFxzXSsvZykgOiBbXTtcclxuXHJcbiAgICByZXNvbHZlLl9zdGFjayA9IG5ldyBFcnJvcigpLnN0YWNrO1xyXG4gICAgcmVzb2x2ZS5fdHJhY2UgPSBmdW5jdGlvbih0YWJzKXtcclxuICAgICAgICB2YXIgZmlyc3RMaW5lID0gZ2V0Q2FsbExpbmUocmVzb2x2ZS5fc3RhY2spO1xyXG5cclxuICAgICAgICBpZihyZXNvbHZlLl9lcnJvcil7XHJcbiAgICAgICAgICAgIGZpcnN0TGluZSA9ICdcXHUwMDFiWzMxbScgKyBmaXJzdExpbmUgKyAnIDwtIEVSUk9SIFNPVVJDRScgKyAgJ1xcdTAwMWJbMzltJztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRhYnMgPSB0YWJzIHx8IDA7XHJcbiAgICAgICAgdmFyIHNwYWNpbmcgPSAnICAgICc7XHJcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IHRhYnM7IGkgKyspe1xyXG4gICAgICAgICAgICBzcGFjaW5nID0gc3BhY2luZyArICcgICAgJztcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGFyZ3MubWFwKGZ1bmN0aW9uKGFyZywgaW5kZXgpe1xyXG4gICAgICAgICAgICByZXR1cm4gW2FyZywgYXJnTmFtZXNbaW5kZXhdIHx8IGluZGV4XTtcclxuICAgICAgICB9KS5yZWR1Y2UoZnVuY3Rpb24ocmVzdWx0cywgYXJnSW5mbyl7XHJcbiAgICAgICAgICAgIHZhciBhcmcgPSBhcmdJbmZvWzBdLFxyXG4gICAgICAgICAgICAgICAgYXJnTmFtZSA9IGFyZ0luZm9bMV07XHJcblxyXG4gICAgICAgICAgICBpZihpc1Rha2UoYXJnKSl7XHJcbiAgICAgICAgICAgICAgICBhcmcgPSBhcmcuX190YWtlX19bMF07XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmKGlzUmlnaHRvKGFyZykpe1xyXG4gICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBzcGFjaW5nICsgJy0gYXJndW1lbnQgXCInICsgYXJnTmFtZSArICdcIiBmcm9tICc7XHJcblxyXG5cclxuICAgICAgICAgICAgICAgIGlmKCFhcmcuX3RyYWNlKXtcclxuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZSArICdUcmFjaW5nIHdhcyBub3QgZW5hYmxlZCBmb3IgdGhpcyByaWdodG8gaW5zdGFuY2UuJztcclxuICAgICAgICAgICAgICAgIH1lbHNle1xyXG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5lICsgYXJnLl90cmFjZSh0YWJzICsgMSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXN1bHRzLnB1c2gobGluZSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xyXG4gICAgICAgIH0sIFtmaXJzdExpbmVdKVxyXG4gICAgICAgIC5qb2luKCdcXG4nKTtcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRhc2tDb21wbGV0ZShlcnJvcil7XHJcbiAgICB2YXIgZG9uZSA9IHRoaXNbMF0sXHJcbiAgICAgICAgY29udGV4dCA9IHRoaXNbMV0sXHJcbiAgICAgICAgY2FsbGJhY2tzID0gY29udGV4dC5jYWxsYmFja3M7XHJcblxyXG4gICAgaWYoZXJyb3IgJiYgcmlnaHRvLl9kZWJ1Zyl7XHJcbiAgICAgICAgY29udGV4dC5yZXNvbHZlLl9lcnJvciA9IGVycm9yO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciByZXN1bHRzID0gYXJndW1lbnRzO1xyXG5cclxuICAgIGRvbmUocmVzdWx0cyk7XHJcblxyXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgZGVmZXIoY2FsbGJhY2tzW2ldLmFwcGx5LmJpbmQoY2FsbGJhY2tzW2ldLCBudWxsLCByZXN1bHRzKSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGVycm9yT3V0KGVycm9yLCBjYWxsYmFjayl7XHJcbiAgICBpZihlcnJvciAmJiByaWdodG8uX2RlYnVnKXtcclxuICAgICAgICBpZihyaWdodG8uX2F1dG90cmFjZU9uRXJyb3IgfHwgdGhpcy5yZXNvbHZlLl90cmFjZU9uRXJyb3Ipe1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRGVwZW5kZW5jeSBlcnJvciBleGVjdXRpbmcgJyArIHRoaXMuZm4ubmFtZSArICcgJyArIHRoaXMucmVzb2x2ZS5fdHJhY2UoKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNhbGxiYWNrKGVycm9yKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVidWdSZXNvbHZlKGNvbnRleHQsIGFyZ3MsIGNvbXBsZXRlKXtcclxuICAgIHRyeXtcclxuICAgICAgICBhcmdzLnB1c2goY29tcGxldGUpO1xyXG4gICAgICAgIGNvbnRleHQuZm4uYXBwbHkobnVsbCwgYXJncyk7XHJcbiAgICB9Y2F0Y2goZXJyb3Ipe1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdUYXNrIGV4Y2VwdGlvbiBleGVjdXRpbmcgJyArIGNvbnRleHQuZm4ubmFtZSArICcgZnJvbSAnICsgY29udGV4dC5yZXNvbHZlLl90cmFjZSgpKTtcclxuICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzb2x2ZVdpdGhEZXBlbmRlbmNpZXMoZG9uZSwgZXJyb3IsIGFyZ1Jlc3VsdHMpe1xyXG4gICAgdmFyIGNvbnRleHQgPSB0aGlzO1xyXG5cclxuICAgIGlmKGVycm9yKXtcclxuICAgICAgICB2YXIgYm91bmRFcnJvck91dCA9IGVycm9yT3V0LmJpbmQoY29udGV4dCwgZXJyb3IpO1xyXG5cclxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY29udGV4dC5jYWxsYmFja3MubGVuZ3RoOyBpKyspe1xyXG4gICAgICAgICAgICBib3VuZEVycm9yT3V0KGNvbnRleHQuY2FsbGJhY2tzW2ldKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgYXJncyA9IGFyZ1Jlc3VsdHMucmVkdWNlKChyZXN1bHRzLCBuZXh0KSA9PiB7XHJcbiAgICAgICAgICAgIGlmKG5leHQgJiYgbmV4dCBpbnN0YW5jZW9mIHRha2VXcmFwKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRzLmNvbmNhdChuZXh0LnJlc3VsdHMpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXN1bHRzLnB1c2gobmV4dCk7XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xyXG4gICAgICAgIH0sIFtdKSAsXHJcbiAgICAgICAgY29tcGxldGUgPSB0YXNrQ29tcGxldGUuYmluZChbZG9uZSwgY29udGV4dF0pO1xyXG5cclxuICAgIGlmKHJpZ2h0by5fZGVidWcpe1xyXG4gICAgICAgIHJldHVybiBkZWJ1Z1Jlc29sdmUoY29udGV4dCwgYXJncywgY29tcGxldGUpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFNsaWdodCBwZXJmIGJ1bXAgYnkgYXZvaWRpbmcgYXBwbHkgZm9yIHNpbXBsZSBjYXNlcy5cclxuICAgIHN3aXRjaChhcmdzLmxlbmd0aCl7XHJcbiAgICAgICAgY2FzZSAwOiBjb250ZXh0LmZuKGNvbXBsZXRlKTsgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAxOiBjb250ZXh0LmZuKGFyZ3NbMF0sIGNvbXBsZXRlKTsgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAyOiBjb250ZXh0LmZuKGFyZ3NbMF0sIGFyZ3NbMV0sIGNvbXBsZXRlKTsgYnJlYWs7XHJcbiAgICAgICAgY2FzZSAzOiBjb250ZXh0LmZuKGFyZ3NbMF0sIGFyZ3NbMV0sIGFyZ3NbMl0sIGNvbXBsZXRlKTsgYnJlYWs7XHJcbiAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgYXJncy5wdXNoKGNvbXBsZXRlKTtcclxuICAgICAgICAgICAgY29udGV4dC5mbi5hcHBseShudWxsLCBhcmdzKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcmVzb2x2ZURlcGVuZGVuY2llcyhhcmdzLCBjb21wbGV0ZSwgcmVzb2x2ZURlcGVuZGVuY3kpe1xyXG4gICAgdmFyIHJlc3VsdHMgPSBbXSxcclxuICAgICAgICBkb25lID0gMCxcclxuICAgICAgICBoYXNFcnJvcmVkO1xyXG5cclxuICAgIGlmKCFhcmdzLmxlbmd0aCl7XHJcbiAgICAgICAgY29tcGxldGUobnVsbCwgW10pO1xyXG4gICAgfVxyXG5cclxuICAgIGZ1bmN0aW9uIGRlcGVuZGVuY3lSZXNvbHZlZChpbmRleCwgZXJyb3IsIHJlc3VsdCl7XHJcbiAgICAgICAgaWYoaGFzRXJyb3JlZCl7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmKGVycm9yKXtcclxuICAgICAgICAgICAgaGFzRXJyb3JlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybiBjb21wbGV0ZShlcnJvcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXN1bHRzW2luZGV4XSA9IHJlc3VsdDtcclxuXHJcbiAgICAgICAgaWYoKytkb25lID09PSBhcmdzLmxlbmd0aCl7XHJcbiAgICAgICAgICAgIGNvbXBsZXRlKG51bGwsIHJlc3VsdHMpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKyl7XHJcbiAgICAgICAgaWYoIWlzUmVzb2x2YWJsZShhcmdzW2ldKSAmJiAhaXNUYWtlKGFyZ3NbaV0pKXtcclxuICAgICAgICAgICAgZGVwZW5kZW5jeVJlc29sdmVkKGksIG51bGwsIGFyZ3NbaV0pO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmVzb2x2ZURlcGVuZGVuY3koYXJnc1tpXSwgZGVwZW5kZW5jeVJlc29sdmVkLmJpbmQobnVsbCwgaSkpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiByZXNvbHZlcihjb21wbGV0ZSl7XHJcbiAgICB2YXIgY29udGV4dCA9IHRoaXM7XHJcblxyXG4gICAgLy8gTm8gY2FsbGJhY2s/IEp1c3QgcnVuIHRoZSB0YXNrLlxyXG4gICAgaWYoIWFyZ3VtZW50cy5sZW5ndGgpe1xyXG4gICAgICAgIGNvbXBsZXRlID0gbm9PcDtcclxuICAgIH1cclxuXHJcbiAgICBpZihpc1JpZ2h0byhjb21wbGV0ZSkpe1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcigncmlnaHRvIGluc3RhbmNlIHBhc3NlZCBpbnRvIGEgcmlnaHRvIGluc3RhbmNlIGluc3RlYWQgb2YgYSBjYWxsYmFjaycpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKHR5cGVvZiBjb21wbGV0ZSAhPT0gJ2Z1bmN0aW9uJyl7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcclxuICAgIH1cclxuXHJcbiAgICBpZihjb250ZXh0LnJlc3VsdHMpe1xyXG4gICAgICAgIHJldHVybiBjb21wbGV0ZS5hcHBseShudWxsLCBjb250ZXh0LnJlc3VsdHMpO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnRleHQuY2FsbGJhY2tzLnB1c2goY29tcGxldGUpO1xyXG5cclxuICAgIGlmKGNvbnRleHQuc3RhcnRlZCsrKXtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHJlc29sdmVkID0gcmVzb2x2ZVdpdGhEZXBlbmRlbmNpZXMuYmluZChjb250ZXh0LCBmdW5jdGlvbihyZXNvbHZlZFJlc3VsdHMpe1xyXG4gICAgICAgICAgICBpZihyaWdodG8uX2RlYnVnKXtcclxuICAgICAgICAgICAgICAgIGlmKHJpZ2h0by5fYXV0b3RyYWNlIHx8IGNvbnRleHQucmVzb2x2ZS5fdHJhY2VPbkV4ZWN1dGUpe1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdFeGVjdXRpbmcgJyArIGNvbnRleHQuZm4ubmFtZSArICcgJyArIGNvbnRleHQucmVzb2x2ZS5fdHJhY2UoKSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnRleHQucmVzdWx0cyA9IHJlc29sdmVkUmVzdWx0cztcclxuICAgICAgICB9KTtcclxuXHJcbiAgICBkZWZlcihyZXNvbHZlRGVwZW5kZW5jaWVzLmJpbmQobnVsbCwgY29udGV4dC5hcmdzLCByZXNvbHZlZCwgcmVzb2x2ZURlcGVuZGVuY3kuYmluZChjb250ZXh0LnJlc29sdmUpKSk7XHJcblxyXG4gICAgcmV0dXJuIGNvbnRleHQucmVzb2x2ZTtcclxufTtcclxuXHJcbmZ1bmN0aW9uIHJpZ2h0bygpe1xyXG4gICAgdmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMpLFxyXG4gICAgICAgIGZuID0gYXJncy5zaGlmdCgpO1xyXG5cclxuICAgIGlmKHR5cGVvZiBmbiAhPT0gJ2Z1bmN0aW9uJyl7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyB0YXNrIGZ1bmN0aW9uIHBhc3NlZCB0byByaWdodG8nKTtcclxuICAgIH1cclxuXHJcbiAgICBpZihpc1JpZ2h0byhmbikgJiYgYXJncy5sZW5ndGggPiAwKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JpZ2h0byB0YXNrIHBhc3NlZCBhcyB0YXJnZXQgdGFzayB0byByaWdodG8oKScpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciByZXNvbHZlckNvbnRleHQgPSB7XHJcbiAgICAgICAgICAgIGZuOiBmbixcclxuICAgICAgICAgICAgY2FsbGJhY2tzOiBbXSxcclxuICAgICAgICAgICAgYXJnczogYXJncyxcclxuICAgICAgICAgICAgc3RhcnRlZDogMFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcmVzb2x2ZSA9IHJlc29sdmVyLmJpbmQocmVzb2x2ZXJDb250ZXh0KTtcclxuICAgIHJlc29sdmUuZ2V0ID0gZ2V0LmJpbmQocmVzb2x2ZSk7XHJcbiAgICByZXNvbHZlckNvbnRleHQucmVzb2x2ZSA9IHJlc29sdmU7XHJcbiAgICByZXNvbHZlLnJlc29sdmUgPSByZXNvbHZlO1xyXG5cclxuICAgIGlmKHJpZ2h0by5fZGVidWcpe1xyXG4gICAgICAgIGFkZFRyYWNpbmcocmVzb2x2ZSwgZm4sIGFyZ3MpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXNvbHZlO1xyXG59XHJcblxyXG5yaWdodG8uc3luYyA9IGZ1bmN0aW9uKGZuKXtcclxuICAgIHJldHVybiByaWdodG8uYXBwbHkobnVsbCwgW2Z1bmN0aW9uKCl7XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBzbGljZShhcmd1bWVudHMpLFxyXG4gICAgICAgICAgICBkb25lID0gYXJncy5wb3AoKSxcclxuICAgICAgICAgICAgcmVzdWx0ID0gZm4uYXBwbHkobnVsbCwgYXJncyk7XHJcblxyXG4gICAgICAgIGlmKGlzUmVzb2x2YWJsZShyZXN1bHQpKXtcclxuICAgICAgICAgICAgcmV0dXJuIHJpZ2h0by5mcm9tKHJlc3VsdCkoZG9uZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBkb25lKG51bGwsIHJlc3VsdCk7XHJcbiAgICB9XS5jb25jYXQoc2xpY2UoYXJndW1lbnRzLCAxKSkpO1xyXG59O1xyXG5cclxucmlnaHRvLmFsbCA9IGZ1bmN0aW9uKHZhbHVlKXtcclxuICAgIHZhciB0YXNrID0gdmFsdWU7XHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID4gMSl7XHJcbiAgICAgICAgdGFzayA9IHNsaWNlKGFyZ3VtZW50cyk7XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gcmVzb2x2ZSh0YXNrcyl7XHJcbiAgICAgICAgcmV0dXJuIHJpZ2h0by5hcHBseShudWxsLCBbZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgYXJndW1lbnRzW2FyZ3VtZW50cy5sZW5ndGggLSAxXShudWxsLCBzbGljZShhcmd1bWVudHMsIDAsIC0xKSk7XHJcbiAgICAgICAgfV0uY29uY2F0KHRhc2tzKSk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYoaXNSaWdodG8odGFzaykpe1xyXG4gICAgICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24odGFza3MsIGRvbmUpe1xyXG4gICAgICAgICAgICByZXNvbHZlKHRhc2tzKShkb25lKTtcclxuICAgICAgICB9LCB0YXNrKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVzb2x2ZSh0YXNrKTtcclxufTtcclxuXHJcbnJpZ2h0by5yZWR1Y2UgPSBmdW5jdGlvbih2YWx1ZXMsIHJlZHVjZXIsIHNlZWQpe1xyXG4gICAgdmFyIGhhc1NlZWQgPSBhcmd1bWVudHMubGVuZ3RoID49IDM7XHJcblxyXG4gICAgaWYoIXJlZHVjZXIpe1xyXG4gICAgICAgIHJlZHVjZXIgPSBmdW5jdGlvbihwcmV2aW91cywgbmV4dCl7XHJcbiAgICAgICAgICAgIHJldHVybiByaWdodG8obmV4dCk7XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmlnaHRvLmZyb20odmFsdWVzKS5nZXQoZnVuY3Rpb24odmFsdWVzKXtcclxuICAgICAgICBpZighdmFsdWVzIHx8ICF2YWx1ZXMucmVkdWNlKXtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd2YWx1ZXMgd2FzIG5vdCBhIHJlZHVjZWFibGUgb2JqZWN0IChsaWtlIGFuIGFycmF5KScpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdmFsdWVzID0gdmFsdWVzLnNsaWNlKCk7XHJcblxyXG4gICAgICAgIGlmKCFoYXNTZWVkKXtcclxuICAgICAgICAgICAgc2VlZCA9IHZhbHVlcy5zaGlmdCgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYoIXZhbHVlcy5sZW5ndGgpe1xyXG4gICAgICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20oc2VlZCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdmFsdWVzLnJlZHVjZShmdW5jdGlvbihwcmV2aW91cywgbmV4dCl7XHJcbiAgICAgICAgICAgIHJldHVybiByaWdodG8uc3luYyhyZWR1Y2VyLCBwcmV2aW91cywgcmlnaHRvLnZhbHVlKG5leHQpKTtcclxuICAgICAgICB9LCBzZWVkKTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxucmlnaHRvLmZyb20gPSBmdW5jdGlvbih2YWx1ZSl7XHJcbiAgICBpZihhcmd1bWVudHMubGVuZ3RoID4gMSl7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyaWdodG8uZnJvbSBjYWxsZWQgd2l0aCBtb3JlIHRoYW4gb25lIGFyZ3VtZW50LiBSaWdodG8gdjQgbm8gbG9uZ2VyIHN1cHBvcnRzIGNvbnN0cnVjdGluZyBldmVudHVhbHMgdmlhIGBmcm9tYCwgdXNlIGBzeW5jYCBpbnN0ZWFkLicpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmKGlzUmlnaHRvKHZhbHVlKSl7XHJcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByaWdodG8uc3luYyhmdW5jdGlvbihyZXNvbHZlZCl7XHJcbiAgICAgICAgcmV0dXJuIHJlc29sdmVkO1xyXG4gICAgfSwgdmFsdWUpO1xyXG59O1xyXG5cclxucmlnaHRvLm1hdGUgPSBmdW5jdGlvbigpe1xyXG4gICAgcmV0dXJuIHJpZ2h0by5hcHBseShudWxsLCBbZnVuY3Rpb24oKXtcclxuICAgICAgICBhcmd1bWVudHNbYXJndW1lbnRzLmxlbmd0aCAtMV0uYXBwbHkobnVsbCwgW251bGxdLmNvbmNhdChzbGljZShhcmd1bWVudHMsIDAsIC0xKSkpO1xyXG4gICAgfV0uY29uY2F0KHNsaWNlKGFyZ3VtZW50cykpKTtcclxufTtcclxuXHJcbnJpZ2h0by50YWtlID0gZnVuY3Rpb24odGFzayl7XHJcbiAgICBpZighaXNSZXNvbHZhYmxlKHRhc2spKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Rhc2sgd2FzIG5vdCBhIHJlc29sdmFibGUgdmFsdWUnKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge19fdGFrZV9fOiBzbGljZShhcmd1bWVudHMpfTtcclxufTtcclxuXHJcbnJpZ2h0by5hZnRlciA9IGZ1bmN0aW9uKHRhc2spe1xyXG4gICAgaWYoIWlzUmVzb2x2YWJsZSh0YXNrKSl7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0YXNrIHdhcyBub3QgYSByZXNvbHZhYmxlIHZhbHVlJyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSl7XHJcbiAgICAgICAgcmV0dXJuIHtfX3Rha2VfXzogW3Rhc2tdfTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge19fdGFrZV9fOiBbcmlnaHRvLm1hdGUuYXBwbHkobnVsbCwgYXJndW1lbnRzKV19O1xyXG59O1xyXG5cclxucmlnaHRvLnJlc29sdmUgPSBmdW5jdGlvbihvYmplY3QsIGRlZXApe1xyXG4gICAgaWYoaXNSaWdodG8ob2JqZWN0KSl7XHJcbiAgICAgICAgcmV0dXJuIHJpZ2h0by5zeW5jKGZ1bmN0aW9uKG9iamVjdCl7XHJcbiAgICAgICAgICAgIHJldHVybiByaWdodG8ucmVzb2x2ZShvYmplY3QsIGRlZXApO1xyXG4gICAgICAgIH0sIG9iamVjdCk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYoIW9iamVjdCB8fCAhKHR5cGVvZiBvYmplY3QgPT09ICdvYmplY3QnIHx8IHR5cGVvZiBvYmplY3QgPT09ICdmdW5jdGlvbicpKXtcclxuICAgICAgICByZXR1cm4gcmlnaHRvLmZyb20ob2JqZWN0KTtcclxuICAgIH1cclxuXHJcbiAgICB2YXIgcGFpcnMgPSByaWdodG8uYWxsKE9iamVjdC5rZXlzKG9iamVjdCkubWFwKGZ1bmN0aW9uKGtleSl7XHJcbiAgICAgICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbih2YWx1ZSwgZG9uZSl7XHJcbiAgICAgICAgICAgIGlmKGRlZXApe1xyXG4gICAgICAgICAgICAgICAgcmlnaHRvLnN5bmMoZnVuY3Rpb24odmFsdWUpe1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBba2V5LCB2YWx1ZV07XHJcbiAgICAgICAgICAgICAgICB9LCByaWdodG8ucmVzb2x2ZSh2YWx1ZSwgdHJ1ZSkpKGRvbmUpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGRvbmUobnVsbCwgW2tleSwgdmFsdWVdKTtcclxuICAgICAgICB9LCBvYmplY3Rba2V5XSk7XHJcbiAgICB9KSk7XHJcblxyXG4gICAgcmV0dXJuIHJpZ2h0by5zeW5jKGZ1bmN0aW9uKHBhaXJzKXtcclxuICAgICAgICByZXR1cm4gcGFpcnMucmVkdWNlKGZ1bmN0aW9uKHJlc3VsdCwgcGFpcil7XHJcbiAgICAgICAgICAgIHJlc3VsdFtwYWlyWzBdXSA9IHBhaXJbMV07XHJcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICAgICAgfSwgQXJyYXkuaXNBcnJheShvYmplY3QpID8gW10gOiB7fSk7XHJcbiAgICB9LCBwYWlycyk7XHJcbn07XHJcblxyXG5yaWdodG8uaXRlcmF0ZSA9IGNyZWF0ZUl0ZXJhdG9yO1xyXG5cclxucmlnaHRvLnZhbHVlID0gZnVuY3Rpb24oKXtcclxuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xyXG4gICAgcmV0dXJuIHJpZ2h0byhmdW5jdGlvbihkb25lKXtcclxuICAgICAgICBkb25lLmFwcGx5KG51bGwsIFtudWxsXS5jb25jYXQoc2xpY2UoYXJncykpKTtcclxuICAgIH0pO1xyXG59O1xyXG5cclxucmlnaHRvLnN1cmVseSA9IGZ1bmN0aW9uKHRhc2spe1xyXG4gICAgaWYoIWlzUmVzb2x2YWJsZSh0YXNrKSl7XHJcbiAgICAgICAgdGFzayA9IHJpZ2h0by5hcHBseShudWxsLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24oZG9uZSl7XHJcbiAgICAgICAgdGFzayhmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICBkb25lKG51bGwsIHNsaWNlKGFyZ3VtZW50cykpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5yaWdodG8uaGFuZGxlID0gZnVuY3Rpb24odGFzaywgaGFuZGxlcil7XHJcbiAgICByZXR1cm4gcmlnaHRvKGZ1bmN0aW9uKGhhbmRsZXIsIGRvbmUpe1xyXG4gICAgICAgIHRhc2soZnVuY3Rpb24oZXJyb3Ipe1xyXG4gICAgICAgICAgICBpZighZXJyb3Ipe1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2soZG9uZSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGhhbmRsZXIoZXJyb3IsIGRvbmUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSwgaGFuZGxlcik7XHJcbn07XHJcblxyXG5yaWdodG8uZmFpbCA9IGZ1bmN0aW9uKGVycm9yKXtcclxuICAgIHJldHVybiByaWdodG8oZnVuY3Rpb24oZXJyb3IsIGRvbmUpe1xyXG4gICAgICAgIGRvbmUoZXJyb3IpO1xyXG4gICAgfSwgZXJyb3IpO1xyXG59O1xyXG5cclxucmlnaHRvLmZvcmsgPSBmdW5jdGlvbih2YWx1ZSl7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KXtcclxuICAgICAgICByaWdodG8uZnJvbSh2YWx1ZSkoZnVuY3Rpb24oZXJyb3IsIHJlc3VsdCl7XHJcbiAgICAgICAgICAgIGlmKGVycm9yKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXNvbHZlKHJlc3VsdCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG59O1xyXG5cclxucmlnaHRvLmlzUmlnaHRvID0gaXNSaWdodG87XHJcbnJpZ2h0by5pc1RoZW5hYmxlID0gaXNUaGVuYWJsZTtcclxucmlnaHRvLmlzUmVzb2x2YWJsZSA9IGlzUmVzb2x2YWJsZTtcclxuXHJcbnJpZ2h0by5wcm94eSA9IGZ1bmN0aW9uKCl7XHJcbiAgICBpZih0eXBlb2YgUHJveHkgPT09ICd1bmRlZmluZWQnKXtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgZW52aXJvbm1lbnQgZG9lcyBub3Qgc3VwcG9ydCBQcm94eVxcJ3MnKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcHJveHkocmlnaHRvLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykpO1xyXG59O1xyXG5cclxuZm9yKHZhciBrZXkgaW4gcmlnaHRvKXtcclxuICAgIHJpZ2h0by5wcm94eVtrZXldID0gcmlnaHRvW2tleV07XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gcmlnaHRvOyJdfQ==

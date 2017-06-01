// This will shim the XHR object in your window and add some custom functionnality on top in the Shaper object

var BaseXHR = require('./base-xhr');
var Shaper = require('./shaper');
var objectMirrors = require('./object-mirrors');

var WindowXHR = window.XMLHttpRequest;

var XMLHttpRequestShim = function() {
    var xhr = new WindowXHR();
    var shaper = new Shaper();
    var _onreadystatechange, 
        _onprogress, 
        _onloadend;

    var openedTs, headersTs, loadingTs, doneTs;
    var loaded = 0, total;
    var currentBitrateKpbs;
    var progressEvents = [];
    var progressTimer;
    var lastProgressEvent = false;
    var loadEndEvent;
    var loadEvent;
    var done = false;

    xhr.onloadend = function(event) {
        loadEndEvent = event;
        if (done && _onloadend) {
            _onloadend(event);
        }
    };

    xhr.onload = function(event) {
        loadEvent = event;
        if (done && _onload && xhr.readyState === 4) {
            _onload(event);
        }
    };

    xhr.onreadystatechange = function(event) {

        function triggerStateChange(e) {
            if (_onreadystatechange) {
                _onreadystatechange(e);
            }
        }

        switch (xhr.readyState) {
            case 0: // UNSENT
                triggerStateChange(event);
                break;
            case 1: // OPENED
                openedTs = Date.now();
                triggerStateChange(event);
                break;
            case 2: // HEADERS_RECEIVE
                headersTs = Date.now();
                triggerStateChange(event);
                break;
            case 3: // LOADING
                loadingTs = Date.now();
                triggerStateChange(event);
                break;
            case 4: // DONE
                var delay1 = 0, delay2 = 0;
                doneTs = Date.now();
                var latency = doneTs - openedTs;
                if (latency < shaper.minLatency) {
                    delay1 = shaper.minLatency - latency;
                }
                if (currentBitrateKpbs > shaper.maxBandwidth) {
                    delay2 = (currentBitrateKpbs / shaper.maxBandwidth) * latency - latency;
                }
                if (delay1 || delay2) {
                    setTimeout(function() {

                        if (loaded === total && !lastProgressEvent) {
                            clearTimeout(progressTimer);
                            _onprogress(progressEvents[progressEvents.length - 1]);
                        }

                        triggerStateChange(event);

                        done = true;

                        if (loadEvent && _onload) {
                            _onload(loadEvent);
                            loadEvent = null;
                        }

                        if (loadEndEvent && _onloadend) {
                            _onloadend(loadEndEvent);
                            loadEndEvent = null;
                        }

                    }, Math.max(delay1, delay2));
                } else {
                    console.log('not delaying');
                    done = true;
                    triggerStateChange(event);
                }
                break;
        }
    };

    xhr.onprogress = function(event) {

        function triggerProgress(e) {

            if (loaded === total) {
                lastProgressEvent = true;
            }

            if (_onprogress) {
                _onprogress(e);
            }
        }

        var now = Date.now();
        var duration = now - openedTs;
        var delay;

        loaded = event.loaded;
        total = event.total;
        currentBitrateKpbs = 8 * loaded / duration; // kbps

        // console.log('current bitrate: ' + Math.round(currentBitrateKpbs) + ' kbps');

        if (currentBitrateKpbs > shaper.maxBandwidth) {
            delay = (currentBitrateKpbs / shaper.maxBandwidth) * duration - duration;
            progressEvents.push(event);
            // console.log('delaying progress event by ' + Math.round(delay) + ' ms');
            progressTimer = setTimeout(function() {
                triggerProgress(event);
            }, delay);
            return;
        }

        triggerProgress(event);
    };

    var instance = new BaseXHR(xhr);

    // we need to override these with a custom setter hook
    objectMirrors.mirrorRwProp(instance, xhr, "onreadystatechange", function(val) {
        _onreadystatechange = val;
        return {override: true};
    });
    objectMirrors.mirrorRwProp(instance, xhr, "onprogress", function(val) {
        _onprogress = val;
        return {override: true};
    });
    objectMirrors.mirrorRwProp(instance, xhr, "onloadend", function(val) {
        _onloadend = val;
        return {override: true};
    });
    objectMirrors.mirrorRwProp(instance, xhr, "onload", function(val) {
        _onload = val;
        return {override: true};
    });

    instance.shaper = shaper;

    var id = Math.round(Math.random() * 1e6);

    console.log('id:', id);

    xhr.id = id;
    instance.id = id;
    instance.innerXhr = xhr;

    return instance;
};

XMLHttpRequestShim.Shaper = Shaper;

module.exports = XMLHttpRequestShim;
function BufferLoader(context, urlList, callback) {
  this.context = context;
  this.urlList = urlList;
  this.onload = callback;
  this.bufferList = [];
  this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function(url, index) {
    // Load buffer asynchronously
    var request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";

    var loader = this;

    request.onload = function () {
        // Asynchronously decode the audio file data in request.response
        loader.context.decodeAudioData(
            request.response,
            function (buffer) {
                if (!buffer) {
                    alert('error decoding file data: ' + url);
                    return;
                }
                loader.bufferList[index] = buffer;
                if (++loader.loadCount == loader.urlList.length)
                    loader.onload(loader.bufferList);
            },
            function (error) {
                console.error('decodeAudioData error', error);
            }
        );
    };

    request.onerror = function () {
        alert('BufferLoader: XHR error');
    };

    request.send();
};

BufferLoader.prototype.load = function() {
  for (var i = 0; i < this.urlList.length; ++i)
  this.loadBuffer(this.urlList[i], i);
};

var allowedNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// var allowedNotes = ['B', 'C#', 'D', 'E', 'F#', 'G', 'A']; // Bm scale

function mapNotesToFrequency() {
    var baseFreq = 440; // A4
    var baseSteps = 9; // A
    var baseOctave = 4;

    var notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var octaveStart = 3;
    var octaveEnd = 6;

    var notesFreqMap = {};
    for (var oct = octaveStart; oct <= octaveEnd; oct++) {
        for (var step = 0; step < 12; step++) {
            var freq = baseFreq * Math.pow(2, (oct*12 + step - baseOctave*12 - baseSteps) / 12);
            if (!allowedNotes.some(x => x === notes[step])) continue;

            notesFreqMap[notes[step] + oct.toString()] = { freq: freq, step: oct*12 + step };
        }
    }

    return notesFreqMap;
}

export default class AudioController {
    constructor(width) {
        this.width = width;

        this.notesToFreq = mapNotesToFrequency();
        this.context = new AudioContext();

        this.oscillator = this.context.createOscillator();

        this.LFO = this.context.createOscillator();
        this.LFO.type = 'sine';
        this.LFO.frequency.value = 1; // Hz

        this.LFOGainNode = this.context.createGain();
        this.LFOGainNode.gain.value = 0.3;

        // this.convolver = this.context.createConvolver();
        
        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = 0;

        this.volNode = this.context.createGain();
        this.volNode.gain.value = 0.15;

        this.filter = this.context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 1800;
        // this.filter.Q.value = 5;

        // LFO -> VCO -> VCA -> Filter -> Volume -> Delay
        this.delay = this.context.createDelay();
        this.delay.delayTime.value = 0.3;

        this.delayFeedback = this.context.createGain();
        this.delayFeedback.gain.value = 0.7;

        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay);

        // this.initBufferLoader();

        this.LFO.connect(this.LFOGainNode);

        this.LFOGainNode.connect(this.oscillator.frequency); // FM
        this.oscillator.connect(this.gainNode);

        this.gainNode.connect(this.filter);
        this.filter.connect(this.volNode);
        this.volNode.connect(this.context.destination);
        // Reverb doesn't sound so good. Disconnecting for now. Maybe tunajs sounds better.
        // Problem is this pure wet sound. Should be 60% dry, 40% wet or something like that.
        // this.volNode.connect(this.convolver);
        // this.convolver.connect(this.context.destination);
        this.delay.connect(this.context.destination);

        this.LFO.start();
        this.oscillator.start();

        this.sounds = [
            { name: 'sine', amp: [1.0, 1.0], phase: [0.0, 0.0]},
            { name: 'trapezium', amp: [1.273, 0.993, 0.0, 0.314, 0.0, 0.168, 0.0, 0.101, 0.0, 0.060, 0.0, 0.033], phase: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]},
            { name: 'violin', amp: [0.49, 0.995, 0.94, 0.425, 0.480, 0, 0.365, 0.04, 0.085, 0, 0.09, 0], phase: [0,0,Math.PI/2,0,Math.PI/2,0,Math.PI/2,0,Math.PI/2,0,Math.PI/2,0]},
            { name: 'square', amp: [4/Math.PI,1,0,0.3333,0,0.2,0,0.1429,0,0.1111,0,0.0909], phase: [0,0,0,0,0,0,0,0,0,0,0,0]},
            { name: 'triangle', amp: [0.81,1,0,0.11111,0,0.04,0,0.02041,0,0.0123,0,0.0083], phase: [0,Math.PI/2,0,Math.PI/2,0,Math.PI/2,0,Math.PI/2,0,Math.PI/2,0,Math.PI/2]},
            { name: 'sawtooth', amp: [2/Math.PI,1,0.5,0.333,0.25,0.2,0.1667,0.1429,0.125,0.1111,0.1,0.0909], phase: [0,0,0,0,0,0,0,0,0,0,0,0]},
            { name: 'impulse', amp: [0.18,1,0.9,0.8,0.7,0.6,0.5,0.4,0.3,0.2,0.1,0], phase: [0,0,Math.PI*1.5,Math.PI,Math.PI/2,0,Math.PI*1.5,Math.PI,Math.PI/2,0,Math.PI*1.5,Math.PI]}
        ];

        this.currentSound = 0;
        this.setSound(this.sounds[this.currentSound]);

        this.isDelayEnabled = false;
        // this.setDelay(true);

        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.3;
        this.volNode.connect(this.analyser);
        this.delay.connect(this.analyser);
        const bufferLength = this.analyser.frequencyBinCount;
        this.floatDataArray = new Float32Array(bufferLength);
        this.uintDataArray = new Uint8Array(bufferLength);
    }

    setSound(sound) {
        this.updateSoundWave(sound.amp, sound.phase);
    }

    selectNextSound() {
        this.currentSound++;
        if (this.currentSound >= this.sounds.length) this.currentSound = 0;

        this.setSound(this.sounds[this.currentSound]);
    }

    getSoundName() {
        return this.sounds[this.currentSound].name;
    }

    updateSoundWave(amps, phases) {
        const curveSin = new Float32Array(amps.length);
        const curveCos = new Float32Array(amps.length);
        curveSin[0] = 0;
        curveCos[0] = 0;

        for (let i = 1; i < amps.length; ++i) {
            curveSin[i] = amps[i] * amps[0] * Math.cos(phases[i]);
            curveCos[i] = amps[i] * amps[0] * Math.sin(phases[i]);
        }

        const waveTable = this.context.createPeriodicWave(curveCos, curveSin);
        this.oscillator.setPeriodicWave(waveTable);
    }

    initBufferLoader() {
        const bufferLoader = new BufferLoader(this.context,
            [  //List of preloaded impulse files
            './resources/ir_rev_short.wav'
            ],
            (bufferList) => {
                const impulseResponses = [];
                for (let i = 0; i < bufferList.length; i++)
                    impulseResponses.push(bufferList[i]);
              
                this.convolver.buffer = impulseResponses[0];
            });

      bufferLoader.load();
    }

    onChange(pos, gain) {
        if (pos !== null) {
            const freq = this._calculateFrequency(pos + this.width / 2);
            // this.oscillator.frequency.value = freq;
            this.oscillator.frequency.setTargetAtTime(freq, this.context.currentTime, 0.01);
        }
        if (gain !== null) {
            this.gainNode.gain.value = this._calculateGain(gain);
        }
    }

    detune(cents) {
        this.oscillator.detune.value = cents;
    }

    setDelay(val) {
        try {
            if (val) {
                this.volNode.connect(this.delay);
            } else {
                this.volNode.disconnect(this.delay);
            }
        } catch(error) {
            console.log(error);
        }

    }

    toggleDelay() {
        this.isDelayEnabled = !this.isDelayEnabled;
        this.setDelay(this.isDelayEnabled);
    }

    getNotesWithPosition() {
        var minNote = 3*12; // ~C3
        var maxNote = 6*12 + 11; // ~B6

        for (var note in this.notesToFreq) {
            if (this.notesToFreq.hasOwnProperty(note)) {
                const pos = new THREE.Vector3();
                pos.x = this.width * (this.notesToFreq[note].step - minNote) / (maxNote - minNote) - this.width/2;

                this.notesToFreq[note].position = pos;
            }
        }

        return this.notesToFreq;
    }

    getWaveFormData() {
        this.analyser.getFloatTimeDomainData(this.floatDataArray);

        return this.floatDataArray;
    }

    getFrequencyData() {
        this.analyser.getByteFrequencyData(this.uintDataArray);

        return this.uintDataArray;
    }

    getVolume() {
        this.getWaveFormData();
        let max = 0;
        const length = this.floatDataArray.length;

        for (let i = 0; i < length; i++) {
            max = Math.max(Math.abs(this.floatDataArray[i]), max);
        }

        return max;
    }

    getFrequencyStep() {
        return this.context.sampleRate / this.analyser.fftSize;
    }

    _calculateFrequency(val) {
        var baseFreq = 440; // A4
        var baseSteps = 9; // A
        var baseOctave = 4;

        var minNote = 3*12; // ~C3
        var maxNote = 6*12 + 11; // ~B6

        var note = (val / this.width) * (maxNote - minNote) + minNote;
        if (note > maxNote || note < minNote) return 0;

        var freq = baseFreq * Math.pow(2, (note - baseOctave*12 - baseSteps) / 12);

        return freq;
    }

    _calculateGain(val) {
        var minG = 0;
        var maxG = 1;

        var gain = val * (maxG - minG) + minG;
         // console.log(gain);
        return gain;
    }
}








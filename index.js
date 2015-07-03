/* based on W3C MIDI example: https://webaudio.github.io/web-midi-api/#a-simple-monophonic-sine-wave-midi-synthesizer */

(function() {
  function defineSynth(AssociativeArray, defaultSettings, curves) {
    var Context = AudioContext || webkitAudioContext;

    function Synth(opts) {
      opts = opts || {};
      this.inputName = opts.inputName || null;
      this.inputID = opts.inputID || null;
      this.bindToInputs = opts.bindToInputs === undefined ? true : opts.bindToInputs;
      this.attack = opts.attack || 0.1;
      this.release = opts.release || 0.1;
      this.portamento = opts.portamento || 0.1;
      this.debug = opts.debug || false;

      // the Web Audio "context" object
      this.context = null;
      // the MIDIAccess object.
      this.midi = null;
      // the envelope for the single oscillator
      this.envelope = null;
      // the AssociativeArray of active frequencies with attack, release, etc.
      this.activeFrequencies = new AssociativeArray();
      // the list of inputs we're listening to
      this.inputs = new AssociativeArray();
      // the AssociativeArray of available inputs
      this.availableInputs = new AssociativeArray();

      this.nodeCreators = new Map([
        ['oscillator', this.createOscillator.bind(this)],
        ['filter', this.createFilter.bind(this)],
        ['shaper', this.createShaper.bind(this)],
        ['delay', this.createDelay.bind(this)]
      ]);

      this.nodeExporters = new Map([
        ['oscillator', this.exportOscillator.bind(this)],
        ['filter', this.exportFilter.bind(this)],
        ['shaper', this.exportShaper.bind(this)],
        ['delay', this.exportDelay.bind(this)]
      ]);

      this.MIDIMessageHandler = this.MIDIMessage.bind(this);
      this.MIDIConnectHandler = this.MIDIConnect.bind(this);

      this.ready = this.init(opts.settings || defaultSettings[opts.settingName] || defaultSettings.sine);
    }

    Synth.prototype.curves = curves;

    Synth.prototype.createContext = function() {
      this.context = new Context();
      this.nodes = [];
      this.oscillators = [];
      this.gain = 1.0;

      this.envelope = this.context.createGain();
      this.envelope.connect(this.context.destination);
      this.envelope.gain.value = 0.0;

      this.info('Created context:', this.context);

      return this.context;
    };

    Synth.prototype.init = function(settings) {
      this.createContext();

      if (settings) {
        this.applySettings(settings);
      }

      if (navigator.requestMIDIAccess) {
        if (this.bindToInputs) {
          return this.scanInputs();
        }
        else {
          return Promise.resolve();
        }
      }
      else {
        return Promise.reject('No MIDI support found');
      }
    };

    //TODO JSON format for storing oscillator/filter configurations, naming, saving/loading
    //TODO nodes need to be setup in a pipeline with a very particular order...
    //TODO let settings define the pipeline+ordering
    //{nodes: [{nodeType: oscillator, type, detune}, {nodeType: filter, type, frequency, detune, q, gain}, {nodeType: shaper, curve, oversample}], gain, delay}
    Synth.prototype.createOscillator = function(opts) {
      var oscillator = this.context.createOscillator();

      oscillator.type = opts.type || 'sine';
      oscillator.detune.value = opts.detune || 0;
      oscillator.frequency.setTargetAtTime(110, 0, 0);
      oscillator.start(0);

      this.oscillators.push(oscillator);

      return oscillator;
    };

    Synth.prototype.exportOscillator = function(node) {
      return {nodeType: 'oscillator', type: node.type, detune: node.detune.value};
    };

    Synth.prototype.createFilter = function(opts) {
      var filter = this.context.createBiquadFilter();

      filter.type = opts.type || 'lowpass';
      filter.frequency.value = opts.frequency || 20000;
      filter.detune.value = opts.detune || 0;
      filter.Q.value = opts.q || 1;
      filter.gain.value = opts.gain || 0;

      return filter;
    };

    Synth.prototype.exportFilter = function(node) {
      return {nodeType: 'filter', type: node.type, frequency: node.frequency.value, detune: node.detune.value, q: node.Q.value, gain: node.gain.value};
    };

    Synth.prototype.createShaper = function(opts) {
      var shaper = this.context.createWaveShaper();

      if (opts.curve) {
        if (Array.isArray(opts.curve)) {
          shaper.curve = opts.curve;
        }
        else {
          var curveCreator = this.curves.get(opts.curve.type);
          if (curveCreator) {
            shaper.curve = curveCreator(opts.curve, this.context.sampleRate);
            this.info('shaper curve', opts.curve.type, curveCreator, curveCreator(opts.curve, this.context.sampleRate));
          }
        }
      }

      shaper.oversample = opts.oversample || 'none';

      return shaper;
    };

    Synth.prototype.exportShaper = function(node) {
      return {nodeType: 'shaper', curve: node.curve, oversample: node.oversample};
    };

    Synth.prototype.createDelay = function(opts) {
      var delayNode = this.context.createDelay(opts.delay);
      delayNode.delayTime.value = opts.delay || 0;

      return delayNode;
    };

    Synth.prototype.exportDelay = function(node) {
      return {nodeType: 'delay', delay: node.delayTime.value};
    };

    Synth.prototype.exportSettings = function() {
      var settings = {};

      settings.gain = this.envelope && this.envelope.gain.value || 0;

      settings.nodes = this.nodes.map(function(node) {
        var exporter = this.nodeExporters.get(node.nodeType);
        if (exporter) {
          return exporter(node);
        }
        return {nodeType: node.nodeType};
      }, this);

      return settings;
    };

    Synth.prototype.removeNodes = function() {
      this.nodes.forEach(function(pipeline) {
        pipeline.forEach(function(node) {
          node.disconnect();
        });
      });
      this.nodes = [];
    };

    Synth.prototype.applySettings = function(settings) {
      this.removeNodes();

      if (settings.nodes && settings.nodes.length > 0) {

        settings.nodes.forEach(function(pipeline) {
          var prevNode;
          var nodes = [];

          pipeline.forEach(function(config) {
            var creator = this.nodeCreators.get(config.nodeType);
            if (creator) {
              var node = creator(config);
              node.nodeType = config.nodeType;

              if (prevNode) {
                prevNode.connect(node);
              }

              prevNode = node;
              nodes.push(node);

              this.info('Added', config.nodeType, 'node');
            }
          }, this);

          prevNode.connect(this.envelope);
          this.nodes.push(nodes);
        }, this);
      }

      if (settings.gain) {
        this.gain = settings.gain;
        this.envelope.gain.value = settings.gain;
      }

      this.info('Applied settings:', settings);
    };

    Synth.prototype.initMIDI = function() {
      return navigator.requestMIDIAccess().then(this.MIDISuccess.bind(this), this.MIDIFailure.bind(this));
    };

    Synth.prototype.MIDISuccess = function(midi) {
      var self = this;
      var input;
      this.midi = midi;

      this.midi.onstatechange = this.MIDIConnectHandler;

      return this.midi;
    };

    Synth.prototype.MIDIFailure = function(err) {
      throw err;
    };

    Synth.prototype.MIDIMessage = function(event) {
      this.info('midi event', event);

      // Mask off the lower nibble (MIDI channel, which we don't care about)
      switch (event.data[0] & 0xf0) {
        case 0x90:
          // if velocity != 0, this is a note-on message
          if (event.data[2] !== 0) {
            this.noteOn(event.data[1]);
            break;
          }
        // if velocity == 0, fall thru: it's a note-off.  MIDI's weird, y'all.
        case 0x80:
          this.noteOff(event.data[1]);
          break;
      }
    };

    Synth.prototype.MIDIConnect = function(event) {
      var input = event.port || event;

      if (input.type === 'input') {
        if (input.state === 'connected') {
          this.availableInputs.push(input.id, input);

          if (this.bindToInputs) {
            this.bindToMatchingInput(input);
          }

          this.info('midi connect', event);
        }
        else {
          this.availableInputs.remove(input.id);

          this.info('midi disconnect', event);
        }
      }
    };

    Synth.prototype.scanInputs = function() {
      var self = this;

      return this.initMIDI().then(function(midi) {
        for (var input of midi.inputs.values()) {
          self.availableInputs.push(input.id, input);
        }

        if (self.bindToInputs) {
          return self.bindToMatchingInputs();
        }
        return Promise.resolve(self.availableInputs);
      });
    };

    Synth.prototype.bindToMatchingInput = function(input) {
      if ((this.inputID === null && this.inputName === null) || this.inputID === input.id || this.inputName === input.name) {
        this.bindToInput(input);
      }
      else {
        this.info('skipping input', this.inputToString(input));
      }
    };

    Synth.prototype.bindToMatchingInputs = function() {
      var self = this;

      this.availableInputs.forEach(this.bindToMatchingInput.bind(this));

      if (this.inputs.length > 0) {
        return Promise.resolve(this.inputs);
      }
      else {
        var errs = [];
        if (this.inputID !== null) {
          errs.push('No input matching ID "' + this.inputID + '".');
        }
        if (this.inputName !== null) {
          errs.push('No input matching name "' + this.inputName + '".');
        }

        errs.push('Available inputs:');

        errs = errs.concat(this.availableInputs.map(this.inputToString.bind(this)));

        errs.push('No usable MIDI inputs found. Try removing/fixing inputName/inputID?');

        return Promise.reject(errs.join('\n'));
      }
    };

    Synth.prototype.bindToInput = function(input) {
      if (!this.inputs.has(input.id)) {
        this.info('binding to input: ' + this.inputToString(input));

        this.inputs.push(input.id, input);

        input.onmidimessage = this.MIDIMessageHandler;
        //TODO disconnects don't appear to be working yet in Linux/ALSA (only tested with vkeybd)
        input.onstatechange = this.MIDIConnectHandler;
        //TODO not implemented yet?
        //input.addEventListener('midimessage', this.MIDIMessageHandler);
      }
    };

    Synth.prototype.unbindToInput = function(input) {
      this.info('unbinding to input: ' + this.inputToString(input));

      input.onmidimessage = null;
      input.onstatechange = null;
      //TODO not implemented yet?
      //input.removeEventListener('midimessage', this.MIDIMessageHandler);
      this.inputs.remove(input.id);
    };

    Synth.prototype.frequencyFromNoteNumber = function(note) {
      return 440 * Math.pow(2, (note - 69) / 12);
    };

    Synth.prototype.toggleFrequency = function(frequency, attack, release, portamento) {
      if (this.activeFrequencies.has(frequency)) {
        return this.frequencyOff(frequency, attack, release, portamento);
      }
      else {
        return this.frequencyOn(frequency, attack, release, portamento);
      }
    };

    Synth.prototype.frequencyOn = function(frequency, attack, release, portamento) {
      if (!this.activeFrequencies.has(frequency)) {
        attack = attack || this.attack;
        release = release || this.release;
        portamento = portamento || this.portamento;

        this.activeFrequencies.push(frequency, {frequency: frequency, attack: attack, release: release, portamento: portamento});

        this.oscillators.forEach(function(oscillator) {
          oscillator.frequency.cancelScheduledValues(0);
          oscillator.frequency.setTargetAtTime(frequency, 0, portamento);
        });

        this.envelope.gain.cancelScheduledValues(0);
        this.envelope.gain.setTargetAtTime(this.gain, 0, attack);

        this.info('on', this.activeFrequencies.get(frequency));
      }
    };

    Synth.prototype.frequencyOff = function(frequency) {
      var release = this.release;
      var active = this.activeFrequencies.remove(frequency);

      if (active !== undefined) {
        release = active.release;

        // shut off the envelope if nothing's active
        if (this.activeFrequencies.length === 0) {
          this.envelope.gain.cancelScheduledValues(0);
          this.envelope.gain.setTargetAtTime(0.0, 0, release);
        }
        else {
          var active = this.activeFrequencies.last();

          this.oscillators.forEach(function(oscillator) {
            oscillator.frequency.cancelScheduledValues(0);
            oscillator.frequency.setTargetAtTime(active.frequency, 0, active.portamento);
          });
        }

        this.info('off', active);
      }
    };

    Synth.prototype.toggleNote = function(noteNumber, attack, release, portamento) {
      return this.toggleFrequency(this.frequencyFromNoteNumber(noteNumber), attack, portamento);
    };

    Synth.prototype.noteOn = function(noteNumber, attack, release, portamento) {
      return this.frequencyOn(this.frequencyFromNoteNumber(noteNumber), attack, portamento);
    };

    Synth.prototype.noteOff = function(noteNumber) {
      return this.frequencyOff(this.frequencyFromNoteNumber(noteNumber));
    };

    Synth.prototype.info = function() {
      if (this.debug) {
        console.info.apply(console, ['Synth:'].concat(Array.prototype.slice.call(arguments), this));
      }
    };

    Synth.prototype.inputToString = function(input) {
      return input.name + ' (' + input.id + ')';
    };

    return Synth;
  }

  if (typeof module === 'object' && typeof require === 'function') {
    module.exports = defineSynth.call(this, require('associative-array'), require('./default-settings.json'), require('./curves'));
  }
  else if (typeof define === 'function' && define.amd) {
    define(['associative-array', 'default-settings.json', 'curves'], defineSynth.bind(this));
  }
  else {
    this.Synth = defineSynth.call(this);
  }
})();

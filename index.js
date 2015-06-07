/* based on W3C MIDI example: https://webaudio.github.io/web-midi-api/#a-simple-monophonic-sine-wave-midi-synthesizer */

(function() {
  function defineSynth(AssociativeArray) {
    var global = this;

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
      // the single oscillator
      this.oscillator = null;
      // the envelope for the single oscillator
      this.envelope = null;
      // the AssociativeArray of active frequencies with attack, release, etc.
      this.activeFrequencies = new AssociativeArray();
      // the list of inputs we're listening to
      this.inputs = new AssociativeArray();
      // the AssociativeArray of available inputs
      this.availableInputs = new AssociativeArray();

      this.MIDIMessageHandler = this.MIDIMessage.bind(this);
      this.MIDIConnectHandler = this.MIDIConnect.bind(this);

      this.ready = this.init();
    }

    Synth.prototype.init = function() {
      var AudioContext = global.AudioContext || global.webkitAudioContext;

      this.context = new AudioContext();

      if (global.navigator.requestMIDIAccess) {
        // set up the basic oscillator chain, muted to begin with.
        this.oscillator = this.context.createOscillator();
        this.oscillator.frequency.setValueAtTime(110, 0);
        this.envelope = this.context.createGain();

        this.oscillator.connect(this.envelope);
        this.envelope.connect(this.context.destination);
        this.envelope.gain.value = 0.0;
        this.oscillator.start(0);

        return global.navigator.requestMIDIAccess().then(this.MIDISuccess.bind(this), this.MIDIFailure.bind(this));
      }
      else {
        return global.Promise.reject('No MIDI support found');
      }
    };

    Synth.prototype.MIDISuccess = function(midi) {
      var self = this;
      var input;
      this.midi = midi;

      this.midi.onstatechange = this.MIDIConnectHandler;

      for (input of this.midi.inputs.values()) {
        this.availableInputs.push(input.id, input);
      }

      if (this.bindToInputs) {
        for (input of this.midi.inputs.values()) {
          if ((this.inputID === null && this.inputName === null) || this.inputID === input.id || this.inputName === input.name) {
            this.bindToInput(input);
          }
        }
      }

      if (!this.bindToInputs || this.inputs.length > 0) {
        return global.Promise.resolve();
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

        for (var input of this.midi.inputs.values()) {
          errs.push(this.inputToString(input));
        }

        errs.push('No usable MIDI inputs found. Try removing/fixing inputName/inputID?');

        return global.Promise.reject(errs.join('\n'));
      }
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

          this.info('midi connect', event);
        }
        else {
          this.availableInputs.remove(input.id);

          this.info('midi disconnect', event);
        }
      }
    };

    Synth.prototype.bindToInput = function(input) {
      this.info('binding to input: ' + this.inputToString(input));

      input.onmidimessage = this.MIDIMessageHandler;
      //TODO disconnects don't appear to be working yet in Linux/ALSA (only tested with vkeybd)
      input.onstatechange = this.MIDIConnectHandler;
      //TODO not implemented yet?
      //input.addEventListener('midimessage', this.MIDIMessageHandler);
      this.inputs.push(input.id, input);
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

        this.oscillator.frequency.cancelScheduledValues(0);
        this.oscillator.frequency.setTargetAtTime(frequency, 0, portamento);
        this.envelope.gain.cancelScheduledValues(0);
        this.envelope.gain.setTargetAtTime(1.0, 0, attack);

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

          this.oscillator.frequency.cancelScheduledValues(0);
          this.oscillator.frequency.setTargetAtTime(active.frequency, 0, active.portamento);
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
        global.console.info.apply(global.console, ['Synth:'].concat(global.Array.prototype.slice.call(arguments), this));
      }
    };

    Synth.prototype.inputToString = function(input) {
      return input.name + ' (' + input.id + ')';
    };

    return Synth;
  }

  if (typeof module === 'object' && typeof require === 'function') {
    module.exports = defineSynth.call(this, require('./associative-array'));
  }
  else if (typeof define === 'function' && define.amd) {
    define(['./associative-array'], defineSynth.bind(this));
  }
  else {
    this.Synth = defineSynth.call(this);
  }
})();

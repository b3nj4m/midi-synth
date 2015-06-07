/* based on W3C MIDI example: https://webaudio.github.io/web-midi-api/#a-simple-monophonic-sine-wave-midi-synthesizer */

(function() {
  function defineSynth() {
    var global = this;

    function Synth(opts) {
      opts = opts || {};
      this.inputName = opts.inputName || null;
      this.inputID = opts.inputID || null;
      this.attack = opts.attack || 0.1;
      this.release = opts.release || 0.1;
      this.portamento = opts.portamento || 0.1;
      this.debug = opts.debug || false;

      // the Web Audio "context" object
      this.context = null;
      // the MIDIAccess object.
      this.midiAccess = null;
      // the single oscillator
      this.oscillator = null;
      // the envelope for the single oscillator
      this.envelope = null;
      // the stack of actively-pressed keys
      this.activeFrequenciesStack = [];
      // the table of active frequencies with attack, release, etc.
      this.activeFrequencies = {};

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
      this.midiAccess = midi;
      var haveAtLeastOneDevice = false;

      for (var input of this.midiAccess.inputs.values()) {
        if ((this.inputID === null && this.inputName === null) || this.inputID === input.id || this.inputName === input.name) {
          this.info('binding to input: ' + inputToString(input));

          input.onmidimessage = this.MIDIMessage.bind(this);
          haveAtLeastOneDevice = true;
        }
      }

      if (haveAtLeastOneDevice) {
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

        for (var input of this.midiAccess.inputs.values()) {
          errs.push(inputToString(input));
        }

        errs.push('No usable MIDI inputs found. Try removing/fixing inputName/inputID?');

        return global.Promise.reject(errs.join('\n'));
      }
    };

    Synth.prototype.MIDIFailure = function(err) {
      throw err;
    };

    Synth.prototype.MIDIMessage = function(event) {
      if (this.debug) {
        this.info('midi event', event);
      }
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

    Synth.prototype.frequencyFromNoteNumber = function(note) {
      return 440 * Math.pow(2, (note - 69) / 12);
    };

    Synth.prototype.toggleFrequency = function(frequency, attack, release, portamento) {
      if (this.activeFrequencies[frequency] === undefined) {
        return this.frequencyOn(frequency, attack, release, portamento);
      }
      else {
        return this.frequencyOff(frequency, attack, release, portamento);
      }
    };

    Synth.prototype.frequencyOn = function(frequency, attack, release, portamento) {
      if (this.activeFrequencies[frequency] === undefined) {
        attack = attack || this.attack;
        release = release || this.release;
        portamento = portamento || this.portamento;

        this.activeFrequenciesStack.push(frequency);
        this.activeFrequencies[frequency] = {frequency: frequency, attack: attack, release: release, portamento: portamento, index: this.activeFrequenciesStack.length - 1};

        this.oscillator.frequency.cancelScheduledValues(0);
        this.oscillator.frequency.setTargetAtTime(frequency, 0, portamento);
        this.envelope.gain.cancelScheduledValues(0);
        this.envelope.gain.setTargetAtTime(1.0, 0, attack);

        if (this.debug) {
          this.info('on', this.activeFrequencies[frequency]);
        }
      }
    };

    Synth.prototype.frequencyOff = function(frequency) {
      var release = this.release;
      var active = this.activeFrequencies[frequency];

      if (active !== undefined) {
        release = active.release;
        this.activeFrequenciesStack.splice(active.index, 1);
        delete this.activeFrequencies[frequency];

        // shut off the envelope if nothing's active
        if (this.activeFrequenciesStack.length === 0) {
          this.envelope.gain.cancelScheduledValues(0);
          this.envelope.gain.setTargetAtTime(0.0, 0, release);
        }
        else {
          var active = this.activeFrequencies[this.activeFrequenciesStack[this.activeFrequenciesStack.length - 1]];

          this.oscillator.frequency.cancelScheduledValues(0);
          this.oscillator.frequency.setTargetAtTime(active.frequency, 0, active.portamento);
        }

        if (this.debug) {
          this.info('off', active);
        }
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
    }

    function inputToString(input) {
      return input.name + ' (' + input.id + ')';
    }

    return Synth;
  }

  if (typeof module === 'object' && typeof require === 'function') {
    module.exports = defineSynth.call(this);
  }
  else if (typeof define === 'function' && define.amd) {
    define([], defineSynth.bind(this));
  }
  else {
    this.Synth = defineSynth.call(this);
  }
})();

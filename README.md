# midi-synth

A WebAudio MIDI synthesizer library (no UI).
Based on W3C MIDI example: https://webaudio.github.io/web-midi-api/#a-simple-monophonic-sine-wave-midi-synthesizer

Currently supports any combination of oscillators, filters, wave shapers, and delays.

## Examples

### Auto-detect MIDI controller

```javascript
var Synth = require('midi-synth');

var s = new Synth({
  //print info messages
  debug: true
});

//play something on your MIDI keyboard
```

### Bind to a particular MIDI controller by name or ID

```javascript
var Synth = require('midi-synth');

var s = new Synth({
  //print info messages
  debug: true,
  inputName: 'Virtual Keyboard',
  //or
  inputID: 'QONFWIUEFNQUN'
});

//play something on your MIDI keyboard
```

### Manually bind to MIDI controller

```javascript
var Synth = require('midi-synth');

var s = new Synth({
  //print info messages
  debug: true,
  bindToInputs: false
});

s.scanInputs().then(function(inputs) {
  s.bindToInput(inputs.first());
});
```

### Manually trigger notes with computer keyboard

```javascript
var Synth = require('midi-synth');

var s = new Synth({
  //print info messages
  debug: true,
  bindToInputs: false
});

document.body.addEventListener('keydown', function(e) {
  s.noteOn(e.keyCode);
});
document.body.addEventListener('keyup', function(e) {
  s.noteOff(e.keyCode);
});
```

### Specifying synthesizer configuration

#### Use a preset (see [presets.json](presets.json))

```javascript
var Synth = require('midi-synth');

var s = new Synth({
  //print info messages
  debug: true
});

s.applyPreset('sine-distorted');

//play something on your MIDI keyboard
```

#### Use your own preset

```javascript
var Synth = require('midi-synth');

var s = new Synth({
  //print info messages
  debug: true
});

s.applySettings({gain: 1.0, nodes: [
  [{nodeType: 'oscillator', type: 'sine'}, {nodeType: 'filter', id: 'filter', type: 'lowpass', frequency: 5000}],
  [{nodeType: 'oscillator', type: 'square', pipe: 'filter'}]
]});

//play something on your MIDI keyboard
```

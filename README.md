# midi-synth

A WebAudio MIDI synthesizer library (no UI).
Based on W3C MIDI example: https://webaudio.github.io/web-midi-api/#a-simple-monophonic-sine-wave-midi-synthesizer

Currently uses a single sine wave oscillator with adjustable attack, release, portamento.

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

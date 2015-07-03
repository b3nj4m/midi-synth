(function() {
  function defineCurves() {
    function distort(opts, samples) {
      samples = samples || 44100;
      var amount = opts.amount || 50;
      var curve = new Float32Array(samples);
      var deg = Math.PI / 180;
      var x;
      for (var i = 0; i < samples; i++) {
        x = i * 2 / samples - 1;
        curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
      }
      return curve;
    }

    return new Map([
      ['distort', distort]
    ]);
  }

  if (typeof module === 'object' && typeof require === 'function') {
    module.exports = defineCurves.call(this);
  }
  else if (typeof define === 'function' && define.amd) {
    define([], defineCurves.bind(this));
  }
  else {
    this.Synth = defineCurves.call(this);
  }
})();

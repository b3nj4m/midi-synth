//A limited implementation of an associative array
function Assoc() {
  Array.apply(this, arguments);

  this._map = new Map();
}

Assoc.prototype = Object.create(Array.prototype);
Assoc.prototype.constructor = Assoc;

Assoc.prototype.has = function(key) {
  return this._map.has(key);
};

Assoc.prototype.set = function(key, value, idx) {
  if (typeof idx === 'undefined') {
    return this.push(key, value);
  }

  if (!this.has(key)) {
    this[idx] = {key: key, value: value};
    this._map.set(key, idx);
  }

  return this;
};

Assoc.prototype.get = function(key) {
  return this[this._map.get(key)].value;
};

Assoc.prototype.getIdx = function(idx) {
  return this[idx].value;
};

Assoc.prototype.last = function() {
  return this[this.length - 1].value;
};

Assoc.prototype.first = function() {
  return this[0].value;
};

Assoc.prototype.each = function(fn) {
  for (var i = 0; i < this.length; i++) {
    if (!fn(this[i].value, this[i].key, i)) {
      break;
    }
  }
};

Assoc.prototype.map = function(fn) {
  var result = new Array(this.length);
  for (var i = 0; i < this.length; i++) {
    result[i] = fn(this[i].value, this[i].key, i);
  }
  return result;
};

Assoc.prototype.remove = function(key) {
  var idx = this._map.get(key);
  var value;

  if (idx !== undefined) {
    value = this[idx].value;
    this.splice(idx, 1);
    this._map.delete(key);

    //adjust map of indexes for items after the removed item
    for (var i = idx; i < this.length; i++) {
      this._map.set(this[i].key, i);
    }
  }

  return value;
};

Assoc.prototype.push = function(key, val) {
  if (!this.has(key)) {
    Array.prototype.push.call(this, {value: val, key: key});

    this._map.set(key, this.length - 1);
  }

  return this;
};

Assoc.prototype.pop = function() {
  var result = Array.prototype.pop.apply(this, arguments);

  this._map.delete(result.key);

  return result.value;
};

module.exports = Assoc;

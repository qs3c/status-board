;(function (root, factory) {
  var api = factory();
  (root.SB = root.SB || {}).store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var LEVELS = ['not_well', 'good', 'very_good'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  return { LEVELS: LEVELS, todayKey: todayKey };
});

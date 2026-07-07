;(function (root, factory) {
  var store = typeof require !== 'undefined' ? require('./store.js') : root.SB && root.SB.store;
  var api = factory(store);
  (root.SB = root.SB || {}).github = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (store) {
  function encodeContent(obj) {
    var json = JSON.stringify(obj, null, 2);
    var bytes = new TextEncoder().encode(json);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function decodeContent(base64) {
    var clean = (base64 || '').replace(/\s/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }

  async function sync(deps, localData) {
    var maxRetries = 3;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      var remote = await deps.getRemote();
      var merged = store.mergeData(localData, remote.data);
      try {
        await deps.putRemote(merged, remote.sha);
        return merged;
      } catch (err) {
        if (err && err.status === 409 && attempt < maxRetries) {
          localData = merged;
          continue;
        }
        throw err;
      }
    }
  }

  return { encodeContent: encodeContent, decodeContent: decodeContent, sync: sync };
});

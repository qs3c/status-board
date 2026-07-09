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

  function stableStringify(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';

    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      parts.push(JSON.stringify(keys[i]) + ':' + stableStringify(value[keys[i]]));
    }
    return '{' + parts.join(',') + '}';
  }

  function sameData(a, b) {
    return stableStringify(a) === stableStringify(b);
  }

  async function sync(deps, localData) {
    var maxRetries = 3;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      var remote = await deps.getRemote();
      var merged = store.mergeData(localData, remote.data);
      if (sameData(merged, remote.data)) return merged;

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

  function apiUrl(config) {
    return 'https://api.github.com/repos/' + config.owner + '/' + config.repo +
      '/contents/' + config.path.split('/').map(encodeURIComponent).join('/');
  }

  function headers(config) {
    var h = { 'Accept': 'application/vnd.github+json' };
    if (config.token) h.Authorization = 'Bearer ' + config.token;
    return h;
  }

  async function getRemote(config) {
    var url = apiUrl(config) + '?ref=' + encodeURIComponent(config.branch);
    var res = await fetch(url, { headers: headers(config) });
    if (res.status === 404) return { data: store.emptyData(), sha: null };
    if (!res.ok) {
      var getError = new Error('GitHub GET failed: ' + res.status);
      getError.status = res.status;
      throw getError;
    }
    var json = await res.json();
    return { data: decodeContent(json.content), sha: json.sha };
  }

  async function putRemote(config, data, sha) {
    var body = {
      message: 'update status ' + new Date().toISOString(),
      content: encodeContent(data),
      branch: config.branch
    };
    if (sha) body.sha = sha;
    var res = await fetch(apiUrl(config), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers(config)),
      body: JSON.stringify(body)
    });
    if (res.status === 409) {
      var conflict = new Error('conflict');
      conflict.status = 409;
      throw conflict;
    }
    if (!res.ok) {
      var putError = new Error('GitHub PUT failed: ' + res.status);
      putError.status = res.status;
      throw putError;
    }
    var json = await res.json();
    return { sha: json.content && json.content.sha };
  }

  function defaultDeps(config) {
    return {
      getRemote: function () { return getRemote(config); },
      putRemote: function (data, sha) { return putRemote(config, data, sha); }
    };
  }

  return {
    encodeContent: encodeContent,
    decodeContent: decodeContent,
    sync: sync,
    getRemote: getRemote,
    putRemote: putRemote,
    defaultDeps: defaultDeps
  };
});

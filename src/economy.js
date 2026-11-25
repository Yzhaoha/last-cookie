// One localStorage write commits both the payment and its reward. Animation is cosmetic.
function CookieEconomy(storage) {
  const KEY = 'lc_wallet3', FREE = [0, 1, 2, 3];
  const read = (key, fallback) => { try { const v = JSON.parse(storage.getItem(key)); return v == null ? fallback : v; } catch { return fallback; } };
  const clean = v => {
    const owned = [...new Set(FREE.concat(Array.isArray(v.owned) ? v.owned.filter(i => Number.isInteger(i) && i >= 0 && i < 21) : []))];
    return { crumbs: Number.isFinite(v.crumbs) ? Math.max(0, Math.floor(v.crumbs)) : 100, owned, look: owned.includes(v.look) ? v.look : 0 };
  };
  const load = () => {
    const v = read(KEY, null);
    return clean(v && typeof v === 'object' ? v : { crumbs: read('lc_crumbs', 100), owned: read('lc_owned2', FREE), look: read('lc_look2', 0) });
  };
  const commit = v => { try { storage.setItem(KEY, JSON.stringify(clean(v))); return true; } catch { return false; } };
  return {
    load,
    set(key, value) { const v = load(); v[key] = value; return commit(v); },
    use(i) { const v = load(); if (!v.owned.includes(i)) return false; v.look = i; return commit(v); },
    buy(i, looks) {
      const v = load(), L = looks[i], price = L && [0, 200, 400, 800][L.rar];
      if (!L || !Number.isFinite(price) || v.owned.includes(i) || v.crumbs < price) return false;
      v.crumbs -= price; v.owned.push(i); v.look = i; return commit(v);
    },
    box(looks, random = Math.random) {
      const v = load(), pool = [];
      looks.forEach((L, i) => { if (!v.owned.includes(i)) for (let k = 0; k < [0, 6, 3, 1][L.rar]; k++) pool.push(i); });
      if (v.crumbs < 100 || !pool.length) return -1;
      const i = pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
      v.crumbs -= 100; v.owned.push(i); v.look = i;
      return commit(v) ? i : -1;
    },
  };
}
if (typeof module !== 'undefined') module.exports = CookieEconomy;

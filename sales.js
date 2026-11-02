'use strict';
(() => {
  const banner = document.getElementById('shard-sale');
  if (!banner) return;
  const endpoint = 'https://rgafawpucqdhjrzodayl.supabase.co/rest/v1/rpc/dy_shard_sale';
  const key = 'sb_publishable_1cU8zRpm6Rcn5iWBs2bvgQ_Nrej-tsy';
  let expiry;
  async function refreshSale() {
    if (document.hidden) return;
    try {
      const response = await fetch(endpoint, {method:'POST', cache:'no-store', headers:{apikey:key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('Sale unavailable');
      const sale = await response.json();
      clearTimeout(expiry);
      banner.hidden = true;
      if (!sale || !Number.isInteger(sale.percent) || sale.percent <= 0 || !Number.isFinite(Date.parse(sale.ends_at)) || Date.parse(sale.ends_at) <= Date.now() || Date.parse(sale.starts_at) > Date.now()) return;
      banner.querySelector('span').textContent = sale.title + ': extra ' + sale.percent + '% off Shard packs and custom amounts. Ends ' + new Date(sale.ends_at).toLocaleString() + '.';
      banner.hidden = false;
      expiry = setTimeout(() => {banner.hidden = true;}, Math.min(2147483647, Date.parse(sale.ends_at)-Date.now()));
    } catch {banner.hidden = true;}
  }
  refreshSale();
  setInterval(refreshSale, 60000);
  document.addEventListener('visibilitychange',refreshSale);
})();

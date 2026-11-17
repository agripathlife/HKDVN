import { ShopConfig } from '../types';

export function buildTenantStorefrontHTML(config: ShopConfig): string {
  const safeName = config.shopName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeName} — Cửa hàng trực tuyến</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #F8F9FA; color: #111827; }
    h1, h2, h3 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .tabular-nums { font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <header class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
      <div class="min-w-0">
        <h1 id="shop-name" class="text-lg font-bold text-slate-900 truncate">${safeName}</h1>
        <p id="shop-sub" class="text-xs text-slate-500 truncate"></p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <span id="table-label" class="hidden text-xs font-bold text-[#0F766E] px-2.5 py-1.5 bg-teal-50 rounded-lg"></span>
        <button id="bag-btn" type="button" class="hidden px-3.5 py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-lg whitespace-nowrap"></button>
        <a href="./admin.html" class="px-3 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap">Quản lý quán</a>
      </div>
    </div>
  </header>

  <main id="app" class="flex-1 max-w-6xl w-full mx-auto px-4 py-6 pb-28"></main>

  <div id="modal-root"></div>

  <script>
    (function () {
      var config = null;
      var products = [];
      var search = '';
      var activeCat = 'Tất cả';
      var bag = [];
      var fnbViewMode = 'card';
      var cardIdx = 0;
      var pendingCart = {};
      var tableNumber = Number(new URLSearchParams(location.search).get('ban')) || 1;
      var submittedItems = [];

      function noAccent(str) {
        return String(str || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
      }
      function vnd(n) {
        return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ';
      }
      function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function tlv(tag, val) {
        return tag + String(val.length).padStart(2, '0') + val;
      }
      function crc16(str) {
        var crc = 0xFFFF;
        for (var i = 0; i < str.length; i++) {
          crc ^= str.charCodeAt(i) << 8;
          for (var j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
          }
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
      }
      function buildVietQR(amount, desc) {
        var bank = (config && config.bank) || {};
        var bin = bank.bankBin || '970436';
        var acc = String(bank.accountNumber || '0000000000').replace(/\\s+/g, '');
        var cleanDesc = noAccent(desc).replace(/[^a-z0-9\\s-]/gi, '').slice(0, 25);
        var mInfo = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acc)) + tlv('02', 'QRIBFTTA');
        var raw = tlv('00', '01') + tlv('01', amount > 0 ? '12' : '11') + tlv('38', mInfo) + tlv('53', '704') +
          (amount > 0 ? tlv('54', String(Math.round(amount))) : '') + tlv('58', 'VN') +
          (cleanDesc ? tlv('62', tlv('08', cleanDesc)) : '') + '6304';
        return raw + crc16(raw);
      }

      async function postGas(action, payload) {
        var url = config && config.infra && config.infra.gasEndpointUrl;
        if (!url) return;
        try {
          await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: action }, payload))
          });
        } catch (e) {}
      }

      function renderFallbackImg(imgEl, title) {
        var wrap = imgEl.parentElement;
        if (!wrap) return;
        wrap.innerHTML = '<div class="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 p-4 text-center"><span class="text-xs font-medium text-slate-500">' + esc(title) + '</span></div>';
      }

      function bindImages() {
        document.querySelectorAll('img[data-fallback]').forEach(function (img) {
          img.onerror = function () { renderFallbackImg(img, img.getAttribute('data-fallback')); };
        });
      }

      function showQRModal(title, amount, desc) {
        var root = document.getElementById('modal-root');
        var payload = buildVietQR(amount, desc);
        root.innerHTML = '<div class="fixed inset-0 z-50 bg-slate-950/55 flex items-center justify-center p-4">' +
          '<div class="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 space-y-4">' +
          '<div class="flex items-center justify-between"><h3 class="text-lg font-bold">' + esc(title) + '</h3>' +
          '<button id="close-qr" class="px-2 py-1 text-sm text-slate-500 hover:text-slate-900">Đóng</button></div>' +
          '<div class="flex flex-col items-center">' +
          '<img id="qr-img" class="w-52 h-52 border border-slate-200 rounded-xl p-2 bg-white" alt="VietQR" />' +
          '<p class="mt-3 text-2xl font-bold tabular-nums text-[#0F766E]">' + vnd(amount) + '</p>' +
          '<p class="text-xs text-slate-500 mt-1">' + esc(config.bank.bankShortName) + ' · ' + esc(config.bank.accountNumber) + ' · ' + esc(config.bank.accountName) + '</p>' +
          '</div></div></div>';
        document.getElementById('close-qr').onclick = function () { root.innerHTML = ''; };
        if (window.QRCode && window.QRCode.toDataURL) {
          window.QRCode.toDataURL(payload, { width: 260, margin: 2 }, function (err, url) {
            if (!err && document.getElementById('qr-img')) document.getElementById('qr-img').src = url;
          });
        }
      }

      function getFiltered() {
        return products.filter(function (p) {
          var catOk = activeCat === 'Tất cả' || p.category === activeCat;
          var qOk = !search || noAccent(p.name).includes(noAccent(search)) || noAccent(p.sku).includes(noAccent(search));
          return catOk && qOk;
        });
      }

      function render() {
        var app = document.getElementById('app');
        var cats = ['Tất cả'].concat(Array.from(new Set(products.map(function (p) { return p.category; }))));
        var list = getFiltered();

        var filterBar = '<div class="flex flex-col sm:flex-row gap-3 mb-6 justify-between">' +
          '<input id="search-input" type="search" value="' + esc(search) + '" placeholder="Tìm kiếm không dấu (VD: ca phe, pho bo)..." class="w-full sm:max-w-sm px-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl" />' +
          '<div class="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">' +
          cats.map(function (c) {
            var cls = c === activeCat ? 'bg-white text-slate-900 font-semibold shadow-sm' : 'text-slate-600';
            return '<button data-cat="' + esc(c) + '" class="px-3 py-1.5 text-xs rounded-lg whitespace-nowrap ' + cls + '">' + esc(c) + '</button>';
          }).join('') +
          '</div></div>';

        if (config.model === 'retail') {
          var bagBtn = document.getElementById('bag-btn');
          bagBtn.classList.remove('hidden');
          var count = bag.reduce(function (s, i) { return s + i.qty; }, 0);
          bagBtn.textContent = 'Giỏ hàng (' + count + ')';
          bagBtn.onclick = openBagModal;

          app.innerHTML = filterBar +
            '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">' +
            list.map(function (p) {
              var out = p.status === 'Hết hàng' || p.stock <= 0;
              return '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">' +
                '<div class="aspect-square bg-slate-100 overflow-hidden"><img src="' + esc(p.imageUrl) + '" data-fallback="' + esc(p.name) + '" alt="' + esc(p.name) + '" class="w-full h-full object-cover" /></div>' +
                '<div class="p-4 flex-1 flex flex-col justify-between">' +
                '<div><div class="flex justify-between text-xs text-slate-500"><span>' + esc(p.category) + '</span><span class="' + (out ? 'text-red-700' : 'text-emerald-700') + '">' + (out ? 'Hết hàng' : 'Còn hàng') + '</span></div>' +
                '<h2 class="text-base font-bold text-slate-900 mt-1">' + esc(p.name) + '</h2>' +
                '<p class="text-xs text-slate-500 mt-1 line-clamp-2">' + esc(p.description) + '</p></div>' +
                '<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">' +
                '<span class="text-base font-bold tabular-nums text-[#0F766E]">' + vnd(p.price) + '<span class="text-xs font-normal text-slate-500"> / ' + esc(p.unit) + '</span></span>' +
                '<button data-add="' + esc(p.id) + '" ' + (out ? 'disabled' : '') + ' class="px-3.5 py-2 bg-[#0F766E] disabled:bg-slate-200 text-white text-xs font-semibold rounded-lg">Thêm</button>' +
                '</div></div></div>';
            }).join('') +
            '</div>';
        } else {
          // F&B Model
          var tLabel = document.getElementById('table-label');
          tLabel.classList.remove('hidden');
          tLabel.textContent = 'Bàn số ' + tableNumber;

          if (cardIdx >= list.length) cardIdx = 0;
          var activeDish = list[cardIdx];

          var topControls = '<div class="flex flex-wrap items-center justify-between gap-3 mb-4 bg-white border border-slate-200 rounded-2xl p-4">' +
            '<div class="flex items-center gap-2"><span class="text-sm font-bold">Đang chọn món tại Bàn ' + tableNumber + '</span>' +
            '<select id="table-select" class="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50">' +
            Array.from({ length: config.tableCount || 12 }, function (_, idx) {
              var n = idx + 1;
              return '<option value="' + n + '"' + (n === tableNumber ? ' selected' : '') + '>Bàn ' + n + '</option>';
            }).join('') + '</select></div>' +
            '<div class="flex gap-1 p-1 bg-slate-100 rounded-lg">' +
            '<button id="mode-card" class="px-3 py-1.5 text-xs rounded-md ' + (fnbViewMode === 'card' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600') + '">Thẻ lớn</button>' +
            '<button id="mode-grid" class="px-3 py-1.5 text-xs rounded-md ' + (fnbViewMode === 'grid' ? 'bg-white font-semibold shadow-sm' : 'text-slate-600') + '">Lưới</button>' +
            '</div></div>';

          var mainMenu = '';
          if (fnbViewMode === 'card' && activeDish) {
            var cur = pendingCart[activeDish.id] || { qty: 0, note: '' };
            mainMenu = '<div class="bg-white border border-slate-200 rounded-3xl overflow-hidden">' +
              '<div class="relative aspect-4/3 sm:aspect-16/10 bg-slate-100">' +
              '<img src="' + esc(activeDish.imageUrl) + '" data-fallback="' + esc(activeDish.name) + '" class="w-full h-full object-cover" />' +
              '<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5 text-white">' +
              '<p class="text-xs text-white/80">' + esc(activeDish.category) + ' · ' + (cardIdx + 1) + '/' + list.length + '</p>' +
              '<h2 class="text-2xl font-bold mt-1">' + esc(activeDish.name) + '</h2>' +
              '<p class="text-xl font-bold tabular-nums text-emerald-300 mt-1">' + vnd(activeDish.price) + '</p></div>' +
              '<button id="prev-dish" class="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 text-slate-900 font-bold shadow">‹</button>' +
              '<button id="next-dish" class="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/90 text-slate-900 font-bold shadow">›</button>' +
              '</div><div class="p-5 space-y-4">' +
              '<p class="text-sm text-slate-600">' + esc(activeDish.description) + '</p>' +
              '<div class="flex flex-col sm:flex-row gap-3">' +
              '<div class="flex items-center gap-3">' +
              '<button data-fnb-minus="' + esc(activeDish.id) + '" class="w-11 h-11 rounded-xl border border-slate-200 font-bold">−</button>' +
              '<span class="w-8 text-center text-lg font-bold tabular-nums">' + cur.qty + '</span>' +
              '<button data-fnb-plus="' + esc(activeDish.id) + '" class="w-11 h-11 rounded-xl bg-[#0F766E] text-white font-bold">+</button>' +
              '</div>' +
              '<input data-fnb-note="' + esc(activeDish.id) + '" value="' + esc(cur.note) + '" placeholder="Ghi chú (ít đá, không hành)..." class="flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl" />' +
              '</div></div></div>';
          } else {
            mainMenu = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' +
              list.map(function (d) {
                var cur = pendingCart[d.id] || { qty: 0, note: '' };
                return '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">' +
                  '<div class="aspect-4/3 bg-slate-100"><img src="' + esc(d.imageUrl) + '" data-fallback="' + esc(d.name) + '" class="w-full h-full object-cover" /></div>' +
                  '<div class="p-4 space-y-3"><h3 class="font-bold text-slate-900">' + esc(d.name) + '</h3>' +
                  '<p class="font-bold tabular-nums text-[#0F766E]">' + vnd(d.price) + '</p>' +
                  '<div class="flex items-center gap-2">' +
                  '<button data-fnb-minus="' + esc(d.id) + '" class="w-10 h-10 rounded-lg border border-slate-200 font-bold">−</button>' +
                  '<span class="w-8 text-center font-bold tabular-nums">' + cur.qty + '</span>' +
                  '<button data-fnb-plus="' + esc(d.id) + '" class="w-10 h-10 rounded-lg bg-[#0F766E] text-white font-bold">+</button>' +
                  '</div></div></div>';
              }).join('') + '</div>';
          }

          var pendingList = Object.keys(pendingCart).map(function (id) {
            var p = products.find(function (x) { return x.id === id; });
            return p ? Object.assign({}, p, { qty: pendingCart[id].qty, note: pendingCart[id].note }) : null;
          }).filter(Boolean);
          var pCount = pendingList.reduce(function (s, i) { return s + i.qty; }, 0);
          var pTotal = pendingList.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
          var subTotal = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);

          var summaryBox = '<div class="mt-6 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">' +
            '<div class="flex flex-wrap items-center justify-between gap-3">' +
            '<div><p class="text-sm font-bold">Đơn mới chọn: ' + pCount + ' món (' + vnd(pTotal) + ')</p>' +
            '<p class="text-xs text-slate-500">Đã gửi bếp: ' + submittedItems.reduce(function (s, i) { return s + i.qty; }, 0) + ' món · Tạm tính: ' + vnd(subTotal) + '</p></div>' +
            '<div class="flex gap-2">' +
            '<button id="btn-submit-order" ' + (pCount === 0 ? 'disabled' : '') + ' class="px-4 py-2.5 bg-[#0F766E] disabled:bg-slate-200 text-white text-xs font-semibold rounded-xl">Xác nhận đặt món</button>' +
            '<button id="btn-req-pay" ' + (submittedItems.length === 0 ? 'disabled' : '') + ' class="px-4 py-2.5 bg-slate-900 disabled:bg-slate-200 text-white text-xs font-semibold rounded-xl">Yêu cầu thanh toán</button>' +
            '</div></div></div>';

          app.innerHTML = topControls + filterBar + mainMenu + summaryBox;
        }

        bindImages();
        bindEvents(list);
      }

      function bindEvents(list) {
        var si = document.getElementById('search-input');
        if (si) si.oninput = function (e) { search = e.target.value; render(); };

        document.querySelectorAll('[data-cat]').forEach(function (btn) {
          btn.onclick = function () { activeCat = btn.getAttribute('data-cat'); render(); };
        });

        document.querySelectorAll('[data-add]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-add');
            var p = products.find(function (x) { return x.id === id; });
            if (!p) return;
            var found = bag.find(function (x) { return x.productId === p.id; });
            if (found) found.qty += 1;
            else bag.push({ productId: p.id, sku: p.sku, name: p.name, price: p.price, costPrice: p.costPrice || 0, unit: p.unit, qty: 1, imageUrl: p.imageUrl });
            render();
          };
        });

        var ts = document.getElementById('table-select');
        if (ts) ts.onchange = function (e) { tableNumber = Number(e.target.value); render(); };
        var mc = document.getElementById('mode-card');
        if (mc) mc.onclick = function () { fnbViewMode = 'card'; render(); };
        var mg = document.getElementById('mode-grid');
        if (mg) mg.onclick = function () { fnbViewMode = 'grid'; render(); };
        var pd = document.getElementById('prev-dish');
        if (pd) pd.onclick = function () { cardIdx = cardIdx === 0 ? list.length - 1 : cardIdx - 1; render(); };
        var nd = document.getElementById('next-dish');
        if (nd) nd.onclick = function () { cardIdx = (cardIdx + 1) % list.length; render(); };

        document.querySelectorAll('[data-fnb-plus]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-fnb-plus');
            var cur = pendingCart[id] || { qty: 0, note: '' };
            cur.qty += 1;
            pendingCart[id] = cur;
            render();
          };
        });
        document.querySelectorAll('[data-fnb-minus]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-fnb-minus');
            var cur = pendingCart[id];
            if (!cur) return;
            cur.qty -= 1;
            if (cur.qty <= 0) delete pendingCart[id];
            render();
          };
        });
        document.querySelectorAll('[data-fnb-note]').forEach(function (inp) {
          inp.oninput = function (e) {
            var id = inp.getAttribute('data-fnb-note');
            var cur = pendingCart[id] || { qty: 1, note: '' };
            cur.note = e.target.value;
            pendingCart[id] = cur;
          };
        });

        var subBtn = document.getElementById('btn-submit-order');
        if (subBtn) subBtn.onclick = async function () {
          var items = Object.keys(pendingCart).map(function (id) {
            var p = products.find(function (x) { return x.id === id; });
            return { productId: p.id, sku: p.sku, name: p.name, price: p.price, costPrice: p.costPrice || 0, unit: p.unit, qty: pendingCart[id].qty, note: pendingCart[id].note };
          });
          submittedItems = submittedItems.concat(items);
          pendingCart = {};
          var total = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
          await postGas('placeOrder', {
            tableNumber: tableNumber,
            status: 'occupied',
            totalAmount: total,
            lastOrderId: 'B' + tableNumber + '-' + Date.now().toString().slice(-4),
            items: submittedItems
          });
          render();
        };

        var payBtn = document.getElementById('btn-req-pay');
        if (payBtn) payBtn.onclick = async function () {
          var total = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
          await postGas('requestPayment', {
            tableNumber: tableNumber,
            status: 'payment_requested',
            totalAmount: total,
            lastOrderId: 'PAY-B' + tableNumber,
            items: submittedItems
          });
          showQRModal('Tạm tính Bàn ' + tableNumber, total, 'BAN ' + tableNumber);
        };
      }

      function openBagModal() {
        var root = document.getElementById('modal-root');
        var total = bag.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
        root.innerHTML = '<div class="fixed inset-0 z-50 bg-slate-950/50 flex justify-end">' +
          '<div class="w-full max-w-md bg-white h-full p-5 flex flex-col justify-between">' +
          '<div class="flex items-center justify-between border-b pb-3"><h3 class="text-lg font-bold">Giỏ hàng mang đi</h3><button id="close-bag" class="text-sm text-slate-500">Đóng</button></div>' +
          '<div class="flex-1 overflow-y-auto py-4 space-y-3">' +
          (bag.length ? bag.map(function (i) {
            return '<div class="flex justify-between text-sm border-b pb-2"><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="tabular-nums font-bold">' + vnd(i.price * i.qty) + '</span></div>';
          }).join('') : '<p class="text-sm text-slate-500 text-center py-8">Giỏ hàng trống.</p>') +
          '</div>' +
          '<div class="border-t pt-4 space-y-3">' +
          '<div class="flex justify-between font-bold text-base"><span>Tổng cộng</span><span class="tabular-nums text-[#0F766E]">' + vnd(total) + '</span></div>' +
          '<button id="bag-pay" ' + (!bag.length ? 'disabled' : '') + ' class="w-full py-3 bg-[#0F766E] disabled:bg-slate-200 text-white text-sm font-semibold rounded-xl">Thanh toán VietQR</button>' +
          '</div></div></div>';
        document.getElementById('close-bag').onclick = function () { root.innerHTML = ''; };
        document.getElementById('bag-pay').onclick = function () {
          showQRModal('Thanh toán đơn mang đi', total, 'MANG DI');
        };
      }

      Promise.all([
        fetch('./config.json').then(function (r) { return r.json(); }),
        fetch('./products.json').then(function (r) { return r.json(); })
      ]).then(function (res) {
        config = res[0];
        products = res[1];
        document.getElementById('shop-name').textContent = config.shopName;
        document.getElementById('shop-sub').textContent = (config.address || '') + ' · SĐT: ' + (config.phone || '');
        render();
      }).catch(function () {
        document.getElementById('app').innerHTML = '<div class="p-8 text-center text-sm text-red-700">Không tải được dữ liệu cửa hàng (config.json / products.json).</div>';
      });
    })();
  </script>
</body>
</html>`;
}

export function buildTenantAdminHTML(config: ShopConfig): string {
  const safeName = config.shopName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quản lý ${safeName} — HKDVN</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #F8F9FA; color: #111827; }
    h1, h2, h3 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .tabular-nums { font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <header class="no-print sticky top-0 z-30 bg-white border-b border-slate-200">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
      <div class="min-w-0">
        <h1 id="admin-shop-title" class="text-lg font-bold text-slate-900 truncate">${safeName}</h1>
        <p class="text-xs text-slate-500">Trang quản lý độc lập của chủ cửa hàng</p>
      </div>
      <nav class="flex items-center gap-2 sm:gap-4 text-xs font-semibold">
        <button data-tab="ops" class="tab-btn px-3 py-2 rounded-lg bg-teal-50 text-[#0F766E]">Quầy &amp; Đơn hàng</button>
        <button data-tab="catalog" class="tab-btn px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Sản phẩm &amp; WebP</button>
        <button data-tab="revenue" class="tab-btn px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Doanh thu &amp; Cài đặt</button>
        <a href="./" class="px-3 py-2 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap">Xem trang khách</a>
      </nav>
    </div>
  </header>

  <main id="admin-app" class="flex-1 max-w-7xl w-full mx-auto px-4 py-6"></main>
  <div id="admin-modal"></div>

  <script>
    (function () {
      var config = null;
      var products = [];
      var activeTab = 'ops';
      var posCart = [];
      var tableOrders = [];
      var invoices = JSON.parse(localStorage.getItem('hkdvn_tenant_invoices') || '[]');
      var ghToken = '';
      var compressedImg = null;
      var pollTimer = null;
      var lastSnapshot = {};

      function vnd(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ'; }
      function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      function toBase64Utf8(str) {
        var bytes = new TextEncoder().encode(str);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
      function speakVN(msg) {
        try {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(msg);
            u.lang = 'vi-VN';
            window.speechSynthesis.speak(u);
          }
        } catch (e) {}
      }

      async function ghPut(filePath, base64Content, message) {
        var owner = config.infra.githubOwner;
        var repo = config.infra.githubRepo;
        if (!owner || !repo || !ghToken) throw new Error('Vui lòng nhập GitHub Token (quyền repo) để xuất bản thay đổi.');
        var sha = undefined;
        try {
          var info = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath, {
            headers: { Authorization: 'Bearer ' + ghToken }
          });
          if (info.ok) sha = (await info.json()).sha;
        } catch (e) {}
        var body = { message: message, content: base64Content };
        if (sha) body.sha = sha;
        var res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath, {
          method: 'PUT',
          headers: { Authorization: 'Bearer ' + ghToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Không thể cập nhật tệp ' + filePath + ' lên GitHub.');
      }

      async function compressToWebP(file) {
        var img = await new Promise(function (resolve, reject) {
          var r = new FileReader();
          r.onload = function () {
            var i = new Image();
            i.onload = function () { resolve(i); };
            i.onerror = reject;
            i.src = r.result;
          };
          r.readAsDataURL(file);
        });
        var minSide = Math.min(img.width, img.height);
        var sx = Math.floor((img.width - minSide) / 2);
        var sy = Math.floor((img.height - minSide) / 2);
        var side = Math.min(minSide, 800);
        var c = document.createElement('canvas');
        c.width = side; c.height = side;
        c.getContext('2d').drawImage(img, sx, sy, minSide, minSide, 0, 0, side, side);
        var q = 0.82;
        var dataUrl = c.toDataURL('image/webp', q);
        while ((dataUrl.length * 3 / 4 / 1024) > 48 && q > 0.35) {
          q -= 0.1;
          dataUrl = c.toDataURL('image/webp', q);
        }
        return { dataUrl: dataUrl, base64: dataUrl.split(',')[1], kb: Math.round((dataUrl.length * 3 / 4 / 1024) * 10) / 10 };
      }

      async function pollGasOrders() {
        var url = config && config.infra && config.infra.gasEndpointUrl;
        if (!url || config.model !== 'fnb') return;
        try {
          var res = await fetch(url + '?action=poll');
          var data = await res.json();
          if (data && data.orders) {
            data.orders.forEach(function (o) {
              var sig = o.status + '-' + o.lastOrderId + '-' + o.updatedAt;
              if (lastSnapshot[o.tableNumber] && lastSnapshot[o.tableNumber] !== sig) {
                if (o.status === 'payment_requested') speakVN('Bàn số ' + o.tableNumber + ' yêu cầu thanh toán');
                else speakVN('Bàn số ' + o.tableNumber + ' có đơn mới');
              }
              lastSnapshot[o.tableNumber] = sig;
            });
            tableOrders = data.orders;
            if (activeTab === 'ops') render();
          }
        } catch (e) {}
      }

      function saveInvoiceLocal(inv) {
        invoices.unshift(inv);
        localStorage.setItem('hkdvn_tenant_invoices', JSON.stringify(invoices));
      }

      function render() {
        document.querySelectorAll('.tab-btn').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          b.className = 'tab-btn px-3 py-2 rounded-lg ' + (t === activeTab ? 'bg-teal-50 text-[#0F766E]' : 'text-slate-600 hover:bg-slate-100');
        });

        var root = document.getElementById('admin-app');
        if (activeTab === 'ops') {
          if (config.model === 'retail') {
            var total = posCart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
            root.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">' +
              '<div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">' +
              '<h2 class="text-base font-bold">POS Tính tiền nhanh</h2>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              products.map(function (p) {
                return '<button data-pos-add="' + esc(p.id) + '" class="p-3 border border-slate-200 rounded-xl flex items-center gap-3 text-left hover:border-[#0F766E]">' +
                  '<img src="' + esc(p.imageUrl) + '" class="w-12 h-12 rounded-lg object-cover bg-slate-100" />' +
                  '<div class="min-w-0 flex-1"><p class="text-sm font-semibold truncate">' + esc(p.name) + '</p><p class="text-xs font-bold tabular-nums text-[#0F766E]">' + vnd(p.price) + '</p></div></button>';
              }).join('') +
              '</div></div>' +
              '<div class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">' +
              '<h2 class="text-base font-bold">Hóa đơn hiện tại</h2>' +
              '<div class="space-y-2">' +
              (posCart.length ? posCart.map(function (i) {
                return '<div class="flex justify-between text-sm border-b pb-2"><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="tabular-nums font-bold">' + vnd(i.price * i.qty) + '</span></div>';
              }).join('') : '<p class="text-sm text-slate-500">Chạm sản phẩm bên trái để thêm vào hóa đơn.</p>') +
              '</div>' +
              '<div class="pt-3 border-t flex justify-between font-bold text-lg"><span>Tổng thu</span><span class="tabular-nums text-[#0F766E]">' + vnd(total) + '</span></div>' +
              '<button id="pos-checkout" ' + (!posCart.length ? 'disabled' : '') + ' class="w-full py-3 bg-[#0F766E] disabled:bg-slate-200 text-white text-sm font-semibold rounded-xl">Xác nhận thu tiền</button>' +
              '</div></div>';

            document.querySelectorAll('[data-pos-add]').forEach(function (b) {
              b.onclick = function () {
                var p = products.find(function (x) { return x.id === b.getAttribute('data-pos-add'); });
                var f = posCart.find(function (x) { return x.productId === p.id; });
                if (f) f.qty += 1; else posCart.push({ productId: p.id, sku: p.sku, name: p.name, price: p.price, qty: 1 });
                render();
              };
            });
            var chk = document.getElementById('pos-checkout');
            if (chk) chk.onclick = async function () {
              var inv = { id: 'POS-' + Date.now().toString().slice(-6), createdAt: new Date().toISOString(), model: 'retail', customerOrTable: 'Khách tại quầy', items: posCart, totalAmount: total, totalCost: 0, profit: total, paymentMethod: 'Tiền mặt / QR' };
              saveInvoiceLocal(inv);
              if (config.infra && config.infra.gasEndpointUrl) {
                fetch(config.infra.gasEndpointUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'recordInvoice', invoice: inv }) });
              }
              posCart = [];
              render();
            };
          } else {
            // F&B Table Dispatch + Printable QR
            var tableCards = Array.from({ length: config.tableCount || 12 }, function (_, idx) {
              var n = idx + 1;
              var ord = tableOrders.find(function (o) { return Number(o.tableNumber) === n; });
              var pay = ord && ord.status === 'payment_requested';
              var occ = Boolean(ord);
              return '<div class="p-4 rounded-xl border ' + (pay ? 'bg-amber-50 border-amber-400' : occ ? 'bg-teal-50 border-[#0F766E]' : 'bg-white border-slate-200') + '">' +
                '<div class="flex justify-between items-center"><span class="font-bold">Bàn ' + n + '</span>' +
                '<a href="./?ban=' + n + '" target="_blank" class="text-[11px] text-[#0F766E] underline">Mở trang bàn</a></div>' +
                '<p class="text-xs mt-1 font-semibold">' + (pay ? 'Yêu cầu tính tiền' : occ ? 'Đang phục vụ' : 'Bàn trống') + '</p>' +
                '<p class="text-base font-bold tabular-nums mt-1">' + vnd(ord ? ord.totalAmount : 0) + '</p>' +
                (ord ? '<button data-collect="' + n + '" class="mt-3 w-full py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-lg">Thu tiền &amp; Trả bàn</button>' : '') +
                '</div>';
            }).join('');

            root.innerHTML = '<div class="space-y-6">' +
              '<div class="no-print flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4">' +
              '<div><h2 class="text-base font-bold">Sơ đồ bàn &amp; Điều phối Bếp</h2><p class="text-xs text-slate-500">Tự động cập nhật đơn từ Google Apps Script mỗi 4 giây.</p></div>' +
              '<button id="btn-gen-qr" class="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg">Hiện &amp; In mã QR từng bàn</button></div>' +
              '<div class="no-print grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">' + tableCards + '</div>' +
              '<div id="qr-sheet" class="grid grid-cols-2 sm:grid-cols-4 gap-4"></div></div>';

            document.querySelectorAll('[data-collect]').forEach(function (b) {
              b.onclick = function () {
                var n = Number(b.getAttribute('data-collect'));
                var ord = tableOrders.find(function (o) { return Number(o.tableNumber) === n; });
                if (!ord) return;
                var inv = { id: 'B' + n + '-' + Date.now().toString().slice(-5), createdAt: new Date().toISOString(), model: 'fnb', customerOrTable: 'Bàn ' + n, items: ord.items || [], totalAmount: ord.totalAmount || 0, totalCost: 0, profit: ord.totalAmount || 0, paymentMethod: 'Tiền mặt / QR' };
                saveInvoiceLocal(inv);
                if (config.infra && config.infra.gasEndpointUrl) {
                  fetch(config.infra.gasEndpointUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: 'recordInvoice', invoice: inv, clearTableNumber: n }) });
                }
                tableOrders = tableOrders.filter(function (o) { return Number(o.tableNumber) !== n; });
                render();
              };
            });

            document.getElementById('btn-gen-qr').onclick = function () {
              var sheet = document.getElementById('qr-sheet');
              var base = location.origin + location.pathname.replace(/admin\\.html$/, '');
              sheet.innerHTML = '<div class="no-print col-span-full flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200"><span class="text-sm font-bold">Mã QR dán bàn (?ban=1..N)</span><button onclick="window.print()" class="px-4 py-2 bg-[#0F766E] text-white text-xs font-semibold rounded-lg">In trang này</button></div>' +
                Array.from({ length: config.tableCount || 12 }, function (_, i) {
                  var n = i + 1;
                  return '<div class="bg-white border border-slate-200 rounded-xl p-4 text-center"><p class="font-bold">BÀN ' + n + '</p><img id="tqr-' + n + '" class="w-36 h-36 mx-auto my-2" /><p class="text-[11px] text-slate-500">?ban=' + n + '</p></div>';
                }).join('');
              if (window.QRCode && window.QRCode.toDataURL) {
                for (var i = 1; i <= (config.tableCount || 12); i++) {
                  (function (num) {
                    window.QRCode.toDataURL(base + '?ban=' + num, { width: 200 }, function (err, url) {
                      var el = document.getElementById('tqr-' + num);
                      if (!err && el) el.src = url;
                    });
                  })(i);
                }
              }
            };
          }
        } else if (activeTab === 'catalog') {
          root.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">' +
            '<form id="prod-form" class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">' +
            '<h2 class="text-base font-bold">Thêm sản phẩm &amp; Nén ảnh WebP</h2>' +
            '<input id="gh-pat" type="password" value="' + esc(ghToken) + '" placeholder="GitHub Token (quyền repo) để lưu lên GitHub" class="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg" />' +
            '<div class="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"><span class="text-xs font-medium">Ảnh WebP 800×800</span><input id="img-file" type="file" accept="image/*" capture="environment" class="text-xs w-44" /></div>' +
            '<p id="img-info" class="text-xs text-emerald-700"></p>' +
            '<input id="p-name" required placeholder="Tên sản phẩm / món" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />' +
            '<div class="grid grid-cols-2 gap-2">' +
            '<input id="p-sku" placeholder="Mã SKU / Barcode" class="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg" />' +
            '<input id="p-price" required type="number" placeholder="Giá bán (VNĐ)" class="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg" />' +
            '<input id="p-cat" value="Chung" placeholder="Danh mục" class="px-3 py-2 text-sm border border-slate-200 rounded-lg" />' +
            '<input id="p-unit" value="Phần" placeholder="Đơn vị" class="px-3 py-2 text-sm border border-slate-200 rounded-lg" />' +
            '</div>' +
            '<button type="submit" class="w-full py-3 bg-[#0F766E] text-white text-sm font-semibold rounded-xl">Lưu &amp; Xuất bản lên GitHub</button>' +
            '<p id="pub-msg" class="text-xs text-[#0F766E]"></p></form>' +
            '<div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">' +
            products.map(function (p) {
              return '<div class="p-4 flex items-center justify-between gap-3"><div class="flex items-center gap-3 min-w-0">' +
                '<img src="' + esc(p.imageUrl) + '" class="w-12 h-12 rounded-lg object-cover bg-slate-100" />' +
                '<div class="min-w-0"><p class="text-sm font-bold truncate">' + esc(p.name) + '</p><p class="text-xs text-slate-500">' + esc(p.category) + ' · ' + vnd(p.price) + '</p></div></div>' +
                '<button data-del="' + esc(p.id) + '" class="text-xs text-red-700 font-semibold">Xóa</button></div>';
            }).join('') + '</div></div>';

          document.getElementById('gh-pat').oninput = function (e) { ghToken = e.target.value.trim(); };
          document.getElementById('img-file').onchange = async function (e) {
            if (!e.target.files[0]) return;
            compressedImg = await compressToWebP(e.target.files[0]);
            document.getElementById('img-info').textContent = 'Đã nén WebP 800×800 (' + compressedImg.kb + 'KB)';
          };
          document.getElementById('prod-form').onsubmit = async function (e) {
            e.preventDefault();
            var msg = document.getElementById('pub-msg');
            try {
              var sku = document.getElementById('p-sku').value.trim() || ('SP-' + Date.now().toString().slice(-5));
              var imgUrl = products[0] ? products[0].imageUrl : '';
              if (compressedImg) {
                var imgPath = 'assets/img/' + sku.replace(/[^a-zA-Z0-9_-]/g, '') + '.webp';
                await ghPut(imgPath, compressedImg.base64, 'Tải ảnh WebP ' + sku);
                imgUrl = './' + imgPath;
              }
              products.push({
                id: 'sp-' + Date.now(), sku: sku, name: document.getElementById('p-name').value.trim(),
                price: Number(document.getElementById('p-price').value) || 0, costPrice: 0,
                category: document.getElementById('p-cat').value.trim() || 'Chung',
                unit: document.getElementById('p-unit').value.trim() || 'Phần',
                stock: 50, status: 'Còn hàng', imageUrl: imgUrl, description: '', model: config.model
              });
              await ghPut('products.json', toBase64Utf8(JSON.stringify(products, null, 2)), 'Cập nhật danh mục sản phẩm');
              compressedImg = null;
              msg.textContent = 'Đã lưu & xuất bản lên GitHub thành công!';
              render();
            } catch (err) { msg.textContent = err.message; }
          };
          document.querySelectorAll('[data-del]').forEach(function (b) {
            b.onclick = async function () {
              products = products.filter(function (x) { return x.id !== b.getAttribute('data-del'); });
              if (ghToken) await ghPut('products.json', toBase64Utf8(JSON.stringify(products, null, 2)), 'Xóa sản phẩm');
              render();
            };
          });
        } else {
          var totalRev = invoices.reduce(function (s, i) { return s + (i.totalAmount || 0); }, 0);
          root.innerHTML = '<div class="space-y-6">' +
            '<div class="bg-white border border-slate-200 rounded-2xl p-5 flex justify-between items-center"><div><p class="text-xs text-slate-500">Doanh thu ghi nhận trên máy</p><p class="text-2xl font-bold tabular-nums text-[#0F766E]">' + vnd(totalRev) + '</p></div><p class="text-xs text-slate-500">Số hóa đơn: ' + invoices.length + '</p></div>' +
            '<div class="bg-white border border-slate-200 rounded-2xl overflow-hidden"><table class="w-full text-left text-sm"><thead class="bg-slate-50 text-xs text-slate-500"><tr><th class="p-3">Mã HĐ</th><th class="p-3">Bàn / Khách</th><th class="p-3 text-right">Tổng tiền</th></tr></thead><tbody class="divide-y">' +
            invoices.map(function (i) { return '<tr><td class="p-3 font-mono text-xs">' + esc(i.id) + '</td><td class="p-3">' + esc(i.customerOrTable) + '</td><td class="p-3 text-right tabular-nums font-bold">' + vnd(i.totalAmount) + '</td></tr>'; }).join('') +
            '</tbody></table></div></div>';
        }
      }

      document.querySelectorAll('.tab-btn').forEach(function (b) {
        b.onclick = function () { activeTab = b.getAttribute('data-tab'); render(); };
      });

      Promise.all([
        fetch('./config.json').then(function (r) { return r.json(); }),
        fetch('./products.json').then(function (r) { return r.json(); })
      ]).then(function (res) {
        config = res[0];
        products = res[1];
        document.getElementById('admin-shop-title').textContent = config.shopName;
        render();
        if (config.model === 'fnb') {
          pollGasOrders();
          pollTimer = setInterval(pollGasOrders, 4000);
        }
      }).catch(function () {
        document.getElementById('admin-app').innerHTML = '<div class="p-8 text-center text-sm text-red-700">Không tải được dữ liệu cửa hàng.</div>';
      });
    })();
  </script>
</body>
</html>`;
}

import { ShopConfig } from '../types';

export function buildTenantStorefrontHTML(config: ShopConfig): string {
  const safeName = config.shopName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${safeName} — Thực đơn &amp; Đặt món</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #F8F9FA; color: #111827; -webkit-tap-highlight-color: transparent; }
    h1, h2, h3 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .tabular-nums { font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace; }
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <header class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="max-w-5xl mx-auto px-3.5 sm:px-5 h-14 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 id="shop-name" class="text-base sm:text-lg font-bold text-slate-900 truncate">${safeName}</h1>
        <p id="shop-sub" class="text-[11px] text-slate-500 truncate"></p>
      </div>
      <div id="header-right" class="flex items-center gap-2 shrink-0"></div>
    </div>
  </header>

  <div class="sticky top-14 z-20 bg-[#F8F9FA]/95 backdrop-blur border-b border-slate-200/70">
    <div class="max-w-5xl mx-auto px-3.5 sm:px-5 py-2.5 space-y-2.5">
      <div class="relative">
        <svg class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search-input" type="search" placeholder="Tìm món ăn, đồ uống không dấu (vd: pho bo, ca phe)..." class="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0F766E]/25 focus:border-[#0F766E]" />
      </div>
      <div id="cat-bar" class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"></div>
    </div>
  </div>

  <main id="app" class="flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-5 py-4 pb-36"></main>

  <div id="bottom-dock" class="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"></div>
  <div id="toast-root" class="fixed top-16 inset-x-0 z-50 flex justify-center px-4 pointer-events-none"></div>
  <div id="modal-root"></div>

  <script>
    (function () {
      var config = null;
      var products = [];
      var search = '';
      var activeCat = 'Tất cả';
      var bag = [];
      var pendingCart = {};
      var tableNumber = Number(new URLSearchParams(location.search).get('ban')) || 1;
      var submittedItems = [];
      var storageBridgeKey = 'hkdvn_live_bridge_' + location.pathname.replace(/[^a-zA-Z0-9]/g, '_');

      function noAccent(str) {
        return String(str || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
      }
      function vnd(n) {
        return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ';
      }
      function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function showToast(msg, isErr) {
        var root = document.getElementById('toast-root');
        root.innerHTML = '<div class="pointer-events-auto max-w-md w-full px-4 py-3 rounded-xl shadow-lg text-xs font-semibold text-white flex items-center justify-between gap-2 ' + (isErr ? 'bg-red-700' : 'bg-[#0F766E]') + '">' +
          '<span>' + esc(msg) + '</span></div>';
        clearTimeout(window.__hkdvnToastTimer);
        window.__hkdvnToastTimer = setTimeout(function () { root.innerHTML = ''; }, 3600);
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

      function saveLiveBridge(payload) {
        try {
          var existing = JSON.parse(localStorage.getItem(storageBridgeKey) || '{}');
          existing[String(payload.tableNumber)] = Object.assign({}, payload, { updatedAt: new Date().toISOString() });
          localStorage.setItem(storageBridgeKey, JSON.stringify(existing));
        } catch (e) {}
      }

      function getGasUrl() {
        try {
          var localOverride = localStorage.getItem('hkdvn_gas_override_' + (config && config.infra ? config.infra.githubRepo : ''));
          if (localOverride) return localOverride;
        } catch (e) {}
        return config && config.infra && config.infra.gasEndpointUrl ? config.infra.gasEndpointUrl.trim() : '';
      }

      async function postGas(action, payload) {
        saveLiveBridge(Object.assign({ action: action }, payload));
        var url = getGasUrl();
        if (!url) {
          showToast('Đã ghi nhận trên máy. Lưu ý: Chưa cấu hình link Apps Script (/exec) để đồng bộ sang quầy.', true);
          return false;
        }
        try {
          await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(Object.assign({ action: action }, payload))
          });
          return true;
        } catch (e) {
          showToast('Không thể gửi tới máy chủ Google Apps Script. Vui lòng kiểm tra mạng.', true);
          return false;
        }
      }

      function fallbackThumbHTML(title) {
        return '<div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-teal-50/60 text-slate-400 p-3 text-center">' +
          '<svg class="w-7 h-7 text-[#0F766E]/45 mb-1" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>' +
          '<span class="text-[11px] font-medium text-slate-500 line-clamp-2">' + esc(title) + '</span></div>';
      }

      function bindImages() {
        document.querySelectorAll('img[data-fallback]').forEach(function (img) {
          img.onerror = function () {
            if (img.parentElement) img.parentElement.innerHTML = fallbackThumbHTML(img.getAttribute('data-fallback'));
          };
        });
      }

      function showQRModal(title, amount, desc, subtitle) {
        var root = document.getElementById('modal-root');
        var payload = buildVietQR(amount, desc);
        root.innerHTML = '<div class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center p-0 sm:p-4">' +
          '<div class="bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-w-sm w-full p-5 space-y-4">' +
          '<div class="flex items-center justify-between"><h3 class="text-base font-bold">' + esc(title) + '</h3>' +
          '<button id="close-qr" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg">Đóng</button></div>' +
          (subtitle ? '<p class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-medium">' + esc(subtitle) + '</p>' : '') +
          '<div class="flex flex-col items-center">' +
          '<img id="qr-img" class="w-52 h-52 border border-slate-200 rounded-xl p-2 bg-white" alt="VietQR" />' +
          '<p class="mt-3 text-2xl font-bold tabular-nums text-[#0F766E]">' + vnd(amount) + '</p>' +
          '<p class="text-xs text-slate-500 mt-1 text-center">' + esc(config.bank.bankShortName) + ' · ' + esc(config.bank.accountNumber) + ' · ' + esc(config.bank.accountName) + '</p>' +
          '</div></div></div>';
        document.getElementById('close-qr').onclick = function () { root.innerHTML = ''; };
        if (window.QRCode && window.QRCode.toDataURL) {
          window.QRCode.toDataURL(payload, { width: 260, margin: 2 }, function (err, url) {
            if (!err && document.getElementById('qr-img')) document.getElementById('qr-img').src = url;
          });
        }
      }

      function openSupportAndPaySheet() {
        var root = document.getElementById('modal-root');
        var subTotal = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
        var pTotal = Object.keys(pendingCart).reduce(function (s, id) {
          var p = products.find(function (x) { return x.id === id; });
          return s + (p ? p.price * pendingCart[id].qty : 0);
        }, 0);
        var billAmount = subTotal > 0 ? subTotal : pTotal;

        root.innerHTML = '<div id="sheet-backdrop" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
          '<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">' +
          '<div class="flex items-center justify-between">' +
          '<div><h3 class="text-base font-bold text-slate-900">Bàn ' + tableNumber + ' · Thanh toán &amp; Hỗ trợ</h3>' +
          '<p class="text-xs text-slate-500">Yêu cầu sẽ phát chuông báo ngay tới quầy phục vụ</p></div>' +
          '<button id="close-sheet" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg">Đóng</button></div>' +

          '<div class="p-4 bg-teal-50/60 border border-[#0F766E]/25 rounded-2xl space-y-2.5">' +
          '<div class="flex items-center justify-between"><span class="text-sm font-bold text-slate-900">1. Gọi thanh toán</span>' +
          '<span class="text-sm font-bold tabular-nums text-[#0F766E]">' + vnd(billAmount) + '</span></div>' +
          '<button id="act-call-pay" class="w-full py-3 bg-[#0F766E] hover:bg-[#0D655E] text-white text-sm font-bold rounded-xl">Gửi yêu cầu thanh toán &amp; Hiện VietQR</button>' +
          '</div>' +

          '<div class="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">' +
          '<p class="text-sm font-bold text-slate-900">2. Gọi nhân viên hỗ trợ tại bàn</p>' +
          '<div class="grid grid-cols-2 gap-2">' +
          ['Thêm đá / nước', 'Lấy thêm đũa, muỗng', 'Dọn bàn / khăn giấy', 'Cần hỗ trợ trực tiếp'].map(function (txt) {
            return '<button type="button" data-quick-help="' + esc(txt) + '" class="px-3 py-2.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl text-slate-800 hover:border-[#0F766E] text-left">' + esc(txt) + '</button>';
          }).join('') +
          '</div>' +
          '<input id="help-note" type="text" placeholder="Hoặc nhập yêu cầu khác (tùy chọn)..." class="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl" />' +
          '<button id="act-call-help" class="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl">Gửi yêu cầu hỗ trợ</button>' +
          '</div></div></div>';

        document.getElementById('close-sheet').onclick = function () { root.innerHTML = ''; };
        document.getElementById('sheet-backdrop').onclick = function (e) { if (e.target.id === 'sheet-backdrop') root.innerHTML = ''; };

        document.querySelectorAll('[data-quick-help]').forEach(function (b) {
          b.onclick = function () {
            document.getElementById('help-note').value = b.getAttribute('data-quick-help');
          };
        });

        document.getElementById('act-call-pay').onclick = async function () {
          var ok = await postGas('requestPayment', {
            tableNumber: tableNumber,
            status: 'payment_requested',
            totalAmount: billAmount,
            lastOrderId: 'TT-B' + tableNumber + '-' + Date.now().toString().slice(-4),
            items: submittedItems
          });
          if (ok) showToast('Đã gửi yêu cầu thanh toán Bàn ' + tableNumber + ' tới thu ngân!');
          showQRModal('Thanh toán Bàn ' + tableNumber, billAmount, 'BAN ' + tableNumber, 'Nhân viên thu ngân đã nhận được thông báo thanh toán của Bàn ' + tableNumber + '.');
        };

        document.getElementById('act-call-help').onclick = async function () {
          var note = document.getElementById('help-note').value.trim() || 'Cần nhân viên hỗ trợ tại bàn';
          var ok = await postGas('callSupport', {
            tableNumber: tableNumber,
            status: 'support_requested',
            totalAmount: subTotal,
            lastOrderId: 'HOTRO: ' + note,
            items: submittedItems
          });
          root.innerHTML = '';
          if (ok) showToast('Đã gọi nhân viên hỗ trợ Bàn ' + tableNumber + ': ' + note);
        };
      }

      function openSubmittedModal() {
        var root = document.getElementById('modal-root');
        var subTotal = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
        root.innerHTML = '<div id="sub-backdrop" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
          '<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">' +
          '<div class="flex items-center justify-between border-b border-slate-100 pb-3">' +
          '<h3 class="text-base font-bold">Món đã gửi bếp · Bàn ' + tableNumber + '</h3>' +
          '<button id="close-sub" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg">Đóng</button></div>' +
          '<div class="flex-1 overflow-y-auto space-y-2.5">' +
          (submittedItems.length ? submittedItems.map(function (i) {
            return '<div class="flex justify-between gap-2 text-sm border-b border-slate-100 pb-2">' +
              '<div class="min-w-0"><p class="font-semibold text-slate-900">' + i.qty + ' × ' + esc(i.name) + '</p>' +
              (i.note ? '<p class="text-xs text-slate-500">Ghi chú: ' + esc(i.note) + '</p>' : '') +
              '</div><span class="tabular-nums font-bold text-slate-900 shrink-0">' + vnd(i.price * i.qty) + '</span></div>';
          }).join('') : '<p class="text-sm text-slate-500 py-6 text-center">Chưa có món nào được gửi bếp.</p>') +
          '</div>' +
          '<div class="pt-3 border-t border-slate-100 flex justify-between items-center font-bold">' +
          '<span>Tạm tính</span><span class="text-lg tabular-nums text-[#0F766E]">' + vnd(subTotal) + '</span>' +
          '</div></div></div>';
        document.getElementById('close-sub').onclick = function () { root.innerHTML = ''; };
        document.getElementById('sub-backdrop').onclick = function (e) { if (e.target.id === 'sub-backdrop') root.innerHTML = ''; };
      }

      function openBagModal() {
        var root = document.getElementById('modal-root');
        var total = bag.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
        root.innerHTML = '<div id="bag-backdrop" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
          '<div class="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 flex flex-col max-h-[88vh]">' +
          '<div class="flex items-center justify-between border-b border-slate-100 pb-3"><h3 class="text-base font-bold">Giỏ hàng của bạn</h3>' +
          '<button id="close-bag" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg">Đóng</button></div>' +
          '<div class="flex-1 overflow-y-auto py-3 space-y-2.5">' +
          (bag.length ? bag.map(function (i) {
            return '<div class="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2"><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="tabular-nums font-bold">' + vnd(i.price * i.qty) + '</span></div>';
          }).join('') : '<p class="text-sm text-slate-500 text-center py-8">Giỏ hàng đang trống.</p>') +
          '</div>' +
          '<div class="border-t border-slate-100 pt-4 space-y-3">' +
          '<div class="flex justify-between font-bold text-base"><span>Tổng cộng</span><span class="tabular-nums text-[#0F766E]">' + vnd(total) + '</span></div>' +
          '<button id="bag-pay" ' + (!bag.length ? 'disabled' : '') + ' class="w-full py-3.5 bg-[#0F766E] disabled:bg-slate-200 text-white text-sm font-bold rounded-xl">Thanh toán VietQR</button>' +
          '</div></div></div>';
        document.getElementById('close-bag').onclick = function () { root.innerHTML = ''; };
        document.getElementById('bag-backdrop').onclick = function (e) { if (e.target.id === 'bag-backdrop') root.innerHTML = ''; };
        document.getElementById('bag-pay').onclick = function () {
          showQRModal('Thanh toán đơn hàng', total, 'MANG DI', 'Vui lòng quét mã VietQR để thanh toán.');
        };
      }

      function renderHeaderAndCats() {
        var hr = document.getElementById('header-right');
        if (config.model === 'retail') {
          var count = bag.reduce(function (s, i) { return s + i.qty; }, 0);
          hr.innerHTML = '<button id="bag-btn" type="button" class="px-3.5 py-2 min-h-[40px] bg-[#0F766E] text-white text-xs font-bold rounded-xl whitespace-nowrap">Giỏ (' + count + ')</button>';
          document.getElementById('bag-btn').onclick = openBagModal;
        } else {
          hr.innerHTML = '<select id="table-select" aria-label="Chọn bàn" class="px-3 py-1.5 min-h-[38px] text-xs font-bold text-[#0F766E] bg-teal-50 border border-teal-200 rounded-xl">' +
            Array.from({ length: config.tableCount || 12 }, function (_, idx) {
              var n = idx + 1;
              return '<option value="' + n + '"' + (n === tableNumber ? ' selected' : '') + '>Bàn ' + n + '</option>';
            }).join('') + '</select>';
          document.getElementById('table-select').onchange = function (e) {
            tableNumber = Number(e.target.value);
            renderDock();
          };
        }

        var cats = ['Tất cả'].concat(Array.from(new Set(products.map(function (p) { return p.category; }))));
        var catBar = document.getElementById('cat-bar');
        catBar.innerHTML = cats.map(function (c) {
          var active = c === activeCat;
          return '<button data-cat="' + esc(c) + '" class="px-3.5 py-2 min-h-[36px] text-xs rounded-xl whitespace-nowrap transition-colors ' + (active ? 'bg-[#0F766E] text-white font-semibold' : 'bg-white border border-slate-200 text-slate-700') + '">' + esc(c) + '</button>';
        }).join('');
        catBar.querySelectorAll('[data-cat]').forEach(function (btn) {
          btn.onclick = function () { activeCat = btn.getAttribute('data-cat'); renderMenu(); renderHeaderAndCats(); };
        });
      }

      function renderDock() {
        var dock = document.getElementById('bottom-dock');
        if (config.model === 'retail') {
          var count = bag.reduce(function (s, i) { return s + i.qty; }, 0);
          var total = bag.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
          if (!count) { dock.innerHTML = ''; return; }
          dock.innerHTML = '<div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">' +
            '<div><p class="text-xs text-slate-500">Đang chọn ' + count + ' sản phẩm</p><p class="text-base font-bold tabular-nums text-[#0F766E]">' + vnd(total) + '</p></div>' +
            '<button id="dock-bag" class="px-5 py-3 min-h-[46px] bg-[#0F766E] text-white text-sm font-bold rounded-xl">Xem giỏ &amp; Thanh toán</button></div>';
          document.getElementById('dock-bag').onclick = openBagModal;
          return;
        }

        var pendingList = Object.keys(pendingCart).map(function (id) {
          var p = products.find(function (x) { return x.id === id; });
          return p ? Object.assign({}, p, { qty: pendingCart[id].qty, note: pendingCart[id].note }) : null;
        }).filter(Boolean);
        var pCount = pendingList.reduce(function (s, i) { return s + i.qty; }, 0);
        var pTotal = pendingList.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
        var sCount = submittedItems.reduce(function (s, i) { return s + i.qty; }, 0);
        var sTotal = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);

        dock.innerHTML = '<div class="max-w-5xl mx-auto px-3.5 sm:px-5 py-3 space-y-2.5">' +
          '<div class="flex items-center justify-between gap-2 text-xs">' +
          '<span class="font-semibold text-slate-800">' + (pCount > 0 ? 'Đang chọn: ' + pCount + ' món (' + vnd(pTotal) + ')' : 'Chạm + Chọn món từ thực đơn') + '</span>' +
          '<button id="btn-view-sub" type="button" class="text-[#0F766E] font-semibold underline-offset-2 ' + (sCount > 0 ? 'underline' : 'opacity-60') + '">Đã gọi: ' + sCount + ' món · ' + vnd(sTotal) + '</button>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2.5">' +
          '<button id="btn-submit-order" type="button" ' + (pCount === 0 ? 'disabled' : '') + ' class="min-h-[46px] px-3 bg-[#0F766E] hover:bg-[#0D655E] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl transition-colors">' +
          (pCount > 0 ? 'Gọi món (' + pCount + ')' : 'Gọi món') + '</button>' +
          '<button id="btn-support-pay" type="button" class="min-h-[46px] px-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-colors">Thanh toán / Hỗ trợ</button>' +
          '</div></div>';

        var subViewBtn = document.getElementById('btn-view-sub');
        if (subViewBtn) subViewBtn.onclick = openSubmittedModal;

        var subBtn = document.getElementById('btn-submit-order');
        if (subBtn) subBtn.onclick = async function () {
          var items = Object.keys(pendingCart).map(function (id) {
            var p = products.find(function (x) { return x.id === id; });
            return { productId: p.id, sku: p.sku, name: p.name, price: p.price, costPrice: p.costPrice || 0, unit: p.unit, qty: pendingCart[id].qty, note: pendingCart[id].note };
          });
          submittedItems = submittedItems.concat(items);
          pendingCart = {};
          var total = submittedItems.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
          var ok = await postGas('placeOrder', {
            tableNumber: tableNumber,
            status: 'occupied',
            totalAmount: total,
            lastOrderId: 'B' + tableNumber + '-' + Date.now().toString().slice(-4),
            items: submittedItems
          });
          renderMenu();
          renderDock();
          if (ok) showToast('Đã gửi đơn Bàn ' + tableNumber + ' tới bếp!');
        };

        document.getElementById('btn-support-pay').onclick = openSupportAndPaySheet;
      }

      function renderMenu() {
        var app = document.getElementById('app');
        var list = products.filter(function (p) {
          var catOk = activeCat === 'Tất cả' || p.category === activeCat;
          var qOk = !search || noAccent(p.name).includes(noAccent(search)) || noAccent(p.sku).includes(noAccent(search));
          return catOk && qOk;
        });

        if (!list.length) {
          app.innerHTML = '<div class="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">Không tìm thấy món phù hợp.</div>';
          return;
        }

        app.innerHTML = '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">' +
          list.map(function (p) {
            var out = p.status === 'Hết hàng' || p.stock <= 0;
            var cur = config.model === 'retail'
              ? (function () { var f = bag.find(function (x) { return x.productId === p.id; }); return { qty: f ? f.qty : 0, note: '' }; })()
              : (pendingCart[p.id] || { qty: 0, note: '' });
            var imgHTML = p.imageUrl
              ? '<img src="' + esc(p.imageUrl) + '" data-fallback="' + esc(p.name) + '" alt="' + esc(p.name) + '" class="w-full h-full object-cover" />'
              : fallbackThumbHTML(p.name);

            return '<article class="bg-white border border-slate-200/90 rounded-2xl overflow-hidden flex flex-col">' +
              '<div class="relative aspect-[4/3] bg-slate-100 overflow-hidden">' + imgHTML +
              (cur.qty > 0 ? '<span class="absolute top-2 right-2 px-2 py-0.5 bg-[#0F766E] text-white text-xs font-bold rounded-lg shadow">×' + cur.qty + '</span>' : '') +
              '</div>' +
              '<div class="p-3 flex-1 flex flex-col justify-between gap-2">' +
              '<div>' +
              '<p class="text-[11px] text-slate-500 truncate">' + esc(p.category) + (out ? ' · Hết hàng' : '') + '</p>' +
              '<h2 class="text-[13px] sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 mt-0.5">' + esc(p.name) + '</h2>' +
              (p.description ? '<p class="text-[11px] text-slate-500 mt-1 line-clamp-1">' + esc(p.description) + '</p>' : '') +
              '</div>' +
              '<div class="space-y-2 pt-1">' +
              '<div class="flex items-center justify-between gap-1.5">' +
              '<span class="text-sm font-bold tabular-nums text-[#0F766E]">' + vnd(p.price) + '</span>' +
              (cur.qty === 0
                ? '<button data-plus="' + esc(p.id) + '" ' + (out ? 'disabled' : '') + ' class="px-3 py-1.5 min-h-[36px] bg-teal-50 hover:bg-teal-100 disabled:bg-slate-100 disabled:text-slate-400 text-[#0F766E] text-xs font-bold rounded-xl whitespace-nowrap">+ Chọn</button>'
                : '<div class="flex items-center gap-1">' +
                  '<button data-minus="' + esc(p.id) + '" class="w-8 h-8 rounded-lg border border-slate-200 text-slate-700 font-bold flex items-center justify-center">−</button>' +
                  '<span class="w-5 text-center text-xs font-bold tabular-nums">' + cur.qty + '</span>' +
                  '<button data-plus="' + esc(p.id) + '" class="w-8 h-8 rounded-lg bg-[#0F766E] text-white font-bold flex items-center justify-center">+</button>' +
                  '</div>'
              ) +
              '</div>' +
              (config.model !== 'retail' && cur.qty > 0
                ? '<input data-note="' + esc(p.id) + '" value="' + esc(cur.note) + '" placeholder="Ghi chú món..." class="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F766E]" />'
                : '') +
              '</div></div></article>';
          }).join('') +
          '</div>';

        bindImages();

        app.querySelectorAll('[data-plus]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-plus');
            if (config.model === 'retail') {
              var p = products.find(function (x) { return x.id === id; });
              if (!p) return;
              var found = bag.find(function (x) { return x.productId === id; });
              if (found) found.qty += 1;
              else bag.push({ productId: p.id, sku: p.sku, name: p.name, price: p.price, costPrice: p.costPrice || 0, unit: p.unit, qty: 1, imageUrl: p.imageUrl });
              renderHeaderAndCats();
            } else {
              var cur = pendingCart[id] || { qty: 0, note: '' };
              cur.qty += 1;
              pendingCart[id] = cur;
            }
            renderMenu();
            renderDock();
          };
        });

        app.querySelectorAll('[data-minus]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-minus');
            if (config.model === 'retail') {
              var idx = bag.findIndex(function (x) { return x.productId === id; });
              if (idx >= 0) {
                bag[idx].qty -= 1;
                if (bag[idx].qty <= 0) bag.splice(idx, 1);
              }
              renderHeaderAndCats();
            } else {
              var cur = pendingCart[id];
              if (!cur) return;
              cur.qty -= 1;
              if (cur.qty <= 0) delete pendingCart[id];
            }
            renderMenu();
            renderDock();
          };
        });

        app.querySelectorAll('[data-note]').forEach(function (inp) {
          inp.oninput = function (e) {
            var id = inp.getAttribute('data-note');
            if (pendingCart[id]) pendingCart[id].note = e.target.value;
          };
        });
      }

      document.getElementById('search-input').oninput = function (e) {
        search = e.target.value;
        renderMenu();
      };

      var cacheBust = '?t=' + Date.now();
      Promise.all([
        fetch('./config.json' + cacheBust, { cache: 'no-store' }).then(function (r) { return r.json(); }),
        fetch('./products.json' + cacheBust, { cache: 'no-store' }).then(function (r) { return r.json(); })
      ]).then(function (res) {
        config = res[0];
        products = Array.isArray(res[1]) ? res[1] : [];
        document.getElementById('shop-name').textContent = config.shopName;
        document.getElementById('shop-sub').textContent = (config.address || '') + (config.phone ? ' · ' + config.phone : '');
        renderHeaderAndCats();
        renderMenu();
        renderDock();
      }).catch(function () {
        document.getElementById('app').innerHTML = '<div class="p-8 text-center text-sm text-red-700 bg-white rounded-2xl border border-slate-200">Không tải được dữ liệu thực đơn (config.json / products.json).</div>';
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Quản lý ${safeName} — HKDVN</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #F8F9FA; color: #111827; -webkit-tap-highlight-color: transparent; }
    h1, h2, h3 { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    .tabular-nums { font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <header class="no-print sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-3.5 sm:px-5 h-14 flex items-center justify-between gap-2">
      <div class="min-w-0 flex-1">
        <h1 id="admin-shop-title" class="text-base sm:text-lg font-bold text-slate-900 truncate">${safeName}</h1>
        <p id="sync-status-line" class="text-[11px] text-slate-500 truncate">Đang kết nối dữ liệu...</p>
      </div>

      <nav class="hidden md:flex items-center gap-1.5 text-xs font-semibold">
        <button data-tab="ops" class="desktop-tab px-3 py-2 rounded-lg bg-teal-50 text-[#0F766E]">Quầy &amp; Bàn</button>
        <button data-tab="catalog" class="desktop-tab px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Sản phẩm</button>
        <button data-tab="revenue" class="desktop-tab px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Doanh thu &amp; Cài đặt</button>
      </nav>

      <div class="flex items-center gap-1.5 shrink-0">
        <button id="btn-sound" type="button" aria-label="Bật hoặc tắt âm báo" class="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:bg-slate-50"></button>
        <button id="btn-bell" type="button" aria-label="Thông báo yêu cầu" class="relative w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-800 flex items-center justify-center hover:bg-slate-50">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          <span id="bell-badge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">0</span>
        </button>
      </div>
    </div>
  </header>

  <div id="live-alert-banner" class="no-print max-w-6xl w-full mx-auto px-3.5 sm:px-5"></div>
  <main id="admin-app" class="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-5 py-4 pb-24 md:pb-10"></main>

  <nav class="no-print md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-3 h-16">
    <button data-tab="ops" class="mobile-tab flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-[#0F766E]">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
      <span>Quầy &amp; Bàn</span>
    </button>
    <button data-tab="catalog" class="mobile-tab flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
      <span>Sản phẩm</span>
    </button>
    <button data-tab="revenue" class="mobile-tab flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-slate-500">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
      <span>Doanh thu</span>
    </button>
  </nav>

  <div id="admin-modal"></div>

  <script>
    (function () {
      var config = null;
      var products = [];
      var activeTab = 'ops';
      var posCart = [];
      var tableOrders = [];
      var invoices = JSON.parse(localStorage.getItem('hkdvn_tenant_invoices') || '[]');
      var ghStorageKey = 'hkdvn_tenant_gh_token_' + location.pathname;
      var storageBridgeKey = 'hkdvn_live_bridge_' + location.pathname.replace(/admin\\.html$/, '').replace(/[^a-zA-Z0-9]/g, '_');
      var ghToken = '';
      try {
        var hashParams = new URLSearchParams((location.hash || '').replace(/^#/, ''));
        var transferredToken = hashParams.get('gh_token');
        if (transferredToken) {
          ghToken = transferredToken.trim();
          localStorage.setItem(ghStorageKey, ghToken);
          history.replaceState(null, '', location.pathname + location.search);
        } else {
          ghToken = localStorage.getItem(ghStorageKey) || '';
        }
      } catch (e) {
        ghToken = localStorage.getItem(ghStorageKey) || '';
      }

      var compressedImg = null;
      var pollTimer = null;
      var lastSnapshot = {};
      var firstPollDone = false;
      var notifications = [];
      var unreadCount = 0;
      var soundEnabled = true;
      var syncStatusText = 'Đang kiểm tra kết nối...';
      var syncHasError = false;
      var pendingDeleteId = null;

      function vnd(n) { return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ'; }
      function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
      function fmtTime(iso) {
        try { return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return ''; }
      }
      function toBase64Utf8(str) {
        var bytes = new TextEncoder().encode(str);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }

      function playAlertTone() {
        if (!soundEnabled) return;
        try {
          var Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          var ctx = new Ctx();
          [880, 1175].forEach(function (freq, idx) {
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.08, ctx.currentTime + idx * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.14 + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.14);
            osc.stop(ctx.currentTime + idx * 0.14 + 0.26);
          });
        } catch (e) {}
      }

      function speakVN(msg) {
        if (!soundEnabled) return;
        playAlertTone();
        try {
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(msg);
            u.lang = 'vi-VN';
            u.rate = 1.05;
            window.speechSynthesis.speak(u);
          }
        } catch (e) {}
      }

      function updateSoundButton() {
        var btn = document.getElementById('btn-sound');
        if (!btn) return;
        btn.innerHTML = soundEnabled
          ? '<svg class="w-4 h-4 text-[#0F766E]" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'
          : '<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>';
      }

      function updateBellUI() {
        var badge = document.getElementById('bell-badge');
        var bell = document.getElementById('btn-bell');
        if (badge) {
          if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
            badge.classList.remove('hidden');
            bell.classList.add('border-red-300', 'bg-red-50', 'text-red-700');
          } else {
            badge.classList.add('hidden');
            bell.classList.remove('border-red-300', 'bg-red-50', 'text-red-700');
          }
        }
        var banner = document.getElementById('live-alert-banner');
        if (banner) {
          var latestUnread = notifications.find(function (n) { return !n.read; });
          if (latestUnread) {
            banner.innerHTML = '<div class="mt-3 p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-3">' +
              '<div class="min-w-0"><p class="text-xs font-bold text-amber-900 truncate">' + esc(latestUnread.title) + '</p>' +
              '<p class="text-[11px] text-amber-800 truncate">' + esc(latestUnread.detail) + '</p></div>' +
              '<button id="banner-open-notif" class="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-xl shrink-0">Xem</button></div>';
            document.getElementById('banner-open-notif').onclick = function () {
              openTableDetailSheet(latestUnread.tableNumber);
              latestUnread.read = true;
              unreadCount = notifications.filter(function (n) { return !n.read; }).length;
              updateBellUI();
            };
          } else {
            banner.innerHTML = '';
          }
        }
      }

      function updateSyncStatusUI() {
        var el = document.getElementById('sync-status-line');
        if (!el) return;
        el.textContent = syncStatusText;
        el.className = 'text-[11px] truncate ' + (syncHasError ? 'text-amber-700 font-medium' : 'text-slate-500');
      }

      function getGasUrl() {
        try {
          var key = 'hkdvn_gas_override_' + (config && config.infra ? config.infra.githubRepo : '');
          var ov = localStorage.getItem(key);
          if (ov) return ov.trim();
        } catch (e) {}
        return config && config.infra && config.infra.gasEndpointUrl ? config.infra.gasEndpointUrl.trim() : '';
      }

      function saveGasOverride(url) {
        try {
          var key = 'hkdvn_gas_override_' + (config && config.infra ? config.infra.githubRepo : '');
          if (url) localStorage.setItem(key, url.trim());
          else localStorage.removeItem(key);
        } catch (e) {}
      }

      function pushNotification(order) {
        var isPay = order.status === 'payment_requested';
        var isHelp = order.status === 'support_requested';
        var title = isPay
          ? 'Bàn ' + order.tableNumber + ' yêu cầu thanh toán'
          : isHelp
            ? 'Bàn ' + order.tableNumber + ' gọi nhân viên hỗ trợ'
            : 'Bàn ' + order.tableNumber + ' vừa gọi món mới';
        var detail = isHelp
          ? String(order.lastOrderId || '').replace(/^HOTRO:\\s*/, '') || 'Cần nhân viên hỗ trợ'
          : (Array.isArray(order.items) ? order.items.reduce(function (s, i) { return s + (i.qty || 1); }, 0) : 0) + ' món · ' + vnd(order.totalAmount);

        notifications.unshift({
          id: order.tableNumber + '-' + Date.now(),
          tableNumber: Number(order.tableNumber),
          title: title,
          detail: detail,
          time: fmtTime(order.updatedAt || new Date().toISOString()),
          read: false
        });
        if (notifications.length > 30) notifications.length = 30;
        unreadCount = notifications.filter(function (n) { return !n.read; }).length;
        updateBellUI();
        speakVN(title);
      }

      function applyIncomingOrders(incomingOrders) {
        var hasChange = false;
        incomingOrders.forEach(function (o) {
          var sig = o.status + '|' + o.lastOrderId + '|' + o.updatedAt + '|' + (o.items ? o.items.length : 0);
          var prev = lastSnapshot[o.tableNumber];
          if (!firstPollDone) {
            if (o.status === 'payment_requested' || o.status === 'support_requested' || (o.items && o.items.length > 0)) {
              pushNotification(o);
            }
          } else if (prev !== sig) {
            pushNotification(o);
          }
          if (prev !== sig) hasChange = true;
          lastSnapshot[o.tableNumber] = sig;
        });
        firstPollDone = true;
        tableOrders = incomingOrders;
        if (hasChange && activeTab === 'ops') render();
      }

      function readLiveBridgeOrders() {
        try {
          var raw = JSON.parse(localStorage.getItem(storageBridgeKey) || '{}');
          return Object.keys(raw).map(function (k) { return raw[k]; }).filter(function (o) { return o && o.tableNumber; });
        } catch (e) { return []; }
      }

      async function pollGasOrders() {
        var url = getGasUrl();
        if (!url) {
          var localOrders = readLiveBridgeOrders();
          if (localOrders.length) applyIncomingOrders(localOrders);
          syncStatusText = 'Chưa có đường dẫn Apps Script (/exec) — vào Doanh thu để cài đặt';
          syncHasError = true;
          updateSyncStatusUI();
          return;
        }
        try {
          var res = await fetch(url + '?action=poll&_=' + Date.now(), { cache: 'no-store' });
          var txt = await res.text();
          var data = null;
          try {
            data = JSON.parse(txt);
          } catch (parseErr) {
            syncStatusText = 'Apps Script chưa mở quyền "Bất kỳ ai" (trả về HTML)';
            syncHasError = true;
            updateSyncStatusUI();
            return;
          }
          syncStatusText = 'Đã đồng bộ lúc ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          syncHasError = false;
          updateSyncStatusUI();
          if (data && Array.isArray(data.orders)) {
            applyIncomingOrders(data.orders);
          }
        } catch (e) {
          syncStatusText = 'Mất kết nối tạm thời tới Google Apps Script';
          syncHasError = true;
          updateSyncStatusUI();
        }
      }

      async function postGasAction(body) {
        var url = getGasUrl();
        if (!url) return;
        try {
          await fetch(url, {
            method: 'POST',
            mode: 'no-cors',
            redirect: 'follow',
            keepalive: true,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body)
          });
        } catch (e) {}
      }

      function tlv(tag, val) { return tag + String(val.length).padStart(2, '0') + val; }
      function crc16(str) {
        var crc = 0xFFFF;
        for (var i = 0; i < str.length; i++) {
          crc ^= str.charCodeAt(i) << 8;
          for (var j = 0; j < 8; j++) crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
        }
        return crc.toString(16).toUpperCase().padStart(4, '0');
      }
      function buildVietQR(amount, desc) {
        var bank = (config && config.bank) || {};
        var bin = bank.bankBin || '970436';
        var acc = String(bank.accountNumber || '0000000000').replace(/\\s+/g, '');
        var mInfo = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', acc)) + tlv('02', 'QRIBFTTA');
        var raw = tlv('00', '01') + tlv('01', amount > 0 ? '12' : '11') + tlv('38', mInfo) + tlv('53', '704') +
          (amount > 0 ? tlv('54', String(Math.round(amount))) : '') + tlv('58', 'VN') +
          (desc ? tlv('62', tlv('08', desc.slice(0, 25))) : '') + '6304';
        return raw + crc16(raw);
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

      function saveInvoiceLocal(inv) {
        invoices.unshift(inv);
        localStorage.setItem('hkdvn_tenant_invoices', JSON.stringify(invoices));
      }

      function fallbackThumb(name) {
        return '<div class="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">' +
          '<svg class="w-6 h-6 text-[#0F766E]/45" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>' +
          '</div>';
      }

      function openNotificationsModal() {
        var modal = document.getElementById('admin-modal');
        modal.innerHTML = '<div id="notif-bg" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
          '<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] flex flex-col">' +
          '<div class="flex items-center justify-between border-b border-slate-100 pb-3">' +
          '<h3 class="text-base font-bold text-slate-900">Thông báo từ khách (' + notifications.length + ')</h3>' +
          '<div class="flex items-center gap-2">' +
          (notifications.length ? '<button id="mark-all-read" class="text-xs font-semibold text-[#0F766E]">Đã xem hết</button>' : '') +
          '<button id="close-notif" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg">Đóng</button></div></div>' +
          '<div class="flex-1 overflow-y-auto space-y-2.5">' +
          (notifications.length ? notifications.map(function (n) {
            return '<button data-notif-table="' + n.tableNumber + '" data-notif-id="' + esc(n.id) + '" class="w-full text-left p-3.5 rounded-xl border ' + (n.read ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-300') + '">' +
              '<div class="flex items-center justify-between gap-2"><span class="text-xs font-bold text-slate-900">' + esc(n.title) + '</span>' +
              '<span class="text-[11px] text-slate-500 tabular-nums">' + esc(n.time) + '</span></div>' +
              '<p class="text-xs text-slate-600 mt-1">' + esc(n.detail) + '</p></button>';
          }).join('') : '<p class="text-sm text-slate-500 text-center py-8">Chưa có thông báo yêu cầu mới.</p>') +
          '</div></div></div>';

        document.getElementById('close-notif').onclick = function () { modal.innerHTML = ''; };
        document.getElementById('notif-bg').onclick = function (e) { if (e.target.id === 'notif-bg') modal.innerHTML = ''; };
        var mar = document.getElementById('mark-all-read');
        if (mar) mar.onclick = function () {
          notifications.forEach(function (n) { n.read = true; });
          unreadCount = 0;
          updateBellUI();
          openNotificationsModal();
        };
        modal.querySelectorAll('[data-notif-table]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-notif-id');
            var found = notifications.find(function (n) { return n.id === id; });
            if (found) found.read = true;
            unreadCount = notifications.filter(function (n) { return !n.read; }).length;
            updateBellUI();
            openTableDetailSheet(Number(btn.getAttribute('data-notif-table')));
          };
        });
      }

      function openTableDetailSheet(tableNum) {
        var ord = tableOrders.find(function (o) { return Number(o.tableNumber) === Number(tableNum); });
        var modal = document.getElementById('admin-modal');
        if (!ord) {
          modal.innerHTML = '<div id="td-bg" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
            '<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4">' +
            '<div class="flex justify-between items-center"><h3 class="text-base font-bold">Bàn ' + tableNum + ' đang trống</h3>' +
            '<button id="td-close" class="px-3 py-1.5 text-xs font-semibold bg-slate-100 rounded-lg">Đóng</button></div>' +
            '<p class="text-sm text-slate-500">Chưa có món nào được gửi từ bàn này.</p></div></div>';
          document.getElementById('td-close').onclick = function () { modal.innerHTML = ''; };
          document.getElementById('td-bg').onclick = function (e) { if (e.target.id === 'td-bg') modal.innerHTML = ''; };
          return;
        }

        var isHelp = ord.status === 'support_requested';
        var isPay = ord.status === 'payment_requested';
        var helpNote = String(ord.lastOrderId || '').indexOf('HOTRO:') === 0 ? String(ord.lastOrderId).replace(/^HOTRO:\\s*/, '') : '';

        modal.innerHTML = '<div id="td-bg" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
          '<div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">' +
          '<div class="flex items-center justify-between border-b border-slate-100 pb-3">' +
          '<div><h3 class="text-base font-bold text-slate-900">Chi tiết Bàn ' + tableNum + '</h3>' +
          '<p class="text-xs font-semibold ' + (isPay ? 'text-amber-700' : isHelp ? 'text-red-700' : 'text-[#0F766E]') + '">' +
          (isPay ? 'Khách đang yêu cầu thanh toán' : isHelp ? 'Khách đang gọi hỗ trợ' : 'Đang phục vụ') + '</p></div>' +
          '<button id="td-close" class="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-lg">Đóng</button></div>' +
          (helpNote ? '<div class="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800">Yêu cầu hỗ trợ: ' + esc(helpNote) + '</div>' : '') +
          '<div class="flex-1 overflow-y-auto space-y-2.5">' +
          (ord.items && ord.items.length ? ord.items.map(function (i) {
            return '<div class="flex justify-between gap-2 text-sm border-b border-slate-100 pb-2">' +
              '<div class="min-w-0"><p class="font-semibold text-slate-900">' + i.qty + ' × ' + esc(i.name) + '</p>' +
              (i.note ? '<p class="text-xs text-slate-500">Ghi chú: ' + esc(i.note) + '</p>' : '') +
              '</div><span class="tabular-nums font-bold shrink-0">' + vnd(i.price * i.qty) + '</span></div>';
          }).join('') : '<p class="text-sm text-slate-500 py-4 text-center">Bàn chưa gọi món.</p>') +
          '</div>' +
          '<div id="td-qr-box" class="hidden flex-col items-center p-3 bg-slate-50 rounded-xl border border-slate-200">' +
          '<img id="td-qr-img" class="w-40 h-40 bg-white p-1.5 rounded-lg border border-slate-200" alt="VietQR" />' +
          '<p class="text-xs text-slate-500 mt-1.5">' + esc(config.bank.bankShortName) + ' · ' + esc(config.bank.accountNumber) + '</p></div>' +
          '<div class="pt-3 border-t border-slate-100 space-y-2.5">' +
          '<div class="flex justify-between items-center font-bold"><span>Tổng tạm tính</span><span class="text-lg tabular-nums text-[#0F766E]">' + vnd(ord.totalAmount || 0) + '</span></div>' +
          '<div class="grid grid-cols-2 gap-2">' +
          (isHelp ? '<button id="td-ack-help" class="min-h-[44px] px-3 bg-amber-600 text-white text-xs font-bold rounded-xl">Đã hỗ trợ xong</button>' : '<button id="td-show-qr" class="min-h-[44px] px-3 bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded-xl">Hiện VietQR</button>') +
          '<button id="td-collect" class="min-h-[44px] px-3 bg-[#0F766E] text-white text-xs font-bold rounded-xl">Thu tiền &amp; Trả bàn</button>' +
          '</div></div></div></div>';

        document.getElementById('td-close').onclick = function () { modal.innerHTML = ''; };
        document.getElementById('td-bg').onclick = function (e) { if (e.target.id === 'td-bg') modal.innerHTML = ''; };

        var qrBtn = document.getElementById('td-show-qr');
        if (qrBtn) qrBtn.onclick = function () {
          var box = document.getElementById('td-qr-box');
          box.classList.remove('hidden');
          box.classList.add('flex');
          if (window.QRCode && window.QRCode.toDataURL) {
            window.QRCode.toDataURL(buildVietQR(ord.totalAmount || 0, 'BAN ' + tableNum), { width: 220, margin: 2 }, function (err, url) {
              if (!err) document.getElementById('td-qr-img').src = url;
            });
          }
        };

        var ackBtn = document.getElementById('td-ack-help');
        if (ackBtn) ackBtn.onclick = async function () {
          await postGasAction({ action: 'ackSupport', tableNumber: tableNum });
          if (!ord.items || !ord.items.length) {
            tableOrders = tableOrders.filter(function (o) { return Number(o.tableNumber) !== Number(tableNum); });
          } else {
            ord.status = 'occupied';
          }
          modal.innerHTML = '';
          render();
        };

        document.getElementById('td-collect').onclick = async function () {
          var inv = { id: 'B' + tableNum + '-' + Date.now().toString().slice(-5), createdAt: new Date().toISOString(), model: 'fnb', customerOrTable: 'Bàn ' + tableNum, items: ord.items || [], totalAmount: ord.totalAmount || 0, totalCost: 0, profit: ord.totalAmount || 0, paymentMethod: 'Tiền mặt / QR' };
          saveInvoiceLocal(inv);
          await postGasAction({ action: 'recordInvoice', invoice: inv, clearTableNumber: tableNum });
          try {
            var bridge = JSON.parse(localStorage.getItem(storageBridgeKey) || '{}');
            delete bridge[String(tableNum)];
            localStorage.setItem(storageBridgeKey, JSON.stringify(bridge));
          } catch (e) {}
          tableOrders = tableOrders.filter(function (o) { return Number(o.tableNumber) !== Number(tableNum); });
          modal.innerHTML = '';
          render();
        };
      }

      function openQrPrintModal() {
        var modal = document.getElementById('admin-modal');
        var base = location.origin + location.pathname.replace(/admin\\.html$/, '');
        modal.innerHTML = '<div id="qrp-bg" class="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center">' +
          '<div class="bg-white w-full max-w-3xl rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] flex flex-col">' +
          '<div class="no-print flex items-center justify-between border-b border-slate-100 pb-3">' +
          '<h3 class="text-base font-bold">Mã QR dán từng bàn</h3>' +
          '<div class="flex items-center gap-2">' +
          '<button onclick="window.print()" class="px-3.5 py-2 bg-[#0F766E] text-white text-xs font-bold rounded-xl">In mã QR</button>' +
          '<button id="qrp-close" class="px-3 py-2 text-xs font-semibold bg-slate-100 rounded-xl">Đóng</button></div></div>' +
          '<div class="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3">' +
          Array.from({ length: config.tableCount || 12 }, function (_, i) {
            var n = i + 1;
            return '<div class="border border-slate-200 rounded-2xl p-3 text-center"><p class="text-sm font-bold">BÀN ' + n + '</p><img id="tqr-' + n + '" class="w-32 h-32 mx-auto my-2" /><p class="text-[11px] text-slate-500">?ban=' + n + '</p></div>';
          }).join('') +
          '</div></div></div>';
        document.getElementById('qrp-close').onclick = function () { modal.innerHTML = ''; };
        document.getElementById('qrp-bg').onclick = function (e) { if (e.target.id === 'qrp-bg') modal.innerHTML = ''; };
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
      }

      function renderTabs() {
        document.querySelectorAll('.desktop-tab').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          b.className = 'desktop-tab px-3 py-2 rounded-lg ' + (t === activeTab ? 'bg-teal-50 text-[#0F766E]' : 'text-slate-600 hover:bg-slate-100');
        });
        document.querySelectorAll('.mobile-tab').forEach(function (b) {
          var t = b.getAttribute('data-tab');
          b.className = 'mobile-tab flex flex-col items-center justify-center gap-1 text-[11px] ' + (t === activeTab ? 'font-bold text-[#0F766E]' : 'font-medium text-slate-500');
        });
      }

      function render() {
        renderTabs();
        var root = document.getElementById('admin-app');

        if (activeTab === 'ops') {
          if (config.model === 'retail') {
            var total = posCart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
            root.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-12 gap-4">' +
              '<div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">' +
              '<h2 class="text-base font-bold">POS Tính tiền nhanh</h2>' +
              '<div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">' +
              products.map(function (p) {
                return '<button data-pos-add="' + esc(p.id) + '" class="p-2.5 border border-slate-200 rounded-xl flex flex-col gap-2 text-left hover:border-[#0F766E]">' +
                  (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" onerror="this.style.display=\\'none\\'" class="w-full aspect-square rounded-lg object-cover bg-slate-100" />' : '') +
                  '<p class="text-xs font-bold text-slate-900 line-clamp-2">' + esc(p.name) + '</p>' +
                  '<p class="text-xs font-bold tabular-nums text-[#0F766E]">' + vnd(p.price) + '</p></button>';
              }).join('') +
              '</div></div>' +
              '<div class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">' +
              '<h2 class="text-base font-bold">Hóa đơn hiện tại</h2>' +
              '<div class="space-y-2">' +
              (posCart.length ? posCart.map(function (i) {
                return '<div class="flex justify-between text-sm border-b border-slate-100 pb-2"><span>' + i.qty + ' × ' + esc(i.name) + '</span><span class="tabular-nums font-bold">' + vnd(i.price * i.qty) + '</span></div>';
              }).join('') : '<p class="text-sm text-slate-500">Chạm sản phẩm để thêm vào hóa đơn.</p>') +
              '</div>' +
              '<div class="pt-3 border-t flex justify-between font-bold text-lg"><span>Tổng thu</span><span class="tabular-nums text-[#0F766E]">' + vnd(total) + '</span></div>' +
              '<button id="pos-checkout" ' + (!posCart.length ? 'disabled' : '') + ' class="w-full min-h-[46px] bg-[#0F766E] disabled:bg-slate-200 text-white text-sm font-bold rounded-xl">Xác nhận thu tiền</button>' +
              '</div></div>';

            root.querySelectorAll('[data-pos-add]').forEach(function (b) {
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
              await postGasAction({ action: 'recordInvoice', invoice: inv });
              posCart = [];
              render();
            };
          } else {
            var activeCount = tableOrders.length;
            var urgentList = tableOrders.filter(function (o) { return o.status === 'payment_requested' || o.status === 'support_requested'; });

            var urgentHTML = urgentList.length ? '<div class="space-y-2">' + urgentList.map(function (u) {
              var isHelp = u.status === 'support_requested';
              return '<div class="p-3.5 rounded-2xl border flex items-center justify-between gap-3 ' + (isHelp ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300') + '">' +
                '<div class="min-w-0"><p class="text-xs font-bold text-slate-900">Bàn ' + u.tableNumber + ' · ' + (isHelp ? 'Gọi hỗ trợ' : 'Yêu cầu thanh toán') + '</p>' +
                '<p class="text-xs text-slate-600 truncate">' + (isHelp ? esc(String(u.lastOrderId || '').replace(/^HOTRO:\\s*/, '')) : vnd(u.totalAmount)) + '</p></div>' +
                '<button data-open-table="' + u.tableNumber + '" class="px-3.5 py-2 min-h-[38px] bg-slate-900 text-white text-xs font-bold rounded-xl shrink-0">Xử lý</button></div>';
            }).join('') + '</div>' : '';

            var tableCards = Array.from({ length: config.tableCount || 12 }, function (_, idx) {
              var n = idx + 1;
              var ord = tableOrders.find(function (o) { return Number(o.tableNumber) === n; });
              var pay = ord && ord.status === 'payment_requested';
              var help = ord && ord.status === 'support_requested';
              var occ = Boolean(ord);
              var itemQty = ord && ord.items ? ord.items.reduce(function (s, i) { return s + (i.qty || 1); }, 0) : 0;

              return '<button data-open-table="' + n + '" class="text-left p-3.5 rounded-2xl border transition-all ' + (help ? 'bg-red-50 border-red-400' : pay ? 'bg-amber-50 border-amber-400' : occ ? 'bg-teal-50/70 border-[#0F766E]' : 'bg-white border-slate-200') + '">' +
                '<div class="flex items-center justify-between gap-1"><span class="text-sm font-bold text-slate-900">Bàn ' + n + '</span>' +
                (occ ? '<span class="text-[11px] font-semibold text-slate-600">' + itemQty + ' món</span>' : '') + '</div>' +
                '<p class="text-[11px] mt-1 font-semibold ' + (help ? 'text-red-700' : pay ? 'text-amber-700' : occ ? 'text-[#0F766E]' : 'text-slate-400') + '">' +
                (help ? 'Cần hỗ trợ' : pay ? 'Chờ thanh toán' : occ ? 'Đang phục vụ' : 'Bàn trống') + '</p>' +
                '<p class="text-base font-bold tabular-nums mt-1.5 text-slate-900">' + vnd(ord ? ord.totalAmount : 0) + '</p></button>';
            }).join('');

            root.innerHTML = '<div class="space-y-4">' +
              '<div class="grid grid-cols-2 gap-3">' +
              '<div class="bg-white border border-slate-200 rounded-2xl p-3.5"><p class="text-[11px] text-slate-500">Bàn đang phục vụ</p><p class="text-xl font-bold tabular-nums text-[#0F766E] mt-0.5">' + activeCount + ' / ' + (config.tableCount || 12) + '</p></div>' +
              '<div class="bg-white border border-slate-200 rounded-2xl p-3.5"><p class="text-[11px] text-slate-500">Yêu cầu đang chờ</p><p class="text-xl font-bold tabular-nums text-amber-700 mt-0.5">' + urgentList.length + '</p></div>' +
              '</div>' +
              '<div class="flex items-center gap-2">' +
              '<button id="btn-refresh-now" class="flex-1 min-h-[42px] px-3 bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded-xl">Làm mới đơn ngay</button>' +
              '<button id="btn-gen-qr" class="flex-1 min-h-[42px] px-3 bg-slate-900 text-white text-xs font-bold rounded-xl">Mã QR từng bàn</button>' +
              '</div>' +
              urgentHTML +
              '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">' + tableCards + '</div></div>';

            document.getElementById('btn-refresh-now').onclick = function () { pollGasOrders(); };
            document.getElementById('btn-gen-qr').onclick = openQrPrintModal;
            root.querySelectorAll('[data-open-table]').forEach(function (b) {
              b.onclick = function () { openTableDetailSheet(Number(b.getAttribute('data-open-table'))); };
            });
          }
        } else if (activeTab === 'catalog') {
          root.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-12 gap-4">' +
            '<form id="prod-form" class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 space-y-3">' +
            '<h2 class="text-base font-bold text-slate-900">Thêm sản phẩm &amp; Nén ảnh WebP</h2>' +
            '<div class="space-y-1.5">' +
            '<input id="gh-pat" type="password" value="' + esc(ghToken) + '" placeholder="GitHub Token (quyền repo) để lưu lên GitHub" class="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-200 rounded-xl" />' +
            '<div class="flex items-center justify-between text-[11px]">' +
            '<span id="gh-token-status" class="' + (ghToken ? 'text-emerald-700 font-medium' : 'text-slate-500') + '">' + (ghToken ? 'Đã lưu GitHub Token cục bộ' : 'Chưa có GitHub Token cục bộ') + '</span>' +
            (ghToken ? '<button id="btn-clear-gh" type="button" class="text-red-700 font-medium">Xóa token</button>' : '') +
            '</div></div>' +
            '<label for="img-file" class="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl cursor-pointer">' +
            '<span class="text-xs font-semibold text-slate-700">Chụp hoặc chọn ảnh (tự nén WebP)</span>' +
            '<span class="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-[#0F766E] shrink-0">Chọn ảnh</span>' +
            '<input id="img-file" type="file" accept="image/*" capture="environment" class="sr-only" />' +
            '</label>' +
            '<div id="img-preview-wrap" class="hidden items-center gap-3 p-2.5 bg-teal-50/50 border border-teal-200 rounded-xl">' +
            '<img id="img-preview" class="w-12 h-12 rounded-lg object-cover" /><p id="img-info" class="text-xs font-medium text-emerald-700"></p></div>' +
            '<input id="p-name" required placeholder="Tên sản phẩm / món ăn" class="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl" />' +
            '<div class="grid grid-cols-2 gap-2.5">' +
            '<input id="p-sku" placeholder="Mã SKU" class="w-full min-w-0 px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-xl" />' +
            '<input id="p-price" required type="number" inputmode="numeric" placeholder="Giá bán (VNĐ)" class="w-full min-w-0 px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-xl" />' +
            '<input id="p-cat" value="Món chính" placeholder="Danh mục" class="w-full min-w-0 px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />' +
            '<input id="p-unit" value="Phần" placeholder="Đơn vị" class="w-full min-w-0 px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />' +
            '</div>' +
            '<button type="submit" class="w-full min-h-[46px] bg-[#0F766E] text-white text-sm font-bold rounded-xl">Lưu &amp; Xuất bản lên GitHub</button>' +
            '<p id="pub-msg" class="text-xs font-medium text-[#0F766E]"></p></form>' +

            '<div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">' +
            products.map(function (p) {
              var confirming = pendingDeleteId === p.id;
              return '<div class="p-3.5 flex items-center justify-between gap-3"><div class="flex items-center gap-3 min-w-0">' +
                (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" data-admin-fb="' + esc(p.name) + '" class="w-14 h-14 rounded-xl object-cover bg-slate-100 shrink-0" />' : fallbackThumb(p.name)) +
                '<div class="min-w-0"><p class="text-sm font-bold text-slate-900 truncate">' + esc(p.name) + '</p>' +
                '<p class="text-xs text-slate-500 mt-0.5">' + esc(p.category) + ' · <span class="font-bold tabular-nums text-[#0F766E]">' + vnd(p.price) + '</span></p></div></div>' +
                (confirming
                  ? '<div class="flex items-center gap-1.5 shrink-0"><button data-del-yes="' + esc(p.id) + '" class="px-2.5 py-1.5 bg-red-700 text-white text-xs font-bold rounded-lg">Xác nhận</button><button data-del-no="1" class="px-2.5 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg">Hủy</button></div>'
                  : '<button data-del="' + esc(p.id) + '" class="px-3 py-1.5 text-xs text-red-700 font-semibold border border-red-200 rounded-lg shrink-0">Xóa</button>') +
                '</div>';
            }).join('') + '</div></div>';

          root.querySelectorAll('img[data-admin-fb]').forEach(function (img) {
            img.onerror = function () {
              var wrap = document.createElement('div');
              wrap.innerHTML = fallbackThumb(img.getAttribute('data-admin-fb'));
              img.replaceWith(wrap.firstChild);
            };
          });

          document.getElementById('gh-pat').oninput = function (e) {
            ghToken = e.target.value.trim();
            if (ghToken) localStorage.setItem(ghStorageKey, ghToken);
            else localStorage.removeItem(ghStorageKey);
            var st = document.getElementById('gh-token-status');
            if (st) {
              st.className = ghToken ? 'text-emerald-700 font-medium' : 'text-slate-500';
              st.textContent = ghToken ? 'Đã lưu GitHub Token cục bộ' : 'Chưa có GitHub Token cục bộ';
            }
          };
          var clrBtn = document.getElementById('btn-clear-gh');
          if (clrBtn) clrBtn.onclick = function () { ghToken = ''; localStorage.removeItem(ghStorageKey); render(); };

          document.getElementById('img-file').onchange = async function (e) {
            if (!e.target.files[0]) return;
            compressedImg = await compressToWebP(e.target.files[0]);
            var wrap = document.getElementById('img-preview-wrap');
            wrap.classList.remove('hidden');
            wrap.classList.add('flex');
            document.getElementById('img-preview').src = compressedImg.dataUrl;
            document.getElementById('img-info').textContent = 'Đã nén WebP 800×800 (' + compressedImg.kb + 'KB)';
          };

          document.getElementById('prod-form').onsubmit = async function (e) {
            e.preventDefault();
            var msg = document.getElementById('pub-msg');
            msg.textContent = 'Đang lưu và xuất bản lên GitHub...';
            try {
              var sku = document.getElementById('p-sku').value.trim() || ('SP-' + Date.now().toString().slice(-5));
              var imgUrl = '';
              if (compressedImg) {
                var imgPath = 'assets/img/' + sku.replace(/[^a-zA-Z0-9_-]/g, '') + '.webp';
                await ghPut(imgPath, compressedImg.base64, 'Tải ảnh WebP ' + sku);
                imgUrl = './' + imgPath;
              }
              products.push({
                id: 'sp-' + Date.now(), sku: sku, name: document.getElementById('p-name').value.trim(),
                price: Number(document.getElementById('p-price').value) || 0, costPrice: 0,
                category: document.getElementById('p-cat').value.trim() || 'Món chính',
                unit: document.getElementById('p-unit').value.trim() || 'Phần',
                stock: 50, status: 'Còn hàng', imageUrl: imgUrl, description: '', model: config.model
              });
              await ghPut('products.json', toBase64Utf8(JSON.stringify(products, null, 2)), 'Cập nhật danh mục sản phẩm');
              compressedImg = null;
              render();
            } catch (err) { msg.textContent = err.message; }
          };

          root.querySelectorAll('[data-del]').forEach(function (b) {
            b.onclick = function () { pendingDeleteId = b.getAttribute('data-del'); render(); };
          });
          root.querySelectorAll('[data-del-no]').forEach(function (b) {
            b.onclick = function () { pendingDeleteId = null; render(); };
          });
          root.querySelectorAll('[data-del-yes]').forEach(function (b) {
            b.onclick = async function () {
              var id = b.getAttribute('data-del-yes');
              products = products.filter(function (x) { return x.id !== id; });
              pendingDeleteId = null;
              if (ghToken) await ghPut('products.json', toBase64Utf8(JSON.stringify(products, null, 2)), 'Xóa sản phẩm');
              render();
            };
          });
        } else {
          var totalRev = invoices.reduce(function (s, i) { return s + (i.totalAmount || 0); }, 0);
          var curGas = getGasUrl();

          root.innerHTML = '<div class="space-y-4">' +
            '<div class="grid grid-cols-2 gap-3">' +
            '<div class="bg-white border border-slate-200 rounded-2xl p-4"><p class="text-[11px] text-slate-500">Doanh thu ghi nhận trên máy</p><p class="text-xl font-bold tabular-nums text-[#0F766E] mt-1">' + vnd(totalRev) + '</p></div>' +
            '<div class="bg-white border border-slate-200 rounded-2xl p-4"><p class="text-[11px] text-slate-500">Số hóa đơn</p><p class="text-xl font-bold tabular-nums text-slate-900 mt-1">' + invoices.length + '</p></div>' +
            '</div>' +

            '<div class="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">' +
            '<h2 class="text-sm font-bold text-slate-900">Cấu hình đồng bộ Google Apps Script (/exec)</h2>' +
            '<p class="text-xs text-slate-500">Nếu khách gọi món chưa hiện sang đây, hãy dán đúng đường dẫn /exec đã triển khai với quyền "Bất kỳ ai" vào ô dưới rồi bấm Lưu &amp; Kiểm tra.</p>' +
            '<input id="cfg-gas" type="url" value="' + esc(curGas) + '" placeholder="https://script.google.com/macros/s/.../exec" class="w-full px-3.5 py-2.5 text-xs font-mono border border-slate-200 rounded-xl" />' +
            '<div class="flex flex-wrap gap-2">' +
            '<button id="btn-save-gas" class="flex-1 min-h-[42px] px-4 bg-[#0F766E] text-white text-xs font-bold rounded-xl">Lưu &amp; Kiểm tra kết nối</button>' +
            '</div><p id="gas-test-msg" class="text-xs text-slate-600"></p></div>' +

            '<div class="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">' +
            '<div class="p-4"><h3 class="text-sm font-bold text-slate-900">Lịch sử hóa đơn gần đây</h3></div>' +
            (invoices.length ? invoices.map(function (i) {
              return '<div class="p-3.5 flex items-center justify-between gap-2"><div><p class="text-sm font-bold text-slate-900">' + esc(i.customerOrTable) + '</p><p class="text-[11px] font-mono text-slate-500">' + esc(i.id) + '</p></div><span class="text-sm font-bold tabular-nums text-[#0F766E]">' + vnd(i.totalAmount) + '</span></div>';
            }).join('') : '<p class="p-6 text-center text-sm text-slate-500">Chưa có hóa đơn nào.</p>') +
            '</div></div>';

          document.getElementById('btn-save-gas').onclick = async function () {
            var nextUrl = document.getElementById('cfg-gas').value.trim();
            var msgEl = document.getElementById('gas-test-msg');
            saveGasOverride(nextUrl);
            if (!config.infra) config.infra = {};
            config.infra.gasEndpointUrl = nextUrl;
            if (ghToken && config.infra.githubOwner && config.infra.githubRepo) {
              try {
                await ghPut('config.json', toBase64Utf8(JSON.stringify(config, null, 2)), 'Cập nhật đường dẫn Apps Script');
              } catch (e) {}
            }
            msgEl.textContent = 'Đang kiểm tra kết nối...';
            await pollGasOrders();
            msgEl.textContent = syncStatusText;
          };
        }
      }

      document.querySelectorAll('[data-tab]').forEach(function (b) {
        b.onclick = function () { activeTab = b.getAttribute('data-tab'); render(); };
      });
      document.getElementById('btn-sound').onclick = function () {
        soundEnabled = !soundEnabled;
        updateSoundButton();
        if (soundEnabled) playAlertTone();
      };
      document.getElementById('btn-bell').onclick = openNotificationsModal;

      window.addEventListener('storage', function (e) {
        if (e.key === storageBridgeKey) {
          var localOrders = readLiveBridgeOrders();
          if (localOrders.length) applyIncomingOrders(localOrders);
        }
      });

      updateSoundButton();
      var cacheBust = '?t=' + Date.now();
      Promise.all([
        fetch('./config.json' + cacheBust, { cache: 'no-store' }).then(function (r) { return r.json(); }),
        fetch('./products.json' + cacheBust, { cache: 'no-store' }).then(function (r) { return r.json(); })
      ]).then(function (res) {
        config = res[0];
        products = Array.isArray(res[1]) ? res[1] : [];
        document.getElementById('admin-shop-title').textContent = config.shopName;
        render();
        if (config.model === 'fnb') {
          pollGasOrders();
          pollTimer = setInterval(pollGasOrders, 3000);
        } else {
          syncStatusText = 'Chế độ Bán lẻ / POS sẵn sàng';
          updateSyncStatusUI();
        }
      }).catch(function () {
        document.getElementById('admin-app').innerHTML = '<div class="p-8 text-center text-sm text-red-700 bg-white rounded-2xl border border-slate-200">Không tải được dữ liệu cửa hàng.</div>';
      });
    })();
  </script>
</body>
</html>`;
}

/* ============================================================
   AZEE HARDWARE — Utilities
   ============================================================ */
(function (global) {

  // ---------- Number / currency formatting (Indian) ----------
  function toIndianNumber(num) {
    num = Number(num) || 0;
    const isNeg = num < 0;
    num = Math.abs(num);
    const fixed = num.toFixed(2);
    let [whole, dec] = fixed.split('.');
    let lastThree = whole.slice(-3);
    let other = whole.slice(0, -3);
    if (other !== '') lastThree = ',' + lastThree;
    const formatted = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
    const result = formatted + (dec === '00' ? '' : '.' + dec);
    return (isNeg ? '-' : '') + result;
  }

  function currency(num) {
    return '\u20B9' + toIndianNumber(num);
  }

  // Amount in words (Indian numbering, rupees & paise)
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n) {
    if (n < 20) return ONES[n];
    const t = Math.floor(n / 10), o = n % 10;
    return TENS[t] + (o ? ' ' + ONES[o] : '');
  }
  function threeDigits(n) {
    const h = Math.floor(n / 100), r = n % 100;
    let s = '';
    if (h) s += ONES[h] + ' Hundred ';
    if (r) s += twoDigits(r);
    return s.trim();
  }
  function numberToWords(num) {
    num = Math.floor(Number(num) || 0);
    if (num === 0) return 'Zero';
    let crore = Math.floor(num / 10000000); num %= 10000000;
    let lakh = Math.floor(num / 100000); num %= 100000;
    let thousand = Math.floor(num / 1000); num %= 1000;
    let hundred = num;
    let parts = [];
    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigits(hundred));
    return parts.join(' ').trim();
  }
  function amountInWords(num) {
    num = Number(num) || 0;
    const rupees = Math.floor(num);
    const paise = Math.round((num - rupees) * 100);
    let s = 'Rupees ' + numberToWords(rupees);
    if (paise > 0) s += ' and ' + numberToWords(paise) + ' Paise';
    return s + ' Only';
  }

  // ---------- Date / time ----------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtDate(d) {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '';
    return pad(dt.getDate()) + '/' + pad(dt.getMonth() + 1) + '/' + dt.getFullYear();
  }
  function fmtDateInput(d) {
    // yyyy-mm-dd for <input type=date>
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '';
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }
  function fmtTime12(hhmm) {
    // hhmm = "HH:MM" 24h string -> "08:30 AM"
    if (!hhmm) return '';
    let [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return pad(h) + ':' + pad(m) + ' ' + ampm;
  }
  function minutesBetween(t1, t2) {
    // t1, t2 = "HH:MM"; handles overnight
    const [h1, m1] = t1.split(':').map(Number);
    const [h2, m2] = t2.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60;
    return diff;
  }
  function fmtDuration(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + 'h ' + m + 'm';
    if (h) return h + 'h';
    return m + 'm';
  }
  function nowTimeStr() {
    const d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function todayStr() { return fmtDateInput(new Date()); }
  function nowISO() { return new Date().toISOString(); }

  // ---------- Escaping ----------
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, ms) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms || 2200);
  }

  // ---------- Confirm dialog ----------
  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirmOverlay');
      document.getElementById('confirmTitle').textContent = opts.title || 'Are you sure?';
      document.getElementById('confirmBody').textContent = opts.body || 'This action cannot be undone.';
      const okBtn = document.getElementById('confirmOk');
      okBtn.textContent = opts.okText || 'Delete';
      okBtn.className = 'btn ' + (opts.danger === false ? 'btn--primary' : 'btn--danger');
      overlay.classList.remove('hidden');

      function cleanup(result) {
        overlay.classList.add('hidden');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      const cancelBtn = document.getElementById('confirmCancel');
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  // ---------- Bottom sheet (options picker) ----------
  function showSheet(html) {
    const overlay = document.getElementById('sheetOverlay');
    const content = document.getElementById('sheetContent');
    content.innerHTML = '<div class="sheet-handle"></div>' + html;
    overlay.classList.remove('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) hideSheet(); };
    return content;
  }
  function hideSheet() {
    document.getElementById('sheetOverlay').classList.add('hidden');
  }

  // ---------- Progress overlay ----------
  function showProgress(text) {
    document.getElementById('progressText').textContent = text || 'Working…';
    document.getElementById('progressOverlay').classList.remove('hidden');
  }
  function hideProgress() {
    document.getElementById('progressOverlay').classList.add('hidden');
  }

  // ---------- File -> base64 ----------
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---------- Image compression for previews ----------
  function compressImageDataURL(dataUrl, maxDim, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.7));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  global.Utils = {
    currency, toIndianNumber, amountInWords, numberToWords,
    fmtDate, fmtDateInput, fmtTime12, minutesBetween, fmtDuration,
    nowTimeStr, todayStr, nowISO, pad,
    esc, toast, confirmDialog, showSheet, hideSheet,
    showProgress, hideProgress, fileToDataURL, compressImageDataURL
  };
})(window);

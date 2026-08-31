/* ============================================================
   AZEE HARDWARE — App (router + screens)
   Offline-first. No network calls.
   ============================================================ */
(function () {
  const { currency, amountInWords, fmtDate, fmtDateInput, fmtTime12, minutesBetween,
    fmtDuration, nowTimeStr, todayStr, nowISO, esc, toast, confirmDialog,
    showSheet, hideSheet, showProgress, hideProgress, fileToDataURL, compressImageDataURL } = Utils;

  const viewEl = document.getElementById('view');
  const topbarTitle = document.getElementById('topbarTitle');
  const backBtn = document.getElementById('backBtn');
  const searchBtn = document.getElementById('searchBtn');

  let BIZ = null;     // business details
  let SETTINGS = null; // app settings

  // ---------------------------------------------------------
  // ROUTER
  // ---------------------------------------------------------
  const routeHistory = [];

  function parseHash() {
    const raw = location.hash.slice(2) || 'home'; // strip '#/'
    const [route, qs] = raw.split('?');
    const params = {};
    if (qs) qs.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { route: route || 'home', params };
  }

  function go(route, params) {
    let hash = '#/' + route;
    if (params) {
      const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
      if (qs) hash += '?' + qs;
    }
    location.hash = hash;
  }

  const TOP_LEVEL = ['home', 'works', 'add-work', 'reports', 'settings'];

  window.addEventListener('hashchange', render);

  async function render() {
    const { route, params } = parseHash();
    viewEl.scrollTop = 0;
    updateNav(route);
    backBtn.classList.toggle('hidden', TOP_LEVEL.includes(route));

    const screen = SCREENS[route];
    if (!screen) { viewEl.innerHTML = notFound(); return; }
    try {
      await screen(params);
    } catch (err) {
      console.error(err);
      viewEl.innerHTML = `<div class="empty-state"><div class="empty-state-title">Something went wrong</div><div class="empty-state-sub">${esc(err.message)}</div></div>`;
    }
  }

  function updateNav(route) {
    document.querySelectorAll('.navbtn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.route === route);
    });
  }

  function notFound() {
    return `<div class="empty-state"><div class="empty-state-title">Screen not found</div></div>`;
  }

  backBtn.addEventListener('click', () => history.back());
  searchBtn.addEventListener('click', () => go('search'));
  document.querySelectorAll('.navbtn').forEach(btn => {
    btn.addEventListener('click', () => go(btn.dataset.route));
  });

  function setTitle(t) { topbarTitle.textContent = t; }

  // ---------------------------------------------------------
  // THEME
  // ---------------------------------------------------------
  function applyTheme(pref) {
    let actual = pref;
    if (pref === 'system') {
      actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', actual);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', actual === 'dark' ? '#0A0C10' : '#F3F6FC');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (SETTINGS && SETTINGS.theme === 'system') applyTheme('system');
  });

  // ---------------------------------------------------------
  // DATA HELPERS
  // ---------------------------------------------------------
  async function computeWorkFinance(workId) {
    const [logs, mats, exps] = await Promise.all([
      DB.dailyLogs.byIndex('workId', workId),
      DB.materials.byIndex('workId', workId),
      DB.expenses.byIndex('workId', workId)
    ]);
    const labour = logs.reduce((s, l) => s + (Number(l.labourAmount) || 0), 0);
    const materials = mats.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const otherExp = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { labour, materials, otherExp, total: labour + materials + otherExp, logs, mats, exps };
  }

  async function getPaidTotal(workId) {
    const invs = await DB.invoices.byIndex('workId', workId);
    return invs.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
  }

  function statusChip(status) {
    return status === 'completed'
      ? `<span class="chip chip--completed">Completed</span>`
      : `<span class="chip chip--progress">In Progress</span>`;
  }

  // ---------------------------------------------------------
  // SCREEN: HOME
  // ---------------------------------------------------------
  async function screenHome() {
    setTitle('AZEE HARDWARE');
    const works = await DB.works.all();
    works.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const active = works.filter(w => w.status !== 'completed');
    const today = todayStr();

    let todaysLogsCount = 0;
    let totalAmount = 0, pendingAmount = 0;
    for (const w of works) {
      const fin = await computeWorkFinance(w.id);
      totalAmount += fin.total;
      const paid = await getPaidTotal(w.id);
      pendingAmount += Math.max(0, fin.total - paid);
      const todays = fin.logs.filter(l => l.date === today);
      todaysLogsCount += todays.length;
    }

    const recent = works.slice(0, 8);

    viewEl.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card accent-blue"><div class="stat-label">Active Works</div><div class="stat-value">${active.length}</div></div>
        <div class="stat-card accent-blue"><div class="stat-label">Today's Logs</div><div class="stat-value">${todaysLogsCount}</div></div>
        <div class="stat-card accent-red"><div class="stat-label">Total Amount</div><div class="stat-value">${currency(totalAmount)}</div></div>
        <div class="stat-card accent-red"><div class="stat-label">Pending Amount</div><div class="stat-value">${currency(pendingAmount)}</div></div>
      </div>

      <div class="section-title">My Works</div>
      <div id="workList">${recent.length ? recent.map(workItemHtml).join('') : emptyWorks()}</div>
      <button class="btn btn--primary" id="addWorkBtn" style="margin-top:6px;">+ Add Work</button>
    `;
    wireWorkList();
    document.getElementById('addWorkBtn').addEventListener('click', () => go('add-work'));
  }

  function emptyWorks() {
    return `<div class="empty-state">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="13" rx="1.5" stroke="currentColor" stroke-width="1.6"/></svg>
      <div class="empty-state-title">No works yet</div>
      <div class="empty-state-sub">Tap + Add Work to create your first job</div>
    </div>`;
  }

  function workItemHtml(w) {
    const sub = [w.customerName, w.companyName].filter(Boolean).join(' • ');
    const meta = [w.buildingNo ? ('#' + w.buildingNo) : '', w.address].filter(Boolean).join(' — ');
    return `<div class="work-item" data-id="${w.id}">
      <div class="work-item-body">
        <div class="work-item-title">${esc(w.name)}</div>
        <div class="work-item-sub">${esc(sub || '—')}</div>
        ${meta ? `<div class="work-item-meta">${esc(meta)}</div>` : ''}
      </div>
      ${statusChip(w.status)}
    </div>`;
  }

  function wireWorkList() {
    document.querySelectorAll('.work-item').forEach(el => {
      el.addEventListener('click', () => go('work-details', { id: el.dataset.id }));
    });
  }

  // ---------------------------------------------------------
  // SCREEN: WORKS LIST
  // ---------------------------------------------------------
  async function screenWorks(params) {
    setTitle('Works');
    const filter = params.filter || 'all';
    let works = await DB.works.all();
    works.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    if (filter === 'active') works = works.filter(w => w.status !== 'completed');
    if (filter === 'completed') works = works.filter(w => w.status === 'completed');

    viewEl.innerHTML = `
      <div class="filter-row">
        <button class="filter-pill ${filter === 'all' ? 'active' : ''}" data-f="all">All</button>
        <button class="filter-pill ${filter === 'active' ? 'active' : ''}" data-f="active">In Progress</button>
        <button class="filter-pill ${filter === 'completed' ? 'active' : ''}" data-f="completed">Completed</button>
      </div>
      <div>${works.length ? works.map(workItemHtml).join('') : emptyWorks()}</div>
    `;
    wireWorkList();
    document.querySelectorAll('.filter-pill').forEach(el => {
      el.addEventListener('click', () => go('works', { filter: el.dataset.f }));
    });
  }

  // ---------------------------------------------------------
  // SCREEN: ADD / EDIT WORK
  // ---------------------------------------------------------
  async function screenAddEditWork(params) {
    const editId = params.id;
    const work = editId ? await DB.works.get(editId) : null;
    setTitle(editId ? 'Edit Work' : 'Add Work');

    const type = (work && work.type) || 'House';

    viewEl.innerHTML = `
      <form id="workForm">
        <div class="field">
          <label>Work Name <span class="req">*</span></label>
          <input type="text" id="f_name" placeholder="e.g. Green Villa Plumbing" value="${esc(work?.name || '')}" required>
        </div>
        <div class="field">
          <label>Work Type</label>
          <div class="chip-select" id="f_type">
            ${['House', 'HQ / Office', 'Other'].map(t => `<button type="button" class="chip-option ${t === type ? 'active' : ''}" data-val="${t}">${t}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>House / Building Number</label>
          <input type="text" id="f_building" placeholder="e.g. 24B" value="${esc(work?.buildingNo || '')}">
        </div>
        <div class="field">
          <label>Customer Name</label>
          <input type="text" id="f_customer" placeholder="Customer full name" value="${esc(work?.customerName || '')}">
        </div>
        <div class="field">
          <label>Company / Headquarters Name</label>
          <input type="text" id="f_company" placeholder="Optional" value="${esc(work?.companyName || '')}">
        </div>
        <div class="field">
          <label>Phone Number</label>
          <input type="tel" id="f_phone" placeholder="10-digit mobile number" value="${esc(work?.phone || '')}">
        </div>
        <div class="field">
          <label>Address</label>
          <textarea id="f_address" placeholder="Full address">${esc(work?.address || '')}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Start Date</label>
            <input type="date" id="f_start" value="${work?.startDate || fmtDateInput(new Date())}">
          </div>
          <div class="field">
            <label>Expected End Date</label>
            <input type="date" id="f_end" value="${work?.expectedEndDate || ''}">
          </div>
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea id="f_notes" placeholder="Optional notes">${esc(work?.notes || '')}</textarea>
        </div>
        <button type="submit" class="btn btn--primary">${editId ? 'Save Changes' : 'Save Work'}</button>
      </form>
    `;

    document.querySelectorAll('#f_type .chip-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('#f_type .chip-option').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
      });
    });

    document.getElementById('workForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('f_name').value.trim();
      if (!name) { toast('Work name is required'); return; }
      const chosenType = document.querySelector('#f_type .chip-option.active')?.dataset.val || 'House';
      const now = nowISO();
      const record = {
        id: work?.id || DB.uid('work'),
        name,
        type: chosenType,
        buildingNo: document.getElementById('f_building').value.trim(),
        customerName: document.getElementById('f_customer').value.trim(),
        companyName: document.getElementById('f_company').value.trim(),
        phone: document.getElementById('f_phone').value.trim(),
        address: document.getElementById('f_address').value.trim(),
        startDate: document.getElementById('f_start').value,
        expectedEndDate: document.getElementById('f_end').value,
        notes: document.getElementById('f_notes').value.trim(),
        status: work?.status || 'in_progress',
        createdAt: work?.createdAt || now,
        updatedAt: now
      };
      await DB.works.put(record);
      toast(editId ? 'Work updated' : 'Work saved');
      go('work-details', { id: record.id });
    });
  }

  // ---------------------------------------------------------
  // SCREEN: WORK DETAILS
  // ---------------------------------------------------------
  async function screenWorkDetails(params) {
    const work = await DB.works.get(params.id);
    if (!work) { viewEl.innerHTML = emptyGeneric('Work not found'); return; }
    setTitle(work.name);
    const fin = await computeWorkFinance(work.id);
    const paid = await getPaidTotal(work.id);
    const activeLog = fin.logs.find(l => l.startTime && !l.endTime);

    viewEl.innerHTML = `
      <div class="status-header">
        <h2 class="page-h">${esc(work.name)}</h2>
        ${statusChip(work.status)}
      </div>

      <div class="info-card">
        <div class="info-row"><span class="k">Type</span><span class="v">${esc(work.type)}</span></div>
        ${work.customerName ? `<div class="info-row"><span class="k">Customer</span><span class="v">${esc(work.customerName)}</span></div>` : ''}
        ${work.companyName ? `<div class="info-row"><span class="k">Company</span><span class="v">${esc(work.companyName)}</span></div>` : ''}
        ${work.buildingNo ? `<div class="info-row"><span class="k">Building No.</span><span class="v">${esc(work.buildingNo)}</span></div>` : ''}
        ${work.phone ? `<div class="info-row"><span class="k">Phone</span><span class="v">${esc(work.phone)}</span></div>` : ''}
        ${work.address ? `<div class="info-row"><span class="k">Address</span><span class="v">${esc(work.address)}</span></div>` : ''}
        <div class="info-row"><span class="k">Start Date</span><span class="v">${fmtDate(work.startDate)}</span></div>
      </div>

      <div class="section-title">Financial Overview</div>
      <div class="finance-grid">
        <div class="finance-cell"><div class="fc-label">Labour</div><div class="fc-value">${currency(fin.labour)}</div></div>
        <div class="finance-cell"><div class="fc-label">Materials</div><div class="fc-value">${currency(fin.materials)}</div></div>
        <div class="finance-cell"><div class="fc-label">Other</div><div class="fc-value">${currency(fin.otherExp)}</div></div>
      </div>
      <div class="total-bar">
        <span class="tb-label">Total Amount</span>
        <span class="tb-value">${currency(fin.total)}</span>
      </div>

      <div class="section-title">Manage</div>
      ${menuRow('timer', activeLog ? 'Stop Work' : 'Start Work', activeLog ? 'Timer running — tap to stop' : 'Record time on site', 'startStop')}
      ${menuRow('log', 'Daily Work Log', `${fin.logs.length} entries`, 'logs')}
      ${menuRow('materials', 'Materials / Purchases', `${fin.mats.length} items · ${currency(fin.materials)}`, 'materials')}
      ${menuRow('expense', 'Expenses', `${fin.exps.length} items · ${currency(fin.otherExp)}`, 'expenses')}
      ${menuRow('attach', 'Bills & Attachments', 'Photos & PDF bills', 'attachments')}
      ${menuRow('invoice', 'Invoice', `Paid ${currency(paid)} of ${currency(fin.total)}`, 'invoice')}

      <div class="btn-row">
        <button class="btn btn--outline" id="editWorkBtn">Edit Work</button>
        <button class="btn ${work.status === 'completed' ? 'btn--ghost' : 'btn--primary'}" id="completeBtn">
          ${work.status === 'completed' ? 'Reopen Work' : 'Mark as Completed'}
        </button>
      </div>
      <div style="margin-top:10px;">
        <button class="btn btn--danger" id="deleteWorkBtn" style="background:transparent;color:var(--azee-red);border:1.5px solid var(--azee-red-dim);">Delete Work</button>
      </div>
    `;

    document.querySelectorAll('.menu-row').forEach(el => {
      el.addEventListener('click', () => {
        const action = el.dataset.action;
        if (action === 'startStop') return handleStartStop(work, activeLog);
        go(action, { workId: work.id });
      });
    });
    document.getElementById('editWorkBtn').addEventListener('click', () => go('add-work', { id: work.id }));
    document.getElementById('completeBtn').addEventListener('click', async () => {
      const newStatus = work.status === 'completed' ? 'in_progress' : 'completed';
      const ok = newStatus === 'completed' ? await confirmDialog({
        title: 'Mark as completed?', body: 'This work will be moved to Completed status.', okText: 'Mark Completed', danger: false
      }) : true;
      if (!ok) return;
      work.status = newStatus; work.updatedAt = nowISO();
      await DB.works.put(work);
      toast(newStatus === 'completed' ? 'Work marked completed' : 'Work reopened');
      render();
    });
    document.getElementById('deleteWorkBtn').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete this work?',
        body: 'This will permanently delete the work along with all logs, materials, expenses, attachments and invoices.',
        okText: 'Delete'
      });
      if (!ok) return;
      await DB.deleteWorkCascade(work.id);
      toast('Work deleted');
      go('home');
    });
  }

  function menuRow(icon, title, sub, action) {
    return `<div class="menu-row" data-action="${action}">
      <div class="mi">${menuIcon(icon)}</div>
      <div class="menu-row-body">
        <div class="menu-row-title">${title}</div>
        <div class="menu-row-sub">${sub}</div>
      </div>
      <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;
  }
  function menuIcon(name) {
    const icons = {
      timer: '<path d="M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      log: '<path d="M6 4h9l3 3v13a1 1 0 01-1 1H6a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8"/><path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      materials: '<path d="M3 9l9-5 9 5-9 5-9-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 9v6l9 5 9-5V9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
      expense: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v10M9.5 9.5a2.5 2.5 0 015 0c0 3-5 2-5 5a2.5 2.5 0 005 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      attach: '<path d="M8 12l5.5-5.5a3 3 0 114.24 4.24L10 18.5A5 5 0 013 11.5L11 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      invoice: '<path d="M6 3h9l3 3v15a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.8"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none">${icons[name] || ''}</svg>`;
  }
  function emptyGeneric(msg) {
    return `<div class="empty-state"><div class="empty-state-title">${esc(msg)}</div></div>`;
  }

  async function handleStartStop(work, activeLog) {
    if (activeLog) {
      // Stop
      activeLog.endTime = nowTimeStr();
      await DB.dailyLogs.put(activeLog);
      toast('Work stopped — edit the log to add details');
      go('add-log', { workId: work.id, id: activeLog.id });
    } else {
      const log = {
        id: DB.uid('log'),
        workId: work.id,
        date: todayStr(),
        startTime: nowTimeStr(),
        endTime: '',
        workers: 1,
        description: '',
        labourAmount: 0,
        notes: '',
        createdAt: nowISO()
      };
      await DB.dailyLogs.put(log);
      toast('Work started');
      render();
    }
  }

  // ---------------------------------------------------------
  // SCREEN: DAILY WORK LOGS
  // ---------------------------------------------------------
  async function screenLogs(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    setTitle('Daily Work Log');
    let logs = await DB.dailyLogs.byIndex('workId', work.id);
    logs.sort((a, b) => (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || '')));

    viewEl.innerHTML = `
      <div class="small-note" style="margin-bottom:12px;">${esc(work.name)}</div>
      <div id="logList">${logs.length ? logs.map(logCardHtml).join('') : emptyGeneric('No log entries yet')}</div>
      <button class="btn btn--primary" id="addLogBtn">+ Add Daily Log</button>
    `;
    document.getElementById('addLogBtn').addEventListener('click', () => go('add-log', { workId: work.id }));
    wireLogCards(work.id);
  }

  function logCardHtml(l) {
    const mins = (l.startTime && l.endTime) ? minutesBetween(l.startTime, l.endTime) : null;
    return `<div class="log-card" data-id="${l.id}">
      <div class="log-date">${fmtDate(l.date)}</div>
      <div class="log-time">${l.startTime ? fmtTime12(l.startTime) : '—'} ${l.endTime ? '— ' + fmtTime12(l.endTime) : (l.startTime ? '(running)' : '')} ${mins !== null ? '· ' + fmtDuration(mins) : ''}</div>
      ${l.description ? `<div class="log-desc">${esc(l.description)}</div>` : ''}
      <div class="log-foot">
        <span class="log-workers">${l.workers || 1} Worker${(l.workers || 1) > 1 ? 's' : ''}</span>
        <span class="log-amount">${currency(l.labourAmount || 0)}</span>
      </div>
      <div class="card-actions">
        <button class="btn btn--sm btn--ghost" data-act="edit">Edit</button>
        <button class="btn btn--sm btn--ghost" data-act="delete" style="color:var(--azee-red);">Delete</button>
      </div>
    </div>`;
  }
  function wireLogCards(workId) {
    document.querySelectorAll('.log-card').forEach(card => {
      card.querySelector('[data-act=edit]').addEventListener('click', () => go('add-log', { workId, id: card.dataset.id }));
      card.querySelector('[data-act=delete]').addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete this log entry?', body: 'This log entry will be permanently removed.' });
        if (!ok) return;
        await DB.dailyLogs.delete(card.dataset.id);
        toast('Log deleted');
        screenLogs({ workId });
      });
    });
  }

  // ---------------------------------------------------------
  // SCREEN: ADD / EDIT DAILY LOG
  // ---------------------------------------------------------
  async function screenAddEditLog(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    const editId = params.id;
    const log = editId ? await DB.dailyLogs.get(editId) : null;
    setTitle(editId ? 'Edit Log' : 'Add Daily Log');

    viewEl.innerHTML = `
      <form id="logForm">
        <div class="field"><label>Date</label><input type="date" id="f_date" value="${log?.date || todayStr()}" required></div>
        <div class="field-row">
          <div class="field"><label>Start Time</label><input type="time" id="f_start" value="${log?.startTime || ''}"></div>
          <div class="field"><label>End Time</label><input type="time" id="f_end" value="${log?.endTime || ''}"></div>
        </div>
        <div class="field-hint" id="durHint">${log?.startTime && log?.endTime ? fmtDuration(minutesBetween(log.startTime, log.endTime)) + ' total' : 'Working hours will be calculated automatically'}</div>
        <div class="field" style="margin-top:14px;"><label>Number of Workers</label><input type="number" id="f_workers" min="1" value="${log?.workers || 1}"></div>
        <div class="field"><label>Work Description</label><textarea id="f_desc" placeholder="What was done today">${esc(log?.description || '')}</textarea></div>
        <div class="field"><label>Labour Amount (₹)</label><input type="number" id="f_amount" inputmode="decimal" placeholder="0" value="${log?.labourAmount || ''}"></div>
        <div class="field"><label>Notes</label><textarea id="f_notes" placeholder="Optional">${esc(log?.notes || '')}</textarea></div>
        <button type="submit" class="btn btn--primary">${editId ? 'Save Changes' : 'Save Log'}</button>
      </form>
    `;

    function updateDurHint() {
      const s = document.getElementById('f_start').value, e = document.getElementById('f_end').value;
      const hint = document.getElementById('durHint');
      if (s && e) hint.textContent = fmtDuration(minutesBetween(s, e)) + ' total';
      else hint.textContent = 'Working hours will be calculated automatically';
    }
    document.getElementById('f_start').addEventListener('change', updateDurHint);
    document.getElementById('f_end').addEventListener('change', updateDurHint);

    document.getElementById('logForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const record = {
        id: log?.id || DB.uid('log'),
        workId: work.id,
        date: document.getElementById('f_date').value || todayStr(),
        startTime: document.getElementById('f_start').value,
        endTime: document.getElementById('f_end').value,
        workers: Number(document.getElementById('f_workers').value) || 1,
        description: document.getElementById('f_desc').value.trim(),
        labourAmount: Number(document.getElementById('f_amount').value) || 0,
        notes: document.getElementById('f_notes').value.trim(),
        createdAt: log?.createdAt || nowISO()
      };
      await DB.dailyLogs.put(record);
      work.updatedAt = nowISO(); await DB.works.put(work);
      toast('Log saved');
      go('logs', { workId: work.id });
    });
  }

  // ---------------------------------------------------------
  // SCREEN: MATERIALS
  // ---------------------------------------------------------
  async function screenMaterials(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    setTitle('Materials / Purchases');
    let mats = await DB.materials.byIndex('workId', work.id);
    mats.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = mats.reduce((s, m) => s + (Number(m.amount) || 0), 0);

    viewEl.innerHTML = `
      <div class="total-bar"><span class="tb-label">Total Materials</span><span class="tb-value">${currency(total)}</span></div>
      ${mats.length ? `<div class="small-note" style="margin-bottom:10px;">Tap an item to edit · Press and hold for delete</div>` : ''}
      <div id="matList">${mats.length ? mats.map(materialRowHtml).join('') : emptyGeneric('No materials added yet')}</div>
      <button class="btn btn--primary" id="addBtn">+ Add Material</button>
    `;
    document.getElementById('addBtn').addEventListener('click', () => go('add-material', { workId: work.id }));
    wireDeletable('.list-row', async (id) => { await DB.materials.delete(id); }, () => screenMaterials(params), 'material', (id) => go('add-material', { workId: work.id, id }));
  }
  function materialRowHtml(m) {
    return `<div class="list-row" data-id="${m.id}">
      <div class="thumb">${materialIcon()}</div>
      <div class="list-row-body">
        <div class="list-row-title">${esc(m.itemName)}</div>
        <div class="list-row-sub">${esc(m.quantity || '')} ${esc(m.unit || '')} ${m.supplier ? '· ' + esc(m.supplier) : ''} ${m.date ? '· ' + fmtDate(m.date) : ''}</div>
      </div>
      <div class="list-row-amount">${currency(m.amount || 0)}</div>
    </div>`;
  }
  function materialIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-5 9 5-9 5-9-5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 9v6l9 5 9-5V9" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }

  function wireDeletable(selector, deleteFn, refreshFn, label, editFn) {
    document.querySelectorAll(selector).forEach(row => {
      row.addEventListener('click', (e) => { if (editFn) editFn(row.dataset.id); });
      row.addEventListener('contextmenu', (e) => e.preventDefault());
      let pressTimer;
      row.addEventListener('touchstart', () => { pressTimer = setTimeout(() => openRowActions(row, deleteFn, refreshFn, label, editFn), 480); });
      row.addEventListener('touchend', () => clearTimeout(pressTimer));
    });
  }

  function openRowActions(row, deleteFn, refreshFn, label, editFn) {
    const content = showSheet(`
      <div class="sheet-title">${label ? label[0].toUpperCase() + label.slice(1) : 'Item'} options</div>
      <div class="sheet-option" id="shEdit">Edit</div>
      <div class="sheet-option" id="shDelete" style="color:var(--azee-red);">Delete</div>
    `);
    content.querySelector('#shEdit').addEventListener('click', () => { hideSheet(); editFn && editFn(row.dataset.id); });
    content.querySelector('#shDelete').addEventListener('click', async () => {
      hideSheet();
      const ok = await confirmDialog({ title: `Delete this ${label}?`, body: 'This action cannot be undone.' });
      if (!ok) return;
      await deleteFn(row.dataset.id);
      toast(label[0].toUpperCase() + label.slice(1) + ' deleted');
      refreshFn();
    });
  }

  // ---------------------------------------------------------
  // SCREEN: ADD / EDIT MATERIAL
  // ---------------------------------------------------------
  async function screenAddEditMaterial(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    const editId = params.id;
    const item = editId ? await DB.materials.get(editId) : null;
    setTitle(editId ? 'Edit Material' : 'Add Material');

    viewEl.innerHTML = `
      <form id="matForm">
        <div class="field"><label>Item Name <span class="req">*</span></label><input type="text" id="f_item" placeholder="e.g. PVC Pipe 1 inch" value="${esc(item?.itemName || '')}" required></div>
        <div class="field-row">
          <div class="field"><label>Quantity</label><input type="number" id="f_qty" inputmode="decimal" value="${item?.quantity ?? ''}"></div>
          <div class="field"><label>Unit</label><input type="text" id="f_unit" placeholder="pcs / m / kg" value="${esc(item?.unit || '')}"></div>
        </div>
        <div class="field"><label>Amount (₹)</label><input type="number" id="f_amount" inputmode="decimal" value="${item?.amount ?? ''}"></div>
        <div class="field"><label>Supplier / Shop</label><input type="text" id="f_supplier" value="${esc(item?.supplier || '')}"></div>
        <div class="field"><label>Date</label><input type="date" id="f_date" value="${item?.date || todayStr()}"></div>
        <div class="field"><label>Notes</label><textarea id="f_notes">${esc(item?.notes || '')}</textarea></div>
        <div class="field">
          <label>Attach Bill</label>
          <input type="file" id="f_file" accept="image/*,application/pdf" capture="environment">
          <div class="field-hint" id="fileHint">${item?.attachmentId ? 'Bill already attached' : 'Optional — image or PDF'}</div>
        </div>
        <button type="submit" class="btn btn--primary">${editId ? 'Save Changes' : 'Save Material'}</button>
      </form>
    `;

    document.getElementById('matForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('f_item').value.trim();
      if (!name) { toast('Item name is required'); return; }
      let attachmentId = item?.attachmentId || null;
      const file = document.getElementById('f_file').files[0];
      if (file) {
        attachmentId = await saveAttachmentFromFile(work.id, file, 'material');
      }
      const record = {
        id: item?.id || DB.uid('mat'),
        workId: work.id,
        itemName: name,
        quantity: document.getElementById('f_qty').value,
        unit: document.getElementById('f_unit').value.trim(),
        amount: Number(document.getElementById('f_amount').value) || 0,
        supplier: document.getElementById('f_supplier').value.trim(),
        date: document.getElementById('f_date').value,
        notes: document.getElementById('f_notes').value.trim(),
        attachmentId,
        createdAt: item?.createdAt || nowISO()
      };
      await DB.materials.put(record);
      work.updatedAt = nowISO(); await DB.works.put(work);
      toast('Material saved');
      go('materials', { workId: work.id });
    });
  }

  async function saveAttachmentFromFile(workId, file, linkedType) {
    const isPdf = file.type === 'application/pdf';
    const dataUrl = await fileToDataURL(file);
    const thumb = isPdf ? null : await compressImageDataURL(dataUrl, 900, 0.72);
    const att = {
      id: DB.uid('att'),
      workId,
      name: file.name,
      type: isPdf ? 'pdf' : 'image',
      dataUrl,
      thumbDataUrl: thumb,
      linkedType: linkedType || 'general',
      createdAt: nowISO()
    };
    await DB.attachments.put(att);
    return att.id;
  }

  // ---------------------------------------------------------
  // SCREEN: EXPENSES
  // ---------------------------------------------------------
  const EXPENSE_CATEGORIES = ['Transport', 'Labour', 'Materials', 'Miscellaneous', 'Other'];

  async function screenExpenses(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    setTitle('Expenses');
    let exps = await DB.expenses.byIndex('workId', work.id);
    exps.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    viewEl.innerHTML = `
      <div class="total-bar"><span class="tb-label">Total Expenses</span><span class="tb-value">${currency(total)}</span></div>
      ${exps.length ? `<div class="small-note" style="margin-bottom:10px;">Tap an item to edit · Press and hold for delete</div>` : ''}
      <div id="expList">${exps.length ? exps.map(expenseRowHtml).join('') : emptyGeneric('No expenses recorded yet')}</div>
      <button class="btn btn--primary" id="addBtn">+ Add Expense</button>
    `;
    document.getElementById('addBtn').addEventListener('click', () => go('add-expense', { workId: work.id }));
    wireDeletable('.list-row', async (id) => { await DB.expenses.delete(id); }, () => screenExpenses(params), 'expense', (id) => go('add-expense', { workId: work.id, id }));
  }
  function expenseRowHtml(x) {
    return `<div class="list-row" data-id="${x.id}">
      <div class="thumb">${expenseIcon()}</div>
      <div class="list-row-body">
        <div class="list-row-title">${esc(x.category)}${x.description ? ' — ' + esc(x.description) : ''}</div>
        <div class="list-row-sub">${x.date ? fmtDate(x.date) : ''}</div>
      </div>
      <div class="list-row-amount">${currency(x.amount || 0)}</div>
    </div>`;
  }
  function expenseIcon() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v10M9.5 9.5a2.5 2.5 0 015 0c0 3-5 2-5 5a2.5 2.5 0 005 0" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  }

  async function screenAddEditExpense(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    const editId = params.id;
    const item = editId ? await DB.expenses.get(editId) : null;
    setTitle(editId ? 'Edit Expense' : 'Add Expense');
    const cat = item?.category || 'Miscellaneous';

    viewEl.innerHTML = `
      <form id="expForm">
        <div class="field">
          <label>Category</label>
          <div class="chip-select" id="f_cat">
            ${EXPENSE_CATEGORIES.map(c => `<button type="button" class="chip-option ${c === cat ? 'active' : ''}" data-val="${c}">${c}</button>`).join('')}
          </div>
        </div>
        <div class="field"><label>Date</label><input type="date" id="f_date" value="${item?.date || todayStr()}"></div>
        <div class="field"><label>Description</label><input type="text" id="f_desc" placeholder="What was this for" value="${esc(item?.description || '')}"></div>
        <div class="field"><label>Amount (₹)</label><input type="number" id="f_amount" inputmode="decimal" value="${item?.amount ?? ''}"></div>
        <div class="field"><label>Notes</label><textarea id="f_notes">${esc(item?.notes || '')}</textarea></div>
        <div class="field">
          <label>Attachment</label>
          <input type="file" id="f_file" accept="image/*,application/pdf" capture="environment">
          <div class="field-hint">${item?.attachmentId ? 'Attachment already added' : 'Optional'}</div>
        </div>
        <button type="submit" class="btn btn--primary">${editId ? 'Save Changes' : 'Save Expense'}</button>
      </form>
    `;
    document.querySelectorAll('#f_cat .chip-option').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('#f_cat .chip-option').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
      });
    });
    document.getElementById('expForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      let attachmentId = item?.attachmentId || null;
      const file = document.getElementById('f_file').files[0];
      if (file) attachmentId = await saveAttachmentFromFile(work.id, file, 'expense');
      const record = {
        id: item?.id || DB.uid('exp'),
        workId: work.id,
        category: document.querySelector('#f_cat .chip-option.active')?.dataset.val || 'Miscellaneous',
        date: document.getElementById('f_date').value,
        description: document.getElementById('f_desc').value.trim(),
        amount: Number(document.getElementById('f_amount').value) || 0,
        notes: document.getElementById('f_notes').value.trim(),
        attachmentId,
        createdAt: item?.createdAt || nowISO()
      };
      await DB.expenses.put(record);
      work.updatedAt = nowISO(); await DB.works.put(work);
      toast('Expense saved');
      go('expenses', { workId: work.id });
    });
  }

  // ---------------------------------------------------------
  // SCREEN: BILLS & ATTACHMENTS
  // ---------------------------------------------------------
  async function screenAttachments(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    setTitle('Bills & Attachments');
    const filter = params.filter || 'all';
    let atts = await DB.attachments.byIndex('workId', work.id);
    atts.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    if (filter === 'images') atts = atts.filter(a => a.type === 'image');
    if (filter === 'pdf') atts = atts.filter(a => a.type === 'pdf');

    viewEl.innerHTML = `
      <div class="filter-row">
        <button class="filter-pill ${filter === 'all' ? 'active' : ''}" data-f="all">All</button>
        <button class="filter-pill ${filter === 'images' ? 'active' : ''}" data-f="images">Images</button>
        <button class="filter-pill ${filter === 'pdf' ? 'active' : ''}" data-f="pdf">PDF</button>
      </div>
      <div id="attList">${atts.length ? atts.map(attRowHtml).join('') : emptyGeneric('No attachments yet')}</div>
      <div class="field" style="margin-top:14px;">
        <label>Add Attachment</label>
        <input type="file" id="f_file" accept="image/*,application/pdf" capture="environment">
      </div>
    `;
    document.querySelectorAll('.filter-pill').forEach(el => el.addEventListener('click', () => go('attachments', { workId: work.id, filter: el.dataset.f })));
    document.getElementById('f_file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      showProgress('Saving attachment…');
      await saveAttachmentFromFile(work.id, file, 'general');
      hideProgress();
      toast('Attachment saved');
      screenAttachments(params);
    });
    document.querySelectorAll('.list-row').forEach(row => {
      row.addEventListener('click', () => go('attachment-preview', { id: row.dataset.id, workId: work.id }));
    });
  }
  function attRowHtml(a) {
    const thumb = a.type === 'image' ? `<img src="${a.thumbDataUrl || a.dataUrl}">` : pdfIcon();
    return `<div class="list-row" data-id="${a.id}">
      <div class="thumb">${thumb}</div>
      <div class="list-row-body">
        <div class="list-row-title">${esc(a.name)}</div>
        <div class="list-row-sub">${a.type.toUpperCase()} · ${fmtDate(a.createdAt)}</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="color:var(--text-faint);flex-shrink:0;"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>`;
  }
  function pdfIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l3 3v15a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" stroke-width="1.6"/><path d="M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  }

  async function screenAttachmentPreview(params) {
    const att = await DB.attachments.get(params.id);
    if (!att) return;
    setTitle(att.name);
    viewEl.innerHTML = `
      <div class="attach-preview">
        ${att.type === 'image'
          ? `<img src="${att.dataUrl}">`
          : `<div class="empty-state"><div class="empty-state-title">PDF Document</div><div class="empty-state-sub">Open with the buttons below</div></div>`}
      </div>
      <div class="field" style="margin-top:16px;"><label>Rename</label><input type="text" id="f_rename" value="${esc(att.name)}"></div>
      <div class="btn-row">
        <button class="btn btn--outline" id="openBtn">${att.type === 'pdf' ? 'Open PDF' : 'View Full Size'}</button>
        <button class="btn btn--primary" id="saveNameBtn">Save Name</button>
      </div>
      <button class="btn btn--danger" id="delBtn" style="margin-top:10px;background:transparent;color:var(--azee-red);border:1.5px solid var(--azee-red-dim);">Delete Attachment</button>
    `;
    document.getElementById('openBtn').addEventListener('click', () => {
      const w = window.open();
      if (w) { w.document.write(`<iframe src="${att.dataUrl}" style="border:0;width:100%;height:100%;"></iframe>`); }
      else toast('Enable pop-ups to open this file');
    });
    document.getElementById('saveNameBtn').addEventListener('click', async () => {
      att.name = document.getElementById('f_rename').value.trim() || att.name;
      await DB.attachments.put(att);
      toast('Renamed');
      go('attachments', { workId: att.workId });
    });
    document.getElementById('delBtn').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Delete attachment?', body: 'This file will be permanently removed.' });
      if (!ok) return;
      await DB.attachments.delete(att.id);
      toast('Attachment deleted');
      go('attachments', { workId: att.workId });
    });
  }

  // ---------------------------------------------------------
  // SCREEN: INVOICE
  // ---------------------------------------------------------
  async function screenInvoice(params) {
    const work = await DB.works.get(params.workId);
    if (!work) return;
    setTitle('Invoice');
    const fin = await computeWorkFinance(work.id);
    let invoices = await DB.invoices.byIndex('workId', work.id);
    invoices.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    let inv = invoices[0]; // latest draft/generated invoice for this work

    if (!inv) {
      const invoiceNumber = await nextInvoiceNumber();
      inv = {
        id: DB.uid('inv'),
        workId: work.id,
        invoiceNumber,
        invoiceDate: todayStr(),
        labourTotal: fin.labour,
        materialsTotal: fin.materials,
        expensesTotal: fin.otherExp,
        discount: 0,
        additionalCharges: 0,
        paidAmount: 0,
        notes: BIZ?.invoiceNotes || '',
        businessSnapshot: BIZ,
        createdAt: nowISO(),
        finalized: false
      };
    } else {
      // refresh live totals if not finalized
      if (!inv.finalized) {
        inv.labourTotal = fin.labour; inv.materialsTotal = fin.materials; inv.expensesTotal = fin.otherExp;
      }
    }
    const totalAmount = inv.labourTotal + inv.materialsTotal + inv.expensesTotal + Number(inv.additionalCharges || 0) - Number(inv.discount || 0);
    const balance = totalAmount - Number(inv.paidAmount || 0);

    viewEl.innerHTML = `
      <div class="info-card">
        <div class="info-row"><span class="k">Invoice No.</span><span class="v">${esc(inv.invoiceNumber)}</span></div>
        <div class="info-row"><span class="k">Invoice Date</span><span class="v">${fmtDate(inv.invoiceDate)}</span></div>
      </div>
      <div class="finance-grid">
        <div class="finance-cell"><div class="fc-label">Labour</div><div class="fc-value">${currency(inv.labourTotal)}</div></div>
        <div class="finance-cell"><div class="fc-label">Materials</div><div class="fc-value">${currency(inv.materialsTotal)}</div></div>
        <div class="finance-cell"><div class="fc-label">Other</div><div class="fc-value">${currency(inv.expensesTotal)}</div></div>
      </div>
      <form id="invForm">
        <div class="field-row">
          <div class="field"><label>Discount (₹)</label><input type="number" id="f_discount" inputmode="decimal" value="${inv.discount || 0}"></div>
          <div class="field"><label>Additional Charges (₹)</label><input type="number" id="f_addl" inputmode="decimal" value="${inv.additionalCharges || 0}"></div>
        </div>
        <div class="total-bar"><span class="tb-label">Total Amount</span><span class="tb-value" id="totalDisplay">${currency(totalAmount)}</span></div>
        <div class="field"><label>Paid Amount (₹)</label><input type="number" id="f_paid" inputmode="decimal" value="${inv.paidAmount || 0}"></div>
        <div class="info-row" style="padding:4px 2px;"><span class="k">Balance Amount</span><span class="v" id="balanceDisplay" style="color:var(--azee-red);font-weight:800;">${currency(balance)}</span></div>
        <div class="field"><label>Invoice Notes / Terms</label><textarea id="f_notes">${esc(inv.notes || '')}</textarea></div>
        <button type="submit" class="btn btn--primary">Save Invoice</button>
      </form>
      <div class="btn-row">
        <button class="btn btn--outline" id="previewBtn">Preview</button>
        <button class="btn btn--outline" id="pdfBtn">Generate PDF</button>
      </div>
      <div class="btn-row">
        <button class="btn btn--ghost" id="shareBtn">Share</button>
        <button class="btn btn--ghost" id="printBtn">Print</button>
      </div>
      ${!BIZ?.businessName ? `<div class="small-note" style="margin-top:14px;">Tip: add your business details in Settings → Invoice / Business Details so invoices show your business name automatically.</div>` : ''}
    `;

    function recompute() {
      const d = Number(document.getElementById('f_discount').value) || 0;
      const a = Number(document.getElementById('f_addl').value) || 0;
      const p = Number(document.getElementById('f_paid').value) || 0;
      const t = inv.labourTotal + inv.materialsTotal + inv.expensesTotal + a - d;
      document.getElementById('totalDisplay').textContent = currency(t);
      document.getElementById('balanceDisplay').textContent = currency(t - p);
      return t;
    }
    ['f_discount', 'f_addl', 'f_paid'].forEach(id => document.getElementById(id).addEventListener('input', recompute));

    async function collectInvoice(finalize) {
      inv.discount = Number(document.getElementById('f_discount').value) || 0;
      inv.additionalCharges = Number(document.getElementById('f_addl').value) || 0;
      inv.paidAmount = Number(document.getElementById('f_paid').value) || 0;
      inv.notes = document.getElementById('f_notes').value.trim();
      if (finalize && !inv.finalized) {
        inv.finalized = true;
        inv.businessSnapshot = BIZ; // lock business details at generation time
      }
      await DB.invoices.put(inv);
      return inv;
    }

    document.getElementById('invForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await collectInvoice(false);
      toast('Invoice saved');
    });
    document.getElementById('previewBtn').addEventListener('click', async () => {
      await collectInvoice(false);
      go('invoice-preview', { id: inv.id });
    });
    document.getElementById('pdfBtn').addEventListener('click', async () => {
      await collectInvoice(true);
      await generateAndSaveInvoicePdf(work, inv, fin);
    });
    document.getElementById('shareBtn').addEventListener('click', async () => {
      await collectInvoice(true);
      await generateAndSaveInvoicePdf(work, inv, fin, 'share');
    });
    document.getElementById('printBtn').addEventListener('click', async () => {
      await collectInvoice(true);
      await generateAndSaveInvoicePdf(work, inv, fin, 'print');
    });
  }

  async function nextInvoiceNumber() {
    const settings = await getSettings();
    const prefix = (BIZ?.invoicePrefix || 'AZ');
    const num = settings.invoiceNextNumber || 1;
    return `${prefix}-${String(num).padStart(4, '0')}`;
  }
  async function bumpInvoiceNumber() {
    const settings = await getSettings();
    settings.invoiceNextNumber = (settings.invoiceNextNumber || 1) + 1;
    await DB.setMeta('appSettings', settings);
    SETTINGS = settings;
  }

  async function screenInvoicePreview(params) {
    const inv = await DB.invoices.get(params.id);
    if (!inv) return;
    const work = await DB.works.get(inv.workId);
    setTitle('Invoice Preview');
    const fin = { labour: inv.labourTotal, materials: inv.materialsTotal, otherExp: inv.expensesTotal };
    const total = inv.labourTotal + inv.materialsTotal + inv.expensesTotal + Number(inv.additionalCharges || 0) - Number(inv.discount || 0);
    const balance = total - Number(inv.paidAmount || 0);
    const biz = inv.businessSnapshot || BIZ || {};

    const [logs, mats, exps] = await Promise.all([
      DB.dailyLogs.byIndex('workId', work.id),
      DB.materials.byIndex('workId', work.id),
      DB.expenses.byIndex('workId', work.id)
    ]);

    viewEl.innerHTML = `
      <div class="invoice-doc">
        <h3>${esc(biz.businessName || 'Your Business Name')}</h3>
        <div>${esc(biz.address || '')}</div>
        <div>${biz.phone ? 'Ph: ' + esc(biz.phone) : ''} ${biz.gst ? '· GST: ' + esc(biz.gst) : ''}</div>
        <div class="divider"></div>
        <div><b>Invoice ${esc(inv.invoiceNumber)}</b> &nbsp; Date: ${fmtDate(inv.invoiceDate)}</div>
        <div style="margin-top:6px;"><b>Bill To:</b> ${esc(work.customerName || work.companyName || '—')}</div>
        <div>${esc(work.address || '')} ${work.buildingNo ? '(' + esc(work.buildingNo) + ')' : ''}</div>
        <div style="margin-top:10px;"><b>Work:</b> ${esc(work.name)}</div>

        <table>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td>Labour (${logs.length} day entries)</td><td>${currency(inv.labourTotal)}</td></tr>
            <tr><td>Materials (${mats.length} items)</td><td>${currency(inv.materialsTotal)}</td></tr>
            <tr><td>Other Expenses (${exps.length} items)</td><td>${currency(inv.expensesTotal)}</td></tr>
            ${Number(inv.additionalCharges) ? `<tr><td>Additional Charges</td><td>${currency(inv.additionalCharges)}</td></tr>` : ''}
            ${Number(inv.discount) ? `<tr><td>Discount</td><td>-${currency(inv.discount)}</td></tr>` : ''}
            <tr class="invoice-total-row"><td>Total Amount</td><td>${currency(total)}</td></tr>
            <tr><td>Paid Amount</td><td>${currency(inv.paidAmount)}</td></tr>
            <tr class="invoice-total-row"><td>Balance Amount</td><td>${currency(balance)}</td></tr>
          </tbody>
        </table>
        <div style="margin-top:10px;font-size:11px;color:#555;">${esc(amountInWords(total))}</div>
        ${inv.notes ? `<div style="margin-top:10px;"><b>Notes:</b> ${esc(inv.notes)}</div>` : ''}
      </div>
      <div class="btn-row">
        <button class="btn btn--outline" id="pdfBtn">PDF</button>
        <button class="btn btn--outline" id="shareBtn">Share</button>
        <button class="btn btn--outline" id="printBtn">Print</button>
      </div>
    `;
    document.getElementById('pdfBtn').addEventListener('click', () => generateAndSaveInvoicePdf(work, inv, null));
    document.getElementById('shareBtn').addEventListener('click', () => generateAndSaveInvoicePdf(work, inv, null, 'share'));
    document.getElementById('printBtn').addEventListener('click', () => generateAndSaveInvoicePdf(work, inv, null, 'print'));
  }

  async function generateAndSaveInvoicePdf(work, inv, fin, mode) {
    showProgress('Generating PDF…');
    try {
      const [logs, mats, exps] = await Promise.all([
        DB.dailyLogs.byIndex('workId', work.id),
        DB.materials.byIndex('workId', work.id),
        DB.expenses.byIndex('workId', work.id)
      ]);
      const blob = await PdfGen.buildInvoicePdf({
        work, invoice: inv, logs, materials: mats, expenses: exps,
        business: inv.businessSnapshot || BIZ || {}
      });
      const fileName = `Invoice_${inv.invoiceNumber}_${(work.name || '').replace(/[^a-z0-9]+/gi, '_')}.pdf`;

      if (mode === 'share' && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
          hideProgress();
          return;
        }
      }
      if (mode === 'print') {
        const url = URL.createObjectURL(blob);
        const w = window.open(url);
        hideProgress();
        if (w) { w.addEventListener('load', () => { try { w.print(); } catch (e) {} }); }
        else toast('Enable pop-ups to print');
        return;
      }
      // Default: download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      hideProgress();
      toast('PDF saved to Downloads');
    } catch (err) {
      hideProgress();
      console.error(err);
      toast('Could not generate PDF: ' + err.message);
    }
  }

  // ---------------------------------------------------------
  // SCREEN: REPORTS
  // ---------------------------------------------------------
  async function screenReports() {
    setTitle('Reports');
    const works = await DB.works.all();
    let totalWork = 0, totalLabour = 0, totalMaterials = 0, totalExpenses = 0, totalPaid = 0;
    for (const w of works) {
      const fin = await computeWorkFinance(w.id);
      totalWork += fin.total; totalLabour += fin.labour; totalMaterials += fin.materials; totalExpenses += fin.otherExp;
      totalPaid += await getPaidTotal(w.id);
    }
    const totalPending = Math.max(0, totalWork - totalPaid);
    const active = works.filter(w => w.status !== 'completed').length;
    const completed = works.filter(w => w.status === 'completed').length;

    viewEl.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Total Work Amount</div><div class="stat-value">${currency(totalWork)}</div></div>
        <div class="stat-card"><div class="stat-label">Total Labour</div><div class="stat-value">${currency(totalLabour)}</div></div>
        <div class="stat-card"><div class="stat-label">Total Materials</div><div class="stat-value">${currency(totalMaterials)}</div></div>
        <div class="stat-card"><div class="stat-label">Total Expenses</div><div class="stat-value">${currency(totalExpenses)}</div></div>
        <div class="stat-card accent-blue"><div class="stat-label">Paid Amount</div><div class="stat-value">${currency(totalPaid)}</div></div>
        <div class="stat-card accent-red"><div class="stat-label">Pending Amount</div><div class="stat-value">${currency(totalPending)}</div></div>
      </div>
      <div class="section-title">Works Summary</div>
      <div class="info-card">
        <div class="info-row"><span class="k">Active Works</span><span class="v">${active}</span></div>
        <div class="info-row"><span class="k">Completed Works</span><span class="v">${completed}</span></div>
        <div class="info-row"><span class="k">Total Works</span><span class="v">${works.length}</span></div>
      </div>
      <div class="section-title">By Work</div>
      <div id="perWork">${works.length ? '' : emptyGeneric('No data yet')}</div>
    `;
    const perWorkEl = document.getElementById('perWork');
    for (const w of works) {
      const fin = await computeWorkFinance(w.id);
      const paid = await getPaidTotal(w.id);
      const row = document.createElement('div');
      row.className = 'work-item';
      row.innerHTML = `<div class="work-item-body">
        <div class="work-item-title">${esc(w.name)}</div>
        <div class="work-item-sub">${currency(fin.total)} total · ${currency(Math.max(0, fin.total - paid))} pending</div>
      </div>${statusChip(w.status)}`;
      row.addEventListener('click', () => go('work-details', { id: w.id }));
      perWorkEl.appendChild(row);
    }
  }

  // ---------------------------------------------------------
  // SCREEN: SEARCH
  // ---------------------------------------------------------
  async function screenSearch() {
    setTitle('Search');
    viewEl.innerHTML = `
      <div class="search-box">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="text" id="q" placeholder="Search work, customer, building, phone…" autofocus>
      </div>
      <div id="results"></div>
    `;
    const works = await DB.works.all();
    const input = document.getElementById('q');
    const resultsEl = document.getElementById('results');
    function run() {
      const q = input.value.trim().toLowerCase();
      if (!q) { resultsEl.innerHTML = ''; return; }
      const matches = works.filter(w => [w.name, w.customerName, w.companyName, w.buildingNo, w.phone]
        .filter(Boolean).some(f => f.toLowerCase().includes(q)));
      resultsEl.innerHTML = matches.length ? matches.map(workItemHtml).join('') : emptyGeneric('No matches found');
      wireWorkList();
    }
    input.addEventListener('input', run);
  }

  // ---------------------------------------------------------
  // SCREEN: SETTINGS
  // ---------------------------------------------------------
  async function screenSettings() {
    setTitle('Settings');
    viewEl.innerHTML = `
      <div class="settings-group">
        <div class="settings-row" data-go="business-details">
          <div class="settings-row-title">Invoice / Business Details</div>
          <span class="settings-row-val">${BIZ?.businessName ? esc(BIZ.businessName) : 'Not set'}</span>
          ${chev()}
        </div>
      </div>
      <div class="settings-group">
        <div class="settings-row" data-go="appearance">
          <div class="settings-row-title">Appearance</div>
          <span class="settings-row-val">${themeLabel(SETTINGS?.theme)}</span>
          ${chev()}
        </div>
        <div class="settings-row" data-go="invoice-number-settings">
          <div class="settings-row-title">Invoice Number Settings</div>
          <span class="settings-row-val">${esc(BIZ?.invoicePrefix || 'AZ')}-${String(SETTINGS?.invoiceNextNumber || 1).padStart(4, '0')}</span>
          ${chev()}
        </div>
      </div>
      <div class="settings-group">
        <div class="settings-row" data-go="backup-restore">
          <div class="settings-row-title">Backup & Restore</div>
          ${chev()}
        </div>
        <div class="settings-row" data-go="about">
          <div class="settings-row-title">About App</div>
          ${chev()}
        </div>
      </div>
    `;
    document.querySelectorAll('.settings-row[data-go]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.go));
    });
  }
  function chev() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="color:var(--text-faint);"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function themeLabel(t) {
    return t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System Default';
  }

  // ---------------------------------------------------------
  // SCREEN: BUSINESS DETAILS
  // ---------------------------------------------------------
  async function screenBusinessDetails() {
    setTitle('Business Details');
    const b = BIZ || {};
    viewEl.innerHTML = `
      <form id="bizForm">
        <div class="field"><label>Business Name</label><input type="text" id="f_bname" value="${esc(b.businessName || '')}"></div>
        <div class="field"><label>Owner Name</label><input type="text" id="f_owner" value="${esc(b.ownerName || '')}"></div>
        <div class="field-row">
          <div class="field"><label>Phone Number</label><input type="tel" id="f_phone" value="${esc(b.phone || '')}"></div>
          <div class="field"><label>WhatsApp Number</label><input type="tel" id="f_wa" value="${esc(b.whatsapp || '')}"></div>
        </div>
        <div class="field"><label>Email</label><input type="email" id="f_email" value="${esc(b.email || '')}"></div>
        <div class="field"><label>Address</label><textarea id="f_addr">${esc(b.address || '')}</textarea></div>
        <div class="field"><label>GST Number</label><input type="text" id="f_gst" value="${esc(b.gst || '')}"></div>
        <div class="field"><label>Invoice Prefix</label><input type="text" id="f_prefix" placeholder="AZ" value="${esc(b.invoicePrefix || 'AZ')}"></div>
        <div class="field"><label>UPI ID</label><input type="text" id="f_upi" value="${esc(b.upiId || '')}"></div>
        <div class="field"><label>Bank Details</label><textarea id="f_bank" placeholder="Account no, IFSC, Bank name">${esc(b.bankDetails || '')}</textarea></div>
        <div class="field"><label>Invoice Notes / Terms</label><textarea id="f_notes">${esc(b.invoiceNotes || '')}</textarea></div>
        <div class="field">
          <label>Logo</label>
          <input type="file" id="f_logo" accept="image/*">
          ${b.logoDataUrl ? `<div class="field-hint">Logo already set</div>` : ''}
        </div>
        <div class="field">
          <label>Signature</label>
          <input type="file" id="f_sign" accept="image/*">
          ${b.signatureDataUrl ? `<div class="field-hint">Signature already set</div>` : ''}
        </div>
        <div class="small-note" style="margin-bottom:14px;">Previously generated invoices keep the business details that were used at the time — changing this later won't alter old invoices.</div>
        <button type="submit" class="btn btn--primary">Save Business Details</button>
      </form>
    `;
    document.getElementById('bizForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const logoFile = document.getElementById('f_logo').files[0];
      const signFile = document.getElementById('f_sign').files[0];
      const logoDataUrl = logoFile ? await compressImageDataURL(await fileToDataURL(logoFile), 500, 0.85) : (b.logoDataUrl || null);
      const signatureDataUrl = signFile ? await compressImageDataURL(await fileToDataURL(signFile), 500, 0.85) : (b.signatureDataUrl || null);
      BIZ = {
        businessName: document.getElementById('f_bname').value.trim(),
        ownerName: document.getElementById('f_owner').value.trim(),
        phone: document.getElementById('f_phone').value.trim(),
        whatsapp: document.getElementById('f_wa').value.trim(),
        email: document.getElementById('f_email').value.trim(),
        address: document.getElementById('f_addr').value.trim(),
        gst: document.getElementById('f_gst').value.trim(),
        invoicePrefix: document.getElementById('f_prefix').value.trim() || 'AZ',
        upiId: document.getElementById('f_upi').value.trim(),
        bankDetails: document.getElementById('f_bank').value.trim(),
        invoiceNotes: document.getElementById('f_notes').value.trim(),
        logoDataUrl, signatureDataUrl
      };
      await DB.setMeta('businessDetails', BIZ);
      toast('Business details saved');
      history.back();
    });
  }

  // ---------------------------------------------------------
  // SCREEN: APPEARANCE
  // ---------------------------------------------------------
  async function screenAppearance() {
    setTitle('Appearance');
    const current = SETTINGS?.theme || 'system';
    viewEl.innerHTML = `
      <div class="section-title">Theme</div>
      <div class="settings-group">
        ${['system', 'light', 'dark'].map((t, i, arr) => `
          <div class="settings-row" data-theme-choice="${t}">
            <div class="settings-row-title">${themeLabel(t)}</div>
            <div class="switch"><input type="radio" name="th" ${current === t ? 'checked' : ''} disabled><div class="switch-track"></div></div>
          </div>`).join('')}
      </div>
      <div class="small-note">Day Mode and Dark Mode share the exact same layout and features — only colors change.</div>
    `;
    document.querySelectorAll('[data-theme-choice]').forEach(el => {
      el.addEventListener('click', async () => {
        SETTINGS.theme = el.dataset.themeChoice;
        await DB.setMeta('appSettings', SETTINGS);
        applyTheme(SETTINGS.theme);
        screenAppearance();
      });
    });
  }

  // ---------------------------------------------------------
  // SCREEN: INVOICE NUMBER SETTINGS
  // ---------------------------------------------------------
  async function screenInvoiceNumberSettings() {
    setTitle('Invoice Numbering');
    viewEl.innerHTML = `
      <form id="invNumForm">
        <div class="field"><label>Invoice Prefix</label><input type="text" id="f_prefix" value="${esc(BIZ?.invoicePrefix || 'AZ')}"></div>
        <div class="field"><label>Next Invoice Number</label><input type="number" min="1" id="f_next" value="${SETTINGS?.invoiceNextNumber || 1}"></div>
        <div class="field-hint" style="margin-bottom:16px;">Preview: <b>${esc(BIZ?.invoicePrefix || 'AZ')}-${String(SETTINGS?.invoiceNextNumber || 1).padStart(4, '0')}</b></div>
        <button type="submit" class="btn btn--primary">Save</button>
      </form>
    `;
    document.getElementById('invNumForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      BIZ = BIZ || {};
      BIZ.invoicePrefix = document.getElementById('f_prefix').value.trim() || 'AZ';
      await DB.setMeta('businessDetails', BIZ);
      SETTINGS.invoiceNextNumber = Number(document.getElementById('f_next').value) || 1;
      await DB.setMeta('appSettings', SETTINGS);
      toast('Saved');
      history.back();
    });
  }

  // ---------------------------------------------------------
  // SCREEN: BACKUP & RESTORE
  // ---------------------------------------------------------
  async function screenBackupRestore() {
    setTitle('Backup & Restore');
    const works = await DB.works.all();
    viewEl.innerHTML = `
      <div class="info-card">
        <div class="info-row"><span class="k">Works stored</span><span class="v">${works.length}</span></div>
      </div>
      <div class="section-title">Export</div>
      <div class="small-note" style="margin-bottom:12px;">Creates a single backup file with all works, logs, materials, expenses, invoices, business details and attachments. Move this file to another device to restore your data — no account or internet required.</div>
      <button class="btn btn--primary" id="exportBtn">Export Backup File</button>

      <div class="section-title">Import</div>
      <div class="small-note" style="margin-bottom:12px;">Restoring will merge the backup into this device's data. Existing records with the same ID will be overwritten.</div>
      <input type="file" id="importFile" accept="application/json,.json">
      <button class="btn btn--outline" id="importBtn" style="margin-top:10px;">Restore from Backup</button>
    `;
    document.getElementById('exportBtn').addEventListener('click', async () => {
      showProgress('Preparing backup…');
      try {
        const data = await DB.exportAll();
        const json = JSON.stringify(data);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url; a.download = `AZEE_HARDWARE_Backup_${stamp}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('Backup file saved');
      } catch (err) {
        toast('Backup failed: ' + err.message);
      }
      hideProgress();
    });
    document.getElementById('importBtn').addEventListener('click', async () => {
      const file = document.getElementById('importFile').files[0];
      if (!file) { toast('Choose a backup file first'); return; }
      const ok = await confirmDialog({ title: 'Restore backup?', body: 'This will import all data from the backup file into this app.', okText: 'Restore', danger: false });
      if (!ok) return;
      showProgress('Restoring…');
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importAll(data);
        await loadMeta();
        toast('Backup restored');
        go('home');
      } catch (err) {
        toast('Restore failed: ' + err.message);
      }
      hideProgress();
    });
  }

  // ---------------------------------------------------------
  // SCREEN: ABOUT
  // ---------------------------------------------------------
  async function screenAbout() {
    setTitle('About App');
    viewEl.innerHTML = `
      <div class="empty-state" style="padding-top:30px;">
        <div style="font-size:24px;font-weight:800;letter-spacing:2px;">AZEE HARDWARE</div>
        <div class="empty-state-sub">Version 1.0.0</div>
        <div style="margin-top:18px;font-size:12px;color:var(--text-faint);letter-spacing:1px;">CREDITS: BLACKMARK</div>
      </div>
      <div class="info-card" style="margin-top:20px;">
        <div class="info-row"><span class="k">Offline mode</span><span class="v">Always on</span></div>
        <div class="info-row"><span class="k">Cloud sync</span><span class="v">None</span></div>
        <div class="info-row"><span class="k">Data storage</span><span class="v">On this device only</span></div>
      </div>
    `;
  }

  // ---------------------------------------------------------
  // ROUTES TABLE
  // ---------------------------------------------------------
  const SCREENS = {
    'home': screenHome,
    'works': screenWorks,
    'add-work': screenAddEditWork,
    'work-details': screenWorkDetails,
    'logs': screenLogs,
    'add-log': screenAddEditLog,
    'materials': screenMaterials,
    'add-material': screenAddEditMaterial,
    'expenses': screenExpenses,
    'add-expense': screenAddEditExpense,
    'attachments': screenAttachments,
    'attachment-preview': screenAttachmentPreview,
    'invoice': screenInvoice,
    'invoice-preview': screenInvoicePreview,
    'reports': screenReports,
    'search': screenSearch,
    'settings': screenSettings,
    'business-details': screenBusinessDetails,
    'appearance': screenAppearance,
    'invoice-number-settings': screenInvoiceNumberSettings,
    'backup-restore': screenBackupRestore,
    'about': screenAbout
  };

  // ---------------------------------------------------------
  // BOOT
  // ---------------------------------------------------------
  async function getSettings() {
    if (SETTINGS) return SETTINGS;
    SETTINGS = await DB.getMeta('appSettings', { theme: 'system', invoiceNextNumber: 1 });
    return SETTINGS;
  }
  async function loadMeta() {
    BIZ = await DB.getMeta('businessDetails', {});
    SETTINGS = await DB.getMeta('appSettings', { theme: 'system', invoiceNextNumber: 1 });
    applyTheme(SETTINGS.theme || 'system');
  }

  async function boot() {
    await DB.init();
    await loadMeta();
    if (!location.hash) location.hash = '#/home';
    await render();

    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
    }, 900);
  }

  // Bump invoice number whenever an invoice is finalized (first-time only)
  const origPut = DB.invoices.put.bind(DB.invoices);
  DB.invoices.put = async function (inv) {
    const existing = inv.id ? await DB.invoices.get(inv.id) : null;
    const result = await origPut(inv);
    if (inv.finalized && (!existing || !existing.finalized)) {
      await bumpInvoiceNumber();
    }
    return result;
  };

  document.addEventListener('DOMContentLoaded', boot);
})();

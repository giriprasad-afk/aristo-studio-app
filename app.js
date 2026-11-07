/* Aristo India · Studio Operations — connected to Supabase */
(function () {
  'use strict';

  const sb = window.supabase.createClient(window.APP_CONFIG.SUPABASE_URL, window.APP_CONFIG.SUPABASE_KEY);
  const $app = document.getElementById('app');
  // Works both from http://localhost:3000 and when index.html is opened directly
  const SITE = location.protocol === 'file:' ? 'http://localhost:3000' : location.origin + location.pathname.replace(/index\.html$/, '');

  // ---------- constants ----------
  const ROLE_LABEL = { admin: 'Admin', team_lead: 'Team Lead', sr_designer: 'Sr Designer', jr_designer: 'Jr Designer', convertor: 'Convertor' };
  const ROLE_PAGES = {
    admin: ['dashboard', 'add', 'approvals', 'convupload', 'users'],
    team_lead: ['dashboard', 'add', 'approvals', 'convupload'],
    sr_designer: ['dashboard', 'upload'],
    jr_designer: ['dashboard', 'upload'],
    convertor: ['dashboard', 'approvals', 'convupload']
  };
  const PAGE_LABEL = { dashboard: 'Dashboard', add: 'Project addition', approvals: 'Drawings for approval', convupload: 'Upload conversion file', upload: 'Upload drawings', users: 'Users' };
  const TYPES = { design: ['W-CSD', 'K-CSD', 'LF-CSD'], conversion: ['W-CSD', 'K-CSD', 'LF-CSD', 'DH-W', 'DH-K'] };
  const DESIGN_ROLES = ['sr_designer', 'jr_designer'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const GOLD = 'var(--gold)', MUTED = 'var(--muted)', DANGER = 'var(--danger)';

  // ---------- state ----------
  const S = { session: null, profile: null, page: null, view: {} };

  // ---------- helpers ----------
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel) => $app.querySelector(sel);
  const $$ = (sel) => Array.from($app.querySelectorAll(sel));
  const fmt1 = (n) => String(Math.round(n * 10) / 10);
  const pad = (n) => String(n).padStart(2, '0');
  const parseISO = (s) => { const p = String(s).slice(0, 10).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const fmtDate = (d) => { if (!d) return '—'; if (!(d instanceof Date)) d = parseISO(d); return pad(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  const fmtDT = (s) => { const d = new Date(s); return fmtDate(d) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const todayISO = () => { const t = today(); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); };
  const initials = (n) => { const w = String(n || '?').split(' ').filter(Boolean); return w.length > 1 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (w[0] || '?').slice(0, 2).toUpperCase(); };
  const cap = (role) => role === 'jr_designer' ? 4 : (role === 'sr_designer' || role === 'convertor') ? 6 : 0;
  const daysAgo = (s) => { const d = Math.round((today() - parseISO(s)) / 86400000); return d <= 0 ? 'Today' : d === 1 ? '1 day ago' : d + ' days ago'; };
  const workDaysUntil = (end) => { let n = 0; const d = today(); while (d <= end) { if (d.getDay() !== 0) n++; d.setDate(d.getDate() + 1); } return n; };
  const addWorkDays = (n) => { const d = today(); let left = Math.max(1, n); for (;;) { if (d.getDay() !== 0) { left--; if (left === 0) return d; } d.setDate(d.getDate() + 1); } };
  const safeName = (n) => n.replace(/[^A-Za-z0-9._-]+/g, '_');
  const fmtSize = (b) => b >= 1048576 ? (Math.round(b / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const statusColor = (pct) => pct > 100 ? DANGER : pct >= 70 ? GOLD : MUTED;
  const statusText = (pct) => pct > 100 ? 'Over capacity' : pct >= 70 ? 'Balanced' : 'Available';

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
  }
  function fail(e) { console.error(e); toast('Something went wrong: ' + (e && e.message ? e.message : e)); }

  // ---------- data ----------
  async function loadCore() {
    const [p, pr, a] = await Promise.all([
      sb.from('profiles').select('id, full_name, emp_id, email, role, status, dh_only, created_at').order('full_name'),
      sb.from('projects').select('*').order('received_date', { ascending: true }),
      sb.from('project_assignments').select('project_id, user_id')
    ]);
    for (const r of [p, pr, a]) if (r.error) throw r.error;
    return { profiles: p.data, projects: pr.data, assigns: a.data };
  }

  // modules in hand per person, split equally across co-assignees, open projects only
  function computeLoads(core) {
    const byProject = {};
    core.assigns.forEach((a) => { (byProject[a.project_id] = byProject[a.project_id] || []).push(a.user_id); });
    const load = {};
    core.profiles.forEach((u) => { load[u.id] = { inHand: 0, chips: [] }; });
    core.projects.filter((p) => p.status === 'open').forEach((p) => {
      const who = byProject[p.id] || [];
      const share = who.length ? Number(p.modules) / who.length : 0;
      who.forEach((uid) => { if (load[uid]) { load[uid].inHand += share; load[uid].chips.push(p.client_name + ' · ' + p.type + ' · ' + fmt1(share)); } });
    });
    return { load, byProject };
  }

  // ---------- routing ----------
  function go(page) { location.hash = '#/' + page; }
  window.addEventListener('hashchange', render);

  async function boot() {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    sb.auth.onAuthStateChange((_ev, session) => {
      const changed = (session && session.user && session.user.id) !== (S.session && S.session.user && S.session.user.id);
      S.session = session;
      if (changed) { S.profile = null; render(); }
    });
    render();
  }

  async function render() {
    const hash = (location.hash || '').replace(/^#\/?/, '');
    if (!S.session) { return hash === 'signup' ? renderSignup() : renderLogin(); }
    if (!S.profile) {
      const { data, error } = await sb.from('profiles').select('*').eq('id', S.session.user.id).maybeSingle();
      if (error) { return renderMessage('Could not load your account', error.message, true); }
      S.profile = data;
    }
    if (!S.profile) return renderMessage('Account not found', 'Your sign-in worked, but there is no staff profile for this account. Ask the admin to check it.', true);
    if (S.profile.status === 'pending') return renderMessage('Waiting for approval', 'Thanks, ' + S.profile.full_name + '. The admin needs to approve your account before you can use the app. Try again later.', true);
    if (S.profile.status === 'inactive') return renderMessage('Account switched off', 'This account has been deactivated. Contact the admin if this is a mistake.', true);
    const pages = ROLE_PAGES[S.profile.role] || ['dashboard'];
    const page = pages.indexOf(hash) >= 0 ? hash : pages[0];
    if (page !== hash) { history.replaceState(null, '', '#/' + page); }
    S.page = page;
    shell(pages, page);
    const main = $('#main');
    main.innerHTML = '<p class="small">Loading…</p>';
    try {
      await ({ dashboard: pageDashboard, add: pageAdd, approvals: pageApprovals, convupload: pageConvUpload, upload: pageUpload, users: pageUsers })[page](main);
    } catch (e) { main.innerHTML = '<p class="err">Could not load this page: ' + esc(e.message || e) + '</p>'; console.error(e); }
  }

  function shell(pages, page) {
    const p = S.profile;
    $app.innerHTML = `
      <header class="nav">
        <div class="left"><div class="wordmark">ARISTO INDIA</div><div class="sep"></div><span class="small" style="color:var(--gold)">${esc(ROLE_LABEL[p.role])}</span></div>
        <nav aria-label="Main">${pages.map((k) => `<a href="#/${k}" class="${k === page ? 'on' : ''}" ${k === page ? 'aria-current="page"' : ''}>${PAGE_LABEL[k]}</a>`).join('')}</nav>
        <div class="user"><span class="avatar">${esc(initials(p.full_name))}</span>
          <span style="display:flex;flex-direction:column"><span style="font-size:14.5px;font-weight:500">${esc(p.full_name)}</span><span class="small">${esc(ROLE_LABEL[p.role])}${p.emp_id ? ' · ' + esc(p.emp_id) : ''}</span></span>
          <button class="linkbtn" id="signout">Sign out</button></div>
      </header>
      <main class="page" id="main"></main>`;
    $('#signout').onclick = async () => { await sb.auth.signOut(); S.profile = null; location.hash = ''; render(); };
  }

  function authFrame(inner) {
    $app.innerHTML = `<div class="auth">
      <section class="brand" aria-label="Aristo India">
        <div class="wordmark">ARISTO INDIA</div>
        <div class="stack" style="gap:20px"><div style="width:48px;height:1px;background:var(--gold)"></div>
          <p class="eyebrow">Studio Operations</p>
          <h2>Beyond Furniture. We Create Spaces That Work for You.</h2>
          <p class="lead" style="font-size:18px">Modular Kitchens · Sliding Wardrobes · Openable Wardrobes</p></div>
        <p class="small" style="letter-spacing:.8px">A KBros × Aristo joint venture</p>
      </section>
      <section class="formside">${inner}</section></div>`;
  }

  function renderMessage(title, text, withSignout) {
    authFrame(`<div class="msg"><h1 class="h1" style="font-size:32px;line-height:40px">${esc(title)}</h1><p class="lead">${esc(text)}</p>
      ${withSignout ? '<button class="btn" id="msgout">Sign out</button>' : ''}</div>`);
    if (withSignout) $('#msgout').onclick = async () => { await sb.auth.signOut(); S.profile = null; location.hash = ''; render(); };
  }

  // ---------- login ----------
  function renderLogin() {
    authFrame(`<form id="f" novalidate>
      <div class="stack" style="gap:8px"><p class="caps" style="color:var(--gold);font-weight:700;letter-spacing:1.5px">Welcome back</p>
        <h1 class="h1" style="font-size:32px;line-height:40px">Sign in to your account</h1>
        <p class="lead">Enter your email and password to continue.</p></div>
      <div class="field"><label class="caps" for="em">Email</label><input id="em" type="email" autocomplete="email" placeholder="you@aristo-india.com" required></div>
      <div class="field"><div style="display:flex;justify-content:space-between;gap:12px"><label class="caps" for="pw">Password</label><a href="#" id="forgot" class="small" style="color:var(--gold)">Forgot password?</a></div>
        <input id="pw" type="password" autocomplete="current-password" placeholder="Enter your password" required></div>
      <p class="err" id="err" hidden></p><p class="ok" id="ok" hidden></p>
      <button class="btn" type="submit">Sign in</button>
      <div class="rule"></div>
      <p class="lead" style="font-size:14.5px">New to Aristo India? <a href="#/signup">Sign up</a></p>
    </form>`);
    const showErr = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; $('#ok').hidden = true; };
    $('#f').onsubmit = async (ev) => {
      ev.preventDefault();
      const email = $('#em').value.trim(), password = $('#pw').value;
      if (!email || !password) return showErr('Enter your email and password.');
      const btn = ev.submitter || $('button[type=submit]'); btn.disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      btn.disabled = false;
      if (error) return showErr(error.message === 'Email not confirmed' ? 'Please confirm your email first: open the link Supabase emailed you.' : error.message);
      location.hash = '#/dashboard';
    };
    $('#forgot').onclick = async (ev) => {
      ev.preventDefault();
      const email = $('#em').value.trim();
      if (!email) return showErr('Type your email above first, then click Forgot password.');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE });
      if (error) return showErr(error.message);
      showErr(''); const ok = $('#ok'); ok.textContent = 'If that email has an account, a reset link is on its way.'; ok.hidden = false;
    };
  }

  // ---------- sign up ----------
  function renderSignup() {
    authFrame(`<form id="f" novalidate>
      <div class="stack" style="gap:8px"><p class="caps" style="color:var(--gold);font-weight:700;letter-spacing:1.5px">New account</p>
        <h1 class="h1" style="font-size:32px;line-height:40px">Create your account</h1></div>
      <div class="row"><div class="field" style="flex:2 1 220px"><label class="caps" for="nm">Full name</label><input id="nm" autocomplete="name" placeholder="As in HR records"></div>
        <div class="field" style="flex:1 1 140px"><label class="caps" for="eid">Employee ID</label><input id="eid" placeholder="e.g. EMP0900"></div></div>
      <div class="field"><label class="caps" for="em">Work email</label><input id="em" type="email" autocomplete="email" placeholder="you@aristo-india.com"></div>
      <div class="field"><label class="caps" for="rl">Role</label><select id="rl"><option value="">Select your role</option>
        <option value="sr_designer">Sr Designer</option><option value="jr_designer">Jr Designer</option><option value="convertor">Convertor</option><option value="team_lead">Team Lead</option></select></div>
      <div class="row"><div class="field" style="flex:1 1 180px"><label class="caps" for="pw">Password</label><input id="pw" type="password" autocomplete="new-password" placeholder="At least 8 characters"></div>
        <div class="field" style="flex:1 1 180px"><label class="caps" for="pw2">Confirm password</label><input id="pw2" type="password" autocomplete="new-password" placeholder="Re-enter password"></div></div>
      <p class="err" id="err" hidden></p>
      <button class="btn" type="submit">Create account</button>
      <div class="rule"></div>
      <p class="lead" style="font-size:14.5px">Already have an account? <a href="#/login">Sign in</a></p>
    </form>`);
    const showErr = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; };
    $('#f').onsubmit = async (ev) => {
      ev.preventDefault();
      const v = (id) => $('#' + id).value.trim();
      if (!v('nm')) return showErr('Enter your full name.');
      if (!v('eid')) return showErr('Enter your employee ID.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('em'))) return showErr('Enter a valid work email.');
      if (!v('rl')) return showErr('Select your role.');
      if ($('#pw').value.length < 8) return showErr('Password must be at least 8 characters.');
      if ($('#pw').value !== $('#pw2').value) return showErr('Passwords do not match.');
      const btn = $('button[type=submit]'); btn.disabled = true;
      const { data, error } = await sb.auth.signUp({
        email: v('em'), password: $('#pw').value,
        options: { emailRedirectTo: SITE, data: { full_name: v('nm'), emp_id: v('eid').toUpperCase(), role: v('rl') } }
      });
      btn.disabled = false;
      if (error) return showErr(error.message);
      if (data.session) { location.hash = '#/dashboard'; return; }
      authFrame(`<div class="msg"><h1 class="h1" style="font-size:32px;line-height:40px">Check your email</h1>
        <p class="lead">We sent a confirmation link to <strong>${esc(v('em') || '')}</strong>. Open it, then sign in. The admin approves new accounts before you can use the app.</p>
        <a class="btn" href="#/login">Back to sign in</a></div>`);
    };
  }

  // ---------- dashboard ----------
  async function pageDashboard(main) {
    const role = S.profile.role;
    const tabs = DESIGN_ROLES.includes(role) ? ['design'] : role === 'convertor' ? ['conversion'] : ['design', 'conversion'];
    if (!S.view.tab || tabs.indexOf(S.view.tab) < 0) S.view.tab = tabs[0];
    const core = await loadCore();
    const { load, byProject } = computeLoads(core);
    const names = {}; core.profiles.forEach((u) => { names[u.id] = u.full_name; });

    const draw = () => {
      const tab = S.view.tab;
      const roles = tab === 'design' ? DESIGN_ROLES : ['convertor'];
      const members = core.profiles.filter((u) => u.status === 'active' && roles.includes(u.role)).map((u) => {
        const weekCap = cap(u.role) * 6, inHand = load[u.id].inHand;
        const pct = weekCap ? Math.round(inHand / weekCap * 100) : 0;
        return { u, weekCap, inHand, pct, chips: load[u.id].chips };
      });
      const projects = core.projects.filter((p) => p.team === tab && p.status === 'open');
      const totalCap = members.reduce((a, m) => a + m.weekCap, 0);
      const totalIn = members.reduce((a, m) => a + m.inHand, 0);
      const avg = totalCap ? Math.round(totalIn / totalCap * 100) : 0;
      const unassigned = projects.filter((p) => !(byProject[p.id] || []).length);
      const unMods = unassigned.reduce((a, p) => a + Number(p.modules), 0);
      const over = members.filter((m) => m.pct > 100).length;

      main.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:flex-end">
          <div class="stack" style="gap:8px"><p class="eyebrow">Team bandwidth</p><h1 class="h1">Who is working on what</h1></div>
          <p class="lead" style="max-width:560px;font-size:14.5px">Daily capacity: Sr Designer 6 · Jr Designer 4 · Convertor 6 modules. Load = modules in hand against a 6-day week.</p>
        </div>
        <div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" data-tab="${t}" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}">${t === 'design' ? 'Design' : 'Conversion'}</button>`).join('')}</div>
        <section class="kpis">
          <div class="kpi"><span class="caps">Orders in hand</span><span class="v">${projects.length}</span><span class="lead" style="font-size:14.5px">${fmt1(projects.reduce((a, p) => a + Number(p.modules), 0))} modules in total</span></div>
          <div class="kpi"><span class="caps">Team load</span><span class="v" style="color:${avg > 100 ? DANGER : GOLD}">${avg}%</span><span class="lead" style="font-size:14.5px">${fmt1(totalIn)} of ${totalCap} modules weekly capacity</span></div>
          <div class="kpi"><span class="caps">Unassigned</span><span class="v" style="color:${unMods ? DANGER : 'var(--cream)'}">${fmt1(unMods)}</span><span class="lead" style="font-size:14.5px">modules across ${unassigned.length} order${unassigned.length === 1 ? '' : 's'}</span></div>
          <div class="kpi"><span class="caps">Over capacity</span><span class="v" style="color:${over ? DANGER : 'var(--cream)'}">${over}</span><span class="lead" style="font-size:14.5px">of ${members.length} people</span></div>
        </section>
        <section class="stack" style="gap:16px">
          <div class="row" style="justify-content:space-between;align-items:baseline"><h2 class="h2">${tab === 'design' ? 'Design team' : 'Conversion team'}</h2>
            <div class="row small" style="gap:20px"><span><span class="dot" style="background:var(--muted)"></span>Available &lt; 70%</span><span><span class="dot" style="background:var(--gold)"></span>Balanced 70–100%</span><span><span class="dot" style="background:var(--danger)"></span>Over capacity</span></div></div>
          ${members.length ? `<div class="tablewrap"><table><thead><tr><th>Person</th><th style="width:240px">Load this week</th><th>Modules in hand</th><th>Working on</th><th>Status</th></tr></thead><tbody>
          ${members.map((m) => `<tr>
            <td><div style="display:flex;align-items:center;gap:12px"><span class="avatar">${esc(initials(m.u.full_name))}</span><span>${esc(m.u.full_name)}<span class="sub">${esc(ROLE_LABEL[m.u.role])}${m.u.emp_id ? ' · ' + esc(m.u.emp_id) : ''}${m.u.dh_only ? ' · DH only' : ''}</span></span></div></td>
            <td><div style="display:flex;align-items:center;gap:12px"><div class="bar"><span style="width:${Math.min(100, m.pct)}%;background:${statusColor(m.pct)}"></span></div><strong style="width:48px;text-align:right;color:${statusColor(m.pct)}">${m.pct}%</strong></div></td>
            <td>${fmt1(m.inHand)} / ${m.weekCap}<span class="sub">${fmt1(m.inHand / cap(m.u.role))} days of work · ${cap(m.u.role)}/day</span></td>
            <td>${m.chips.length ? m.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('') : '<span class="small">No orders</span>'}</td>
            <td><span style="color:${statusColor(m.pct)};font-size:12px;font-weight:600;letter-spacing:.8px;text-transform:uppercase"><span class="dot" style="background:${statusColor(m.pct)}"></span>${statusText(m.pct)}</span></td></tr>`).join('')}
          </tbody></table></div>` : `<p class="empty">No active ${tab === 'design' ? 'designers' : 'convertors'} yet. They appear here once they sign up and the admin approves them.</p>`}
        </section>
        <section class="stack" style="gap:16px"><h2 class="h2">Orders with the ${tab} team</h2>
          ${projects.length ? `<div class="tablewrap"><table><thead><tr><th>Client</th><th>Type</th><th>${tab === 'design' ? 'Designers' : 'Convertors'}</th><th>Modules</th><th>Received</th><th>Deadline</th></tr></thead><tbody>
          ${projects.map((p) => { const who = (byProject[p.id] || []).map((id) => names[id] || '—'); return `<tr>
            <td>${esc(p.client_name)}<span class="sub">${[p.order_no && 'Order ' + p.order_no, p.task_id && 'Task ' + p.task_id, p.opr_number && 'OPR ' + p.opr_number].filter(Boolean).map(esc).join(' · ')}</span></td>
            <td><span class="tag">${esc(p.type)}</span></td>
            <td style="color:${who.length ? 'var(--body)' : DANGER}">${who.length ? esc(who.join(', ')) : 'Unassigned'}</td>
            <td><strong>${fmt1(Number(p.modules))}</strong></td>
            <td>${fmtDate(p.received_date)}<span class="sub">${daysAgo(p.received_date)}</span></td>
            <td style="color:${p.deadline && parseISO(p.deadline) < today() ? DANGER : 'inherit'}">${fmtDate(p.deadline)}</td></tr>`; }).join('')}
          </tbody></table></div>` : '<p class="empty">No open orders.</p>'}
        </section>`;
      $$('[data-tab]').forEach((b) => { b.onclick = () => { S.view.tab = b.dataset.tab; draw(); }; });
    };
    draw();
  }

  // ---------- project addition ----------
  async function pageAdd(main) {
    main.classList.add('narrow');
    const st = { step: 1, team: null, d: {}, picked: null, core: null, recs: [] };
    const stepsHTML = () => `<ol class="steps">${['Choose team', 'Project details', 'Assign', 'Done'].map((l, i) => { const n = i + 1; return `<li class="${n === st.step ? 'on' : n < st.step ? 'past' : ''}"><span>${n < st.step ? '✓' : n}</span>${l}</li>`; }).join('')}</ol>`;
    const head = `<div class="stack" style="gap:8px"><p class="eyebrow">New project</p><h1 class="h1">Add project</h1></div>`;

    const draw = () => {
      if (st.step === 1) {
        main.innerHTML = head + stepsHTML() + `<section class="stack" style="gap:16px"><p class="lead" style="font-size:18px">Who is this project for?</p><div class="cards">
          <button class="card" data-team="design"><span class="t">For Design</span><span class="lead" style="font-size:14.5px">Sr Designer 6 and Jr Designer 4 modules per day; Jr Designers take wardrobe (W-CSD) projects only.</span><span class="caps" style="color:var(--gold)">Continue ›</span></button>
          <button class="card" data-team="conversion"><span class="t">For Conversion</span><span class="lead" style="font-size:14.5px">6 modules per day per convertor; DH orders go to DH-only convertors.</span><span class="caps" style="color:var(--gold)">Continue ›</span></button></div></section>`;
        $$('[data-team]').forEach((b) => { b.onclick = () => { st.team = b.dataset.team; st.d = {}; st.step = 2; draw(); }; });
      } else if (st.step === 2) {
        const d = st.d;
        main.innerHTML = head + stepsHTML() + `<form class="panel stack" id="f" novalidate>
          <div class="row" style="justify-content:space-between;align-items:center"><h2 class="h2">Project details</h2><span><span class="tag">${st.team === 'design' ? 'Design' : 'Conversion'}</span> <button type="button" class="linkbtn" id="chg">Change</button></span></div>
          <div class="row">
            <div class="field"><label class="caps" for="task">Task ID</label><input id="task" value="${esc(d.task || '')}" placeholder="Enter task ID"></div>
            <div class="field"><label class="caps" for="opr">OPR number</label><input id="opr" value="${esc(d.opr || '')}" placeholder="Enter OPR number"></div>
            <div class="field" style="flex:1 1 100%"><label class="caps" for="client">Client name</label><input id="client" value="${esc(d.client || '')}" placeholder="Enter client name"></div>
            <div class="field"><label class="caps" for="type">Type</label><select id="type"><option value="">Select type</option>${TYPES[st.team].map((t) => `<option ${d.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label class="caps" for="mods">No. of modules</label><input id="mods" type="number" min="1" step="1" value="${esc(d.modules || '')}" placeholder="0"></div>
            <div class="field"><label class="caps" for="dl">Project deadline</label><input id="dl" type="date" min="${todayISO()}" value="${esc(d.deadline || '')}"></div>
          </div>
          <p class="err" id="err" hidden></p>
          <div class="row" style="justify-content:flex-end;padding-top:16px;border-top:1px solid var(--line2)"><button type="button" class="btn ghost" id="back">Back</button><button class="btn" type="submit">Add project</button></div></form>`;
        $('#chg').onclick = $('#back').onclick = () => { st.step = 1; draw(); };
        $('#f').onsubmit = async (ev) => {
          ev.preventDefault();
          const v = (id) => $('#' + id).value.trim();
          Object.assign(st.d, { task: v('task'), opr: v('opr'), client: v('client'), type: v('type'), modules: v('mods'), deadline: v('dl') });
          const err = (m) => { const e = $('#err'); e.textContent = m; e.hidden = false; };
          if (!st.d.task) return err('Enter the task ID.');
          if (!st.d.opr) return err('Enter the OPR number.');
          if (!st.d.client) return err('Enter the client name.');
          if (!st.d.type) return err('Select the type.');
          if (!(Number(st.d.modules) > 0)) return err('Enter the number of modules.');
          if (!st.d.deadline) return err('Choose the project deadline.');
          if (parseISO(st.d.deadline) < today()) return err('The deadline cannot be in the past.');
          try { st.core = await loadCore(); } catch (e) { return err(e.message); }
          st.picked = null; st.step = 3; draw();
        };
      } else if (st.step === 3) {
        const d = st.d, mods = Number(d.modules), deadline = parseISO(d.deadline), wd = workDaysUntil(deadline);
        const { load } = computeLoads(st.core);
        const isDH = d.type.indexOf('DH') === 0, isWD = d.type.indexOf('W') === 0;
        const roles = st.team === 'design' ? DESIGN_ROLES : ['convertor'];
        const pool = st.core.profiles.filter((u) => u.status === 'active' && roles.includes(u.role))
          .filter((u) => st.team === 'design' ? (isWD || u.role !== 'jr_designer') : (isDH ? u.dh_only : !u.dh_only));
        const scored = pool.map((u) => {
          const daily = cap(u.role), inHand = load[u.id].inHand, finishDays = Math.ceil((inHand + mods) / daily);
          return { u, daily, inHand, finishDays, meets: finishDays <= wd, free: Math.max(0, wd * daily - inHand), pct: Math.round(inHand / (daily * 6) * 100), slack: wd - finishDays };
        }).sort((a, b) => (b.meets - a.meets) || (a.finishDays - b.finishDays) || ((a.daily === 4) - (b.daily === 4)) || (a.pct - b.pct));
        st.recs = scored.slice(0, 2);
        const noneMeet = st.recs.length && !st.recs[0].meets;
        main.innerHTML = head + stepsHTML() + `<section class="stack">
          <div class="stack" style="gap:8px"><h2 class="h1" style="font-size:28px;line-height:36px">Choose a ${st.team === 'design' ? 'designer' : 'convertor'} for this project</h2>
          <p class="lead">${esc(d.client)} · ${esc(d.type)} · ${mods} modules · deadline ${fmtDate(deadline)} · ${wd} working day${wd === 1 ? '' : 's'} left</p></div>
          ${!st.recs.length ? `<p class="err" style="padding:16px;border:1px solid var(--danger)">Nobody active can take a ${esc(d.type)} project right now${isDH ? ' (DH orders need a convertor marked "DH only" on the Users page)' : ''}. You can still save it as unassigned.</p>` : ''}
          ${noneMeet ? '<p class="err" style="padding:16px;border:1px solid var(--danger)">No one can finish this by the deadline with their current load. These would finish soonest; consider moving the deadline.</p>' : ''}
          <div class="cards" role="radiogroup">${st.recs.map((r, i) => { const on = st.picked === r.u.id; const col = r.meets ? GOLD : DANGER; return `
            <button class="card ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-pick="${r.u.id}">
              <span style="display:flex;align-items:center;gap:14px;width:100%"><span class="avatar" style="width:44px;height:44px">${esc(initials(r.u.full_name))}</span>
                <span style="flex:1"><span style="display:block;font-size:18px;font-weight:600">${esc(r.u.full_name)}</span><span class="small">${esc(ROLE_LABEL[r.u.role])}${r.u.emp_id ? ' · ' + esc(r.u.emp_id) : ''} · ${r.daily} modules/day</span></span>
                <span style="width:22px;height:22px;border-radius:9999px;border:1px solid var(--gold);background:${on ? 'var(--gold)' : 'transparent'}"></span></span>
              <span>${i === 0 ? '<span class="tag" style="background:var(--gold);color:#000">Best fit</span> ' : ''}<span class="tag" style="color:${col};background:none;border:1px solid ${col}">${r.meets ? 'Meets deadline' : 'Misses deadline'}</span></span>
              <span style="width:100%"><span class="row small" style="justify-content:space-between"><span>Current load</span><strong style="color:${statusColor(r.pct)}">${r.pct}%</strong></span><span class="bar" style="display:block;margin-top:6px"><span style="width:${Math.min(100, r.pct)}%;background:${statusColor(r.pct)}"></span></span></span>
              <span style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;width:100%;padding-top:12px;border-top:1px solid var(--line2)">
                <span><span class="caps" style="display:block;color:var(--muted)">In hand</span><strong>${fmt1(r.inHand)} mod</strong></span>
                <span><span class="caps" style="display:block;color:var(--muted)">Free by deadline</span><strong>${fmt1(r.free)} mod</strong></span>
                <span><span class="caps" style="display:block;color:var(--muted)">Est. finish</span><strong style="color:${col}">${fmtDate(addWorkDays(r.finishDays))}</strong></span></span>
              <span class="lead" style="font-size:14.5px">${r.meets ? (r.slack === 0 ? 'Can finish on the deadline day.' : 'Can finish ' + r.slack + ' working day' + (r.slack === 1 ? '' : 's') + ' before the deadline.') : 'Would miss the deadline by ' + (-r.slack) + ' working day' + (r.slack === -1 ? '' : 's') + '.'}</span>
            </button>`; }).join('')}</div>
          <p class="small">Ranked by who can finish before the deadline, then the earliest finish, then level (Sr before Jr). Working days are Monday to Saturday.</p>
          <p class="err" id="err" hidden></p>
          <div class="row" style="justify-content:flex-end;padding-top:16px;border-top:1px solid var(--line2)">
            <button class="btn ghost" id="edit">Edit details</button>
            ${!st.recs.length ? '<button class="btn" id="saveun">Save as unassigned</button>' : `<button class="btn" id="confirm" ${st.picked ? '' : 'disabled'}>${st.picked ? 'Assign to ' + esc(st.recs.find((r) => r.u.id === st.picked).u.full_name) : 'Select one to assign'}</button>`}
          </div></section>`;
        $$('[data-pick]').forEach((b) => { b.onclick = () => { st.picked = b.dataset.pick; draw(); }; });
        $('#edit').onclick = () => { st.step = 2; draw(); };
        const save = async (uid) => {
          const btn = $('#confirm') || $('#saveun'); btn.disabled = true;
          const { data, error } = await sb.from('projects').insert({
            team: st.team, task_id: d.task, opr_number: d.opr, client_name: d.client, type: d.type, modules: mods, deadline: d.deadline, created_by: S.profile.id
          }).select('id').single();
          if (error) { btn.disabled = false; const e = $('#err'); e.textContent = error.message; e.hidden = false; return; }
          if (uid) {
            const r2 = await sb.from('project_assignments').insert({ project_id: data.id, user_id: uid });
            if (r2.error) { const e = $('#err'); e.textContent = 'Project saved, but assigning failed: ' + r2.error.message; e.hidden = false; return; }
          }
          st.assignedTo = uid ? st.recs.find((r) => r.u.id === uid) : null;
          st.step = 4; draw();
        };
        if ($('#confirm')) $('#confirm').onclick = () => st.picked && save(st.picked);
        if ($('#saveun')) $('#saveun').onclick = () => save(null);
      } else {
        const d = st.d, a = st.assignedTo;
        const rows = [['Team', st.team === 'design' ? 'Design' : 'Conversion'], ['Task ID', d.task], ['OPR number', d.opr], ['Client name', d.client], ['Type', d.type], ['No. of modules', d.modules], ['Project deadline', fmtDate(d.deadline)], ['Assigned to', a ? a.u.full_name + ' (' + ROLE_LABEL[a.u.role] + ')' : 'Unassigned'], ['Est. finish', a ? fmtDate(addWorkDays(a.finishDays)) : '—']];
        main.innerHTML = head + stepsHTML() + `<section class="panel stack" role="status"><h2 class="h1" style="font-size:28px;line-height:36px">Project saved</h2>
          <dl style="margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;padding:20px 0;border-top:1px solid var(--line2);border-bottom:1px solid var(--line2)">
          ${rows.map(([k, v]) => `<div><dt class="caps" style="color:var(--muted)">${k}</dt><dd style="margin:4px 0 0;font-weight:500">${esc(v)}</dd></div>`).join('')}</dl>
          <div class="row"><button class="btn ghost" id="again">Add another</button><a class="btn" href="#/dashboard">Back to dashboard</a></div></section>`;
        $('#again').onclick = () => { st.step = 1; st.d = {}; st.team = null; draw(); };
      }
    };
    draw();
  }

  // ---------- upload drawings (designers) ----------
  async function pageUpload(main) {
    main.classList.add('narrow');
    const me = S.profile.id;
    const a = await sb.from('project_assignments').select('project_id, projects(id, client_name, type, modules, status, team)').eq('user_id', me);
    if (a.error) throw a.error;
    const projects = a.data.map((x) => x.projects).filter((p) => p && p.status === 'open');
    await uploadPage(main, {
      eyebrow: 'Drawings', title: 'Upload drawings', intro: 'Choose the project, add the drawing files and submit.',
      bucket: 'drawings', table: 'drawings', accept: '.pdf,.dwg,.dxf,.jpg,.jpeg,.png', hint: 'PDF, DWG, DXF, JPG or PNG',
      projects, emptyProjects: 'No projects are assigned to you yet. Your team lead assigns them from Project addition.',
      historyTitle: 'My uploads', historyQuery: () => sb.from('drawings').select('id, file_name, status, review_comment, created_at, projects(client_name, type)').eq('uploaded_by', me).order('created_at', { ascending: false }).limit(30),
      showStatus: true
    });
  }

  // ---------- upload conversion files ----------
  async function pageConvUpload(main) {
    main.classList.add('narrow');
    const [pr, dr] = await Promise.all([
      sb.from('projects').select('id, client_name, type, modules, status, team, order_no').eq('status', 'open'),
      sb.from('drawings').select('project_id').eq('status', 'approved')
    ]);
    if (pr.error) throw pr.error; if (dr.error) throw dr.error;
    const approved = new Set(dr.data.map((x) => x.project_id));
    const projects = pr.data.filter((p) => p.team === 'conversion' || approved.has(p.id));
    await uploadPage(main, {
      eyebrow: 'Conversion', title: 'Upload conversion file', intro: 'Choose the order, add the BAZIS export or BOM file and submit.',
      bucket: 'conversion-files', table: 'conversion_files', accept: '.xls,.xlsx,.csv,.pdf,.b3d', hint: 'BAZIS export (XLS), BOM (XLSX / CSV), PDF or B3D',
      projects, emptyProjects: 'No open conversion orders, and no design projects with approved drawings yet.',
      historyTitle: 'Recent uploads', historyQuery: () => sb.from('conversion_files').select('id, file_name, created_at, projects(client_name, type), profiles(full_name)').order('created_at', { ascending: false }).limit(30),
      showStatus: false
    });
  }

  async function uploadPage(main, o) {
    let files = [];
    const label = (p) => (p.order_no ? p.order_no + ' · ' : '') + p.client_name + ' · ' + p.type + ' · ' + fmt1(Number(p.modules)) + ' modules' + (p.team === 'design' && o.table === 'conversion_files' ? ' (design, drawings approved)' : '');
    main.innerHTML = `<div class="stack" style="gap:8px"><p class="eyebrow">${o.eyebrow}</p><h1 class="h1">${o.title}</h1><p class="lead" style="font-size:18px">${o.intro}</p></div>
      ${!o.projects.length ? `<p class="empty">${o.emptyProjects}</p>` : `
      <form class="panel stack" id="f" novalidate>
        <div class="field"><label class="caps" for="prj">Project</label><select id="prj"><option value="">Select a project</option>${o.projects.map((p) => `<option value="${p.id}">${esc(label(p))}</option>`).join('')}</select></div>
        <div class="field"><span class="caps" id="dzl">Files</span><label class="dropzone" id="dz"><input type="file" multiple accept="${o.accept}" aria-labelledby="dzl" id="fi">
          <span style="font-size:28px;color:var(--gold)" aria-hidden="true">⇪</span><span style="font-weight:500">Drag files here or <span style="color:var(--gold);text-decoration:underline">browse</span></span><span class="small">${o.hint}</span></label></div>
        <ul class="filelist" id="fl" hidden></ul>
        <div class="field"><label class="caps" for="notes">Notes (optional)</label><textarea id="notes" rows="3" placeholder="Anything the next team should know"></textarea></div>
        <p class="err" id="err" hidden></p><p class="ok" id="ok" hidden></p>
        <div class="row" style="justify-content:flex-end;padding-top:16px;border-top:1px solid var(--line2)"><button class="btn" type="submit" id="go">${o.title}</button></div>
      </form>`}
      <section class="stack" style="gap:16px"><h2 class="h2">${o.historyTitle}</h2><div id="hist"><p class="small">Loading…</p></div></section>`;

    const loadHistory = async () => {
      const { data, error } = await o.historyQuery();
      const h = $('#hist'); if (!h) return;
      if (error) { h.innerHTML = '<p class="err">' + esc(error.message) + '</p>'; return; }
      if (!data.length) { h.innerHTML = '<p class="empty">Nothing uploaded yet.</p>'; return; }
      h.innerHTML = '<div class="stack" style="gap:8px">' + data.map((x) => {
        const sc = x.status === 'approved' ? GOLD : x.status === 'returned' ? DANGER : MUTED;
        return `<div class="item"><div class="row" style="justify-content:space-between"><span><strong>${esc(x.projects ? x.projects.client_name + ' · ' + x.projects.type : '—')}</strong><span class="sub small" style="display:block">${esc(x.file_name)}${x.profiles ? ' · by ' + esc(x.profiles.full_name) : ''}</span></span>
          <span class="small">${fmtDT(x.created_at)}${o.showStatus ? ` · <span style="color:${sc};font-weight:600;text-transform:uppercase;letter-spacing:.8px">${esc(x.status)}</span>` : ''}</span></div>
          ${x.review_comment ? `<p class="lead" style="font-size:14.5px;margin:0">${esc(x.review_comment)}</p>` : ''}</div>`;
      }).join('') + '</div>';
    };
    loadHistory();
    if (!o.projects.length) return;

    const drawFiles = () => {
      const fl = $('#fl'); fl.hidden = !files.length;
      fl.innerHTML = files.map((f, i) => `<li><span class="tag">${esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4))}</span><span class="n">${esc(f.name)}</span><span class="small">${fmtSize(f.size)}</span><button type="button" class="iconbtn" data-rm="${i}" aria-label="Remove ${esc(f.name)}">×</button></li>`).join('');
      $$('[data-rm]').forEach((b) => { b.onclick = () => { files.splice(Number(b.dataset.rm), 1); drawFiles(); }; });
    };
    const add = (list) => { Array.from(list || []).forEach((f) => { if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f); }); drawFiles(); };
    $('#fi').onchange = (e) => { add(e.target.files); e.target.value = ''; };
    const dz = $('#dz');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
    dz.ondragleave = () => dz.classList.remove('drag');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); add(e.dataTransfer.files); };

    $('#f').onsubmit = async (ev) => {
      ev.preventDefault();
      const err = (m) => { const e = $('#err'); e.textContent = m; e.hidden = !m; };
      $('#ok').hidden = true;
      const pid = Number($('#prj').value);
      if (!pid) return err('Select the project.');
      if (!files.length) return err('Add at least one file.');
      err(''); const btn = $('#go'); btn.disabled = true; btn.textContent = 'Uploading…';
      const notes = $('#notes').value.trim() || null;
      let done = 0;
      for (const f of files) {
        const path = pid + '/' + Date.now() + '_' + safeName(f.name);
        const up = await sb.storage.from(o.bucket).upload(path, f, { upsert: false });
        if (up.error) { err('Upload failed for ' + f.name + ': ' + up.error.message); break; }
        const ins = await sb.from(o.table).insert({ project_id: pid, uploaded_by: S.profile.id, file_path: path, file_name: f.name, notes });
        if (ins.error) { err('Saved the file but not its record: ' + ins.error.message); break; }
        done++;
      }
      btn.disabled = false; btn.textContent = o.title;
      if (done) { const ok = $('#ok'); ok.textContent = done + ' file' + (done === 1 ? '' : 's') + ' uploaded.'; ok.hidden = false; files = files.slice(done); drawFiles(); $('#notes').value = ''; loadHistory(); }
    };
  }

  // ---------- drawings for approval ----------
  async function pageApprovals(main) {
    const filter = S.view.apFilter || 'pending';
    const { data, error } = await sb.from('drawings')
      .select('id, file_name, file_path, notes, status, review_comment, reviewed_at, created_at, project_id, projects(client_name, type, modules), uploader:profiles!drawings_uploaded_by_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const counts = { pending: 0, approved: 0, returned: 0, all: data.length };
    data.forEach((x) => counts[x.status]++);
    const rows = data.filter((x) => filter === 'all' || x.status === filter);
    main.innerHTML = `<div class="stack" style="gap:8px"><p class="eyebrow">Review</p><h1 class="h1">Drawings for approval</h1><p class="lead">Approve drawings to send them for conversion, or return them with a reason.</p></div>
      <div class="tabs" role="tablist">${['pending', 'approved', 'returned', 'all'].map((k) => `<button role="tab" data-f="${k}" aria-selected="${k === filter}" class="${k === filter ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)} <span style="color:var(--muted);margin-left:6px">${counts[k]}</span></button>`).join('')}</div>
      ${!rows.length ? '<p class="empty">Nothing here.</p>' : '<div class="stack" style="gap:12px">' + rows.map((x) => {
        const sc = x.status === 'approved' ? GOLD : x.status === 'returned' ? DANGER : MUTED;
        return `<article class="item">
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div class="stack" style="gap:6px;flex:1 1 360px"><div class="row" style="gap:10px;align-items:center"><h2 style="font-size:18px;font-weight:600">${esc(x.projects ? x.projects.client_name : '—')}</h2>${x.projects ? `<span class="tag">${esc(x.projects.type)}</span><span class="small">${fmt1(Number(x.projects.modules))} modules</span>` : ''}</div>
              <span class="lead" style="font-size:14.5px">${esc(x.file_name)} · by ${esc(x.uploader ? x.uploader.full_name : '—')} · ${fmtDT(x.created_at)}</span>
              ${x.notes ? `<span class="small">Designer note: ${esc(x.notes)}</span>` : ''}</div>
            <div class="row" style="align-items:center;gap:16px"><button class="btn ghost sm" data-view="${esc(x.file_path)}">View file</button><span style="color:${sc};font-size:12px;font-weight:600;letter-spacing:.8px;text-transform:uppercase"><span class="dot" style="background:${sc}"></span>${esc(x.status)}</span></div></div>
          ${x.review_comment ? `<p class="lead" style="font-size:14.5px;margin:0;padding:10px 14px;background:var(--card)">${esc(x.review_comment)}</p>` : ''}
          ${x.status === 'pending' ? `<div class="row" style="align-items:flex-end;gap:12px;padding-top:12px;border-top:1px solid var(--line2)">
            <div class="field" style="flex:1 1 320px"><label class="caps" for="c${x.id}">Comment (needed to return)</label><input id="c${x.id}" style="height:44px" placeholder="e.g. Shutter sizes missing on elevation B"></div>
            <button class="btn ghost sm" data-ret="${x.id}">Return</button><button class="btn sm" data-ok="${x.id}">Approve</button></div>` : ''}
        </article>`;
      }).join('') + '</div>'}`;
    $$('[data-f]').forEach((b) => { b.onclick = () => { S.view.apFilter = b.dataset.f; pageApprovals(main).catch(fail); }; });
    $$('[data-view]').forEach((b) => { b.onclick = async () => {
      const { data: u, error: e } = await sb.storage.from('drawings').createSignedUrl(b.dataset.view, 600);
      if (e) return fail(e); window.open(u.signedUrl, '_blank', 'noopener');
    }; });
    const review = async (id, status) => {
      const c = ($('#c' + id).value || '').trim();
      if (status === 'returned' && !c) { toast('Add a comment so the designer knows what to fix.'); $('#c' + id).focus(); return; }
      const who = S.profile.full_name;
      const { error: e } = await sb.from('drawings').update({
        status, reviewed_by: S.profile.id, reviewed_at: new Date().toISOString(),
        review_comment: status === 'approved' ? ('Approved by ' + who + '.' + (c ? ' ' + c : '')) : ('Returned by ' + who + ': ' + c)
      }).eq('id', id);
      if (e) return fail(e);
      toast(status === 'approved' ? 'Approved.' : 'Returned to the designer.');
      pageApprovals(main).catch(fail);
    };
    $$('[data-ok]').forEach((b) => { b.onclick = () => review(Number(b.dataset.ok), 'approved'); });
    $$('[data-ret]').forEach((b) => { b.onclick = () => review(Number(b.dataset.ret), 'returned'); });
  }

  // ---------- users (admin) ----------
  async function pageUsers(main) {
    const { data, error } = await sb.from('profiles').select('*').order('created_at');
    if (error) throw error;
    const pending = data.filter((u) => u.status === 'pending');
    const others = data.filter((u) => u.status !== 'pending');
    const PAGES_TXT = (r) => (ROLE_PAGES[r] || []).map((k) => PAGE_LABEL[k]).join(', ');
    main.innerHTML = `<div class="stack" style="gap:8px"><p class="eyebrow">Admin</p><h1 class="h1">Users and access</h1><p class="lead">Approve sign-up requests, change roles and switch accounts on or off.</p></div>
      <section class="stack" style="gap:16px"><h2 class="h2">Sign-up requests <span class="small" style="font-family:var(--sans);font-size:14.5px">${pending.length} pending</span></h2>
        ${!pending.length ? '<p class="empty">No pending requests.</p>' : '<div class="cards">' + pending.map((u) => `
          <article class="item" style="flex:1 1 360px"><div style="display:flex;align-items:center;gap:14px"><span class="avatar" style="width:44px;height:44px">${esc(initials(u.full_name))}</span>
            <span><strong style="font-size:18px">${esc(u.full_name)}</strong><span class="small" style="display:block">${esc(u.emp_id || '—')} · ${esc(u.email || '')}</span></span></div>
            <span><span class="tag">Asked for: ${esc(ROLE_LABEL[u.role])}</span> <span class="small">Requested ${fmtDate(new Date(u.created_at))}</span></span>
            <div class="row" style="justify-content:flex-end;gap:12px"><button class="btn ghost sm" data-reject="${u.id}">Reject</button><button class="btn sm" data-approve="${u.id}">Approve</button></div></article>`).join('') + '</div>'}
      </section>
      <section class="stack" style="gap:16px"><h2 class="h2">All users <span class="small" style="font-family:var(--sans);font-size:14.5px">${others.length}</span></h2>
        <div class="tablewrap"><table><thead><tr><th>Name</th><th>Emp ID</th><th style="width:190px">Role</th><th>DH only</th><th>Pages they see</th><th>Status</th><th>Action</th></tr></thead><tbody>
        ${others.map((u) => `<tr>
          <td style="color:${u.status === 'active' ? 'var(--cream)' : 'var(--muted)'}">${esc(u.full_name)}<span class="sub">${esc(u.email || '')}</span></td>
          <td>${esc(u.emp_id || '—')}</td>
          <td><label class="small" for="r${u.id}" style="position:absolute;left:-9999px">Role for ${esc(u.full_name)}</label><select id="r${u.id}" data-role="${u.id}" style="height:44px" ${u.id === S.profile.id ? 'disabled title="You cannot change your own role"' : ''}>${Object.keys(ROLE_LABEL).map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select></td>
          <td>${u.role === 'convertor' ? `<input type="checkbox" data-dh="${u.id}" ${u.dh_only ? 'checked' : ''} aria-label="DH orders only for ${esc(u.full_name)}">` : '<span class="small">—</span>'}</td>
          <td class="small">${u.status === 'active' ? esc(PAGES_TXT(u.role)) : 'No access'}</td>
          <td><span style="color:${u.status === 'active' ? GOLD : MUTED};font-size:12px;font-weight:600;letter-spacing:.8px;text-transform:uppercase"><span class="dot" style="background:${u.status === 'active' ? GOLD : MUTED}"></span>${u.status}</span></td>
          <td>${u.id === S.profile.id ? '<span class="small">You</span>' : `<button class="btn ghost sm" data-toggle="${u.id}" data-to="${u.status === 'active' ? 'inactive' : 'active'}">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('')}
        </tbody></table></div></section>`;
    const upd = async (id, patch, msg) => { const { error: e } = await sb.from('profiles').update(patch).eq('id', id); if (e) return fail(e); toast(msg); pageUsers(main).catch(fail); };
    const name = (id) => (data.find((u) => u.id === id) || {}).full_name;
    $$('[data-approve]').forEach((b) => { b.onclick = () => upd(b.dataset.approve, { status: 'active' }, name(b.dataset.approve) + ' approved.'); });
    $$('[data-reject]').forEach((b) => { b.onclick = () => upd(b.dataset.reject, { status: 'inactive' }, name(b.dataset.reject) + "'s request was rejected."); });
    $$('[data-role]').forEach((s) => { s.onchange = () => upd(s.dataset.role, { role: s.value }, name(s.dataset.role) + ' is now ' + ROLE_LABEL[s.value] + '.'); });
    $$('[data-dh]').forEach((c) => { c.onchange = () => upd(c.dataset.dh, { dh_only: c.checked }, name(c.dataset.dh) + (c.checked ? ' now takes DH orders only.' : ' can take any order.')); });
    $$('[data-toggle]').forEach((b) => { b.onclick = () => upd(b.dataset.toggle, { status: b.dataset.to }, name(b.dataset.toggle) + (b.dataset.to === 'active' ? ' activated.' : ' deactivated.')); });
  }

  boot().catch((e) => { $app.innerHTML = '<p class="err" style="padding:40px">Could not start: ' + esc(e.message || e) + '</p>'; });
})();

/**
 * ui.js — کامپوننت‌های رابط (کارت، فرم، برگهٔ پایین‌کشویی، تأییدیه، نمودار).
 * همه‌چیز بر پایهٔ رشتهٔ HTML امن (esc خودکار) و واگذاری رویداد (event delegation).
 */
import M from '../lib/money.js';
import * as J from '../lib/jalali.js';
import * as fmt from './fmt.js';

/* ------------------------------ ابزار متن ------------------------------ */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const raw = (s) => ({ __raw: String(s ?? '') });
const flat = (v) => {
  if (v === null || v === undefined || v === false) return '';
  if (typeof v === 'object' && v.__raw !== undefined) return v.__raw;
  if (Array.isArray(v)) return v.map(flat).join('');
  return String(v);
};
/** جای‌گذاری HTML در اسلات‌های اجزا (متن کاربر باید با esc() فرار شود) */
export const R = (v) => (v === null || v === undefined || v === false ? '' : typeof v === 'object' && v.__raw !== undefined ? v.__raw : String(v));

/**
 * `t\`…\`` — قالب سازندهٔ HTML.
 * برخلاف قالب معمولی، مقدارها را بدون فرار کنار هم می‌چیند تا خروجی اجزا (که خودش HTML است) خراب نشود.
 * قانون: هر نوشته‌ای که از کاربر می‌آید باید با esc() بسته شود — همهٔ نماها همین کار را می‌کنند.
 */
export const t = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (i < vals.length ? flat(vals[i]) : ''), '');

export const icon = (name, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#${name}"/></svg>`;
export const el = (sel, root = document) => root.querySelector(sel);
export const els = (sel, root = document) => [...root.querySelectorAll(sel)];

/** واگذاری رویداد: handlers = { 'click [data-act=add]': fn } یا ساده‌تر { add: fn } برای data-act */
export function delegate(root, acts) {
  root.addEventListener('click', (e) => {
    const node = e.target.closest('[data-act]');
    if (!node || !root.contains(node)) return;
    const fn = acts[node.dataset.act];
    if (fn) { e.preventDefault(); fn(node, e); }
  });
  root.addEventListener('change', (e) => {
    const node = e.target.closest('[data-onchange]');
    if (!node) return;
    const fn = acts[node.dataset.onchange];
    if (fn) fn(node, e);
  });
  root.addEventListener('input', (e) => {
    const node = e.target.closest('[data-oninput]');
    if (!node) return;
    const fn = acts[node.dataset.oninput];
    if (fn) fn(node, e);
  });
  root.addEventListener('submit', (e) => {
    const key = e.target.dataset.onsubmit || e.target.dataset.onSubmit;
    const fn = acts[key];
    if (fn) { e.preventDefault(); fn(e.target, e); }
  });
}

/* ------------------------------ قطعات نمایشی ------------------------------ */
export const pill = (label, tone = 'neutral', iconName = null) =>
  `<span class="pill pill-${tone}">${iconName ? icon(iconName, 'ic micro') : '<i class="dot" aria-hidden="true"></i>'}${esc(label)}</span>`;

export const statusPill = (status) => {
  const map = { paid: ['success', 'i-check'], partial: ['warn', 'i-clock'], unpaid: ['danger', 'i-alert'], cancelled: ['muted', 'i-close'] };
  const [tone, ic] = map[status] || ['neutral', 'i-info'];
  return pill(fmt.statusLabel(status), tone, ic);
};

export const moneyTone = (v) => (M.fromDb(String(v ?? '0')) > 0n ? 'success' : M.fromDb(String(v ?? '0')) < 0n ? 'danger' : 'muted');

export const card = (opts) => `<section class="card ${esc(opts.class || '')}" ${opts.id ? `id="${esc(opts.id)}"` : ''}>
    ${opts.title ? `<header class="card-head"><h3>${R(opts.title)}</h3>${opts.action ? `<div class="card-actions">${R(opts.action)}</div>` : ''}</header>` : ''}
    ${opts.hint ? `<p class="card-hint">${R(opts.hint)}</p>` : ''}
    <div class="card-body">${R(opts.body)}</div>
    ${opts.footer ? `<footer class="card-foot">${R(opts.footer)}</footer>` : ''}
  </section>`;

export const kpi = (o) => `<button type="button" class="kpi ${esc(o.class || '')}" ${o.href ? `data-act="goto" data-href="${esc(o.href)}"` : 'data-act="noop"'}>
    <span class="kpi-top"><span class="kpi-ic ${esc(o.tone || '')}">${icon(o.icon || 'i-info')}</span>${o.badge ? pill(o.badge, o.badgeTone || 'neutral') : ''}</span>
    <span class="kpi-label">${R(o.label)}</span>
    <span class="kpi-value">${R(o.value)}</span>
    ${o.sub ? `<span class="kpi-sub">${R(o.sub)}</span>` : ''}
    ${o.hint ? `<span class="kpi-hint">${icon('i-info', 'ic nano')}${R(o.hint)}</span>` : ''}
  </button>`;

export const row = (o) => `<a class="row ${esc(o.class || '')}" ${o.href ? `href="${esc(o.href)}"` : 'href="javascript:void 0"'} ${o.act ? `data-act="${esc(o.act)}"` : ''} ${o.data || ''}>
    <span class="row-ic ${esc(o.tone || '')}">${icon(o.icon || 'i-tag')}</span>
    <span class="row-main">
      <span class="row-title">${R(o.title)}</span>
      ${o.sub ? `<span class="row-sub">${R(o.sub)}</span>` : ''}
      ${o.meta ? `<span class="row-meta">${R(o.meta)}</span>` : ''}
    </span>
    <span class="row-end">${R(o.right)}${o.arrow === false ? '' : icon('i-back', 'ic row-arrow')}</span>
  </a>`;

export const emptyState = (o) => `<div class="empty">
    <span class="empty-ic">${icon(o.icon || 'i-book')}</span>
    <h4>${R(o.title || 'چیزی برای نمایش نیست')}</h4>
    ${o.text ? `<p>${R(o.text)}</p>` : ''}
    ${o.action ? `<div class="empty-actions">${R(o.action)}</div>` : ''}
  </div>`;

export const btn = (o) => `<button type="${o.type || 'button'}" class="btn btn-${esc(o.variant || 'primary')} ${o.wide ? 'wide' : ''} ${o.small ? 'small' : ''} ${esc(o.class || '')}"
    ${o.act ? `data-act="${esc(o.act)}"` : ''} ${o.attrs || ''} ${o.disabled ? 'disabled' : ''}>${o.icon ? icon(o.icon) : ''}${R(o.label)}</button>`;

export const linkBtn = (href, label, opts = {}) => t`<a class="btn btn-${opts.variant || 'soft'} ${opts.small ? 'small' : ''}" href="${href}">${opts.icon ? icon(opts.icon) : ''}${label}</a>`;

export const skeleton = (rows = 4) => `<div class="skel" aria-busy="true" aria-label="در حال بارگذاری">${Array.from({ length: rows }, (_, i) => `<div class="skel-row" style="--i:${i}"></div>`).join('')}</div>`;

export const errorBox = (e, retryAct = 'retry') => t`
  <div class="errbox" role="alert">
    <span class="err-ic">${icon('i-alert')}</span>
    <div><h4>نتوانستیم این بخش را نشان دهیم</h4><p>${esc(e?.userMessage || e?.message || 'خطای ناشناخته')}</p>
      ${e?.hint ? `<p class="muted small">${esc(e.hint)}</p>` : ''}</div>
    <button class="btn btn-soft small" data-act="${retryAct}">تلاش دوباره</button>
  </div>`;

export const note = (text, tone = 'info') => `<p class="note note-${esc(tone)}">${icon(tone === 'warn' || tone === 'danger' ? 'i-alert' : 'i-info', 'ic nano')}${R(text)}</p>`;

/* ------------------------------ فیلدها ------------------------------ */
export const field = (o) => `<label class="field ${esc(o.class || '')}" ${o.hidden ? 'hidden' : ''} ${o.name ? `data-field="${esc(o.name)}"` : ''}>
    <span class="field-label">${R(o.label)}${o.required ? '<b class="req" title="پرکردن این خانه لازم است">*</b>' : ''}</span>
    ${R(o.control)}
    ${o.hint ? `<span class="field-hint">${R(o.hint)}</span>` : ''}
    ${o.error ? `<span class="field-err" data-err-for="${esc(o.name)}">${R(o.error)}</span>` : ''}
  </label>`;

export const input = (o) => t`
  <input class="inp ${o.type === 'money' || o.type === 'number' ? 'inp-num' : ''} ${o.class || ''}"
    type="${o.type === 'money' || o.type === 'number' ? 'text' : (o.type || 'text')}"
    ${o.type === 'money' ? 'inputmode="decimal" data-kind="money"' : ''}
    ${o.type === 'number' ? 'inputmode="numeric"' : ''}
    ${o.type === 'tel' ? 'inputmode="tel"' : ''} ${o.type === 'email' ? 'inputmode="email"' : ''}
    name="${o.name}" ${o.value !== undefined && o.value !== null ? raw(`value="${esc(o.value)}"`) : ''}
    ${o.placeholder ? raw(`placeholder="${esc(o.placeholder)}"`) : ''} ${o.required ? 'required' : ''}
    ${o.autocomplete ? raw(`autocomplete="${o.autocomplete}"`) : 'autocomplete="off"'}
    ${o.attrs || ''} aria-label="${esc(o.aria || o.label || o.name)}">`;

export const textarea = (o) => t`<textarea class="inp" name="${o.name}" rows="${o.rows || 3}" ${o.placeholder ? raw(`placeholder="${esc(o.placeholder)}"`) : ''} aria-label="${esc(o.aria || o.label || o.name)}">${esc(o.value || '')}</textarea>`;

export const select = (o) => t`
  <select class="inp" name="${o.name}" ${o.attrs || ''} aria-label="${esc(o.aria || o.label || o.name)}">
    ${o.placeholder ? `<option value="">${o.placeholder}</option>` : ''}
    ${(o.options || []).map((x) => `<option value="${esc(x.value)}" ${String(x.value) === String(o.value ?? '') ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
  </select>`;

export const switchField = (o) => t`
  <label class="switch">
    <input type="checkbox" name="${o.name}" ${o.checked ? 'checked' : ''} ${o.attrs || ''}>
    <span class="switch-track" aria-hidden="true"></span>
    <span class="switch-label"><b>${R(o.label)}</b>${o.hint ? `<i>${R(o.hint)}</i>` : ''}</span>
  </label>`;

export const segmented = (o) => t`<div class="seg" role="group" ${o.name ? `data-seg="${esc(o.name)}"` : ''}>
    ${o.name ? `<input type="hidden" name="${esc(o.name)}" value="${esc(o.value ?? '')}" data-seg-input>` : ''}
    ${o.items.map((it) => `<button type="button" class="seg-btn ${String(it.value) === String(o.value) ? 'on' : ''}"
      data-act="${esc(o.act || 'seg-pick')}" data-value="${esc(it.value)}" aria-pressed="${String(it.value) === String(o.value)}">${it.icon ? icon(it.icon, 'ic nano') : ''}${R(it.label)}</button>`).join('')}
  </div>`;

export const stepper = (o) => t`
  <span class="stepper">
    <button type="button" class="stepper-btn" data-act="${o.decAct || 'qty-dec'}" aria-label="کم کردن">${icon('i-minus')}</button>
    <input class="inp inp-num stepper-val" name="${o.name}" inputmode="decimal" value="${esc(o.value)}" aria-label="${esc(o.aria || 'مقدار')}">
    <button type="button" class="stepper-btn" data-act="${o.incAct || 'qty-inc'}" aria-label="زیاد کردن">${icon('i-plus')}</button>
  </span>`;

/** انتخاب تاریخ شمسی با تقویم + میان‌بُرهای سریع */
export const dateField = (o) => t`
  <div class="datefield" data-date-field data-value="${esc(o.value || fmt.today())}">
    <input type="hidden" name="${o.name}" value="${esc(o.value || fmt.today())}">
    <button type="button" class="inp inp-date" data-act="${o.act || 'pick-date'}">
      ${icon('i-clock', 'ic nano')}<span data-date-label>${fmt.date(o.value || fmt.today())}</span>
    </button>
    <span class="df-quick">
      <button type="button" class="chip" data-act="${o.act || 'pick-date'}" data-date="today">امروز</button>
      <button type="button" class="chip" data-act="${o.act || 'pick-date'}" data-date="-1">دیروز</button>
    </span>
  </div>`;

/** فیلد ارز + نرخ تبدیل + پیش‌نمایش معادل افغانی */
export function currencyField(o) {
  const list = fmt.activeCurrencies();
  const single = list.length <= 1;
  return t`
  <div class="cur-field" data-cur-field data-base="${fmt.base()}" ${o.onchange ? raw(`data-onchange="${o.onchange}"`) : ''}>
    <div class="cur-row">
      ${field({ label: 'ارز', name: o.name + '_currency', control: select({ name: o.name + '_currency', options: list.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` })), value: o.currency || fmt.settings().currency_default }), hidden: single })}
      <div class="cur-rate" ${single ? 'hidden' : ''}>
        ${field({ label: 'نرخ تبدیل به ' + fmt.base(), name: o.name + '_rate', value: o.rate,
          control: input({ name: o.name + '_rate', type: 'money', value: o.rate || '', placeholder: 'نرخ روز سند', attrs: 'data-rate-step="4"' }),
          hint: raw(o.rateHint ? `<span data-rate-hint>${o.rateHint}</span>` : '<span data-rate-hint></span>') })}
      </div>
    </div>
    <p class="cur-equiv" data-cur-equiv hidden></p>
  </div>`;
}

/** تصویر رسید / لوگو */
export const imageField = (o) => t`
  <div class="imgfield" data-img-field>
    <input type="hidden" name="${o.name}" value="${esc(o.value || '')}">
    <div class="imgbox" data-imgbox>
      ${o.value ? `<img src="${esc(o.value)}" alt="تصویر انتخاب‌شده">` : `<span>${icon('i-camera')}<b>${R(o.label || 'افزودن تصویر رسید')}</b><i>${R(o.hint || 'از دوربین یا گالری انتخاب کنید')}</i></span>`}
    </div>
    <input type="file" accept="image/*" capture="${o.capture || 'environment'}" hidden data-imginput>
    <div class="imgbtns">
      <button type="button" class="btn btn-soft small" data-act="${o.act || 'pick-img'}">${icon('i-camera', 'ic nano')}${o.buttonLabel || 'انتخاب تصویر'}</button>
      ${o.value ? '<button type="button" class="btn btn-ghost small" data-act="clear-img">برداشتن تصویر</button>' : ''}
    </div>
  </div>`;

/* ------------------------------ خواندن فرم ------------------------------ */
export function readForm(root) {
  const out = {};
  els('[name]', root).forEach((n) => {
    if (n.type === 'checkbox') out[n.name] = n.checked;
    else if (n.type === 'radio') { if (n.checked) out[n.name] = n.value; }
    else out[n.name] = n.value;
  });
  return out;
}

export function markErrors(root, e) {
  els('.field-err', root).forEach((x) => x.remove());
  if (e?.field) {
    const node = el(`[name="${e.field}"]`, root);
    if (node) {
      const f = node.closest('.field');
      if (f) f.insertAdjacentHTML('beforeend', `<span class="field-err" role="alert">${esc(e.userMessage || e.message)}</span>`);
      node.classList.add('inp-bad');
      node.focus?.();
    }
  }
}
export const clearErrors = (root) => { els('.field-err', root).forEach((x) => x.remove()); els('.inp-bad', root).forEach((x) => x.classList.remove('inp-bad')); };

/* ------------------------------ پیام‌ها و پنجره‌ها ------------------------------ */
export function toast(msg, kind = 'success', ms = 3600) {
  const box = document.getElementById('toasts');
  const node = document.createElement('div');
  node.className = `toast toast-${kind}`;
  node.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
  node.innerHTML = `${icon(kind === 'success' ? 'i-check' : kind === 'danger' ? 'i-alert' : kind === 'warn' ? 'i-alert' : 'i-info', 'ic nano')}<div>${esc(typeof msg === 'string' ? msg : String(msg ?? ''))}</div>`;
  box?.appendChild(node);
  requestAnimationFrame(() => node.classList.add('in'));
  const kill = () => { node.classList.remove('in'); setTimeout(() => node.remove(), 260); };
  const timer = setTimeout(kill, ms);
  node.addEventListener('click', () => { clearTimeout(timer); kill(); });
  return node;
}

/** تأییدیهٔ عملیات مهم (حذف، لغو، ثبت) */
export function confirmBox(o) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'confirm-wrap';
    wrap.innerHTML = t`
      <div class="confirm" role="dialog" aria-modal="true" aria-labelledby="cf-t">
        <span class="confirm-ic confirm-${o.tone || (o.danger ? 'danger' : 'brand')}">${icon(o.icon || (o.danger ? 'i-alert' : 'i-check'))}</span>
        <h4 id="cf-t">${o.title}</h4>
        ${o.text ? `<p>${o.text}</p>` : ''}
        ${o.detail ? `<div class="confirm-detail">${o.detail}</div>` : ''}
        ${o.check ? `<label class="switch"><input type="checkbox" name="ok2"><span class="switch-track"></span><span class="switch-label"><b>${o.check}</b></span></label>` : ''}
        <div class="confirm-btns">
          <button class="btn btn-ghost" data-x="0">انصراف</button>
          <button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-x="1">${o.ok || 'تأیید'}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    const done = (v) => {
      if (o.check && v && !wrap.querySelector('[name=ok2]').checked) { toast(`برای ادامه، تیک «${o.check}» را روشن کنید.`, 'warn'); return; }
      wrap.classList.remove('in');
      setTimeout(() => wrap.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); };
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return done(false);
      const b = e.target.closest('[data-x]');
      if (b) done(b.dataset.x === '1');
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => wrap.querySelector('.btn-primary, .btn-danger')?.focus(), 40);
  });
}

/** پنجرهٔ ورود متن (برای تأییدیه‌های حساس مانند «پاک کردن») */
export function promptBox(o) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'confirm-wrap';
    wrap.innerHTML = t`<div class="confirm" role="dialog" aria-modal="true">
      <h4>${o.title}</h4>${o.text ? `<p>${o.text}</p>` : ''}
      <input class="inp" id="pf-in" placeholder="${o.placeholder || ''}" aria-label="${esc(o.label || '')}">
      ${o.expected ? `<p class="note note-warn">${icon('i-info', 'ic nano')}دقیقاً این عبارت را بنویسید: <b>${o.expected}</b></p>` : ''}
      <div class="confirm-btns"><button class="btn btn-ghost" data-x="0">انصراف</button>
      <button class="btn btn-primary" data-x="1">${o.ok || 'ثبت'}</button></div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.classList.add('in'); wrap.querySelector('#pf-in').focus(); });
    const done = (v) => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); if (e.key === 'Enter') submit(); };
    const submit = () => {
      const v = wrap.querySelector('#pf-in').value.trim();
      if (o.expected && v !== o.expected) { toast('عبارت تایید یکسان نیست.', 'warn'); wrap.querySelector('#pf-in').focus(); return; }
      done(v);
    };
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-x="1"]')) submit(); else if (e.target.closest('[data-x="0"]') || e.target === wrap) done(null); });
    document.addEventListener('keydown', onKey);
  });
}

/** برگهٔ تمام‌صفحه (موبایل) / مودال مرکزی (دسکتاپ) */
export function sheet(o) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${esc(o.class || '')}" role="dialog" aria-modal="true" aria-label="${esc(typeof o.title === 'string' ? o.title.replace(/<[^>]*>/g, '') : '')}">
      <header class="sheet-head">
        <div><h3>${R(o.title)}</h3>${o.sub ? `<p class="muted small">${R(o.sub)}</p>` : ''}</div>
        <button class="icon-btn" data-close aria-label="بستن">${icon('i-close')}</button>
      </header>
      ${o.steps ? `<div class="steps">${o.steps.map((s, i) => `<span class="step ${i === (o.step || 0) ? 'on' : i < (o.step || 0) ? 'done' : ''}"><b>${i + 1}</b>${R(s)}</span>`).join('')}</div>` : ''}
      <div class="sheet-body" data-sheet-body>${R(o.body)}</div>
      ${o.footer ? `<footer class="sheet-foot">${R(o.footer)}</footer>` : ''}
    </div>`;
  document.getElementById('layers').appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const api = {
    root: wrap,
    body: wrap.querySelector('[data-sheet-body]'),
    close: () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 240); document.removeEventListener('keydown', onKey); o.onClose?.(); },
    setBody: (html) => { api.body.innerHTML = html; },
    setFooter: (html) => { const f = wrap.querySelector('.sheet-foot'); if (f) f.innerHTML = html; },
    setTitle: (title, sub) => { wrap.querySelector('.sheet-head h3').innerHTML = title; if (sub !== undefined) wrap.querySelector('.sheet-head p').innerHTML = sub; },
    setSteps: (active) => { api.steps = active; els('.step', wrap).forEach((s, i) => { s.classList.toggle('on', i === active); s.classList.toggle('done', i < active); }); },
  };
  const onKey = (e) => { if (e.key === 'Escape') api.close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) api.close(); });
  return api;
}

/** فرم ساده در برگه: فیلدها را می‌گیرد و هنگام ثبت مقادیر را برمی‌گرداند */
export function formSheet(o) {
  const body = t`<form data-onsubmit="submit" class="form">
    ${o.fields.map((f) => (typeof f === 'function' ? f() : f)).join('')}
    <button type="submit" class="btn btn-primary wide">${o.ok || 'ذخیره'}</button>
  </form>`;
  const s = sheet({ title: o.title, sub: o.sub, body, class: 'sheet-form' });
  const form = s.body.querySelector('form');
  delegate(form, {
    submit: async () => {
      const v = readForm(form);
      try {
        if (o.validate) o.validate(v);
        const r = o.onSubmit ? await o.onSubmit(v, s) : null;
        if (r !== false) s.close();
      } catch (e) {
        markErrors(form, e);
        toast(e.userMessage || e.message || 'خطا در ذخیره', 'danger');
      }
    },
    ...(o.acts || {}),
  });
  o.onMount?.(form, s);
  return s;
}

/* ------------------------------ نمودار (SVG دستی) ------------------------------ */
export function barChart(series, opts = {}) {
  const h = 112;
  // ارتفاع ستون‌ها نسبی است؛ برای مقایسه به عدد کافی است (میکرو را به number تبدیل می‌کنیم)
  const vals = series.flatMap((s) => [Math.max(0, Number(M.fromDb(s.sales || '0'))), Math.max(0, Number(M.fromDb(s.purchases || '0')))]);
  const max = Math.max(1, ...vals);
  const n = Math.max(1, series.length);
  const w = 100 / n;
  const y = (v) => h - Number(v) / max * (h - 6);
  return `<svg class="chart" viewBox="0 0 100 ${h + 14}" preserveAspectRatio="none" role="img" aria-label="نمودار ستونی فروش و خرید">
    <line x1="0" y1="${h + 0.5}" x2="100" y2="${h + 0.5}" class="chart-axis"/>
    ${series.map((s, i) => {
    const sv = Math.max(0, Number(M.fromDb(s.sales || '0'))) / max * (h - 6);
    const pv = Math.max(0, Number(M.fromDb(s.purchases || '0'))) / max * (h - 6);
    const x = i * w;
    return `<g><rect class="bar bar-s" x="${x + w * 0.16}" y="${h - sv}" width="${w * 0.28}" height="${Math.max(0, sv)}" rx="1.2"><title>${esc(s.label || s.key)}: فروش ${esc(fmt.money(s.sales || '0', fmt.base()))}</title></rect>
        <rect class="bar bar-p" x="${x + w * 0.52}" y="${h - pv}" width="${w * 0.28}" height="${Math.max(0, pv)}" rx="1.2"><title>${esc(s.label || s.key)}: خرید ${esc(fmt.money(s.purchases || '0', fmt.base()))}</title></rect></g>`;
  }).join('')}
    ${series.map((s, i) => `<text class="chart-x" x="${i * w + w / 2}" y="${h + 11}" text-anchor="middle">${esc(s.label || '')}</text>`).join('')}
  </svg>`;
}

export function donut(parts, opts = {}) {
  const total = parts.reduce((t0, p) => t0 + M.fromDb(p.value || '0'), 0n);
  let acc = 0n;
  const R = 15.9155;
  const rings = parts.map((p, i) => {
    const share = total > 0n ? Number(M.fromDb(p.value || '0') * 10000n / total) / 1000 : 0;
    const dash = `${share * 100} ${(1 - share) * 100}`;
    const off = 25 - (Number(acc * 10000n / (total || 1n)) / 1000) * 100;
    acc += M.fromDb(p.value || '0');
    return `<circle class="ring ring-${i % 6}" cx="0" cy="0" r="${R}" stroke-dasharray="${dash}" stroke-dashoffset="${off}" stroke-width="${opts.width || 5}"><title>${esc(p.label)}: ${esc(fmt.money(p.value, opts.currency || fmt.base()))}</title></circle>`;
  }).join('');
  return `<svg class="donut" viewBox="-22 -22 44 44" role="img" aria-label="${esc(opts.aria || 'نمودارวงی')}">${rings}
    ${opts.center ? `<text x="0" y="-1" text-anchor="middle" class="donut-c">${opts.center}</text>` : ''}
    ${opts.centerSub ? `<text x="0" y="6" text-anchor="middle" class="donut-s">${opts.centerSub}</text>` : ''}</svg>`;
}

export const legend = (parts, opts = {}) => `<ul class="legend">${parts.map((p, i) => `<li><span class="sw sw-${i % 6}"></span><b>${esc(p.label)}</b><i>${opts.money === false ? esc(p.raw) : fmt.money(p.value, opts.currency)}</i></li>`).join('')}</ul>`;

/* ------------------------------ اجزای ترکیبی ------------------------------ */
export const rangeChips = (value) => t`
  <div class="chips" role="group" aria-label="انتخاب بازهٔ زمانی">
    ${[['today', 'امروز'], ['week', '۷ روز'], ['month', 'این ماه'], ['last_month', 'ماه قبل'], ['quarter', '۳ ماه'], ['year', 'امسال'], ['all', 'همه']]
      .map(([k, l]) => `<button type="button" class="chip ${value === k ? 'on' : ''}" data-act="range" data-range="${k}" aria-pressed="${value === k}">${l}</button>`).join('')}
  </div>`;

/** مبلغ + معادل افغانی (فقط وقتی ارز با ارز پایه فرق دارد) */
export const moneyView = (v, code, opts = {}) => {
  const m = M.fromDb(String(v ?? '0'));
  const main = fmt.money(m, code, opts);
  if (!code || code === fmt.base() || opts.noBase) return main;
  const r = opts.rate !== undefined ? M.fromDb(String(opts.rate)) : M.SCALE;
  return `${main}<span class="muted small block">≈ ${fmt.money(M.mul(m, r), fmt.base())}</span>`;
};

/** فیلد انتخاب از فهرست (مشتری، کالا، حساب…) با جست‌وجو */
export const pickerField = (o) => t`
  <div class="picker" data-picker data-name="${o.name}" ${o.onchange ? raw(`data-onchange="${o.onchange}"`) : ''}>
    <input type="hidden" name="${o.name}" value="${esc(o.value || '')}" data-picker-value>
    <span class="field-label">${R(o.label)}${o.required ? '<b class="req">*</b>' : ''}</span>
    <button type="button" class="inp inp-picker ${o.value ? '' : 'is-empty'}" data-act="${o.act || 'picker'}" data-source="${o.source || ''}" ${o.attrs || ''}>
      <span data-picker-label>${o.value ? esc(o.label || 'انتخاب‌شده') : esc(o.placeholder || 'انتخاب کنید')}</span>${icon('i-back', 'ic nano')}
    </button>
    ${o.hint ? `<span class="field-hint">${R(o.hint)}</span>` : ''}
  </div>`;

export const searchBox = (o) => t`
  <div class="searchbox">
    ${icon('i-search', 'ic nano')}
    <input class="inp" type="search" name="${o.name || 'q'}" value="${esc(o.value || '')}" placeholder="${o.placeholder || 'جست‌وجو…'}" aria-label="${esc(o.aria || 'جست‌وجو')}" ${o.autofocus ? 'autofocus' : ''}>
    ${o.value ? '<button type="button" class="icon-btn tiny" data-act="clear-search" aria-label="پاک کردن جست‌وجو">' + icon('i-close', 'ic nano') + '</button>' : ''}
  </div>`;

/* ------------------------------ تقویم جلالی ------------------------------ */
export function openJalaliPicker(iso, onPick) {
  const s0 = J.jalaliFromIso(iso || fmt.today());
  let jy = s0.jy, jm = s0.jm;
  const st = fmt.settings();
  const wrap = document.createElement('div');
  wrap.className = 'confirm-wrap cal-wrap';
  const grid = () => {
    const first = J.isoFromJalali(jy, jm, 1);
    const lead = J.weekdayIndex(first);
    const len = J.jalaaliMonthLength(jy, jm);
    const cells = [];
    for (let i = 0; i < lead; i += 1) cells.push('<span class="cal-cell pad"></span>');
    for (let d = 1; d <= len; d += 1) {
      const isSel = first === iso || (J.isoFromJalali(jy, jm, d) === iso);
      const isToday = J.isoFromJalali(jy, jm, d) === J.todayIso();
      cells.push(`<button type="button" class="cal-cell ${isSel ? 'sel' : ''} ${isToday ? 'today' : ''}" data-pick="${d}">${st.digits === 'fa' ? M.toFaDigits(String(d)) : d}</button>`);
    }
    return `<div class="cal-head">
        <button type="button" class="icon-btn" data-m="-1" aria-label="ماه قبل">${icon('i-back', 'ic')}</button>
        <div class="cal-title">${J.monthName(jm, st.cal_style)} <b>${st.digits === 'fa' ? M.toFaDigits(String(jy)) : jy}</b></div>
        <button type="button" class="icon-btn flip" data-m="1" aria-label="ماه بعد">${icon('i-back', 'ic')}</button>
      </div>
      <div class="cal-week">${J.WEEKDAYS.map((w) => `<span>${w.slice(0, 3)}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>`;
  };
  const render = () => {
    wrap.innerHTML = `<div class="confirm cal" role="dialog" aria-modal="true">
      <h4>${esc(o_label || 'انتخاب تاریخ')}</h4>${grid()}
      <div class="confirm-btns"><button class="btn btn-ghost" data-x="0">بستن</button>
      <button class="btn btn-primary" data-pick-today>امروز</button></div></div>`;
  };
  let o_label = 'انتخاب تاریخ';
  render();
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const close = () => { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 200); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-x="0"]')) return close();
    const m = e.target.closest('[data-m]');
    if (m) { jm += +m.dataset.m; if (jm > 12) { jm = 1; jy += 1; } if (jm < 1) { jm = 12; jy -= 1; } return render(); }
    const p = e.target.closest('[data-pick]');
    if (p) { onPick(J.isoFromJalali(jy, jm, +p.dataset.pick)); return close(); }
    if (e.target.closest('[data-pick-today]')) { onPick(J.todayIso()); return close(); }
  });
  return { close };
}

/* ------------------------------ هندلرهای عمومی ------------------------------ */
/** انتخاب تاریخ (همهٔ فیلدهای dateField در همهٔ نماها) */
export function handleDatePick(node) {
  const wrap = node.closest('[data-date-field]');
  if (!wrap) return;
  const hidden = wrap.querySelector('input[type=hidden]');
  const label = wrap.querySelector('[data-date-label]');
  const set = (iso) => {
    if (!iso) return;
    hidden.value = iso;
    label.textContent = fmt.date(iso);
    wrap.dataset.value = iso;
    wrap.dispatchEvent(new CustomEvent('dateset', { bubbles: true, detail: { iso } }));
  };
  if (node.dataset.date === 'today') return set(J.todayIso());
  if (node.dataset.date) return set(J.addDaysIso(hidden.value || J.todayIso(), +node.dataset.date));
  openJalaliPicker(hidden.value || J.todayIso(), set);
}

/** کم/زیاد کردن کمیت در استپر */
function handleStep(node) {
  const box = node.closest('.stepper');
  if (!box) return;
  const inp = box.querySelector('input');
  const step = M.fromDb(node.dataset.step || '1000000');
  const d = node.dataset.act === 'qty-inc' ? 1n : -1n;
  const cur = M.fromDb(M.parse(inp.value) ?? 0n);
  const next = cur + d * step;
  inp.value = M.str(next > 0n ? next : 0n, 4).replace(/\.0+$/, '');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

/** انتخاب تصویر و ذخیرهٔ آن به‌شکل dataURL در فیلد مخفی */
function handleImage(node) {
  const wrap = node.closest('[data-img-field]');
  if (!wrap) return;
  if (node.dataset.act === 'clear-img') {
    wrap.querySelector('[data-imginput]').value = '';
    wrap.querySelector('[data-imgbox]').innerHTML = `<span>${icon('i-camera')}<b>بدون تصویر</b><i>مجدداً انتخاب کنید</i></span>`;
    wrap.querySelector('input[type=hidden]').value = '';
    wrap.dispatchEvent(new CustomEvent('imgset', { bubbles: true, detail: { data: '' } }));
    return;
  }
  const file = node.querySelector('input[type=file]');
  node.closest('.imgbtns')?.querySelectorAll('button')[0]?.addEventListener('click', () => {}, { once: true });
  const inp = wrap.querySelector('[data-imginput]');
  inp.onchange = () => {
    const f = inp.files?.[0];
    if (!f) return;
    if (f.size > 6 * 1024 * 1024) { toast('تصویر بیشتر از ۶ مگابایت است. تصویر کوچک‌تری انتخاب کنید.', 'warn'); return; }
    const rd = new FileReader();
    rd.onload = async () => {
      const small = await shrink(String(rd.result), 1100);
      wrap.querySelector('input[type=hidden]').value = small;
      wrap.querySelector('[data-imgbox]').innerHTML = `<img src="${small}" alt="پیش‌نمایش تصویر">`;
      wrap.dispatchEvent(new CustomEvent('imgset', { bubbles: true, detail: { data: small } }));
    };
    rd.readAsDataURL(f);
    inp.click === undefined && inp.dispatchEvent(new Event('change'));
  };
  inp.click();
}
/** کوچک‌کردن تصویر در مرورگر تا حافظه و حجم فایل مناسب بماند */
export function shrink(dataUrl, max = 1100) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale >= 1 && dataUrl.length < 400_000) return resolve(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/jpeg', 0.82);
      if (out.length > 1_400_000) out = c.toDataURL('image/jpeg', 0.62);
      resolve(out);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const closeSheetAll = () => { document.querySelectorAll('.sheet-wrap.in, .confirm-wrap.in').forEach((w) => w.classList.remove('in')); setTimeout(() => document.querySelectorAll('.sheet-wrap:not(.in), .confirm-wrap:not(.in)').forEach((w) => w.remove()), 240); };

let installed = false;
/** هندلرهایی که همهٔ نماها به‌صورت خودکار دریافت می‌کنند */
export function installGlobals() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-act="pick-date"]');
    if (d) { handleDatePick(d); return; }
    const s = e.target.closest('[data-act="qty-inc"],[data-act="qty-dec"]');
    if (s) { handleStep(s); return; }
    const im = e.target.closest('[data-act="pick-img"],[data-act="clear-img"]');
    if (im) { handleImage(im); return; }
    const sb = e.target.closest('.seg-btn');
    if (sb) {
      const seg = sb.closest('.seg');
      if (seg) {
        [...seg.querySelectorAll('.seg-btn')].forEach((x) => { const on = x === sb; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
        const inp = seg.querySelector('[data-seg-input]');
        if (inp && inp.value !== sb.dataset.value) {
          inp.value = sb.dataset.value;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
    const g = e.target.closest('[data-act="goto"]');
    if (g?.dataset.href) { location.hash = g.dataset.href.startsWith('#') ? g.dataset.href : '#' + g.dataset.href; }
  });
}

/* ------------------------------ پیوند کوتاه‌بر ------------------------------ */
export const goto = (href) => { location.hash = href.startsWith('#') ? href : '#' + href; };
export const numFmt = (v, dec = 0) => fmt.num(v, dec);
export const pctFmt = (v) => M.fmt(M.fromDb(String(v ?? '0')), { decimals: 1, group: false, digits: fmt.settings().digits });

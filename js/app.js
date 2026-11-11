/*
 * CDKL5 variant explorer.
 * Links three views of the same mutation list: a 3D structure of the kinase
 * domain (PDBe Mol*), a schematic of the full protein (SVG) and a table.
 */
(function () {
  'use strict';

  var CFG = window.CDKL5_CONFIG;
  var LIB = window.CDKL5_LIB;
  var SVGNS = 'http://www.w3.org/2000/svg';
  var TYPE = {};
  CFG.types.forEach(function (t) { TYPE[t.key] = t; });

  var state = {
    muts: [],
    visible: new Set(CFG.types.map(function (t) { return t.key; })),
    hover: null,
    selected: null
  };

  // ---------------------------------------------------------------- helpers

  function $(sel) { return document.querySelector(sel); }

  function el(tag, attrs, parent, ns) {
    var node = ns ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    if (parent) parent.appendChild(node);
    return node;
  }
  function svg(tag, attrs, parent) { return el(tag, attrs, parent, true); }

  function hexToRgb(hex) {
    var n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function byId(id) {
    for (var i = 0; i < state.muts.length; i++) if (state.muts[i].id === id) return state.muts[i];
    return null;
  }

  function isVisible(m) { return state.visible.has(m.type); }

  function active() { return state.hover ? byId(state.hover) : state.selected ? byId(state.selected) : null; }

  // ------------------------------------------------------------------- data

  function buildMutations(rows) {
    var out = [];
    rows.forEach(function (r, i) {
      var p = LIB.parseHgvs(r.hgvs);
      if (!p) {
        console.warn('Could not parse HGVS name, row skipped:', r.hgvs);
        return;
      }
      if (r.type && TYPE[r.type.toLowerCase().replace(/[\s-]+/g, '_')]) {
        p.type = r.type.toLowerCase().replace(/[\s-]+/g, '_');
      }
      p.id = 'm' + i;
      p.hgvs = r.hgvs;
      p.label = r.hgvs.replace(/^p\./, '');
      p.clinvar = r.clinvar || '';
      p.reference = r.reference || '';
      p.note = r.note || '';
      p.region = LIB.regionOf(p.start, CFG);
      p.structure = LIB.structureStatus(p.start, p.end, CFG.structure);
      p.effect = LIB.describe(p, CFG);
      p.refOk = LIB.checkRef(p, CFG.protein.sequence);
      if (!p.refOk) console.warn('Reference amino acid does not match ' + CFG.protein.isoform + ':', r.hgvs);
      out.push(p);
    });
    out.sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    return out;
  }

  // -------------------------------------------------------------- 3D viewer

  var viewer = null;
  var viewerReady = false;
  var queue = Promise.resolve();
  var GREY = hexToRgb('#D9D9D9');
  var LOST = hexToRgb('#F4F4F4');

  function initViewer() {
    var host = $('#structure');
    if (typeof PDBeMolstarPlugin === 'undefined') {
      host.innerHTML = '<p class="viewer-error">The 3D viewer could not be loaded. Check your internet connection and reload.</p>';
      return;
    }
    viewer = new PDBeMolstarPlugin();
    viewer.render(host, {
      moleculeId: CFG.structure.pdb,
      hideControls: true,
      sequencePanel: false,
      landscape: true,
      visualStyle: 'cartoon',
      hideStructure: ['water'],
      hideCanvasControls: ['selection', 'animation', 'controlToggle', 'controlInfo'],
      bgColor: { r: 255, g: 255, b: 255 },
      highlightColor: hexToRgb('#FFB000'),
      selectColor: hexToRgb('#FFB000')
    });
    viewer.events.loadComplete.subscribe(function (ok) {
      if (ok === false) return;
      viewerReady = true;
      apply3D();
    });

    // Hovering or clicking a residue in 3D drives the other views.
    host.addEventListener('PDB.molstar.mouseover', function (e) {
      var r = e.eventData && e.eventData.auth_seq_id;
      var m = r ? mutationAt(r) : null;
      if ((m ? m.id : null) !== state.hover) setHover(m ? m.id : null, 'structure');
    });
    host.addEventListener('PDB.molstar.mouseout', function () {
      if (state.hover) setHover(null, 'structure');
    });
    host.addEventListener('PDB.molstar.click', function (e) {
      var r = e.eventData && e.eventData.auth_seq_id;
      var m = r ? mutationAt(r) : null;
      if (m) setSelected(m.id);
    });
  }

  function mutationAt(resNum) {
    // Prefer point mutations over the deletion range when both cover a residue.
    var hit = null;
    state.muts.forEach(function (m) {
      if (!isVisible(m) || resNum < m.start || resNum > m.end) return;
      if (!hit || (m.end - m.start) < (hit.end - hit.start)) hit = m;
    });
    return hit;
  }

  function residueQuery(start, end, extra) {
    var q = {
      auth_asym_id: CFG.structure.chain,
      start_auth_residue_number: start,
      end_auth_residue_number: end
    };
    Object.keys(extra || {}).forEach(function (k) { q[k] = extra[k]; });
    return q;
  }

  function enqueue(fn) {
    queue = queue.then(fn).catch(function (err) { console.warn('Viewer update failed:', err); });
    return queue;
  }

  /** Colour the structure for the current filters and selection. */
  function apply3D() {
    if (!viewerReady) return;
    var sel = state.selected ? byId(state.selected) : null;
    var st = CFG.structure;
    var data = [];

    if (sel && LIB.isTruncating(sel) && sel.start < st.modelled[1]) {
      data.push(residueQuery(Math.max(sel.start + 1, st.modelled[0]), st.modelled[1], { color: LOST }));
    }

    // Draw longer ranges first so point mutations inside them stay visible.
    var onStructure = state.muts.filter(function (m) {
      return isVisible(m) && m.structure.code !== 'outside' && m.structure.code !== 'unresolved';
    }).sort(function (a, b) { return (b.end - b.start) - (a.end - a.start); });

    onStructure.forEach(function (m) {
      if (sel && m.id === sel.id) return;
      data.push(residueQuery(m.start, m.end, { color: hexToRgb(TYPE[m.type].color) }));
    });

    var focusOnSel = sel && onStructure.some(function (m) { return m.id === sel.id; });
    if (focusOnSel) {
      data.push(residueQuery(sel.start, sel.end, {
        color: hexToRgb(TYPE[sel.type].color),
        sideChain: sel.end - sel.start < 3,
        focus: true
      }));
    }

    enqueue(function () {
      return Promise.resolve(viewer.visual.clearSelection()).then(function () {
        if (!data.length) return null;
        return viewer.visual.select({ data: data, nonSelectedColor: GREY });
      }).then(function () {
        if (!focusOnSel) return viewer.visual.reset({ camera: true });
        return null;
      });
    });
  }

  function hover3D(m) {
    if (!viewerReady) return;
    enqueue(function () {
      if (!m || m.structure.code === 'outside' || m.structure.code === 'unresolved') {
        return viewer.visual.clearHighlight();
      }
      return viewer.visual.highlight({ data: [residueQuery(m.start, m.end)], color: hexToRgb('#FFB000') });
    });
  }

  // ---------------------------------------------------------------- cartoon

  var W = 1200, H = 390, ML = 50, MR = 60;
  var TY = 185, KTOP = 158, KBOT = 212;
  var ROWS = [
    { side: 'above', y: 118 }, { side: 'below', y: 262 },
    { side: 'above', y: 80 }, { side: 'below', y: 300 },
    { side: 'above', y: 42 }, { side: 'below', y: 338 }
  ];
  var cartoon = {};

  function x(pos) { return ML + ((pos - 1) / (CFG.protein.length - 1)) * (W - ML - MR); }

  var kinase = CFG.regions[0];
  var disordered = CFG.regions[1];
  var WAVE_PERIOD = 30, WAVE_AMP = 7;
  function waveY(px) { return TY + WAVE_AMP * Math.sin(((px - x(disordered.start)) / WAVE_PERIOD) * 2 * Math.PI); }

  function anchorFor(m, side) {
    var mid = (m.start + m.end) / 2;
    var px = x(mid);
    if (mid >= kinase.start && mid <= kinase.end) return { x: px, y: side === 'above' ? KTOP : KBOT };
    if (mid >= disordered.start) return { x: px, y: waveY(px) };
    return { x: px, y: TY };
  }

  function textWidth(s) { return s.length * 6.7 + 6; }

  /** Assign each label to a row and spread labels within rows so they do not overlap. */
  function layoutLabels(muts) {
    var GAP = 10;
    var rows = ROWS.map(function () { return []; });
    muts.forEach(function (m) {
      var item = { m: m, w: textWidth(m.label), cx: x((m.start + m.end) / 2) };
      var chosen = -1;
      for (var r = 0; r < rows.length && chosen < 0; r++) {
        var clash = rows[r].some(function (o) { return Math.abs(o.cx - item.cx) < (o.w + item.w) / 2 + GAP; });
        if (!clash) chosen = r;
      }
      if (chosen < 0) {
        chosen = 0;
        rows.forEach(function (rw, i) { if (rw.length < rows[chosen].length) chosen = i; });
      }
      rows[chosen].push(item);
    });

    var placed = [];
    rows.forEach(function (items, r) {
      items.sort(function (a, b) { return a.cx - b.cx; });
      var pos = items.map(function (it) { return it.cx; });
      for (var i = 1; i < items.length; i++) {
        pos[i] = Math.max(pos[i], pos[i - 1] + (items[i - 1].w + items[i].w) / 2 + GAP);
      }
      for (var j = items.length - 1; j >= 0; j--) {
        var limit = j === items.length - 1 ? W - 4 - items[j].w / 2 : pos[j + 1] - (items[j].w + items[j + 1].w) / 2 - GAP;
        pos[j] = Math.min(pos[j], limit);
        pos[j] = Math.max(pos[j], 4 + items[j].w / 2);
      }
      items.forEach(function (it, k) {
        placed.push({ m: it.m, row: ROWS[r], lx: pos[k] });
      });
    });
    return placed;
  }

  function drawCartoon() {
    var root = $('#cartoon');
    root.innerHTML = '';
    var s = svg('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': 'Schematic of ' + CFG.protein.gene + ' with variant positions'
    }, root);

    var defs = svg('defs', {}, s);
    var grad = svg('linearGradient', { id: 'kgrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    svg('stop', { offset: '0%', 'stop-color': '#F2F2F2' }, grad);
    svg('stop', { offset: '100%', 'stop-color': '#C9C9C9' }, grad);

    var track = svg('g', { class: 'track' }, s);
    var len = CFG.protein.length;

    // N-terminal tail and linker
    svg('line', { x1: x(1), y1: TY, x2: x(kinase.start), y2: TY, class: 'linker' }, track);
    svg('line', { x1: x(kinase.end), y1: TY, x2: x(disordered.start), y2: TY, class: 'linker' }, track);

    // Disordered region as a wavy tube
    var pts = [];
    for (var px = x(disordered.start); px <= x(disordered.end) + 0.01; px += 2) {
      pts.push(px.toFixed(1) + ',' + waveY(px).toFixed(1));
    }
    var d = 'M' + pts.join(' L');
    svg('path', { d: d, class: 'idr-outer' }, track);
    svg('path', { d: d, class: 'idr-inner' }, track);

    // Kinase domain block
    svg('rect', {
      x: x(kinase.start), y: KTOP, width: x(kinase.end) - x(kinase.start), height: KBOT - KTOP,
      rx: 22, class: 'kinase'
    }, track);
    svg('text', { x: (x(kinase.start) + x(kinase.end)) / 2, y: TY - 4, class: 'region-label', text: kinase.name }, track);
    svg('text', { x: (x(kinase.start) + x(kinase.end)) / 2, y: TY + 13, class: 'region-sub', text: 'aa ' + kinase.start + '–' + kinase.end }, track);

    svg('text', { x: x(1) - 12, y: TY + 5, class: 'terminus', text: 'N' }, track);
    svg('text', { x: x(len) + 14, y: TY + 5, class: 'terminus', text: 'C' }, track);

    // Ruler
    var ruler = svg('g', { class: 'ruler' }, track);
    var ticks = [1];
    for (var t = 100; t < len; t += 100) ticks.push(t);
    ticks.push(len);
    ticks.forEach(function (tk) {
      var tx = x(tk);
      svg('line', { x1: tx, y1: 226, x2: tx, y2: 231 }, ruler);
      if (tk === len || len - tk > 30) svg('text', { x: tx, y: 243, text: String(tk) }, ruler);
    });

    svg('text', {
      x: (x(disordered.start) + x(disordered.end)) / 2, y: 380, class: 'region-sub',
      text: disordered.name + ' (aa ' + disordered.start + '–' + disordered.end + ')'
    }, track);

    cartoon.overlay = svg('g', { class: 'lost-overlay' }, s);
    cartoon.markers = svg('g', { class: 'markers' }, s);
    cartoon.labels = svg('g', { class: 'labels' }, s);
    cartoon.svg = s;
    drawMarkers();
  }

  function drawMarkers() {
    cartoon.markers.innerHTML = '';
    cartoon.labels.innerHTML = '';
    cartoon.nodes = {};
    var placed = layoutLabels(state.muts.filter(isVisible));

    // Range markers (deletions) first so point markers sit on top of them.
    placed.sort(function (p, q) { return (q.m.end - q.m.start) - (p.m.end - p.m.start); });

    placed.forEach(function (p) {
      var m = p.m;
      var a = anchorFor(m, p.row.side);
      var above = p.row.side === 'above';

      // Leader and marker go in one layer, the label in a layer above it,
      // so leaders from outer rows pass behind labels in inner rows.
      var shape = svg('g', { class: 'mut', 'data-id': m.id }, cartoon.markers);
      var label = svg('g', {
        class: 'mut',
        'data-id': m.id,
        tabindex: 0,
        role: 'button',
        'aria-label': m.hgvs + ', ' + TYPE[m.type].label
      }, cartoon.labels);

      svg('line', { x1: a.x, y1: a.y, x2: p.lx, y2: p.row.y + (above ? 8 : -8), class: 'leader' }, shape);
      if (m.type === 'inframe_deletion' && m.end > m.start) {
        svg('rect', { x: x(m.start), y: a.y - 4, width: Math.max(4, x(m.end) - x(m.start)), height: 8, rx: 4, class: 'del-bar' }, shape);
      } else {
        svg('circle', { cx: a.x, cy: a.y, r: 11, class: 'hit' }, shape);
        svg('circle', { cx: a.x, cy: a.y, r: 6.5, class: 'dot' }, shape);
      }
      svg('text', { x: p.lx, y: p.row.y, class: 'mut-label', text: m.label }, label);

      [shape, label].forEach(function (grp) {
        grp.style.setProperty('--c', TYPE[m.type].color);
        grp.addEventListener('mouseenter', function () { setHover(m.id, 'cartoon'); });
        grp.addEventListener('mouseleave', function () { setHover(null, 'cartoon'); });
        grp.addEventListener('click', function () { setSelected(m.id); });
      });
      label.addEventListener('focus', function () { setHover(m.id, 'cartoon'); });
      label.addEventListener('blur', function () { setHover(null, 'cartoon'); });
      label.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(m.id); }
      });
      cartoon.nodes[m.id] = [shape, label];
    });
    updateCartoon();
  }

  function updateCartoon() {
    var sel = state.selected ? byId(state.selected) : null;
    var act = active();
    Object.keys(cartoon.nodes || {}).forEach(function (id) {
      cartoon.nodes[id].forEach(function (n) {
        n.classList.toggle('is-active', !!act && act.id === id);
        n.classList.toggle('is-selected', !!sel && sel.id === id);
        n.classList.toggle('is-dim', !!act && act.id !== id);
      });
    });

    // Show the part of the protein lost to a truncating variant.
    var ov = cartoon.overlay;
    ov.innerHTML = '';
    var tm = act && LIB.isTruncating(act) ? act : null;
    if (tm) {
      var x0 = x(tm.start) + 7;
      var x1 = x(CFG.protein.length) + 22;
      svg('rect', { x: x0, y: KTOP - 14, width: x1 - x0, height: KBOT - KTOP + 28, class: 'lost' }, ov);
      var right = x0 > W * 0.6;
      svg('text', {
        x: right ? x1 - 4 : x0 + 4, y: KTOP - 20,
        class: 'lost-label' + (right ? ' end' : ''),
        text: 'Native residues ' + tm.start + '–' + CFG.protein.length + ' lost'
      }, ov);
    }
  }

  // ------------------------------------------------------------------ table

  function refLink(ref) {
    if (!ref) return document.createTextNode('');
    if (/^\d{5,9}$/.test(ref)) {
      return el('a', { href: 'https://pubmed.ncbi.nlm.nih.gov/' + ref + '/', target: '_blank', rel: 'noopener', text: 'PMID ' + ref });
    }
    if (/^10\.\d{4,9}\//.test(ref)) {
      return el('a', { href: 'https://doi.org/' + ref, target: '_blank', rel: 'noopener', text: ref });
    }
    return document.createTextNode(ref);
  }

  function clinvarLink(m) {
    if (m.clinvar) {
      var id = m.clinvar.replace(/^VCV0*/i, '').replace(/\..*$/, '');
      return el('a', { href: 'https://www.ncbi.nlm.nih.gov/clinvar/variation/' + id + '/', target: '_blank', rel: 'noopener', text: m.clinvar });
    }
    var term = CFG.protein.gene + '[gene] AND "' + m.hgvs + '"';
    return el('a', { href: 'https://www.ncbi.nlm.nih.gov/clinvar/?term=' + encodeURIComponent(term), target: '_blank', rel: 'noopener', class: 'muted', text: 'Search' });
  }

  function chip(type) {
    var c = el('span', { class: 'chip', text: TYPE[type].label });
    c.style.setProperty('--c', TYPE[type].color);
    return c;
  }

  function drawTable() {
    var tbody = $('#mut-table tbody');
    tbody.innerHTML = '';
    var shown = 0;
    state.muts.forEach(function (m) {
      if (!isVisible(m)) return;
      shown++;
      var tr = el('tr', { 'data-id': m.id, tabindex: 0 }, tbody);
      var c0 = el('td', {}, tr);
      el('span', { class: 'hgvs', text: m.hgvs }, c0);
      if (!m.refOk) el('span', { class: 'warn', title: 'Reference amino acid does not match ' + CFG.protein.isoform, text: ' ⚠' }, c0);
      el('td', {}, tr).appendChild(chip(m.type));
      el('td', { class: 'num', text: m.start === m.end ? String(m.start) : m.start + '–' + m.end }, tr);
      el('td', { text: m.region }, tr);
      el('td', { text: m.structure.text }, tr);
      el('td', {}, tr).appendChild(clinvarLink(m));
      el('td', {}, tr).appendChild(refLink(m.reference));
      el('td', { text: m.note }, tr);

      tr.addEventListener('mouseenter', function () { setHover(m.id, 'table'); });
      tr.addEventListener('mouseleave', function () { setHover(null, 'table'); });
      tr.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        setSelected(m.id);
      });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); setSelected(m.id); }
      });
    });
    $('#table-count').textContent = shown + ' of ' + state.muts.length + ' variants shown';
    updateTable();
  }

  function updateTable() {
    var act = active();
    document.querySelectorAll('#mut-table tbody tr').forEach(function (tr) {
      var id = tr.getAttribute('data-id');
      tr.classList.toggle('is-active', !!act && act.id === id);
      tr.classList.toggle('is-selected', state.selected === id);
    });
  }

  // ---------------------------------------------------------------- details

  function updateDetails() {
    var box = $('#details');
    var m = active();
    box.innerHTML = '';
    if (!m) {
      el('p', { class: 'muted', text: 'Hover over or click a variant in the schematic, the structure or the table.' }, box);
      return;
    }
    var head = el('div', { class: 'details-head' }, box);
    el('h3', { text: m.hgvs }, head);
    head.appendChild(chip(m.type));
    var dl = el('dl', {}, box);
    function row(k, v) {
      el('dt', { text: k }, dl);
      var dd = el('dd', {}, dl);
      if (typeof v === 'string') dd.textContent = v; else dd.appendChild(v);
    }
    row('Position', m.start === m.end ? 'Residue ' + m.start : 'Residues ' + m.start + '–' + m.end);
    row('Region', m.region);
    row('Predicted effect', m.effect);
    row('3D structure', m.structure.code === 'outside'
      ? 'Outside the crystal structure (' + CFG.structure.pdb.toUpperCase() + ' covers residues ' + CFG.structure.modelled[0] + '–' + CFG.structure.modelled[1] + ').'
      : m.structure.text + '.');
    row('ClinVar', clinvarLink(m));
    if (m.reference) row('Reference', refLink(m.reference));
    if (m.note) row('Note', m.note);
    if (state.selected === m.id) {
      var b = el('button', { type: 'button', class: 'link-btn', text: 'Clear selection' }, box);
      b.addEventListener('click', function () { setSelected(null); });
    }
  }

  // ------------------------------------------------------------ interaction

  function setHover(id, source) {
    if (state.hover === id) return;
    state.hover = id;
    updateCartoon();
    updateTable();
    updateDetails();
    if (source !== 'structure') hover3D(id ? byId(id) : null);
  }

  function setSelected(id) {
    state.selected = state.selected === id ? null : id;
    // Keep the URL in sync so a link can open the page on one variant, e.g. #p.Arg59Ter
    var m = state.selected ? byId(state.selected) : null;
    history.replaceState(null, '', m ? '#' + m.hgvs : location.pathname + location.search);
    updateCartoon();
    updateTable();
    updateDetails();
    apply3D();
  }

  function selectFromHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (!h) return;
    var norm = function (s) { return s.replace(/^p\./, '').toLowerCase(); };
    var m = state.muts.filter(function (x) { return norm(x.hgvs) === norm(h); })[0];
    if (m) {
      state.selected = null;
      setSelected(m.id);
    }
  }

  function drawFilters() {
    var box = $('#filters');
    box.innerHTML = '';
    CFG.types.forEach(function (t) {
      var n = state.muts.filter(function (m) { return m.type === t.key; }).length;
      if (!n) return;
      var lab = el('label', { class: 'filter' }, box);
      var cb = el('input', { type: 'checkbox', value: t.key }, lab);
      cb.checked = state.visible.has(t.key);
      var sw = el('span', { class: t.key === 'inframe_deletion' ? 'swatch bar' : 'swatch' }, lab);
      sw.style.setProperty('--c', t.color);
      el('span', { text: t.label + ' (' + n + ')' }, lab);
      cb.addEventListener('change', function () {
        if (cb.checked) state.visible.add(t.key); else state.visible.delete(t.key);
        var sel = state.selected ? byId(state.selected) : null;
        if (sel && !isVisible(sel)) state.selected = null;
        state.hover = null;
        drawMarkers();
        drawTable();
        updateDetails();
        apply3D();
      });
    });
  }

  function fillStaticText() {
    document.querySelectorAll('[data-cfg]').forEach(function (node) {
      var path = node.getAttribute('data-cfg').split('.');
      var v = CFG;
      path.forEach(function (k) { v = v == null ? v : v[k]; });
      if (v == null) return;
      if (Array.isArray(v)) v = v.join('–');
      if (path[path.length - 1] === 'pdb') v = String(v).toUpperCase();
      node.textContent = v;
    });
  }

  // ------------------------------------------------------------------- boot

  function start() {
    fillStaticText();
    $('#pdb-link').href = 'https://www.ebi.ac.uk/pdbe/entry/pdb/' + CFG.structure.pdb;
    fetch(CFG.dataUrl, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (text) {
        state.muts = buildMutations(LIB.parseCSV(text));
        drawFilters();
        drawCartoon();
        drawTable();
        updateDetails();
        selectFromHash();
        initViewer();
      })
      .catch(function (err) {
        console.error(err);
        $('#cartoon').innerHTML = '<p class="viewer-error">Could not load ' + CFG.dataUrl +
          '. If you opened this file directly, serve the folder with a local web server instead (see README).</p>';
      });

    // Clearing the selection also resets the 3D camera (see apply3D).
    $('#reset-view').addEventListener('click', function () { setSelected(null); });
    window.addEventListener('hashchange', selectFromHash);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

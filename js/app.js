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

  /** Whether a variant has a residue position (and so can be drawn on the protein). */
  function onProtein(m) { return TYPE[m.type].onProtein !== false; }

  function buildMutations(rows) {
    var out = [];
    rows.forEach(function (r, i) {
      var type = (r.type || '').toLowerCase().replace(/[\s-]+/g, '_');
      if (type && !TYPE[type]) type = '';
      var p;
      if (type && TYPE[type].onProtein === false) {
        // Chromosomal change with no residue position, e.g. "Xp22.13 deletion".
        p = { type: type, start: null, end: null, refs: [] };
      } else {
        p = LIB.parseHgvs(r.hgvs);
        if (!p) {
          console.warn('Could not parse HGVS name, row skipped:', r.hgvs);
          return;
        }
        if (type) p.type = type;
      }
      p.id = 'm' + i;
      p.hgvs = r.hgvs;
      p.label = r.hgvs.replace(/^p\./, '');
      p.clinvar = r.clinvar || '';
      p.references = (r.reference || '').split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      p.note = r.note || '';
      if (onProtein(p)) {
        p.region = LIB.regionOf(p.start, CFG);
        p.structure = LIB.structureStatus(p.start, p.end, CFG.structure);
        p.effect = LIB.describe(p, CFG);
        p.refOk = LIB.checkRef(p, CFG.protein.sequence);
        if (!p.refOk) console.warn('Reference amino acid does not match ' + CFG.protein.isoform + ':', r.hgvs);
      } else {
        p.region = 'Chromosomal';
        p.structure = { code: 'outside', text: 'Not a protein-level change' };
        p.effect = 'Chromosomal microdeletion affecting the ' + CFG.protein.gene + ' locus. It has no single residue position, so it is not drawn on the structure or the schematic.';
        p.refOk = true;
      }
      out.push(p);
    });
    // Variants without a residue position go last.
    out.sort(function (a, b) {
      if (a.start === null || b.start === null) return (a.start === null) - (b.start === null);
      return a.start - b.start || a.end - b.end;
    });
    return out;
  }

  /** Map of DOI (lower case) to short citation text, from references.csv. */
  var CITATIONS = {};

  function loadReferences(rows) {
    rows.forEach(function (r) {
      if (r.doi && r.citation) CITATIONS[r.doi.toLowerCase()] = r.citation;
    });
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
      if (!isVisible(m) || !onProtein(m) || resNum < m.start || resNum > m.end) return;
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

  // Layout, top to bottom: angled variant labels, leader elbows, protein,
  // region names, functional sites track, shared residue axis.
  var W = 1200, H = 352, ML = 50, MR = 60;
  var LABEL_Y = 112;   // where each leader ends and its label starts
  var ELBOW_Y = 140;   // top of the vertical part of each leader
  var TY = 180, KTOP = 167, KBOT = 193;
  var REGION_Y = 216;  // region names under the protein
  var LOST_Y = 234;    // "residues lost" note for truncating variants
  var FY = 266;        // functional sites track
  var AXIS_Y = 322;    // shared residue axis
  var SLOT = 19;       // minimum spacing between label slots
  var cartoon = {};

  function x(pos) { return ML + ((pos - 1) / (CFG.protein.length - 1)) * (W - ML - MR); }

  var kinase = CFG.regions[0];
  var disordered = CFG.regions[1];

  function anchorFor(m) {
    var mid = (m.start + m.end) / 2;
    var px = x(mid);
    if (mid >= kinase.start && mid <= kinase.end) return { x: px, y: KTOP };
    return { x: px, y: TY };
  }

  function textWidth(s) { return s.length * 6.7 + 6; }

  /** Give each variant a label slot above the protein, in sequence order, at least SLOT apart. */
  function layoutLabels(muts) {
    var items = muts.map(function (m) { return { m: m, cx: x((m.start + m.end) / 2) }; });
    items.sort(function (a, b) { return a.cx - b.cx || a.m.start - b.m.start; });
    var pos = items.map(function (it) { return it.cx; });
    var right = W - 70; // leave room for the last angled label
    for (var i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + SLOT);
    for (var j = pos.length - 1; j >= 0; j--) {
      pos[j] = Math.min(pos[j], j === pos.length - 1 ? right : pos[j + 1] - SLOT);
    }
    for (var k = 0; k < pos.length; k++) pos[k] = Math.max(pos[k], k === 0 ? 8 : pos[k - 1] + SLOT);
    return items.map(function (it, n) { return { m: it.m, lx: pos[n] }; });
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

    // Disordered region as a straight tube
    var d = 'M' + x(disordered.start) + ',' + TY + ' H' + x(disordered.end);
    svg('path', { d: d, class: 'idr-outer' }, track);
    svg('path', { d: d, class: 'idr-inner' }, track);

    // Kinase domain block (hovering it shows the domain's source)
    var kblock = svg('rect', {
      x: x(kinase.start), y: KTOP, width: x(kinase.end) - x(kinase.start), height: KBOT - KTOP,
      rx: (KBOT - KTOP) / 2, class: 'kinase'
    }, track);
    var kfeat = featureByKey('kinase');
    if (kfeat) bindFeature(kblock, kfeat, false);

    svg('text', { x: x(1) - 12, y: TY + 5, class: 'terminus', text: 'N' }, track);
    svg('text', { x: x(len) + 14, y: TY + 5, class: 'terminus', text: 'C' }, track);

    // Region names under the protein
    svg('text', {
      x: (x(kinase.start) + x(kinase.end)) / 2, y: REGION_Y, class: 'region-label',
      text: kinase.name + ' (aa ' + kinase.start + '–' + kinase.end + ')'
    }, track);
    svg('text', {
      x: (x(disordered.start) + x(disordered.end)) / 2, y: REGION_Y, class: 'region-label',
      text: disordered.name + ' (aa ' + disordered.start + '–' + disordered.end + ')'
    }, track);

    // Residue axis at the bottom, shared by the protein and the functional sites
    var ruler = svg('g', { class: 'ruler' }, track);
    svg('line', { x1: x(1), y1: AXIS_Y, x2: x(len), y2: AXIS_Y, class: 'axis' }, ruler);
    var ticks = [1];
    for (var t = 100; t < len; t += 100) ticks.push(t);
    ticks.push(len);
    ticks.forEach(function (tk) {
      var tx = x(tk);
      svg('line', { x1: tx, y1: AXIS_Y, x2: tx, y2: AXIS_Y + 5 }, ruler);
      if (tk === len || len - tk > 30) svg('text', { x: tx, y: AXIS_Y + 18, text: String(tk) }, ruler);
    });

    cartoon.band = svg('g', { class: 'feature-band' }, s);
    cartoon.overlay = svg('g', { class: 'lost-overlay' }, s);
    cartoon.markers = svg('g', { class: 'markers' }, s);
    cartoon.labels = svg('g', { class: 'labels' }, s);
    drawFeatureTrack(s);
    cartoon.svg = s;
    drawMarkers();
  }

  // ------------------------------------------------------- functional sites

  function featureByKey(key) {
    return (CFG.features || []).filter(function (f) { return f.key === key; })[0] || null;
  }

  function segText(f) {
    return f.segments.map(function (sg) { return sg[0] === sg[1] ? String(sg[0]) : sg[0] + '–' + sg[1]; }).join(', ');
  }

  function seqText(f) {
    var seq = CFG.protein.sequence;
    return f.segments.map(function (sg) {
      return sg[0] === sg[1] ? seq.charAt(sg[0] - 1) + sg[0] : seq.slice(sg[0] - 1, sg[1]);
    }).join(', ');
  }

  /** Where a feature can be seen in the crystal structure. */
  function featureStructureText(f) {
    var codes = f.segments.map(function (sg) { return LIB.structureStatus(sg[0], sg[1], CFG.structure); });
    if (codes.every(function (c) { return c.code === 'shown'; })) return codes[0].text;
    if (codes.every(function (c) { return c.code === 'outside'; })) return 'Not in structure';
    if (codes.every(function (c) { return c.code === 'unresolved'; })) return codes[0].text;
    return 'Partly resolved in ' + CFG.structure.pdb.toUpperCase();
  }

  /** Features (other than the kinase domain itself) overlapping a residue range. */
  function featuresIn(start, end) {
    return (CFG.features || []).filter(function (f) {
      return f.key !== 'kinase' && f.segments.some(function (sg) { return sg[0] <= end && sg[1] >= start; });
    });
  }

  var tip = null;

  function showTip(f, evt, anchor) {
    if (!tip) tip = el('div', { class: 'tip', role: 'tooltip' }, document.body);
    tip.innerHTML = '';
    el('div', { class: 'tip-title', text: f.label }, tip);
    el('div', { class: 'tip-meta', text: 'Residues ' + segText(f) + ' · ' + seqText(f) }, tip);
    el('div', { class: 'tip-meta', text: '3D structure: ' + featureStructureText(f) }, tip);
    el('p', { text: f.evidence }, tip);
    el('div', { class: 'tip-head', text: f.sources.length > 1 ? 'Sources' : 'Source' }, tip);
    var ul = el('ul', {}, tip);
    f.sources.forEach(function (k) {
      var src = CFG.featureSources[k];
      if (src) el('li', { text: src.citation }, ul);
    });
    tip.style.display = 'block';
    var px, py;
    if (evt && evt.clientX !== undefined) { px = evt.clientX + 14; py = evt.clientY + 14; } else {
      var r = anchor.getBoundingClientRect(); px = r.left; py = r.bottom + 8;
    }
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (px + w > window.innerWidth - 8) px = Math.max(8, window.innerWidth - w - 8);
    if (py + h > window.innerHeight - 8) py = Math.max(8, py - h - 28);
    tip.style.left = px + 'px';
    tip.style.top = py + 'px';
  }

  function hideTip() { if (tip) tip.style.display = 'none'; }

  /** Shade the feature on the schematic and highlight it in 3D. */
  function hoverFeature(f) {
    cartoon.band.innerHTML = '';
    if (f && f.key !== 'kinase') {
      f.segments.forEach(function (sg) {
        var x0 = x(sg[0]) - 2, x1 = x(sg[1]) + 2;
        svg('rect', { x: x0, y: ELBOW_Y, width: Math.max(4, x1 - x0), height: FY + 10 - ELBOW_Y, class: 'band' }, cartoon.band);
      });
    }
    if (!viewerReady) return;
    enqueue(function () {
      if (!f) {
        var m = active();
        if (m && m.structure.code !== 'outside' && m.structure.code !== 'unresolved') {
          return viewer.visual.highlight({ data: [residueQuery(m.start, m.end)], color: hexToRgb('#FFB000') });
        }
        return viewer.visual.clearHighlight();
      }
      var st = CFG.structure;
      var data = f.segments.filter(function (sg) {
        return LIB.structureStatus(sg[0], sg[1], st).code !== 'outside';
      }).map(function (sg) {
        return residueQuery(Math.max(sg[0], st.modelled[0]), Math.min(sg[1], st.modelled[1]));
      });
      if (!data.length) return viewer.visual.clearHighlight();
      return viewer.visual.highlight({ data: data, color: hexToRgb('#FFB000') });
    });
  }

  function bindFeature(node, f, focusable) {
    if (focusable) {
      node.setAttribute('tabindex', 0);
      node.setAttribute('role', 'img');
      node.setAttribute('aria-label', f.label + ', residues ' + segText(f));
    }
    node.addEventListener('mouseenter', function (e) { showTip(f, e); hoverFeature(f); });
    node.addEventListener('mousemove', function (e) { showTip(f, e); });
    node.addEventListener('mouseleave', function () { hideTip(); hoverFeature(null); });
    node.addEventListener('focus', function () { showTip(f, null, node); hoverFeature(f); });
    node.addEventListener('blur', function () { hideTip(); hoverFeature(null); });
  }

  function drawFeatureTrack(s) {
    var feats = (CFG.features || []).filter(function (f) { return f.track !== false; });
    if (!feats.length) return;
    var g = svg('g', { class: 'features' }, s);
    svg('text', { x: x(1), y: FY - 16, class: 'track-title', text: 'Functional sites' }, g);
    svg('line', { x1: x(1), y1: FY, x2: x(CFG.protein.length), y2: FY, class: 'track-base' }, g);

    // Labels in up to two rows below the track, so neighbouring labels do not overlap.
    var rowsEnd = [-Infinity, -Infinity];
    feats.slice().sort(function (a, b) { return a.segments[0][0] - b.segments[0][0]; }).forEach(function (f) {
      var grp = svg('g', { class: 'feature' }, g);
      f.segments.forEach(function (sg) {
        var x0 = x(sg[0]) - 2, x1 = x(sg[1]) + 2;
        svg('rect', { x: x0, y: FY - 8, width: Math.max(5, x1 - x0), height: 16, rx: 2, class: 'feature-bar' }, grp);
      });
      var first = f.segments[0], last = f.segments[f.segments.length - 1];
      var cx = (x(first[0]) + x(last[1])) / 2;
      var w = textWidth(f.short);
      var row = cx - w / 2 > rowsEnd[0] + 6 ? 0 : 1;
      rowsEnd[row] = cx + w / 2;
      svg('text', { x: cx, y: FY + 22 + row * 14, class: 'feature-label', text: f.short }, grp);
      // Generous invisible hit area so small sites are easy to hover.
      svg('rect', {
        x: Math.min(x(first[0]), cx - w / 2) - 6, y: FY - 12,
        width: Math.max(x(last[1]) - x(first[0]), w) + 12, height: 42 + row * 14, class: 'feature-hit'
      }, grp);
      bindFeature(grp, f, true);
    });
  }

  function drawSources() {
    var box = $('#feature-sources');
    if (!box || !CFG.features) return;
    var tbody = box.querySelector('tbody');
    tbody.innerHTML = '';
    CFG.features.forEach(function (f) {
      var tr = el('tr', {}, tbody);
      el('td', { text: f.label }, tr);
      el('td', { class: 'num', text: segText(f) }, tr);
      el('td', { class: 'hgvs', text: f.segments.length === 1 && f.segments[0][1] - f.segments[0][0] > 20 ? '' : seqText(f) }, tr);
      el('td', { class: 'wrap-cell', text: f.evidence }, tr);
      var td = el('td', { class: 'refs-cell' }, tr);
      f.sources.forEach(function (k, i) {
        var src = CFG.featureSources[k];
        if (!src) return;
        if (i) td.appendChild(document.createTextNode('; '));
        el('a', { href: src.url, target: '_blank', rel: 'noopener', text: src.citation }, td);
      });
    });
    var h = CFG.featureSources.hector2017;
    var note = $('#feature-sources-note');
    if (h && note) {
      note.textContent = 'The choice of features follows Figure 2 of ';
      el('a', { href: h.url, target: '_blank', rel: 'noopener', text: h.citation }, note);
      note.appendChild(document.createTextNode(
        ', which shows these sites without residue numbers. Positions are on ' + CFG.protein.isoform +
        '. Rusconi et al. 2008 numbered residues on the 1030 aa isoform, which is identical to ' +
        CFG.protein.isoform + ' up to residue 904.'));
    }
  }

  function drawMarkers() {
    cartoon.markers.innerHTML = '';
    cartoon.labels.innerHTML = '';
    cartoon.nodes = {};
    var placed = layoutLabels(state.muts.filter(function (m) { return isVisible(m) && onProtein(m); }));

    // Range markers (deletions) first so point markers sit on top of them.
    placed.sort(function (p, q) { return (q.m.end - q.m.start) - (p.m.end - p.m.start); });

    placed.forEach(function (p) {
      var m = p.m;
      var a = anchorFor(m);

      // Leader and marker go in one layer, the label in a layer above it.
      var shape = svg('g', { class: 'mut', 'data-id': m.id }, cartoon.markers);
      var label = svg('g', {
        class: 'mut',
        'data-id': m.id,
        tabindex: 0,
        role: 'button',
        'aria-label': m.hgvs + ', ' + TYPE[m.type].label
      }, cartoon.labels);

      // Vertical segment up from the marker, then an angled segment to the label slot.
      svg('path', { d: 'M' + a.x + ',' + a.y + ' V' + ELBOW_Y + ' L' + p.lx + ',' + LABEL_Y, class: 'leader' }, shape);
      if (m.type === 'inframe_deletion' && m.end > m.start) {
        svg('rect', { x: x(m.start), y: a.y - 4, width: Math.max(4, x(m.end) - x(m.start)), height: 8, rx: 4, class: 'del-bar' }, shape);
      } else {
        svg('circle', { cx: a.x, cy: a.y, r: 11, class: 'hit' }, shape);
        svg('circle', { cx: a.x, cy: a.y, r: 6.5, class: 'dot' }, shape);
      }
      svg('text', {
        x: p.lx + 4, y: LABEL_Y - 4, class: 'mut-label', text: m.label,
        transform: 'rotate(-45 ' + p.lx + ' ' + LABEL_Y + ')'
      }, label);

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
      // Covers the protein and the functional sites that are lost with it.
      svg('rect', { x: x0, y: KTOP - 10, width: x1 - x0, height: FY + 12 - (KTOP - 10), class: 'lost' }, ov);
      var right = x0 > W * 0.6;
      svg('text', {
        x: right ? x1 - 4 : x0 + 4, y: LOST_Y,
        class: 'lost-label' + (right ? ' end' : ''),
        text: 'Native residues ' + tm.start + '–' + CFG.protein.length + ' lost'
      }, ov);
    }
  }

  // ------------------------------------------------------------------ table

  function refLink(ref) {
    if (/^\d{5,9}$/.test(ref)) {
      return el('a', { href: 'https://pubmed.ncbi.nlm.nih.gov/' + ref + '/', target: '_blank', rel: 'noopener', text: 'PMID ' + ref });
    }
    if (/^10\.\d{4,9}\//.test(ref)) {
      var cite = CITATIONS[ref.toLowerCase()];
      return el('a', { href: 'https://doi.org/' + ref, target: '_blank', rel: 'noopener', title: cite ? 'doi:' + ref : null, text: cite || ref });
    }
    return document.createTextNode(ref);
  }

  /** All references for a variant, separated by semicolons. */
  function refList(m) {
    var span = el('span', { class: 'refs' });
    m.references.forEach(function (ref, i) {
      if (i) span.appendChild(document.createTextNode('; '));
      span.appendChild(refLink(ref));
    });
    return span;
  }

  function clinvarLink(m) {
    if (!onProtein(m) && !m.clinvar) return document.createTextNode('');
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
      el('td', { class: 'num', text: !onProtein(m) ? '' : m.start === m.end ? String(m.start) : m.start + '–' + m.end }, tr);
      el('td', { text: m.region }, tr);
      el('td', { text: m.structure.text }, tr);
      el('td', {}, tr).appendChild(clinvarLink(m));
      el('td', { class: 'refs-cell' }, tr).appendChild(refList(m));
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
    if (onProtein(m)) {
      row('Position', m.start === m.end ? 'Residue ' + m.start : 'Residues ' + m.start + '–' + m.end);
      row('Region', m.region);
      var fs = featuresIn(m.start, m.end);
      if (fs.length) {
        row('Functional site', fs.map(function (f) { return f.label + ' (' + segText(f) + ')'; }).join('; '));
      }
      row('Predicted effect', m.effect);
      row('3D structure', m.structure.code === 'outside'
        ? 'Outside the crystal structure (' + CFG.structure.pdb.toUpperCase() + ' covers residues ' + CFG.structure.modelled[0] + '–' + CFG.structure.modelled[1] + ').'
        : m.structure.text + '.');
      row('ClinVar', clinvarLink(m));
    } else {
      row('Effect', m.effect);
      if (m.clinvar) row('ClinVar', clinvarLink(m));
    }
    if (m.references.length) {
      var ul = el('ul', { class: 'ref-list' });
      m.references.forEach(function (ref) { el('li', {}, ul).appendChild(refLink(ref)); });
      row(m.references.length > 1 ? 'References' : 'Reference', ul);
    }
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
    drawSources();
    $('#pdb-link').href = 'https://www.ebi.ac.uk/pdbe/entry/pdb/' + CFG.structure.pdb;
    function getText(url) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
        return r.text();
      });
    }
    // The page still works without references.csv; DOIs are then shown as-is.
    var refs = CFG.referencesUrl
      ? getText(CFG.referencesUrl).catch(function (err) { console.warn('References not loaded:', err); return ''; })
      : Promise.resolve('');
    Promise.all([getText(CFG.dataUrl), refs])
      .then(function (texts) {
        loadReferences(LIB.parseCSV(texts[1]));
        state.muts = buildMutations(LIB.parseCSV(texts[0]));
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

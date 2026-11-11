/*
 * Pure helper functions: CSV parsing, HGVS protein parsing and annotation.
 * No DOM access here, so this file can also be tested with Node.
 */
(function (root) {
  'use strict';

  var AA3 = '(Ala|Arg|Asn|Asp|Cys|Gln|Glu|Gly|His|Ile|Leu|Lys|Met|Phe|Pro|Ser|Thr|Trp|Tyr|Val|Sec)';
  var STOP = '(?:Ter|\\*|X)';
  var ONE = {
    Ala: 'A', Arg: 'R', Asn: 'N', Asp: 'D', Cys: 'C', Gln: 'Q', Glu: 'E', Gly: 'G', His: 'H', Ile: 'I',
    Leu: 'L', Lys: 'K', Met: 'M', Phe: 'F', Pro: 'P', Ser: 'S', Thr: 'T', Trp: 'W', Tyr: 'Y', Val: 'V', Sec: 'U'
  };

  var RE = {
    delRange: new RegExp('^' + AA3 + '(\\d+)_' + AA3 + '(\\d+)del$'),
    delOne: new RegExp('^' + AA3 + '(\\d+)del$'),
    frameshift: new RegExp('^' + AA3 + '(\\d+)(?:' + AA3 + ')?fs(?:' + STOP + '(\\d+))?$'),
    nonsense: new RegExp('^' + AA3 + '(\\d+)' + STOP + '$'),
    missense: new RegExp('^' + AA3 + '(\\d+)' + AA3 + '$')
  };

  /** Parse a protein HGVS name such as p.Arg59Ter. Returns null if not recognised. */
  function parseHgvs(raw) {
    var s = String(raw || '').trim().replace(/^p\./, '').replace(/[()]/g, '');
    var m;
    if ((m = s.match(RE.delRange))) {
      return { type: 'inframe_deletion', start: +m[2], end: +m[4], refs: [[m[1], +m[2]], [m[3], +m[4]]] };
    }
    if ((m = s.match(RE.delOne))) {
      return { type: 'inframe_deletion', start: +m[2], end: +m[2], refs: [[m[1], +m[2]]] };
    }
    if ((m = s.match(RE.frameshift))) {
      return { type: 'frameshift', start: +m[2], end: +m[2], ter: m[4] ? +m[4] : null, refs: [[m[1], +m[2]]] };
    }
    if ((m = s.match(RE.nonsense))) {
      return { type: 'nonsense', start: +m[2], end: +m[2], refs: [[m[1], +m[2]]] };
    }
    if ((m = s.match(RE.missense))) {
      return { type: 'missense', start: +m[2], end: +m[2], alt: m[3], refs: [[m[1], +m[2]]] };
    }
    return null;
  }

  /** Check the reference amino acids in the HGVS name against the sequence. */
  function checkRef(parsed, sequence) {
    if (!sequence) return true;
    return parsed.refs.every(function (r) {
      return sequence.charAt(r[1] - 1) === ONE[r[0]];
    });
  }

  function isTruncating(mut) {
    return mut.type === 'nonsense' || mut.type === 'frameshift';
  }

  function regionOf(pos, cfg) {
    for (var i = 0; i < cfg.regions.length; i++) {
      var r = cfg.regions[i];
      if (pos >= r.start && pos <= r.end) return r.name;
    }
    if (pos < cfg.regions[0].start) return 'N-terminus';
    return 'Inter-domain linker';
  }

  /** Whether a residue range can be shown on the crystal structure. */
  function structureStatus(start, end, st) {
    if (end < st.modelled[0] || start > st.modelled[1]) {
      return { code: 'outside', text: 'Not in structure' };
    }
    var shown = 0, total = 0;
    for (var p = start; p <= end; p++) {
      total++;
      var inRange = p >= st.modelled[0] && p <= st.modelled[1];
      var inGap = st.gaps.some(function (g) { return p >= g[0] && p <= g[1]; });
      if (inRange && !inGap) shown++;
    }
    if (shown === 0) return { code: 'unresolved', text: 'Unresolved in ' + st.pdb.toUpperCase() };
    if (shown < total) return { code: 'partial', text: 'Partly resolved in ' + st.pdb.toUpperCase() };
    return { code: 'shown', text: 'Shown on ' + st.pdb.toUpperCase() };
  }

  /** Plain-language description of the predicted consequence. */
  function describe(mut, cfg) {
    var len = cfg.protein.length;
    var lostPct = Math.round(((len - mut.start + 1) / len) * 100);
    switch (mut.type) {
      case 'missense':
        return 'Single amino acid substitution at residue ' + mut.start + '.';
      case 'nonsense':
        return 'Premature stop at codon ' + mut.start + '. Residues ' + mut.start + '–' + len +
          ' (' + lostPct + '% of the protein) are not made.';
      case 'frameshift': {
        var txt = 'Reading frame shifts at codon ' + mut.start + '. ';
        if (mut.ter === 1) {
          txt += 'The first codon of the new frame is a stop codon. ';
        } else if (mut.ter) {
          txt += 'The new frame reaches a stop codon at codon ' + (mut.start + mut.ter - 1) +
            ' (' + (mut.ter - 1) + ' altered residues). ';
        }
        return txt + 'Native residues ' + mut.start + '–' + len + ' (' + lostPct + '%) are lost.';
      }
      case 'inframe_deletion': {
        var n = mut.end - mut.start + 1;
        return n === 1
          ? 'Residue ' + mut.start + ' deleted. The rest of the protein stays in frame.'
          : 'Residues ' + mut.start + '–' + mut.end + ' (' + n + ' aa) deleted. The rest of the protein stays in frame.';
      }
      default:
        return '';
    }
  }

  /** Minimal RFC 4180 CSV parser. Lines whose first cell starts with # are ignored. */
  function parseCSV(text) {
    var rows = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        quoted = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    rows = rows.filter(function (r) {
      return r.some(function (v) { return v.trim() !== ''; }) && r[0].trim().charAt(0) !== '#';
    });
    if (!rows.length) return [];
    var header = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    return rows.map(function (r) {
      var o = {};
      header.forEach(function (h, j) { o[h] = (r[j] || '').trim(); });
      return o;
    });
  }

  var api = {
    parseHgvs: parseHgvs,
    checkRef: checkRef,
    isTruncating: isTruncating,
    regionOf: regionOf,
    structureStatus: structureStatus,
    describe: describe,
    parseCSV: parseCSV
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CDKL5_LIB = api;
})(this);

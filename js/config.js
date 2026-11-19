/*
 * Site configuration. Edit this file to change the protein annotation,
 * the structure shown or the colours. Mutations live in data/mutations.csv.
 */
window.CDKL5_CONFIG = {
  title: 'CDKL5 clinical variants',
  lastUpdated: '2026-11-19',

  protein: {
    gene: 'CDKL5',
    isoform: 'CDKL5_1',
    transcript: 'NM_001323289.2',
    uniprot: 'O76039',
    length: 960,
    // Isoform CDKL5_1 (960 aa). Used to check that the reference amino acid
    // in each HGVS name matches the sequence.
    sequence:
      'MKIPNIGNVMNKFEILGVVGEGAYGVVLKCRHKETHEIVAIKKFKDSEENEEVKETTLRELKMLRTLKQENIVELKEAF' +
      'RRRGKLYLVFEYVEKNMLELLEEMPNGVPPEKVKSYIYQLIKAIHWCHKNDIVHRDIKPENLLISHNDVLKLCDFGFARN' +
      'LSEGNNANYTEYVATRWYRSPELLLGAPYGKSVDMWSVGCILGELSDGQPLFPGESEIDQLFTIQKVLGPLPSEQMKLFY' +
      'SNPRFHGLRFPAVNHPQSLERRYLGILNSVLLDLMKNLLKLDPADRYLTEQCLNHPTFQTQRLLDRSPSRSAKRKPYHVE' +
      'SSTLSNRNQAGKSTALQSHHRSNSKDIQNLSVGLPRADEGLPANESFLNGNLAGASLSPLHTKTYQASSQPGSTSKDLTN' +
      'NNIPHLLSPKEAKSKTEFDFNIDPKPSEGPGTKYLKSNSRSQQNRHSFMESSQSKAGTLQPNEKQSRHSYIDTIPQSSRS' +
      'PSYRTKAKSHGALSDSKSVSNLSEARAQIAEPSTSRYFPSSCLDLNSPTSPTPTRHSDTRTLLSPSGRNNRNEGTLDSRR' +
      'TTTRHSKTMEELKLPEHMDSSHSHSLSAPHESFSYGLGYTSPFSSQQRPHRHSMYVTRDKVRAKGLDGSLSIGQGMAARA' +
      'NSLQLLSPQPGEQLPPEMTVARSSVKETSREGTSSFHTRQKSEGGVYHDPHSDDGTAPKENRHLYNDPVPRRVGSFYRVP' +
      'SPRPDNSFHENNVSTRVSSLPSESSSGTNHSKRQPAFDPWKSPENISHSEQLKEKEKQGFFRSMKKKKKKSQTVPNSDSP' +
      'DLLTLQKSIHSASTPSSRPKEWRPEKISDLQTQSQPLKSLRKLLHLSSASNHPASSDPRFQPLTAQQTKNSFSEIRIHPL' +
      'SQASGGSSNIRQEPAPKGRPALQLPGQMDPGWHVSSVTRSATEGPSYSEQLGAKSGPNGHPYNRTNRSRMPNLNDLKETAL'
  },

  regions: [
    { name: 'Kinase domain', short: 'Kinase domain', start: 13, end: 297, kind: 'ordered' },
    { name: 'Disordered C-terminal region', short: 'Disordered region', start: 304, end: 960, kind: 'disordered' }
  ],

  // Crystal structure of the kinase domain. Residue numbers are author
  // numbers, which match UniProt O76039 for this entry.
  structure: {
    pdb: '4bgq',
    chain: 'A',
    modelled: [9, 302],
    gaps: [[46, 52], [163, 173]]
  },

  // Okabe-Ito colour-blind safe palette, matching the figure in the review.
  types: [
    { key: 'missense', label: 'Missense', color: '#0072B2' },
    { key: 'nonsense', label: 'Nonsense', color: '#D55E00' },
    { key: 'frameshift', label: 'Frameshift', color: '#009E73' },
    { key: 'inframe_deletion', label: 'In-frame deletion', color: '#CC79A7' },
    // Chromosomal microdeletions have no residue position, so they are listed
    // in the table but not drawn on the structure or the schematic.
    { key: 'microdeletion', label: 'Microdeletion', color: '#000000', onProtein: false }
  ],

  // Functional sites drawn on the "Functional sites" track under the schematic,
  // following the features shown in Figure 2 of Hector et al. 2017.
  // Positions are on CDKL5_1. Rusconi et al. 2008 used the 1030 aa isoform,
  // which is numbered identically up to residue 904.
  features: [
    {
      key: 'kinase', label: 'Kinase (catalytic) domain', short: 'Kinase domain', segments: [[13, 297]],
      // Already drawn as the kinase block, so it is not repeated on the track.
      track: false,
      evidence: 'Predicted from sequence (PROSITE protein kinase domain profile), consistent with the crystal structure.',
      sources: ['uniprot', 'ps50011']
    },
    {
      key: 'atp', label: 'ATP-binding site', short: 'ATP', segments: [[19, 27], [42, 42]],
      evidence: 'Glycine-rich loop (19–27) and Lys42. Predicted from sequence (PROSITE protein kinase domain rule).',
      sources: ['uniprot', 'ps50011']
    },
    {
      key: 'active', label: 'Ser/Thr kinase active site', short: 'Active site', segments: [[131, 143]],
      evidence: 'PROSITE Ser/Thr kinase active-site signature. Asp135 is the catalytic proton acceptor.',
      sources: ['uniprot', 'ps00108']
    },
    {
      key: 'tey', label: 'TEY motif (activation loop)', short: 'TEY', segments: [[169, 171]],
      evidence: 'Thr-Glu-Tyr motif in the activation loop. CDKL5 phosphorylates its own TEY motif; Tyr171 phosphorylation has been detected.',
      sources: ['bertani2006', 'uniprot']
    },
    {
      key: 'nls1', label: 'Nuclear localisation signal 1', short: 'NLS1', segments: [[312, 315]],
      evidence: 'Predicted basic stretch (ScanProsite).',
      sources: ['rusconi2008', 'uniprot']
    },
    {
      key: 'nls2', label: 'Nuclear localisation signal 2', short: 'NLS2', segments: [[784, 789]],
      evidence: 'Predicted basic stretch (ScanProsite). Reported to be sufficient to bring GFP into the nucleus (data not shown in the source).',
      sources: ['rusconi2008', 'uniprot']
    },
    {
      key: 'nes', label: 'Putative nuclear export signal', short: 'NES', segments: [[836, 845]],
      evidence: 'Matches the NES consensus, but was not sufficient for nuclear export when tested, so it remains putative.',
      sources: ['rusconi2008']
    }
  ],

  featureSources: {
    uniprot: { citation: 'UniProt O76039 (CDKL5_HUMAN)', url: 'https://www.uniprot.org/uniprotkb/O76039/entry' },
    ps50011: { citation: 'PROSITE PS50011, protein kinase domain profile', url: 'https://prosite.expasy.org/PS50011' },
    ps00108: { citation: 'PROSITE PS00108, Ser/Thr protein kinase active-site signature', url: 'https://prosite.expasy.org/PS00108' },
    bertani2006: { citation: 'Bertani, Rusconi et al. 2006, J Biol Chem', url: 'https://doi.org/10.1074/jbc.M606325200' },
    rusconi2008: { citation: 'Rusconi, Salvatoni et al. 2008, J Biol Chem', url: 'https://doi.org/10.1074/jbc.M804613200' },
    hector2017: { citation: 'Hector, Kalscheuer et al. 2017, Neurol Genet', url: 'https://doi.org/10.1212/NXG.0000000000000200' }
  },

  dataUrl: 'data/mutations.csv',
  referencesUrl: 'data/references.csv'
};

/*
 * Site configuration. Edit this file to change the protein annotation,
 * the structure shown or the colours. Mutations live in data/mutations.csv.
 */
window.CDKL5_CONFIG = {
  title: 'CDKL5 clinical variants',
  lastUpdated: '2026-11-11',

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
    { key: 'inframe_deletion', label: 'In-frame deletion', color: '#CC79A7' }
  ],

  dataUrl: 'data/mutations.csv'
};

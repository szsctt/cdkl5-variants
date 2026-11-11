# CDKL5 clinical variants

An interactive web page showing clinically relevant CDKL5 variants on:

- the crystal structure of the kinase domain (PDB 4BGQ, shown with PDBe Mol*)
- a schematic of the full-length protein, including the disordered C-terminal region
- a table with links to ClinVar and references

Hovering over or clicking a variant in any view highlights it in the others. Selecting a
truncating variant (nonsense or frameshift) shades the part of the protein that is lost.
Each variant has its own link, for example `.../#p.Arg59Ter`, which opens the page with that
variant selected.

The site is plain HTML, CSS and JavaScript with no build step, so it can be hosted on GitHub Pages.

## Files

| File | Purpose |
| --- | --- |
| `data/mutations.csv` | The variant list. This is the only file most edits need. |
| `js/config.js` | Isoform, sequence, domain boundaries, structure and colours. |
| `js/lib.js` | HGVS parsing and annotation (no page code). |
| `js/app.js` | The three linked views. |
| `css/style.css` | Styles. |

## Editing the variant list

Open `data/mutations.csv` in a text editor or Excel (save as CSV). Columns:

| Column | Required | Notes |
| --- | --- | --- |
| `hgvs` | yes | Protein HGVS name on CDKL5_1 (NM_001323289.2), e.g. `p.Arg59Ter`, `p.Leu220Pro`, `p.Leu61CysfsTer15`, `p.Asp135_Phe154del`. |
| `clinvar` | no | ClinVar variation ID. If blank, the page links to a ClinVar search instead. |
| `reference` | no | A PMID (digits only), a DOI (`10.xxxx/...`) or free text. PMIDs and DOIs become links. |
| `note` | no | Free text shown in the table. |
| `type` | no | Override the type the page works out from the name. Normally leave blank. |

Type, position, region and predicted effect are all worked out from the HGVS name. If the
reference amino acid in a name does not match the CDKL5_1 sequence, the table shows a warning
symbol next to it. Rows that cannot be parsed are skipped and reported in the browser console.

Remember to update `lastUpdated` in `js/config.js` when the list changes.

## Previewing locally

Browsers will not load the CSV when `index.html` is opened directly as a file, so serve the folder:

```sh
cd site
python3 -m http.server 8000
```

Then open <http://localhost:8000>. The 3D viewer needs an internet connection, because it loads
the viewer library and the structure from the web.

## Publishing on GitHub Pages

1. Create a repository, ideally under an organisation account (for example `cdkl5-variants`), and
   push the contents of this folder to the `main` branch.
2. In the repository, go to **Settings > Pages**, set **Source** to "Deploy from a branch", and
   choose `main` and `/ (root)`.
3. After a minute the site is live at `https://<account>.github.io/<repository>/`.

The empty `.nojekyll` file stops GitHub from processing the site with Jekyll.

## Getting a DOI for the paper (Zenodo)

Web links in papers often break over time. A Zenodo archive gives a permanent DOI.

1. Sign in to <https://zenodo.org> with GitHub and turn on the repository under
   **GitHub** in your Zenodo account settings.
2. In GitHub, create a release (for example `v1.0`). Zenodo archives it and issues a DOI.
3. Cite the DOI in the paper and give the GitHub Pages URL alongside it.

Each later release gets its own DOI, plus a "concept" DOI that always points to the latest version.

## Things to confirm before publication

- The isoform and transcript (CDKL5_1, NM_001323289.2, 960 aa) match the variant names used in the review.
- Domain boundaries in `js/config.js` (kinase domain 13 to 297, disordered region 304 to 960).
- ClinVar IDs and references for each variant.

## Credits

- Structure: PDB entry 4BGQ.
- Viewer: PDBe Mol* (Sehnal et al., Nucleic Acids Research 2021), loaded from jsDelivr, version 3.3.2.
- Colours: Okabe-Ito colour-blind safe palette.

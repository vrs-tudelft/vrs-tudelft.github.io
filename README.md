# vrs-tudelft.github.io

The public website of the Virtual Radiosonde project: https://vrs-tudelft.github.io

It is plain HTML. There is no build step. Change a file, push, and the site updates
within a minute or two.

## What is on it

| File | What it shows |
|---|---|
| `index.html` | What the project is, in plain words, and the key numbers so far |
| `figures.html` | The figures from the analysis (01 to 23 as of 16 September 2026), each with a caption |
| `animations.html` | Two animations of the radar data |
| `figures/` | The PNG files, named `NN-short-name.png`; the number continues the count in the team repository's `mvp/figures/` |
| `animations/` | The animation players (self-contained HTML files) |
| `style.css` | The look |

Every figure is made by a script in the team repository
([virtual-radiosonde](https://github.com/vrs-tudelft/virtual-radiosonde), `mvp/src/`)
and has a dated note in `research/notes/` there that says what it shows and what it does
not. The caption here is the plain-language version of that note.

## How to add or update something

1. Put the new PNG in `figures/`, with the next free number, or the new animation HTML
   in `animations/`.
2. Add a `<figure>` block to `figures.html`, or a `<div class="player">` block to
   `animations.html`. Copy an existing block and change the file name and caption.
3. If a key number on `index.html` changes, change it there too.
4. Commit and push, or edit the file directly on GitHub and press "Commit changes".

## What may go on this site

This site is public. Only put here what we would be happy to show anyone:

- Figures and animations: yes.
- Numbers with their caveats: yes.
- Raw data, or files that contain point-by-point data (like the interactive map
  export): **no**. The satellite data was given to us for the course and may not be
  passed on.
- Draft text of the paper: no, until it is submitted.

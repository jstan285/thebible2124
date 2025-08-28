const fs = require("fs");
const path = require("path");

const formatLineText = (text) => {
  const esc = s => String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  const lines = String(text).replace(/\r\n/g, "\n").split("\n");

  let out = [];
  let inTags = false;          // inside [FILE TAGS]
  let inUL = false;            // inside a bullet list
  let pendingBullet = false;   // a visual separator marks the next line as a bullet

  const open = tag => out.push(`<${tag}>`);
  const close = tag => out.push(`</${tag}>`);
  const isBlank = s => !s || /^\s*$/.test(s);

  // separators that *mark* a bullet (but have no text themselves)
  const isSep = s => {
    const t = String(s).trim();
    // ASCII + unicode angle quotes, dashes, bullets, dots, misc. divider glyphs
    return t.length > 0 &&
      /^[<>\u2039\u203A\u00AB\u00BB\u3008\u3009.\-–—*•~^'`"=+/\\\[\]{}()|:\s]+$/.test(t) &&
      !/^>\s+/.test(t); // keep true "> text" (handled below as bullet)
  };

  const isHeadingBrackets = s => /^\s*\[[^\]]+\]\s*$/.test(s);
  const isTagPair = s => /^\s*\[([^\]]+)\]\s*:\s*(.+)\s*$/.exec(s);

  const isDashBullet = s => /^\s*(?:[-*]|•)\s+(.+)$/.exec(s);
  const isQuoteBullet = s => /^\s*>\s+(.+)$/.exec(s);        // > text  -> bullet
  const isLettered    = s => /^\s*[a-z]\.\s+(.+)$/i.exec(s); // a. text -> bullet

  const peek = (i, n=1) => (i + n < lines.length ? lines[i + n] : "");
  const nextIsBulletish = (i) => {
    const n = peek(i).trim();
    return !!(isDashBullet(n) || isQuoteBullet(n) || isLettered(n) || isSep(n));
  };

  const closeUL   = () => { if (inUL)   { close("ul");  inUL = false; } };
  const closeTags = () => { if (inTags) { close("div"); inTags = false; } }; // <-- close <div>, not <dl>
  const closeAll  = () => { closeUL(); closeTags(); pendingBullet = false; };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

// === File type ===  → centered heading
const mt = raw.match(/^\s*===\s*(.+?)\s*===\s*$/);
if (mt) {
  closeAll();
  out.push(`<h2 class="filetype-title">${esc(mt[1])}</h2>`);
  continue;
}
  
    // ignore blank lines (but keep pendingBullet state)
    if (isBlank(raw)) { continue; }

    // [SECTION] headings
if (isHeadingBrackets(raw)) {
  const label = esc(raw.replace(/^\s*\[|\]\s*$/g, ""));
  const labelUpper = label.toUpperCase();
  closeAll();

  if (labelUpper === "FILE TAGS") {
    out.push(`<h2>${label}</h2>`);
    open('div class="file-tags"');
    inTags = true;
  } else if (labelUpper === "YOU ARE WELCOME HERE") {
    out.push(`<h3>${label}</h3>`);          // demote just this heading
  } else {
    out.push(`<h2>${label}</h2>`);          // all other bracketed headings stay H2
  }
  continue;
}


    // Inside [FILE TAGS]: show "[KEY]: value" as plain paragraphs; ignore everything else
    if (inTags) {
      const m = isTagPair(raw);
      if (m) {
        out.push(`<p>[${esc(m[1].trim())}]: ${esc(m[2].trim())}</p>`); // <-- paragraph, not dt/dd
        continue;
      }
      // if another [SECTION] appears, close tags and reprocess as a section
      if (isHeadingBrackets(raw)) { closeTags(); i--; continue; }
      // ignore separators or any stray content while in tags
      if (isSep(raw)) { continue; }
      continue;
    }

    // "Title:" followed by bullets → H3  (changed from H2)
    if (/:$/.test(raw.trim()) && nextIsBulletish(i)) {
      closeUL();
      out.push(`<h3>${esc(raw.trim().replace(/:$/, ""))}</h3>`); // <-- H3
      pendingBullet = false;
      continue;
    }

    // Turn a lone separator into a "start bullets now" marker
    if (isSep(raw)) { pendingBullet = true; continue; }

    // Bullets: -, *, •
    let m;
    if ((m = isDashBullet(raw))) {
      if (!inUL) { open("ul"); inUL = true; }
      out.push(`<li>${esc(m[1])}</li>`);
      pendingBullet = false;
      continue;
    }

    // Bullets: > text (no blockquotes)
    if ((m = isQuoteBullet(raw))) {
      if (!inUL) { open("ul"); inUL = true; }
      out.push(`<li>${esc(m[1])}</li>`);
      pendingBullet = false;
      continue;
    }

    // Bullets: a. text
    if ((m = isLettered(raw))) {
      if (!inUL) { open("ul"); inUL = true; }
      out.push(`<li>${esc(m[1])}</li>`);
      pendingBullet = false;
      continue;
    }

    // If a separator marked the start of a bullet, treat this line as the bullet text
    if (pendingBullet) {
      if (!inUL) { open("ul"); inUL = true; }
      out.push(`<li>${esc(raw)}</li>`);
      pendingBullet = false;
      continue;
    }

    // otherwise, plain paragraph
    closeUL();
    out.push(`<p>${esc(raw)}</p>`);
  }

  closeAll();
  return out.join("\n");
};



const formatTranslationText = (text) => {
  return text
    .split("\n")
    .map(line => `<p>${line.trim()}</p>`)
    .join("\n");
};

const getDisplayTitle = (book, chapter, filename) => {
  const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);
  if (filename.endsWith("-translation.txt")) {
    return `${capitalize(book)} ${chapter.replace(/^0/, "")} – Translation`;
  } else {
    const lineNumber = filename.slice(5, 10);
    return `${capitalize(book)} ${chapter.replace(/^0/, "")} – Line ${lineNumber}`;
  }
};

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("src/img");

// Extracts "00001" from "Line_00001_Source.txt" (works with or without .basename)
eleventyConfig.addFilter("lineId", (line) => {
  const base = (line && (line.basename || line.filename)) || "";
  const m = String(base).match(/^Line_(\d{5})/);
  return m ? m[1] : "";
});

eleventyConfig.addFilter("pad5", (n) => String(Number(n)).padStart(5, "0"));
eleventyConfig.addFilter("fileType", (filename = "") => {
  const m = String(filename).match(/_(Source|Rendering|Reflections|Lens)\.txt$/i);
  return m ? m[1] : "";
});

  
  // Custom collection for books
  eleventyConfig.addCollection("books", () => {
    const booksPath = path.join(__dirname, "src", "library");
    return fs.readdirSync(booksPath).filter((name) => {
      return fs.statSync(path.join(booksPath, name)).isDirectory();
    });
  });

  // Chapters per book
  eleventyConfig.addCollection("chapters", () => {
    const base = path.join(__dirname, "src", "library");
    let chapters = [];
    fs.readdirSync(base).forEach(book => {
      const bookPath = path.join(base, book);
      if (fs.statSync(bookPath).isDirectory()) {
        fs.readdirSync(bookPath).forEach(chapter => {
          const chapterPath = path.join(bookPath, chapter);
          if (fs.statSync(chapterPath).isDirectory()) {
            chapters.push({ book, chapter });
          }
        });
      }
    });
    return chapters;
  });

// Group Line_XXXXX_*type*.txt files by ID (no folders required)
const fs = require("fs");
const path = require("path");

eleventyConfig.addCollection("lineGroups", () => {
  const base = path.join(__dirname, "src", "library");
  const groups = [];

  fs.readdirSync(base).forEach(book => {
    const bookPath = path.join(base, book);
    if (!fs.statSync(bookPath).isDirectory()) return;

    fs.readdirSync(bookPath).forEach(chapter => {
      const chapterPath = path.join(bookPath, chapter);
      if (!fs.statSync(chapterPath).isDirectory()) return;

      // bucket files in this chapter by Line ID
      const map = new Map();

      fs.readdirSync(chapterPath).forEach(file => {
        // Match Line_00001_Source.txt, Line_00001_Rendering.txt, etc.
        const m = file.match(/^Line_(\d{5})_(Source|Rendering|Reflections|Lens)\.txt$/i);
        if (!m) return;
        const id = m[1];
        const type = m[2].toLowerCase(); // source|rendering|reflections|lens

        const key = `${book}/${chapter}/${id}`;
        if (!map.has(key)) {
          map.set(key, { book, chapter, id, files: {} });
        }
        map.get(key).files[type] = {
          file,
          basename: file.replace(/\.txt$/i, ""),
        };
      });

      for (const g of map.values()) groups.push(g);
    });
  });

  // predictable order
  groups.sort((a, b) => Number(a.id) - Number(b.id));
  return groups;
});

// Optional tiny helper to build the same URLs your .txt pages already use
eleventyConfig.addFilter("txtUrl", (book, chapter, basename) =>
  `/library/${book}/${chapter}/${basename}/`
);
  
  // Lines per chapter
  eleventyConfig.addCollection("lines", () => {
    const base = path.join(__dirname, "src", "library");
    let lines = [];
    fs.readdirSync(base).forEach(book => {
      const bookPath = path.join(base, book);
      if (fs.statSync(bookPath).isDirectory()) {
        fs.readdirSync(bookPath).forEach(chapter => {
          const chapterPath = path.join(bookPath, chapter);
          if (fs.statSync(chapterPath).isDirectory()) {
            fs.readdirSync(chapterPath).forEach(file => {
              if (file.endsWith(".txt")) {
                const filepath = path.join(chapterPath, file);
                const content = fs.readFileSync(filepath, "utf-8");

                const htmlFormatted = file.includes("translation")
                  ? formatTranslationText(content)
                  : formatLineText(content);

                const displayTitle = getDisplayTitle(book, chapter, file);

                lines.push({
                  book,
                  chapter,
                  filename: file,
                  content,
                  htmlFormatted,
                  displayTitle
                });
              }
            });
          }
        });
      }
    });
    return lines;
  });

  return {
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site"
    }
  };
};

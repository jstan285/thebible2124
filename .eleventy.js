const fs = require("fs");
const path = require("path");

const formatLineText = (text) => {
  const lines = text.split("\n");
  let output = [];
  let inTable = false;
  let tableHeader = null;
  let tableRows = [];

  const flushTable = () => {
    if (tableHeader && tableRows.length > 0) {
      const thead = `<thead><tr>${tableHeader.map(h => `<th>${h.trim()}</th>`).join("")}</tr></thead>`;
      const tbody = tableRows.map(row => {
        const cells = row.map(c => `<td>${c.trim()}</td>`).join("");
        return `<tr>${cells}</tr>`;
      }).join("\n");
      output.push(`<table>${thead}<tbody>${tbody}</tbody></table>`);
    }
    inTable = false;
    tableHeader = null;
    tableRows = [];
  };

  for (let line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      if (inTable) flushTable();
      continue;
    }

    // Detect pipe-style or tab-separated table headers
    const isPipeHeader = trimmed.startsWith("|") && trimmed.includes("|");
    const isTabbedHeader = !trimmed.startsWith("|") && trimmed.includes("\t");

    if (isPipeHeader || isTabbedHeader) {
      const delimiter = isPipeHeader ? "|" : "\t";
      const parts = trimmed.split(delimiter).filter(Boolean);

      if (!inTable) {
        inTable = true;
        tableHeader = parts;
      } else {
        tableRows.push(parts);
      }
    } else {
      if (inTable) flushTable(); // table ended

      // Outside of tables: heading if starts with letter, else paragraph
      if (/^[A-Za-z]/.test(trimmed)) {
        output.push(`<h2>${trimmed}</h2>`);
      } else {
        output.push(`<p>${trimmed}</p>`);
      }
    }
  }

  if (inTable) flushTable(); // catch trailing tables

  return output.join("\n");
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

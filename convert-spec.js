#!/usr/bin/env node

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, ShadingType, AlignmentType, PageBreak, LevelFormat
} = require('docx');

// Read the markdown file
const mdContent = fs.readFileSync('/Users/lanaclaude/Lana/pricing-app/SPECIFICATION.md', 'utf-8');
const lines = mdContent.split('\n');

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };

// Parse markdown to paragraphs
const paragraphs = [];
let inCodeBlock = false;
let codeBlockContent = [];
let inTable = false;
let tableLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Handle code blocks
  if (line.startsWith('```')) {
    inCodeBlock = !inCodeBlock;
    if (!inCodeBlock && codeBlockContent.length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: codeBlockContent.join('\n'), font: 'Courier New', size: 18 })],
          spacing: { before: 120, after: 120 }
        })
      );
      codeBlockContent = [];
    }
    continue;
  }

  if (inCodeBlock) {
    codeBlockContent.push(line);
    continue;
  }

  // Handle tables
  if (line.includes('|') && line.trim().length > 0) {
    if (!inTable) {
      inTable = true;
      tableLines = [];
    }
    tableLines.push(line);
    continue;
  } else {
    // End table if we were in one
    if (inTable && tableLines.length > 0) {
      const rows = tableLines
        .filter(l => !l.includes('---'))
        .map((l, idx) => {
          const cells = l.split('|').filter((c, i) => i > 0 && i < l.split('|').length - 1);
          const isHeader = idx === 0;
          const cellCount = cells.length;
          const colWidth = Math.floor(9360 / cellCount);

          return new TableRow({
            children: cells.map(cell =>
              new TableCell({
                borders,
                width: { size: colWidth, type: WidthType.DXA },
                shading: { fill: isHeader ? 'D5E8F0' : 'FFFFFF', type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun(cell.trim())] })]
              })
            )
          });
        });

      if (rows.length > 0) {
        paragraphs.push(
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            rows: rows
          })
        );
      }
      inTable = false;
      tableLines = [];
    }

    // Handle headings
    if (line.startsWith('# ') && !line.startsWith('##')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: line.substring(2), bold: true, size: 32, font: 'Arial' })],
          spacing: { before: 240, after: 120 }
        })
      );
    } else if (line.startsWith('## ') && !line.startsWith('###')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.substring(3), bold: true, size: 28, font: 'Arial' })],
          spacing: { before: 180, after: 100 }
        })
      );
    } else if (line.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: line.substring(4), bold: true, size: 24, font: 'Arial' })],
          spacing: { before: 120, after: 80 }
        })
      );
    } else if (line.startsWith('- ')) {
      paragraphs.push(
        new Paragraph({
          text: line.substring(2),
          indent: { left: 720, hanging: 360 }
        })
      );
    } else if (line.startsWith('---')) {
      paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (line.trim().length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 100 }
        })
      );
    } else {
      paragraphs.push(new Paragraph({ children: [new TextRun('')] }));
    }
  }
}

// Create document
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Arial', size: 22 }
      }
    },
    paragraphStyles: [
      {
        id: 'Heading1',
        name: 'Heading 1',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 32, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: 'Heading2',
        name: 'Heading 2',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      },
      {
        id: 'Heading3',
        name: 'Heading 3',
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial' },
        paragraph: { spacing: { before: 120, after: 80 }, outlineLevel: 2 }
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: paragraphs
  }]
});

// Write to file
Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/Users/lanaclaude/Lana/pricing-app/SPECIFICATION.docx', buffer);
  console.log('✓ Created SPECIFICATION.docx');
});

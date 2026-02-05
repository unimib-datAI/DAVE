#!/usr/bin/env node
/**
 * exportToNdjson.js
 *
 * Streams documents to an NDJSON file without buffering everything in memory.
 *
 * Usage:
 *   node exportToNdjson.js --out ./out.ndjson --src-dir ./data
 *   cat source.ndjson | node exportToNdjson.js --out ./out.ndjson --stdin
 *   node exportToNdjson.js --out ./out.ndjson --src-dir ./data --gzip
 *
 * Features:
 * - Streams documents from:
 *    * a source directory (`--src-dir`) containing JSON / NDJSON files
 *    * stdin as NDJSON (`--stdin`)
 * - Writes NDJSON to an output file (`--out`), optionally gzipped (`--gzip`)
 * - Uses backpressure-aware pipeline from streams/promises
 * - Logs progress periodically
 *
 * Notes:
 * - For very large single JSON array files, this implementation reads the whole
 *   file into memory when the file has a `.json` extension and contains an array.
 *   If you need true streaming parsing of huge JSON arrays, integrate a streaming
 *   JSON parser (e.g. `JSONStream` or `stream-json`) and update the generator.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const { Readable, Transform } = require('stream');
const zlib = require('zlib');

const DEFAULT_OUT = './out.ndjson';
const LOG_INTERVAL = 5000; // log every 5000 documents

function parseArgs(argv) {
  const args = {
    out: DEFAULT_OUT,
    srcDir: null,
    stdin: false,
    gzip: false,
    verbose: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) {
      args.out = argv[++i];
    } else if (a === '--src-dir' && argv[i + 1]) {
      args.srcDir = argv[++i];
    } else if (a === '--stdin') {
      args.stdin = true;
    } else if (a === '--gzip') {
      args.gzip = true;
    } else if (a === '--verbose') {
      args.verbose = true;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelpAndExit(1);
    }
  }

  if (!args.stdin && !args.srcDir) {
    console.error('Error: must provide either --stdin or --src-dir');
    printHelpAndExit(1);
  }

  return args;
}

function printHelpAndExit(code = 0) {
  console.log(`
exportToNdjson.js

Streams documents to NDJSON.

Options:
  --out <path>       Output file path (default ${DEFAULT_OUT})
  --src-dir <path>   Source directory with JSON/NDJSON files
  --stdin            Read NDJSON documents from stdin
  --gzip             Compress output with gzip (.gz appended if not present)
  --verbose          Enable verbose logging
  --help, -h         Show this help
`);
  process.exit(code);
}

/**
 * Async generator that yields document objects from stdin (NDJSON)
 */
async function* docsFromStdin() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed);
    } catch (err) {
      // If parse fails, yield a wrapper with an error - you may choose different behavior
      yield { __parseError: true, raw: trimmed, message: String(err) };
    }
  }
}

/**
 * Async generator that yields document objects from a directory.
 * Supports:
 *  - .ndjson, .jsonl, .txt -> treated as NDJSON (one JSON object per line)
 *  - .json -> if contains an array -> yields items; else yields the parsed object
 *
 * Directory is iterated in lexicographic order.
 */
async function* docsFromDirectory(dirPath, verbose = false) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  // Sort to have deterministic order
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();

  for (const fname of files) {
    const full = path.join(dirPath, fname);
    const ext = path.extname(fname).toLowerCase();

    if (ext === '.ndjson' || ext === '.jsonl' || ext === '.txt') {
      if (verbose) console.error(`Streaming NDJSON file: ${full}`);
      yield* docsFromNdjsonFile(full);
    } else if (ext === '.json') {
      if (verbose) console.error(`Reading JSON file: ${full}`);
      yield* docsFromJsonFile(full);
    } else {
      // Try to heuristically parse as ndjson first, else parse whole file as JSON
      if (verbose) console.error(`Unknown extension for ${full}, trying NDJSON then JSON`);
      try {
        yield* docsFromNdjsonFile(full);
      } catch (e) {
        // fallback
        if (verbose) console.error(`NDJSON parsing failed for ${full}, falling back to JSON parse`);
        yield* docsFromJsonFile(full);
      }
    }
  }
}

/**
 * Read NDJSON file line-by-line and yield parsed objects
 */
async function* docsFromNdjsonFile(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      yield JSON.parse(trimmed);
    } catch (err) {
      yield { __parseError: true, raw: trimmed, message: String(err), _sourceFile: filePath };
    }
  }
}

/**
 * Read a JSON file. If it's an array, yield elements; otherwise yield the object
 * Note: This reads the whole file into memory - for very large JSON arrays,
 * integrate a streaming JSON parser.
 */
async function* docsFromJsonFile(filePath) {
  const content = await fs.promises.readFile(filePath, { encoding: 'utf8' });
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    // If parsing fails, try to treat as NDJSON
    try {
      yield* docsFromNdjsonFile(filePath);
      return;
    } catch (_) {
      yield { __parseError: true, rawFile: filePath, message: String(err) };
      return;
    }
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      yield item;
    }
  } else {
    yield parsed;
  }
}

/**
 * Transform stream that converts objects to NDJSON lines.
 * Expects object-mode input.
 */
function objectToNdjsonTransform() {
  let counter = 0;
  return new Transform({
    writableObjectMode: true,
    readableObjectMode: false,
    transform(obj, _, callback) {
      try {
        const line = JSON.stringify(obj) + '\n';
        counter++;
        callback(null, line);
      } catch (err) {
        callback(err);
      }
    }
  });
}

/**
 * Main: sets up pipeline and runs it.
 */
async function main() {
  const opts = parseArgs(process.argv);

  const outPath = opts.gzip && !opts.out.endsWith('.gz') ? opts.out + '.gz' : opts.out;

  // Prepare readable stream from source generator
  let docGenerator;
  if (opts.stdin) {
    docGenerator = docsFromStdin();
  } else {
    // src-dir must be present
    const src = path.resolve(opts.srcDir);
    // Ensure dir exists
    try {
      const stat = await fs.promises.stat(src);
      if (!stat.isDirectory()) {
        console.error(`--src-dir path is not a directory: ${src}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Cannot access --src-dir path: ${src}`, err.message);
      process.exit(1);
    }
    docGenerator = docsFromDirectory(src, opts.verbose);
  }

  const readable = Readable.from(docGenerator, { objectMode: true });

  // Transform objects to NDJSON
  const toNdjson = new Transform({
    writableObjectMode: true,
    transform(obj, _, callback) {
      try {
        const line = JSON.stringify(obj) + '\n';
        callback(null, line);
      } catch (err) {
        callback(err);
      }
    }
  });

  // Creation of write stream (optionally gzipped)
  const writeStream = fs.createWriteStream(outPath, { flags: 'w' });

  // Optionally wrap with gzip
  const finalStream = opts.gzip ? zlib.createGzip() : null;

  // Progress counter
  let count = 0;
  const progressTicker = setInterval(() => {
    process.stderr.write(`Exported ${count} documents...\n`);
  }, LOG_INTERVAL);

  // Wrap transform to count and handle progress; do not allocate extra buffers
  const countingTransform = new Transform({
    writableObjectMode: true,
    readableObjectMode: true,
    transform(obj, _, callback) {
      count++;
      // push the stringified line to next stream
      try {
        const line = JSON.stringify(obj) + '\n';
        callback(null, line);
      } catch (err) {
        callback(err);
      }
    }
  });

  // Graceful shutdown on signals
  let shuttingDown = false;
  function shutdownHandler(sig) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`Received ${sig} - shutting down gracefully...`);
    clearInterval(progressTicker);
    // Allow pipeline to finish; then exit
    // We cannot force-cancel pipeline nicely here without more complex logic.
    // As a safe fallback, exit after a timeout.
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on('SIGINT', shutdownHandler);
  process.on('SIGTERM', shutdownHandler);

  try {
    if (opts.gzip) {
      await pipeline(readable, countingTransform, finalStream, writeStream);
    } else {
      await pipeline(readable, countingTransform, writeStream);
    }
    clearInterval(progressTicker);
    process.stderr.write(`Export complete. Total documents: ${count}\n`);
    process.exit(0);
  } catch (err) {
    clearInterval(progressTicker);
    console.error('Pipeline failed:', err);
    process.exit(1);
  }
}

// Run if invoked directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

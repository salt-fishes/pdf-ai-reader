# Paper Reader · PDF × AI

[![CI](https://github.com/salt-fishes/pdf-ai-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/salt-fishes/pdf-ai-reader/actions/workflows/ci.yml)

A local-first PDF reader with an embedded AI reading assistant. The PDF itself never leaves your browser: only the pages, selected text, screenshots and attachments you explicitly choose are sent to the model through a local Node proxy.

[中文说明](README.md) · [Architecture & plan](docs/pdf-ai-reader-plan.md) · [Desktop build](docs/DESKTOP.md)

## Highlights

- **pdf.js 6.5.438 reader**: continuous virtualized scrolling, text layer, Chinese CMaps, search highlighting, outline, lazy thumbnails, highlights.
- **True-HiDPI canvas**: actual `devicePixelRatio`, 2²⁵ pixel budget, re-render after browser zoom or monitor changes. 100% = 96dpi.
- **Floating / docked assistant**: drag, four-edge resize, minimize/close transitions, reduced-motion support.
- **Explicit context**: current page, page ranges, TOC chapters, selected text (including cross-page), page/region screenshots, attachments, quoted messages.
- **Long-document workflow**: local BM25 smart filtering, map-reduce whole-document summary with progress/cancel/chunk cache.
- **Answers**: streaming Markdown + KaTeX, clickable `[[p.n]]` citations, reasoning stream, token meter with configurable pricing.
- **Extras**: color modes (original/invert/smart dark/grayscale/eye-care), optional local PP-OCRv6 OCR, multiple chat sessions, highlight export.
- **Settings**: provider Base URL / key / model allowlist, context budget (soft, default 1M), history window, OCR, privacy and data controls.
- **Desktop**: Electron shell with bundled local proxy and NSIS/portable packaging.

## Quick start

Requires Node.js 24+.

```bash
npm install
copy server\.env.example server\.env
# edit server/.env: AI_API_KEY=sk-...  (or MOCK_AI=1 to try the UI)
npm run dev:all
```

Open <http://127.0.0.1:5173>.

### Mock mode

Set `MOCK_AI=1` in `server/.env` to stream a local mock answer with citations and usage. No real model is called and no cost is incurred.

### Production / desktop

```bash
npm run build
npm start                 # Hono serves dist/ and /api on 127.0.0.1:8787

npm run desktop:dev       # Electron + Vite dev shell
npm run build:desktop     # Windows NSIS installer + portable exe
```

## Configuration

Provider settings can be written in `server/.env` **or** from Settings → Model service (stored in `server/data/provider.json`, gitignored). The browser never receives the key; it only sees a boolean and a 4-character hint.

| Variable             | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `AI_BASE_URL`        | OpenAI-compatible endpoint, default `https://api.deepseek.com`    |
| `AI_API_KEY`         | server-side key                                                   |
| `AI_MODEL`           | default model                                                     |
| `AI_MODEL_ALLOW`     | comma-separated switchable models                                 |
| `MOCK_AI`            | `1` enables the local mock stream                                 |
| `PORT` / `HOST`      | default `8787` / `127.0.0.1`                                      |
| `OCR_MODEL_BASE_URL` | optional OCR model mirror                                         |
| `OCR_MODEL_DIR`      | optional OCR model directory                                      |
| `PDF_AI_DATA_DIR`    | optional writable data directory (desktop uses Electron userData) |

## Privacy

- The main PDF is parsed locally in the browser and is never uploaded as a file.
- Only explicitly selected pages, text, screenshots, attachments and questions are sent to the configured model.
- Keys live in `server/.env` or `server/data/provider.json`; they are not bundled into the frontend.
- Chats, reading position, highlights and OCR text live in local IndexedDB.
- OCR inference runs in the local proxy; images are not sent to the cloud OCR.
- The proxy binds `127.0.0.1` by default. LAN/public deployment needs your own auth, rate limits and TLS.

## Tests

```bash
npm run typecheck
npm test              # Vitest
npm run test:e2e      # Playwright (Edge by default; PW_CHANNEL=chromium on Linux)
npm run build
```

## License

MIT. See [LICENSE](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

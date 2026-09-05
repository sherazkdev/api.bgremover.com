# Background Remover API

Local REST API that removes image backgrounds with **BiRefNet Lite ONNX** through `@huggingface/transformers` and **Sharp**. Images stay on disk. The API never calls a paid or hosted background-removal service and never uploads user images to a third party.

Requires **Node.js 22+** and npm.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page. The first start downloads `studioludens/birefnet-lite-512` into `.cache`. Subsequent starts reuse that cache.

Every processing request must send `x-api-key` matching `API_KEY` in `.env`.

Useful scripts:

```bash
npm run type-check
npm run lint
npm run test
npm run build
npm start
```

Landing page: [http://localhost:3000](http://localhost:3000)  
OpenAPI docs: [http://localhost:3000/docs](http://localhost:3000/docs)

## Environment variables

Copy `.env.example` and adjust as needed. Values are validated with Zod at startup. Invalid configuration exits immediately.

| Variable                 | Default                             | Purpose                                 |
| ------------------------ | ----------------------------------- | --------------------------------------- |
| `NODE_ENV`               | `development`                       | `development`, `test`, or `production`  |
| `HOST`                   | `0.0.0.0`                           | Bind address                            |
| `PORT`                   | `3000`                              | HTTP port                               |
| `API_PREFIX`             | `/api/v1`                           | Versioned API prefix                    |
| `PUBLIC_BASE_URL`        | `http://localhost:3000`             | Public URL used in JSON responses       |
| `UPLOAD_ROOT`            | `public/uploads`                    | Local originals and processed files     |
| `MAX_FILE_SIZE_MB`       | `10`                                | Multipart and validator size limit      |
| `MAX_BULK_IMAGES`        | `8`                                 | Max images per bulk request             |
| `MAX_IMAGE_WIDTH`        | `6000`                              | Maximum width in pixels                 |
| `MAX_IMAGE_HEIGHT`       | `6000`                              | Maximum height in pixels                |
| `MAX_IMAGE_PIXELS`       | `25000000`                          | Maximum `width * height`                |
| `BG_REMOVAL_CONCURRENCY` | `1`                                 | Pipeline jobs that may run at once      |
| `BG_REMOVAL_QUEUE_LIMIT` | `20`                                | Maximum waiting jobs before `503`       |
| `MODEL_ID`               | `studioludens/birefnet-lite-512`    | Hugging Face model id                   |
| `MODEL_DTYPE`            | `fp32`                              | ONNX dtype (`fp32`, `fp16`, `q8`, `q4`) |
| `API_KEY`                | *(required)*                        | Shared secret compared to `x-api-key`   |
| `RATE_LIMIT_MAX`         | `30`                                | Max removal requests per window         |
| `RATE_LIMIT_WINDOW`      | `1 minute`                          | Rate-limit window                       |
| `HF_ENDPOINT`            | `https://huggingface.co`            | Hugging Face Hub or mirror for weights  |

`API_KEY` has no default. Local development needs at least 8 characters. Production requires at least 24. Generate one with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

## Storage layout

Uploaded and processed files use server-generated UUIDs:

```text
public/uploads/originals/YYYY/MM/<uuid>.jpg
public/uploads/processed/YYYY/MM/<uuid>.png
```

Public URLs look like:

```text
http://localhost:3000/uploads/processed/2026/09/<uuid>.png
```

## Endpoints

OpenAPI UI: [http://localhost:3000/docs](http://localhost:3000/docs)

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | Process is up |
| `GET` | `/api/v1/health/ready` | Public | Model and disk are ready |
| `POST` | `/api/v1/remove-background` | `x-api-key` | One transparent image |
| `POST` | `/api/v1/remove-backgrounds` | `x-api-key` | 1–8 images, per-item status, ZIP |

### `GET /api/v1/health`

Liveness. Public. Returns `200` while the HTTP process is running.

### `GET /api/v1/health/ready`

Readiness. Public. Returns `200` only when the model is loaded and the upload directory is writable. Otherwise `503`.

### `POST /api/v1/remove-background`

Requires header `x-api-key`. `multipart/form-data` with a single image.

| Field           | Required | Values                                      | Default |
| --------------- | -------: | ------------------------------------------- | ------- |
| `image`         |      yes | JPEG, PNG, WebP                             | —       |
| `format`        |       no | `png`, `webp`                               | `png`   |
| `quality`       |       no | `fast`, `hd`                                | `hd`    |
| `responseMode`  |       no | `json`, `binary`                            | `json`  |
| `mode`          |       no | `auto`, `person`, `product`, `document`, `graphic` | `auto` |
| `preserveText`  |       no | `true`, `false`                             | `true`  |

`quality=fast` uses the model’s normal input path. `quality=hd` uses higher-quality Sharp resampling for the model input and alpha mask. It does not upscale the final image.

JSON example:

```bash
curl -X POST http://localhost:3000/api/v1/remove-background \
  -H "x-api-key: $API_KEY" \
  -F image=@./photo.jpg \
  -F format=png \
  -F quality=hd \
  -F mode=auto \
  -F preserveText=true \
  -F responseMode=json
```

Binary example:

```bash
curl -X POST http://localhost:3000/api/v1/remove-background \
  -H "x-api-key: $API_KEY" \
  -F image=@./photo.jpg \
  -F responseMode=binary \
  --output result.png
```

Binary responses include `X-Request-Id`, `X-Image-Id`, `X-Processing-Duration-Ms`, and `X-Result-Url`.

### `POST /api/v1/remove-backgrounds`

Requires header `x-api-key`. `multipart/form-data` with one or more images. Each image uses the same BiRefNet + text-preservation path as the single-image endpoint. One failed file does not cancel the rest. A ZIP is included when at least one image succeeds.

| Field          | Required | Values                                      | Default |
| -------------- | -------: | ------------------------------------------- | ------- |
| `images`       |      yes | JPEG, PNG, WebP                             | —       |
| `format`       |       no | `png`, `webp`                               | `png`   |
| `quality`      |       no | `fast`, `hd`                                | `hd`    |
| `mode`         |       no | `auto`, `person`, `product`, `document`, `graphic` | `auto` |
| `preserveText` |       no | `true`, `false`                             | `true`  |

Repeat `images` (or `image`) once per file. Response is always JSON with public URLs, in upload order.

```bash
curl -X POST http://localhost:3000/api/v1/remove-backgrounds \
  -H "x-api-key: $API_KEY" \
  -F images=@./photo1.jpg \
  -F images=@./photo2.png \
  -F images=@./photo3.webp \
  -F format=png \
  -F quality=hd \
  -F mode=auto \
  -F preserveText=true
```

The JSON body includes `completed`, `failed`, per-item `status`, and `zip.url` for a Download All archive.

`mode=auto` keeps people when BiRefNet is confident and falls back to graphic preservation for text-heavy posters. If neither a subject nor removable background can be found, the API returns `NO_REMOVABLE_SUBJECT` instead of a blank image.

Fine-tuning notes live in [TRAINING.md](TRAINING.md).

## Testing

Default tests mock only the BiRefNet inference boundary:

```bash
npm test
npm run test:watch
npm run test:coverage
```

Optional real-model test (downloads weights, slower):

```bash
set RUN_E2E=1
npx vitest run src/tests/e2e
```

On Unix:

```bash
RUN_E2E=1 npx vitest run src/tests/e2e
```

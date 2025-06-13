# Supabase Edge Functions for Media Conversion

This directory contains Supabase Edge Functions that use FFmpeg.wasm for client-side media conversion, eliminating the need for server-side FFmpeg installations.

## 🎯 Why This Approach?

- **No Railway Infrastructure Issues**: Eliminates S3 upload timeouts, HTTP 100 Continue errors, and dependency resolution problems
- **Pure WebAssembly**: FFmpeg.wasm runs in the browser/Edge runtime without needing native binaries
- **Supabase Managed**: Leverages Supabase's reliable Edge runtime instead of Railway's problematic infrastructure
- **Better Error Handling**: More predictable execution environment with clearer error messages

## 🚀 Quick Start

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Start Local Development

```bash
# From the root of your project
cd supabase
supabase start
```

This will start local Supabase services:

- Database: `http://127.0.0.1:54322`
- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Edge Functions: `http://127.0.0.1:54321/functions/v1/`

### 3. Deploy Edge Function

```bash
# Deploy the conversion function
supabase functions deploy convert-media
```

### 4. Test the Function

Open `test-converter.html` in your browser and test conversions locally:

```bash
# Serve the test file
python3 -m http.server 8000
# Then open http://localhost:8000/test-converter.html
```

## 📁 File Structure

```
supabase/
├── config.toml              # Supabase configuration
├── functions/
│   ├── _shared/
│   │   └── cors.ts          # CORS headers for all functions
│   └── convert-media/
│       └── index.ts         # Main conversion function
├── test-converter.html      # Test interface
└── README.md               # This file
```

## 🔧 Edge Function Features

### convert-media

- **URL**: `/functions/v1/convert-media`
- **Method**: POST
- **Input**: Base64 encoded file data + metadata
- **Output**: Converted file as base64 + metadata

#### Request Format:

```json
{
  "fileData": "base64-encoded-file-data",
  "fileName": "input.jpg",
  "targetFormat": "webp",
  "quality": "medium"
}
```

#### Response Format:

```json
{
  "success": true,
  "convertedData": "base64-encoded-result",
  "convertedFileName": "input_converted.webp",
  "processingTime": 1250
}
```

### Supported Formats

#### Images

- **Input**: JPG, PNG, GIF, BMP, WebP
- **Output**: JPG, PNG, WebP
- **Quality**: Low, Medium, High

#### Videos (Limited in Edge Functions)

- **Input**: MP4, AVI, MOV, MKV
- **Output**: MP4, WebM
- **Quality**: Low, Medium, High

#### Audio

- **Input**: MP3, WAV, M4A, FLAC
- **Output**: MP3, OGG
- **Quality**: Low (96k), Medium (128k), High (320k)

## 🚦 Deployment to Production

### 1. Link to Production Project

```bash
# Get your project reference from Supabase dashboard
supabase link --project-ref your-project-ref
```

### 2. Deploy Functions

```bash
supabase functions deploy convert-media
```

### 3. Update Frontend

Update your frontend to call the production Edge Function URL:

```typescript
const EDGE_FUNCTION_URL =
  "https://your-project-ref.supabase.co/functions/v1/convert-media";
```

## 🔍 Testing & Debugging

### Local Testing

1. Start Supabase locally: `supabase start`
2. Open the test page: `test-converter.html`
3. Monitor logs: `supabase functions logs convert-media`

### Production Testing

1. Deploy function: `supabase functions deploy convert-media`
2. Update test page URL to production endpoint
3. Monitor logs in Supabase dashboard

## 📊 Performance Considerations

### File Size Limits

- **Current**: 50MB (base64 encoded)
- **Recommended**: Keep under 20MB for optimal performance
- **Alternative**: For larger files, consider chunked processing

### Processing Time

- **Images**: Usually < 5 seconds
- **Audio**: 10-30 seconds depending on length
- **Video**: Can be slow, consider limiting duration/resolution

### Memory Usage

- FFmpeg.wasm loads ~30MB of WASM
- Each conversion temporarily doubles memory usage
- Edge Functions have memory limits

## 🔄 Migration from Railway

### Frontend Changes Required:

1. **Replace API calls** from Railway backend to Edge Function:

```typescript
// Old Railway approach
const response = await fetch('/api/convert', { ... });

// New Edge Function approach
const response = await fetch(`${SUPABASE_URL}/functions/v1/convert-media`, { ... });
```

2. **Update file handling** to use base64 encoding:

```typescript
// Convert file to base64 before sending
const base64Data = await fileToBase64(file);
const response = await fetch(edgeUrl, {
  method: "POST",
  body: JSON.stringify({
    fileData: base64Data,
    fileName: file.name,
    targetFormat: "webp",
  }),
});
```

3. **Handle response differently**:

```typescript
// Edge Function returns base64 data directly
const result = await response.json();
if (result.success) {
  const blob = base64ToBlob(result.convertedData);
  const url = URL.createObjectURL(blob);
  // Use the blob URL for download/display
}
```

## 🎯 Benefits Over Railway

✅ **Reliability**: No more HTTP 100 Continue errors
✅ **Scalability**: Supabase handles scaling automatically  
✅ **Simplicity**: No server infrastructure to manage
✅ **Cost**: Pay per invocation, not for idle server time
✅ **Performance**: Edge locations closer to users
✅ **Monitoring**: Built-in logging and error tracking

## 🚨 Limitations

⚠️ **Large Files**: 50MB limit per function call
⚠️ **Complex Video**: Some advanced video operations may be slow
⚠️ **Cold Starts**: First function call may be slower
⚠️ **Memory**: Limited memory per function execution

## 🔧 Next Steps

1. **Test the proof-of-concept** with your current files
2. **Benchmark performance** vs Railway
3. **Update frontend** to use Edge Functions
4. **Deploy to production** and monitor
5. **Gradually migrate** users from Railway to Supabase

This approach should solve your Railway infrastructure issues while providing a more reliable conversion service!

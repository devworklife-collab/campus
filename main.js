// app.js — main behaviour
// Uses: pdf.js (pdfjsLib), PDFLib (PDFLib), jsPDF (window.jspdf), JSZip (JSZip), Tesseract (Tesseract)

// Basic UI wiring
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListEl = document.getElementById('fileList');
const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const logEl = document.getElementById('log');
const resultsEl = document.getElementById('results');
const previewEl = document.getElementById('preview');
const outImgFormat = document.getElementById('outImgFormat');
const imgQuality = document.getElementById('imgQuality');
const imgQualityVal = document.getElementById('imgQualityVal');
const maxWidth = document.getElementById('maxWidth');
const pageRange = document.getElementById('pageRange');

const toolButtons = document.querySelectorAll('.tool-btn');
let activeTool = 'merge';
const files = []; // {file, id, type, name, thumbUrl}
let idCounter = 1;

imgQuality.addEventListener('input', ()=> imgQualityVal.textContent = Number(imgQuality.value).toFixed(2));

// switch tools
toolButtons.forEach(btn=> btn.addEventListener('click', () => {
  toolButtons.forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  activeTool = btn.dataset.tool;
  document.getElementById('compressOptions').style.display = activeTool === 'compress' ? 'block' : 'none';
  log(`Tool: ${activeTool}`);
}));

// drag/drop
dropzone.addEventListener('click', ()=> fileInput.click());
dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('hover'); });
dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('hover'));
dropzone.addEventListener('drop', (e)=> {
  e.preventDefault(); dropzone.classList.remove('hover');
  if(e.dataTransfer && e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', (e)=> handleFiles(Array.from(e.target.files)));

function log(msg){
  logEl.textContent = msg;
}

// add files
async function handleFiles(fileArray){
  for(const f of fileArray){
    const id = idCounter++;
    const type = f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    // generate thumb for images or first page for pdf if small
    let thumb = '';
    if(type.startsWith('image/')){
      thumb = URL.createObjectURL(f);
    } else if(type === 'application/pdf'){
      // small PDF: try to render first page
      thumb = await renderPdfThumb(f).catch(()=> '');
    }
    files.push({file:f,id,type,name:f.name,thumb});
  }
  refreshFileList();
  log(`Added ${fileArray.length} file(s)`);
}

function refreshFileList(){
  fileListEl.innerHTML = '';
  for(const f of files){
    const el = document.createElement('div');
    el.className = 'file-item';
    el.dataset.id = f.id;
    el.innerHTML = `
      <div class="file-thumb">${f.thumb ? `<img src="${f.thumb}" alt="${f.name}" />` : `<svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="#9fb7c9" stroke-width="1.2"/></svg>`}</div>
      <div class="file-meta">
        <div class="file-name">${f.name}</div>
        <div class="file-sub">${f.type} • ${(f.file.size/1024).toFixed(1)} KB</div>
      </div>
      <div class="file-actions">
        <button class="small-btn preview-btn">Preview</button>
        <button class="small-btn remove-btn">Remove</button>
      </div>
    `;
    fileListEl.appendChild(el);

    el.querySelector('.remove-btn').addEventListener('click', ()=> {
      const idx = files.findIndex(x=>x.id==f.id);
      if(idx>=0) files.splice(idx,1);
      refreshFileList();
    });
    el.querySelector('.preview-btn').addEventListener('click', ()=> previewFile(f));
  }
}

// simple preview
async function previewFile(f){
  previewEl.innerHTML = '';
  if(f.type.startsWith('image/')){
    const img = document.createElement('img'); img.src = f.thumb || URL.createObjectURL(f.file); img.style.maxWidth='320px';
    previewEl.appendChild(img);
  } else if(f.type === 'application/pdf'){
    previewEl.textContent = 'Rendering PDF preview...';
    try {
      const pages = await pdfToThumbnails(f.file, 2);
      previewEl.innerHTML = '';
      for(const p of pages){
        const container = document.createElement('div'); container.className='preview-thumb';
        const img = document.createElement('img'); img.src = p; container.appendChild(img);
        previewEl.appendChild(container);
      }
    } catch(err){
      previewEl.textContent = 'Preview failed: ' + err.message;
    }
  } else {
    previewEl.textContent = 'No preview available';
  }
}

// helper: render small thumbnail from pdf first page
async function renderPdfThumb(file){
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({scale:1.2});
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function pdfToThumbnails(file, maxPages=3){
  const ret = [];
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise;
  const count = Math.min(pdf.numPages, maxPages);
  for(let i=1;i<=count;i++){
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({scale:1.2});
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    ret.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return ret;
}

// Run button
runBtn.addEventListener('click', async ()=>{
  resultsEl.innerHTML = '';
  if(files.length === 0){ log('Add files first'); return; }
  log('Processing...');
  try{
    switch(activeTool){
      case 'merge': await toolMerge(); break;
      case 'split': await toolSplit(); break;
      case 'pdf2img': await toolPdfToImages(); break;
      case 'img2pdf': await toolImagesToPdf(); break;
      case 'compress': await toolCompressImages(); break;
      case 'rotate': await toolRotate(); break;
      case 'reorder': await toolReorder(); break;
      case 'ocr': await toolOcr(); break;
      default: log('Tool not implemented'); break;
    }
  } catch(err){
    console.error(err);
    log('Error: ' + err.message);
  }
});

// CLEAR
clearBtn.addEventListener('click', ()=>{
  files.length = 0;
  refreshFileList();
  resultsEl.innerHTML = '';
  previewEl.innerHTML = 'No result yet.';
  log('Cleared.');
});

// UTIL: parse page range like "1-3,5"
function parsePageRange(str, max){
  if(!str || !str.trim()) return Array.from({length:max}, (_,i)=>i+1);
  const parts = str.split(',').map(s=>s.trim()).filter(Boolean);
  const out = new Set();
  for(const p of parts){
    if(p.includes('-')){
      const [a,b] = p.split('-').map(x=>parseInt(x,10));
      if(!isNaN(a) && !isNaN(b)){
        for(let i=Math.max(1,a); i<=Math.min(b,max); i++) out.add(i);
      }
    } else {
      const n = parseInt(p,10);
      if(!isNaN(n) && n>=1 && n<=max) out.add(n);
    }
  }
  return Array.from(out).sort((a,b)=>a-b);
}

// TOOL: Merge PDFs (order of files as uploaded; only PDFs considered)
async function toolMerge(){
  const pdfFiles = files.filter(f=>f.type==='application/pdf').map(f=>f.file);
  if(pdfFiles.length===0){ log('No PDFs to merge'); return; }
  const mergedPdf = await PDFLib.PDFDocument.create();
  for(const f of pdfFiles){
    const ab = await f.arrayBuffer();
    const src = await PDFLib.PDFDocument.load(ab);
    const srcPages = await mergedPdf.copyPages(src, src.getPageIndices());
    srcPages.forEach(p => mergedPdf.addPage(p));
    log(`Merged ${f.name}`);
  }
  const out = await mergedPdf.save();
  const blob = new Blob([out], {type:'application/pdf'});
  addResult(blob, 'merged.pdf');
  log('Merge complete');
}

// TOOL: Split / extract pages
async function toolSplit(){
  const pdf = files.find(f=>f.type==='application/pdf');
  if(!pdf) { log('No PDF found'); return; }
  const ab = await pdf.file.arrayBuffer();
  const src = await PDFLib.PDFDocument.load(ab);
  const max = src.getPageCount();
  const pages = parsePageRange(pageRange.value, max);
  if(pages.length === 0){ log('No pages matched'); return; }
  const zip = new JSZip();
  for(const p of pages){
    const outDoc = await PDFLib.PDFDocument.create();
    const [copied] = await outDoc.copyPages(src, [p-1]);
    outDoc.addPage(copied);
    const outBytes = await outDoc.save();
    zip.file(`${pdf.name.replace(/\.pdf$/i,'')}_page_${p}.pdf`, outBytes);
    log(`Extracted page ${p}`);
  }
  const zblob = await zip.generateAsync({type:'blob'});
  addResult(zblob, pdf.name.replace(/\.pdf$/i,'') + '_pages.zip');
  log('Split complete');
}

// TOOL: PDF → Images
async function toolPdfToImages(){
  const pdfFile = files.find(f=>f.type==='application/pdf');
  if(!pdfFile){ log('No PDF selected'); return; }
  const ab = await pdfFile.file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise;
  const zip = new JSZip();
  for(let p=1;p<=pdf.numPages;p++){
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({scale:2});
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
    const mime = outImgFormat.value;
    const quality = Number(imgQuality.value);
    const dataUrl = canvas.toDataURL(mime, quality);
    const blob = dataURLToBlob(dataUrl);
    zip.file(`${pdfFile.name.replace(/\.pdf$/i,'')}_page_${p}.${mime.includes('png')?'png':'jpg'}`, blob);
    log(`Rendered page ${p}/${pdf.numPages}`);
  }
  const zblob = await zip.generateAsync({type:'blob'});
  addResult(zblob, pdfFile.name.replace(/\.pdf$/i,'') + '_images.zip');
  log('PDF → images complete');
}

// TOOL: Images → PDF
async function toolImagesToPdf(){
  const imgFiles = files.filter(f=>f.type.startsWith('image/')).map(f=>f.file);
  if(imgFiles.length===0){ log('No images found'); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({unit:'pt', format:'a4'});
  let first = true;
  for(const f of imgFiles){
    const dataUrl = await readAsDataURL(f);
    const img = await loadImage(dataUrl);
    // scale to A4 while preserving aspect
    const a4w = 595; const a4h = 842; // points
    let w = img.width; let h = img.height;
    // scale to fit A4
    const ratio = Math.min(a4w / w, a4h / h);
    const pw = w * ratio; const ph = h * ratio;
    if(!first) pdf.addPage();
    pdf.addImage(dataUrl, 'JPEG', (a4w - pw)/2, (a4h - ph)/2, pw, ph);
    first = false;
    log(`Added ${f.name}`);
  }
  const blob = pdf.output('blob');
  addResult(blob, 'images-merged.pdf');
  log('Images → PDF complete');
}

// TOOL: Compress images (re-encode & resize)
async function toolCompressImages(){
  const imgFiles = files.filter(f=>f.type.startsWith('image/')).map(f=>f.file);
  if(imgFiles.length===0){ log('No images found'); return; }
  const zip = new JSZip();
  const q = Number(imgQuality.value);
  const maxW = Number(maxWidth.value) || 1600;
  for(const f of imgFiles){
    const dataUrl = await readAsDataURL(f);
    const img = await loadImage(dataUrl);
    const ratio = Math.min(1, maxW / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(img.width * ratio);
    canvas.height = Math.floor(img.height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const mime = outImgFormat.value;
    const outData = canvas.toDataURL(mime, q);
    const blob = dataURLToBlob(outData);
    zip.file(f.name.replace(/\.[^.]+$/,'') + (mime.includes('png')?'.png':'.jpg'), blob);
    log(`Compressed ${f.name}`);
  }
  const zblob = await zip.generateAsync({type:'blob'});
  addResult(zblob, 'images-compressed.zip');
  log('Compression complete');
}

// TOOL: Rotate pages (PDF)
async function toolRotate(){
  const pdfFile = files.find(f=>f.type==='application/pdf');
  if(!pdfFile){ log('No PDF found'); return; }
  // rotate by 90 degrees for pages in pageRange
  const ab = await pdfFile.file.arrayBuffer();
  const src = await PDFLib.PDFDocument.load(ab);
  const max = src.getPageCount();
  const pages = parsePageRange(pageRange.value, max);
  if(pages.length===0){ log('No pages matched'); return; }
  pages.forEach(p => {
    const page = src.getPage(p-1);
    const rot = (page.getRotation().angle + 90) % 360;
    page.setRotation(rot);
    log(`Rotated page ${p}`);
  });
  const out = await src.save();
  addResult(new Blob([out], {type:'application/pdf'}), pdfFile.name.replace(/\.pdf$/i,'') + '_rotated.pdf');
  log('Rotation complete');
}

// TOOL: Reorder pages (simple drag list) — for demo, we just merge PDF pages in chosen order from a single PDF
// For simplicity, reorder uses pageRange to provide order like "3,1,2"
async function toolReorder(){
  const pdfFile = files.find(f=>f.type==='application/pdf');
  if(!pdfFile){ log('No PDF found'); return; }
  const ab = await pdfFile.file.arrayBuffer();
  const src = await PDFLib.PDFDocument.load(ab);
  const max = src.getPageCount();
  // parse pageRange as a list (not ranges) to get explicit order
  const raw = (pageRange.value || '').split(',').map(s=>s.trim()).filter(Boolean).map(x=>parseInt(x,10)).filter(n=>!isNaN(n) && n>=1 && n<=max);
  if(raw.length===0){ log('Provide comma-separated page order, e.g. 3,1,2'); return; }
  const outDoc = await PDFLib.PDFDocument.create();
  const copied = await outDoc.copyPages(src, raw.map(n=>n-1));
  copied.forEach(p => outDoc.addPage(p));
  const out = await outDoc.save();
  addResult(new Blob([out], {type:'application/pdf'}), pdfFile.name.replace(/\.pdf$/i,'') + '_reordered.pdf');
  log('Reorder complete');
}

// TOOL: OCR images
async function toolOcr(){
  const imgFiles = files.filter(f=>f.type.startsWith('image/')).map(f=>f.file);
  if(imgFiles.length===0){ log('No images found'); return; }
  const zip = new JSZip();
  for(const f of imgFiles){
    log(`Running OCR on ${f.name}...`);
    const dataUrl = await readAsDataURL(f);
    const worker = Tesseract.createWorker({
      // logger: m => console.log(m) // enable for debugging progress
    });
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(dataUrl);
    await worker.terminate();
    zip.file(f.name.replace(/\.[^.]+$/,'') + '.txt', text);
    log(`OCR complete for ${f.name}`);
  }
  const zblob = await zip.generateAsync({type:'blob'});
  addResult(zblob, 'ocr-results.zip');
  log('OCR finished');
}

// ===== helpers =====
function readAsDataURL(file){ return new Promise((res,rej)=> { const r = new FileReader(); r.onload = ()=>res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
function loadImage(url){ return new Promise((res,rej)=> { const i = new Image(); i.onload = ()=>res(i); i.onerror = rej; i.src = url; }); }
function dataURLToBlob(dataURL){ const parts = dataURL.split(','); const m = parts[0].match(/:(.*?);/); const mime = m?m[1]:'application/octet-stream'; const bin = atob(parts[1]); const len = bin.length; const arr = new Uint8Array(len); for(let i=0;i<len;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr], {type: mime}); }

function addResult(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.className = 'result-link';
  a.textContent = 'Download ' + name;
  resultsEl.appendChild(a);
}

// END

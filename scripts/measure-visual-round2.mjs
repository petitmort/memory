import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir, writeFile, rename} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
const {chromium}=createRequire(new URL('../package.json',import.meta.url))('@playwright/test');
const options={};
for(let i=2;i<process.argv.length;i++){
 const arg=process.argv[i];if(!arg.startsWith('--'))throw new Error(`Unexpected argument: ${arg}`);
 const at=arg.indexOf('=');const key=arg.slice(2,at<0?undefined:at);
 options[key]=at<0?(process.argv[i+1]?.startsWith('--')||!process.argv[i+1]?true:process.argv[++i]):arg.slice(at+1);
}
if(options.help){console.log('node scripts/measure-visual-round2.mjs --base=http://127.0.0.1:4185/memory/ --out=.work/visual2-20261115/before.json --label=before --repeats=3 --case=all [--thunder=0|1] [--min-frames=30 --min-ms=5000 --max-ms=120000]');process.exit(0);}
const numeric=(key,fallback,min=0)=>{const v=Number(options[key]??fallback);if(!Number.isFinite(v)||v<min)throw new Error(`Invalid --${key}`);return v;};
const repeats=numeric('repeats',3,1),minFrames=numeric('min-frames',30,30),minMs=numeric('min-ms',5000,5000),maxMs=numeric('max-ms',120000,5000),cpu=4;
if(!Number.isInteger(repeats)||maxMs<minMs)throw new Error('Invalid repeat count or sampling window');
const label=String(options.label??'before'),base=new URL(String(options.base??'http://127.0.0.1:4185/memory/'));
const output=resolve(String(options.out??`.work/visual2-20261115/${label}-perf.json`));
const thunder=numeric('thunder',0);if(thunder>1)throw new Error('--thunder must be between 0 and 1');
const cases=[
 {id:'sunny-desktop',width:1280,height:800,date:'2026-10-31T12:00',weather:'clear',quality:'normal',wind:4,cloud:0,rain:0,waves:.6,thunder:0},
 {id:'storm-desktop',width:1280,height:800,date:'2026-10-31T17:10',weather:'thunderstorm',quality:'normal',wind:12,cloud:1,rain:1,waves:1.3,thunder},
 {id:'storm-phone',width:390,height:844,date:'2026-10-31T17:10',weather:'thunderstorm',quality:'low',wind:12,cloud:1,rain:1,waves:1.3,thunder},
];
const aliases={sunny:'sunny-desktop',storm:'storm-desktop',thunderstorm:'storm-desktop',phone:'storm-phone'};
const selection=String(options.case??'all').split(',').map(v=>aliases[v]??v);
const selected=selection.includes('all')?cases:cases.filter(c=>selection.includes(c.id));if(!selected.length||selection.some(s=>s!=='all'&&!cases.some(c=>c.id===s)))throw new Error('Unknown --case');
const percentile=(values,fraction)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)];};
const summarize=values=>({p50:percentile(values,.5),p95:percentile(values,.95),min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null});
const metricMap=metrics=>Object.fromEntries(metrics.metrics.map(m=>[m.name,m.value]));
const report={schema:1,label,base:base.href,method:{cpuThrottle:cpu,deviceScaleFactor:1,reducedMotion:false,seed:'0x12345678',minFrames,minMs,maxMs,coldContextPerSample:true,coldBrowserPerSample:true,clock:'native Date/performance.now/RAF timestamps unchanged',probe:'HTTP-only WebGLRenderer construction wrapper; native RAF callback timing only when it actually calls renderer.render',notes:['CPU4 is enabled only after room entry and preparation; load/entry times are CPU1 observations.','Callback/update/renderSubmit are elapsed main-thread timings and may include driver stalls. They are not GPU-completion time or physical-device FPS.','CDP Task/Script/Layout/Style metrics overlap; do not sum them. JS heap excludes GPU/browser-process memory.','Identical probe overhead is present before and after; this is an instrumented comparison, not an uninstrumented latency claim.','Default thunder=0 provides a steady rain/wave/cloth workload matching the visual baseline, excluding lightning peaks. Use --thunder=1 for a separately labeled natural-storm sample.','URL debug date is reset after entry; native time then advances normally. Sampling never freezes or accelerates the page clock.']},samples:[],summary:[]};
await mkdir(dirname(output),{recursive:true});
async function save(){await writeFile(output+'.tmp',JSON.stringify(report,null,2)+'\n');await rename(output+'.tmp',output);}
for(const config of selected)for(let repeat=1;repeat<=repeats;repeat++){
 const sample={case:config.id,repeat,config,errors:[],consoleErrors:[],warnings:[],failedRequests:[],httpErrors:[],probeAssets:[],qualificationWarnings:[]};report.samples.push(sample);
 let browser,context;
 try{
  console.log(JSON.stringify({stage:'start',label,case:config.id,repeat}));
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});sample.browser=browser.version();
  context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:1,reducedMotion:'no-preference',timezoneId:'Asia/Shanghai'});
  const page=await context.newPage();page.setDefaultTimeout(180000);
  page.on('pageerror',e=>sample.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')sample.consoleErrors.push(m.text());else if(m.type()==='warning'&&sample.warnings.length<30)sample.warnings.push(m.text());});
  page.on('requestfailed',r=>sample.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)sample.httpErrors.push({url:r.url(),status:r.status()});});
  await page.addInitScript(()=>{
   localStorage.setItem('tideline-room-light-v2',JSON.stringify({enabled:true,color:'#ffd6a3',brightness:50}));
   let seed=0x12345678;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
   const p=window.__visual2Perf={renderer:null,enabled:false,frames:[],current:null};
   const nativeRAF=window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame=callback=>nativeRAF(timestamp=>{
    if(!p.enabled)return callback(timestamp);
    const previous=p.current,frame={start:performance.now(),rafTimestamp:timestamp,renderCalls:0,renderSubmitMs:0,firstRenderAt:null};p.current=frame;
    try{return callback(timestamp);}finally{
     const end=performance.now();p.current=previous;
     if(frame.renderCalls)p.frames.push({start:frame.start,rafTimestamp:timestamp,totalMs:end-frame.start,updateMs:frame.firstRenderAt-frame.start,renderSubmitMs:frame.renderSubmitMs,tailMs:Math.max(0,end-frame.start-(frame.firstRenderAt-frame.start)-frame.renderSubmitMs),renderCalls:frame.renderCalls});
    }
   });
   p.attach=renderer=>{
    if(p.renderer)throw new Error('Multiple renderer constructors were intercepted');p.renderer=renderer;
    const render=renderer.render;renderer.render=function(...args){const frame=p.enabled?p.current:null;if(!frame)return render.apply(this,args);const start=performance.now();frame.firstRenderAt??=start;frame.renderCalls++;try{return render.apply(this,args);}finally{frame.renderSubmitMs+=performance.now()-start;}};
    return renderer;
   };
   p.snapshot=()=>{
    const r=p.renderer;if(!r)throw new Error('Renderer probe is missing');const gl=r.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
    return{geometries:r.info.memory.geometries,textures:r.info.memory.textures,programs:r.info.programs.length,calls:r.info.render.calls,triangles:r.info.render.triangles,pixelRatio:r.getPixelRatio(),shadowMapEnabled:r.shadowMap.enabled,canvas:[r.domElement.width,r.domElement.height],viewport:[innerWidth,innerHeight],deviceDPR:devicePixelRatio,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,renderer:gl.getParameter(debug?debug.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(debug?debug.UNMASKED_VENDOR_WEBGL:gl.VENDOR),qualityControl:document.querySelector('#env-quality')?.value,environment:document.querySelector('.environment-debug-status')?.textContent,recordState:document.querySelector('#record-state')?.textContent,stage:document.body.dataset.stage};
   };
  });
  await page.route(/\/assets\/(?:main|index)-[^/]+\.js(?:\?.*)?$/,async route=>{
   const response=await route.fetch();let source=await response.text();
   const expression=/new\s+[A-Za-z_$][\w$]*\(\{antialias:!0,alpha:!1,powerPreference:"high-performance"\}\)/g;
   const matches=[...source.matchAll(expression)];if(matches.length!==1)throw new Error(`Expected one production WebGLRenderer constructor, found ${matches.length}`);
   sample.probeAssets.push({url:route.request().url(),originalSHA256:createHash('sha256').update(source).digest('hex'),matches:matches.length});
   source=source.replace(expression,match=>`globalThis.__visual2Perf.attach(${match})`);await route.fulfill({response,body:source});
  });
  const url=new URL(base);const params={debugEnv:'1',envTimeMode:'scene',envDate:config.date,envWeather:config.weather,envQuality:config.quality,envWind:String(config.wind),envWindDirection:'225',envCloud:String(config.cloud),envPrecipitation:String(config.rain),envWaves:String(config.waves),envThunder:String(config.thunder),envDensity:'0',envBirdDensity:'0'};
  for(const[key,value]of Object.entries(params))url.searchParams.set(key,value);sample.url=url.href;
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  const loadingStart=performance.now();await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden'});sample.loadingCPU1Ms=performance.now()-loadingStart;
  if(!await page.evaluate(()=>!!window.__visual2Perf?.renderer))throw new Error('Production constructor response probe did not attach');
  const enteringStart=performance.now();await page.locator('#enter').click();await page.waitForFunction(()=>!document.querySelector('#enter').disabled);await page.locator('#enter').click();await page.locator('#room-ui').waitFor({state:'visible'});sample.entryCPU1Ms=performance.now()-enteringStart;
  await page.keyboard.press('Shift');
  await page.evaluate(date=>{const input=document.querySelector('#env-date');input.value=date;input.dispatchEvent(new Event('change',{bubbles:true}));},config.date);
  await page.waitForTimeout(7000);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});await page.waitForTimeout(2000);
  sample.before=await page.evaluate(()=>window.__visual2Perf.snapshot());
  const metricsBefore=metricMap(await cdp.send('Performance.getMetrics'));
  const started=await page.evaluate(()=>{const p=window.__visual2Perf;p.frames.length=0;p.enabled=true;return performance.now();});
  await page.waitForTimeout(minMs);
  let check=await page.evaluate(()=>({count:window.__visual2Perf.frames.length,now:performance.now()}));
  while(check.count<minFrames&&check.now-started<maxMs){await page.waitForTimeout(1000);check=await page.evaluate(()=>({count:window.__visual2Perf.frames.length,now:performance.now()}));}
  const measured=await page.evaluate(()=>{const p=window.__visual2Perf;p.enabled=false;return{end:performance.now(),frames:p.frames,snapshot:p.snapshot()};});
  const metricsAfter=metricMap(await cdp.send('Performance.getMetrics'));
  sample.frames=measured.frames;sample.after=measured.snapshot;sample.sampleWallMs=measured.end-started;sample.drawnFrames=sample.frames.length;
  const intervals=sample.frames.slice(1).map((frame,i)=>frame.start-sample.frames[i].start);
  sample.timings={totalMs:summarize(sample.frames.map(f=>f.totalMs)),updateMs:summarize(sample.frames.map(f=>f.updateMs)),renderSubmitMs:summarize(sample.frames.map(f=>f.renderSubmitMs)),tailMs:summarize(sample.frames.map(f=>f.tailMs)),frameIntervalMs:summarize(intervals)};
  sample.observedFrameRate=intervals.length?1000*intervals.length/intervals.reduce((a,b)=>a+b,0):null;
  sample.cdp={durationSeconds:{},heapBeforeBytes:metricsBefore.JSHeapUsedSize,heapAfterBytes:metricsAfter.JSHeapUsedSize,domCounters:await cdp.send('Memory.getDOMCounters')};
  for(const key of['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'])sample.cdp.durationSeconds[key]=(metricsAfter[key]??0)-(metricsBefore[key]??0);
  if(sample.drawnFrames<minFrames)sample.qualificationWarnings.push(`Insufficient rendered frames: ${sample.drawnFrames}<${minFrames} after ${sample.sampleWallMs.toFixed(0)}ms`);
  if(sample.sampleWallMs<minMs)sample.qualificationWarnings.push('Sampling window too short');
  for(const key of['pixelRatio','shadowMapEnabled','qualityControl'])if(sample.before[key]!==sample.after[key])sample.qualificationWarnings.push(`Quality changed during sample: ${key}`);
  if(sample.before.qualityControl!==config.quality||sample.before.pixelRatio!==1||sample.before.shadowMapEnabled!==(config.quality==='normal'))sample.qualificationWarnings.push('Requested cold quality/DPR did not match renderer state');
  for(const key of['geometries','textures','programs'])if(sample.before[key]!==sample.after[key])sample.qualificationWarnings.push(`Resource count changed during sampling: ${key}`);
  if(!sample.after.stage||sample.after.stage!=='room')sample.qualificationWarnings.push('Sample did not remain in room state');
  sample.qualified=sample.qualificationWarnings.length===0&&sample.errors.length===0&&sample.consoleErrors.length===0&&sample.failedRequests.length===0&&sample.httpErrors.length===0;
 }catch(error){sample.failure=String(error.stack??error);sample.qualified=false;}
 finally{await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await save();console.log(JSON.stringify({stage:'finished',label,case:config.id,repeat,qualified:sample.qualified,frames:sample.drawnFrames,ms:sample.sampleWallMs,total:sample.timings?.totalMs,update:sample.timings?.updateMs,warnings:sample.qualificationWarnings,failure:sample.failure}));}
}
report.summary=selected.map(config=>{
 const all=report.samples.filter(s=>s.case===config.id),valid=all.filter(s=>s.qualified);
 return{case:config.id,total:all.length,qualified:valid.length,medianOfRunP50:{totalMs:percentile(valid.map(s=>s.timings.totalMs.p50),.5),updateMs:percentile(valid.map(s=>s.timings.updateMs.p50),.5),renderSubmitMs:percentile(valid.map(s=>s.timings.renderSubmitMs.p50),.5)},medianOfRunP95:{totalMs:percentile(valid.map(s=>s.timings.totalMs.p95),.5),updateMs:percentile(valid.map(s=>s.timings.updateMs.p95),.5),renderSubmitMs:percentile(valid.map(s=>s.timings.renderSubmitMs.p95),.5)}};
});
await save();console.log(JSON.stringify({output,summary:report.summary,samples:report.samples.length,qualified:report.samples.filter(s=>s.qualified).length}));
if(report.samples.some(s=>!s.qualified))process.exitCode=1;

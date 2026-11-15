import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const {chromium}=createRequire(new URL('../package.json',import.meta.url))('@playwright/test');
const options={};
for(let i=2;i<process.argv.length;i++){
 const argument=process.argv[i];if(!argument.startsWith('--'))throw new Error(`Unexpected argument ${argument}`);
 const equal=argument.indexOf('='),key=argument.slice(2,equal<0?undefined:equal);
 options[key]=equal<0?(process.argv[i+1]?.startsWith('--')||!process.argv[i+1]?true:process.argv[++i]):argument.slice(equal+1);
}
if(options.help){console.log('node scripts/capture-visual-round2.mjs --base=http://127.0.0.1:4185/memory/ --out=.work/visual2-20261115/before-capture --label=before [--cases=all|sunny,night,...] [--mode=all|matrix|cold]');process.exit(0);}
const base=new URL(String(options.base??'http://127.0.0.1:4185/memory/')),label=String(options.label??'before');
const out=resolve(String(options.out??`.work/visual2-20261115/${label}-capture`));
const mode=String(options.mode??'all');if(!['all','matrix','cold'].includes(mode))throw new Error('Unknown --mode');
const cases=[
 {id:'sunny',date:'2026-10-31T12:00',weather:'clear',wind:4,cloud:0,rain:0,waves:.6,phase:''},
 {id:'sunset',date:'2026-10-31T17:10',weather:'clear',wind:4,cloud:0,rain:0,waves:.6,phase:''},
 {id:'night',date:'2026-11-24T23:00',weather:'clear',wind:4,cloud:0,rain:0,waves:.6,phase:'0.5'},
 {id:'overcast',date:'2026-10-31T12:00',weather:'overcast',wind:6,cloud:.94,rain:0,waves:.8,phase:''},
 {id:'rain-dusk',date:'2026-10-31T17:10',weather:'rain',wind:8,cloud:.95,rain:.6,waves:1,phase:''},
 {id:'thunderstorm',date:'2026-10-31T17:10',weather:'thunderstorm',wind:12,cloud:1,rain:1,waves:1.3,phase:''},
];
const selectedNames=String(options.cases??options.case??'all').split(','),selected=selectedNames.includes('all')?cases:cases.filter(c=>selectedNames.includes(c.id));
if(!selected.length||selectedNames.some(v=>v!=='all'&&!cases.some(c=>c.id===v)))throw new Error('Unknown --cases');
const sizes=[['desktop',1280,800],['portrait',390,844],['landscape',844,390]];
const report={schema:1,label,base:base.href,protocol:{fixedDate:'2026-11-15T04:00:00Z',timezone:'Asia/Shanghai',deviceScaleFactor:1,reducedMotion:false,seed:'0x12345678',clock:'Only Date is fixed for absolute calendar stability; original native RAF timestamp is passed unchanged. Each actual sea-time phase is recorded, not promised equal across versions.',freeze:'Pause only after a real renderer.render call has completed inside native RAF. Pending callbacks preserve cancellation and resume afterward.',matrix:'One 1280x800/normal-initialized context, six weather transitions, viewport and quality changes. Not cold mobile/low quality initialization.',cold:'Separate 390x844 contexts, sunny/night x normal/low initialized before prewarm.',variants:'After-label cold portrait only: inline CSS stop76/52/56/58 at one frozen WebGL frame; finish only the CSS transition and restore original inline value. These are diagnostic candidates, not applied source changes.',limits:['No CPU/FPS/performance conclusion from these captures.','Clock12:00 is an intentional capture setting, separate from the scene calendar.','Ships/birds and thunder flashes disabled for steady visual comparison, not full sailing/lightning acceptance.','Full real interaction and original clock behavior are verified separately by the root.']},contexts:[],errors:[]};
await mkdir(out,{recursive:true});const output=join(out,'capture.json');
const save=async()=>{await writeFile(output+'.tmp',JSON.stringify(report,null,2)+'\n');await rename(output+'.tmp',output);};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader']});report.browser=browser.version();
async function openContext(viewport,initial,quality,kind){
 const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference',timezoneId:'Asia/Shanghai'});
 const page=await context.newPage();page.setDefaultTimeout(180000);
 const record={kind,initialViewport:viewport,initialQuality:quality,config:initial,shots:[],variants:[],supplements:[],pageErrors:[],consoleErrors:[],warnings:[],failedRequests:[],httpErrors:[],probeAssets:[]};report.contexts.push(record);
 page.on('pageerror',e=>record.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')record.consoleErrors.push(m.text());else if(m.type()==='warning'&&record.warnings.length<20)record.warnings.push(m.text());});
 page.on('requestfailed',r=>record.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)record.httpErrors.push({url:r.url(),status:r.status()});});
 await page.clock.setFixedTime(new Date(report.protocol.fixedDate));
 await page.addInitScript(()=>{
  localStorage.setItem('tideline-room-light-v2',JSON.stringify({enabled:true,color:'#ffd6a3',brightness:50}));
  let seed=0x12345678;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const p=window.__visual2Capture={renderer:null,scene:null,camera:null,paused:false,freezeNext:false,drawn:0,inFrame:null};
  const nativeRAF=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window);let next=1;const jobs=new Map();
  const schedule=job=>{job.native=nativeRAF(timestamp=>{
   job.native=null;if(!jobs.has(job.id))return;if(p.paused)return;jobs.delete(job.id);
   const previous=p.inFrame,frame={rendered:false};p.inFrame=frame;
   try{return job.callback(timestamp);}finally{p.inFrame=previous;if(p.freezeNext&&frame.rendered){p.paused=true;p.freezeNext=false;}}
  });};
  window.requestAnimationFrame=callback=>{const job={id:next++,callback,native:null};jobs.set(job.id,job);if(!p.paused)schedule(job);return job.id;};
  window.cancelAnimationFrame=id=>{const job=jobs.get(id);if(!job)return;if(job.native!==null)nativeCancel(job.native);jobs.delete(id);};
  p.resume=()=>{p.paused=false;p.freezeNext=false;for(const job of jobs.values())if(job.native===null)schedule(job);};
  p.attach=renderer=>{if(p.renderer)throw new Error('Multiple renderer instances');p.renderer=renderer;const original=renderer.render;renderer.render=function(scene,camera,...rest){const result=original.call(this,scene,camera,...rest);p.scene=scene;p.camera=camera;p.drawn++;if(p.inFrame)p.inFrame.rendered=true;return result;};return renderer;};
  p.ocean=()=>{let found;p.scene?.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.uniforms?.windSpeed&&m.uniforms?.waveScale&&m.uniforms?.beaconStrength)found=m.uniforms;});return found;};
  p.snapshot=()=>{
   const r=p.renderer,u=p.ocean(),gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),v=document.querySelector('.vignette'),style=v?getComputedStyle(v):null;
   const shadows=[];p.scene?.traverse(o=>{if(o.isLight&&o.castShadow)shadows.push({name:o.name,type:o.type,mapSize:o.shadow.mapSize.toArray()});});
   return{drawn:p.drawn,held:p.paused,seaTime:u?.time.value,wind:u?.windSpeed.value,rain:u?.rainAmount.value,waves:u?.waveScale.value,windDirection:u?.windDirection.value,stormFlash:u?.stormFlash.value,qualityControl:document.querySelector('#env-quality')?.value,shadowMapEnabled:r.shadowMap.enabled,shadowMaps:shadows,pixelRatio:r.getPixelRatio(),canvas:[r.domElement.width,r.domElement.height],viewport:[innerWidth,innerHeight],camera:p.camera?{position:p.camera.position.toArray(),quaternion:p.camera.quaternion.toArray(),fov:p.camera.fov}:null,resources:{...r.info.memory,programs:r.info.programs.length,calls:r.info.render.calls,triangles:r.info.render.triangles},renderer:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(ext?ext.UNMASKED_VENDOR_WEBGL:gl.VENDOR),stage:document.body.dataset.stage,vignetteMarker:document.body.dataset.roomVignette??null,vignetteStop:style?.getPropertyValue('--room-vignette-stop').trim(),vignetteOpacity:style?.opacity,vignetteBackground:style?.backgroundImage,light:JSON.parse(localStorage.getItem('tideline-room-light-v2')),environment:document.querySelector('.environment-debug-status')?.textContent,recordState:document.querySelector('#record-state')?.textContent};
  };
 });
 await page.route(/\/assets\/(?:main|index)-[^/]+\.js(?:\?.*)?$/,async route=>{
  const response=await route.fetch();let source=await response.text();const pattern=/new\s+[A-Za-z_$][\w$]*\(\{antialias:!0,alpha:!1,powerPreference:"high-performance"\}\)/g;
  const matches=[...source.matchAll(pattern)];if(matches.length!==1)throw new Error(`Expected one renderer construction, found ${matches.length}`);
  record.probeAssets.push({url:route.request().url(),originalSHA256:createHash('sha256').update(source).digest('hex')});
  source=source.replace(pattern,m=>`globalThis.__visual2Capture.attach(${m})`);await route.fulfill({response,body:source});
 });
 const url=new URL(base),params={debugEnv:'1',envTimeMode:'scene',envDate:initial.date,envWeather:initial.weather,envCloud:String(initial.cloud),envWind:String(initial.wind),envWindDirection:'225',envPrecipitation:String(initial.rain),envWaves:String(initial.waves),envDensity:'0',envBirdDensity:'0',envThunder:'0',envQuality:quality};if(initial.phase)params.envPhase=initial.phase;
 for(const[key,value]of Object.entries(params))url.searchParams.set(key,value);record.url=url.href;
 try{
  await page.goto(url.href,{waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden'});
  await page.locator('#enter').click();await page.waitForFunction(()=>!document.querySelector('#enter').disabled);await page.locator('#enter').click();await page.locator('#room-ui').waitFor({state:'visible'});
  await page.keyboard.press('Shift');await page.addStyleTag({content:'.environment-debug{visibility:hidden!important}'});await page.waitForTimeout(1200);
  if(label.startsWith('after'))await page.waitForFunction(()=>typeof CSSPropertyRule==='undefined'||Math.abs(parseFloat(getComputedStyle(document.querySelector('.vignette')).getPropertyValue('--room-vignette-stop'))-56)<.01);
  return{context,page,record};
 }catch(error){record.failure=String(error.stack??error);report.errors.push({kind,error:record.failure});await context.close();await save();throw error;}
}
async function control(page,id,value){await page.evaluate(({id,value})=>{const input=document.getElementById(id);if(!input)throw new Error('Missing debug control '+id);input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));},{id,value});}
async function applyCase(page,c){
 await page.evaluate(()=>window.__visual2Capture.resume());
 await page.evaluate(c=>{
  const values={'env-date':c.date,'env-time-mode':'scene','env-weather':c.weather,'env-phase':c.phase,'env-cloud':c.cloud,'env-wind':c.wind,'env-wind-direction':225,'env-precipitation':c.rain,'env-waves':c.waves,'env-thunder':0,'env-density':0,'env-bird-density':0};
  for(const[id,value]of Object.entries(values)){const input=document.getElementById(id);if(!input)throw new Error('Missing debug control '+id);input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));}
 },c);
 await page.waitForTimeout(7000);
 await page.waitForFunction(c=>{const u=window.__visual2Capture.ocean();return u&&Math.abs(u.windSpeed.value-c.wind)<.001&&Math.abs(u.rainAmount.value-c.rain)<.001&&Math.abs(u.waveScale.value-c.waves)<.001;},c,{timeout:90000});
}
async function freeze(page){
 await page.evaluate(()=>{window.__visual2Capture.freezeNext=true;});await page.waitForFunction(()=>window.__visual2Capture.paused);
}
async function capture(page,record,c,quality,size,width,height,cold=false){
 await page.evaluate(()=>window.__visual2Capture.resume());await page.setViewportSize({width,height});
 const before=await page.evaluate(()=>window.__visual2Capture.drawn);await page.waitForFunction(n=>window.__visual2Capture.drawn>=n+2,before);
 await page.waitForTimeout(1100);await freeze(page);
 const snapshot=await page.evaluate(()=>window.__visual2Capture.snapshot());
 if(snapshot.shadowMapEnabled!==(quality==='normal')||snapshot.pixelRatio!==1)throw new Error('Actual quality/DPR does not match requested capture');
 if(Math.abs(snapshot.wind-c.wind)>.001||Math.abs(snapshot.rain-c.rain)>.001||Math.abs(snapshot.waves-c.waves)>.001)throw new Error('Ocean uniforms changed before capture');
 const file=`${label}-${c.id}-${quality}-${size}${cold?'-cold':''}.png`;await page.screenshot({path:join(out,file),timeout:90000});
 record.shots.push({file,case:c.id,quality,size:[width,height],cold,...snapshot});console.log(JSON.stringify({stage:'shot',file,seaTime:snapshot.seaTime,resources:snapshot.resources}));
 if(!cold&&c.id==='sunny'&&quality==='normal'&&size==='landscape'){
  await page.locator('#room-settings').click();await page.locator('#room-settings-menu').waitFor({state:'visible'});
  const menuFile=`${label}-sunny-normal-landscape-settings.png`;
  await page.screenshot({path:join(out,menuFile),timeout:90000});
  const panels=await page.evaluate(()=>Object.fromEntries(['room-ui','room-settings-menu'].map(id=>[id,document.getElementById(id).getBoundingClientRect().toJSON()])));
  record.supplements.push({file:menuFile,kind:'same-held-frame-disclosure',panels,...await page.evaluate(()=>window.__visual2Capture.snapshot())});
  await page.locator('#room-settings').click();
 }
 if(cold&&label.startsWith('after')){
  const original=await page.evaluate(()=>{const e=document.querySelector('.vignette');return{value:e.style.getPropertyValue('--room-vignette-stop'),priority:e.style.getPropertyPriority('--room-vignette-stop')};});
  try{
   for(const stop of[76,52,56,58]){
    await page.evaluate(stop=>{const e=document.querySelector('.vignette');e.style.setProperty('--room-vignette-stop',stop+'%');getComputedStyle(e).getPropertyValue('--room-vignette-stop');for(const a of e.getAnimations())if(a.transitionProperty==='--room-vignette-stop')a.finish();},stop);
    const actual=await page.evaluate(()=>({stop:getComputedStyle(document.querySelector('.vignette')).getPropertyValue('--room-vignette-stop').trim(),seaTime:window.__visual2Capture.ocean().time.value,held:window.__visual2Capture.paused}));
    if(!actual.held||actual.seaTime!==snapshot.seaTime||Math.abs(parseFloat(actual.stop)-stop)>.01)throw new Error('CSS candidate did not settle on the same frozen WebGL frame');
    const candidate=`${label}-${c.id}-${quality}-portrait-cold-stop-${stop}.png`;await page.screenshot({path:join(out,candidate),timeout:90000});record.variants.push({file:candidate,stop,...actual});
   }
  }finally{
   await page.evaluate(original=>{const e=document.querySelector('.vignette');if(original.value)e.style.setProperty('--room-vignette-stop',original.value,original.priority);else e.style.removeProperty('--room-vignette-stop');getComputedStyle(e).getPropertyValue('--room-vignette-stop');for(const a of e.getAnimations())if(a.transitionProperty==='--room-vignette-stop')a.finish();},original);
  }
 }
 await page.evaluate(()=>window.__visual2Capture.resume());await save();
}
try{
 if(mode!=='cold'){
  let run;
  try{
   run=await openContext({width:1280,height:800},selected[0],'normal','desktop-initialized-matrix');
   for(const c of selected){
    console.log(JSON.stringify({stage:'case',case:c.id,label}));
    try{
     await run.page.evaluate(()=>window.__visual2Capture.resume());await run.page.setViewportSize({width:1280,height:800});await control(run.page,'env-quality','normal');await applyCase(run.page,c);
     for(const quality of['normal','low']){
      await control(run.page,'env-quality',quality);await run.page.waitForFunction(low=>window.__visual2Capture.renderer.shadowMap.enabled===!low,quality==='low');
      for(const[size,width,height]of sizes)await capture(run.page,run.record,c,quality,size,width,height);
     }
    }catch(error){report.errors.push({kind:'matrix',case:c.id,error:String(error.stack??error)});await run.page.evaluate(()=>window.__visual2Capture.resume()).catch(()=>{});await save();}
   }
  }finally{await run?.context.close();await save();}
 }
 if(mode!=='matrix')for(const c of selected.filter(c=>['sunny','night'].includes(c.id)))for(const quality of['normal','low']){
  let run;
  try{
   console.log(JSON.stringify({stage:'cold',case:c.id,quality,label}));run=await openContext({width:390,height:844},c,quality,'native-portrait-cold');
   await applyCase(run.page,c);await capture(run.page,run.record,c,quality,'portrait',390,844,true);
  }catch(error){report.errors.push({kind:'cold',case:c.id,quality,error:String(error.stack??error)});await save();}
  finally{await run?.context.close();await save();}
 }
}finally{await browser.close();}
const images=report.contexts.reduce((n,c)=>n+c.shots.length,0),variants=report.contexts.reduce((n,c)=>n+c.variants.length,0);
report.summary={images,variants,errors:report.errors.length,pageErrors:report.contexts.reduce((n,c)=>n+c.pageErrors.length,0),consoleErrors:report.contexts.reduce((n,c)=>n+c.consoleErrors.length,0),failedRequests:report.contexts.reduce((n,c)=>n+c.failedRequests.length,0),httpErrors:report.contexts.reduce((n,c)=>n+c.httpErrors.length,0)};
await save();console.log(JSON.stringify({output,summary:report.summary}));
if(Object.entries(report.summary).some(([key,value])=>!['images','variants'].includes(key)&&value>0))process.exitCode=1;

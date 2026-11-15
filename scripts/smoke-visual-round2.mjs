import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
const {chromium, expect: rawExpect}=createRequire(new URL('../package.json',import.meta.url))('@playwright/test');
const args={};
for(let i=2;i<process.argv.length;i++){
  const [key,...value]=process.argv[i].replace(/^--/,'').split('=');
  args[key]=value.length?value.join('='):true;
}
if(args.help){
  console.log('node scripts/smoke-visual-round2.mjs [--base=http://127.0.0.1:4186/memory/] [--out=.work/visual2-20261115/production-smoke] [--views=desktop,phone]');
  console.log('Fresh sequential native-motion production contexts. No debugEnv, clock/RAF changes, private drafts or mocked media/rendering. Each async operation allows 180 seconds on software WebGL.');
  process.exit(0);
}
for(const key of Object.keys(args))if(!['base','out','views'].includes(key))throw new Error(`Unknown option --${key}`);
const base=new URL(String(args.base??'http://127.0.0.1:4186/memory/'));
if(base.search||base.hash)throw new Error('Base must have no query/hash; this run uses the real production defaults.');
const output=resolve(String(args.out??'.work/visual2-20261115/production-smoke'));
const selected=String(args.views??'desktop,phone').split(',');
const views={desktop:{width:1280,height:800},phone:{width:390,height:844}};
if(selected.some(id=>!views[id]))throw new Error('Views must be desktop,phone');
const expect=rawExpect.configure({timeout:180000});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schema:1,base:base.href,startedAt:new Date().toISOString(),method:{deviceScaleFactor:1,
  timezone:'Asia/Shanghai',motion:'no-preference',clock:'Native Date/performance/RAF; no freezing or timewarp',
  defaults:'No debugEnv or seeded storage, natural environment/time and adaptive quality',
  audio:'Real HTMLAudioElement observed through native constructor forwarding; playback state/progress only, not physical sound quality or audible synchronization',
  isolation:'New browser context per view; no personal drafts loaded or written',
  loss:'WEBGL_lose_context on the existing canvas context; retry through the real reload button'},runs:[]};
await mkdir(output,{recursive:true});
const save=()=>writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    args:['--no-sandbox','--enable-unsafe-swiftshader']});
  report.browser=browser.version();
  for(const id of selected){
    const run={id,viewport:views[id],steps:[],screenshots:[],pageErrors:[],consoleErrors:[],warnings:[],
      failedRequests:[],httpErrors:[],assets:[],assetHashErrors:[]};
    report.runs.push(run);
    const context=await browser.newContext({viewport:views[id],deviceScaleFactor:1,
      reducedMotion:'no-preference',timezoneId:'Asia/Shanghai'});
    const page=await context.newPage();page.setDefaultTimeout(180000);page.setDefaultNavigationTimeout(180000);
    let phase='load';const pendingAssets=[];
    page.on('pageerror',error=>run.pageErrors.push({phase,message:error.message}));
    page.on('console',message=>{
      const entry={phase,message:message.text()};
      if(message.type()==='error')run.consoleErrors.push(entry);
      else if(message.type()==='warning')run.warnings.push(entry);
    });
    page.on('requestfailed',request=>run.failedRequests.push({phase,url:request.url(),error:request.failure()?.errorText}));
    page.on('response',response=>{
      if(response.status()>=400)run.httpErrors.push({phase,url:response.url(),status:response.status()});
      if(response.status()===200&&/\/assets\/[^/?]+\.(js|css)(?:\?|$)/.test(response.url())){
        const atPhase=phase;
        pendingAssets.push(response.body().then(bytes=>run.assets.push({phase:atPhase,url:response.url(),bytes:bytes.length,sha256:sha(bytes)}))
          .catch(error=>run.assetHashErrors.push({phase:atPhase,url:response.url(),error:String(error)})));
      }
    });
    await page.addInitScript(()=>{
      const NativeAudio=window.Audio;
      function ObservedAudio(...sources){const audio=new NativeAudio(...sources);window.__smokeAudio=audio;return audio;}
      ObservedAudio.prototype=NativeAudio.prototype;window.Audio=ObservedAudio;
    });
    const media=()=>page.evaluate(()=>{
      const a=window.__smokeAudio;
      return a?{source:a.currentSrc||a.src,paused:a.paused,time:a.currentTime,duration:Number.isFinite(a.duration)?a.duration:null,
        readyState:a.readyState,error:a.error?{code:a.error.code,message:a.error.message}:null}:null;
    });
    const state=()=>page.evaluate(()=>({stage:document.body.dataset.stage,roomVignette:document.body.dataset.roomVignette,
      quality:document.querySelector('#quality')?.textContent,record:document.querySelector('#record-state')?.textContent,
      chapter:document.querySelector('#chapter-count')?.textContent,title:document.querySelector('#chapter-title')?.textContent,
      timeOrigin:performance.timeOrigin,canvasCount:document.querySelectorAll('#world canvas').length,
      motion:matchMedia('(prefers-reduced-motion: reduce)').matches,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio}));
    const step=async(name,action)=>{
      phase=name;const started=performance.now();console.log(JSON.stringify({view:id,stage:'start',step:name}));
      await action();run.steps.push({name,wallMs:performance.now()-started,at:new Date().toISOString(),state:await state()});
      await save();console.log(JSON.stringify({view:id,stage:'done',step:name}));
    };
    const picture=async (name,supplement=false)=>{
      const path=join(output,`${id}-${name}.png`);await page.screenshot({path,timeout:180000});
      const bytes=await readFile(path);(supplement?(run.supplements??=[]):run.screenshots).push({name,path,bytes:bytes.length,sha256:sha(bytes)});
    };
    const readyBook=async()=>{
      await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready');
      await expect(page.locator('#reader')).toHaveAttribute('aria-busy','false');
    };
    const enter=async()=>{
      await expect(page.locator('#loading')).toBeHidden();await expect(page.locator('#enter')).toBeEnabled();
      await page.locator('#enter').click();await expect(page.locator('#enter-label')).toHaveText('推开这扇门');
      await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
      await expect(page.locator('#room-ui')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('data-stage','room');
    };
    try{
      await step('load',async()=>{await page.goto(base.href,{waitUntil:'domcontentloaded'});await expect(page.locator('#loading')).toBeHidden();});
      const originalOrigin=(await state()).timeOrigin;
      await step('door-and-entry',enter);
      await step('default-music',async()=>{
        await expect(page.locator('#record-state')).toHaveText('播放中');
        await page.waitForFunction(()=>window.__smokeAudio?.currentTime>.05);
        run.defaultMusic=await media();expect(run.defaultMusic.source).toMatch(/default-record.*\.mp3/);
        expect(run.defaultMusic.paused).toBe(false);expect(run.defaultMusic.duration).toBeGreaterThan(60);
      });
      await picture('room');
      await step('record-panel-pause-play',async()=>{
        await page.locator('#room-settings').click();await expect(page.locator('#room-settings-menu')).toBeVisible();
        const chooser=page.waitForEvent('filechooser');await page.locator('#choose-record').click();await(await chooser).setFiles([]);
        await expect(page.locator('#record-panel')).toBeVisible();await page.locator('#record-panel-toggle').click();
        await expect(page.locator('#record-state')).toHaveText('已暂停');expect((await media()).paused).toBe(true);
        await page.locator('#record-panel-toggle').click();await expect(page.locator('#record-state')).toHaveText('播放中');
        const t=(await media()).time;await page.waitForFunction(t=>window.__smokeAudio.currentTime>t+.05,t);
        await page.keyboard.press('Escape');await expect(page.locator('#record-panel')).toBeHidden();
        await expect(page.locator('#choose-record')).toBeFocused();await page.keyboard.press('Escape');
        await expect(page.locator('#room-settings-menu')).toBeHidden();
      });
      await step('cat-approach-and-pet',async()=>{
        await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true');
        await expect(page.locator('#open-book')).toBeHidden();await expect(page.locator('#pet-cat')).toBeEnabled();
        await picture('cat');
        if(id==='desktop'){
          run.focusedLandscape=[];
          for(const width of[760,844]){
            await page.setViewportSize({width,height:390});await page.locator('#room-settings').click();
            await expect(page.locator('#room-settings-menu')).toBeVisible();
            const layout=await page.evaluate(()=>{
              const room=document.querySelector('#room-ui').getBoundingClientRect();
              const menu=document.querySelector('#room-settings-menu').getBoundingClientRect();
              const footer=document.querySelector('.footer').getBoundingClientRect();
              return{viewport:[innerWidth,innerHeight],room:room.toJSON(),menu:menu.toJSON(),footer:footer.toJSON(),
                catCentreDOM:document.elementFromPoint(innerWidth/2,innerHeight/2)?.tagName};
            });
            expect(layout.menu.left).toBeGreaterThanOrEqual(layout.room.left);
            expect(layout.menu.right).toBeLessThanOrEqual(layout.room.right);
            expect(layout.room.bottom).toBeLessThanOrEqual(layout.footer.top-4);
            expect(layout.catCentreDOM).toBe('CANVAS');run.focusedLandscape.push(layout);
            await picture(`cat-menu-${width}`,true);await page.keyboard.press('Escape');
          }
          await page.setViewportSize(views[id]);
        }
        // Observe the real busy transition in its microtask. Automation can
        // arrive after a short response when software GPU readback blocks.
        await page.evaluate(()=>{
          const button=document.querySelector('#pet-cat');window.__smokePetStates=[];
          window.__smokePetObserver=new MutationObserver(()=>window.__smokePetStates.push({
            busy:button.dataset.busy??null,disabled:button.disabled,
            hint:document.querySelector('#pet-hint').textContent,at:performance.now()}));
          window.__smokePetObserver.observe(button,{attributes:true,attributeFilter:['data-busy','disabled']});
        });
        await page.locator('#pet-cat').click();
        await page.waitForFunction(()=>window.__smokePetStates.some(s=>s.busy==='true'&&s.disabled));
        await page.waitForFunction(()=>!document.querySelector('#pet-cat').dataset.busy);
        await expect(page.locator('#pet-cat')).toBeEnabled();await expect(page.locator('#pet-hint')).toHaveText('可以再次抚摸');
        run.catBusyTimeline=await page.evaluate(()=>{window.__smokePetObserver.disconnect();return window.__smokePetStates;});
        await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false');
        await expect(page.locator('#open-book')).toBeVisible();
      });
      let retained;
      await step('book-chapter-return-reopen',async()=>{
        await page.locator('#open-book').click();await readyBook();const previous=await page.locator('#chapter-title').textContent();
        await page.locator('#next').click();await expect(page.locator('#chapter-title')).not.toHaveText(previous);
        await expect(page.locator('#book')).toHaveAttribute('aria-busy','false');
        retained={title:await page.locator('#chapter-title').textContent(),count:await page.locator('#chapter-count').textContent()};
        await picture('reading');await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible();
        await page.locator('#open-book').click();await readyBook();await expect(page.locator('#chapter-title')).toHaveText(retained.title);
        await expect(page.locator('#chapter-count')).toHaveText(retained.count);
        await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible();
        expect((await state()).timeOrigin).toBe(originalOrigin);run.retained=retained;
      });
      await step('webgl-loss-and-fallback',async()=>{
        // A full native-motion visit can outlast the supplied song.
        if(await page.locator('#record-state').textContent()!=='播放中') await page.locator('#record-toggle').click();
        await expect(page.locator('#record-state')).toHaveText('播放中');expect((await media()).paused).toBe(false);
        const lost=await page.evaluate(()=>{const canvas=document.querySelector('#world canvas');
          const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl');const extension=gl?.getExtension('WEBGL_lose_context');
          if(!extension)return false;extension.loseContext();return true;});expect(lost).toBe(true);
        await expect(page.locator('#fallback')).toBeVisible();await picture('fallback');
        await expect(page.locator('#record-state')).toHaveText('已暂停');expect((await media()).paused).toBe(true);await page.locator('#fallback-read').click();await readyBook();
        await expect(page.locator('#chapter-title')).toHaveText(retained.title);await expect(page.locator('#chapter-count')).toHaveText(retained.count);
        await page.locator('#close-book').click();await expect(page.locator('#fallback')).toBeVisible();
        await expect(page.locator('#reload-scene')).toBeEnabled();
      });
      await step('reload-retry-preserves-chapter',async()=>{
        await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#reload-scene').click()]);
        await enter();expect((await state()).timeOrigin).not.toBe(originalOrigin);
        await page.locator('#open-book').click();await readyBook();await expect(page.locator('#chapter-title')).toHaveText(retained.title);
        await expect(page.locator('#chapter-count')).toHaveText(retained.count);
        await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible();
      });
      expect(run.pageErrors).toEqual([]);expect(run.consoleErrors).toEqual([]);expect(run.httpErrors).toEqual([]);
      expect(run.failedRequests).toEqual([]);run.passed=true;
    }catch(error){run.passed=false;run.failure=String(error.stack??error);await picture('failure').catch(()=>{});}
    finally{
      phase='cleanup';await Promise.all(pendingAssets);await context.close();await save();
      console.log(JSON.stringify({view:id,passed:run.passed,failure:run.failure,steps:run.steps.length,warnings:run.warnings.length}));
    }
  }
}finally{await browser?.close();report.finishedAt=new Date().toISOString();await save();}
if(report.runs.some(run=>!run.passed))process.exitCode=1;

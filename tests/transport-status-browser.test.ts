import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import test from 'node:test';
import {builderBrowserTestsEnabled, renderBuilder} from './helpers/builder-render.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';

// Synthetic booking, unbooked passenger service and unknown connection. No live services.
function statusTrip() {
  const trip = japanTrip();
  trip.id = 'synthetic-status-acceptance';
  trip.title = 'Synthetic transport status examples';
  trip.stops.push({...trip.stops[1], id:'osaka',canonicalPlaceId:'osaka',name:'Osaka',order:2},
    {...trip.stops[1],id:'nara',canonicalPlaceId:'nara',name:'Nara',order:3});
  const source = trip.legs[0];
  trip.legs = trip.stops.slice(1).map((to,index)=>{
    const from=trip.stops[index];
    const endpoint=(stop:typeof from)=>({kind:'stop' as const,id:stop.id,canonicalPlaceId:stop.canonicalPlaceId,
      name:stop.name,country:stop.country,coordinates:[stop.longitude,stop.latitude] as [number,number]});
    return {...source,id:`synthetic-status-${index}`,fromStopId:from.id,toStopId:to.id,
      fromEndpoint:endpoint(from),toEndpoint:endpoint(to),mode:index===2?'unknown' as const:'train' as const,
      durationMinutes:index===2?null:135,doorToDoorMinutes:index===2?null:135,headlineMinutes:null,
      provider:null,provenance:'planning_estimate' as const,confidence:'unknown' as const,
      segments:undefined,routeMetadata:{},scheduleNeedsChecking:true};
  });
  return markTransportLegBooked(trip,trip.legs[0].id);
}

for(const language of ['en','es'] as const) {
  test(`transport statuses retain labels, keyboard behavior and layout in ${language}`,{
    skip:!builderBrowserTestsEnabled,timeout:90_000,
  },async()=>{
    const trip=statusTrip();
    const before=JSON.stringify(trip);
    const view=await renderBuilder({initialTrip:trip,path:`/journey/${trip.id}/transport`,
      query:`?review=${trip.legs[0].id}`,language,styled:true,offlineOnly:true});
    try {
      const page=view.page;
      const cards=page.locator('[data-transport-leg-id]');
      await cards.first().waitFor();
      const first=cards.nth(0),second=cards.nth(1),third=cards.nth(2);
      const summary=(card:typeof first)=>card.locator('[data-transport-summary]');
      assert.equal(await summary(first).locator('[data-tone="booked"]').innerText(),language==='es'?'Reservado · marcado por ti':'Booked · marked by you');
      assert.equal(await summary(second).locator('[data-tone="not-booked"]').innerText(),language==='es'?'No reservado':'Not booked');
      assert.equal(await summary(third).locator('[data-tone="attention"]').innerText(),language==='es'?'Necesita comprobarse':'Needs checking');
      assert.equal(await summary(first).locator('[data-tone="attention"]').innerText(),language==='es'?'Revisar ruta':'Route check');
      assert.equal(await summary(first).locator('svg.lucide-check').count(),1);
      assert.equal(await summary(second).locator('svg.lucide-circle').count(),1);
      assert.equal(await summary(third).locator('svg.lucide-triangle-alert,svg.lucide-alert-triangle').count(),1);
      const storageBefore=await page.evaluate(()=>JSON.stringify({...localStorage}));
      const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;
      if(artifacts)mkdirSync(artifacts,{recursive:true});
      for(const width of [320,390,430,768,1440]) {
        await page.setViewportSize({width,height:1000});
        const header=await page.locator('#transport-workspace-heading').evaluate((heading:HTMLElement)=>{
          const button=heading.closest('header')!.querySelector('button')!;
          const range=document.createRange();range.selectNodeContents(heading);
          const a=range.getBoundingClientRect(),b=button.getBoundingClientRect();
          return {overlaps:Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,
            buttonWidth:b.width,buttonHeight:b.height};
        });
        assert.equal(header.overlaps,false,`heading/map control overlap at ${width}px`);
        if(width<=540)assert.ok(header.buttonWidth>=44&&header.buttonHeight>=44,`mobile map target at ${width}px`);
        const layout=await page.locator('[data-transport-summary]').evaluateAll((summaries:HTMLElement[])=>{
          const overlap=(a:DOMRect,b:DOMRect)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
          return summaries.map(summary=>{
            const badges=[...summary.querySelectorAll<HTMLElement>('[data-tone]')];
            const chevron=summary.querySelector<HTMLElement>('[class*="chevron"]')!.getBoundingClientRect();
            return badges.every((badge,index)=>{
              const bounds=badge.getBoundingClientRect(),label=badge.querySelector<HTMLElement>('span')!,icon=badge.querySelector('svg')!;
              return bounds.left>=0&&bounds.right<=innerWidth+1&&badge.scrollWidth<=badge.clientWidth+1&&label.scrollWidth<=label.clientWidth+1
                &&!overlap(bounds,chevron)&&!badges.slice(index+1).some(other=>overlap(bounds,other.getBoundingClientRect()))
                &&icon.getAttribute('aria-hidden')==='true'&&icon.getAttribute('focusable')==='false';
            });
          });
        });
        assert.deepEqual(layout,[true,true,true],`badge/chevron layout at ${width}px`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`page overflow at ${width}px`);
        const control=summary(first).getByRole('button');
        assert.ok((await control.getAttribute('aria-label'))?.includes('Tokyo'));
        await control.focus();
        await page.keyboard.press('Space');
        assert.equal(await control.getAttribute('aria-expanded'),'true');
        assert.equal(await page.locator(`#${await control.getAttribute('aria-controls')}`).isVisible(),true);
        await page.keyboard.press('Enter');
        assert.equal(await control.getAttribute('aria-expanded'),'false');
        assert.equal(await control.evaluate((el:HTMLElement)=>el===document.activeElement),true);
        assert.equal(await control.evaluate((el:HTMLElement)=>el.matches(':focus-visible')),true);
        if(artifacts&&(width===320||width===1440))await page.screenshot({path:`${artifacts}/statuses-${language}-${width}.png`,fullPage:true});
      }
      const contrast=await page.locator('[data-transport-summary] [data-tone]').evaluateAll((badges:HTMLElement[])=>{
        const context=document.createElement('canvas').getContext('2d')!;
        const rgba=(color:string)=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};
        const luminance=(color:number[])=>color.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
        return badges.map(badge=>{
          let parent:HTMLElement|null=badge,background=[255,255,255,255];
          while(parent){const value=rgba(getComputedStyle(parent).backgroundColor);if(value[3]===255){background=value;break;}parent=parent.parentElement;}
          const a=luminance(rgba(getComputedStyle(badge).color)),b=luminance(background);
          return {tone:badge.dataset.tone,ratio:(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)};
        });
      });
      assert.ok(contrast.every((item:{ratio:number})=>item.ratio>=4.5),JSON.stringify(contrast));
      console.log(`${language} rendered status text contrast: ${JSON.stringify(contrast)}`);
      await page.emulateMedia({forcedColors:'active'});
      const systemColors=await page.locator('[data-transport-summary] [data-tone]').evaluateAll((badges:HTMLElement[])=>badges.map(badge=>{
        const style=getComputedStyle(badge);return {text:style.color,border:style.borderTopColor,background:style.backgroundColor};
      }));
      assert.ok(systemColors.every((style:{text:string;border:string;background:string})=>style.text===style.border&&style.text!==style.background));
      assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),storageBefore,'display interactions preserve stored synthetic trip');
      assert.equal(JSON.stringify(trip),before);
      assert.deepEqual(view.errors,[]);
    } finally {await view.close();}
  });
}

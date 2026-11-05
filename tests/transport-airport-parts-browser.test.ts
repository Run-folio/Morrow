import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync} from 'node:fs';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
import {cityReturnTrip} from './fixtures/omio-return.ts';
import {savedJourneyPartsTrip} from './fixtures/saved-journey-parts.ts';
import {referencePlaceById,searchReferencePlaces} from '../lib/easyt/place-reference.server.ts';
import {REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';

function suggestion(code:string){
  const candidate=searchReferencePlaces(code)[0];assert.ok(candidate);
  const record=referencePlaceById(candidate.canonicalPlaceId??'');assert.ok(record);
  return {...candidate,name:record.canonicalName,country:candidate.parentCountries![0],canonicalPlaceId:record.canonicalPlaceId,
    coordinates:[...record.coordinates],placeType:record.placeType,scheduledService:record.scheduledService,
    referenceSnapshotId:REFERENCE_SNAPSHOT_ID,providerId:record.providerId,provenance:[{id:record.providerId}]};
}

for(const language of ['en','es'] as const){
  const es=language==='es';
  test(`airport search save/reload/reset and booking undo remain usable in ${language}`,{
    skip:!builderBrowserTestsEnabled,timeout:90_000,
  },async()=>{
    const trip=cityReturnTrip(),before=JSON.stringify(trip),from=suggestion('LGW'),to=suggestion('ORY');
    const view=await renderBuilder({initialTrip:trip,path:`/journey/${trip.id}/transport`,styled:true,offlineOnly:true,language,
      geocodeCandidates:{LGW:[from],ORY:[to]}});
    try{
      const page=view.page;await page.setViewportSize({width:320,height:1000});
      const card=page.locator('[data-transport-leg-id]').first();
      const open=async()=>{await card.waitFor();const button=card.locator('[data-transport-summary] button');if(await button.getAttribute('aria-expanded')==='false')await button.click();};
      const edit=()=>card.getByRole('button',{name:es?'Cambiar aeropuertos de búsqueda':'Change flight-search airports',exact:true});
      await open();await edit().focus();await page.keyboard.press('Enter');
      let form=card.getByRole('form',{name:es?'Aeropuertos para buscar vuelos':'Flight-search airports',exact:true});
      for(const [label,code,record] of [[es?'Aeropuerto de salida':'Departure airport','LGW',from],[es?'Aeropuerto de llegada':'Arrival airport','ORY',to]] as const){
        await form.getByRole('combobox',{name:label,exact:true}).fill(code);
        await page.getByRole('option').filter({hasText:record.name}).first().click();
      }
      await form.getByRole('button',{name:es?'Guardar aeropuertos':'Save airports',exact:true}).click();
      await card.getByText(new RegExp(from.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))).first().waitFor();
      await page.waitForFunction(()=>!document.querySelector('form[aria-label="Flight-search airports"],form[aria-label="Aeropuertos para buscar vuelos"]'));
      assert.equal(await edit().evaluate((el:HTMLElement)=>el===document.activeElement),true);
      await page.reload();await open();assert.ok((await card.innerText()).includes(from.name));assert.ok((await card.innerText()).includes(to.name));
      await card.getByRole('button',{name:es?'Marcar como reservado':'Mark as booked',exact:true}).click();
      await card.locator('[data-tone="booked"]').waitFor();assert.equal(await edit().count(),0);
      await card.getByRole('button',{name:es?'Editar detalles':'Edit details',exact:true}).click();
      await card.getByLabel(es?'Referencia de reserva':'Booking reference').fill('SYNTHETIC-INTEGRATION');
      await card.getByLabel(es?'Nota':'Note').fill('Preserve this synthetic booking note');
      await card.getByRole('button',{name:es?'Guardar detalles':'Save details',exact:true}).click();
      await card.getByText(/SYNTHETIC-INTEGRATION/).waitFor();
      await card.getByRole('button',{name:es?'Deshacer marca de reserva':'Undo booked mark',exact:true}).click();
      await edit().waitFor();await page.reload();await open();await edit().click();
      form=card.getByRole('form',{name:es?'Aeropuertos para buscar vuelos':'Flight-search airports',exact:true});
      await form.getByRole('button',{name:es?'Restablecer aeropuertos':'Reset search airports',exact:true}).click();
      await page.reload();await open();
      assert.equal(await card.getByText(/selected by you|elegido por ti/).count(),0);
      assert.ok((await card.innerText()).includes('SYNTHETIC-INTEGRATION'));assert.ok((await card.innerText()).includes('Preserve this synthetic booking note'));
      for(const width of [320,390,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
      assert.equal(JSON.stringify(trip),before);assert.deepEqual(view.errors,[]);
    }catch(error){console.log('Synthetic airport diagnostic',JSON.stringify({requests:view.geocodeRequests(),content:await view.page.locator('[aria-labelledby="transport-workspace-heading"]').innerText()}));throw error;}
    finally{await view.close();}
  });

  for(const [complete,booked] of [[false,false],[true,false],[false,true]] as const){
    test(`saved ${complete?'complete':'partial'} journey parts${booked?' when booked':''} retain ordered detail and gaps in ${language}`,{
      skip:!builderBrowserTestsEnabled,timeout:45_000,
    },async()=>{
      const trip=savedJourneyPartsTrip(complete,booked),view=await renderBuilder({initialTrip:trip,path:`/journey/${trip.id}/transport`,styled:true,offlineOnly:true,language});
      try{
        const page=view.page,card=page.locator('[data-transport-leg-id]').first();
        await card.locator('[data-transport-summary] button').click();
        const details=card.getByRole('button',{name:es?'Detalles del trayecto':'Journey details',exact:true});
        await details.focus();await page.keyboard.press('Space');
        const parts=card.getByRole('list',{name:es?'Tramos guardados':'Saved journey parts',exact:true});
        assert.equal(await parts.getByRole('listitem').count(),complete?3:1);
        assert.equal(await card.getByRole('list',{name:es?'Detalles por confirmar':'Details to check',exact:true}).count(),complete?0:1);
        if(booked){assert.equal(await card.locator('[data-tone="booked"]').count(),1);assert.equal(await card.locator('a[data-affiliate-provider="omio"]').count(),0);}
        for(const width of [320,1440]){
          await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
          assert.equal(await parts.evaluate((el:HTMLElement)=>el.scrollWidth<=el.clientWidth+1),true);
          const artifacts=process.env.MORROVIA_BROWSER_ARTIFACT_DIR;
          if(artifacts&&width===320){mkdirSync(artifacts,{recursive:true});await page.screenshot({path:`${artifacts}/parts-${language}-${complete?'complete':'gaps'}-${booked?'booked':'unbooked'}.png`,fullPage:true});}
        }
        assert.deepEqual(view.errors,[]);
      }finally{await view.close();}
    });
  }
}

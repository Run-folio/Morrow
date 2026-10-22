import assert from 'node:assert/strict';
import test from 'node:test';
import {renderBuilder,builderBrowserTestsEnabled} from './helpers/builder-render.ts';
const candidate={name:'Hirayu Onsen',country:'Japan',region:'Gifu',canonicalPlaceId:'open-world:photon:N:2481035449',providerId:'photon:N:2481035449',coordinates:[137.5536701,36.1914892],placeType:'town',kind:'town',routability:'direct_destination'};
for(const action of ['input-enter','button-enter'])test(`actual Home unpaid completed search is keyboard usable after autocomplete miss: ${action}`,
 {skip:!builderBrowserTestsEnabled,timeout:30000},async()=>{
  const h=await renderBuilder({path:'/',offlineOnly:true});const page=h.page;page.setDefaultTimeout(6000);let completed=0,autocomplete=0;
  try{
   await page.route('**/api/journey-geocode**',async(route:any)=>{
    const request=route.request();assert.equal(new URL(request.url()).origin,new URL(page.url()).origin);
    if(request.method()==='GET'){autocomplete++;await route.fulfill({json:{candidates:[]}});return;}
    const body=request.postDataJSON();assert.equal(request.method(),'POST');assert.equal(body.place,'Hirayu');assert.equal(Boolean(body.research),false);completed++;await route.fulfill({json:{candidates:[candidate],publicResearchAvailable:false}});
   });
   const autocompleteResponse=page.waitForResponse((response:any)=>{
    const request=response.request(),url=new URL(response.url());
    return request.method()==='GET'&&url.pathname==='/api/journey-geocode'&&url.searchParams.get('place')==='Hirayu';
   });
   const input=page.getByRole('combobox',{name:'Destination',exact:true});await input.fill('Hirayu');
   await autocompleteResponse;
   await page.getByText(/No matching places found/).waitFor();assert.ok(autocomplete>0);assert.equal(completed,0);
   if(action==='input-enter')await input.press('Enter');else{const search=page.getByRole('button',{name:'Search',exact:true});await search.focus();await search.press('Enter');}
   const option=page.getByRole('option').filter({hasText:'Hirayu Onsen'});await option.waitFor();assert.equal(completed,1);
   await option.click();await page.getByRole('button',{name:/^Edit Hirayu Onsen/}).waitFor();assert.equal(new URL(page.url()).pathname,'/');assert.equal(completed,1);assert.deepEqual(h.errors,[]);
  }finally{await h.close();}
 });

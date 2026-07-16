import assert from'node:assert/strict';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.env.TPT_REVIEW_ROOT||'http://127.0.0.1:8768/',browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/interpreter**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({elements:[{type:'node',id:10,lat:51.5001,lon:-.1001,tags:{name:'Test Pharmacy',amenity:'pharmacy'}}]})}));
await page.route('**/table/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',distances:[[0,450]],durations:[[0,330]]})}));
try{
 await page.goto(new URL('modules/accessibility/index.html',root).href,{waitUntil:'domcontentloaded'});await page.locator('#latInput').fill('51.5000');await page.locator('#lonInput').fill('-0.1000');await page.locator('#useCoordsBtn').click();await page.locator('#confirmSiteBtn').click();await page.locator('#runBtn').click();await page.waitForSelector('.google-map-link');
 const link=page.locator('.google-map-link').first(),href=await link.getAttribute('href');assert.match(href,/google\.com\/maps\/search/);assert.match(decodeURIComponent(href),/51\.5001000,-0\.1001000/);assert.equal(await link.getAttribute('target'),'_blank');assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
 const source=await page.evaluate(()=>fetch('assets/js/app.js').then(r=>r.text()));assert.match(source,/bindPopup[\s\S]*Open in Google Maps/);assert.match(source,/target="_blank" rel="noopener noreferrer"/);assert.equal(errors.length,0);console.log(JSON.stringify({href,target:'_blank',rel:'noopener noreferrer',popupLink:true,errors},null,2));
}finally{await browser.close()}

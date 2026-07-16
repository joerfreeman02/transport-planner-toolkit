import assert from 'node:assert/strict';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.env.TPT_REVIEW_ROOT||'http://127.0.0.1:8768/';
const browser=await chromium.launch({headless:true});
const results={root,checks:{},errors:[]};
async function open(path){const page=await browser.newPage();page.on('pageerror',error=>results.errors.push(path+': '+error.message));await page.goto(new URL(path,root).href,{waitUntil:'domcontentloaded',timeout:30000});const notice=page.getByRole('button',{name:'Open the page'});if(await notice.count())await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),notice.click()]);return page}
try{
 const dashboard=await open('index.html');results.checks.readyTags=await dashboard.locator('.status',{hasText:'Ready to use'}).count();assert.equal(results.checks.readyTags,4);results.checks.dashboardBuild=(await dashboard.locator('.build').first().innerText()).includes('DASH-1.1.0');await dashboard.close();
 const rail=await open('modules/railway/index.html');await rail.waitForSelector('.leaflet-container');results.checks.railPublish=await rail.locator('#publishShared').count()===1;results.checks.railRefresh=await rail.locator('#refreshShared').count()===1;results.checks.railStatus=await rail.locator('#sharedRailStatus').count()===1;assert.ok(results.checks.railPublish&&results.checks.railRefresh&&results.checks.railStatus);await rail.close();
 const access=await open('modules/accessibility/index.html');await access.waitForSelector('.leaflet-container');results.checks.accessCopy=await access.locator('#copyWordingBtn').count()===1;assert.ok(results.checks.accessCopy);await access.close();
 const stats=await open('modules/stats19/index.html');results.checks.stats19=await stats.locator('body').innerText().then(text=>text.includes('Collision Record Cards'));assert.ok(results.checks.stats19);await stats.close();
 assert.equal(results.errors.length,0);console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}

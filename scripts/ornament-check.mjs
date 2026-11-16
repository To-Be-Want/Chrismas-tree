import { chromium } from 'playwright';
import { createApp } from '../server/app.mjs';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
mkdirSync('artifacts',{recursive:true});
const app=await createApp({databasePath:':memory:'});
await app.listen({host:'127.0.0.1',port:0});
const origin=`http://127.0.0.1:${app.server.address().port}`;
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:720,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const designs=[['jewel','粉晶珠宝球'],['star','香槟星星'],['snowflake','冰晶雪花'],['heart','玫瑰爱心']];
let previous;
try {
 for(const [style,name] of designs){
  await page.goto(origin);
  if(previous) await page.request.delete(`${origin}/api/blessings/${previous.id}`,{headers:{Origin:origin,'X-Edit-Token':previous.token}});
  await page.reload();
  await page.getByRole('button',{name:'留个祝福',exact:true}).click();
  await page.getByRole('radio',{name,exact:true}).check();
  await page.getByLabel('昵称（选填）').fill(name);
  await page.getByLabel('祝福',{exact:true}).fill('愿每一份心愿，都在星光里闪耀。');
  if(style==='heart') await page.screenshot({path:'artifacts/ornament-real-picker.png'});
  await page.getByRole('button',{name:'挂上祝福',exact:true}).click();
  await page.getByText('已挂上你的祝福',{exact:true}).waitFor();
  const rows=(await (await page.request.get(`${origin}/api/blessings`)).json()).blessings;
  assert.equal(rows.length,1);assert.equal(rows[0].ornament_style,style);
  previous={id:rows[0].id,token:await page.evaluate(id=>JSON.parse(localStorage.getItem('star-wishes:owners:v1'))[id],rows[0].id)};
  // Reload and locate: verify the persisted record, not just the immediate optimistic view.
  await page.reload();
  await page.getByRole('button',{name:'全部祝福',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('button',{name:'定位到树上',exact:true}).click();
  await page.waitForTimeout(2200);
  await page.screenshot({path:`artifacts/ornament-${style}-on-tree.png`});
  console.log(`PASS ${style}: UI selection -> saved style -> reload -> tree closeup`);
 }
 assert.deepEqual(errors,[]);
 const board=await browser.newPage({viewport:{width:1440,height:1880},deviceScaleFactor:1});
 await board.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#09070c;color:#f4d8e8;font-family:'Microsoft YaHei',sans-serif}main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px}article{background:#100d14;border:1px solid #40303d;border-radius:16px;overflow:hidden}h2{font-weight:400;font-size:22px;text-align:center;margin:18px}img{width:100%;display:block}</style><main>${designs.map(([key,name])=>`<article><h2>${name} · 树上实际近景</h2><img src="data:image/png;base64,${readFileSync(`artifacts/ornament-${key}-on-tree.png`).toString('base64')}"></article>`).join('')}</main>`);
 await board.screenshot({path:'artifacts/ornaments-on-tree-preview.png',fullPage:true});
} finally {await browser.close();await app.close();}

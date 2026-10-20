#!/usr/bin/env node
// Code-drawn replacements for missing invitation artwork. These are regional
// graphics, not screenshots of slides. Korean text uses the browser font stack.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'app/web/public/assets/description-standards/graphics');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.setContent('<html lang="ko"><body></body></html>');
 const defs=[['white',1280,720],['vip-card',640,800],['studio-poster',1000,898],['studio-info',900,705],['invitation-title',1200,110],['visit-title',1400,125],['visit-subtitle',1400,70]];
 for(const [name,w,h] of defs){
  const data=await page.evaluate(({name,w,h})=>{
   const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
   const text=(s,x,y,size=28,color='#172035',bold=false,max=w-x-30)=>{
    g.font=`${bold?'700':'400'} ${size}px Arial,sans-serif`;g.fillStyle=color;g.textBaseline='top';
    let line='',row=0;for(const ch of s){if(ch==='\n'||g.measureText(line+ch).width>max){g.fillText(line,x,y+row*size*1.35);line=ch==='\n'?'':ch;row++;}else line+=ch;}if(line)g.fillText(line,x,y+row*size*1.35);
   };
   g.fillStyle='#fff';g.fillRect(0,0,w,h);
   if(name==='vip-card'){
    g.fillStyle='#1428a0';g.fillRect(0,0,w,h);
    g.fillStyle='#ffffff';g.fillRect(58,72,48,5);
    text('SAMSUNG BUSINESS',58,111,19,'#c5cdf2',true);
    text('새로운 비즈니스의\n가능성을 만나다',58,215,53,'#ffffff',true,w-116);
    text('Business Solution Studio',58,410,25,'#eaeefb',false);
    g.strokeStyle='rgba(255,255,255,.25)';g.beginPath();g.moveTo(58,529);g.lineTo(w-58,529);g.stroke();
    text('VIP INVITATION',58,566,21,'#ffffff',true);
    text('제품과 공간, 솔루션이 연결되는\n삼성 비즈니스 체험 공간으로 초대합니다.',58,613,22,'#eaeefb',false,w-116);
    text('설명 기반 초대 카드 시안',58,739,14,'#c5cdf2',false);
   }else if(name==='studio-poster'){
    g.fillStyle='#f7f8fa';g.fillRect(0,0,w,h);
    g.fillStyle='#1428a0';g.fillRect(64,64,48,5);
    text('SAMSUNG BUSINESS',64,100,20,'#1428a0',true);
    text('Business\nSolution Studio',64,182,70,'#121417',true,w-128);
    text('우리의 내일을 체험하는 공간',64,399,31,'#596170');
    g.strokeStyle='#c5cdf2';g.lineWidth=3;
    for(let i=0;i<7;i++){const x=64+i*123,bh=70+(i*67%210);g.strokeRect(x,759-bh,100,bh);g.fillStyle='#eaeefb';g.fillRect(x+10,769-bh,80,bh-20);}
    text('제품 · 공간 · IoT 솔루션을 한곳에서',64,811,23,'#1428a0',true);
   }else if(name==='studio-info'){
    text('자료 판본의 방문 안내 · 예약 전 운영 정보 확인',27,15,17,'#69758b');
    text('운영 방식',28,59,23,'#1428a0',true);text('도슨트 투어 · 영업 담당 예약제',28,94,27,'#172035');
    text('운영 시간',28,154,23,'#1428a0',true);text('평일 10:00~18:00 · 일 3회 투어 운영',28,189,26);
    text('토·일·공휴일 및 매월 마지막 주 월요일 휴관',28,229,21,'#596579');
    text('오시는 길',28,288,23,'#1428a0',true);text('경기도 용인시 기흥구 용구대로 2458\n삼성스토어 용인구성점',28,323,27);
    text('교통 안내',28,415,23,'#1428a0',true);text('구성역(분당선) 1번 출구 · 상세 경로는 예약 시 확인',28,449,23);
    g.fillStyle='#edf3fd';g.fillRect(28,508,w-56,114);text('방문 전 확인',48,526,20,'#1428a0',true);
    text('현재 주소·운영 시간·예약 가능 여부는\n영업 담당자의 최신 안내를 확인하세요.',48,558,22,'#34445c');
    text('상세 위치·교통 정보는 예약 시 안내받으세요.',28,650,17,'#6f7b90');
   }else if(name==='invitation-title'){
    text('‘삼성 비즈니스 솔루션 스튜디오’로 초대합니다.',4,8,45,'#111827',false,w-8);
   }else if(name==='visit-title'){
    text('우리의 내일을 체험하는 공간 ‘삼성 비즈니스 솔루션 스튜디오’',4,8,43,'#111827',true,w-8);
   }else if(name==='visit-subtitle'){
    text('삼성만의 차별화된 IoT 솔루션과 비즈니스 전문 제품을 체험하는 Samsung Business Solution Studio',4,5,26,'#404958',false,w-8);
   }
   return c.toDataURL('image/png');
  },{name,w,h});
  await fs.writeFile(path.join(out,name+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 const files=[];for(const [name,w,h] of defs){files.push({name:name+'.png',w,h,sha256:createHash('sha256').update(await fs.readFile(path.join(out,name+'.png'))).digest('hex')});}
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify({kind:'description-reconstructed-graphics',original:false,
  basis:'공통 스튜디오 초대/방문 안내 설명과 엔터테인먼트 42장 OCR 보조 문구',files,
  note:'방문 정보는 자료 판본의 참고 문구이며 현재 운영 정보로 확인한 내용이 아님'},null,2));
 console.log('Created',defs.length,'description-based studio graphics');
}finally{await browser.close();}

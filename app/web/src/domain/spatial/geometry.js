// Original, reusable CC0 parametric geometry. Metres; x=width, y=height, z=depth.
// A recipe is a real object definition, shared by every scene and both renderers.
import { PRODUCT_RECIPES } from './product-recipes.js';
import { FURNITURE_RECIPES } from './furniture-recipes.js';
import { FURNITURE_VARIANTS,FURNITURE_RECIPES as FURNITURE_VARIANT_RECIPES,describeLegacyFurniture } from './furniture-catalog.js';
import { DETAIL_ASSETS,DETAIL_RECIPES } from './detail-objects.js';
import { PEOPLE_RECIPES } from './people-scenes.js';
import {SPACE_ASSETS,SPACE_RECIPES} from './space-objects.js';
export const GEOMETRY_VERSION = 6;
const box = (x,y,z,w,h,d,color='body',extra={}) => ({shape:'box',position:[x,y,z],size:[w,h,d],material:color,...extra});
const cyl = (x,y,z,r,h,color='metal',extra={}) => ({shape:'cylinder',position:[x,y,z],size:[r,h,r],material:color,...extra});
const sphere = (x,y,z,r,color='leaf',extra={}) => ({shape:'sphere',position:[x,y,z],size:[r,r,r],material:color,...extra});
const legs = (y=.36) => [-.42,.42].flatMap(x=>[-.38,.38].map(z=>box(x,y,z,.035,y*2,.035,'metal')));
const screen = (w=.94,h=.88) => [box(0,.5,0,1,1,1,'black'),box(0,.51,.511,w,h,.018,'screen'),box(.35,.035,.516,.04,.008,.008,'silver')];
const shelves = (n=4) => Array.from({length:n},(_,i)=>box(0,.12+i*.23,0,.95,.025,.93,'wood'));
export const RECIPES = {
  logical: [box(0,.5,0,1,1,1,'screen')],
  display: screen(),
  monitor: [box(0,.02,0,.65,.04,.9,'metal'),box(0,.26,-.22,.07,.5,.08,'metal'),box(0,.66,0,1,.68,.12,'black'),box(0,.67,.065,.95,.61,.012,'screen')],
  kiosk: [box(0,.025,0,.9,.05,.95,'metal'),box(0,.38,0,.17,.72,.24,'silver'),box(0,.78,0,.8,.44,.28,'body'),box(0,.79,.15,.72,.35,.018,'screen'),box(0,.49,.16,.3,.025,.1,'black')],
  tablet: [box(0,.5,0,1,1,1,'black'),box(0,.52,.515,.93,.88,.018,'screen'),cyl(.44,.97,.51,.012,.01,'silver',{rotate:[Math.PI/2,0,0]})],
  phone: [box(0,.5,0,1,1,1,'black'),box(0,.5,.51,.91,.94,.02,'screen'),sphere(0,.94,.522,.025,'black')],
  laptop: [box(0,.035,.07,1,.07,.85,'silver'),box(0,.075,.04,.85,.008,.6,'black'),box(0,.53,-.36,1,.93,.05,'silver'),box(0,.53,-.327,.94,.83,.012,'screen')],
  laptopClosed: [box(0,.5,0,1,1,1,'silver'),box(0,1.01,0,.17,.012,.08,'metal')],
  desktop: [box(0,.5,0,.95,1,1,'metal'),box(0,.52,.51,.9,.92,.02,'black'),box(.27,.8,.53,.07,.07,.02,'screen')],
  cassette: [box(0,.72,0,.85,.56,.85,'metal'),box(0,.13,0,1,.26,1,'body'),box(0,-.005,0,.67,.035,.67,'grille'),...[-.43,.43].map(z=>box(0,-.03,z,.83,.04,.07,'black'))],
  cassette360: [cyl(0,.65,0,.43,.7,'metal'),cyl(0,.17,0,.5,.25,'body'),cyl(0,.025,0,.37,.04,'grille')],
  wallac: [box(0,.5,0,1,1,1,'body'),box(0,.13,.48,.9,.12,.06,'grille'),box(.34,.41,.512,.12,.08,.016,'screen')],
  outdoor: [box(0,.5,0,1,1,1,'metal'),...[-.24,.24].map(x=>cyl(x,.52,.515,.21,.04,'grille',{rotate:[Math.PI/2,0,0]})),box(.37,.5,.52,.15,.85,.03,'silver')],
  purifier: [box(0,.5,0,1,1,1,'body'),box(0,.45,.51,.88,.75,.025,'grille'),box(0,.94,.51,.5,.025,.025,'screen'),box(0,.98,0,.85,.025,.83,'black')],
  fridge: [box(0,.5,0,1,1,1,'silver'),...[-.248,.248].flatMap(x=>[box(x,.69,.51,.485,.58,.025,'body'),box(x,.19,.51,.485,.36,.025,'wood')]),box(0,.5,.534,.012,.91,.01,'metal')],
  washer: [box(0,.5,0,1,1,1,'body'),cyl(0,.43,.52,.34,.06,'black',{rotate:[Math.PI/2,0,0]}),cyl(0,.43,.56,.26,.025,'glass',{rotate:[Math.PI/2,0,0]}),box(0,.9,.51,.88,.1,.025,'black'),box(.2,.9,.53,.25,.06,.01,'screen')],
  airdresser: [box(0,.5,0,1,1,1,'body'),box(0,.52,.51,.93,.94,.025,'glass'),box(.34,.54,.55,.035,.27,.03,'metal'),box(0,.95,.54,.4,.025,.01,'screen')],
  dishwasher: [box(0,.5,0,1,1,1,'body'),box(0,.88,.51,.85,.025,.07,'metal'),box(0,.98,.1,.95,.025,.7,'black')],
  induction: [box(0,.5,0,1,1,1,'black'),...[-.23,.23].flatMap(x=>[-.24,.24].map(z=>cyl(x,1.01,z,.17,.01,'grille')))],
  oven: [box(0,.5,0,1,1,1,'metal'),box(0,.46,.51,.88,.65,.03,'black'),box(0,.85,.54,.74,.035,.06,'silver'),box(.2,.94,.52,.2,.04,.01,'screen')],
  water: [box(0,.5,0,1,1,1,'body'),box(0,.73,.51,.8,.32,.06,'black'),box(0,.42,.63,.13,.08,.25,'silver'),box(0,.04,.23,.75,.03,.9,'black')],
  speaker: [box(0,.5,0,1,1,1,'black'),...[[.3,.24],[.75,.15]].map(([y,r])=>cyl(0,y,.51,r,.025,'grille',{rotate:[Math.PI/2,0,0]}))],
  printer: [box(0,.4,0,1,.8,1,'body'),box(0,.88,-.03,.9,.15,.85,'metal'),box(.24,.8,.52,.32,.18,.07,'screen'),box(0,.55,.51,.85,.13,.04,'black')],
  light: [box(0,.5,0,1,1,1,'body'),box(0,0,0,.92,.02,.92,'light')],
  sensor: [box(0,.5,0,1,1,1,'body'),sphere(0,.51,.48,.22,'screen')],
  accessory: [box(0,.5,0,1,1,1,'metal'),box(0,.53,.51,.7,.55,.025,'grille')],
  desk: [box(0,.95,0,1,.1,1,'wood'),...legs(.475)],
  table: [box(0,.95,0,1,.1,1,'wood'),...legs(.475)],
  roundtable: [cyl(0,.95,0,.5,.1,'wood'),cyl(0,.45,0,.04,.9),cyl(0,.025,0,.32,.05)],
  chair: [box(0,.47,0,.88,.13,.82,'fabric'),box(0,.76,-.36,.88,.48,.14,'fabric'),...legs(.21)],
  taskchair: [box(0,.48,0,.88,.15,.78,'fabric'),box(0,.78,-.33,.87,.43,.16,'fabric'),cyl(0,.24,0,.035,.45),box(0,.04,0,.85,.035,.08,'metal'),box(0,.04,0,.08,.035,.85,'metal')],
  sofa: [box(0,.32,0,1,.5,1,'fabric'),box(0,.76,-.39,1,.48,.22,'fabric'),...[-.46,.46].map(x=>box(x,.65,0,.1,.46,.95,'fabric')),...[-.24,.24].map(x=>box(x,.61,.04,.45,.1,.68,'cushion')),...legs(.07)],
  bench: [box(0,.9,0,1,.2,1,'wood'),...legs(.42)],
  plant: [cyl(0,.18,0,.3,.36,'pot'),cyl(0,.52,0,.025,.75,'wood'),...Array.from({length:9},(_,i)=>sphere(Math.sin(i*2.4)*.27,.55+i*.045,Math.cos(i*2.4)*.27,.23,'leaf'))],
  shelf: [box(-.47,.5,0,.055,1,1,'wood'),box(.47,.5,0,.055,1,1,'wood'),box(0,.5,-.47,1,1,.05,'wood'),...shelves(),...[-.31,0,.3].map((x,i)=>box(x,.45,0,.2,.35,.6,i%2?'fabric':'cushion'))],
  counter: [box(0,.45,0,.96,.9,.94,'wood'),box(0,.96,0,1,.08,1,'stone'),box(0,.87,.48,.9,.025,.02,'metal')],
  island: [box(0,.45,0,.96,.9,.94,'wood'),box(0,.97,0,1,.06,1,'stone'),...[-.32,0,.32].map(x=>box(x,.49,.48,.31,.85,.02,'body'))],
  bed: [box(0,.16,0,1,.32,1,'wood'),box(0,.44,.01,.97,.23,.92,'linen'),box(0,.68,-.46,1,.65,.07,'fabric'),box(0,.575,.15,.98,.025,.6,'cushion'),...[-.24,.24].map(x=>box(x,.61,-.3,.4,.1,.19,'linen'))],
  hospitalbed: [box(0,.43,0,.94,.16,.94,'linen'),box(0,.69,-.47,1,.52,.06,'body'),...[-.48,.48].map(x=>box(x,.62,0,.04,.05,.6,'metal')),...legs(.22)],
  cabinet: [box(0,.5,0,1,1,1,'wood'),...[-.245,.245].map(x=>box(x,.5,.51,.48,.96,.02,'body')),...[-.04,.04].map(x=>box(x,.5,.54,.02,.2,.03,'metal'))],
  rack: [box(-.47,.5,0,.04,1,1,'metal'),box(.47,.5,0,.04,1,1,'metal'),...shelves(),...[-.25,.25].map(x=>box(x,.4,0,.4,.3,.8,'cardboard'))],
  reception: [box(0,.43,0,1,.86,1,'wood'),box(0,.92,0,1,.16,1,'stone'),box(0,.55,.51,.6,.14,.02,'metal')],
  treadmill: [box(0,.12,.05,1,.15,.95,'black'),...[-.42,.42].map(x=>box(x,.49,-.37,.055,.75,.06,'metal')),box(0,.9,-.35,.9,.15,.16,'black')],
  stage: [box(0,.46,0,1,.92,1,'wood'),box(0,.05,.51,.97,.1,.12,'metal')],
  sink: [box(0,.45,0,1,.9,1,'wood'),box(0,.91,0,1,.06,1,'stone'),box(0,.94,0,.7,.01,.7,'metal'),cyl(.25,.97,-.3,.025,.25,'silver')],
  rug: [box(0,.5,0,1,1,1,'rug')],
  bollard: [cyl(0,.5,0,.18,1,'metal'),sphere(0,1,0,.18,'body')],
  partition: [box(0,.5,0,1,1,.08,'fabric'),...[-.4,.4].map(x=>box(x,.03,0,.08,.06,1,'metal'))],
  floorlamp: [cyl(0,.015,0,.32,.03,'metal'),cyl(0,.5,0,.018,1,'metal'),cyl(0,.89,0,.4,.2,'linen')],
  stool: [cyl(0,.95,0,.46,.1,'wood'),...legs(.45)],
  coffeetable: [box(0,.9,0,1,.2,1,'wood'),...legs(.42)],
  locker: [box(0,.5,0,1,1,1,'metal'),...[-.32,0,.32].flatMap(x=>[box(x,.75,.51,.31,.48,.02,'body'),box(x,.25,.51,.31,.48,.02,'body')])],
  whiteboard: [box(0,.6,0,1,.8,.08,'body'),...[-.42,.42].map(x=>box(x,.27,0,.035,.54,.04,'metal')),...[-.42,.42].map(x=>box(x,.02,0,.08,.04,1,'metal'))],
  conference: [box(0,.95,0,1,.1,1,'wood'),...legs(.475)],
  wastebin: [cyl(0,.45,0,.45,.9,'metal'),cyl(0,.91,0,.48,.04,'black')],
  pendant: [cyl(0,.6,0,.012,.8,'metal'),cyl(0,.15,0,.46,.25,'body'),cyl(0,.025,0,.42,.02,'light')],
  displaystand: [box(0,.03,0,1,.06,1,'metal'),...[-.3,.3].map(x=>box(x,.52,0,.055,.96,.08,'silver'))],
  ...PRODUCT_RECIPES,
  ...FURNITURE_RECIPES,
  ...FURNITURE_VARIANT_RECIPES,
  ...DETAIL_RECIPES,
  ...PEOPLE_RECIPES,
  ...SPACE_RECIPES,
};
export const FURNITURE = [
  ['desk','업무 데스크',1.5,.74,.75],['table','회의 테이블',2.8,.75,1.1],['roundtable','카페 원형 테이블',.85,.73,.85],
  ['chair','다이닝 체어',.48,.82,.52],['taskchair','오피스 체어',.58,.95,.58],['sofa','라운지 소파',2.1,.82,.88],
  ['bench','벤치',1.8,.45,.45],['plant','실내 수목',.7,1.5,.7],['shelf','책장 · 진열장',1.25,1.8,.38],
  ['counter','서비스 카운터',2.4,1.05,.75],['island','키친 아일랜드',2.5,.9,1.1],['bed','호텔 더블 베드',1.65,.95,2.1],
  ['hospitalbed','의료용 베드',1.05,1.1,2.15],['cabinet','수납장',1.2,1.8,.55],['rack','물류 랙',2.2,2.4,1],
  ['reception','리셉션 데스크',2.8,1.1,.8],['treadmill','러닝머신',.85,1.45,1.8],['stage','공연 · 강의 단상',4,.35,1.8],
  ['sink','싱크 수납장',1.6,.9,.65],['rug','러그',3.2,.018,2.1],['bollard','차단 볼라드',.2,.85,.2],
  ['partition','이동식 파티션',1.5,1.4,.4],['floorlamp','라운지 플로어 램프',.5,1.65,.5],['stool','바 스툴',.42,.75,.42],
  ['coffeetable','소파 테이블',1.2,.42,.65],['locker','개인 락커',1.2,1.8,.5],['whiteboard','이동식 보드',1.6,1.8,.4],
  ['conference','대형 회의 테이블',4.4,.75,1.2],['wastebin','분리수거함',.3,.55,.3],['pendant','펜던트 조명',.5,.65,.5],
  ['displaystand','디스플레이 이동식 스탠드',.85,.9,.58],
].map(([kind,name,w,h,d])=>describeLegacyFurniture({id:`furniture:${kind}`,kind,name,size:[w,h,d],frontAxis:[0,0,1],parts:RECIPES[kind],physical:true,license:'CC0-1.0',dimensionSource:'designed'})).concat(FURNITURE_VARIANTS,DETAIL_ASSETS,SPACE_ASSETS);

export const STYLES = {
  warm: {name:'내추럴 우드',floor:'#e6dccb',wood:'#bb9069',fabric:'#b8c2b2',cushion:'#d8c8a8',wall:'#f5f1e8',accent:'#256d67'},
  modern: {name:'모던 오피스',floor:'#e4e8ea',wood:'#cbb89d',fabric:'#526977',cushion:'#d4bd8e',wall:'#f6f8f9',accent:'#245caa'},
  premium: {name:'프리미엄 라운지',floor:'#d8d1c7',wood:'#6b5145',fabric:'#7f8274',cushion:'#b8a180',wall:'#f2eee7',accent:'#967846'},
  clinical: {name:'클린 · 메디컬',floor:'#e6efef',wood:'#b8ccc7',fabric:'#8bb5ba',cushion:'#d5e5e4',wall:'#fafdfd',accent:'#3c8992'},
  industrial: {name:'인더스트리얼',floor:'#bfc4c7',wood:'#9e7a59',fabric:'#5c6871',cushion:'#d7a45c',wall:'#e2e6e8',accent:'#d18a32'},
};

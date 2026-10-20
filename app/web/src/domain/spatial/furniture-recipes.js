const b=(x,y,z,w,h,d,material='wood',extra={})=>({shape:'box',position:[x,y,z],size:[w,h,d],material,...extra});
const c=(x,y,z,r,h,material='metal',extra={})=>({shape:'cylinder',position:[x,y,z],size:[r,h,r],material,...extra});
const feet=(y=.24)=>[-.4,.4].flatMap(x=>[-.36,.36].map(z=>b(x,y,z,.045,y*2,.045,'metal')));
const caster=(x,y,z,r=.035)=>c(x,y,z,r,.04,'black',{rotate:[0,0,Math.PI/2]});
const spokes=Array.from({length:5},(_,i)=>{const t=i*Math.PI*2/5;return [b(Math.sin(t)*.22,.055,Math.cos(t)*.22,.05,.035,.46,'metal',{rotate:[0,t,0]}),caster(Math.sin(t)*.44,.035,Math.cos(t)*.44)];}).flat();
export const FURNITURE_RECIPES={
  chair:[b(0,.54,.03,.88,.1,.83,'fabric'),b(0,.82,-.37,.87,.36,.13,'fabric'),...feet(.25)],
  taskchair:[b(0,.48,.035,.86,.11,.77,'fabric'),b(0,.79,-.36,.84,.42,.12,'fabric'),c(0,.25,0,.035,.45),...spokes,...[-.46,.46].flatMap(x=>[b(x,.61,.03,.07,.045,.55,'black'),b(x,.54,-.08,.04,.14,.04,'metal')])],
  sofa:[b(0,.28,0,.98,.32,.91,'fabric'),b(0,.76,-.39,.98,.48,.22,'fabric'),...[-.46,.46].map(x=>b(x,.59,0,.08,.5,.96,'fabric')),...[-.23,.23].flatMap(x=>[b(x,.49,.075,.44,.15,.7,'cushion'),b(x,.76,-.25,.44,.4,.12,'cushion')]),...feet(.075)],
  bed:[b(0,.19,0,1,.25,1),b(0,.43,.015,.97,.25,.94,'linen'),b(0,.69,-.465,1,.62,.07,'fabric'),b(0,.565,.19,.98,.025,.56,'cushion'),...[-.24,.24].map(x=>b(x,.6,-.29,.39,.08,.19,'linen')),...feet(.06)],
  hospitalbed:[b(0,.33,0,.87,.07,.88,'metal'),b(0,.49,.09,.9,.12,.68,'linen'),b(0,.59,-.3,.9,.1,.26,'linen',{rotate:[-.3,0,0]}),b(0,.74,-.47,1,.5,.055,'body'),b(0,.6,.47,1,.4,.055,'body'),...[-.48,.48].flatMap(x=>[b(x,.67,0,.025,.035,.6,'metal'),...[-.26,.26].map(z=>b(x,.58,z,.025,.18,.025,'metal'))]),...[-.38,.38].flatMap(x=>[-.37,.37].flatMap(z=>[b(x,.2,z,.04,.32,.04,'metal'),caster(x,.065,z,.06)]))],
  rack:[...[-.48,.48].flatMap(x=>[-.46,.46].map(z=>b(x,.5,z,.04,1,.04,'metal'))),...Array.from({length:4},(_,i)=>b(0,.08+i*.29,0,.96,.03,.95,'wood')),...[-.26,.26].map(x=>b(x,.25,0,.4,.29,.72,'cardboard'))],
  sink:[b(0,.43,0,.98,.86,.94),...[-.245,.245].map(x=>b(x,.44,.475,.475,.83,.03,'body')),b(0,.89,-.36,1,.055,.28,'stone'),b(0,.89,.36,1,.055,.28,'stone'),...[-.43,.43].map(x=>b(x,.89,0,.14,.055,.45,'stone')),b(0,.77,0,.7,.02,.45,'metal'),b(0,.83,-.225,.7,.12,.015,'silver'),...[-.35,.35].map(x=>b(x,.83,0,.015,.12,.45,'silver')),c(.25,.98,-.3,.018,.2,'silver'),b(.25,1.07,-.19,.035,.035,.24,'silver')],
  treadmill:[b(0,.08,.03,1,.12,.96,'metal'),b(0,.15,.1,.76,.04,.72,'black'),...[-.43,.43].flatMap(x=>[b(x,.5,-.35,.055,.8,.05,'metal'),b(x,.77,-.18,.05,.04,.37,'black')]),b(0,.95,-.34,.9,.12,.17,'black'),b(0,1,-.32,.48,.008,.12,'screen')],
  whiteboard:[b(0,.66,0,.98,.68,.08,'silver'),b(0,.66,.045,.94,.63,.012,'body'),b(0,.3,.08,.95,.018,.16,'metal'),...[-.4,.4].flatMap(x=>[b(x,.2,0,.025,.4,.04,'metal'),b(x,.035,0,.07,.03,.86,'metal'),...[-.4,.4].map(z=>caster(x,.025,z,.025))])],
  displaystand:[b(0,.04,0,1,.03,.9,'metal'),...[-.3,.3].map(x=>b(x,.52,0,.05,.96,.08,'silver')),b(0,.88,0,.9,.14,.08,'metal'),...[-.43,.43].flatMap(x=>[-.38,.38].map(z=>caster(x,.025,z,.03)))],
  partition:[b(0,.56,0,1,.88,.12,'fabric'),...[-.4,.4].flatMap(x=>[b(x,.04,0,.07,.03,.94,'metal'),b(x,.17,0,.025,.26,.06,'metal')])],
  locker:[b(0,.5,-.03,1,1,.94,'metal'),...[-.33,0,.33].flatMap(x=>[.25,.75].flatMap(y=>[b(x,y,.485,.32,.485,.03,'body'),b(x+.11,y,.505,.02,.09,.01,'black'),...[-.08,0,.08].map(dx=>b(x+dx,y+.15,.505,.045,.008,.01,'grille'))]))],
};

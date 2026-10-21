// Original, simplified clothing. Each cue has geometry and travels with its actor.
const colors={doctor:'#f4f6f0',nurse:'#47989b',patient:'#b9d6dd',teacher:'#987057',lecturer:'#536882',student:'#d6a849',office:'#617387',presenter:'#3b526b',barista:'#ab835b',chef:'#f8f5e9',waiter:'#f0ece1',receptionist:'#344c6d',housekeeper:'#729aa8',concierge:'#344c6d',retailer:'#5f856a',shopper:'#d7a265',worker:'#edb83c',inspector:'#dae063',courier:'#59828c',banker:'#334e72',clerk:'#536b80',customer:'#ac967d',guide:'#6e9c8a',security:'#3e536c',cleaner:'#619290',trainer:'#557f86',performer:'#48546a',designer:'#a77862',caregiver:'#ab9bba',librarian:'#856a88',researcher:'#eef1e9',pharmacist:'#eef5e8',dentist:'#d9e9e8',baker:'#f4e8d0',artist:'#bd8061',gardener:'#6f8960',mechanic:'#537387'};
const skin=['#d8ad8d','#ad775b','#e2bea3','#86593f','#c08b69'];
const hair=['#3a302b','#242c2d','#746052','#493e3b','#b9b6aa','#644f3f'];
Object.assign(colors,{technician:'#487985',electrician:'#d3a54a',laundry:'#6d9ca1',coatkeeper:'#8b6e89',coldstore:'#637e99'});
const label={glasses:'테 안경',goggles:'보호 안경',hardhat:'안전모',toque:'높은 조리 모자',bakerCap:'베이커 모자',cap:'챙 모자',nurseCap:'의료 캡',peakedCap:'제복 모자',bellCap:'벨 캡',beret:'베레모',sunhat:'넓은 챙 작업 모자',headband:'스포츠 헤어밴드',stethoscope:'청진기',mask:'의료 마스크',badge:'명찰',lanyard:'목걸이 명찰',scarf:'접객 스카프',bowtie:'나비넥타이',tie:'넥타이',toolbelt:'공구 벨트',gloves:'작업 장갑',whistle:'호루라기',watch:'손목시계',wristband:'환자 손목 띠',pencil:'귀에 꽂은 연필'};
export function peopleAppearance(role,{variant=0,pose='stand',glasses,hairstyle}={}){
 const n=Math.abs(variant|0),accessories=[];
 let shirt=colors[role]||colors.customer,pants='#354650',style='shirt',hat=null;
 if(['teacher','librarian','designer'].includes(role))style=n%2?'cardigan':'waistcoat';
 if(['office','banker','presenter','lecturer','receptionist','concierge','performer'].includes(role))style='jacket';
 if(['nurse','caregiver','dentist'].includes(role))style='scrubs';
 if(['doctor','researcher','pharmacist'].includes(role)){style='coat';accessories.push('badge');}
 if(['barista','chef','baker','waiter','retailer','housekeeper','artist'].includes(role))style='apron';
 if(['worker','inspector','courier','guide','gardener'].includes(role))style='vest';
 if(['mechanic','cleaner'].includes(role))style='coveralls';
 if(['technician','electrician'].includes(role)){style='coveralls';hat='hardhat';accessories.push('goggles','toolbelt','gloves','badge');}
 if(['laundry','coatkeeper'].includes(role)){style='apron';hat=role==='laundry'?'cap':null;accessories.push('lanyard');}
 if(role==='coldstore'){style='jacket';hat='cap';accessories.push('gloves','badge');}
 if(['customer','shopper','student'].includes(role)){shirt=['#d5a94f','#b87663','#6c9299','#927c9f','#9caa7c','#c6a17c'][n%6];style=['cardigan','hoodie','striped-shirt'][n%3];pants=['#455968','#645652','#4c6059'][n%3];}
 if(role==='patient'){style='gown';pants=shirt;accessories.push('wristband');}
 if(role==='doctor')accessories.push('stethoscope');
 if(role==='nurse')hat='nurseCap';
 if(role==='chef')hat='toque';
 if(role==='baker')hat='bakerCap';
 if(['barista','courier','cleaner'].includes(role))hat='cap';
 if(['worker','inspector'].includes(role)){hat='hardhat';accessories.push('goggles','toolbelt','gloves');}
 if(role==='security'){hat='peakedCap';accessories.push('badge','tie');}
 if(role==='concierge'){hat='bellCap';accessories.push('tie');}
 if(role==='artist'){hat='beret';accessories.push('pencil');}
 if(role==='gardener'){hat='sunhat';accessories.push('gloves','toolbelt');}
 if(role==='mechanic')accessories.push('goggles','toolbelt','gloves');
 if(role==='researcher')accessories.push('goggles','gloves');
 if(role==='dentist')accessories.push('mask');
 if(role==='trainer'){hat=n%2?'cap':'headband';accessories.push('whistle','watch');}
 if(role==='waiter'||role==='performer')accessories.push('bowtie');
 if(role==='receptionist')accessories.push('scarf');
 if(['banker','office','presenter','lecturer'].includes(role))accessories.push('tie');
 if(['teacher','librarian','designer','clerk','guide','retailer','nurse','caregiver','housekeeper','courier'].includes(role))accessories.push('lanyard');
 if(glasses??(['doctor','teacher','lecturer','librarian','pharmacist','designer','banker'].includes(role)||n%4===1))if(!accessories.includes('goggles'))accessories.push('glasses');
 if(hat)accessories.push(hat);
 const clothing={shirt:'셔츠',cardigan:'가디건',waistcoat:'조끼와 셔츠',jacket:'재킷과 셔츠',scrubs:'스크럽 유니폼',coat:'긴 실험·진료 가운',apron:'포켓 앞치마',vest:'작업·안내 조끼',coveralls:'포켓 작업복',gown:'줄무늬 환자복',hoodie:'후드 상의','striped-shirt':'줄무늬 상의'}[style];
 return {role,variant:n,pose,shirt,pants,skin:skin[n%skin.length],hair:hair[n%hair.length],hairstyle:hairstyle||['short','bob','bun','curly','braid','ponytail'][n%6],style,hat,accessories,accessoryLabels:accessories.map(a=>label[a]),wardrobe:[clothing],cues:[clothing,...accessories.map(a=>label[a])]};
}
export function peopleCostumeParts(profile,{B,S,C,segment,head,chest,hip,right}){
 const {role,style,shirt,hair,hairstyle,accessories:acc,hat}=profile,out=[];
 const add=(type,...parts)=>out.push(...parts.map(p=>({...p,accessoryType:type})));
 const cloth=(...p)=>out.push(...p.map(p=>({...p,clothingType:style})));
 const fine=(x,y,z,w,h,d,m)=>B(x,y,z,w,h,d,m,{cornerRadius:.002});
 const ring=(x,y,z,rx,ry,r,m)=>({shape:'torus',position:[x,y,z],size:[rx,ry,r],material:m});
 // Hair silhouettes vary independently of profession; hats keep their occupational shape.
 if(!hat&&hairstyle==='bob')add('hair',S(-.08,head-.015,-.02,.038,.125,.08,hair),S(.08,head-.015,-.02,.038,.125,.08,hair),B(0,head-.04,-.074,.17,.17,.045,hair));
 if(!hat&&hairstyle==='bun')add('hair',S(0,head+.065,-.105,.065,.065,.055,hair));
 if(!hat&&hairstyle==='ponytail')add('hair',S(0,head-.06,-.11,.042,.13,.04,hair));
 if(!hat&&hairstyle==='braid')for(let i=0;i<4;i++)add('hair',S(i%2?.012:-.012,head-.015-i*.047,-.105,.032,.036,.032,hair));
 if(!hat&&hairstyle==='curly')for(const x of [-.062,0,.062])for(const z of [-.05,.025])add('hair',S(x,head+.09,z,.047,.045,.045,hair));
 if(['jacket','cardigan','waistcoat','coat'].includes(style)){
  cloth(B(0,chest+.08,.123,.16,.3,.014,'#eeeae0'),B(-.1,chest+.105,.139,.09,.23,.02,shirt,{rotate:[0,0,.24]}),B(.1,chest+.105,.139,.09,.23,.02,shirt,{rotate:[0,0,-.24]}));
  for(const yy of [chest,chest-.07,chest-.14])cloth(S(0,yy,.146,.009,.009,.005,'#cec4b0'));
 }
 if(style==='coat'){
  cloth(B(-.145,chest-.15,.025,.06,.58,.25,shirt),B(.145,chest-.15,.025,.06,.58,.25,shirt),B(-.105,chest-.14,.145,.09,.085,.012,'#dce2d9'));
  if(role==='doctor')cloth(B(0,chest+.07,.146,.07,.18,.016,'#529396'));
  if(role==='pharmacist')cloth(B(-.095,chest+.13,.153,.065,.045,.012,'#5b9a66'));
 }
 if(style==='hoodie')cloth(S(0,chest+.2,-.09,.18,.095,.09,shirt),B(0,chest-.12,.13,.21,.075,.014,'#e4d9c2'),fine(-.035,chest+.1,.137,.009,.16,.009,'#e9e1ce'),fine(.035,chest+.1,.137,.009,.16,.009,'#e9e1ce'));
 if(style==='striped-shirt')for(const yy of [-.13,-.04,.05,.14])cloth(B(0,chest+yy,.121,.32,.018,.01,'#e8e2d4'));
 if(style==='scrubs'||style==='coveralls')cloth(B(0,chest+.18,.124,.09,.07,.012,'#e1e4d9',{rotate:[0,0,Math.PI/4]}),B(-.095,chest-.06,.126,.085,.09,.012,'#b5cfcb'),fine(0,chest-.02,.132,.012,.33,.008,'#d6d6bf'));
 if(style==='apron'){
  const apron=role==='barista'?'#60442e':role==='artist'?'#6d888b':role==='retailer'?'#3f6851':role==='baker'?'#b28c68':'#b8aa90';
  cloth(B(0,chest-.15,.138,.31,.48,.025,apron),B(0,chest+.09,.136,.14,.18,.022,apron),B(0,chest-.18,.155,.22,.11,.014,'#d3bd99'),fine(0,chest-.18,.165,.01,.1,.004,apron));
  for(const sx of [-1,1])cloth(segment([sx*.055,chest+.18,.12],[sx*.13,chest+.22,-.06],.014,apron));
  if(role==='artist')for(const [x,m]of [[-.07,'#b97b56'],[.02,'#d9b94c'],[.09,'#668f77']])cloth(S(x,chest-.12,.168,.025,.035,.007,m));
 }
 if(style==='vest'){
  for(const sx of [-1,1])cloth(B(sx*.125,chest,.128,.07,.43,.023,shirt),B(sx*.115,chest-.1,.147,.08,.09,.012,'#d9d1b2'));
  if(['worker','inspector','courier'].includes(role))for(const yy of [chest-.08,chest+.03])cloth(fine(0,yy,.157,.36,.028,.008,'#f3f0c5'));
 }
 if(['technician','electrician'].includes(role))for(const yy of [chest-.08,chest+.03])cloth(fine(0,yy,.157,.36,.028,.008,'#f3f0c5'));
 if(role==='coldstore')for(const yy of [-.14,-.04,.06,.16])cloth(fine(0,chest+yy,.151,.32,.012,.012,'#a7b8c6'));
 if(style==='gown')for(const yy of [-.13,-.03,.07,.17])cloth(B(0,chest+yy,.122,.33,.012,.009,'#739ca8'));
 if(acc.includes('glasses')||acc.includes('goggles')){
  const goggles=acc.includes('goggles'),m=goggles?'#a6ced0':'#394542',r=goggles?.008:.004;
  add(goggles?'goggles':'glasses',ring(-.043,head+.018,.101,.035,.028,r,m),ring(.043,head+.018,.101,.035,.028,r,m),fine(0,head+.02,.104,.018,.007,.008,m),segment([-.08,head+.018,.1],[-.096,head+.025,-.02],.004,m),segment([.08,head+.018,.1],[.096,head+.025,-.02],.004,m));
  if(goggles)add('goggles',fine(0,head+.02,-.091,.16,.022,.01,'#687c7d'));
 }
 if(acc.includes('stethoscope'))add('stethoscope',segment([-.07,chest+.18,.15],[-.1,chest-.02,.16],.009,'#334b50'),segment([.07,chest+.18,.15],[.1,chest-.02,.16],.009,'#334b50'),segment([-.1,chest-.02,.16],[0,chest-.09,.16],.009,'#334b50'),segment([.1,chest-.02,.16],[0,chest-.09,.16],.009,'#334b50'),C(0,chest-.09,.177,.025,.012,'silver',{rotate:[Math.PI/2,0,0]}));
 if(acc.includes('badge'))add('badge',B(.1,chest+.08,.163,.055,.07,.009,'#f7f2e6'),fine(.1,chest+.098,.17,.043,.014,.005,'#528392'));
 if(acc.includes('lanyard'))add('lanyard',segment([-.065,chest+.21,.133],[0,chest-.02,.158],.007,'#bba970'),segment([.065,chest+.21,.133],[0,chest-.02,.158],.007,'#bba970'),B(0,chest-.055,.16,.065,.08,.012,'#f4eee0'),fine(0,chest-.043,.168,.049,.018,.005,'#587e8d'));
 if(acc.includes('tie'))add('tie',B(0,chest+.02,.166,.035,.25,.014,role==='security'?'#25344a':'#b38b5a'),S(0,chest+.16,.169,.026,.024,.012,'#b38b5a'));
 if(acc.includes('bowtie'))add('bowtie',B(-.032,chest+.16,.151,.055,.04,.016,'#554d44',{rotate:[0,0,-.25]}),B(.032,chest+.16,.151,.055,.04,.016,'#554d44',{rotate:[0,0,.25]}));
 if(acc.includes('scarf'))add('scarf',B(0,chest+.205,.11,.22,.05,.07,'#c99b68'),B(.06,chest+.13,.15,.065,.15,.02,'#c99b68',{rotate:[0,0,-.35]}));
 if(acc.includes('mask'))add('mask',B(0,head-.045,.09,.15,.075,.03,'#a1c8c8'),segment([-.078,head-.025,.1],[-.095,head-.01,-.01],.003,'#e1e6dc'),segment([.078,head-.025,.1],[.095,head-.01,-.01],.003,'#e1e6dc'));
 if(acc.includes('toolbelt'))add('toolbelt',B(0,hip+.035,.01,.36,.055,.28,'#685442'),B(-.16,hip-.04,.16,.1,.14,.08,'#967957'),B(.17,hip-.035,.13,.1,.14,.075,'#967957'),segment([.18,hip-.08,.18],[.18,hip+.13,.18],.012,'#788b8b'),B(.18,hip+.12,.18,.11,.035,.035,'#788b8b'));
 if(acc.includes('whistle'))add('whistle',segment([-.07,chest+.2,.13],[0,chest-.04,.15],.005,'#d6c797'),segment([.07,chest+.2,.13],[0,chest-.04,.15],.005,'#d6c797'),B(0,chest-.055,.16,.026,.035,.02,'silver'));
 if(acc.includes('watch')||acc.includes('wristband'))add(acc.includes('watch')?'watch':'wristband',B(right[1][0],right[1][1]-.034,right[1][2],.074,.02,.067,role==='patient'?'#f3eee2':'#465966'));
 if(acc.includes('pencil'))add('pencil',segment([.1,head-.04,.015],[.1,head+.09,.025],.006,'#d5b05f'));
 if(hat==='hardhat')add(hat,S(0,head+.11,0,.119,.075,.113,role==='worker'?'#edb03f':'#e7ece3'),C(0,head+.095,0,.137,.018,role==='worker'?'#edb03f':'#e7ece3'),fine(0,head+.174,0,.018,.02,.15,'#d7d4b6'));
 if(hat==='toque'||hat==='bakerCap')add(hat,C(0,head+.125,0,.105,.05,'#f6f0df'),S(0,head+(hat==='toque'?.235:.17),0,.125,hat==='toque'?.12:.065,.112,'#f6f0df'));
 if(hat==='nurseCap')add(hat,S(0,head+.105,0,.105,.047,.095,'#6caaa8'),B(0,head+.106,.083,.11,.032,.012,'#e3ebe3'));
 if(['cap','peakedCap'].includes(hat))add(hat,S(0,head+.09,-.005,.105,.055,.097,shirt),B(0,head+.085,.105,.17,.018,.13,shirt));
 if(hat==='bellCap')add(hat,C(0,head+.12,0,.102,.08,'#344c6d'),C(0,head+.16,0,.104,.013,'#c6aa68'),fine(0,head+.115,.104,.028,.035,.012,'#c6aa68'));
 if(hat==='beret')add(hat,S(-.026,head+.11,0,.13,.046,.108,'#53666b'),C(-.026,head+.16,0,.009,.025,'#53666b'));
 if(hat==='sunhat')add(hat,C(0,head+.09,0,.185,.022,'#bea570'),S(0,head+.13,-.01,.105,.065,.095,'#c5ac79'),C(0,head+.106,0,.108,.023,'#6d7958'));
 if(hat==='headband')add(hat,C(0,head+.065,0,.099,.035,'#dbcba7'));
 return out;
}

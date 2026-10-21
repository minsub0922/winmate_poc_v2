// Correct existing built-in layout bounds without changing the frozen reference
// pack or registering extra templates. All views and exports use the same HTML.
import {applyProposalTypography} from './proposal_typography.js';
const rules = {
  L_C08: {
    2: { 'white-space': 'pre-line', 'word-break': 'keep-all', 'overflow-wrap': 'anywhere', 'font-size': '36px', 'line-height': '1.3', height: '112px' },
    3: { 'font-size': '17px', 'line-height': '1.4', height: '48px' },
  },
  L_C01: {
    1: {width:'180px',height:'28px',border:'none',background:'transparent',display:'block','font-size':'15px','font-weight':'800',color:'#1428a0','letter-spacing':'.06em'},
    3: { height: '124px', 'font-size':'44px','line-height':'1.25', 'white-space': 'pre-line', 'overflow-wrap': 'anywhere' },
    4: {'font-size':'17px','line-height':'1.45',height:'56px'},
    7: {border:'none',background:'transparent','font-size':'10px','letter-spacing':'.06em'},
  },
  L_C02: {
    1: {left:'1060px',top:'504px',width:'156px',height:'28px',border:'none',background:'transparent',display:'block','font-size':'15px','font-weight':'800',color:'#1428a0','line-height':'1.4','letter-spacing':'.06em','text-align':'right'},
    3: {'font-size':'40px','line-height':'1.2',height:'112px','white-space':'pre-line','overflow-wrap':'anywhere'},
    4: {top:'660px','font-size':'16px','line-height':'1.4',height:'44px'},
    5: {border:'none',background:'transparent','font-size':'10px','letter-spacing':'.06em'},
    6: {width:'220px','white-space':'normal','font-size':'12px','line-height':'1.4'},
  },
  L_PH_VP_B4: Object.fromEntries([3, 7, 11, 15].map(i => [i, { 'line-height': '1.25' }])),
  L_PH_SO_B: Object.fromEntries([10, 17, 24].map(i => [i, { 'line-height': '1.3' }])),
  L_SOL_03: { 0: { top: '24px', 'font-size': '27px', 'line-height': '32px' } },
  L_SOL_06: { 5: { top: '240px' } },
  L_SOL_11: {
    ...Object.fromEntries([3, 5, 7].map(i => [i, { top: '494px' }])),
    ...Object.fromEntries([4, 6, 8].map(i => [i, { top: '544px' }])),
  },
  L_SOL_12: {
    3: { top: '548px', width: '678px', 'font-size': '24px', 'line-height': '1.4' },
    4: { top: '592px', width: '678px', height: '48px', 'white-space': 'normal', 'font-size': '17px', 'line-height': '1.4' },
  },
  L_SOL_13: {
    3: { top: '548px', width: '359px', 'font-size': '24px', 'line-height': '1.4' },
    4: { top: '592px', width: '359px', height: '48px', 'white-space': 'normal', 'font-size': '17px', 'line-height': '1.4' },
  },
};
const spaceCaptionRules = Object.fromEntries([3, 4, 5].map(i => [i, { 'line-height': '1.4', 'flex-shrink': '0' }]));

function styles(original, updates) {
  const properties = new Map(original.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const colon = s.indexOf(':'); return [s.slice(0, colon).trim(), s.slice(colon + 1).trim()];
  }));
  for (const [name, value] of Object.entries(updates)) properties.set(name, value);
  return [...properties].map(([name, value]) => name + ': ' + value).join('; ');
}

export function repairLayoutHtml(f, html) {
  const spaceCaption = /^L_PH_SS_[A-Z]+_B$/.test(f),rule=rules[f] || (spaceCaption ? spaceCaptionRules : null);
  if (!html) return html;
  if (/data-proposal-typography="\d+"/.test(html)) return applyProposalTypography(f,html);
  const repaired = !rule ? html : html.replace(/<[a-z][\w-]*\b[^>]*>/gi, tag => {
    const id = /\bdata-tb="(\d+)"/.exec(tag)?.[1];
    const style = /\bstyle="([^"]*)"/.exec(tag);
    if (!style) return tag;
    let updates = rule[id];
    // Reserve two subtitle lines above the cover's tags.
    if (f === 'L_C08' && /left:\s*64px/.test(style[1]) && /top:\s*458px/.test(style[1])) updates = { top: '480px' };
    if (spaceCaption && /left:\s*80px/.test(style[1]) && /top:\s*552px/.test(style[1])) updates = { top: '530px', height: '104px' };
    if(f==='L_C01'&&/left:\s*64px/.test(style[1])&&/top:\s*620px/.test(style[1]))updates={width:'360px'};
    return updates ? tag.replace(style[0], 'style="' + styles(style[1], updates) + '"') : tag;
  });
  return applyProposalTypography(f,repaired);
}

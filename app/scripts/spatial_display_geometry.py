"""Reconstruct display panels in physical metres, including their measured bezel.

Outer stand dimensions and bare-panel dimensions are separate measurements.
The geometry is normalized only after all physical component sizes are known.
"""
import hashlib
import json
import math
import re


def configure_display(asset, detail, parse_dimensions, products=()):
    if asset['kind'] not in ('display', 'monitor'):
        return
    original_recipe = asset['recipe']
    overall = asset['size']
    panel = list(asset.get('componentDimensions', {}).get('display', overall))
    panel_source = asset.get('componentDimensions', {}).get('displaySource', asset['dimensionSource'])
    bare_rows = [r for r in detail.get('specs', []) if len(r)>2 and re.search(r'스탠드\s*제외', str(r[1]))]
    if asset['kind']=='monitor' and bare_rows and not asset.get('componentDimensions'):
        panel, panel_source, _ = parse_dimensions({}, {'specs':bare_rows}, 'display')
    if asset.get('displayPanelSize'):panel=list(asset['displayPanelSize']);panel_source='catalog-spec'
    has_stand = bool(asset.get('componentDimensions')) or asset['kind']=='monitor' and overall[2]>.09
    if has_stand and panel==overall and not asset.get('componentDimensions'):
        # An outer-size row cannot establish the screen's height. Infer only the
        # missing component and keep that inference explicit.
        panel=[overall[0],min(overall[1]*.78,overall[0]*9/16+.025),min(.045,overall[2]*.2)]
        panel_source='estimated-component'
    bezel=[.008]*4
    bezel_source='estimated'
    rows=[r for r in detail.get('specs', []) if len(r)>2 and re.search(r'베젤 두께|bezel.*(?:width|thickness)', str(r[1]), re.I)]
    if rows:
        value=str(rows[0][2]);values=[float(n)/1000 for n in re.findall(r'\d+(?:\.\d+)?',value)]
        if values and max(values)<.1:
            bezel_source='catalog-spec'
            bezel=[values[0]]*4
            if len(values)>1 and re.search(r'T/LR|T/L/R',value,re.I):bezel=[values[0],values[0],values[0],values[1]]
            elif len(values)==2 and re.search(r'U/L|U.*L',value,re.I):bezel=[values[0],values[0],values[1],values[1]]
    if re.search(r'The Wall|Onyx|실내.*LED|실외.*LED|\b(?:IFR|XHB)\b',asset['name']+' '+asset['model'],re.I):bezel=[0,0,0,0];bezel_source='module-layout-assumption'
    if asset.get('displayOrientation')=='portrait':bezel=[bezel[3],bezel[0],bezel[1],bezel[2]]
    if asset.get('displayBezel'):bezel=asset['displayBezel'];bezel_source=asset.get('displayBezelSource','manufacturer-reference')
    pw,ph,pd=panel;W,H,D=overall
    cy=H-ph/2 if has_stand else H/2
    cz=max(-D/2+pd/2,-D*.2) if has_stand else 0
    curve=None
    for row in detail.get('specs',[]):
        if len(row)>2 and '곡률' in str(row[1]):
            match=re.search(r'(\d+)\s*R',str(row[2]),re.I)
            if match:curve=int(match[1])/1000
    if asset.get('displayCurvature'):curve=asset['displayCurvature']
    def box(x,y,z,w,h,d,material,corner=.001):
        return {'shape':'box','position':[x/W,y/H,z/D],'size':[w/W,h/H,d/D],'material':material,'physicalCornerRadius':corner}
    body=asset.get('specColor') or ('#e8e6df' if original_recipe in ('whiteDisplay','epaper') else '#202226')
    parts=[]
    if has_stand:
        base_h=min(.015,H*.025);stand_h=max(base_h,cy-base_h)
        stand_color=asset.get('specColor') or '#303438'
        parts.extend([box(0,base_h/2,0,min(W*.6,.65),base_h,D,stand_color),box(0,base_h+stand_h/2,max(-D*.35,cz-pd/2),min(.045,W*.08),stand_h,min(.04,D*.1),stand_color)])
    if curve and pw<curve*2:
        sag=curve-math.sqrt(curve*curve-(pw/2)**2);skin=max(.006,pd-sag)
        parts.append({'shape':'curvedPanel','position':[0,cy/H,(cz-pd/2+skin)/D], 'size':[pw/W,ph/H,skin/D],
                      'arc':{'radius':curve,'width':pw,'depth':D},'material':body})
        front_z=cz-pd/2+skin
    else:
        parts.append(box(0,cy,cz,pw,ph,pd,body,.003 if asset['kind']=='monitor' else .004 if original_recipe=='epaper' else .001));front_z=cz+pd/2
    left,top,right,bottom=bezel
    # An inactive screen is neutral black. Product photography is mapped onto a
    # separate front surface by the renderer, never stretched around a box.
    if not curve:parts.append(box((left-right)/2,cy+(bottom-top)/2,front_z-.00005,max(.001,pw-left-right),max(.001,ph-top-bottom),.0001,'screenOff',0))
    asset['displaySpec']={'panelSize':panel,'panelDimensionSource':panel_source,'bezel':bezel,'bezelDimensionSource':bezel_source,
                         'panelCenter':[0,cy,cz],'frontZ':front_z,'curvatureRadius':curve,
                         'hasStand':has_stand,'sides':2 if original_recipe=='doubleDisplay' else 1,
                         'bezelEvidence':rows[0] if rows else None,'model':asset.get('specModel') or asset['model']}
    evidence=asset.get('componentDimensions',{}).get('displayEvidence')
    if evidence:
        match=re.match(r'^([A-Z][A-Z0-9/-]{6,})\s*·',str(evidence[0]))
        donor=next((p for p in products if match and p.get('model')==match[1] and p.get('gal')),None)
        if donor:asset['displaySpec']['imageEvidence']={'gallery':donor['gal'],'labels':donor.get('galAlt',[]),'productId':donor['id'],'scope':'exact-measured-panel-component'}
    asset['parts']=parts;asset['recipeFamily']=original_recipe
    asset['recipe']='measuredDisplay-'+hashlib.sha256(json.dumps(parts,sort_keys=True).encode()).hexdigest()[:12]

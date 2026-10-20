"""Validate furniture-bound occupants against their immutable people recipes."""
import math

SEATS = {'chair', 'taskchair', 'sofa', 'bench', 'stool'}
TABLES = {'desk', 'table', 'roundtable', 'coffeetable', 'conference', 'reception', 'counter', 'island'}
MEALS = {'meal', 'ricebowl', 'lunchtray', 'pasta', 'salad', 'breakfast'}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def yaw(point, angle):
    x, y, z = point
    return [x*math.cos(angle)+z*math.sin(angle), y, -x*math.sin(angle)+z*math.cos(angle)]


def rotate(point, angles):
    x, y, z = point
    rx, ry, rz = angles
    x, y = x*math.cos(rz)-y*math.sin(rz), x*math.sin(rz)+y*math.cos(rz)
    x, z = x*math.cos(ry)+z*math.sin(ry), -x*math.sin(ry)+z*math.cos(ry)
    return [x, y*math.cos(rx)-z*math.sin(rx), y*math.sin(rx)+z*math.cos(rx)]


def cloud(parts):
    points = []
    for part in parts:
        w, h, d = part['size']
        shape = part['shape']
        low = [-w, -h, -d] if shape == 'sphere' else [-w, -h/2, -d] if shape == 'cylinder' else [-w, -h, -d*.2] if shape == 'torus' else [-w/2, -h/2, -d/2]
        high = [-v for v in low]
        if shape == 'lathe':
            radius = max(p[0] for p in part['profile'])
            low = [-radius*w, min(p[1] for p in part['profile'])*h, -radius*d]
            high = [radius*w, max(p[1] for p in part['profile'])*h, radius*d]
        for x in (low[0], high[0]):
            for y in (low[1], high[1]):
                for z in (low[2], high[2]):
                    points.append([a+b for a, b in zip(rotate([x,y,z], part.get('rotate', [0,0,0])), part['position'])])
    return points


def bounds(points):
    return ([min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)])


def world(points, owner):
    return [[a+b for a,b in zip(yaw(p,-math.radians(owner['rotation'])), [owner['x'],owner['elevation'],owner['z']])] for p in points]


def furniture_bounds(obj, asset):
    w,h,d = asset['size']
    t = math.radians(obj['rotation'])
    ew,ed = abs(w*math.cos(t))+abs(d*math.sin(t)), abs(d*math.cos(t))+abs(w*math.sin(t))
    return ([obj['x']-ew/2,obj['elevation'],obj['z']-ed/2], [obj['x']+ew/2,obj['elevation']+h,obj['z']+ed/2])


def overlap(a,b,pad=.025):
    return all(a[0][i] < b[1][i]+(-.012 if i == 1 else pad) and a[1][i] > b[0][i]-(-.012 if i == 1 else pad) for i in range(3))


def validate_people(scene, assets):
    objects = scene['objects']
    byid = {o['id']:o for o in objects}
    rooms = {r['id']:r for r in scene['rooms']}
    groups, actors, foods = [], {}, {}
    for owner in objects:
        people = owner.get('people', [])
        if not isinstance(people,list) or len(people)>4:
            raise ValueError('가구별 사람 연출은 최대 4명입니다.')
        host = assets[owner['assetId']]
        for index, person in enumerate(people):
            if not isinstance(person,dict):raise ValueError('사람 연출 참조가 올바르지 않습니다.')
            source = assets.get(person.get('sourceAssetId'), {})
            actor = next((a for a in source.get('actors',[]) if a['id']==person.get('actorId')), None)
            offset, scale = person.get('offset'), person.get('scale')
            if source.get('assetGroup')!='people' or not actor or person.get('version')!=1 or person.get('mode') not in ('seat','stand','bed') or not isinstance(offset,list) or len(offset)!=3 or not all(finite(n) and abs(n)<=4 for n in offset) or not finite(scale) or not .7<=scale<=1.12 or not finite(person.get('rotation')):
                raise ValueError('사람 연출 참조·위치가 올바르지 않습니다.')
            if person['mode']=='seat' and (host['kind'] not in SEATS or actor['pose']!='sit'):
                raise ValueError('착석 연출에는 알맞은 의자가 필요합니다.')
            if person['mode']=='seat' and (abs(offset[0])>host['size'][0]/2-.12 or abs(offset[2])>host['size'][2]/2-.1):
                raise ValueError('사람을 의자 좌판 안에 배치해 주세요.')
            if person['mode']=='stand' and actor['pose']!='stand':
                raise ValueError('서 있는 연출의 자세가 올바르지 않습니다.')
            if person['mode']=='bed' and (host['kind']!='hospitalbed' or source['id']!='people:doctor-bed-round' or actor['roleId']!='patient'):
                raise ValueError('침상 연출에는 의료 침상이 필요합니다.')
            target = byid.get(person.get('targetId'))
            if person.get('targetId') and (not target or target['roomId']!=owner['roomId']):
                raise ValueError('사람 연출의 작업 대상을 찾지 못했습니다.')
            key = (source['id'],actor['id'])
            if key not in actors:
                original = cloud([p for p in source['parts'] if p.get('actorId')==actor['id']])
                actors[key] = [[v/actor['scale'] for v in yaw([p[i]-actor['anchor'][i] for i in range(3)], -actor['rotation'])] for p in original]
            local = [[v+offset[i] for i,v in enumerate(yaw([n*scale for n in p], -math.radians(person['rotation'])))] for p in actors[key]]
            b = bounds(world(local,owner))
            r = rooms[owner['roomId']]
            if b[0][0]<r['x']+.0599 or b[1][0]>r['x']+r['width']-.0599 or b[0][2]<r['z']+.0599 or b[1][2]>r['z']+r['depth']-.0599 or b[0][1]<-.0051 or b[1][1]>r['height']-.0399:
                raise ValueError('사람 연출이 공간 경계를 벗어납니다.')
            if b[1][2]>r['z']+r['depth']-1.15 and b[0][0]<r['x']+r['width']/2+.66 and b[1][0]>r['x']+r['width']/2-.66:
                raise ValueError('사람 연출이 출입 동선을 막습니다.')
            food_bounds = None
            if person.get('meal') is not None:
                meal = person['meal']
                if not isinstance(meal,dict):raise ValueError('식사 연출의 식기 참조가 올바르지 않습니다.')
                food = assets.get(meal.get('sourceAssetId'),{})
                mo, ms = meal.get('offset'),meal.get('scale')
                if not target or not isinstance(mo,list) or len(mo)!=3 or not all(finite(n) for n in mo) or not finite(ms) or not .6<=ms<=1:
                    raise ValueError('식사 연출의 식기 참조가 올바르지 않습니다.')
                if food.get('id') not in foods:
                    points = cloud([p for p in food.get('parts',[]) if p.get('component')=='tool' and p.get('objectType') in MEALS])
                    if not points:raise ValueError('식사 연출의 식기 참조가 올바르지 않습니다.')
                    lo,hi = bounds(points)
                    center = [(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2]
                    foods[food['id']] = [[p[i]-center[i] for i in range(3)] for p in points]
                fp = foods[food['id']]
                lo,hi = bounds(fp)
                ta = assets[target['assetId']]
                if any(abs(mo[i])+(hi[i]-lo[i])*ms/2>ta['size'][i]/2-.0249 for i in (0,2)) or abs(mo[1]-ta.get('supportSurfaceHeight',ta['size'][1]))>.0251:
                    raise ValueError('식기가 테이블 상판을 벗어납니다.')
                food_bounds = bounds(world([[p[i]*ms+mo[i] for i in range(3)] for p in fp],target))
            groups.append(dict(owner=owner,person=person,index=index,bounds=b,food=food_bounds))
    for group in groups:
        owner, person, b = group['owner'],group['person'],group['bounds']
        for other in objects:
            if other['id']==owner['id'] or other['roomId']!=owner['roomId'] or assets[other['assetId']]['kind']=='rug':continue
            intentional = person['mode']=='seat' and person.get('targetId')==other['id'] and owner.get('facing',{}).get('targetId')==other['id'] and assets[other['assetId']]['kind'] in TABLES
            if not intentional and overlap(b,furniture_bounds(other,assets[other['assetId']])):
                raise ValueError('사람 연출이 가구·제품과 겹칩니다.')
            if group['food'] and other['id']!=person.get('targetId') and overlap(group['food'],furniture_bounds(other,assets[other['assetId']]),.01):
                raise ValueError('식기가 다른 오브젝트와 겹칩니다.')
        for other in groups:
            if other is group or other['owner']['roomId']!=owner['roomId']:continue
            if overlap(b,other['bounds'],.04):raise ValueError('사람 연출끼리 겹칩니다.')

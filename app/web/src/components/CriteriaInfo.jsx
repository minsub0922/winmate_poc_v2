import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { Modal, Icon } from './common.jsx';
import {
  CRITERIA as CR,
  CATS,
  band as bandOf,
  verdictOf
} from '../domain/review/criteria.js';

// Recovered from the published patch; normal source component, never a build-time patch.
export function CriteriaInfo({ r: report, onClose: onClose }) {
  let jsx = jsxRuntime.jsx,
    jsxs = jsxRuntime.jsxs,
    [category, setCategory] = (0, React.useState)(null),
    [expanded, setExpanded] = (0, React.useState)(
      () => /* @__PURE__ */ new Set()
    ),
    selection = Object.fromEntries(
      ((report && report.sel) || []).map((x) => [x.id, x])
    ),
    results = (report && report.results) || {},
    applicableCount = CR.filter(
      (x) => selection[x.id] && selection[x.id].applied
    ).length,
    allExpanded = CR.every((x) => expanded.has(x.id)),
    toggleCriterion = (id) =>
      setExpanded((o) => {
        let n = new Set(o);
        return (n.has(id) ? n.delete(id) : n.add(id), n);
      }),
    importanceDots = (w) =>
      jsx('span', {
        className: 'rv-w',
        'aria-label': '중요도 ' + w,
        children: [1, 2, 3].map((p) =>
          jsx('i', { className: p <= w ? 'on' : '' }, p)
        )
      }),
    criterionStatus = (c) => {
      let a = selection[c.id],
        x = results[c.id];
      if (!a) return null;
      if (!a.applied)
        return jsx('span', { className: 'wm-ci-s off', children: '미적용' });
      if (!x || x.score == null || x.na)
        return jsx('span', { className: 'wm-ci-s off', children: '해당 없음' });
      let b = bandOf(x.score);
      return jsxs('span', {
        className: 'wm-ci-s b-' + b.k,
        children: [jsx('b', { className: 'num', children: x.score }), b.label]
      });
    },
    bands = [
      [0, 49],
      [50, 69],
      [70, 84],
      [85, 100]
    ].map(([lo2, hi2]) => ({
      lo: lo2,
      hi: hi2,
      b: bandOf(lo2),
      v: verdictOf(lo2)
    })),
    totalWeight = CATS.reduce((t, c) => t + c.w, 0),
    groups = CATS.filter((c) => !category || c.id === category),
    pickCategory = (v2, id) => {
      let h = v2.currentTarget.parentElement.previousElementSibling,
        b = h && h.closest('.mbody');
      (setCategory(id),
        b &&
          setTimeout(() => {
            let d =
              h.getBoundingClientRect().top - b.getBoundingClientRect().top;
            d < 0 && (b.scrollTop += d);
          }, 0));
    };
  return jsxs(Modal, {
    size: 'wm-ci',
    onClose: onClose,
    title: '검토 점수 기준',
    sub:
      CR.length +
      '개 검토 기준 중 이 제안서에 맞는 기준만 골라 기준마다 0~100점을 매기고, 중요도와 영역 가중치로 묶어 종합 점수를 내요.',
    bodyClass: 'mbody wm-ci-b',
    children: [
      jsxs('section', {
        className: 'wm-ci-sec',
        'aria-label': '점수 계산',
        children: [
          jsx('h3', {
            className: 'wm-ci-h',
            children: '종합 점수는 이렇게 계산해요'
          }),
          jsxs('ol', {
            className: 'wm-ci-steps',
            children: [
              jsxs('li', {
                children: [
                  jsx('span', { className: 'wm-ci-n num', children: '1' }),
                  jsxs('div', {
                    children: [
                      jsxs('b', {
                        children: [
                          '기준 점수',
                          jsx('span', { className: 'num', children: '0~100' })
                        ]
                      }),
                      jsx('p', {
                        children:
                          'AI가 기준마다 장 번호와 짧은 인용을 근거로 채점해요. AI를 쓸 수 없거나 응답이 없으면 자동 점검 규칙으로 매겨요.'
                      }),
                      jsx('small', {
                        children:
                          '90 이상 그대로 제출 가능 · 75~89 사소한 보완 · 60~74 눈에 띄는 보완 · 40~59 큰 문제 · 40 미만 심각하거나 빠짐'
                      })
                    ]
                  })
                ]
              }),
              jsxs('li', {
                children: [
                  jsx('span', { className: 'wm-ci-n num', children: '2' }),
                  jsxs('div', {
                    children: [
                      jsxs('b', {
                        children: [
                          '영역 점수',
                          jsx('span', {
                            className: 'num',
                            children: '중요도 가중 평균'
                          })
                        ]
                      }),
                      jsx('p', {
                        children:
                          '한 영역 안에서 적용된 기준 점수를 기준 중요도(1~3)로 가중 평균해요. 중요도 3인 기준은 1인 기준보다 3배 크게 반영돼요.'
                      }),
                      jsxs('small', {
                        className: 'wm-ci-wl',
                        children: [
                          importanceDots(1),
                          jsx('span', { children: '1' }),
                          importanceDots(2),
                          jsx('span', { children: '2' }),
                          importanceDots(3),
                          jsx('span', { children: '3' })
                        ]
                      })
                    ]
                  })
                ]
              }),
              jsxs('li', {
                children: [
                  jsx('span', { className: 'wm-ci-n num', children: '3' }),
                  jsxs('div', {
                    children: [
                      jsxs('b', {
                        children: [
                          '종합 점수',
                          jsx('span', {
                            className: 'num',
                            children: '영역 가중 평균'
                          })
                        ]
                      }),
                      jsx('p', {
                        children:
                          CATS.length +
                          '개 영역 점수를 아래 영역 가중치로 가중 평균해요. 적용된 기준이 없는 영역은 빼고 남은 가중치로 다시 나눠요.'
                      })
                    ]
                  })
                ]
              })
            ]
          }),
          jsx('div', {
            className: 'wm-ci-wts',
            'aria-label': '영역 가중치',
            children: CATS.map((c) =>
              jsxs(
                'span',
                {
                  className: 'wm-ci-wt',
                  title: c.name + ' ' + c.w + '%',
                  style: {
                    flexGrow: c.w,
                    '--hc': 'var(--h-' + c.hue + ')',
                    '--hcb': 'var(--h-' + c.hue + '-bg)'
                  },
                  children: [
                    jsx('b', { children: c.short }),
                    jsx('span', {
                      className: 'num',
                      children: Math.round((c.w * 100) / totalWeight) + '%'
                    })
                  ]
                },
                c.id
              )
            )
          })
        ]
      }),
      jsxs('section', {
        className: 'wm-ci-sec',
        'aria-label': '등급',
        children: [
          jsx('h3', { className: 'wm-ci-h', children: '점수 등급' }),
          jsx('div', {
            className: 'wm-ci-bands',
            children: bands.map((x) =>
              jsxs(
                'div',
                {
                  className: 'wm-ci-band b-' + x.b.k,
                  children: [
                    jsxs('span', {
                      className: 'wm-ci-bt',
                      children: [
                        jsx('b', { children: x.b.label }),
                        jsx('span', {
                          className: 'num',
                          children: x.lo + '~' + x.hi
                        })
                      ]
                    }),
                    jsx('span', { className: 'wm-ci-bv', children: x.v })
                  ]
                },
                x.lo
              )
            )
          }),
          jsxs('dl', {
            className: 'wm-ci-notes',
            children: [
              jsx('dt', { children: '보완 필요' }),
              jsx('dd', { children: '70점 미만인 기준 수예요.' }),
              jsx('dt', { children: '먼저 고칠 것' }),
              jsx('dd', {
                children:
                  '80점 미만 기준 중 중요도 × 영역 가중치 × (100 − 점수)가 큰 순서로 최대 5개를 골라요.'
              }),
              jsx('dt', { children: '적용 기준' }),
              jsx('dd', {
                children:
                  '고객 요구사항 연결, 수치 · 경쟁사 언급, 파일 형식 같은 조건으로 이 제안서에 맞는 기준만 채점해요. ‘기준 조정 · 다시 평가’에서 직접 넣고 뺄 수 있어요.'
              })
            ]
          })
        ]
      }),
      jsxs('section', {
        className: 'wm-ci-sec',
        'aria-label': '평가 기준',
        children: [
          jsxs('div', {
            className: 'wm-ci-lh',
            children: [
              jsxs('h3', {
                className: 'wm-ci-h',
                children: [
                  '평가 기준 ',
                  jsx('span', { className: 'num', children: CR.length }),
                  '개'
                ]
              }),
              report && report.sel
                ? jsxs('span', {
                    className: 'faint',
                    children: [
                      '이 제안서에 ',
                      jsx('b', { className: 'num', children: applicableCount }),
                      '개 적용'
                    ]
                  })
                : null,
              jsx('span', { style: { flex: 1 } }),
              jsx('button', {
                type: 'button',
                className: 'btn btn-ghost btn-sm',
                onClick: () =>
                  setExpanded(
                    allExpanded
                      ? /* @__PURE__ */ new Set()
                      : new Set(CR.map((x) => x.id))
                  ),
                children: allExpanded
                  ? '확인할 점 모두 접기'
                  : '확인할 점 모두 펼치기'
              })
            ]
          }),
          jsxs('div', {
            className: 'wm-ci-nav',
            role: 'group',
            'aria-label': '영역',
            children: [
              jsxs('button', {
                type: 'button',
                className: 'wm-ci-chip',
                'aria-pressed': !category,
                onClick: (v2) => pickCategory(v2, null),
                children: [
                  '전체',
                  jsx('span', { className: 'num', children: CR.length })
                ]
              }),
              CATS.map((c) =>
                jsxs(
                  'button',
                  {
                    type: 'button',
                    className: 'wm-ci-chip',
                    'aria-pressed': category === c.id,
                    onClick: (v2) =>
                      pickCategory(v2, category === c.id ? null : c.id),
                    children: [
                      c.short,
                      jsx('span', {
                        className: 'num',
                        children: CR.filter((x) => x.cat === c.id).length
                      })
                    ]
                  },
                  c.id
                )
              )
            ]
          }),
          groups.map((c) =>
            jsxs(
              'div',
              {
                className: 'wm-ci-g',
                style: {
                  '--hc': 'var(--h-' + c.hue + ')',
                  '--hcb': 'var(--h-' + c.hue + '-bg)'
                },
                children: [
                  jsxs('div', {
                    className: 'wm-ci-gh',
                    children: [
                      jsx('span', {
                        className: 'wm-ci-gi',
                        children: jsx(Icon, { name: c.icon, size: 14 })
                      }),
                      jsx('b', { children: c.name }),
                      jsx('span', {
                        className: 'wm-ci-gw num',
                        children: '가중 ' + c.w + '%'
                      }),
                      jsx('span', { className: 'wm-ci-gd', children: c.desc })
                    ]
                  }),
                  jsx('ul', {
                    className: 'wm-ci-cl',
                    children: CR.filter((x) => x.cat === c.id).map((x) => {
                      let op = expanded.has(x.id),
                        a = selection[x.id],
                        rs = results[x.id];
                      return jsxs(
                        'li',
                        {
                          className:
                            'wm-ci-c' +
                            (op ? ' open' : '') +
                            (a && !a.applied ? ' off' : ''),
                          children: [
                            jsxs('button', {
                              type: 'button',
                              className: 'wm-ci-ch',
                              'aria-expanded': op,
                              onClick: () => toggleCriterion(x.id),
                              children: [
                                jsx('span', {
                                  className: 'wm-ci-id num',
                                  children: x.id
                                }),
                                jsxs('span', {
                                  className: 'wm-ci-ct',
                                  children: [
                                    jsxs('span', {
                                      className: 'wm-ci-cn',
                                      children: [
                                        jsx('b', { children: x.name }),
                                        importanceDots(x.w)
                                      ]
                                    }),
                                    jsx('span', {
                                      className: 'wm-ci-cd',
                                      children: x.desc
                                    })
                                  ]
                                }),
                                criterionStatus(x),
                                jsx(Icon, {
                                  name: op ? 'chevU' : 'chevD',
                                  size: 15,
                                  className: 'wm-ci-cv'
                                })
                              ]
                            }),
                            op &&
                              jsxs('dl', {
                                className: 'wm-ci-cx',
                                children: [
                                  jsx('dt', { children: '확인할 점' }),
                                  jsx('dd', { children: x.check }),
                                  jsx('dt', { children: '중요도' }),
                                  jsx('dd', {
                                    children:
                                      x.w +
                                      ' — 영역 점수에 ' +
                                      x.w +
                                      '배로 반영'
                                  }),
                                  a
                                    ? jsx('dt', { children: '이 제안서' })
                                    : null,
                                  a
                                    ? jsx('dd', {
                                        children:
                                          (a.applied ? '적용' : '적용 안 함') +
                                          ' · ' +
                                          a.why +
                                          (a.applied && rs && rs.src === 'rule'
                                            ? ' · 규칙 채점'
                                            : '')
                                      })
                                    : null
                                ]
                              })
                          ]
                        },
                        x.id
                      );
                    })
                  })
                ]
              },
              c.id
            )
          )
        ]
      })
    ]
  });
}

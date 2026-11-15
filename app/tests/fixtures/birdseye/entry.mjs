// 조감도 통합 목록에서 스튜디오로 들어가는 공통 걸음 — 예전 「업종별 템플릿 활용하기」 버튼 · 「조감도 스튜디오」 버튼을 쓰던 테스트가 쓴다.
/** 조감도 스튜디오 시작 → 공간 조감도 → 업종 템플릿. 돌려준 창 안에 예전 「업종 템플릿」 창과 같은 필터 · 템플릿 카드가 있다. */
export async function openIndustryTemplates(page){
  await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click({timeout:120000});
  const dialog=page.getByRole('dialog',{name:'조감도 스튜디오 시작',exact:true});
  await dialog.getByRole('button',{name:/^공간 조감도/}).click();await dialog.getByRole('button',{name:/^업종 템플릿/}).click();
  return dialog;
}
/** 조감도 스튜디오 시작 → 공간 조감도 → 빈 스튜디오 → 업종 → 시작. 빈 스튜디오가 열릴 때까지 기다린다. */
export async function startBlankStudio(page,industry=0){
  await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click({timeout:120000});
  const dialog=page.getByRole('dialog',{name:'조감도 스튜디오 시작',exact:true});
  await dialog.getByRole('button',{name:/^공간 조감도/}).click();await dialog.getByRole('button',{name:/^빈 스튜디오/}).click();
  await dialog.getByRole('group',{name:'업종 선택'}).getByRole('button').nth(industry).click();
  await dialog.getByRole('button',{name:'시작',exact:true}).click();
  await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-blank-canvas').waitFor();
}

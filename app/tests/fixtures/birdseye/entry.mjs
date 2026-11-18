// 조감도 통합 목록에서 스튜디오로 들어가는 공통 걸음 — 시작 팝업(탭 공간 · 건물 + 업종 · 공간 입력)을 거친다.
/** 조감도 스튜디오 시작 → 업종(코드) → 「업종 템플릿에서 시작」. 그 업종의 조감도 템플릿 드롭다운(.be-template-menu)을 돌려준다 — 항목은 [data-template-id]. */
export async function openIndustryTemplates(page,industry='FB'){
  await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click({timeout:120000});
  const dialog=page.getByRole('dialog',{name:'조감도 스튜디오 시작',exact:true});
  await dialog.locator(`[data-industry="${industry}"]`).click();
  await dialog.getByRole('button',{name:/업종 템플릿에서 시작/}).click();
  const menu=page.locator('.be-template-menu');await menu.waitFor();
  return menu;
}
/** 드롭다운의 템플릿 항목에 3D 조감도 그림이 뜰 때까지 기다린다(서버 미리보기 또는 이 브라우저가 그린 그림) */
export async function templatePreviewReady(page,templateId,timeout=120000){
  await page.waitForFunction(id=>{const img=document.querySelector('.be-template-menu [data-template-id="'+id+'"] .be-template-thumb[data-view="3d"] img');return !!img&&img.complete&&img.naturalWidth>0&&/^data:image\/png|\/preview\.webp\?/.test(img.src);},templateId,{timeout});
}
/** 열린 드롭다운에서 템플릿을 고르고 「이 템플릿으로 시작하시겠습니까?」에 답해 스튜디오(3D)가 열릴 때까지 기다린다 */
export async function confirmTemplate(page,templateId){
  await page.locator(`.be-template-menu [data-template-id="${templateId}"]`).click();
  await page.getByRole('dialog',{name:'이 템플릿으로 시작하시겠습니까?',exact:true}).getByRole('button',{name:'시작',exact:true}).click();
  await page.waitForURL(/\/spatial\/sp-/,{timeout:120000});await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
}
/** 시작 팝업에 공간을 버블로 넣는다 — 입력하고 Enter */
export async function addSpaces(dialog,names){
  const input=dialog.getByRole('combobox',{name:'공간 입력'});
  for(const name of names){await input.fill(name);await input.press('Enter');}
}
/** 조감도 스튜디오 시작 → 업종 → 공간 한 개 이상 → 시작. 그 공간이 놓인 공간 스튜디오가 열릴 때까지 기다린다. */
export async function startStudio(page,industry=0,spaces=['회의실']){
  await page.getByRole('button',{name:/조감도 스튜디오 시작/}).click({timeout:120000});
  const dialog=page.getByRole('dialog',{name:'조감도 스튜디오 시작',exact:true});
  await dialog.getByRole('group',{name:'업종 선택'}).getByRole('button').nth(industry).click();
  await addSpaces(dialog,spaces);
  await dialog.getByRole('button',{name:'시작',exact:true}).click();
  await page.waitForURL(/\/spatial\/sp-/);await page.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
}
